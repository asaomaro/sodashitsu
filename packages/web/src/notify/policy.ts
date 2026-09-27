import type { AgentInfo } from "@sodashitsu/protocol";

/** 知らせる出来事の種類。文言・音・OS 通知の title がこれで分かれる（AC2）。 */
export type NotifyKind = "blocked" | "done";

/**
 * 「同じ出来事か」を識別する鍵（AC14）。**クライアントの再接続では変わらない**——
 * `since` はサーバの `AgentTracker` が「状態が変わった時刻」として保持し、状態が変わらない限り
 * 同じ値を返す（`packages/server/src/agent/AgentTracker.ts:111`）。
 * サーバ再起動では `instanceId` ごと新しくなるので、別の出来事として扱われる（正しい）。
 *
 * **`since` を鍵から外すと、再接続のたびに同じ入力待ちを何度も知らせる**ことになる。
 */
export type NotifyKey = string;

export function notifyKeyOf(kind: NotifyKind, agent: AgentInfo): NotifyKey {
  return kind === "blocked" ? `blocked:${agent.instanceId}:${agent.since}` : `done:${agent.instanceId}:${agent.completionSeq}`;
}

/**
 * **スナップショットから作ってよい鍵**（design 振る舞い 2 のスナップショット経路）。
 *
 * **鍵の形だけでは「本当にその状態か」が分からない**ので、ここで確かめる。
 * `done:<instanceId>:<completionSeq>` は `completionSeq` が 0 でも成立してしまうし、
 * `blocked:<instanceId>:<since>` は `since` が常にあるので状態を問わず作れてしまう。
 * **守らないと、切断中に現れただけのエージェントに「完了しました」「入力待ちです」と言う**。
 *
 * イベント経路には `prev` との比較という別の守りがあるが、スナップショットには前の値が無いので
 * **この述語が唯一の守り**になる。
 */
export function snapshotKeys(agent: AgentInfo): { kind: NotifyKind; key: NotifyKey }[] {
  const out: { kind: NotifyKind; key: NotifyKey }[] = [];
  if (agent.state === "blocked") out.push({ kind: "blocked", key: notifyKeyOf("blocked", agent) });
  if (agent.completionSeq > 0) out.push({ kind: "done", key: notifyKeyOf("done", agent) });
  return out;
}

/** 利用者の状態（requirements の表の行を決める 2 つの軸）。 */
export interface Audience {
  windowFocused: boolean;
  /** その pane が**いま画面に出ているか**（`TerminalRegistry.isVisible`）。 */
  paneVisible: boolean;
}

