import { describe, expect, it, vi } from "vitest";
import {
  GRAPH_HISTORY_PER_LINK as HISTORY_MAX,
  type AgentInfo,
  type AgentState,
  type Graph,
  type GraphLink,
  type LinkRun,
  type NodeKey,
  type ServerEvent,
} from "@sodashitsu/protocol";
import {
  BLOCKED_HOLD_MS,
  BUSY_WAIT_MAX_MS,
  defaultTriggerConfig,
  SUPERVISOR_DEBOUNCE_MS,
} from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import { AgentPortError, type AgentPort, type AgentStatusEvent } from "./AgentPort.js";
import { GraphEngine } from "./GraphEngine.js";

// 20260927-agent-graph の 02 T4：実行の配線（偽の口・偽の時計・偽の保存）。
const A: NodeKey = "local:p1";
const B: NodeKey = "local:p2";
const S: NodeKey = "local:p3";
const REMOTE: NodeKey = `${"c".repeat(32)}:p1`;

function agent(instanceId: string, completionSeq: number, state: AgentState = "idle"): AgentInfo {
  return {
    instanceId,
    kind: "claude",
    label: "Claude",
    state,
    completionSeq,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
  };
}

class FakePort implements AgentPort {
  readonly machine = "local";
  readonly agents = new Map<string, AgentInfo | null>();
  readonly names = new Map<string, string>();
  tailText = "結果の末尾";
  readonly prompts: [string, string][] = [];
  failWith: AgentPortError | Error | null = null;
  /** prompt を手で解決する（送っている途中を作る）。 */
  hold = false;
  private release: (() => void) | null = null;
  private readonly listeners = new Set<(e: AgentStatusEvent) => void>();
  available(): boolean {
    return true;
  }
  onStatus(cb: (e: AgentStatusEvent) => void): Disposable {
    this.listeners.add(cb);
    return { dispose: () => this.listeners.delete(cb) };
  }
  onAvailability(): Disposable {
    return { dispose: () => undefined };
  }
  status(paneId: string): AgentInfo | null {
    return this.agents.get(paneId) ?? null;
  }
  paneName(paneId: string): string | null {
    return this.names.get(paneId) ?? `pane ${paneId}`;
  }
  holdTail = false;
  private releaseTail: (() => void) | null = null;
  tail = vi.fn(async (_paneId: string, _lines: number) => {
    if (this.holdTail) await new Promise<void>((r) => (this.releaseTail = r));
    return this.tailText;
  });
  finishTail(): void {
    this.releaseTail?.();
  }
  async prompt(paneId: string, text: string): Promise<void> {
    this.prompts.push([paneId, text]);
    if (this.hold) await new Promise<void>((r) => (this.release = r));
    if (this.failWith) throw this.failWith;
  }
  finish(): void {
    this.release?.();
  }
  set(paneId: string, a: AgentInfo | null): void {
    this.agents.set(paneId, a);
    for (const fn of [...this.listeners]) fn({ paneId, agent: a });
  }
  get listenerCount(): number {
    return this.listeners.size;
  }
}

class FakeStore {
  graph: Graph;
  private readonly listeners = new Set<(g: Graph, by: string | null) => void>();
  recordRun = vi.fn(async (linkId: string) => {
    const link = this.graph.links.find((l) => l.id === linkId);
    if (!link) return null;
    const count = link.count + 1;
    const limitReached = count >= link.limit;
    this.set({
      ...this.graph,
      links: this.graph.links.map((l) =>
        l.id === linkId
          ? { ...l, count, ...(limitReached ? { paused: "limit" as const } : {}) }
          : l,
      ),
    });
    return { limitReached };
  });
  constructor(graph: Graph) {
    this.graph = graph;
  }
  get(): Graph {
    return this.graph;
  }
  onChange(fn: (g: Graph, by: string | null) => void): Disposable {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }
  set(graph: Graph): void {
    this.graph = { ...graph, rev: this.graph.rev + 1 };
    for (const fn of [...this.listeners]) fn(this.graph, null);
  }
}

