import type { Graph, GraphLink, MachineStatus, SessionSnapshot } from "@sodashitsu/protocol";
import { graphStructureFrom, layoutOverlaps, nodePositions } from "@sodashitsu/client-core";
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
  workspaces: [{ id: "w1", label: "api", tabIds: ["t1"], groupId: "g1" }],
  groups: [{ id: "g1", label: "work", collapsed: false }],
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

const OPTS = { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false };
const store = {} as SessionStore;
function cmd(action: GraphAction, json = false): Extract<Command, { kind: "graph" }> {
  return { kind: "graph", opts: OPTS, json, action };
}

beforeEach(() => {
  mockedWithSession.mockReset();
  vi.mocked(printJson).mockReset();
  vi.mocked(printLine).mockReset();
});

/** 別のマシンの pane の id（UUID）。 */
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const U7 = "77777777-7777-4777-8777-777777777777";
const U9 = "99999999-9999-4999-8999-999999999999";

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
    // 載せる・結ぶ端（allowUnlisted: false）では一覧に無い id を通さない（g05 点検）。
    expect(() => resolveMachineSelector("e".repeat(32), MACHINES, false)).toThrow(
      expect.objectContaining({ code: "machine_not_found" }),
    );
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
    expect(await c.resolve(`box:${U7}`, true)).toBe(`${BOX}:${U7}`);
    expect(await c.resolve(`${BOX}:${U7}`, true)).toBe(`${BOX}:${U7}`);
  });
  it("手元に無い pane は mustExist のときだけ not_found（外す・選び直す前のノードは閉じた pane を指しうる）", async () => {
    const c = ctx();
    await expect(c.resolve(U9, true)).rejects.toMatchObject({ code: "not_found" });
    expect(await c.resolve(U9, false)).toBe(`local:${U9}`);
    await expect(c.resolve("ghost", false)).rejects.toMatchObject({ code: "not_found" });
  });
  it("一覧に無い 32 桁の id は、外す・選び直す前の端（mustExist でない）だけ通す（g05 点検）", async () => {
    const c = ctx();
    await expect(c.resolve(`${"e".repeat(32)}:${U1}`, true)).rejects.toMatchObject({
      code: "machine_not_found",
    });
    expect(await c.resolve(`${"e".repeat(32)}:${U1}`, false)).toBe(`${"e".repeat(32)}:${U1}`);
  });
  it("エージェントの名前の解決は agent 系（resolveAgentTarget）と同じ順（g05 点検）", async () => {
    const snap = {
      panes: [
        { id: "p1", tabId: "t1", agent: { name: "p2" } }, // 名前が pane ID の形
        { id: "p2", tabId: "t1" }, // エージェントの居ない pane
        { id: "p3", tabId: "t1", agent: { name: "p4" } },
        { id: "p4", tabId: "t1", agent: { name: "x" } }, // エージェントの居る pane
      ],
      tabs: [],
    } as unknown as SessionSnapshot;
    const c = new GraphContext(fakeClient({}), snap);
    // p2: pane p2 にはエージェントが居ないので、名前 p2 のエージェント（p1）。agent get p2 と同じ。
    expect(await c.resolve("p2", true)).toBe("local:p1");
    // p4: pane p4 にエージェントが居るので pane p4（名前 p4 の p3 ではない）。
    expect(await c.resolve("p4", true)).toBe("local:p4");
    // エージェントの居ない pane も端にできる（名前に当たらなければ pane）。
    const plain = new GraphContext(fakeClient({}), SNAPSHOT);
    expect(await plain.resolve("p3", true)).toBe("local:p3");
  });
  it("別のマシンの pane は pane ID だけ（名前は引けない）", async () => {
    await expect(ctx().resolve("box:reviewer", true)).rejects.toBeInstanceOf(CliUsageError);
  });
  it("マシンの一覧は 1 回だけ取り、表では名前で出す（名前が重なるなら id）", async () => {
    const client = fakeClient({ "machine.list": () => ({ machines: MACHINES }) });
    const c = new GraphContext(client, SNAPSHOT);
    await c.resolve(`box:${U1}`, true);
    await c.resolve(`box:${U2}`, true);
    expect(client.calls.filter(([m]) => m === "machine.list")).toHaveLength(1);
    expect(c.displayOf(`${BOX}:${U1}`)).toBe("box:11111111"); // 表の呼び名は先頭 8 文字
    expect(c.displayOf(`${OTHER}:${U1}`)).toBe(`${OTHER}:11111111`);
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
      // 手元の pane の新しいノードは、その workspace の囲いの空いた升（p1 の右隣）へ（20261008-graph-first）。
      { op: "add_node", key: "local:p3", x: 280, y: 40 },
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

  it("node rekey: 別のマシンの pane へは選び直さない（別のマシンのノードの付け替え先が別のマシン）", async () => {
    const client = fakeClient({
      "graph.get": () =>
        graph({ nodes: [...graph().nodes, { key: `${BOX}:${U1}`, x: 900, y: 40 }] }),
      "machine.list": () => ({ machines: MACHINES }),
    });
    await expect(
      run(client, cmd({ kind: "node-rekey", pane: `box:${U1}`, newPane: `${OTHER}:${U2}` })),
    ).rejects.toMatchObject({
      code: "invalid_params",
      // 規則はサーバと同じ client-core の applyGraphOps（checkGraphOps）にある（統合レビュー R1）
      message: expect.stringContaining("rekey_other_machine"),
    });
    expect(client.calls.some(([m]) => m === "graph.update")).toBe(false);
  });

  it("node rekey: 手元のノードは選び直さない（node_required。送らない）", async () => {
    const client = fakeClient({
      "graph.get": () => graph(),
      "machine.list": () => ({ machines: MACHINES }),
    });
    await expect(
      run(client, cmd({ kind: "node-rekey", pane: "p1", newPane: "p3" })),
    ).rejects.toMatchObject({ code: "node_required" });
    expect(client.calls.some(([m]) => m === "graph.update")).toBe(false);
  });

  it("node rm: 開いている手元の pane のノードは外さない（node_required。送らない）。閉じた pane のノード・別のマシンのノードは外す", async () => {
    const client = fakeClient({
      "graph.get": () =>
        graph({
          nodes: [
            { key: "local:p1", x: 40, y: 40 },
            { key: `local:${U9}`, x: 400, y: 40 },
            { key: `${BOX}:${U1}`, x: 900, y: 40 },
          ],
        }),
      "graph.update": () => graph({ rev: 2 }),
      "machine.list": () => ({ machines: MACHINES }),
    });
    await expect(run(client, cmd({ kind: "node-rm", pane: "p1" }))).rejects.toMatchObject({
      code: "node_required",
    });
    expect(client.calls.some(([m]) => m === "graph.update")).toBe(false);
    // 否定の対照: 閉じた pane（p8。snapshot に無い）・別のマシンのノードは外せる
    await run(client, cmd({ kind: "node-rm", pane: U9 }));
    await run(client, cmd({ kind: "node-rm", pane: `box:${U1}` }));
    const updates = client.calls.filter(([m]) => m === "graph.update").map(([, p]) => p);
    expect(updates).toEqual([
      { baseRev: 1, ops: [{ op: "remove_node", key: `local:${U9}` }] },
      { baseRev: 1, ops: [{ op: "remove_node", key: `${BOX}:${U1}` }] },
    ]);
  });

  it("node add: 手元の pane はすでにあるので何も送らず成功。別のマシンの pane は、手元の囲いに重ならない空きへ足す", async () => {
    const client = fakeClient({
      "graph.get": () => graph(),
      "graph.update": () => graph({ rev: 2 }),
      "machine.list": () => ({ machines: MACHINES }),
    });
    await run(client, cmd({ kind: "node-add", panes: ["p1"] }, true));
    expect(client.calls.some(([m]) => m === "graph.update")).toBe(false);
    expect(printJson).toHaveBeenCalledWith({ graph: expect.objectContaining({ rev: 1 }) });
    await run(client, cmd({ kind: "node-add", panes: [`box:${U1}`] }, true));
    const sent = client.calls.find(([m]) => m === "graph.update")![1] as {
      ops: { op: string; key: string; x: number; y: number }[];
    };
    expect(sent.ops).toHaveLength(1);
    expect(sent.ops[0]).toMatchObject({ op: "add_node", key: `${BOX}:${U1}` });
    // 手元の workspace の囲い（p1・p2 を含む）に重ならない場所
    const after = [...graph().nodes, { key: `${BOX}:${U1}`, x: sent.ops[0]!.x, y: sent.ops[0]!.y }];
    const structure = graphStructureFrom(SNAPSHOT, { remoteKeys: [`${BOX}:${U1}`] });
    expect(layoutOverlaps(structure, nodePositions(after)).size).toBe(0);
  });

  it("show --json: graph の形は変えず、ノードに workspaceId・tabId を足し、spaces（グループの id・名前・含む workspace）を足す", async () => {
    const client = fakeClient({
      "graph.get": () =>
        graph({
          nodes: [
            ...graph().nodes,
            { key: "local:p8", x: 600, y: 40 },
            { key: `${BOX}:${U1}`, x: 900, y: 40 },
          ],
        }),
    });
    await run(client, cmd({ kind: "show" }, true));
    const out = vi.mocked(printJson).mock.calls[0]![0] as {
      graph: { rev: number; nodes: Record<string, unknown>[] };
      spaces: unknown[];
    };
    expect(out.graph.rev).toBe(1);
    expect(out.graph.nodes).toEqual([
      { key: "local:p1", x: 40, y: 40, workspaceId: "w1", tabId: "t1" },
      { key: "local:p2", x: 300, y: 40, workspaceId: "w1", tabId: "t1" },
      { key: "local:p8", x: 600, y: 40, workspaceId: null, tabId: null }, // 閉じた pane
      { key: `${BOX}:${U1}`, x: 900, y: 40, workspaceId: null, tabId: null }, // 別のマシン
    ]);
    expect(out.spaces).toEqual([
      { id: "g1", name: "work", workspaces: ["w1"] },
      { id: null, name: null, workspaces: [] },
    ]);
    // 否定の対照: show 以外の graph の出力は、これまでの形（spaces を足さない）。
    vi.mocked(printJson).mockReset();
    const c2 = fakeClient({ "graph.pause": () => graph({ paused: true }) });
    await run(c2, cmd({ kind: "pause" }, true));
    expect(vi.mocked(printJson).mock.calls[0]![0]).toEqual({
      graph: expect.objectContaining({ paused: true }),
    });
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
            { key: "local:p9", x: 0, y: 0 },
            { key: `${BOX}:${U2}`, x: 0, y: 0 },
          ],
          links: [
            link({ count: 10, paused: "limit" }),
            {
              id: "l2",
              kind: "supervise",
              from: `${BOX}:${U2}`,
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
        `node          ${"key".padEnd(69)}  status  space  workspace`,
        `p1            ${"local:p1".padEnd(69)}  ok      work   api`,
        `p8            ${"local:p8".padEnd(69)}  closed  -      -`,
        `p9            ${"local:p9".padEnd(69)}  closed  -      -`, // 手元に居ない pane のノードは closed（id は再利用されないので「別の pane を指す」ことはない）
        `box:22222222  ${BOX}:${U2}  -       -      -`,
        "",
        "link  kind       from          to  count  state          settings",
        'l1    trigger    p1            p2  10/10  paused(limit)  on=done output=80 busy=wait prompt="見て {output}"',
        "l2    supervise  box:22222222  p1  0/10   paused",
      ].join("\n"),
    );
  });
});

describe("表の制御文字（g05 点検）", () => {
  it("履歴の文面に混ざった C1・双方向の上書きは表で \\uXXXX に逃がす", () => {
    const text = formatHistory([
      { linkId: "l1", at: 0, result: "sent", text: "ok\u202e\u009b31m\u001b]0;x\u0007" },
    ]);
    expect(text).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/);
    expect(text).toContain("ok\\u202e\\u009b31m");
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
