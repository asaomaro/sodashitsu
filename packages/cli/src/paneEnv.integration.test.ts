import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { runPaneRead, runPaneRun } from "./commands/pane.js";
import { runSnapshot } from "./commands/session.js";
import { runWorkspaceCreate } from "./commands/workspace.js";
import { FsSessionStore } from "./session.js";

/**
 * pane の環境変数（20260926-agent-skill-file。AC7・AC9・AC15）を実サーバ・実 PTY で確かめる。
 * - 起動時に作られる最初の pane（`listen()` の中の `ensureNotEmpty`）にも `SODA_SERVER_URL` が入る——URL を決めるのが pane の起動より後だと、ここが空になる。
 * - サーバのプロセスの環境に置いた `SODACTL_TOKEN`・`SODACTL_URL`・古い `SODA_SERVER_URL` が pane に渡らない。
 */

/** `fn` の間の標準出力を集める（投げても元に戻す）。 */
async function quiet(fn: () => Promise<unknown>): Promise<string> {
  const cap = captureStdout();
  try {
    await fn();
  } finally {
    cap.restore();
  }
  return cap.text();
}

function captureStdout(): { text(): string; restore(): void } {
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
  return { text: () => chunks.join(""), restore: () => spy.mockRestore() };
}

const INHERITED = {
  SODACTL_TOKEN: "inherited-secret-token",
  SODACTL_URL: "http://127.0.0.1:1",
  SODA_SERVER_URL: "http://stale.invalid:2",
  SODA_AGENT_REPORT_SOCKET: "/stale/agent-report.sock",
  SODA_SESSION: "inherited-session", // 20260926-named-session-ui（AC15）
} as const;

