import type { AgentInfo, Pane } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentPortError, type AgentStatusEvent } from "./AgentPort.js";
import { RemoteLinks } from "./RemoteLinks.js";
import { REMOTE_TAIL_MAX_LINES, tailOfSnapshot } from "./RemoteAgentPort.js";
import { FakeMachines, remoteSnapshot } from "./fakeLinkChannel.js";

// 20260927-agent-graph の 04 T2：別のマシンの pane への口（偽のチャネルの上）。
const M = "a".repeat(32);

function agent(
  instanceId: string,
  completionSeq: number,
  state: AgentInfo["state"] = "idle",
): AgentInfo {
  return {
    instanceId,
    kind: "claude",
    label: "Claude",
    state,
    completionSeq,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
  } as AgentInfo;
}

function pane(id: string, over: Partial<Pane> = {}): Pane {
  return {
    id,
    tabId: "t1",
    label: null,
    cwd: "/",
    shell: "bash",
    cols: 80,
    rows: 24,
    status: "running",
    failure: null,
    busy: false,
    title: "",
    rightClick: "app",
    agent: null,
    agentSession: null,
    ...over,
  } as Pane;
}

const tick = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

describe("tailOfSnapshot", () => {
  it("末尾の空行を除いてから n 行。制御文字を落とす。代替画面なら代替画面の中身から", () => {
    expect(tailOfSnapshot("a\r\nb\r\n\x1b[31mc\x1b[0m\r\n\r\n   \r\n", 2)).toBe("b\nc");
    expect(tailOfSnapshot("old1\r\nold2\x1b[?1049hscreen1\r\nscreen2", 5)).toBe("screen1\nscreen2");
    expect(tailOfSnapshot("", 3)).toBe("");
  });
});