function trigger(over: Partial<GraphLink> = {}): GraphLink {
  return {
    id: "l1",
    kind: "trigger",
    from: A,
    to: B,
    trigger: { ...defaultTriggerConfig(), prompt: "見て: {output}" },
    limit: 10,
    count: 0,
    paused: null,
    ...over,
  };
}
function graphOf(
  links: GraphLink[],
  over: Partial<Graph> = {},
  keys: NodeKey[] = [A, B, S, REMOTE],
): Graph {
  return { rev: 1, paused: false, nodes: keys.map((key) => ({ key, x: 0, y: 0 })), links, ...over };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(links: GraphLink[], over: Partial<Graph> = {}, init?: (port: FakePort) => void) {
  let now = 1000;
  const port = new FakePort();
  port.agents.set("p1", agent("a1", 0));
  port.agents.set("p2", agent("b1", 0));
  port.agents.set("p3", agent("s1", 0));
  init?.(port);
  const store = new FakeStore(graphOf(links, over));
  const events: ServerEvent[] = [];
  const timers: (() => void)[] = [];
  const engine = new GraphEngine({
    store,
    local: port,
    publish: (e) => events.push(e),
    now: () => now,
    setInterval: (fn) => {
      timers.push(fn);
      return { clear: () => timers.splice(timers.indexOf(fn), 1) };
    },
  });
  engine.start();
  const runs = () =>
    events.filter((e) => e.event === "graph.fired").map((e) => (e.data as { run: LinkRun }).run);
  return {
    engine,
    port,
    store,
    events,
    timers,
    runs,
    advance: (ms: number) => {
      now += ms;
      engine.tick();
    },
    at: () => now,
    done: (seq: number) => port.set("p1", agent("a1", seq)),
  };
}

describe("GraphEngine — トリガ", () => {
  it("元が完了したら、先へ {output} に画面の末尾を差し込んで 1 回送り、履歴・graph.fired・回数", async () => {
    const t = setup([trigger()]);
    t.done(1);
    await flush();
    expect(t.port.prompts).toEqual([["p2", "見て: 結果の末尾"]]);
    expect(t.port.tail).toHaveBeenCalledWith("p1", 80);
    expect(t.runs()).toEqual([
      { linkId: "l1", at: t.at(), result: "sent", text: "見て: 結果の末尾" },
    ]);
    expect(t.store.recordRun).toHaveBeenCalledWith("l1");
    expect(t.store.graph.links[0]!.count).toBe(1);
    // 同じ完了の知らせがもう一度来ても送らない
    t.done(1);
    await flush();
    expect(t.port.prompts).toHaveLength(1);
  });

  it("受け渡さない線は画面を読まない", async () => {
    const t = setup([
      trigger({ trigger: { ...defaultTriggerConfig(), prompt: "続けて", output: null } }),
    ]);
    t.done(1);
    await flush();
    expect(t.port.prompts).toEqual([["p2", "続けて"]]);
    expect(t.port.tail).not.toHaveBeenCalled();
  });

  it("先が作業中なら待ち（履歴 waiting）、手が空いたら送る", async () => {
    const t = setup([trigger()], {}, (p) => p.agents.set("p2", agent("b1", 0, "working")));
    t.done(1);
    await flush();
    expect(t.runs().map((r) => r.result)).toEqual(["waiting"]);
    expect(t.port.prompts).toEqual([]);
    t.port.set("p2", agent("b1", 1, "idle"));
    await flush();
    expect(t.port.prompts).toHaveLength(1);
    expect(t.runs().map((r) => r.result)).toEqual(["waiting", "sent"]);
  });

  it("30 分待っても空かなければ busy_timeout", async () => {
    const t = setup([trigger()], {}, (p) => p.agents.set("p2", agent("b1", 0, "working")));
    t.done(1);
    t.advance(BUSY_WAIT_MAX_MS);
    await flush();
    expect(t.runs().map((r) => [r.result, r.reason])).toEqual([
      ["waiting", undefined],
      ["skipped", "busy_timeout"],
    ]);
    expect(t.port.prompts).toEqual([]);
  });

  it("先が居なければ target_absent、承認待ちなら blocked で見送る", async () => {
    const absent = setup([trigger()], {}, (p) => p.agents.set("p2", null));
    absent.done(1);
    const blocked = setup([trigger()], {}, (p) => p.agents.set("p2", agent("b1", 0, "blocked")));
    blocked.done(1);
    await flush();
    expect(absent.runs()[0]).toMatchObject({ result: "skipped", reason: "target_absent" });
    expect(blocked.runs()[0]).toMatchObject({ result: "skipped", reason: "blocked" });
  });

  it("全体・線の一時停止は paused、上限の一時停止は limit で見送る（送らない）", async () => {
    const all = setup([trigger()], { paused: true });
    const user = setup([trigger({ paused: "user" })]);
    const limit = setup([trigger({ paused: "limit", count: 10 })]);
    for (const t of [all, user, limit]) t.done(1);
    await flush();
    expect(all.runs()[0]).toMatchObject({ result: "skipped", reason: "paused" });
    expect(user.runs()[0]).toMatchObject({ result: "skipped", reason: "paused" });
    expect(limit.runs()[0]).toMatchObject({ result: "skipped", reason: "limit" });
    for (const t of [all, user, limit]) expect(t.port.prompts).toEqual([]);
  });

  it("上限に達したら paused: limit になり、次の発火は limit で見送る。再開（回数 0）すればまた送る", async () => {
    const t = setup([trigger({ limit: 1 })]);
    t.done(1);
    await flush();
    expect(t.store.graph.links[0]).toMatchObject({ count: 1, paused: "limit" });
    t.done(2);
    await flush();
    expect(t.runs().map((r) => [r.result, r.reason])).toEqual([
      ["sent", undefined],
      ["skipped", "limit"],
    ]);
    t.store.set({
      ...t.store.graph,
      links: [{ ...t.store.graph.links[0]!, count: 0, paused: null }],
    });
    t.done(3);
    await flush();
    expect(t.port.prompts).toHaveLength(2);
  });

  it("待つ間に一時停止したら、待ちを paused で見送る", async () => {
    const t = setup([trigger()], {}, (p) => p.agents.set("p2", agent("b1", 0, "working")));
    t.done(1);
    t.store.set({ ...t.store.graph, paused: true });
    t.port.set("p2", agent("b1", 1, "idle"));
    await flush();
    expect(t.runs().map((r) => [r.result, r.reason])).toEqual([
      ["waiting", undefined],
      ["skipped", "paused"],
    ]);
    expect(t.port.prompts).toEqual([]);
  });

  it("先が別のマシンなら machine_unavailable で見送る（04 まで）。元が別のマシンの線は動かない", async () => {
    const t = setup([trigger({ to: REMOTE }), trigger({ id: "l2", from: REMOTE, to: B })]);
    t.done(1);
    await flush();
    expect(t.runs()).toEqual([
      expect.objectContaining({ linkId: "l1", result: "skipped", reason: "machine_unavailable" }),
    ]);
  });

  it("無効（stale）のノードの線は動かない（履歴も残さない）", async () => {
    const t = setup([trigger()], {
      nodes: [
        { key: A, x: 0, y: 0, stale: true },
        { key: B, x: 0, y: 0 },
      ],
    });
    t.done(1);
    await flush();
    expect(t.runs()).toEqual([]);
    const u = setup([trigger()], {
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: B, x: 0, y: 0, stale: true },
      ],
    });
    u.done(1);
    await flush();
    expect(u.runs()).toEqual([]);
  });

  it("送信の失敗: agent_blocked は blocked、agent_not_found は target_absent で見送り、ほかは failed（回数に数えない）", async () => {
    const cases: [Error, Partial<LinkRun>][] = [
      [new AgentPortError("agent_blocked", "blocked"), { result: "skipped", reason: "blocked" }],
      [
        new AgentPortError("agent_not_found", "gone"),
        { result: "skipped", reason: "target_absent" },
      ],
      [
        new AgentPortError("input_queue_full", "queue full"),
        { result: "failed", reason: "error", text: "queue full" },
      ],
      [new Error("boom"), { result: "failed", reason: "error", text: "boom" }],
    ];
    for (const [err, expected] of cases) {
      const t = setup([trigger()]);
      t.port.failWith = err;
      t.done(1);
      await flush();
      expect(t.runs()).toEqual([expect.objectContaining(expected)]);
      expect(t.store.recordRun).not.toHaveBeenCalled();
    }
  });

  it("回数の保存に失敗しても、送った履歴はそのまま（failed にしない）", async () => {
    const t = setup([trigger()]);
    t.store.recordRun.mockRejectedValueOnce(new Error("graph store is closed"));
    t.done(1);
    await flush();
    await flush();
    expect(t.runs().map((r) => r.result)).toEqual(["sent"]);
  });

  it("線の元を選び直したら、新しい元の今の値を基準にする", async () => {
    const t = setup([trigger()]);
    t.port.agents.set("p4", agent("d1", 7));
    t.store.set({
      ...t.store.graph,
      nodes: [...t.store.graph.nodes, { key: "local:p4", x: 0, y: 0 }],
      links: [trigger({ from: "local:p4" })],
    });
    t.port.set("p4", agent("d1", 7));
    t.done(5); // 前の元の完了では動かない
    await flush();
    expect(t.port.prompts).toEqual([]);
    t.port.set("p4", agent("d1", 8));
    await flush();
    expect(t.port.prompts).toHaveLength(1);
  });

  it("線の設定の変更（元・先が同じ）は状態を引き継ぎ、待ちも続く", async () => {
    const t = setup([trigger()], {}, (p) => p.agents.set("p2", agent("b1", 0, "working")));
    t.done(1);
    t.store.set({ ...t.store.graph, links: [trigger({ limit: 50 })] });
    t.port.set("p2", agent("b1", 1, "idle"));
    await flush();
    expect(t.port.prompts).toHaveLength(1);
  });

  it("線を消したら待ちを黙って取り消し、その線の履歴も消える", async () => {
    const t = setup([trigger()], {}, (p) => p.agents.set("p2", agent("b1", 0, "working")));
    t.done(1);
    expect(t.engine.getHistory("l1")).toHaveLength(1);
    t.store.set({ ...t.store.graph, links: [] });
    t.port.set("p2", agent("b1", 1, "idle"));
    await flush();
    expect(t.port.prompts).toEqual([]);
    expect(t.runs()).toHaveLength(1);
    expect(t.engine.getHistory("l1")).toEqual([]);
  });
});

