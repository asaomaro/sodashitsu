import type { AgentInfo } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  HISTORY_RETENTION_MS,
  MAX_HISTORY,
  addHistory,
  ageLabel,
  badgeText,
  historyEntryOf,
  isResolved,
  parseHistory,
  parseNotifyKey,
  pruneExpired,
  reconcileHistory,
  removeHistoryByKey,
  removeHistoryByPane,
  type HistoryEntry,
  type PaneNow,
} from "./history.js";
import type { QueuedNotification } from "./policy.js";

function makeAgent(o: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", verified: true, state: "idle", since: 100, completionSeq: 0, serverSeenSeq: 0, ...o };
}

function blocked(o: Partial<HistoryEntry> = {}): HistoryEntry {
  return { key: "blocked:a1:100", kind: "blocked", paneId: "p1", instanceId: "a1", seq: 100, label: "pane 1", at: 1000, reason: "dismissed", ...o };
}
function done(o: Partial<HistoryEntry> = {}): HistoryEntry {
  return { key: "done:a1:2", kind: "done", paneId: "p1", instanceId: "a1", seq: 2, label: "pane 1", at: 1000, reason: "dismissed", ...o };
}
function nowOf(o: Partial<PaneNow> = {}): PaneNow {
  return { exists: true, agent: makeAgent(), seenSeq: 0, ...o };
}