describe("RemoteAgentPort", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const fn of cleanups.splice(0)) fn();
    vi.useRealTimers();
  });

  async function setup(panes: Pane[] = [pane("p1", { agent: agent("i1", 3), label: "impl" })]) {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const machines = new FakeMachines([{ id: M, label: "box" }]);
    const links = new RemoteLinks({ machines });
    cleanups.push(() => links.closeAll());
    links.ensure([M]);
    const port = links.port(M)!;
    const statuses: AgentStatusEvent[] = [];
    const avail: { up: boolean; status: AgentInfo | null }[] = [];
    port.onStatus((e) => statuses.push(e));
    // 知らせの時点で status が今の値（基準）になっていること
    port.onAvailability((up) => avail.push({ up, status: port.status("p1") }));
    await tick();
    expect(port.available()).toBe(false);
    expect(port.status("p1")).toBeNull();
    machines.last().hello(remoteSnapshot(panes));
    await tick();
    return { machines, links, port, statuses, avail, ch: () => machines.last() };
  }

  it("hello の snapshot で pane とエージェントを持ち、使えるようになったことを（status を当ててから）知らせる。呼び名・マシンの呼び名", async () => {
    const { port, avail } = await setup();
    expect(port.machine).toBe(M);
    expect(port.available()).toBe(true);
    expect(avail).toEqual([{ up: true, status: agent("i1", 3) }]);
    expect(port.status("p1")).toEqual(agent("i1", 3));
    expect(port.status("p9")).toBeNull();
    expect(port.paneName("p1")).toBe("impl");
    expect(port.paneName("p9")).toBeNull();
    expect(port.machineLabel()).toBe("box");
  });

  it("状態の知らせ（agent_status_changed・closed）を渡し、pane の作成・更新は呼び名だけ変える", async () => {
    const { port, statuses, ch } = await setup();
    ch().event("pane.agent_status_changed", { paneId: "p1", agent: agent("i1", 4) });
    ch().event("pane.updated", { pane: pane("p1", { label: "renamed", agent: agent("i1", 4) }) });
    ch().event("pane.created", { pane: pane("p2") });
    ch().event("pane.closed", { paneId: "p1" });
    ch().event("workspace.closed", { workspaceId: "w1" });
    expect(statuses).toEqual([
      { paneId: "p1", agent: agent("i1", 4) },
      { paneId: "p1", agent: null },
    ]);
    expect(port.paneName("p2")).toBe("pane p2");
    expect(port.status("p1")).toBeNull();
  });

  it("切れたら使えなくなり status は null（呼び名は残る）。繋ぎ直しの snapshot を基準として知らせる（切れている間の完了のイベントは来ない）", async () => {
    const { port, avail, statuses, machines } = await setup();
    machines.setOnline(M, false);
    machines.last().remoteClose(1012);
    await tick();
    expect(port.available()).toBe(false);
    expect(port.status("p1")).toBeNull();
    expect(port.paneName("p1")).toBe("impl");
    await expect(port.prompt("p1", "x")).rejects.toMatchObject({ code: "machine_unavailable" });
    await expect(port.tail("p1", 5)).rejects.toMatchObject({ code: "machine_unavailable" });

    machines.setOnline(M, true);
    await tick();
    // 切れている間に 2 回完了していた
    machines
      .last()
      .hello(remoteSnapshot([pane("p1", { agent: agent("i1", 5), label: "impl" })]), "c2");
    await tick();
    expect(avail).toEqual([
      { up: true, status: agent("i1", 3) },
      { up: false, status: null },
      { up: true, status: agent("i1", 5) },
    ]);
    expect(statuses).toEqual([]); // 完了は状態の知らせとしては来ない（基準として読むだけ）
  });

  it("prompt はリモートの agent.prompt。失敗は code つきの AgentPortError、途中で切れたら connection_closed", async () => {
    const { port, ch } = await setup();
    const ok = port.prompt("p1", "hello");
    const req = ch().lastRequest("agent.prompt")!;
    expect(req.params).toEqual({ paneId: "p1", text: "hello" });
    ch().reply(req.id, { agent: agent("i1", 3) });
    await expect(ok).resolves.toBeUndefined();

    const blocked = port.prompt("p1", "x");
    ch().replyError(ch().lastRequest("agent.prompt")!.id, "agent_blocked", "blocked now");
    const err = await blocked.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentPortError);
    expect(err).toMatchObject({ code: "agent_blocked", message: "blocked now" });

    const cut = port.prompt("p1", "y");
    ch().remoteClose(1012);
    await expect(cut).rejects.toMatchObject({ code: "connection_closed" });
  });

  it("tail は pane.subscribe（行数ぶんのスクロールバック）→ SNAPSHOT の末尾 → pane.unsubscribe。行数は 500 まで", async () => {
    const { port, ch } = await setup();
    const p = port.tail("p1", 2);
    await tick();
    const sub = ch().lastRequest("pane.subscribe")!;
    expect(sub.params).toEqual({ paneId: "p1", scrollbackLines: 2 });
    ch().snapshotFrame("p2", "other"); // 別の pane の画面は使わない
    ch().snapshotFrame("p1", "l1\r\nl2\r\nl3\r\n");
    await expect(p).resolves.toBe("l2\nl3");
    expect(ch().lastRequest("pane.unsubscribe")!.params).toEqual({ paneId: "p1" });
    ch().reply(ch().lastRequest("pane.unsubscribe")!.id, {});

    const big = port.tail("p1", 10_000);
    await tick();
    expect(ch().lastRequest("pane.subscribe")!.params.scrollbackLines).toBe(REMOTE_TAIL_MAX_LINES);
    ch().snapshotFrame("p1", "x");
    await expect(big).resolves.toBe("x");
  });

  it("tail は 5 秒で打ち切り（tail_timeout）、購読を外す。同じ pane の読み取りは 1 本ずつ。途中で切れたら machine_unavailable", async () => {
    const { port, ch, machines } = await setup();
    const first = port.tail("p1", 3).catch((e: unknown) => e);
    const second = port.tail("p1", 3);
    await tick();
    expect(
      ch()
        .requests()
        .filter((r) => r.method === "pane.subscribe"),
    ).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4999);
    expect(ch().lastRequest("pane.unsubscribe")).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toMatchObject({ code: "tail_timeout" });
    expect(ch().lastRequest("pane.unsubscribe")).toBeDefined();
    ch().reply(ch().lastRequest("pane.unsubscribe")!.id, {}); // 外し終えてから次の読み取り
    await tick();
    expect(
      ch()
        .requests()
        .filter((r) => r.method === "pane.subscribe"),
    ).toHaveLength(2);
    ch().snapshotFrame("p1", "done");
    await expect(second).resolves.toBe("done");

    const cut = port.tail("p1", 3);
    await tick();
    machines.last().remoteClose(1012);
    await expect(cut).rejects.toMatchObject({ code: "machine_unavailable" });
  });

  it("購読が断られたら（pane が無い）その code で失敗する", async () => {
    const { port, ch } = await setup();
    const p = port.tail("p9", 3);
    await tick();
    ch().replyError(ch().lastRequest("pane.subscribe")!.id, "not_found", "pane not found: p9");
    await expect(p).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("RemoteAgentPort（g04 点検）", () => {
  afterEach(() => vi.useRealTimers());

  it("時間切れの読み取りの購読を外し終えるまで次の読み取りを始めず、遅れて届いた古い SNAPSHOT を次の読み取りに使わない", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const machines = new FakeMachines([{ id: M, label: "box" }]);
    const links = new RemoteLinks({ machines });
    links.ensure([M]);
    await tick();
    const ch = machines.last();
    ch.hello(remoteSnapshot([pane("p1", { agent: agent("i1", 3) })]));
    await tick();
    const port = links.port(M)!;
    const first = port.tail("p1", 3).catch((e: unknown) => e);
    await tick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await first).toMatchObject({ code: "tail_timeout" });
    const second = port.tail("p1", 3);
    await tick();
    expect(ch.requests().filter((r) => r.method === "pane.subscribe")).toHaveLength(1);
    ch.snapshotFrame("p1", "OLD"); // 前の購読の遅れた画面
    ch.reply(ch.lastRequest("pane.unsubscribe")!.id, {});
    await tick();
    expect(ch.requests().filter((r) => r.method === "pane.subscribe")).toHaveLength(2);
    ch.snapshotFrame("p1", "NEW");
    await expect(second).resolves.toBe("NEW");
    links.closeAll();
  });
});
