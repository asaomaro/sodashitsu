import type { Graph, GraphLink, MachineStatus, SessionSnapshot } from "@sodashitsu/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUsageError, type Command, type GraphAction } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import {
  addLinkOp,
  formatGraph,
  formatHistory,
  GraphContext,
  resolveMachineSelector,
  runGraph,
  setLinkOp,
  updateGraph,
} from "./graph.js";

/** `sodactl graph`（20260927-agent-graph の 05 T1・T2）。サーバは偽の client（実物のサーバは `graph.integration.test.ts`）。 */

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../output.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../output.js")>();
  return { ...actual, printJson: vi.fn(), printLine: vi.fn() };
});

import { printJson, printLine } from "../output.js";
import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const BOX = "b".repeat(32);
const OTHER = "c".repeat(32);
const MACHINES: MachineStatus[] = [
  { id: BOX, label: "box", state: "online", message: null },
  { id: OTHER, label: "twin", state: "online", message: null },
  { id: "d".repeat(32), label: "twin", state: "online", message: null },
];
const SNAPSHOT = {
  panes: [
    { id: "p1", tabId: "t1", agent: { name: "impl" } },
    { id: "p2", tabId: "t1", agent: { name: "reviewer" } },
    { id: "p3", tabId: "t1" },
  ],
  tabs: [{ id: "t1", workspaceId: "w1" }],
} as unknown as SessionSnapshot;

function link(patch: Partial<GraphLink> = {}): GraphLink {
  return {
    id: "l1",
    kind: "trigger",
    from: "local:p1",
    to: "local:p2",
    trigger: { on: "done", prompt: "見て {output}", output: { lines: 80 }, whenBusy: "wait" },
    limit: 10,
    count: 0,
    paused: null,
    ...patch,
  };
}
function graph(patch: Partial<Graph> = {}): Graph {
  return {
    rev: 1,
    paused: false,
    nodes: [
      { key: "local:p1", x: 40, y: 40 },
      { key: "local:p2", x: 300, y: 40 },
    ],
    links: [],
    ...patch,
  };
}

/** 偽のサーバ。`graph.update` の応答は `onUpdate` が決める（既定は ops を当てずに rev だけ進める）。 */
function fakeClient(
  handlers: Partial<Record<string, (params: never) => unknown>>,
): SodaClient & { calls: [string, unknown][] } {
  const calls: [string, unknown][] = [];
  const client = {
    calls,
    hello: vi.fn(async () => ({ clientId: "c1", snapshot: SNAPSHOT })),
    request: vi.fn(async (method: string, params: unknown) => {
      calls.push([method, params]);
      const h = handlers[method];
      if (h === undefined) throw new Error(`unexpected request ${method}`);
      return h(params as never);
    }),
    close: vi.fn(),
  };
  return client as unknown as SodaClient & { calls: [string, unknown][] };
}

const OPTS = { url: "http://127.0.0.1:7780", token: undefined };
const store = {} as SessionStore;
function cmd(action: GraphAction, json = false): Extract<Command, { kind: "graph" }> {
  return { kind: "graph", opts: OPTS, json, action };
}

beforeEach(() => {
  mockedWithSession.mockReset();
  vi.mocked(printJson).mockReset();
  vi.mocked(printLine).mockReset();
});

describe("resolveMachineSelector（--machine と同じ引き方）", () => {
  it("local・id の完全一致・名前が 1 台", () => {
    expect(resolveMachineSelector("local", MACHINES)).toBe("local");
    expect(resolveMachineSelector(BOX, MACHINES)).toBe(BOX);
    expect(resolveMachineSelector("box", MACHINES)).toBe(BOX);
  });
  it("同じ名前が 2 台は machine_ambiguous、知らない名前は machine_not_found。一覧に無い 32 桁の id はそのまま通す", () => {
    expect(() => resolveMachineSelector("twin", MACHINES)).toThrow(
      expect.objectContaining({ code: "machine_ambiguous" }),
    );
    expect(() => resolveMachineSelector("nope", MACHINES)).toThrow(
      expect.objectContaining({ code: "machine_not_found" }),
    );
    expect(resolveMachineSelector("e".repeat(32), MACHINES)).toBe("e".repeat(32));
  });
});

