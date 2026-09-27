import type { AgentInfo } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFY_PREFS,
  MAX_QUEUED,
  decide,
  enqueue,
  notifyKeyOf,
  removeByKey,
  removeByPane,
  routesFor,
  shouldQueue,
  snapshotKeys,
  type Audience,
  type NotifyPrefs,
  type QueuedNotification,
} from "./policy.js";

// キャストを使わない（既存の `store/seen.test.ts` 等と同じ流儀）——`as` で押し込むと、
// protocol に必須項目が増えてもテストが型で気づけない。
function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", verified: true, state: "idle", since: 100, completionSeq: 0, serverSeenSeq: 0, ...overrides };
}

const ALL_ON: NotifyPrefs = { toast: true, desktop: true, sound: true };

describe("notifyKeyOf", () => {
  it("入力待ちは instanceId と since で決まる", () => {
    expect(notifyKeyOf("blocked", makeAgent({ since: 100 }))).toBe("blocked:a1:100");
  });

  it("完了は instanceId と completionSeq で決まる", () => {
    expect(notifyKeyOf("done", makeAgent({ completionSeq: 3 }))).toBe("done:a1:3");
  });

  // 鍵に**時刻などの非決定な値を混ぜない**ことだけを見る（AC14 そのものを固定しているのは
  // 上の「instanceId と since で決まる」と下の「since が進めば変わる」）。
  it("同じ入力なら何度呼んでも同じ鍵（`Date.now()` 等を混ぜない）", () => {
    const a = makeAgent({ state: "blocked", since: 100 });
    expect(notifyKeyOf("blocked", a)).toBe(notifyKeyOf("blocked", a));
  });

  // 一度別の状態へ抜けてからもう一度入力待ちになれば `since` が進むので、改めて知らせられる。
  it("入力待ち → 別の状態 → もう一度入力待ち、なら鍵が変わる", () => {
    expect(notifyKeyOf("blocked", makeAgent({ since: 100 }))).not.toBe(notifyKeyOf("blocked", makeAgent({ since: 200 })));
  });

  it("種類が違えば鍵も違う（同じ instanceId でも混ざらない）", () => {
    const a = makeAgent({ since: 5, completionSeq: 5 });
    expect(notifyKeyOf("blocked", a)).not.toBe(notifyKeyOf("done", a));
  });
});

// requirements「知らせ方と、その使い分け」の表を、**3 行 × 3 経路で総当たり**に固定する。
describe("routesFor（表の総当たり）", () => {
  const rows: { name: string; a: Audience; want: { toast: boolean; desktop: boolean; sound: boolean } }[] = [
    { name: "(a) ウィンドウにフォーカスが無い", a: { windowFocused: false, paneVisible: false }, want: { toast: true, desktop: true, sound: true } },
    { name: "(a') フォーカスが無ければ、その pane が表示中でも同じ", a: { windowFocused: false, paneVisible: true }, want: { toast: true, desktop: true, sound: true } },
    { name: "(b) フォーカス有り・その pane は非表示", a: { windowFocused: true, paneVisible: false }, want: { toast: true, desktop: false, sound: false } },
    { name: "(c) その pane を見ている", a: { windowFocused: true, paneVisible: true }, want: { toast: false, desktop: false, sound: false } },
  ];

  for (const row of rows) {
    it(`${row.name}（3 経路とも「入」のとき）`, () => {
      expect(routesFor(row.a, ALL_ON)).toEqual(row.want);
    });
  }

  it("設定で「切」にしたものは、どの行でも出ない", () => {
    for (const row of rows) {
      expect(routesFor(row.a, { toast: false, desktop: false, sound: false })).toEqual({ toast: false, desktop: false, sound: false });
    }
  });

  it("経路ごとに独立している（トーストだけ入）", () => {
    expect(routesFor({ windowFocused: false, paneVisible: false }, { toast: true, desktop: false, sound: false })).toEqual({ toast: true, desktop: false, sound: false });
  });

  it("経路ごとに独立している（OS 通知だけ入）", () => {
    expect(routesFor({ windowFocused: false, paneVisible: false }, { toast: false, desktop: true, sound: false })).toEqual({ toast: false, desktop: true, sound: false });
  });

  it("既定はトーストだけ（OS 通知は許可が要るので切、音は迷惑になりうるので切）", () => {
    expect(DEFAULT_NOTIFY_PREFS).toEqual({ toast: true, desktop: false, sound: false });
    expect(routesFor({ windowFocused: false, paneVisible: false }, DEFAULT_NOTIFY_PREFS)).toEqual({ toast: true, desktop: false, sound: false });
  });
});

// **decisions D4**：トーストの入／切とは独立。ここが `routes.toast` に依存すると、
// 「トースト切・OS 通知入」の利用者で `prefix+o` が永久に効かなくなる。
describe("shouldQueue", () => {
  it("見ている pane 以外は、すべて待ち行列に入る", () => {
    expect(shouldQueue({ windowFocused: false, paneVisible: false })).toBe(true);
    expect(shouldQueue({ windowFocused: false, paneVisible: true })).toBe(true);
    expect(shouldQueue({ windowFocused: true, paneVisible: false })).toBe(true);
  });

  it("見ている pane は入らない（後で戻る先ではない）", () => {
    expect(shouldQueue({ windowFocused: true, paneVisible: true })).toBe(false);
  });
});

