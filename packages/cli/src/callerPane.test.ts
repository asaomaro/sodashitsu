import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Command, GlobalOpts } from "./cliArgs.js";
import { runAgentStart } from "./commands/agentStart.js";
import { runPaneSplit } from "./commands/pane.js";
import { runTabCreate } from "./commands/tab.js";
import { runWorkspaceCreate } from "./commands/workspace.js";
import type { SessionStore } from "./session.js";
import { callerPaneParam } from "./selfGuard.js";
import { RpcFailure } from "./wsClient.js";

/**
 * 20261003-graph-auto-nodes（AC4・AC13）。pane を作る 3 つの操作と `agent start` は、`selfPaneId` が確認できたときだけ
 * `callerPaneId` を要求に載せる。`withSession` を偽にして、sodactl が送る要求の中身を見る。
 */

vi.mock("./output.js", () => ({ printJson: () => {} }));

const sent: Array<{ method: string; params: Record<string, unknown> }> = [];

vi.mock("./withSession.js", () => ({
  withSession: async (_opts: unknown, _store: unknown, fn: (c: unknown) => Promise<unknown>) =>
    fn({
      onClose: () => {},
      hello: async () => ({ snapshot: { panes: [], tabs: [], workspaces: [], focus: undefined } }),
      request: async (method: string, params: Record<string, unknown>) => {
        sent.push({ method, params });
        if (method === "agent.start") throw new RpcFailure("stop_here", "stop after the request");
        return {};
      },
    }),
}));

const SERVER = "http://127.0.0.1:7780";
const store = {} as SessionStore;
const base = { token: undefined, urlExplicit: false };
const inPane: GlobalOpts = { ...base, url: SERVER, caller: { paneId: "p-me", serverUrl: SERVER } };
const noCaller: GlobalOpts = { ...base, url: SERVER }; // SODA_PANE_ID なし、または --machine（caller を破棄）
const otherServer: GlobalOpts = { ...inPane, url: "http://127.0.0.1:7781" };

const cases: Array<[string, GlobalOpts]> = [
  ["pane の中・同じサーバ", inPane],
  ["pane の外（SODA_PANE_ID なし）", noCaller],
  ["--machine（caller を破棄）", noCaller],
  ["接続先が違う", otherServer],
];

async function run(name: string, opts: GlobalOpts): Promise<Record<string, unknown>> {
  sent.length = 0;
  const target = { kind: "id", paneId: "p-target" } as const;
  const cmds: Record<string, Command> = {
    "pane.split": { kind: "pane-split", opts, target, direction: "right", ratio: undefined },
    "workspace.create": { kind: "workspace-create", opts, cwd: undefined, label: undefined },
    "tab.create": { kind: "tab-create", opts, workspaceId: undefined, label: undefined },
    "agent.start": {
      kind: "agent-start",
      opts,
      name: "a",
      agentKind: "claude",
      paneId: "p-target",
      timeoutMs: undefined,
      args: [],
    },
  };
  const cmd = cmds[name]!;
  try {
    if (cmd.kind === "pane-split") await runPaneSplit(cmd, store);
    else if (cmd.kind === "workspace-create") await runWorkspaceCreate(cmd, store);
    else if (cmd.kind === "tab-create") await runTabCreate(cmd, store);
    else if (cmd.kind === "agent-start") await runAgentStart(cmd, store);
  } catch (err) {
    if (!(err instanceof RpcFailure) || err.code !== "stop_here") throw err;
  }
  const req = sent.find((s) => s.method === name);
  expect(req).toBeDefined();
  return req!.params;
}

describe("callerPaneParam", () => {
  it("確認できたときだけ callerPaneId を返す", () => {
    expect(callerPaneParam(inPane)).toEqual({ callerPaneId: "p-me" });
    expect(callerPaneParam(noCaller)).toEqual({});
    expect(callerPaneParam(otherServer)).toEqual({});
  });
});

describe("callerPaneId を送る条件", () => {
  beforeEach(() => {
    sent.length = 0;
  });
  for (const method of ["pane.split", "workspace.create", "tab.create", "agent.start"]) {
    describe(method, () => {
      for (const [label, opts] of cases) {
        it(`${label}: ${opts === inPane ? "送る" : "送らない（キー自体を付けない）"}`, async () => {
          const params = await run(method, opts);
          if (opts === inPane) expect(params.callerPaneId).toBe("p-me");
          else expect("callerPaneId" in params).toBe(false);
        });
      }
    });
  }
  it("agent start は対象の paneId と取り違えない", async () => {
    const params = await run("agent.start", inPane);
    expect(params.paneId).toBe("p-target");
    expect(params.callerPaneId).toBe("p-me");
  });
  it("pane split の対象は callerPaneId と別に paneId で渡る", async () => {
    const params = await run("pane.split", inPane);
    expect(params.paneId).toBe("p-target");
    expect(params.callerPaneId).toBe("p-me");
  });
});
