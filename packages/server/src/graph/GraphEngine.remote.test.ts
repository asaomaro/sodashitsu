import { describe, expect, it, vi } from "vitest";
import type {
  AgentInfo,
  AgentState,
  Graph,
  GraphLink,
  LinkRun,
  NodeKey,
  ServerEvent,
} from "@sodashitsu/protocol";
import {
  BLOCKED_HOLD_MS,
  defaultTriggerConfig,
  SUPERVISOR_DEBOUNCE_MS,
} from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import { AgentPortError, type AgentPort, type AgentStatusEvent } from "./AgentPort.js";
import { ASSUMED_BUSY_MS, GraphEngine } from "./GraphEngine.js";

// 20260927-agent-graph の 04 T3：別のマシンの端（偽の口・偽の時計・偽の保存）。
const MID = "c".repeat(32);
const L1: NodeKey = "local:p1";
const L2: NodeKey = "local:p2";
const R1: NodeKey = `${MID}:p1`;
const R2: NodeKey = `${MID}:p2`;

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

class Port implements AgentPort {
  up = true;
  readonly agents = new Map<string, AgentInfo | null>();
  readonly prompts: [string, string][] = [];
  tailText = "末尾";
  failWith: Error | null = null;
  private readonly statusCbs = new Set<(e: AgentStatusEvent) => void>();
  private readonly availCbs = new Set<(up: boolean) => void>();
  constructor(
    readonly machine: string,
    private readonly label: string | null,
  ) {}
  available(): boolean {
    return this.up;
  }
  onStatus(cb: (e: AgentStatusEvent) => void): Disposable {
    this.statusCbs.add(cb);
    return { dispose: () => this.statusCbs.delete(cb) };
  }
  onAvailability(cb: (up: boolean) => void): Disposable {
    this.availCbs.add(cb);
    return { dispose: () => this.availCbs.delete(cb) };
  }
  status(paneId: string): AgentInfo | null {
    return this.up ? (this.agents.get(paneId) ?? null) : null;
  }
  machineLabel(): string | null {
    return this.label;
  }
  paneName(paneId: string): string | null {
    return `${this.machine === "local" ? "l" : "r"}-${paneId}`;
  }
  tail = vi.fn(async (_paneId: string, _lines: number) => {
    if (!this.up) throw new AgentPortError("machine_unavailable", "down");
    return this.tailText;
  });
  async prompt(paneId: string, text: string): Promise<void> {
    if (!this.up) throw new AgentPortError("machine_unavailable", "down");
    this.prompts.push([paneId, text]);
    if (this.failWith) throw this.failWith;
  }
  set(paneId: string, a: AgentInfo | null): void {
    this.agents.set(paneId, a);
    if (this.up) for (const cb of [...this.statusCbs]) cb({ paneId, agent: a });
  }
  /** 切れる・繋がる（繋がったときの値は `agents` を先に書き換えておく＝snapshot）。 */
  setUp(up: boolean): void {
    this.up = up;
    for (const cb of [...this.availCbs]) cb(up);
  }
  get listeners(): number {
    return this.statusCbs.size + this.availCbs.size;
  }
}