describe("GraphContext.resolve（端の指定 → ノードの鍵）", () => {
  const ctx = () =>
    new GraphContext(fakeClient({ "machine.list": () => ({ machines: MACHINES }) }), SNAPSHOT);
  it("pane ID・エージェントの名前・local: は手元、<名前>:<pane> は別のマシン", async () => {
    const c = ctx();
    expect(await c.resolve("p3", true)).toBe("local:p3");
    expect(await c.resolve("reviewer", true)).toBe("local:p2");
    expect(await c.resolve("local:impl", true)).toBe("local:p1");
    expect(await c.resolve("box:p7", true)).toBe(`${BOX}:p7`);
    expect(await c.resolve(`${BOX}:p7`, true)).toBe(`${BOX}:p7`);
  });
  it("手元に無い pane は mustExist のときだけ not_found（外す・選び直す前のノードは閉じた pane を指しうる）", async () => {
    const c = ctx();
    await expect(c.resolve("p9", true)).rejects.toMatchObject({ code: "not_found" });
    expect(await c.resolve("p9", false)).toBe("local:p9");
    await expect(c.resolve("ghost", false)).rejects.toMatchObject({ code: "not_found" });
  });
  it("別のマシンの pane は pane ID だけ（名前は引けない）", async () => {
    await expect(ctx().resolve("box:reviewer", true)).rejects.toBeInstanceOf(CliUsageError);
  });
  it("マシンの一覧は 1 回だけ取り、表では名前で出す（名前が重なるなら id）", async () => {
    const client = fakeClient({ "machine.list": () => ({ machines: MACHINES }) });
    const c = new GraphContext(client, SNAPSHOT);
    await c.resolve("box:p1", true);
    await c.resolve("box:p2", true);
    expect(client.calls.filter(([m]) => m === "machine.list")).toHaveLength(1);
    expect(c.displayOf(`${BOX}:p1`)).toBe("box:p1");
    expect(c.displayOf(`${OTHER}:p1`)).toBe(`${OTHER}:p1`);
    expect(c.displayOf("local:p4")).toBe("p4");
  });
});

describe("addLinkOp・setLinkOp", () => {
  it("add: 種類ごとの既定値に書いた項目を重ねる", () => {
    expect(addLinkOp("trigger", "local:p1", "local:p2", { on: "blocked", output: null })).toEqual({
      op: "add_link",
      kind: "trigger",
      from: "local:p1",
      to: "local:p2",
      trigger: {
        on: "blocked",
        prompt: expect.stringContaining("{output}"),
        output: null,
        whenBusy: "wait",
      },
    });
    expect(addLinkOp("approval", "local:p1", "local:p2", { limit: 5 })).toEqual({
      op: "add_link",
      kind: "approval",
      from: "local:p1",
      to: "local:p2",
      approval: { mode: "notify", lines: 40 },
      limit: 5,
    });
    expect(addLinkOp("supervise", "local:p1", "local:p2", {})).toEqual({
      op: "add_link",
      kind: "supervise",
      from: "local:p1",
      to: "local:p2",
    });
  });
  it("set: 今の設定に書いた項目だけを重ねる。種類に使えない項目は使い方の誤り", () => {
    expect(setLinkOp(link(), { output: 20, whenBusy: "skip" })).toEqual({
      op: "update_link",
      id: "l1",
      trigger: { on: "done", prompt: "見て {output}", output: { lines: 20 }, whenBusy: "skip" },
    });
    expect(setLinkOp(link(), { limit: 3 })).toEqual({ op: "update_link", id: "l1", limit: 3 });
    const approval: GraphLink = {
      ...link({ kind: "approval", approval: { mode: "notify", lines: 40 } }),
    };
    delete approval.trigger;
    expect(setLinkOp(approval, { mode: "delegate" })).toEqual({
      op: "update_link",
      id: "l1",
      approval: { mode: "delegate", lines: 40 },
    });
    expect(() => setLinkOp(approval, { prompt: "x" })).toThrow(CliUsageError);
    expect(() => setLinkOp(link(), { lines: 3 })).toThrow(CliUsageError);
  });
});