describe("上限の値（AC6）", () => {
  // 他のテストは定数を import して使うので、値そのものを固定しないと「50 件・7 日」が別の値になっても気づけない（負の対照で見つけた穴）。
  it("50 件・7 日", () => {
    expect(MAX_HISTORY).toBe(50);
    expect(HISTORY_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe("parseNotifyKey / historyEntryOf", () => {
  it("blocked と done の鍵を読む", () => {
    expect(parseNotifyKey("blocked:a1:100")).toEqual({ kind: "blocked", instanceId: "a1", seq: 100 });
    expect(parseNotifyKey("done:a1:2")).toEqual({ kind: "done", instanceId: "a1", seq: 2 });
  });
  it("instanceId に : が入っていても読める", () => {
    expect(parseNotifyKey("done:x:y:7")).toEqual({ kind: "done", instanceId: "x:y", seq: 7 });
  });
  it.each(["", "blocked", "blocked:a1", "other:a1:1", "done::1", "done:a1:x", "done:a1:-1", ":a1:1"])("読めない鍵 %j は null", (k) => {
    expect(parseNotifyKey(k)).toBeNull();
  });
  it("待ち行列の 1 件から作る。鍵と kind が食い違えば null", () => {
    const q: QueuedNotification = { key: "blocked:a1:100", kind: "blocked", paneId: "p1", label: "L", at: 5, toastId: 3 };
    expect(historyEntryOf(q, "evicted")).toEqual({ key: "blocked:a1:100", kind: "blocked", paneId: "p1", instanceId: "a1", seq: 100, label: "L", at: 5, reason: "evicted" });
    expect(historyEntryOf({ ...q, kind: "done" }, "evicted")).toBeNull();
    expect(historyEntryOf({ ...q, key: "x" }, "evicted")).toBeNull();
  });
});

describe("addHistory（AC6）", () => {
  it("追加順（古い→新しい）で積む", () => {
    const a = blocked({ paneId: "p1", key: "blocked:a1:1" });
    const b = blocked({ paneId: "p2", key: "blocked:a2:1", instanceId: "a2" });
    expect(addHistory(addHistory([], a, 1000), b, 1000).map((e) => e.paneId)).toEqual(["p1", "p2"]);
  });
  it("同じ pane の古いものは置き換わる（最新の 1 件）", () => {
    const old = blocked({ paneId: "p1", key: "blocked:a1:1", seq: 1 });
    const next = done({ paneId: "p1" });
    expect(addHistory([old], next, 1000)).toEqual([next]);
  });
  it("同じ鍵は重ならない", () => {
    const e = blocked();
    expect(addHistory([e], { ...e, label: "new" }, 1000)).toEqual([{ ...e, label: "new" }]);
  });
  it("50 件を超えたら古い方から落とす（境界: 50 は残る・51 で 1 件落ちる）", () => {
    let list: HistoryEntry[] = [];
    for (let i = 0; i < MAX_HISTORY; i++) list = addHistory(list, blocked({ paneId: `p${i}`, key: `blocked:a${i}:1`, instanceId: `a${i}`, seq: 1, at: 1000 + i }), 2000);
    expect(list).toHaveLength(MAX_HISTORY);
    list = addHistory(list, blocked({ paneId: "pX", key: "blocked:aX:1", instanceId: "aX", seq: 1, at: 1100 }), 2000);
    expect(list).toHaveLength(MAX_HISTORY);
    expect(list[0]!.paneId).toBe("p1"); // p0 が落ちた
    expect(list.at(-1)!.paneId).toBe("pX");
  });
  it("7 日を過ぎたものは入れたときに落ちる（ちょうど 7 日は残る）", () => {
    const edge = blocked({ paneId: "p1", at: 0 });
    const expired = blocked({ paneId: "p2", key: "blocked:a2:1", instanceId: "a2", seq: 1, at: 0 });
    const fresh = blocked({ paneId: "p3", key: "blocked:a3:1", instanceId: "a3", seq: 1, at: HISTORY_RETENTION_MS });
    expect(addHistory([edge], fresh, HISTORY_RETENTION_MS).map((e) => e.paneId)).toEqual(["p1", "p3"]);
    expect(addHistory([expired], fresh, HISTORY_RETENTION_MS + 1).map((e) => e.paneId)).toEqual(["p3"]);
  });
});

describe("pruneExpired / remove", () => {
  it("期限の境界", () => {
    const list = [blocked({ at: 0 })];
    expect(pruneExpired(list, HISTORY_RETENTION_MS)).toHaveLength(1);
    expect(pruneExpired(list, HISTORY_RETENTION_MS + 1)).toHaveLength(0);
  });
  it("鍵・pane で外す", () => {
    const list = [blocked(), done({ paneId: "p2", key: "done:a2:1", instanceId: "a2", seq: 1 })];
    expect(removeHistoryByKey(list, "blocked:a1:100").map((e) => e.paneId)).toEqual(["p2"]);
    expect(removeHistoryByPane(list, "p2").map((e) => e.paneId)).toEqual(["p1"]);
    expect(removeHistoryByKey(list, "none")).toHaveLength(2);
  });
});

describe("isResolved（design「解消の判定」の全行・AC13）", () => {
  describe("共通（blocked・done）", () => {
    it.each([
      ["blocked", blocked()],
      ["done", done()],
    ])("%s: pane が閉じた → 解消", (_k, e) => {
      expect(isResolved(e, nowOf({ exists: false, agent: null }))).toBe(true);
    });
    it.each([
      ["blocked", blocked(), makeAgent({ state: "blocked", since: 100 })],
      ["done", done(), makeAgent({ state: "idle", completionSeq: 2 })],
    ])("%s: エージェントが居ない → 解消／入れ替わり → 解消／同じなら残る", (_k, e, same) => {
      expect(isResolved(e, nowOf({ agent: null }))).toBe(true);
      expect(isResolved(e, nowOf({ agent: { ...same, instanceId: "a9" } }))).toBe(true);
      expect(isResolved(e, nowOf({ agent: same }))).toBe(false);
    });
  });

  describe("blocked", () => {
    const e = blocked();
    it("入力待ちのまま（同じ since）→ 残る", () => {
      expect(isResolved(e, nowOf({ agent: makeAgent({ state: "blocked", since: 100 }) }))).toBe(false);
    });
    it.each(["working", "idle", "unknown"] as const)("%s に変わった → 解消", (state) => {
      expect(isResolved(e, nowOf({ agent: makeAgent({ state, since: 200 }) }))).toBe(true);
    });
    it("別の入力待ち（since が違う）→ 解消", () => {
      expect(isResolved(e, nowOf({ agent: makeAgent({ state: "blocked", since: 200 }) }))).toBe(true);
    });
  });

  describe("done", () => {
    const e = done();
    it("idle のまま・まだ見ていない → 残る", () => {
      expect(isResolved(e, nowOf({ agent: makeAgent({ state: "idle", completionSeq: 2 }), seenSeq: 1 }))).toBe(false);
    });
    it("unknown は解消と数えない", () => {
      expect(isResolved(e, nowOf({ agent: makeAgent({ state: "unknown", completionSeq: 2 }), seenSeq: 0 }))).toBe(false);
    });
    it.each(["working", "blocked"] as const)("また動き出した（%s）→ 解消", (state) => {
      expect(isResolved(e, nowOf({ agent: makeAgent({ state, completionSeq: 2 }) }))).toBe(true);
    });
    it("次の完了が来た（completionSeq が進んだ）→ 解消", () => {
      expect(isResolved(e, nowOf({ agent: makeAgent({ state: "idle", completionSeq: 3 }) }))).toBe(true);
    });
    it("完了を見た（既読が追いついた）→ 解消。1 足りなければ残る", () => {
      const agent = makeAgent({ state: "idle", completionSeq: 2 });
      expect(isResolved(e, nowOf({ agent, seenSeq: 2 }))).toBe(true);
      expect(isResolved(e, nowOf({ agent, seenSeq: 1 }))).toBe(false);
    });
  });
});

describe("reconcileHistory（AC14）", () => {
  it("解消した分だけを落とし、残りの順序を保つ", () => {
    const a = blocked({ paneId: "p1" });
    const b = blocked({ paneId: "p2", key: "blocked:a2:100", instanceId: "a2" });
    const c = done({ paneId: "p3", key: "done:a3:2", instanceId: "a3" });
    const r = reconcileHistory([a, b, c], (id) => {
      if (id === "p1") return nowOf({ agent: makeAgent({ state: "blocked", since: 100 }) }); // 残る
      if (id === "p2") return nowOf({ exists: false, agent: null }); // 閉じた
      return nowOf({ agent: makeAgent({ instanceId: "a3", state: "idle", completionSeq: 2 }), seenSeq: 2 }); // 見た
    });
    expect(r.list).toEqual([a]);
    expect(r.removed).toEqual([b, c]);
  });
  it("空でも壊れない", () => {
    expect(reconcileHistory([], () => nowOf())).toEqual({ list: [], removed: [] });
  });
});

describe("parseHistory（復元）", () => {
  it("正しい値はそのまま戻る", () => {
    const list = [blocked(), done({ paneId: "p2", key: "done:a2:1", instanceId: "a2", seq: 1 })];
    expect(parseHistory(JSON.parse(JSON.stringify(list)), 2000)).toEqual(list);
  });
  it.each([null, undefined, 1, "x", {}, [null], [1], [{}]])("壊れた値 %j は空", (raw) => {
    expect(parseHistory(raw, 0)).toEqual([]);
  });
  it("形の違う要素・鍵と食い違う要素だけを捨てる", () => {
    const good = blocked();
    const bad = [
      { ...blocked({ paneId: "p2" }), key: "done:a1:100" }, // kind と鍵が食い違う
      { ...blocked({ paneId: "p3" }), seq: 7 }, // seq と鍵が食い違う
      { ...blocked({ paneId: "p4" }), instanceId: "zzz" }, // instanceId と鍵が食い違う
      { ...blocked({ paneId: "p5" }), reason: "other" },
      { ...blocked({ paneId: "p6" }), at: "x" },
    ];
    expect(parseHistory([good, ...bad], 2000)).toEqual([good]);
  });
  it("期限切れ・同じ pane の重複・上限超過を正規化する", () => {
    const expired = blocked({ paneId: "p9", key: "blocked:a9:1", instanceId: "a9", seq: 1, at: 0 });
    const dupOld = blocked({ at: 10 });
    const dupNew = done({ at: 20 });
    expect(parseHistory([expired, dupOld, dupNew], HISTORY_RETENTION_MS + 1)).toEqual([dupNew]);
    const many = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => blocked({ paneId: `p${i}`, key: `blocked:a${i}:1`, instanceId: `a${i}`, seq: 1, at: 1000 + i }));
    expect(parseHistory(many, 2000)).toHaveLength(MAX_HISTORY);
  });
});

describe("badgeText（AC9）", () => {
  it.each([
    [0, ""],
    [-1, ""],
    [Number.NaN, ""],
    [1, "1"],
    [99, "99"],
    [100, "99+"],
    [1234, "99+"],
  ])("%j → %j", (n, s) => {
    expect(badgeText(n)).toBe(s);
  });
});

describe("ageLabel（AC10）", () => {
  const now = 10_000_000_000;
  it.each([
    [0, "たった今"],
    [59_999, "たった今"],
    [60_000, "1 分前"],
    [59 * 60_000, "59 分前"],
    [60 * 60_000, "1 時間前"],
    [23 * 3_600_000, "23 時間前"],
    [24 * 3_600_000, "1 日前"],
    [6 * 86_400_000, "6 日前"],
  ])("%j ms 前 → %s", (ago, label) => {
    expect(ageLabel(now, now - ago)).toBe(label);
  });
  it("未来の時刻は「たった今」", () => {
    expect(ageLabel(now, now + 5000)).toBe("たった今");
  });
});