/** 3 経路それぞれの入／切（`soda.prefs.v1` に保存する。AC6）。 */
export interface NotifyPrefs {
  toast: boolean;
  desktop: boolean;
  sound: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { toast: true, desktop: false, sound: false };

export interface Routes {
  toast: boolean;
  desktop: boolean;
  sound: boolean;
}

/**
 * requirements「知らせ方と、その使い分け」の表を、そのまま 1 つの関数にする（AC3）。
 *
 * | 利用者の状態 | OS 通知 | 音 | トースト |
 * |---|---|---|---|
 * | フォーカス無し | 出す | 鳴らす | 出す |
 * | フォーカス有り・その pane は非表示 | 出さない | 鳴らさない | 出す |
 * | その pane を見ている | 出さない | 鳴らさない | 出さない |
 *
 * **前面にいるときに OS 通知を重ねない**のは一般的な作法（Slack・Discord 等。research F92）。
 */
export function routesFor(a: Audience, prefs: NotifyPrefs): Routes {
  if (a.windowFocused && a.paneVisible) return { toast: false, desktop: false, sound: false };
  const away = !a.windowFocused;
  return { toast: prefs.toast, desktop: away && prefs.desktop, sound: away && prefs.sound };
}

/**
 * **待ち行列に入れるか**（design 振る舞い 4・decisions D4）。
 * **`routes.toast` では判定しない**——トーストを「切」にして OS 通知だけ「入」にした利用者で
 * 待ち行列が常に空になり、`prefix+o`（AC10・AC11）も OS 通知のクリック（AC15）も効かなくなる。
 * 見ている pane は「後で戻る先」ではないので、そこだけ外す。
 */
export function shouldQueue(a: Audience): boolean {
  return !(a.windowFocused && a.paneVisible);
}

export interface Decision {
  key: NotifyKey;
  routes: Routes;
  queue: boolean;
}

/**
 * **判定と鍵を 1 つの関数で返す**（design 振る舞い 2）。
 * 呼ぶ側は**必ず返ってきた `key` を「判定済み」に入れてから**遅延／配送へ進む——
 * 分かれていると、3 経路とも偽のときに入れ忘れ、**再接続のスナップショットで一斉に出る**。
 */
export function decide(kind: NotifyKind, agent: AgentInfo, a: Audience, prefs: NotifyPrefs): Decision {
  return { key: notifyKeyOf(kind, agent), routes: routesFor(a, prefs), queue: shouldQueue(a) };
}

/** 待ち行列の 1 件（design インターフェース「待ち行列の 1 件」）。 */
export interface QueuedNotification {
  key: NotifyKey;
  kind: NotifyKind;
  paneId: string;
  /** 出来事が起きた時点の呼び名（`describeTarget`）。**後から引き直さない**——
   *  対象が閉じられても、何の知らせだったかは読めるべき（AC11）。 */
  label: string;
  at: number;
  /** 対応するトーストの id。**トーストを「切」にしていれば `null`**（decisions D4）。 */
  toastId: number | null;
}

/** 待ち行列の上限（herdr の `MAX_QUEUED_NOTIFICATIONS = 8` と同じ）。 */
export const MAX_QUEUED = 8;

/**
 * 待ち行列へ 1 件積む（AC9）。**3 つの規則だけを herdr から移す**
 * （構造は違う——herdr は「見えている 1 枚＋待ち 8」で自動消去つき。research F55・F59）。
 *
 * 1. **同じ pane の古いものは消してから積む**（herdr `notification_policy.rs:119-132`）。
 * 2. **上限を超えたら最も古いものを捨てる**（同 `:50-53` の `pop_front`）。
 *
 * **押し出された件と置き換えられた件を `removed` で返す**——呼ぶ側がそのトーストと OS 通知を
 * 片付けられるようにするため（戻り値を捨てると、消えないトーストが画面に残る）。
 *
 * **順序の注意**: 置き換えのとき `removed` には**新しく積む件と同じ `paneId`** が入る。
 * OS 通知の `tag` は pane id なので、**新しい通知を出した後に置換分を片付けると、
 * その新しい通知まで閉じてしまう**。片付け（`drop` → `closeByTag`）は**通知を出す前**に行うこと。
 */
export function enqueue(queue: readonly QueuedNotification[], entry: QueuedNotification): { queue: QueuedNotification[]; removed: QueuedNotification[] } {
  const removed = queue.filter((q) => q.paneId === entry.paneId);
  const next = queue.filter((q) => q.paneId !== entry.paneId);
  next.push(entry);
  while (next.length > MAX_QUEUED) {
    const oldest = next.shift();
    if (oldest) removed.push(oldest);
  }
  return { queue: next, removed };
}

/** 鍵で 1 件外す。**出口をこの 1 本にまとめる**ことで、トーストと OS 通知の後始末が漏れない。 */
export function removeByKey(queue: readonly QueuedNotification[], key: NotifyKey): { queue: QueuedNotification[]; removed: QueuedNotification[] } {
  return { queue: queue.filter((q) => q.key !== key), removed: queue.filter((q) => q.key === key) };
}

/** pane ごと捨てる（pane が閉じたとき。herdr の `retire_endpoint_notifications` 相当）。 */
export function removeByPane(queue: readonly QueuedNotification[], paneId: string): { queue: QueuedNotification[]; removed: QueuedNotification[] } {
  return { queue: queue.filter((q) => q.paneId !== paneId), removed: queue.filter((q) => q.paneId === paneId) };
}
