import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_HISTORY, MAX_QUEUED, type HistoryEntry, type QueuedNotification } from "@sodashitsu/client-core";
import { NOTIFY_HISTORY_STORAGE_KEY, useNotificationsStore } from "./notifications.js";
import { readPrefs, writePrefs } from "./view.js";

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  localStorage.clear();
});

function entry(n: number, overrides: Partial<QueuedNotification> = {}): QueuedNotification {
  return { key: `k${n}`, kind: "blocked", paneId: `p${n}`, label: `L${n}`, at: n, toastId: n, ...overrides };
}

describe("useNotificationsStore — 設定", () => {
  it("既定はトーストだけ入（OS 通知は許可が要る、音は迷惑になりうる）", () => {
    expect(useNotificationsStore(pinia).prefs).toEqual({ toast: true, desktop: false, sound: false });
  });

  it("切り替えると localStorage に残り、新しいストアが読み戻す", () => {
    useNotificationsStore(pinia).setPrefs({ desktop: true });
    expect(useNotificationsStore(createPinia()).prefs).toEqual({ toast: true, desktop: true, sound: false });
  });

  // **AC6**：`soda.prefs.v1` は他の設定と同居するので、併合でないと巻き添えで消える。
  it("並び順など他の設定を壊さない", () => {
    writePrefs({ agentSort: "priority" });
    useNotificationsStore(pinia).setPrefs({ sound: true });
    expect(readPrefs()["agentSort"]).toBe("priority");
    expect(readPrefs()["notify"]).toEqual({ toast: true, desktop: false, sound: true });
  });

  it("壊れた値は既定へ落とす（型が違う・配列・欠け）", () => {
    writePrefs({ notify: { toast: "yes", desktop: true } });
    expect(useNotificationsStore(createPinia()).prefs).toEqual({ toast: true, desktop: true, sound: false });
    writePrefs({ notify: [1, 2] });
    expect(useNotificationsStore(createPinia()).prefs).toEqual({ toast: true, desktop: false, sound: false });
  });
});

// **AC14 の土台**。「知らせ済み」ではなく「判定済み」——出さないと決めた場合も入れる。
describe("useNotificationsStore — 判定済み", () => {
  it("入れた鍵は引ける。pane が違えば混ざらない", () => {
    const s = useNotificationsStore(pinia);
    s.markJudged("p1", "blocked:a1:1");
    expect(s.isJudged("p1", "blocked:a1:1")).toBe(true);
    expect(s.isJudged("p1", "blocked:a1:2")).toBe(false);
    expect(s.isJudged("p2", "blocked:a1:1")).toBe(false);
  });

  it("baseline は何も知らせずに鍵だけ入れる（初回のスナップショット）", () => {
    const s = useNotificationsStore(pinia);
    s.baseline([
      { paneId: "p1", keys: ["blocked:a1:1", "done:a1:3"] },
      { paneId: "p2", keys: ["blocked:a2:9"] },
    ]);
    expect(s.isJudged("p1", "blocked:a1:1")).toBe(true);
    expect(s.isJudged("p1", "done:a1:3")).toBe(true);
    expect(s.isJudged("p2", "blocked:a2:9")).toBe(true);
    expect(s.queue).toEqual([]); // 知らせは積まれない
  });

  // **件数の上限にしない理由**：長く入力待ちのままの鍵ほど古い側に落ちて押し出され、
  // 再接続のスナップショットで「判定済みに無い」と見なされて再通知される。
  it("pane が閉じたときだけ忘れる（件数では捨てない）", () => {
    const s = useNotificationsStore(pinia);
    for (let i = 0; i < 1000; i++) s.markJudged("p1", `blocked:a1:${i}`);
    expect(s.isJudged("p1", "blocked:a1:0"), "何件入れても最初の鍵が残る").toBe(true);

    s.forgetPane("p1");
    expect(s.isJudged("p1", "blocked:a1:0")).toBe(false);
  });

  it("他の pane を閉じても残る", () => {
    const s = useNotificationsStore(pinia);
    s.markJudged("p1", "k");
    s.forgetPane("p2");
    expect(s.isJudged("p1", "k")).toBe(true);
  });
});

