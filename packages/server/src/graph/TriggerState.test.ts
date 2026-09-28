import { describe, expect, it } from "vitest";
import type { AgentInfo, AgentState } from "@sodashitsu/protocol";
import { BLOCKED_HOLD_MS, BUSY_WAIT_MAX_MS } from "@sodashitsu/client-core";
import { TriggerState, type TriggerSettings } from "./TriggerState.js";

// 20260927-agent-graph の 02 T1：線ごとの状態機械（変化の列 → 決定）。
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
const DONE: TriggerSettings = { on: "done", whenBusy: "wait", suppress: null };
const BLOCKED: TriggerSettings = { on: "blocked", whenBusy: "wait", suppress: null };
const idleTarget = agent("t1", 0, "idle");

function make(
  settings: TriggerSettings = DONE,
  source: AgentInfo | null = agent("a1", 0),
  target: AgentInfo | null = idleTarget,
  at = 0,
) {
  return new TriggerState(settings, { source, target, at });
}

describe("TriggerState — 完了の鍵（instanceId, completionSeq）", () => {
  it("最初に見た値は基準。completionSeq が増えたら 1 回送る、同じ値の繰り返しでは送らない", () => {
    const s = make(DONE, agent("a1", 5));
    expect(s.handle({ kind: "source", agent: agent("a1", 5), at: 1 })).toBeNull(); // 既読だけの変化など
    expect(s.handle({ kind: "source", agent: agent("a1", 6), at: 2 })).toEqual({ kind: "send" });
    expect(s.handle({ kind: "source", agent: agent("a1", 6), at: 3 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a1", 6, "working"), at: 4 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a1", 7), at: 5 })).toEqual({ kind: "send" });
  });

  it("instanceId が変わった直後の値は基準（再起動で 0 に戻っても、前より小さくても動かない）。その instanceId で増えたら送る", () => {
    const s = make(DONE, agent("a1", 9));
    expect(s.handle({ kind: "source", agent: agent("a2", 0, "unknown"), at: 1 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a2", 0, "idle"), at: 2 })).toBeNull(); // 起動直後の unknown→idle は完了ではない
    expect(s.handle({ kind: "source", agent: agent("a2", 1), at: 3 })).toEqual({ kind: "send" });
  });

  it("入れ替わった直後に増えた値を持っていても、その値は基準（送らない）", () => {
    const s = make(DONE, agent("a1", 1));
    expect(s.handle({ kind: "source", agent: agent("a2", 3), at: 1 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a2", 4), at: 2 })).toEqual({ kind: "send" });
  });

  it("元が居なくなって現れたら、現れた値は基準", () => {
    const s = make(DONE, agent("a1", 1));
    expect(s.handle({ kind: "source", agent: null, at: 1 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a1", 2), at: 2 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a1", 3), at: 3 })).toEqual({ kind: "send" });
  });

  it("最初に元が居なければ、最初に現れた値が基準", () => {
    const s = make(DONE, null);
    expect(s.handle({ kind: "source", agent: agent("a1", 4), at: 1 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a1", 5), at: 2 })).toEqual({ kind: "send" });
  });

  it("on: done の線は承認待ちでは動かない", () => {
    const s = make(DONE, agent("a1", 0));
    expect(s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 1 })).toBeNull();
    expect(s.handle({ kind: "tick", at: 1 + BLOCKED_HOLD_MS * 5 })).toBeNull();
  });
});

describe("TriggerState — 承認待ち（blocked が 1 秒続いたら 1 回）", () => {
  it("1 秒に満たなければ動かず、1 秒で 1 回。続いている間は二度動かない", () => {
    const s = make(BLOCKED, agent("a1", 0));
    expect(s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 100 })).toBeNull();
    expect(s.handle({ kind: "tick", at: 100 + BLOCKED_HOLD_MS - 1 })).toBeNull();
    expect(s.handle({ kind: "tick", at: 100 + BLOCKED_HOLD_MS })).toEqual({ kind: "send" });
    expect(s.handle({ kind: "tick", at: 100 + BLOCKED_HOLD_MS * 3 })).toBeNull();
    expect(
      s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 100 + BLOCKED_HOLD_MS * 4 }),
    ).toBeNull();
  });

  it("1 秒の前に抜ければ動かない。抜けてからまた blocked になれば、そこから数え直して 1 回", () => {
    const s = make(BLOCKED, agent("a1", 0));
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0 });
    expect(s.handle({ kind: "source", agent: agent("a1", 0, "working"), at: 500 })).toBeNull();
    expect(s.handle({ kind: "tick", at: 2000 })).toBeNull();
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 3000 });
    expect(s.handle({ kind: "tick", at: 3000 + BLOCKED_HOLD_MS - 1 })).toBeNull();
    expect(s.handle({ kind: "tick", at: 3000 + BLOCKED_HOLD_MS })).toEqual({ kind: "send" });
    // 抜けて、また blocked → もう 1 回
    s.handle({ kind: "source", agent: agent("a1", 0, "idle"), at: 5000 });
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 6000 });
    expect(s.handle({ kind: "tick", at: 6000 + BLOCKED_HOLD_MS })).toEqual({ kind: "send" });
  });

  it("元の状態の知らせ（tick でなく）でも 1 秒を過ぎていれば動く", () => {
    const s = make(BLOCKED, agent("a1", 0));
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0 });
    expect(
      s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: BLOCKED_HOLD_MS }),
    ).toEqual({ kind: "send" });
  });

  it("最初に見た時点で既に blocked なら、その回は基準（動かない）。抜けて次の回から動く", () => {
    const s = make(BLOCKED, agent("a1", 0, "blocked"), idleTarget, 0);
    expect(s.handle({ kind: "tick", at: BLOCKED_HOLD_MS * 10 })).toBeNull();
    s.handle({ kind: "source", agent: agent("a1", 0, "idle"), at: 20_000 });
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 21_000 });
    expect(s.handle({ kind: "tick", at: 21_000 + BLOCKED_HOLD_MS })).toEqual({ kind: "send" });
  });

  it("入れ替わった直後の blocked も基準", () => {
    const s = make(BLOCKED, agent("a1", 0));
    s.handle({ kind: "source", agent: agent("a2", 0, "blocked"), at: 0 });
    expect(s.handle({ kind: "tick", at: BLOCKED_HOLD_MS * 2 })).toBeNull();
  });

  it("on: blocked の線は完了では動かない", () => {
    const s = make(BLOCKED, agent("a1", 0));
    expect(s.handle({ kind: "source", agent: agent("a1", 1), at: 1 })).toBeNull();
  });

  it("元が居なくなれば blocked の回も終わる", () => {
    const s = make(BLOCKED, agent("a1", 0));
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0 });
    s.handle({ kind: "source", agent: null, at: 10 });
    expect(s.handle({ kind: "tick", at: BLOCKED_HOLD_MS * 2 })).toBeNull();
  });
});

