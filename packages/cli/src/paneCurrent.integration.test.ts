import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { parseArgs } from "./cliArgs.js";
import { runPaneCurrent, runPaneSplit } from "./commands/pane.js";
import { runWorkspaceCreate } from "./commands/workspace.js";
import { FsSessionStore } from "./session.js";
import { withSession } from "./withSession.js";

/**
 * 呼び出し元の pane を既定の対象にする（20260927-caller-pane-default の AC1・AC6）を実サーバで確かめる。
 * pane の中の環境（`SODA_PANE_ID`・`SODA_SERVER_URL`）を与えて解釈した実物のコマンドを、実サーバに対して走らせる。
 * - pane を別の workspace の新しい tab へ移した後の `pane current` が、移動後の tab・workspace を返す（環境変数のように古くならない）。
 * - 対象を省いた `pane split` が呼び出し元の pane を分ける。
 */

/** `fn` の間の標準出力を集める（投げても元に戻す）。 */
async function quiet(fn: () => Promise<unknown>): Promise<string> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk),
    );
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return chunks.join("");
}

interface CurrentPane {
  id: string;
  tabId: string;
  workspaceId: string | null;
  focused: boolean;
}

describe.skipIf(process.platform === "win32")(
  "pane current・対象を省いた pane split（実サーバ）",
  () => {
    let server: ComposedServer;
    let stateDir: string;
    let sessionDir: string;
    let store: FsSessionStore;
    let url: string;
    let token: string;

    beforeAll(async () => {
      stateDir = await mkdtemp(join(tmpdir(), "sodactl-panecurrent-state-"));
      server = await composeServerOnFreePort({
        host: "127.0.0.1",
        stateDir,
        origin: [],
        shell: "/bin/sh",
      });
      const port = (server.httpServer.server.address() as AddressInfo).port;
      if (!server.freshToken) throw new Error("expected a freshly generated token");
      token = server.freshToken;
      url = `http://127.0.0.1:${port}`;
      sessionDir = await mkdtemp(join(tmpdir(), "sodactl-panecurrent-session-"));
      store = new FsSessionStore(join(sessionDir, "session.json"));
    }, 30_000);

    afterAll(async () => {
      await server?.close();
      await rm(stateDir, { recursive: true, force: true });
      await rm(sessionDir, { recursive: true, force: true });
    });

    /** pane の中の環境で解釈した `sodactl pane current`（引数なし）を走らせる。 */
    async function currentFrom(callerPaneId: string): Promise<CurrentPane> {
      const cmd = parseArgs(["pane", "current"], {
        SODA_PANE_ID: callerPaneId,
        SODA_SERVER_URL: url,
        SODACTL_TOKEN: token,
      });
      if (cmd.kind !== "pane-current") throw new Error(`unexpected command: ${cmd.kind}`);
      return (JSON.parse(await quiet(() => runPaneCurrent(cmd, store))) as { pane: CurrentPane })
        .pane;
    }

    it("pane を別の workspace の新しい tab へ移した後、pane current は移動後の tab・workspace を返す（AC6）", async () => {
      const a = JSON.parse(
        await quiet(() =>
          runWorkspaceCreate(
            {
              kind: "workspace-create",
              opts: { url, token, urlExplicit: false },
              cwd: undefined,
              label: "a",
            },
            store,
          ),
        ),
      ) as {
        workspace: { id: string };
        tab: { id: string };
        pane: { id: string };
      };
      const b = JSON.parse(
        await quiet(() =>
          runWorkspaceCreate(
            {
              kind: "workspace-create",
              opts: { url, token, urlExplicit: false },
              cwd: undefined,
              label: "b",
            },
            store,
          ),
        ),
      ) as {
        workspace: { id: string };
      };
      // 動かす pane を a に 2 枚目として作る（1 枚だけの tab を動かすと元の tab・workspace が消える）。
      const split = JSON.parse(
        await quiet(() =>
          runPaneSplit(
            {
              kind: "pane-split",
              opts: { url, token, urlExplicit: false },
              target: { kind: "id", paneId: a.pane.id },
              direction: "right",
              ratio: undefined,
            },
            store,
          ),
        ),
      ) as { pane: { id: string } };
      const moving = split.pane.id;

      const before = await currentFrom(moving);
      expect(before).toMatchObject({ id: moving, tabId: a.tab.id, workspaceId: a.workspace.id });

      const moved = await withSession({ url, token, urlExplicit: false }, store, async (client) => {
        await client.hello();
        // 作った直後は、片方だけ git の判定が入っている間は断られる（reason あり。20261008-web-tab-dnd）。
        // 判定が入って同じ worktree と分かるまで、上限の時間つきで試し直す。
        const deadline = Date.now() + 10_000;
        for (;;) {
          const r = await client.request("pane.move_to_new_tab", {
            paneId: moving,
            targetWorkspaceId: b.workspace.id,
          });
          if (r.ok || !r.reason || Date.now() > deadline) return r;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      });
      expect(moved).toMatchObject({ ok: true });
      const movedTabId = (moved as { tab: { id: string } }).tab.id;
      // 移動でフォーカスは動かした pane へ移るので、別の workspace を作ってフォーカスを外す（フォーカスの pane を返す実装を見分ける）。
      await quiet(() =>
        runWorkspaceCreate(
          {
            kind: "workspace-create",
            opts: { url, token, urlExplicit: false },
            cwd: undefined,
            label: "elsewhere",
          },
          store,
        ),
      );

      const after = await currentFrom(moving);
      expect(after).toEqual(
        expect.objectContaining({
          id: moving,
          tabId: movedTabId,
          workspaceId: b.workspace.id,
          focused: false,
        }),
      );
    }, 30_000);

    it("pane の中で対象を省いた pane split は呼び出し元の pane の隣に作る（AC1）", async () => {
      const ws = JSON.parse(
        await quiet(() =>
          runWorkspaceCreate(
            {
              kind: "workspace-create",
              opts: { url, token, urlExplicit: false },
              cwd: undefined,
              label: "c",
            },
            store,
          ),
        ),
      ) as {
        tab: { id: string };
        pane: { id: string };
      };
      // フォーカスを別の workspace へ移す（呼び出し元とフォーカスの pane を別にし、フォーカスに落ちていないことを見分ける）。
      await quiet(() =>
        runWorkspaceCreate(
          {
            kind: "workspace-create",
            opts: { url, token, urlExplicit: false },
            cwd: undefined,
            label: "d",
          },
          store,
        ),
      );
      const cmd = parseArgs(["pane", "split", "--direction", "down"], {
        SODA_PANE_ID: ws.pane.id,
        SODA_SERVER_URL: url,
        SODACTL_TOKEN: token,
      });
      if (cmd.kind !== "pane-split") throw new Error(`unexpected command: ${cmd.kind}`);
      const created = JSON.parse(await quiet(() => runPaneSplit(cmd, store))) as {
        pane: { id: string; tabId: string };
      };
      expect(created.pane.id).not.toBe(ws.pane.id);
      expect(created.pane.tabId).toBe(ws.tab.id);
    }, 30_000);
  },
);
