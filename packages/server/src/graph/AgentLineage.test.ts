import { describe, expect, it, vi } from "vitest";
import type { AgentInfo, ServerEvent } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";
import { AgentLineage } from "./AgentLineage.js";

// 20261003-graph-auto-nodes T3：状態と購読（attach は差し替え）。
const agentInfo: AgentInfo = {
  instanceId: "i1",
  kind: "claude",
  label: "Claude",
  state: "idle",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
};

function logger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function setup(existing: string[] = ["p1", "p2", "p3", "p4"]) {
  const bus = new EventBus();
  const live = new Set(existing);
  const calls: [string, string][] = [];
  const log = logger();
  const attach = vi.fn((c: string, p: string) => {
    calls.push([c, p]);
  });
  const lineage = new AgentLineage({
    bus,
    store: { get: vi.fn(), update: vi.fn() } as never,
    paneExists: (id) => live.has(id),
    logger: log,
    attach,
  });
  const detect = (paneId: string, agent: AgentInfo | null = agentInfo) =>
    bus.publish({ event: "pane.agent_status_changed", data: { paneId, agent } } as ServerEvent);
  const close = (paneId: string) => {
    live.delete(paneId);
    bus.publish({ event: "pane.closed", data: { paneId } } as ServerEvent);
  };
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));
  return { bus, live, calls, log, attach, lineage, detect, close, tick };
}

describe("AgentLineage", () => {
  it("作った pane に検出されると、作った人を親にして応答の後で 1 回呼ぶ", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.detect("p2");
    expect(s.calls).toEqual([]); // 同期には呼ばない
    await s.tick();
    expect(s.calls).toEqual([["p2", "p1"]]);
  });

  it("agent start を打った pane が、作った人に勝つ（AC3）", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.lineage.noteStarted("p2", "p3");
    s.detect("p2");
    await s.tick();
    expect(s.calls).toEqual([["p2", "p3"]]);
  });

  it("再検出・入れ替わりでは 2 回目を呼ばない", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.detect("p2");
    s.detect("p2");
    s.detect("p2", null);
    s.detect("p2", { ...agentInfo, instanceId: "i2" });
    await s.tick();
    expect(s.calls).toHaveLength(1);
  });

  it("呼び出し元なし・実在しない・自分自身なら何もしない（AC4）", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", undefined);
    s.lineage.noteStarted("p2", undefined);
    s.lineage.noteCreated("p3", "p9");
    s.lineage.noteStarted("p4", "p4");
    s.detect("p2");
    s.detect("p3");
    s.detect("p4");
    await s.tick();
    expect(s.calls).toEqual([]);
  });

  it("エージェントが null の通知では呼ばない", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.detect("p2", null);
    await s.tick();
    expect(s.calls).toEqual([]);
  });

  it("親が分からない検出は印を付けず、後で親が分かった 2 回目の検出で呼ぶ", async () => {
    const s = setup();
    s.detect("p2");
    s.lineage.noteStarted("p2", "p1");
    s.detect("p2");
    await s.tick();
    expect(s.calls).toEqual([["p2", "p1"]]);
  });

  it("検出の前に pane が閉じると記録が消え、呼ばない（AC10）", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.close("p2");
    s.detect("p2");
    await s.tick();
    expect(s.calls).toEqual([]);
  });

  it("pane.closed で attempted も消える（同じ ID は再利用されないが記録は残さない）", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.detect("p2");
    await s.tick();
    s.close("p2");
    s.live.add("p2");
    s.lineage.noteCreated("p2", "p1");
    s.detect("p2");
    await s.tick();
    expect(s.calls).toHaveLength(2);
  });

  it("親が閉じても子の記録は消さない（載せる側で弾く）", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.close("p1");
    s.detect("p2");
    await s.tick();
    expect(s.calls).toEqual([["p2", "p1"]]);
  });

  it("forgetStart は別の親の取り消しでは消えない", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.lineage.noteStarted("p2", "p3");
    s.lineage.forgetStart("p2", "p4");
    s.detect("p2");
    await s.tick();
    expect(s.calls).toEqual([["p2", "p3"]]);
  });

  it("forgetStart はその親の記録を消し、created の親に戻る", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.lineage.noteStarted("p2", "p3");
    s.lineage.forgetStart("p2", "p3");
    s.detect("p2");
    await s.tick();
    expect(s.calls).toEqual([["p2", "p1"]]);
  });

  it("入口の中で同期の例外が出ても握ってログし、ほかの購読者に影響しない", () => {
    const bus = new EventBus();
    const log = logger();
    const lineage = new AgentLineage({
      bus,
      store: { get: vi.fn(), update: vi.fn() } as never,
      paneExists: () => true,
      logger: log,
      attach: vi.fn(),
    });
    // 親の ID の取り出しで落とす: pane.closed のデータが壊れていても他へ伝えない。
    const sibling = vi.fn();
    bus.subscribe(sibling); // 後ろの購読者（入口の例外で止まらないこと）
    expect(() =>
      bus.publish({ event: "pane.closed", data: null } as unknown as ServerEvent),
    ).not.toThrow();
    expect(log.warn).toHaveBeenCalled();
    expect(sibling).toHaveBeenCalledTimes(1);
    lineage.close();
  });

  it("attach が投げても握ってログし、他の pane の処理は続く", async () => {
    const s = setup();
    s.attach.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    s.lineage.noteCreated("p2", "p1");
    s.lineage.noteCreated("p3", "p1");
    s.detect("p2");
    s.detect("p3");
    await s.tick();
    expect(s.attach).toHaveBeenCalledTimes(2);
    expect(s.log.warn).toHaveBeenCalledWith(
      "graph.auto: failed",
      expect.objectContaining({ child: "p2", parent: "p1" }),
    );
  });

  it("close の後は購読も記録もしない", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.lineage.close();
    s.detect("p2");
    s.lineage.noteCreated("p3", "p1");
    s.detect("p3");
    await s.tick();
    expect(s.calls).toEqual([]);
  });

  it("検出の後に close すると、まだ走っていない attach は呼ばない", async () => {
    const s = setup();
    s.lineage.noteCreated("p2", "p1");
    s.detect("p2");
    s.lineage.close();
    await s.tick();
    expect(s.calls).toEqual([]);
  });
});