describe("TriggerState — 変異の網羅で見つけた抜け", () => {
  it("最初に元が居ない線は、tick で動かない（blocked の回を持たない）", () => {
    const s = make(BLOCKED, null);
    expect(s.handle({ kind: "tick", at: BLOCKED_HOLD_MS * 5 })).toBeNull();
  });

  it("blocked の途中で入れ替わり、新しい方が blocked でなければ、前の回の時刻で動かない", () => {
    const s = make(BLOCKED, agent("a1", 0));
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0 });
    s.handle({ kind: "source", agent: agent("a2", 0, "idle"), at: 500 });
    expect(s.handle({ kind: "tick", at: BLOCKED_HOLD_MS * 3 })).toBeNull();
  });

  it("待つ間に先が承認待ちになり、そこへもう一度発火すると blocked で見送り、待ちも消える", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    s.handle({ kind: "source", agent: agent("a1", 1), at: 0 });
    s.handle({ kind: "target", agent: agent("t1", 0, "blocked"), at: 1 });
    expect(s.handle({ kind: "source", agent: agent("a1", 2), at: 2 })).toEqual({
      kind: "skip",
      reason: "blocked",
    });
    expect(s.waiting).toBe(false);
    expect(s.handle({ kind: "target", agent: idleTarget, at: 3 })).toBeNull();
  });

  it("待つ間に「見送る」へ変えてもう一度発火すると busy で見送り、待ちも消える", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    s.handle({ kind: "source", agent: agent("a1", 1), at: 0 });
    s.handle({ kind: "config", settings: { ...DONE, whenBusy: "skip" } });
    expect(s.handle({ kind: "source", agent: agent("a1", 2), at: 2 })).toEqual({
      kind: "skip",
      reason: "busy",
    });
    expect(s.waiting).toBe(false);
    expect(s.handle({ kind: "target", agent: idleTarget, at: 3 })).toBeNull();
  });

  it("blocked の回で発火した後、同じ回が続く間の完了（on: done ではない）でも動かない", () => {
    const s = make(BLOCKED, agent("a1", 0));
    s.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0 });
    expect(s.handle({ kind: "tick", at: BLOCKED_HOLD_MS })).toEqual({ kind: "send" });
    expect(
      s.handle({ kind: "source", agent: agent("a1", 1, "blocked"), at: BLOCKED_HOLD_MS * 2 }),
    ).toBeNull();
  });
});