describe("GraphEngine — 承認の代理", () => {
  const approval = (mode: "delegate" | "notify"): GraphLink => ({
    id: "l1",
    kind: "approval",
    from: A,
    to: S,
    approval: { mode, lines: 5 },
    limit: 10,
    count: 0,
    paused: null,
  });

  it("配下が 1 秒承認待ちなら、監督役へ材料と答え方（delegate）を送る。回数に数える", async () => {
    const t = setup([approval("delegate")], {}, (p) => p.names.set("p1", "impl"));
    t.port.set("p1", agent("a1", 0, "blocked"));
    t.advance(BLOCKED_HOLD_MS - 1);
    expect(t.port.prompts).toEqual([]);
    t.advance(1);
    await flush();
    expect(t.port.tail).toHaveBeenCalledWith("p1", 5);
    expect(t.port.prompts).toHaveLength(1);
    const [pane, text] = t.port.prompts[0]!;
    expect(pane).toBe("p3");
    expect(text).toContain("配下 impl（p1）が承認待ちです");
    expect(text).toContain("結果の末尾");
    expect(text).toContain("sodactl agent send-keys p1");
    expect(t.store.recordRun).toHaveBeenCalledWith("l1");
  });

  it("notify は答えないよう伝える", async () => {
    const t = setup([approval("notify")]);
    t.port.set("p1", agent("a1", 0, "blocked"));
    t.advance(BLOCKED_HOLD_MS);
    await flush();
    expect(t.port.prompts[0]![1]).toContain("返答は利用者が行います");
  });

  it("監督役が作業中で待つ間に承認待ちが解けたら、送らずに resolved", async () => {
    const t = setup([approval("delegate")], {}, (p) =>
      p.agents.set("p3", agent("s1", 0, "working")),
    );
    t.port.set("p1", agent("a1", 0, "blocked"));
    t.advance(BLOCKED_HOLD_MS);
    t.port.set("p1", agent("a1", 0, "working"));
    t.port.set("p3", agent("s1", 1, "idle"));
    await flush();
    expect(t.port.prompts).toEqual([]);
    expect(t.runs().map((r) => [r.result, r.reason])).toEqual([
      ["waiting", undefined],
      ["skipped", "resolved"],
    ]);
  });
});