describe("updateGraph（rev_conflict は取り直して 1 回だけ送り直す）", () => {
  const add = [{ op: "add_node" as const, key: "local:p3" as const, x: 0, y: 0 }];

  it("1 回目が rev_conflict なら取り直して組み立て直し、新しい rev で送る", async () => {
    let gets = 0;
    let updates = 0;
    const client = fakeClient({
      "graph.get": () => graph({ rev: ++gets === 1 ? 1 : 5 }),
      "graph.update": (p: { baseRev: number }) => {
        if (++updates === 1) throw new RpcFailure("rev_conflict", "graph changed");
        return graph({ rev: p.baseRev + 1 });
      },
    });
    const build = vi.fn(() => add);
    const r = await updateGraph(client, build);
    expect(r.after.rev).toBe(6);
    expect(build).toHaveBeenCalledTimes(2);
    expect(
      client.calls.map(([m, p]) =>
        m === "graph.update" ? `${m}@${(p as { baseRev: number }).baseRev}` : m,
      ),
    ).toEqual(["graph.get", "graph.update@1", "graph.get", "graph.update@5"]);
  });

  it("2 回目も rev_conflict なら送り直さずに rev_conflict で失敗する", async () => {
    const client = fakeClient({
      "graph.get": () => graph(),
      "graph.update": () => {
        throw new RpcFailure("rev_conflict", "graph changed");
      },
    });
    await expect(updateGraph(client, () => add)).rejects.toMatchObject({ code: "rev_conflict" });
    expect(client.calls.filter(([m]) => m === "graph.update")).toHaveLength(2);
  });

  it("rev_conflict 以外の失敗は送り直さない", async () => {
    const client = fakeClient({
      "graph.get": () => graph(),
      "graph.update": () => {
        throw new RpcFailure("invalid_params", "bad");
      },
    });
    await expect(updateGraph(client, () => add)).rejects.toMatchObject({ code: "invalid_params" });
    expect(client.calls.filter(([m]) => m === "graph.update")).toHaveLength(1);
  });

  it("画面と同じ規則に落ちる操作は送らずに invalid_params、空の操作は送らない", async () => {
    const client = fakeClient({ "graph.get": () => graph() });
    await expect(
      updateGraph(client, () => [{ op: "remove_node", key: "local:p9" }]),
    ).rejects.toMatchObject({
      code: "invalid_params",
      message: expect.stringContaining("unknown_node"),
    });
    expect((await updateGraph(client, () => [])).after.rev).toBe(1);
    expect(client.calls.every(([m]) => m === "graph.get")).toBe(true);
  });
});