describe("TriggerState — 先の状態と待ち", () => {
  const fireAt = (s: TriggerState, at: number, seq: number) =>
    s.handle({ kind: "source", agent: agent("a1", seq), at });

  it("先が居なければ target_absent、承認待ちなら blocked で見送る", () => {
    expect(fireAt(make(DONE, agent("a1", 0), null), 1, 1)).toEqual({
      kind: "skip",
      reason: "target_absent",
    });
    expect(fireAt(make(DONE, agent("a1", 0), agent("t1", 0, "blocked")), 1, 1)).toEqual({
      kind: "skip",
      reason: "blocked",
    });
  });

  it("先が作業中（working・unknown）で wait なら待ち、先の手が空いたら送る", () => {
    for (const busy of ["working", "unknown"] as const) {
      const s = make(DONE, agent("a1", 0), agent("t1", 0, busy));
      expect(fireAt(s, 10, 1)).toEqual({ kind: "wait" });
      expect(s.waiting).toBe(true);
      expect(s.handle({ kind: "target", agent: agent("t1", 0, busy), at: 20 })).toBeNull();
      expect(s.handle({ kind: "target", agent: agent("t1", 1, "idle"), at: 30 })).toEqual({
        kind: "send",
      });
      expect(s.waiting).toBe(false);
      expect(s.handle({ kind: "target", agent: agent("t1", 1, "idle"), at: 40 })).toBeNull(); // 送ったら待ちは無い
    }
  });

  it("先が作業中で skip なら busy で見送る", () => {
    const s = make({ ...DONE, whenBusy: "skip" }, agent("a1", 0), agent("t1", 0, "working"));
    expect(fireAt(s, 1, 1)).toEqual({ kind: "skip", reason: "busy" });
    expect(s.waiting).toBe(false);
  });

  it("待つ間に先が承認待ちになっても待ち続け、先が消えたら target_absent", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    fireAt(s, 0, 1);
    expect(s.handle({ kind: "target", agent: agent("t1", 0, "blocked"), at: 5 })).toBeNull();
    expect(s.waiting).toBe(true);
    expect(s.handle({ kind: "target", agent: null, at: 6 })).toEqual({
      kind: "skip",
      reason: "target_absent",
    });
    expect(s.waiting).toBe(false);
  });

  it("30 分待っても空かなければ busy_timeout（ちょうど 30 分で打ち切り、1ms 前は待つ）", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    fireAt(s, 1000, 1);
    expect(s.handle({ kind: "tick", at: 1000 + BUSY_WAIT_MAX_MS - 1 })).toBeNull();
    expect(s.handle({ kind: "tick", at: 1000 + BUSY_WAIT_MAX_MS })).toEqual({
      kind: "skip",
      reason: "busy_timeout",
    });
    expect(s.handle({ kind: "tick", at: 1000 + BUSY_WAIT_MAX_MS * 2 })).toBeNull();
  });

  it("待つ間にもう一度発火したら新しい 1 件に置き換え、待ちの時間も数え直す", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    expect(fireAt(s, 0, 1)).toEqual({ kind: "wait" });
    expect(fireAt(s, 10_000, 2)).toEqual({ kind: "wait" });
    expect(s.handle({ kind: "tick", at: BUSY_WAIT_MAX_MS })).toBeNull(); // 最初の発火からは 30 分でも、新しい方からはまだ
    expect(s.handle({ kind: "tick", at: 10_000 + BUSY_WAIT_MAX_MS })).toEqual({
      kind: "skip",
      reason: "busy_timeout",
    });
  });

  it("待つ間の tick は、先が空いていれば送る（知らせの取りこぼしの保険）", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    fireAt(s, 0, 1);
    s.handle({ kind: "target", agent: agent("t1", 0, "blocked"), at: 1 });
    expect(s.handle({ kind: "tick", at: 2 })).toBeNull();
  });

  it("cancel は待ちを黙って取り消す（決定を出さない）", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    fireAt(s, 0, 1);
    s.cancel();
    expect(s.waiting).toBe(false);
    expect(s.handle({ kind: "target", agent: idleTarget, at: 5 })).toBeNull();
  });
});