describe("GraphEngine — 監督", () => {
  const supervise = (id: string, from: NodeKey): GraphLink => ({
    id,
    kind: "supervise",
    from,
    to: S,
    limit: 10,
    count: 0,
    paused: null,
  });

  it("監督の線を結ぶと、2 秒後に手の空いた監督役へ配下と使い方を送る（各線の履歴に残し、回数には数えない）", async () => {
    const t = setup([supervise("l1", A), supervise("l2", B)], {}, (p) => p.names.set("p1", "impl"));
    t.advance(SUPERVISOR_DEBOUNCE_MS - 1);
    expect(t.port.prompts).toEqual([]);
    t.advance(1);
    await flush();
    expect(t.port.prompts).toHaveLength(1);
    const [pane, text] = t.port.prompts[0]!;
    expect(pane).toBe("p3");
    expect(text).toContain(
      "あなたは Sodashitsu の監督役です。配下: impl（pane p1・claude・手元）, pane p2（pane p2・claude・手元）。",
    );
    expect(t.runs().map((r) => [r.linkId, r.result])).toEqual([
      ["l1", "sent"],
      ["l2", "sent"],
    ]);
    expect(t.store.recordRun).not.toHaveBeenCalled();
  });

  it("配下が増えたら知らせ直す。監督役が作業中なら手が空くまで待つ", async () => {
    const t = setup([supervise("l1", A)]);
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.port.set("p3", agent("s1", 0, "working"));
    t.store.set({ ...t.store.graph, links: [supervise("l1", A), supervise("l2", B)] });
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.port.prompts).toHaveLength(1);
    t.port.set("p3", agent("s1", 1, "idle"));
    await flush();
    expect(t.port.prompts).toHaveLength(2);
    expect(t.port.prompts[1]![1]).toContain("pane p2");
  });

  it("無効になった配下は知らせに載せず、無効化も知らせ直す", async () => {
    const t = setup([supervise("l1", A), supervise("l2", B)]);
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.store.set({
      ...t.store.graph,
      nodes: t.store.graph.nodes.map((n) => (n.key === B ? { ...n, stale: true as const } : n)),
    });
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.port.prompts).toHaveLength(2);
    expect(t.port.prompts[1]![1]).not.toContain("pane p2");
  });

  it("全体の一時停止・監督の線が全部止まっている間は送らない", async () => {
    const t = setup([supervise("l1", A)], { paused: true });
    t.advance(SUPERVISOR_DEBOUNCE_MS * 2);
    const u = setup([{ ...supervise("l1", A), paused: "user" }]);
    u.advance(SUPERVISOR_DEBOUNCE_MS * 2);
    await flush();
    expect(t.port.prompts).toEqual([]);
    expect(u.port.prompts).toEqual([]);
    t.store.set({ ...t.store.graph, paused: false });
    await flush();
    expect(t.port.prompts).toHaveLength(1);
  });

  it("送る直前に承認待ちになっていたら（agent_blocked）、次に手が空いたときに送り直す", async () => {
    const t = setup([supervise("l1", A)]);
    t.port.failWith = new AgentPortError("agent_blocked", "blocked");
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.port.failWith = null;
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.port.prompts).toHaveLength(2);
    expect(t.runs().map((r) => r.result)).toEqual(["sent"]);
  });

  it("ほかの失敗は failed を残す（送り直さない）", async () => {
    const t = setup([supervise("l1", A)]);
    t.port.failWith = new Error("boom");
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.advance(SUPERVISOR_DEBOUNCE_MS * 3);
    await flush();
    expect(t.port.prompts).toHaveLength(1);
    expect(t.runs()).toEqual([
      expect.objectContaining({ result: "failed", reason: "error", text: "boom" }),
    ]);
  });

  it("監督役が別のマシン・無効なら知らせない。監督の線を全部消したら監督役の知らせも止まる", async () => {
    const remote = setup([{ ...supervise("l1", A), to: REMOTE }]);
    remote.advance(SUPERVISOR_DEBOUNCE_MS);
    const stale = setup([supervise("l1", A)], {
      nodes: [
        { key: A, x: 0, y: 0 },
        { key: S, x: 0, y: 0, stale: true },
      ],
    });
    stale.advance(SUPERVISOR_DEBOUNCE_MS);
    const removed = setup([supervise("l1", A)]);
    removed.store.set({ ...removed.store.graph, links: [] });
    removed.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    for (const t of [remote, stale, removed]) expect(t.port.prompts).toEqual([]);
  });
});

