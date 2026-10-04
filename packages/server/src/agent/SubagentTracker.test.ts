import { beforeEach, describe, expect, it } from "vitest";
import type { AgentInfo } from "@sodashitsu/protocol";
import { EventBus } from "../bus/EventBus.js";
import { MemoryLogger } from "../log/Logger.js";
import type { AgentReport } from "./AgentReportSocket.js";
import { SubagentTracker, type Subagents } from "./SubagentTracker.js";

type Report = Exclude<AgentReport, { type: "session" }>;
const base = { paneId: "p1", kind: "claude", sessionId: "s1" };

describe("SubagentTracker（数える部分）", () => {
  let clock: number;
  let logger: MemoryLogger;
  let tracker: SubagentTracker;
  let bus: EventBus;
  /** 手で進めるタイマー。 */
  let timers: Map<number, { at: number; fn: () => void }>;
  let nextTimer: number;
  /** pane → 今検出されているエージェントの instanceId（`agentInstanceOf` の答え）。 */
  let detected: Map<string, string>;
  /** 閉じた pane（`paneExists` が偽を返す）。 */
  let gone: Set<string>;
  let published: { paneId: string; value: Subagents | undefined }[];
  let publishResult: boolean;
  // 項目は報告ごとに違うので、テストでは緩い型で渡す（ほかの項目は上の `base`）。
  const rep = (r: {
    type: Report["type"];
    paneId?: string;
    sessionId?: string;
    [k: string]: unknown;
  }) => tracker.report({ ...base, ...r } as Report);
  const ids = (paneId = "p1") => tracker.current(paneId)?.items.map((i) => i.id);

  beforeEach(() => {
    clock = 1_000_000;
    logger = new MemoryLogger();
    bus = new EventBus();
    timers = new Map();
    nextTimer = 1;
    detected = new Map();
    gone = new Set();
    published = [];
    publishResult = true;
    tracker = new SubagentTracker({
      bus,
      agentInstanceOf: (paneId) => detected.get(paneId) ?? null,
      paneExists: (paneId) => !gone.has(paneId),
      publish: (paneId, value) => {
        published.push({ paneId, value });
        return publishResult;
      },
      now: () => clock,
      setTimer: (fn, ms) => {
        const id = nextTimer++;
        timers.set(id, { at: clock + ms, fn });
        return id;
      },
      clearTimer: (h) => void timers.delete(h as number),
      logger,
    });
  });

  /** 時計を進め、期限が来たタイマーを順に動かす。 */
  const advance = (ms: number) => {
    clock += ms;
    for (const [id, t] of [...timers]) {
      if (t.at <= clock && timers.delete(id)) t.fn();
    }
  };
  const detect = (paneId: string, instanceId: string | null) => {
    if (instanceId === null) detected.delete(paneId);
    else detected.set(paneId, instanceId);
    bus.publish({
      event: "pane.agent_status_changed",
      data: { paneId, agent: instanceId === null ? null : ({ instanceId } as AgentInfo) },
    });
  };

  it("報告を受けていない pane は undefined（分からない）。受ければ 0 件でも持つ", () => {
    expect(tracker.current("p1")).toBeUndefined();
    rep({ type: "session_end" });
    expect(tracker.current("p1")).toEqual({ count: 0, items: [] });
  });

  it("起動で増え、終了で減る。起動した順に並ぶ", () => {
    rep({ type: "subagent_start", agentId: "a1" });
    clock += 5;
    rep({ type: "subagent_start", agentId: "a2", agentType: "Plan" });
    expect(tracker.current("p1")).toEqual({
      count: 2,
      items: [
        { id: "a1", startedAt: 1_000_000 },
        { id: "a2", type: "Plan", startedAt: 1_000_005 },
      ],
    });
    rep({ type: "subagent_stop", agentId: "a1" });
    expect(ids()).toEqual(["a2"]);
  });

  it("同じ ID の起動は 1 件のまま（startedAt も変えない）", () => {
    rep({ type: "subagent_start", agentId: "a1" });
    clock += 100;
    rep({ type: "subagent_start", agentId: "a1" });
    expect(tracker.current("p1")).toEqual({
      count: 1,
      items: [{ id: "a1", startedAt: 1_000_000 }],
    });
  });

  it("知らない ID の終了は無視する", () => {
    rep({ type: "subagent_start", agentId: "a1" });
    rep({ type: "subagent_stop", agentId: "zzz" });
    expect(ids()).toEqual(["a1"]);
  });

  describe("実行前の報告の対応づけ", () => {
    it("直後の起動に説明・種類・background を付ける", () => {
      rep({
        type: "subagent_pending",
        description: "調べる",
        agentType: "Explore",
        background: true,
      });
      rep({ type: "subagent_start", agentId: "a1", agentType: "Explore" });
      expect(tracker.current("p1")?.items[0]).toEqual({
        id: "a1",
        type: "Explore",
        description: "調べる",
        background: true,
        startedAt: 1_000_000,
      });
    });

    it("起動の報告に種類が無ければ、実行前の種類を使う", () => {
      rep({ type: "subagent_pending", agentType: "Explore" });
      rep({ type: "subagent_start", agentId: "a1" });
      expect(tracker.current("p1")?.items[0]?.type).toBe("Explore");
    });

    it("使うのは最新の 1 件だけ（古い実行前の報告は捨てる）。取り出したら次の起動には付かない", () => {
      rep({ type: "subagent_pending", description: "古い" });
      rep({ type: "subagent_pending", description: "新しい" });
      rep({ type: "subagent_start", agentId: "a1" });
      rep({ type: "subagent_start", agentId: "a2" });
      const items = tracker.current("p1")?.items;
      expect(items?.[0]?.description).toBe("新しい");
      expect(items?.[1]?.description).toBeUndefined();
      expect(items?.[1]).not.toHaveProperty("background");
    });

    it("10 秒を過ぎたら付けない", () => {
      rep({ type: "subagent_pending", description: "遅い" });
      clock += 10_001;
      rep({ type: "subagent_start", agentId: "a1" });
      expect(tracker.current("p1")?.items[0]).not.toHaveProperty("description");
    });

    it("10 秒ちょうどなら付ける", () => {
      rep({ type: "subagent_pending", description: "ぎりぎり" });
      clock += 10_000;
      rep({ type: "subagent_start", agentId: "a1" });
      expect(tracker.current("p1")?.items[0]?.description).toBe("ぎりぎり");
    });

    it("種類が食い違うときは付けない（実行前の報告は残る）", () => {
      rep({ type: "subagent_pending", description: "d", agentType: "Explore" });
      rep({ type: "subagent_start", agentId: "a1", agentType: "Plan" });
      expect(tracker.current("p1")?.items[0]).not.toHaveProperty("description");
      rep({ type: "subagent_start", agentId: "a2", agentType: "Explore" });
      expect(tracker.current("p1")?.items[1]?.description).toBe("d");
    });

    it("別のセッションの実行前の報告は付けない", () => {
      rep({ type: "subagent_pending", description: "s1 の説明" });
      rep({ type: "subagent_start", agentId: "a1", sessionId: "s2" });
      expect(tracker.current("p1")?.items[0]).not.toHaveProperty("description");
    });
  });

  describe("256 件の上限", () => {
    it("pane の合計が 256 件に達したら数えない。ログは pane ごとに 1 回", () => {
      for (let i = 0; i < 300; i++) rep({ type: "subagent_start", agentId: `a${i}` });
      const cur = tracker.current("p1");
      expect(cur?.count).toBe(256);
      expect(cur?.items).toHaveLength(64);
      expect(logger.lines.filter((l) => l.level === "warn")).toHaveLength(1);
      for (let i = 0; i < 300; i++) rep({ type: "subagent_start", agentId: `b${i}`, paneId: "p2" });
      expect(logger.lines.filter((l) => l.level === "warn")).toHaveLength(2);
    });

    it("複数のセッションの合計で数える", () => {
      for (let i = 0; i < 200; i++) rep({ type: "subagent_start", agentId: `a${i}` });
      for (let i = 0; i < 100; i++)
        rep({ type: "subagent_start", agentId: `b${i}`, sessionId: "s2" });
      expect(tracker.current("p1")?.count).toBe(256);
    });

    it("終了で空きができれば、また数える", () => {
      for (let i = 0; i < 256; i++) rep({ type: "subagent_start", agentId: `a${i}` });
      rep({ type: "subagent_stop", agentId: "a0" });
      rep({ type: "subagent_start", agentId: "new" });
      expect(tracker.current("p1")?.count).toBe(256);
      expect(tracker.current("p1")?.items.map((i) => i.id)).not.toContain("a0");
    });
  });

  describe("作業の終わり（agent_stop）の突き合わせ", () => {
    it("running に無い ID を外し、あるものは残す", () => {
      rep({ type: "subagent_start", agentId: "a1" });
      rep({ type: "subagent_start", agentId: "a2" });
      rep({ type: "agent_stop", running: [{ id: "a2" }], truncated: false });
      expect(ids()).toEqual(["a2"]);
    });

    it("running にあって無い ID を、説明・種類・background: true で足す", () => {
      clock += 7;
      rep({
        type: "agent_stop",
        running: [{ id: "bg1", agentType: "Explore", description: "遅い調査" }],
        truncated: false,
      });
      expect(tracker.current("p1")?.items).toEqual([
        {
          id: "bg1",
          type: "Explore",
          description: "遅い調査",
          background: true,
          startedAt: 1_000_007,
        },
      ]);
    });

    it("最近終了した ID は足し直さない（60 秒を過ぎたら足す）", () => {
      rep({ type: "subagent_start", agentId: "a1" });
      rep({ type: "subagent_stop", agentId: "a1" });
      rep({ type: "agent_stop", running: [{ id: "a1" }], truncated: false });
      expect(ids()).toEqual([]);
      clock += 60_001;
      rep({ type: "agent_stop", running: [{ id: "a1" }], truncated: false });
      expect(ids()).toEqual(["a1"]);
    });

    it("起動していない ID の終了も覚える（Stop より後に届く終了と、足し直しを防ぐ）", () => {
      rep({ type: "subagent_stop", agentId: "late" });
      rep({ type: "agent_stop", running: [{ id: "late" }], truncated: false });
      expect(ids()).toEqual([]);
    });

    it("終了を覚えるのは 64 件まで（古いものから忘れる）", () => {
      for (let i = 0; i < 65; i++) rep({ type: "subagent_stop", agentId: `s${i}` });
      rep({ type: "agent_stop", running: [{ id: "s0" }, { id: "s64" }], truncated: false });
      expect(ids()).toEqual(["s0"]);
    });

    it("truncated のときは足すだけで、外さない", () => {
      rep({ type: "subagent_start", agentId: "a1" });
      rep({ type: "agent_stop", running: [{ id: "a2" }], truncated: true });
      expect(ids()).toEqual(["a1", "a2"]);
    });

    it("別のセッションの一覧には触れない", () => {
      rep({ type: "subagent_start", agentId: "x1", sessionId: "s2" });
      rep({ type: "agent_stop", running: [], truncated: false });
      expect(ids()).toEqual(["x1"]);
    });

    it("実行前の報告を空にする", () => {
      rep({ type: "subagent_pending", description: "起動に至らなかった" });
      rep({ type: "agent_stop", running: [], truncated: false });
      rep({ type: "subagent_start", agentId: "a1" });
      expect(tracker.current("p1")?.items[0]).not.toHaveProperty("description");
    });

    it("足すときも 256 件の上限に従う", () => {
      for (let i = 0; i < 256; i++) rep({ type: "subagent_start", agentId: `a${i}` });
      rep({
        type: "agent_stop",
        running: [...Array.from({ length: 256 }, (_, i) => ({ id: `a${i}` })), { id: "extra" }],
        truncated: false,
      });
      expect(tracker.current("p1")?.count).toBe(256);
      expect(tracker.current("p1")?.items.map((i) => i.id)).not.toContain("extra");
    });
  });

  describe("session_end", () => {
    it("そのセッションの分だけを捨てる", () => {
      rep({ type: "subagent_start", agentId: "a1" });
      rep({ type: "subagent_start", agentId: "b1", sessionId: "s2" });
      rep({ type: "session_end" });
      expect(ids()).toEqual(["b1"]);
    });

    it("捨てたセッションの終了の記憶も消える（同じ ID が別の機会に動いていれば足す）", () => {
      rep({ type: "subagent_stop", agentId: "a1" });
      rep({ type: "session_end" });
      rep({ type: "agent_stop", running: [{ id: "a1" }], truncated: false });
      expect(ids()).toEqual(["a1"]);
    });
  });

  it("複数のセッションの分は、起動した順に 1 つの一覧になる", () => {
    rep({ type: "subagent_start", agentId: "a1" });
    clock += 1;
    rep({ type: "subagent_start", agentId: "b1", sessionId: "s2" });
    clock += 1;
    rep({ type: "subagent_start", agentId: "a2" });
    expect(ids()).toEqual(["a1", "b1", "a2"]);
    expect(tracker.current("p1")?.count).toBe(3);
  });

  describe("終了が起動より先に届く・セッションの後始末", () => {
    it("終了の報告が先に届いた ID の起動は数えない", () => {
      rep({ type: "subagent_stop", agentId: "a1" });
      rep({ type: "subagent_start", agentId: "a1" });
      expect(ids()).toEqual([]);
    });

    it("上限で数えなかった起動も、実行前の報告を使い切る（次の起動に付けない）", () => {
      for (let i = 0; i < 256; i++) rep({ type: "subagent_start", agentId: `a${i}` });
      rep({ type: "subagent_pending", description: "溢れた分" });
      rep({ type: "subagent_start", agentId: "over" });
      for (let i = 0; i < 200; i++) rep({ type: "subagent_stop", agentId: `a${i}` }); // 一覧の先頭 64 件に載る数まで減らす
      rep({ type: "subagent_start", agentId: "next" });
      expect(tracker.current("p1")?.items.find((i) => i.id === "next")).toEqual({
        id: "next",
        startedAt: 1_000_000,
      });
    });

    it("終了の記憶は 60 秒で刈る（終了の報告だけが続いても）", () => {
      rep({ type: "subagent_stop", agentId: "old" });
      clock += 60_001;
      rep({ type: "subagent_stop", agentId: "other" });
      rep({ type: "agent_stop", running: [{ id: "old" }, { id: "other" }], truncated: false });
      expect(ids()).toEqual(["old"]);
    });

    it("期限切れの実行前の報告は捨てられ、その後の起動にも付かない", () => {
      rep({ type: "subagent_pending", description: "古い" });
      clock += 10_001;
      rep({ type: "subagent_start", agentId: "a1" });
      rep({ type: "subagent_start", agentId: "a2" });
      expect(tracker.current("p1")?.items.every((i) => i.description === undefined)).toBe(true);
    });

    it("running に agentType だけがあって description が無いとき、キーを出さない", () => {
      rep({ type: "agent_stop", running: [{ id: "a1", agentType: "Explore" }], truncated: false });
      expect(tracker.current("p1")?.items[0]).not.toHaveProperty("description");
    });

    it("startedAt が同じ ID は、受けた順に並ぶ", () => {
      for (const id of ["c", "a", "b"]) rep({ type: "subagent_start", agentId: id });
      expect(ids()).toEqual(["c", "a", "b"]);
    });

    it("中身の無いセッションの状態は残さない（空のセッションが上限の枠を使って、動いているセッションを押し出さない）", () => {
      rep({ type: "subagent_start", agentId: "keep", sessionId: "real" });
      for (let i = 0; i < 40; i++)
        rep({ type: "agent_stop", running: [], truncated: false, sessionId: `x${i}` });
      expect(ids()).toEqual(["keep"]);
    });

    it("セッションの数は 32 まで。終了の報告が来ないセッション ID が溜まっても、古いものから捨てる", () => {
      for (let i = 0; i < 40; i++)
        rep({ type: "subagent_start", agentId: `a${i}`, sessionId: `s${i}` });
      expect(tracker.current("p1")?.count).toBe(32);
      expect(ids()?.[0]).toBe("a8");
    });
  });

  it("pane ごとに分かれる", () => {
    rep({ type: "subagent_start", agentId: "a1" });
    rep({ type: "subagent_start", agentId: "z1", paneId: "p2" });
    expect(ids("p1")).toEqual(["a1"]);
    expect(ids("p2")).toEqual(["z1"]);
  });

  it("current は内部の状態を渡さない（返した値を変えても影響しない）", () => {
    rep({ type: "subagent_start", agentId: "a1" });
    const cur = tracker.current("p1");
    cur?.items.splice(0);
    expect(ids()).toEqual(["a1"]);
  });

  describe("閉じた pane への遅れた報告", () => {
    it("pane が無ければ、状態を作らずに捨てる（非同期の SessionEnd・SubagentStop が pane の後に届く）。pane があれば検出前でも持つ", () => {
      gone.add("p1");
      rep({ type: "subagent_stop", agentId: "a1" });
      rep({ type: "session_end" });
      expect(tracker.current("p1")).toBeUndefined();
      expect(timers.size).toBe(0);
      gone.delete("p1");
      rep({ type: "subagent_start", agentId: "a2" }); // 検出前でも、pane があれば持つ
      expect(ids()).toEqual(["a2"]);
    });
  });

  describe("配る（まとめ・同じ内容・検出との順序）", () => {
    it("最初の変化から 100 ミリ秒後に、その時点の値を 1 回配る（待ちは延ばさない）", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      advance(60);
      rep({ type: "subagent_start", agentId: "a2" });
      advance(39);
      expect(published).toEqual([]);
      advance(1);
      expect(published).toHaveLength(1);
      expect(published[0]?.paneId).toBe("p1");
      expect(published[0]?.value?.items.map((i) => i.id)).toEqual(["a1", "a2"]);
      advance(1000);
      expect(published).toHaveLength(1);
    });

    it("20 件を続けても、100 ミリ秒に 1 回まで", () => {
      detect("p1", "X");
      for (let i = 0; i < 20; i++) {
        rep({ type: "subagent_start", agentId: `a${i}` });
        advance(4);
      }
      expect(published).toHaveLength(0);
      advance(100);
      expect(published).toHaveLength(1);
      expect(published[0]?.value?.count).toBe(20);
    });

    it("同じ内容は配らない（配った値と同じに戻ったときも）", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      expect(published).toHaveLength(1);
      rep({ type: "subagent_start", agentId: "a1" }); // 変わらない
      rep({ type: "subagent_pending", description: "d" }); // 一覧は変わらない
      expect(timers.size).toBe(0);
      advance(1000);
      expect(published).toHaveLength(1);
      rep({ type: "subagent_start", agentId: "a2" });
      rep({ type: "subagent_stop", agentId: "a2" }); // 配る前に元へ戻った
      advance(100);
      expect(published).toHaveLength(1);
    });

    it("配る値は先頭 64 件と、実際の数", () => {
      detect("p1", "X");
      for (let i = 0; i < 100; i++) rep({ type: "subagent_start", agentId: `a${i}` });
      advance(100);
      expect(published[0]?.value?.count).toBe(100);
      expect(published[0]?.value?.items).toHaveLength(64);
    });

    it("0 件に戻ったら {count: 0, items: []} を配る", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      rep({ type: "subagent_stop", agentId: "a1" });
      advance(100);
      expect(published.at(-1)?.value).toEqual({ count: 0, items: [] });
    });

    it("配れなかった（エージェントが検出されていない）ときは、配ったことにしない", () => {
      publishResult = false;
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      expect(published).toHaveLength(1);
      publishResult = true;
      rep({ type: "subagent_start", agentId: "a2" });
      advance(100);
      expect(published).toHaveLength(2);
      expect(published[1]?.value?.count).toBe(2);
    });

    it("配れなかった値は、同じ内容の報告で再び配る対象になる（配れたときにだけ記録する）", () => {
      publishResult = false;
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      publishResult = true;
      rep({ type: "subagent_start", agentId: "a1" }); // 一覧は変わらないが、まだ配れていない
      advance(100);
      expect(published).toHaveLength(2);
      expect(published[1]?.value?.count).toBe(1);
    });

    it("検出が無いと思っていたのに配れていた値も、最初の検出で配り直す（新しい検出は subagents を持たないので）", () => {
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      expect(published).toHaveLength(1);
      detect("p1", "X");
      advance(0);
      expect(published).toHaveLength(2);
    });

    it("配れなかった値は、最初の検出（無し → X）で配り直す（検出より前の報告を失わない）", () => {
      publishResult = false;
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      publishResult = true;
      detect("p1", "X");
      expect(published).toHaveLength(1); // 購読の中では配らない
      advance(0);
      expect(published).toHaveLength(2);
      expect(published[1]?.value?.items.map((i) => i.id)).toEqual(["a1"]);
    });

    it("配る処理が例外を投げても、タイマーから漏らさず、配れなかった扱いにする", () => {
      detect("p1", "X");
      const failing = new SubagentTracker({
        bus,
        agentInstanceOf: () => "X",
        paneExists: () => true,
        publish: () => {
          throw new Error("boom");
        },
        now: () => clock,
        setTimer: (fn, ms) => timers.set(99, { at: clock + ms, fn }) && 99,
        clearTimer: (h) => void timers.delete(h as number),
        logger,
      });
      failing.report({ ...base, type: "subagent_start", agentId: "a1" });
      expect(() => advance(100)).not.toThrow();
      expect(logger.lines.some((l) => l.level === "warn" && l.msg.includes("publish failed"))).toBe(
        true,
      );
      failing.close();
    });

    it("報告を受けていない pane の検出・入れ替わりでは、何も作らず、タイマーも張らない", () => {
      detect("p1", "X");
      detect("p1", "Y");
      detect("p1", null);
      expect(timers.size).toBe(0);
      expect(tracker.current("p1")).toBeUndefined();
    });

    it("検出された後の自分の配信（同じ instanceId のイベント）では、何もしない", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      detect("p1", "X");
      advance(1000);
      expect(published).toHaveLength(1);
      expect(tracker.current("p1")?.count).toBe(1); // 状態は捨てない
    });

    it("X → null: 状態を捨て、まとめ待ちのタイマーも取り消す", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      detect("p1", null);
      expect(timers.size).toBe(0);
      advance(1000);
      expect(published).toEqual([]);
      expect(tracker.current("p1")).toBeUndefined();
    });

    it("X → Y: 古い一覧は新しい検出に付かない。新しい検出は分からない（undefined）から始まる", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      advance(100);
      detect("p1", "Y");
      advance(1000);
      expect(tracker.current("p1")).toBeUndefined();
      expect(published).toHaveLength(1);
      rep({ type: "subagent_start", agentId: "b1" });
      advance(100);
      expect(published).toHaveLength(2);
      expect(published[1]?.value?.items.map((i) => i.id)).toEqual(["b1"]);
    });

    it("X → Y の直前のまとめ待ちは、Y には配らない", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      detect("p1", "Y");
      advance(1000);
      expect(published).toEqual([]);
    });

    it("pane.closed: 状態を捨て、タイマーも取り消す", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      bus.publish({ event: "pane.closed", data: { paneId: "p1" } } as never);
      expect(timers.size).toBe(0);
      expect(tracker.current("p1")).toBeUndefined();
      advance(1000);
      expect(published).toEqual([]);
    });

    it("報告の時点で既に検出されている pane は、その instanceId から始める（X → Y の捨て方が効く）", () => {
      detected.set("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      detect("p1", "Y");
      expect(tracker.current("p1")).toBeUndefined();
    });

    it("pane ごとに別々に配る", () => {
      detect("p1", "X");
      detect("p2", "Z");
      rep({ type: "subagent_start", agentId: "a1" });
      rep({ type: "subagent_start", agentId: "z1", paneId: "p2" });
      advance(100);
      expect(published.map((p) => p.paneId).sort()).toEqual(["p1", "p2"]);
    });

    it("close: 購読とタイマーを止め、以後の報告は何もしない", () => {
      detect("p1", "X");
      rep({ type: "subagent_start", agentId: "a1" });
      tracker.close();
      expect(timers.size).toBe(0);
      rep({ type: "subagent_start", agentId: "a2" });
      detect("p1", null);
      advance(1000);
      expect(published).toEqual([]);
    });
  });
});