describe("TriggerState — 一時停止・上限・マシン不在（抑止）", () => {
  it("抑止の間の発火はその理由で見送る", () => {
    for (const reason of ["paused", "limit", "machine_unavailable"] as const) {
      const s = make({ ...DONE, suppress: reason });
      expect(s.handle({ kind: "source", agent: agent("a1", 1), at: 1 })).toEqual({
        kind: "skip",
        reason,
      });
    }
    const b = make({ ...BLOCKED, suppress: "paused" });
    b.handle({ kind: "source", agent: agent("a1", 0, "blocked"), at: 0 });
    expect(b.handle({ kind: "tick", at: BLOCKED_HOLD_MS })).toEqual({
      kind: "skip",
      reason: "paused",
    });
  });

  it("待つ間に抑止が付いたら、待ちをその理由で見送る。抑止の無い設定の変更では待ち続ける", () => {
    const s = make(DONE, agent("a1", 0), agent("t1", 0, "working"));
    s.handle({ kind: "source", agent: agent("a1", 1), at: 0 });
    expect(s.handle({ kind: "config", settings: { ...DONE, whenBusy: "wait" } })).toBeNull();
    expect(s.waiting).toBe(true);
    expect(s.handle({ kind: "config", settings: { ...DONE, suppress: "paused" } })).toEqual({
      kind: "skip",
      reason: "paused",
    });
    expect(s.waiting).toBe(false);
    expect(s.handle({ kind: "config", settings: { ...DONE, suppress: "paused" } })).toBeNull();
  });

  it("抑止が外れたら、次の発火から動く（止めていた間の完了は後から送らない）", () => {
    const s = make({ ...DONE, suppress: "paused" });
    s.handle({ kind: "source", agent: agent("a1", 1), at: 1 });
    expect(s.handle({ kind: "config", settings: DONE })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a1", 1), at: 2 })).toBeNull();
    expect(s.handle({ kind: "source", agent: agent("a1", 2), at: 3 })).toEqual({ kind: "send" });
  });

  it("発火を見送ると待ちも残らない", () => {
    const s = make({ ...DONE, suppress: "limit" }, agent("a1", 0), agent("t1", 0, "working"));
    s.handle({ kind: "source", agent: agent("a1", 1), at: 1 });
    expect(s.waiting).toBe(false);
  });
});
