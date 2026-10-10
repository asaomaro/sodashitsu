import type { AccountUsage, AgentUsage, AgentUsageChangedEvent, AgentUsageResult } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsageFeed, USAGE_FEED_INTERVAL_MS } from "./UsageFeed.js";

const usage = (paneId: string, output: number): AgentUsage => ({ paneId, kind: "claude", model: "m", tokens: { basis: "transcript", output }, source: "transcript", updatedAt: 1000 + output });
const acct = (pct: number): AccountUsage => ({ kind: "claude", accountKey: "k", label: "Claude Code", windows: [{ label: "5 時間", usedPct: pct }], source: "statusline", asOf: 1 });

function make(initial: AgentUsageResult = { panes: {}, accounts: [] }) {
  let result = initial;
  const get = vi.fn(async (): Promise<AgentUsageResult> => result);
  const published: AgentUsageChangedEvent[] = [];
  const feed = new UsageFeed({ usage: { get }, publish: (e) => published.push(e), logger: { debug: () => undefined } });
  return { feed, get, published, set: (r: AgentUsageResult) => (result = r) };
}

afterEach(() => vi.useRealTimers());

describe("UsageFeed（20261010-agent-usage PR3 の AC2）", () => {
  it("見ている接続が居ない間は、タイマーも確かめも無い。居る間だけ動き、全員が居なくなったら止まる（タイマーが残らない）", async () => {
    vi.useFakeTimers();
    const { feed, get } = make();
    expect(feed.running).toBe(false);
    vi.advanceTimersByTime(USAGE_FEED_INTERVAL_MS * 3);
    expect(get).not.toHaveBeenCalled();
    feed.setWatching("a", true);
    feed.setWatching("b", true);
    expect(feed.running).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(USAGE_FEED_INTERVAL_MS);
    expect(get).toHaveBeenCalledTimes(1);
    feed.setWatching("a", false);
    expect(feed.running).toBe(true); // b が居る
    feed.clientGone("b"); // 接続が切れた
    expect(feed.running).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(USAGE_FEED_INTERVAL_MS * 3);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("変わった pane だけを配る。変わっていなければ配らない。取れなくなったものは null", async () => {
    const { feed, published, set } = make({ panes: { p1: usage("p1", 1), p2: usage("p2", 2) }, accounts: [] });
    feed.setWatching("a", true);
    await feed.tick();
    expect(published).toHaveLength(1);
    expect(Object.keys(published[0]!.data.panes).sort()).toEqual(["p1", "p2"]);
    expect(published[0]!.data.accounts).toBeUndefined(); // 無いまま
    await feed.tick();
    expect(published).toHaveLength(1); // 変化なし
    set({ panes: { p1: usage("p1", 1), p2: usage("p2", 9) }, accounts: [acct(40)] });
    await feed.tick();
    expect(published).toHaveLength(2);
    expect(published[1]!.data.panes).toEqual({ p2: usage("p2", 9) });
    expect(published[1]!.data.accounts).toEqual([acct(40)]);
    set({ panes: { p2: usage("p2", 9) }, accounts: [acct(40)] });
    await feed.tick();
    expect(published[2]!.data).toEqual({ panes: { p1: null } });
    feed.close();
  });

  it("前の確かめが終わるまで、次を始めない（読む仕事が重ならない）", async () => {
    let release: (() => void) | undefined;
    const get = vi.fn(() => new Promise<AgentUsageResult>((r) => (release = () => r({ panes: {}, accounts: [] }))));
    const feed = new UsageFeed({ usage: { get }, publish: () => undefined, logger: { debug: () => undefined } });
    feed.setWatching("a", true);
    const first = feed.tick();
    await feed.tick();
    await feed.tick();
    expect(get).toHaveBeenCalledTimes(1);
    release?.();
    await first;
    const second = feed.tick();
    expect(get).toHaveBeenCalledTimes(2);
    release?.();
    await second;
    feed.close();
  });

  it("止めて始め直したら、全部を配り直す。止めている間に終わった確かめの答えは配らない", async () => {
    let resolveGet: ((r: AgentUsageResult) => void) | undefined;
    const results: AgentUsageResult[] = [];
    const get = vi.fn(
      () =>
        new Promise<AgentUsageResult>((r) => {
          resolveGet = r;
        }),
    );
    const published: AgentUsageChangedEvent[] = [];
    const feed = new UsageFeed({ usage: { get }, publish: (e) => published.push(e), logger: { debug: () => undefined } });
    feed.setWatching("a", true);
    const t = feed.tick();
    feed.clientGone("a"); // 確かめの途中で、見ている接続が居なくなった
    resolveGet?.({ panes: { p1: usage("p1", 1) }, accounts: [] });
    await t;
    expect(published).toHaveLength(0);
    results.length = 0;
    feed.setWatching("b", true);
    const t2 = feed.tick();
    resolveGet?.({ panes: { p1: usage("p1", 1) }, accounts: [] });
    await t2;
    expect(published).toHaveLength(1); // 控えを捨てたので、全部を配る
    feed.close();
  });

  it("読みが投げても落ちず、次の回に続く。close の後は何も始まらない", async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ panes: { p1: usage("p1", 1) }, accounts: [] });
    const published: AgentUsageChangedEvent[] = [];
    const feed = new UsageFeed({ usage: { get }, publish: (e) => published.push(e), logger: { debug: () => undefined } });
    feed.setWatching("a", true);
    await feed.tick();
    expect(published).toHaveLength(0);
    await feed.tick();
    expect(published).toHaveLength(1);
    feed.close();
    expect(feed.running).toBe(false);
    feed.setWatching("a", true);
    expect(feed.running).toBe(false);
    await feed.tick();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