describe("GraphEngine — 履歴・開始と停止", () => {
  it(`履歴は線ごとに直近 ${HISTORY_MAX} 件、新しい順。linkId 無しは全部、limit で切る`, async () => {
    const t = setup([trigger({ paused: "user" }), trigger({ id: "l2", to: S, paused: "user" })]);
    for (let i = 1; i <= HISTORY_MAX + 5; i++) {
      t.advance(1);
      t.done(i);
    }
    expect(t.engine.getHistory("l1")).toHaveLength(HISTORY_MAX);
    expect(t.engine.getHistory("l1")[0]!.at).toBe(t.at());
    expect(t.engine.getHistory("l1").at(-1)!.at).toBe(t.at() - HISTORY_MAX + 1);
    expect(t.engine.getHistory()).toHaveLength(HISTORY_MAX * 2);
    expect(t.engine.getHistory(undefined, 3)).toHaveLength(3);
    expect(t.engine.getHistory("l9")).toEqual([]);
  });

  it("stop で購読・見回りを止め、待ちは黙って取り消す（履歴を足さない）。送っている途中の結果も記録しない", async () => {
    const t = setup([trigger(), trigger({ id: "l2", from: B, to: A })], {}, (p) =>
      p.agents.set("p2", agent("b1", 0, "working")),
    );
    t.done(1); // l1 は待ち
    t.port.hold = true;
    t.port.set("p2", agent("b1", 1, "idle")); // 待ちが解けて送り始める（途中）。l2 は元 p2 の完了で送り始める
    await flush();
    const before = t.runs().length;
    t.engine.stop();
    expect(t.timers).toEqual([]);
    expect(t.port.listenerCount).toBe(0);
    t.port.finish();
    await flush();
    t.done(2);
    t.store.set({ ...t.store.graph });
    await flush();
    expect(t.runs()).toHaveLength(before);
    expect(t.store.recordRun).not.toHaveBeenCalled();
    t.engine.stop(); // 二度目は何もしない
  });

  it("stop の後に start すれば、今の値を基準にして動く（止めていた間の完了は送らない）", async () => {
    const t = setup([trigger()]);
    t.engine.stop();
    t.port.agents.set("p1", agent("a1", 3));
    t.engine.start();
    t.engine.start(); // 二重に始めない
    expect(t.timers).toHaveLength(1);
    t.done(3);
    await flush();
    expect(t.port.prompts).toEqual([]);
    t.done(4);
    await flush();
    expect(t.port.prompts).toHaveLength(1);
  });

  it("購読の中の例外は外へ出さない（bus の後続の購読者を止めない）", () => {
    const t = setup([trigger()]);
    vi.spyOn(t.port, "tail").mockImplementation(() => {
      throw new Error("sync boom");
    });
    const status = vi.spyOn(t.port, "status").mockImplementation(() => {
      throw new Error("status boom");
    });
    expect(() => t.store.set({ ...t.store.graph, links: [trigger({ from: S })] })).not.toThrow();
    status.mockRestore();
    expect(() => t.timers[0]!()).not.toThrow();
  });
});

