import type { AgentInfo, ServerEvent } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../bus/EventBus.js";
import { detectedAgent, handsFree, waitForAgent, waitForShellReady } from "./agentWait.js";

const agent = (state: AgentInfo["state"], over: Partial<AgentInfo> = {}): AgentInfo => ({ instanceId: "i1", kind: "claude", label: "c", state, completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0, ...over });
const status = (paneId: string, a: AgentInfo | null): ServerEvent => ({ event: "pane.agent_status_changed", data: { paneId, agent: a } });

describe("waitForAgent", () => {
  it("今の状態で足りれば、すぐ返る", async () => {
    const bus = new EventBus();
    const r = await waitForAgent({ bus, agentOf: () => agent("idle") }, "p1", handsFree("i1"), 1000);
    expect(r).toMatchObject({ ok: true, value: { kind: "free" } });
  });
  it("できごとを聞いて待つ。working の間は待ち、idle で返る。別の pane のできごとは見ない", async () => {
    const bus = new EventBus();
    let current: AgentInfo | null = agent("working");
    const p = waitForAgent({ bus, agentOf: () => current }, "p1", handsFree("i1"), 5000);
    bus.publish(status("p2", agent("idle")));
    current = agent("idle");
    bus.publish(status("p1", current));
    expect(await p).toMatchObject({ ok: true, value: { kind: "free" } });
  });
  it("blocked は終わりにせず、替わるたびに onBlocked を呼んで待ち続ける（A8）", async () => {
    const bus = new EventBus();
    const calls: boolean[] = [];
    let current: AgentInfo | null = agent("blocked");
    const p = waitForAgent({ bus, agentOf: () => current }, "p1", handsFree("i1", (b) => calls.push(b)), 5000);
    bus.publish(status("p1", agent("blocked"))); // 同じ状態では呼ばない
    current = agent("idle");
    bus.publish(status("p1", current));
    expect(await p).toMatchObject({ ok: true });
    expect(calls).toEqual([true, false]);
  });
  it("別の instanceId に入れ替わったら gone", async () => {
    const bus = new EventBus();
    const p = waitForAgent({ bus, agentOf: () => agent("working") }, "p1", handsFree("i1"), 5000);
    bus.publish(status("p1", agent("idle", { instanceId: "other" })));
    expect(await p).toMatchObject({ ok: true, value: { kind: "gone" } });
  });
  it("上限で timeout、pane が閉じたら pane_closed、中断で aborted。購読は残らない", async () => {
    vi.useFakeTimers();
    try {
      const bus = new EventBus();
      const deps = { bus, agentOf: () => agent("working") as AgentInfo | null | undefined };
      const t = waitForAgent(deps, "p1", handsFree("i1"), 1000);
      await vi.advanceTimersByTimeAsync(1001);
      expect(await t).toEqual({ ok: false, reason: "timeout" });
      const c = waitForAgent(deps, "p1", handsFree("i1"), 1000);
      bus.publish({ event: "pane.closed", data: { paneId: "p1" } });
      expect(await c).toEqual({ ok: false, reason: "pane_closed" });
      const ac = new AbortController();
      const a = waitForAgent(deps, "p1", handsFree("i1"), 1000, ac.signal);
      ac.abort();
      expect(await a).toEqual({ ok: false, reason: "aborted" });
      expect(await waitForAgent({ bus, agentOf: () => undefined }, "p1", handsFree("i1"), 1000)).toEqual({ ok: false, reason: "pane_closed" });
      // @ts-expect-error 購読の数を直接見る（listeners は private）
      expect(bus.listeners.size).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("detectedAgent: 種類が合えば detected、違えば kind_mismatch、居なければ待つ", () => {
    expect(detectedAgent("claude")(null)).toBeUndefined();
    expect(detectedAgent("claude")(agent("idle"))).toMatchObject({ kind: "detected" });
    expect(detectedAgent("claude")(agent("idle", { kind: "codex" }))).toEqual({ kind: "kind_mismatch", found: "codex" });
  });
});

describe("waitForShellReady（作ったばかりの pane の入力待ち。A2）", () => {
  it("出力が 300ms 静まり、シェルだけになったら true", async () => {
    vi.useFakeTimers();
    try {
      const host = { out: 0, lastOutputAt: () => host.out };
      let avail = false;
      const start = Date.now();
      host.out = start; // 作った直後に出力があった
      const p = waitForShellReady(host, async () => avail, { minWaitMs: 2000 });
      await vi.advanceTimersByTimeAsync(100);
      host.out = Date.now() + 1; // 出力が続く
      await vi.advanceTimersByTimeAsync(400);
      avail = true;
      await vi.advanceTimersByTimeAsync(400);
      expect(await p).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it("上限（5 秒）で false（呼ぶ側が fork_shell_not_ready にする）", async () => {
    vi.useFakeTimers();
    try {
      const host = { lastOutputAt: () => Date.now() }; // いつも出力している
      const p = waitForShellReady(host, async () => true, { maxMs: 5000 });
      await vi.advanceTimersByTimeAsync(5200);
      expect(await p).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("最初の出力がまだ無い間は、minWait までは『静か』とみなさない（rc の読み込みが重いシェル）", async () => {
    vi.useFakeTimers();
    try {
      const t0 = Date.now();
      const host = { lastOutputAt: () => t0 };
      const p = waitForShellReady(host, async () => true, { minWaitMs: 2000 });
      await vi.advanceTimersByTimeAsync(1000);
      let settled = false;
      void p.then(() => (settled = true));
      await vi.advanceTimersByTimeAsync(10);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1200);
      expect(await p).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