describe("runGraph", () => {
  function run(client: SodaClient, c: Extract<Command, { kind: "graph" }>) {
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
    return runGraph(c, store);
  }

  it("link add: 端のノードを一緒に載せ、新しい線を { link, graph } で出す", async () => {
    let sent: unknown;
    const client = fakeClient({
      "graph.get": () => graph({ nodes: [{ key: "local:p1", x: 40, y: 40 }] }),
      "graph.update": (p: { ops: unknown[] }) => {
        sent = p.ops;
        return graph({ rev: 2, links: [link({ id: "l4", to: "local:p3", paused: null })] });
      },
    });
    await run(
      client,
      cmd({ kind: "link-add", from: "impl", to: "p3", linkKind: "trigger", config: {} }, true),
    );
    expect(sent).toEqual([
      { op: "add_node", key: "local:p3", x: 300, y: 40 },
      expect.objectContaining({
        op: "add_link",
        kind: "trigger",
        from: "local:p1",
        to: "local:p3",
      }),
    ]);
    expect(printJson).toHaveBeenCalledWith({
      link: expect.objectContaining({ id: "l4" }),
      graph: expect.objectContaining({ rev: 2 }),
    });
  });

  it("link set: 知らない線は not_found（送らない）", async () => {
    const client = fakeClient({ "graph.get": () => graph() });
    await expect(
      run(client, cmd({ kind: "link-set", linkId: "l9", config: { limit: 2 } })),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(client.calls.some(([m]) => m === "graph.update")).toBe(false);
  });

  it("node rekey: 別のマシンの pane へは選び直さない", async () => {
    const client = fakeClient({
      "graph.get": () => graph(),
      "machine.list": () => ({ machines: MACHINES }),
    });
    await expect(
      run(client, cmd({ kind: "node-rekey", pane: "p1", newPane: "box:p2" })),
    ).rejects.toMatchObject({ code: "invalid_params" });
  });

  it("pause・link resume・history はそのまま方式を呼ぶ", async () => {
    const client = fakeClient({
      "graph.pause": () => graph({ paused: true }),
      "graph.resume": () => graph(),
      "graph.history": () => ({ runs: [{ linkId: "l1", at: 0, result: "sent", text: "見て" }] }),
    });
    await run(client, cmd({ kind: "pause" }, true));
    await run(client, cmd({ kind: "link-resume", linkId: "l2" }, true));
    await run(client, cmd({ kind: "history", linkId: "l1", limit: 5 }, true));
    expect(client.calls).toEqual([
      ["graph.pause", {}],
      ["graph.resume", { linkId: "l2" }],
      ["graph.history", { linkId: "l1", limit: 5 }],
    ]);
    expect(printJson).toHaveBeenLastCalledWith({
      runs: [expect.objectContaining({ linkId: "l1" })],
    });
  });

  it("show の表: 状態・ノード（手元の閉じた pane・無効・別のマシンは名前）・線", async () => {
    const client = fakeClient({
      "graph.get": () =>
        graph({
          paused: true,
          rev: 7,
          nodes: [
            { key: "local:p1", x: 0, y: 0 },
            { key: "local:p8", x: 0, y: 0 },
            { key: "local:p9", x: 0, y: 0, stale: true },
            { key: `${BOX}:p2`, x: 0, y: 0 },
          ],
          links: [
            link({ count: 10, paused: "limit" }),
            {
              id: "l2",
              kind: "supervise",
              from: `${BOX}:p2`,
              to: "local:p1",
              limit: 10,
              count: 0,
              paused: "user",
            },
          ],
        }),
      "machine.list": () => ({ machines: MACHINES }),
    });
    await run(client, cmd({ kind: "show" }));
    expect(vi.mocked(printLine).mock.calls[0]![0]).toBe(
      [
        "graph: paused (rev 7)",
        "",
        `node    ${"key".padEnd(35)}  status`,
        `p1      ${"local:p1".padEnd(35)}  ok`,
        `p8      ${"local:p8".padEnd(35)}  closed`,
        `p9      ${"local:p9".padEnd(35)}  stale`,
        `box:p2  ${BOX}:p2  -`,
        "",
        "link  kind       from    to  count  state          settings",
        'l1    trigger    p1      p2  10/10  paused(limit)  on=done output=80 busy=wait prompt="見て {output}"',
        "l2    supervise  box:p2  p1  0/10   paused",
      ].join("\n"),
    );
  });
});

describe("formatGraph・formatHistory（空）", () => {
  it("空のグラフ・履歴", () => {
    const ctx = new GraphContext(fakeClient({}), SNAPSHOT);
    expect(formatGraph(graph({ nodes: [], rev: 0 }), ctx)).toBe(
      ["graph: running (rev 0)", "", "(no nodes)", "", "(no links)"].join("\n"),
    );
    expect(formatHistory([])).toBe("(no runs)");
    expect(formatHistory([{ linkId: "l1", at: 0, result: "skipped", reason: "busy" }])).toBe(
      [
        "time                      link  result   reason  text",
        "1970-01-01T00:00:00.000Z  l1    skipped  busy",
      ].join("\n"),
    );
  });
});