describe("GraphEngine — 変異の網羅で見つけた抜け", () => {
  const supervise = (id: string, from: NodeKey): GraphLink => ({
    id,
    kind: "supervise",
    from,
    to: S,
    limit: 10,
    count: 0,
    paused: null,
  });

  it("監督の線は承認の代理として動かない（配下が承認待ちでも承認の文面を送らない）", async () => {
    const t = setup([supervise("l1", A)]);
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.port.set("p1", agent("a1", 0, "blocked"));
    t.advance(BLOCKED_HOLD_MS * 2);
    await flush();
    expect(t.port.prompts).toHaveLength(1); // 最初の監督の知らせだけ
    expect(t.port.prompts[0]![1]).toContain("監督役");
    expect(t.runs().map((r) => r.result)).toEqual(["sent"]); // 承認の代理として失敗の記録も残さない
  });

  it("動いていた線の元のノードが後から無効になったら、その線は止まる", async () => {
    const t = setup([trigger()]);
    t.store.set({
      ...t.store.graph,
      nodes: t.store.graph.nodes.map((n) => (n.key === A ? { ...n, stale: true as const } : n)),
    });
    t.done(1);
    await flush();
    expect(t.port.prompts).toEqual([]);
    expect(t.runs()).toEqual([]);
  });

  it("トリガの線だけなら、先を監督役として知らせない", async () => {
    const t = setup([trigger()]);
    t.advance(SUPERVISOR_DEBOUNCE_MS * 3);
    await flush();
    expect(t.port.prompts).toEqual([]);
  });

  it("線を消したら、その後の完了でも送らない。残った線の履歴は消さない", async () => {
    const t = setup([trigger({ paused: "user" }), trigger({ id: "l2", to: S })]);
    t.done(1);
    await flush();
    t.store.set({ ...t.store.graph, links: [trigger({ id: "l2", to: S })] });
    expect(t.engine.getHistory("l1")).toEqual([]);
    expect(t.engine.getHistory("l2")).toHaveLength(1);
    t.store.set({ ...t.store.graph, links: [] });
    t.done(2);
    await flush();
    expect(t.port.prompts).toHaveLength(1);
  });

  it("線の設定を変えたら、次からは新しい文面で送る", async () => {
    const t = setup([trigger()]);
    t.store.set({
      ...t.store.graph,
      links: [
        trigger({ trigger: { ...defaultTriggerConfig(), prompt: "新しい文面", output: null } }),
      ],
    });
    t.done(1);
    await flush();
    expect(t.port.prompts).toEqual([["p2", "新しい文面"]]);
  });

  it("作業中は見送る（whenBusy: skip）線は busy で見送る", async () => {
    const t = setup(
      [trigger({ trigger: { ...defaultTriggerConfig(), whenBusy: "skip" } })],
      {},
      (p) => p.agents.set("p2", agent("b1", 0, "working")),
    );
    t.done(1);
    expect(t.runs()).toEqual([expect.objectContaining({ result: "skipped", reason: "busy" })]);
  });

  it("監督役のノードが後から無効になったら、知らせを止める", async () => {
    const t = setup([supervise("l1", A)]);
    t.store.set({
      ...t.store.graph,
      nodes: t.store.graph.nodes.map((n) => (n.key === S ? { ...n, stale: true as const } : n)),
    });
    t.advance(SUPERVISOR_DEBOUNCE_MS * 2);
    await flush();
    expect(t.port.prompts).toEqual([]);
  });

  it("配下の状態の変化は監督役の状態として扱わない（監督役が作業中なら、配下が idle になっても送らない）", async () => {
    const t = setup([supervise("l1", A)], {}, (p) => p.agents.set("p3", agent("s1", 0, "working")));
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    t.port.set("p1", agent("a1", 1, "idle"));
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.port.prompts).toEqual([]);
  });

  it("見送り・失敗の履歴にも線の id と時刻が入る", async () => {
    const t = setup([trigger()]);
    t.port.failWith = new Error("boom");
    t.done(1);
    await flush();
    expect(t.runs()[0]).toMatchObject({ linkId: "l1", at: t.at() });
    const u = setup(
      [
        {
          id: "l7",
          kind: "approval",
          from: A,
          to: S,
          approval: { mode: "notify", lines: 5 },
          limit: 10,
          count: 0,
          paused: null,
        },
      ],
      {},
      (p) => p.agents.set("p3", agent("s1", 0, "working")),
    );
    u.port.set("p1", agent("a1", 0, "blocked"));
    u.advance(BLOCKED_HOLD_MS);
    u.port.set("p1", agent("a1", 0, "idle"));
    u.port.set("p3", agent("s1", 1, "idle"));
    await flush();
    expect(u.runs()[1]).toEqual({
      linkId: "l7",
      at: u.at(),
      result: "skipped",
      reason: "resolved",
    });
  });

  it("画面の末尾を読んでいる間に止めたら送らない", async () => {
    const t = setup([trigger()]);
    t.port.holdTail = true;
    t.done(1);
    await flush();
    t.engine.stop();
    t.port.finishTail();
    await flush();
    expect(t.port.prompts).toEqual([]);
  });

  it("送信が失敗する途中で止めたら、失敗も記録しない", async () => {
    const t = setup([trigger()]);
    t.port.hold = true;
    t.port.failWith = new Error("boom");
    t.done(1);
    await flush();
    t.engine.stop();
    t.port.finish();
    await flush();
    expect(t.runs()).toEqual([]);
  });

  it("監督役への知らせの途中で止めたら、成功も失敗も記録しない", async () => {
    for (const fail of [false, true]) {
      const t = setup([supervise("l1", A)]);
      t.port.hold = true;
      if (fail) t.port.failWith = new Error("boom");
      t.advance(SUPERVISOR_DEBOUNCE_MS);
      await flush();
      t.engine.stop();
      t.port.finish();
      await flush();
      expect(t.runs()).toEqual([]);
    }
  });

  it("監督役への知らせの失敗が承認待ち・不在以外（input_queue_full 等）なら送り直さず failed", async () => {
    const t = setup([supervise("l1", A)]);
    t.port.failWith = new AgentPortError("input_queue_full", "full");
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.port.failWith = null;
    t.advance(SUPERVISOR_DEBOUNCE_MS * 2);
    await flush();
    expect(t.port.prompts).toHaveLength(1);
    expect(t.runs()).toEqual([expect.objectContaining({ result: "failed", text: "full" })]);
  });

  it("監督役が居ない（agent_not_found）間に当たったら送り直す", async () => {
    const t = setup([supervise("l1", A)]);
    t.port.failWith = new AgentPortError("agent_not_found", "gone");
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.port.failWith = null;
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.port.prompts).toHaveLength(2);
  });

  it("止めて始め直したら、監督役へ知らせ直す（状態を捨てて作り直す）", async () => {
    const t = setup([supervise("l1", A)]);
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    t.engine.stop();
    t.engine.start();
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.port.prompts).toHaveLength(2);
  });

  it("見回りのタイマーを渡さなければ setInterval で 1 秒ごとに見回り、stop で止める", async () => {
    vi.useFakeTimers();
    try {
      const port = new FakePort();
      port.agents.set("p1", agent("a1", 0));
      port.agents.set("p3", agent("s1", 0));
      const store = new FakeStore(graphOf([supervise("l1", A)]));
      let now = 0;
      const engine = new GraphEngine({
        store,
        local: port,
        publish: () => undefined,
        now: () => now,
      });
      engine.start();
      now = SUPERVISOR_DEBOUNCE_MS;
      await vi.advanceTimersByTimeAsync(1000);
      expect(port.prompts).toHaveLength(1);
      engine.stop();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