/** pane に 1 つの環境変数を `<NAME=値>`（無ければ unset）で印刷させ、画面に出た値を返す（20260926-named-session-ui）。 */
async function paneVar(
  ctx: { url: string; token: string; store: FsSessionStore },
  paneId: string,
  name: string,
): Promise<string> {
  await quiet(() =>
    runPaneRun(
      {
        kind: "pane-run",
        opts: { url: ctx.url, token: ctx.token, urlExplicit: false },
        paneId,
        command: `printf '<${name}=%s>\\n' "\${${name}-unset}"`,
      },
      ctx.store,
    ),
  );
  const re = new RegExp(`<${name}=([^%<>]*)>`);
  const deadline = Date.now() + 10_000;
  let last = "";
  for (;;) {
    try {
      last = await quiet(() =>
        runPaneRead(
          {
            kind: "pane-read",
            opts: { url: ctx.url, token: undefined, urlExplicit: false },
            paneId,
            follow: false,
            raw: false,
            timeoutMs: 3_000,
          },
          ctx.store,
        ),
      );
    } catch {
      // 最初の SNAPSHOT が遅れたときも締め切りまで読み直す。
    }
    const m = re.exec(last);
    if (m) return m[1]!;
    if (Date.now() > deadline)
      throw new Error(`${name} not observed; last read: ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

// printf の `${VAR-unset}` は POSIX のシェルの構文なので、Windows では走らせず、pane のシェルは /bin/sh に固定する。
describe.skipIf(process.platform === "win32")("pane の環境変数（実サーバ・実 PTY）", () => {
  let server: ComposedServer;
  let stateDir: string;
  let sessionDir: string;
  let store: FsSessionStore;
  let url: string;
  let port: number;
  let token: string;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    // サーバを起動した環境に sodactl の設定と古い値がある状態を作る（終わったら戻す）。
    for (const [k, v] of Object.entries(INHERITED)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    stateDir = await mkdtemp(join(tmpdir(), "sodactl-paneenv-state-"));
    server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir,
      origin: [],
      shell: "/bin/sh",
    });
    port = (server.httpServer.server.address() as AddressInfo).port;
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    token = server.freshToken;
    url = `http://127.0.0.1:${port}`;
    sessionDir = await mkdtemp(join(tmpdir(), "sodactl-paneenv-session-"));
    store = new FsSessionStore(join(sessionDir, "session.json"));
  }, 30_000);

  afterAll(async () => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await server?.close();
    await rm(stateDir, { recursive: true, force: true });
    await rm(sessionDir, { recursive: true, force: true });
  });

  /** pane に環境変数を印刷させ、展開された行が画面に出るまで読む（5 つ目は古い report の socket が残っていないこと）。 */
  async function envLineOf(paneId: string): Promise<string> {
    await quiet(() =>
      runPaneRun(
        {
          kind: "pane-run",
          opts: { url, token, urlExplicit: false },
          paneId,
          command: `printf '<%s|%s|%s|%s|%s>\\n' "\${SODA_SERVER_URL-unset}" "\${SODACTL_TOKEN-unset}" "\${SODACTL_URL-unset}" "\${SODA_PANE_ID-unset}" "\${SODA_AGENT_REPORT_SOCKET-unset}"`,
        },
        store,
      ),
    );
    const deadline = Date.now() + 10_000;
    let last = "";
    for (;;) {
      try {
        last = await quiet(() =>
          runPaneRead(
            {
              kind: "pane-read",
              opts: { url, token: undefined, urlExplicit: false },
              paneId,
              follow: false,
              raw: false,
              timeoutMs: 3_000,
            },
            store,
          ),
        );
      } catch {
        // 最初の SNAPSHOT が遅れた（timeout）ときも締め切りまで読み直す。
      }
      const line = /<[^%<>]*\|[^%<>]*\|[^%<>]*\|[^%<>]*\|[^%<>]*>/.exec(last);
      if (line) return line[0];
      if (Date.now() > deadline)
        throw new Error(`env line not observed; last read: ${JSON.stringify(last)}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** 公式フック連携の report の socket はサーバが立てるので、その値（古い値ではない）か、無ければ unset。 */
  function socketOf(line: string): string {
    return line.slice(1, -1).split("|")[4]!;
  }

  it("起動時に作られた最初の pane: SODA_SERVER_URL は待ち受けたポート、受け継いだ sodactl の設定は無い（AC7・AC9・AC15）", async () => {
    const snap = await quiet(() => runSnapshot({ kind: "snapshot", opts: { url, token, urlExplicit: false } }, store));
    const first = (JSON.parse(snap) as { panes: { id: string }[] }).panes[0]!.id;

    const line = await envLineOf(first);
    expect(line.startsWith(`<${url}|unset|unset|${first}|`)).toBe(true);
    expect(socketOf(line)).not.toBe(INHERITED.SODA_AGENT_REPORT_SOCKET);
  }, 30_000);

  it("既定の session の pane には、サーバを起動した環境の SODA_SESSION を渡さない（20260926-named-session-ui の AC15）", async () => {
    const snap = await quiet(() => runSnapshot({ kind: "snapshot", opts: { url, token, urlExplicit: false } }, store));
    const first = (JSON.parse(snap) as { panes: { id: string }[] }).panes[0]!.id;
    expect(await paneVar({ url, token, store }, first, "SODA_SESSION")).toBe("unset");
  }, 30_000);

  it("sodactl で作った workspace の pane も同じ（AC7・AC9）", async () => {
    const created = await quiet(() =>
      runWorkspaceCreate(
        { kind: "workspace-create", opts: { url, token, urlExplicit: false }, cwd: process.cwd(), label: "env-it" },
        store,
      ),
    );
    const paneId = (JSON.parse(created) as { pane: { id: string } }).pane.id;

    const line = await envLineOf(paneId);
    expect(line.startsWith(`<${url}|unset|unset|${paneId}|`)).toBe(true);
    expect(socketOf(line)).not.toBe(INHERITED.SODA_AGENT_REPORT_SOCKET);
  }, 30_000);
});

/** 20260926-named-session-ui（AC15）：名前付き session の pane には SODA_SESSION=<名前>（受け継いだ別の値より勝つ）。 */
describe.skipIf(process.platform === "win32")(
  "名前付き session の pane の SODA_SESSION（実サーバ・実 PTY）",
  () => {
    let server: ComposedServer;
    let stateDir: string;
    let sessionDir: string;
    let ctx: { url: string; token: string; store: FsSessionStore };
    let saved: string | undefined;

    beforeAll(async () => {
      saved = process.env["SODA_SESSION"];
      process.env["SODA_SESSION"] = "inherited-session";
      stateDir = await mkdtemp(join(tmpdir(), "sodactl-paneenv-named-"));
      server = await composeServerOnFreePort({
        host: "127.0.0.1",
        stateDir,
        session: "work",
        origin: [],
        shell: "/bin/sh",
      });
      const port = (server.httpServer.server.address() as AddressInfo).port;
      if (!server.freshToken) throw new Error("expected a freshly generated token");
      sessionDir = await mkdtemp(join(tmpdir(), "sodactl-paneenv-named-session-"));
      ctx = {
        url: `http://127.0.0.1:${port}`,
        token: server.freshToken,
        store: new FsSessionStore(join(sessionDir, "session.json")),
      };
    }, 30_000);

    afterAll(async () => {
      if (saved === undefined) delete process.env["SODA_SESSION"];
      else process.env["SODA_SESSION"] = saved;
      await server?.close();
      await rm(stateDir, { recursive: true, force: true });
      await rm(sessionDir, { recursive: true, force: true });
    });

    it("起動時に作られた最初の pane に SODA_SESSION=work が入る", async () => {
      const snap = await quiet(() =>
        runSnapshot({ kind: "snapshot", opts: { url: ctx.url, token: ctx.token, urlExplicit: false } }, ctx.store),
      );
      const first = (JSON.parse(snap) as { panes: { id: string }[] }).panes[0]!.id;
      expect(await paneVar(ctx, first, "SODA_SESSION")).toBe("work");
    }, 30_000);
  },
);