class Store {
  graph: Graph;
  private readonly listeners = new Set<(g: Graph, by: string | null) => void>();
  recordRun = vi.fn(async (linkId: string) => {
    const link = this.graph.links.find((l) => l.id === linkId);
    if (!link) return null;
    this.set({
      ...this.graph,
      links: this.graph.links.map((l) => (l.id === linkId ? { ...l, count: l.count + 1 } : l)),
    });
    return { limitReached: false };
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

function trigger(id: string, from: NodeKey, to: NodeKey): GraphLink {
  return {
    id,
    kind: "trigger",
    from,
    to,
    trigger: { ...defaultTriggerConfig(), prompt: "見て: {output}" },
    limit: 10,
    count: 0,
    paused: null,
  };
}

function graphOf(links: GraphLink[], keys: NodeKey[] = [L1, L2, R1, R2]): Graph {
  return { rev: 1, paused: false, nodes: keys.map((key) => ({ key, x: 0, y: 0 })), links };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function setup(links: GraphLink[], init?: (local: Port, remote: Port) => void) {
  let now = 1000;
  const local = new Port("local", null);
  const remote = new Port(MID, "box");
  local.agents.set("p1", agent("la", 0));
  local.agents.set("p2", agent("lb", 0));
  remote.agents.set("p1", agent("ra", 0));
  remote.agents.set("p2", agent("rb", 0));
  init?.(local, remote);
  // 監督の線は起動の後に結ぶ（起動の前からある線は、起動のたびに知らせを送り直さない）。
  const initialLinks = links.filter((l) => l.kind !== "supervise");
  const store = new Store(graphOf(initialLinks));
  const events: ServerEvent[] = [];
  const ensured: string[][] = [];
  const engine = new GraphEngine({
    store,
    local,
    remote: {
      ensure: (ids) => ensured.push([...ids]),
      port: (id) => (id === MID ? remote : undefined),
    },
    localLabel: "desk",
    publish: (e) => events.push(e),
    now: () => now,
    setInterval: () => ({ clear: () => undefined }),
  });
  engine.start();
  if (initialLinks.length !== links.length) store.set(graphOf(links));
  const runs = () =>
    events.filter((e) => e.event === "graph.fired").map((e) => (e.data as { run: LinkRun }).run);
  const reasons = () =>
    runs().map((r) => `${r.linkId}:${r.result}${r.reason ? `/${r.reason}` : ""}`);
  return {
    engine,
    local,
    remote,
    store,
    ensured,
    runs,
    reasons,
    advance: (ms: number) => {
      now += ms;
      engine.tick();
    },
  };
}

describe("GraphEngine — 別のマシン（04）", () => {
  it("載っているマシンの接続をそろえ、その口を購読する。外れたら購読を外す。止めたら全部外す", () => {
    const t = setup([trigger("l1", L1, R1)]);
    expect(t.ensured.at(-1)).toEqual([MID]);
    expect(t.remote.listeners).toBe(2);
    t.store.set(graphOf([], [L1, L2]));
    expect(t.ensured.at(-1)).toEqual([]);
    expect(t.remote.listeners).toBe(0);
    t.store.set(graphOf([trigger("l1", L1, R1)]));
    expect(t.remote.listeners).toBe(2);
    t.engine.stop();
    expect(t.remote.listeners).toBe(0);
  });

  it("手元 → 別のマシン: 元が完了したら別のマシンの先へ 1 回だけ送る", async () => {
    const t = setup([trigger("l1", L1, R1)]);
    t.local.set("p1", agent("la", 1));
    await flush();
    expect(t.remote.prompts).toEqual([["p1", "見て: 末尾"]]);
    t.local.set("p1", agent("la", 1)); // 同じ完了
    await flush();
    expect(t.remote.prompts).toHaveLength(1);
    expect(t.reasons()).toEqual(["l1:sent"]);
  });

  it("別のマシン → 手元: 別のマシンの元の完了で、その画面の末尾を手元の先へ送る", async () => {
    const t = setup([trigger("l1", R1, L1)]);
    t.remote.tailText = "リモートの結果";
    t.remote.set("p1", agent("ra", 1));
    await flush();
    expect(t.remote.tail).toHaveBeenCalledWith("p1", 80);
    expect(t.local.prompts).toEqual([["p1", "見て: リモートの結果"]]);
  });

  it("切れている間の発火は machine_unavailable で見送る。待っていた発火も切れたら machine_unavailable で取り消す", async () => {
    const t = setup([trigger("l1", L1, R1), trigger("l2", L2, R2)], (_l, r) =>
      r.agents.set("p2", agent("rb", 0, "working")),
    );
    t.local.set("p2", agent("lb", 1)); // 先が作業中なので待つ
    await flush();
    expect(t.reasons()).toEqual(["l2:waiting"]);
    t.remote.setUp(false);
    t.local.set("p1", agent("la", 1));
    await flush();
    expect(t.remote.prompts).toEqual([]);
    expect(t.reasons()).toEqual([
      "l2:waiting",
      "l2:skipped/machine_unavailable",
      "l1:skipped/machine_unavailable",
    ]);
  });

  it("繋ぎ直した値は基準: 切れている間の完了では動かず、その後の完了で 1 回だけ動く", async () => {
    const t = setup([trigger("l1", R1, L1)]);
    t.remote.setUp(false);
    t.remote.agents.set("p1", agent("ra", 3)); // 切れている間に 3 回完了していた（snapshot）
    t.remote.setUp(true);
    await flush();
    expect(t.local.prompts).toEqual([]);
    expect(t.runs()).toEqual([]);
    t.remote.set("p1", agent("ra", 4));
    await flush();
    expect(t.local.prompts).toHaveLength(1);
  });

  it("切れている間に作った線も、繋がったときの値を基準にする", async () => {
    const t = setup([]);
    t.remote.setUp(false);
    t.store.set(graphOf([trigger("l1", R1, L1)]));
    t.remote.agents.set("p1", agent("ra", 7));
    t.remote.setUp(true);
    await flush();
    expect(t.local.prompts).toEqual([]);
    t.remote.set("p1", agent("ra", 8));
    await flush();
    expect(t.local.prompts).toHaveLength(1);
  });

  it("承認待ちのまま切れて繋ぎ直しても、その回は動かない（基準）", async () => {
    const approval: GraphLink = {
      id: "l1",
      kind: "approval",
      from: R1,
      to: L1,
      approval: { mode: "delegate", lines: 5 },
      limit: 10,
      count: 0,
      paused: null,
    };
    const t = setup([approval]);
    t.remote.setUp(false);
    t.remote.agents.set("p1", agent("ra", 0, "blocked"));
    t.remote.setUp(true);
    t.advance(BLOCKED_HOLD_MS * 2);
    await flush();
    expect(t.local.prompts).toEqual([]);
  });

  it("承認の代理（別のマシンの配下 → 手元の監督役）の文面はマシンの呼び名で --machine を付ける", async () => {
    const approval: GraphLink = {
      id: "l1",
      kind: "approval",
      from: R1,
      to: L1,
      approval: { mode: "delegate", lines: 5 },
      limit: 10,
      count: 0,
      paused: null,
    };
    const t = setup([approval]);
    t.remote.set("p1", agent("ra", 0, "working"));
    t.remote.set("p1", agent("ra", 0, "blocked"));
    t.advance(BLOCKED_HOLD_MS);
    await flush();
    expect(t.local.prompts).toHaveLength(1);
    const text = t.local.prompts[0]![1];
    expect(text).toContain("配下 r-p1（p1・マシン box）が承認待ちです");
    expect(text).toContain(`sodactl --machine box agent send-keys p1`);
  });

  it("送ると決めた直後に先のマシンが切れていたら machine_unavailable（数えない）", async () => {
    const t = setup([trigger("l1", L1, R1)]);
    // 画面を読んでいる間に切れる
    t.local.tail.mockImplementationOnce(async () => {
      t.remote.up = false; // 知らせより先に送り始めている
      return "x";
    });
    t.local.set("p1", agent("la", 1));
    await flush();
    expect(t.reasons()).toEqual(["l1:skipped/machine_unavailable"]);
    expect(t.store.recordRun).not.toHaveBeenCalled();
  });

  it("作業中とみなす（5 秒）は別のマシンの先にも効く: 同じ先へ続けて送らない", async () => {
    const t = setup([trigger("l1", L1, R1), trigger("l2", L2, R1)]);
    t.local.set("p1", agent("la", 1));
    t.local.set("p2", agent("lb", 1));
    await flush();
    expect(t.remote.prompts).toHaveLength(1);
    expect(t.reasons()).toEqual(["l2:waiting", "l1:sent"]);
    t.advance(ASSUMED_BUSY_MS);
    await flush();
    expect(t.remote.prompts).toHaveLength(2);
  });
});

describe("GraphEngine — 作業中とみなすのは送り終えてから（04 レビュー R1）", () => {
  it("別のマシンの画面の読み取りが 5 秒を超えても、その間と送り終えてから 5 秒は同じ先へ 2 通目を送らない", async () => {
    const t = setup([trigger("l1", R1, L1), trigger("l2", R2, L1)]);
    let finishTail!: (v: string) => void;
    t.remote.tail.mockImplementationOnce(() => new Promise<string>((r) => (finishTail = r)));
    t.remote.set("p1", agent("ra", 1)); // l1 が送り始める（画面の読み取りが遅い）
    await flush();
    t.advance(ASSUMED_BUSY_MS + 1000); // 読み取りの途中で 5 秒を過ぎる
    t.remote.set("p2", agent("rb", 1)); // l2 が発火。先はまだ作業中とみなす
    await flush();
    expect(t.local.prompts).toEqual([]);
    expect(t.reasons()).toEqual(["l2:waiting"]);
    finishTail("遅い画面");
    await flush();
    expect(t.local.prompts).toHaveLength(1);
    t.advance(ASSUMED_BUSY_MS - 1); // 送り終えてから 5 秒までは待つ
    await flush();
    expect(t.local.prompts).toHaveLength(1);
    t.advance(1);
    await flush();
    expect(t.local.prompts).toHaveLength(2);
  });

  it("送らずに終えた（resolved 等）なら、送り始めから 5 秒で今までどおり戻す", async () => {
    const approval: GraphLink = {
      id: "l1",
      kind: "approval",
      from: L1,
      to: R1,
      approval: { mode: "notify", lines: 5 },
      limit: 10,
      count: 0,
      paused: null,
    };
    const t = setup([approval, trigger("l2", L2, R1)]);
    let finishTail!: (v: string) => void;
    t.local.tail.mockImplementationOnce(() => new Promise<string>((r) => (finishTail = r)));
    t.local.set("p1", agent("la", 0, "working"));
    t.local.set("p1", agent("la", 0, "blocked"));
    t.advance(BLOCKED_HOLD_MS);
    await flush();
    t.local.set("p2", agent("lb", 1)); // 待つ
    t.store.set({ ...t.store.graph, links: [trigger("l2", L2, R1)] }); // 承認の代理の線を消す（送らずに終える）
    finishTail("x");
    await flush();
    expect(t.remote.prompts).toEqual([]);
    t.advance(ASSUMED_BUSY_MS);
    await flush();
    expect(t.remote.prompts).toHaveLength(1);
  });
});

describe("GraphEngine — 別のマシンの監督役（04）", () => {
  const supervise = (id: string, from: NodeKey, to: NodeKey): GraphLink => ({
    id,
    kind: "supervise",
    from,
    to,
    limit: 10,
    count: 0,
    paused: null,
  });

  it("監督役が別のマシンなら、そこへ知らせる。配下のマシンは監督役から見た呼び名（同じマシンは手元・手元のサーバは localLabel）", async () => {
    const t = setup([supervise("l1", L1, R1), supervise("l2", R2, R1)]);
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.remote.prompts).toHaveLength(1);
    const text = t.remote.prompts[0]![1];
    expect(text).toContain("l-p1（pane p1・claude・マシン desk）");
    expect(text).toContain("r-p2（pane p2・claude・手元）");
  });

  it("監督役のマシンが切れている間は知らせず、繋がったら知らせる。繋ぎ直しても・エージェントが入れ替わっても知らせ直さない", async () => {
    const t = setup([]);
    t.remote.setUp(false);
    t.store.set(graphOf([supervise("l1", L1, R1)]));
    t.advance(SUPERVISOR_DEBOUNCE_MS * 2);
    await flush();
    expect(t.runs()).toEqual([]);
    t.remote.setUp(true);
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.remote.prompts).toHaveLength(1);

    t.advance(ASSUMED_BUSY_MS);
    t.remote.setUp(false);
    t.remote.setUp(true);
    t.advance(SUPERVISOR_DEBOUNCE_MS * 2);
    await flush();
    expect(t.remote.prompts).toHaveLength(1);
    // 入れ替わっても知らせ直さない（pane に残った古い配下の知らせを、新しいエージェントに送らない）
    t.remote.setUp(false);
    t.remote.agents.set("p1", agent("ra2", 0));
    t.remote.setUp(true);
    t.advance(SUPERVISOR_DEBOUNCE_MS * 2);
    await flush();
    expect(t.remote.prompts).toHaveLength(1);
  });

  it("知らせの送信で切れていた（machine_unavailable）なら、失敗を残さず繋がったときに送り直す", async () => {
    const t = setup([supervise("l1", L1, R1)]);
    t.remote.failWith = new AgentPortError("machine_unavailable", "down");
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.runs()).toEqual([]);
    t.remote.failWith = null;
    t.advance(ASSUMED_BUSY_MS);
    await flush();
    expect(t.remote.prompts).toHaveLength(2);
    expect(t.reasons()).toEqual(["l1:sent"]);
  });

  it("知らせの途中で接続が切れた（connection_closed。届いたか分からない）なら、失敗を残さず繋がった後に知らせ直す（g04 点検）", async () => {
    const t = setup([supervise("l1", L1, R1)]);
    t.remote.failWith = new AgentPortError("connection_closed", "connection closed");
    t.advance(SUPERVISOR_DEBOUNCE_MS);
    await flush();
    expect(t.runs()).toEqual([]);
    t.remote.failWith = null;
    t.remote.setUp(false);
    t.remote.setUp(true);
    t.advance(ASSUMED_BUSY_MS);
    await flush();
    expect(t.remote.prompts).toHaveLength(2);
    expect(t.reasons()).toEqual(["l1:sent"]);
  });
});