describe("useNotificationsStore — 待ち行列", () => {
  it("積んだ順に並ぶ", () => {
    const s = useNotificationsStore(pinia);
    s.push(entry(1));
    s.push(entry(2));
    expect(s.queue.map((q) => q.key)).toEqual(["k1", "k2"]);
    expect(s.queueLength).toBe(2);
  });

  // **戻り値を捨てると、消えないトーストが画面に残る**。
  it("押し出された件・置き換えられた件を返す", () => {
    const s = useNotificationsStore(pinia);
    s.push(entry(1));
    const removed = s.push(entry(1, { key: "k1-new" }));
    expect(removed.map((q) => q.key)).toEqual(["k1"]); // 同じ pane の古いもの
    expect(s.queue.map((q) => q.key)).toEqual(["k1-new"]);
  });

  it("上限を超えたら最古を返す", () => {
    const s = useNotificationsStore(pinia);
    for (let i = 1; i <= MAX_QUEUED; i++) s.push(entry(i));
    const removed = s.push(entry(99));
    expect(removed.map((q) => q.key)).toEqual(["k1"]);
    expect(s.queueLength).toBe(MAX_QUEUED);
  });

  it("鍵で外す・pane ごと外す", () => {
    const s = useNotificationsStore(pinia);
    s.push(entry(1));
    s.push(entry(2));
    expect(s.removeKey("k1").map((q) => q.key)).toEqual(["k1"]);
    expect(s.removePane("p2").map((q) => q.key)).toEqual(["k2"]);
    expect(s.queue).toEqual([]);
  });

  // **1 対 1 を保つ唯一の観測点**（sticky は自動消去に掛からないので、他に気づく術が無い）。
  it("トーストが消えた件を外す。`toastId` が null の件（トースト切）は残す", () => {
    const s = useNotificationsStore(pinia);
    s.push(entry(1, { toastId: 11 }));
    s.push(entry(2, { toastId: 22 }));
    s.push(entry(3, { toastId: null })); // トーストを「切」にしている利用者

    const gone = s.dropMissingToasts(new Set([22]));
    expect(gone.map((q) => q.key)).toEqual(["k1"]);
    expect(s.queue.map((q) => q.key)).toEqual(["k2", "k3"]);
  });

  it("消えたトーストが無ければ何も起きない（再入しても安全）", () => {
    const s = useNotificationsStore(pinia);
    s.push(entry(1, { toastId: 11 }));
    expect(s.dropMissingToasts(new Set([11]))).toEqual([]);
    expect(s.queue.map((q) => q.key)).toEqual(["k1"]);
  });
});

describe("useNotificationsStore — 案内", () => {
  it("pending も done も localStorage に残る（再読み込みで失わない）", () => {
    const s = useNotificationsStore(pinia);
    expect(s.hintPending).toBe(false);
    s.setHintPending(true);
    expect(useNotificationsStore(createPinia()).hintPending).toBe(true);

    s.setHintDone(true);
    const s2 = useNotificationsStore(createPinia());
    expect(s2.hintDone).toBe(true);
    expect(s2.hintPending).toBe(true);
  });

  it("hintToastId は既定 null（まだ出していない）", () => {
    expect(useNotificationsStore(pinia).hintToastId).toBeNull();
  });
});

describe("useNotificationsStore — 環境の可否", () => {
  it("既定は OS 通知が使えるつもりで、音は止められていない", () => {
    const s = useNotificationsStore(pinia);
    expect(s.desktopUsable).toBe(true);
    expect(s.soundBlocked).toBe(false);
  });

  // 環境の性質なので**保存しない**（別の端末・別のブラウザでは違う）。
  it("環境の可否は localStorage に残さない", () => {
    const s = useNotificationsStore(pinia);
    s.desktopUsable = false;
    s.soundBlocked = true;
    const s2 = useNotificationsStore(createPinia());
    expect(s2.desktopUsable).toBe(true);
    expect(s2.soundBlocked).toBe(false);
  });
});

// 応答せずに閉じた知らせの履歴（20261005-notify-bell。AC6・AC7）。規則そのものは `client-core/notify/history.test.ts`——ここは保存・scope・件数。
function hist(n: number, o: Partial<HistoryEntry> = {}): HistoryEntry {
  return { key: `blocked:a${n}:1`, kind: "blocked", paneId: `p${n}`, instanceId: `a${n}`, seq: 1, label: `L${n}`, at: Date.now(), reason: "dismissed", ...o };
}