describe("decide", () => {
  it("鍵・経路・待ち行列の可否を 1 回で返す（入れ忘れを防ぐ）", () => {
    const d = decide("blocked", makeAgent({ since: 7 }), { windowFocused: true, paneVisible: false }, ALL_ON);
    expect(d).toEqual({ key: "blocked:a1:7", routes: { toast: true, desktop: false, sound: false }, queue: true });
  });

  it("3 経路とも出さない場合でも鍵を返す（判定済みに入れられる）", () => {
    const d = decide("done", makeAgent({ completionSeq: 2 }), { windowFocused: true, paneVisible: true }, ALL_ON);
    expect(d.key).toBe("done:a1:2");
    expect(d.routes).toEqual({ toast: false, desktop: false, sound: false });
    expect(d.queue).toBe(false);
  });

  it("トーストを切にしても、待ち行列には入る（D4）", () => {
    const d = decide("blocked", makeAgent(), { windowFocused: false, paneVisible: false }, { toast: false, desktop: true, sound: false });
    expect(d.routes.toast).toBe(false);
    expect(d.queue).toBe(true);
  });
});

// **スナップショットには前の値が無いので、この述語が唯一の守り**。
// 無いと、切断中に現れただけのエージェントに「完了しました」「入力待ちです」と言ってしまう。
describe("snapshotKeys", () => {
  it("入力待ちのエージェントからは blocked の鍵が出る", () => {
    expect(snapshotKeys(makeAgent({ state: "blocked", since: 5 }))).toEqual([{ kind: "blocked", key: "blocked:a1:5" }]);
  });

  it("入力待ちでなければ blocked の鍵は出ない（`since` は常にあるので、状態を見ないと作れてしまう）", () => {
    expect(snapshotKeys(makeAgent({ state: "working", since: 5 }))).toEqual([]);
    expect(snapshotKeys(makeAgent({ state: "idle", since: 5 }))).toEqual([]);
    expect(snapshotKeys(makeAgent({ state: "unknown", since: 5 }))).toEqual([]);
  });

  it("一度も完了していなければ done の鍵は出ない（completionSeq が 0 でも鍵は作れてしまう）", () => {
    expect(snapshotKeys(makeAgent({ state: "idle", completionSeq: 0 }))).toEqual([]);
  });

  it("完了していれば done の鍵が出る", () => {
    expect(snapshotKeys(makeAgent({ state: "idle", completionSeq: 2 }))).toEqual([{ kind: "done", key: "done:a1:2" }]);
  });

  it("入力待ちかつ完了済みなら両方出る", () => {
    expect(snapshotKeys(makeAgent({ state: "blocked", since: 5, completionSeq: 2 }))).toEqual([
      { kind: "blocked", key: "blocked:a1:5" },
      { kind: "done", key: "done:a1:2" },
    ]);
  });
});

describe("待ち行列", () => {
  const at = (n: number): QueuedNotification => ({ key: `k${n}`, kind: "blocked", paneId: `p${n}`, label: `L${n}`, at: n, toastId: n });

  it("空の行列に積める", () => {
    const r = enqueue([], at(1));
    expect(r.queue.map((q) => q.key)).toEqual(["k1"]);
    expect(r.removed).toEqual([]);
  });

  // herdr `notification_policy.rs:119-132`：同じ pane の古いものは消してから末尾へ積む。
  it("同じ pane の古いものは置き換えられ、removed で返る", () => {
    const old = { ...at(1), key: "old" };
    const r = enqueue([old, at(2)], { ...at(1), key: "new" });
    expect(r.queue.map((q) => q.key)).toEqual(["k2", "new"]);
    expect(r.removed.map((q) => q.key)).toEqual(["old"]);
  });

  // herdr `:50-53` の `pop_front`：9 件目で最も古いものを捨てる。
  it("上限を超えたら最も古いものを捨て、removed で返る", () => {
    let queue: QueuedNotification[] = [];
    for (let i = 1; i <= MAX_QUEUED; i++) queue = enqueue(queue, at(i)).queue;
    expect(queue.length).toBe(MAX_QUEUED);

    const r = enqueue(queue, at(99));
    expect(r.queue.length).toBe(MAX_QUEUED);
    expect(r.queue[0]!.key).toBe("k2"); // 最古の k1 が落ちた
    expect(r.removed.map((q) => q.key)).toEqual(["k1"]);
  });

  // `while` を `if` に変えると、一度に 2 件以上溢れたときに落としきれない。
  it("上限を超えた行列を渡されたら、超過分をすべて捨てる", () => {
    const over = Array.from({ length: MAX_QUEUED + 3 }, (_, i) => at(i + 1));
    const r = enqueue(over, at(99));
    expect(r.queue.length).toBe(MAX_QUEUED);
    expect(r.removed.map((q) => q.key)).toEqual(["k1", "k2", "k3", "k4"]); // 溢れた 4 件（新しい 1 件ぶんを含む）
  });

  it("removeByKey は該当の 1 件だけを外す", () => {
    const r = removeByKey([at(1), at(2), at(3)], "k2");
    expect(r.queue.map((q) => q.key)).toEqual(["k1", "k3"]);
    expect(r.removed.map((q) => q.key)).toEqual(["k2"]);
  });

  it("無い鍵を外しても何も起きない（再入しても安全）", () => {
    const r = removeByKey([at(1)], "missing");
    expect(r.queue.map((q) => q.key)).toEqual(["k1"]);
    expect(r.removed).toEqual([]);
  });

  it("removeByPane は同じ pane の件をまとめて外す（pane が閉じたとき）", () => {
    const same = { ...at(2), key: "k2b" };
    const r = removeByPane([at(1), at(2), same, at(3)], "p2");
    expect(r.queue.map((q) => q.key)).toEqual(["k1", "k3"]);
    expect(r.removed.map((q) => q.key)).toEqual(["k2", "k2b"]);
  });
});