describe("useNotificationsStore — 履歴", () => {
  it("足すと件数に数えられ、同じ pane は最新の 1 件に置き換わる（AC6）", () => {
    const s = useNotificationsStore(pinia);
    expect(s.historyCount).toBe(0);
    s.addHistory(hist(1));
    s.addHistory(hist(2));
    expect(s.historyCount).toBe(2);
    s.addHistory(hist(1, { key: "done:a1:2", kind: "done", seq: 2 }));
    expect(s.history.map((e) => e.key)).toEqual(["blocked:a2:1", "done:a1:2"]);
  });

  it("50 件を超えたら古いものから落ちる（AC6）", () => {
    const s = useNotificationsStore(pinia);
    for (let i = 0; i < MAX_HISTORY + 3; i++) s.addHistory(hist(i));
    expect(s.historyCount).toBe(MAX_HISTORY);
    expect(s.history[0]!.paneId).toBe("p3");
  });

  it("localStorage に残り、新しいストア（再読み込み）が読み戻す（AC7）", () => {
    useNotificationsStore(pinia).addHistory(hist(1));
    expect(useNotificationsStore(createPinia()).history.map((e) => e.key)).toEqual(["blocked:a1:1"]);
  });

  it("1 件消す・全部消す。空になったら保存の項目も残さない", () => {
    const s = useNotificationsStore(pinia);
    s.addHistory(hist(1));
    s.addHistory(hist(2));
    expect(s.removeHistory("blocked:a1:1")).toBe(true);
    expect(s.removeHistory("blocked:a1:1")).toBe(false);
    expect(s.history.map((e) => e.paneId)).toEqual(["p2"]);
    s.clearHistory();
    expect(s.historyCount).toBe(0);
    expect(JSON.parse(localStorage.getItem(NOTIFY_HISTORY_STORAGE_KEY) ?? "{}")).toEqual({});
    expect(useNotificationsStore(createPinia()).historyCount).toBe(0);
  });

  it("pane ごと消す", () => {
    const s = useNotificationsStore(pinia);
    s.addHistory(hist(1));
    s.addHistory(hist(2));
    s.removeHistoryPane("p1");
    expect(s.history.map((e) => e.paneId)).toEqual(["p2"]);
  });

  it("解消した件だけを落として、落とした件を返す。何も落ちなければ保存し直さない", () => {
    const s = useNotificationsStore(pinia);
    s.addHistory(hist(1));
    s.addHistory(hist(2));
    const removed = s.reconcileHistory((paneId) => ({ exists: paneId === "p1", agent: null, seenSeq: 0 }));
    // どちらもエージェントが居ないので両方解消。
    expect(removed.map((e) => e.paneId)).toEqual(["p1", "p2"]);
    expect(s.historyCount).toBe(0);
    expect(s.reconcileHistory(() => ({ exists: true, agent: null, seenSeq: 0 }))).toEqual([]);
  });

  it("マシンごとに分かれる。切り替えると切り替え先の履歴が出て、戻せば元の履歴が残っている（AC7）", () => {
    const s = useNotificationsStore(pinia);
    s.addHistory(hist(1));
    s.setHistoryScope("m1");
    expect(s.historyCount).toBe(0);
    s.addHistory(hist(7));
    s.setHistoryScope("local");
    expect(s.history.map((e) => e.paneId)).toEqual(["p1"]);
    s.setHistoryScope("m1");
    expect(s.history.map((e) => e.paneId)).toEqual(["p7"]);
    expect(Object.keys(JSON.parse(localStorage.getItem(NOTIFY_HISTORY_STORAGE_KEY)!)).sort()).toEqual(["local", "m1"]);
  });

  it("壊れた保存値・読めない保存先でも空の履歴で動く（異常系）", () => {
    localStorage.setItem(NOTIFY_HISTORY_STORAGE_KEY, "{not json");
    expect(useNotificationsStore(createPinia()).historyCount).toBe(0);
    localStorage.setItem(NOTIFY_HISTORY_STORAGE_KEY, JSON.stringify({ local: [{ junk: true }, hist(1)] }));
    expect(useNotificationsStore(createPinia()).history.map((e) => e.paneId)).toEqual(["p1"]);
  });

  it("保存できなくても、メモリの上では動く（異常系）", () => {
    const s = useNotificationsStore(pinia);
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      s.addHistory(hist(1));
      expect(s.historyCount).toBe(1);
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
