import type { AgentInfo } from "@sodashitsu/protocol";
import type { NotifyKey, NotifyKind, QueuedNotification } from "./policy.js";

/**
 * 応答せずに閉じた知らせの履歴の規則（20261005-notify-bell。design「インターフェース」）。
 * **純関数だけ**——保存（`localStorage`）・状態（Pinia）・配線は `packages/web` 側。待ち行列（`policy.ts` の `enqueue` 等。未処理の知らせの行き先）とは
 * **別の置き場**で、ベルの件数はこちらだけを数える（二重に数えない）。
 */

/** 履歴の上限（件数）。同じ pane につき最新の 1 件だけなので、pane の数が多くても足りる。 */
export const MAX_HISTORY = 50;
/** 履歴の保持期間（出来事の時刻から）。 */
export const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** 履歴に入った理由（表示には使わない。テストと記録のため）。 */
export type HistoryReason = "dismissed" | "evicted" | "no-toast";

export interface HistoryEntry {
  key: NotifyKey;
  kind: NotifyKind;
  paneId: string;
  /** 鍵から取る（`parseNotifyKey`）。解消の判定（`isResolved`）に使う。 */
  instanceId: string;
  /** blocked: `since` / done: `completionSeq`（鍵から取る）。 */
  seq: number;
  /** 出来事の時点の呼び名（`describeTarget`）。後から引き直さない——対象が閉じられても何の知らせだったかは読める。 */
  label: string;
  /** 出来事の時刻（`QueuedNotification.at`）。 */
  at: number;
  reason: HistoryReason;
}

const KINDS: readonly NotifyKind[] = ["blocked", "done"];
const REASONS: readonly HistoryReason[] = ["dismissed", "evicted", "no-toast"];

/**
 * 鍵（`blocked:<instanceId>:<since>` / `done:<instanceId>:<completionSeq>`。`notifyKeyOf`）を分ける。
 * `instanceId` に `:` が入っていても読めるよう、最初と最後の `:` で切る。読めなければ `null`。
 */
export function parseNotifyKey(key: NotifyKey): { kind: NotifyKind; instanceId: string; seq: number } | null {
  const first = key.indexOf(":");
  const last = key.lastIndexOf(":");
  if (first <= 0 || last <= first) return null;
  const kind = key.slice(0, first);
  if (kind !== "blocked" && kind !== "done") return null;
  const instanceId = key.slice(first + 1, last);
  const seqText = key.slice(last + 1);
  if (instanceId === "" || !/^\d+$/.test(seqText)) return null;
  return { kind, instanceId, seq: Number(seqText) };
}

/** 待ち行列の 1 件から履歴の 1 件を作る。**鍵が読めなければ `null`**（履歴に入れない）。 */
export function historyEntryOf(q: QueuedNotification, reason: HistoryReason): HistoryEntry | null {
  const parsed = parseNotifyKey(q.key);
  if (!parsed || parsed.kind !== q.kind) return null;
  return { key: q.key, kind: q.kind, paneId: q.paneId, instanceId: parsed.instanceId, seq: parsed.seq, label: q.label, at: q.at, reason };
}

/** 期限（7 日）を過ぎたものを落とす。ちょうど 7 日は残す。 */
export function pruneExpired(list: readonly HistoryEntry[], now: number): HistoryEntry[] {
  return list.filter((e) => now - e.at <= HISTORY_RETENTION_MS);
}

/**
 * 1 件足す（追加順＝古い→新しい の配列を返す）。
 * 1. **同じ pane の古いものは消してから積む**（最新の 1 件。入力待ち→完了のように、同じ pane の新しい出来事は古い方を置き換える。`enqueue` と同じ規則）。
 * 2. 期限切れを落とす。
 * 3. 上限（50 件）を超えたら古い方から落とす。
 */
export function addHistory(list: readonly HistoryEntry[], entry: HistoryEntry, now: number): HistoryEntry[] {
  const next = list.filter((e) => e.paneId !== entry.paneId && e.key !== entry.key);
  next.push(entry);
  const live = pruneExpired(next, now);
  while (live.length > MAX_HISTORY) live.shift();
  return live;
}

export function removeHistoryByKey(list: readonly HistoryEntry[], key: NotifyKey): HistoryEntry[] {
  return list.filter((e) => e.key !== key);
}

export function removeHistoryByPane(list: readonly HistoryEntry[], paneId: string): HistoryEntry[] {
  return list.filter((e) => e.paneId !== paneId);
}

/** その pane の**いまの**状態（呼ぶ側が session・既読ストアから作る）。 */
export interface PaneNow {
  /** pane が（切断中に閉じられた分を含め）まだあるか。 */
  exists: boolean;
  agent: AgentInfo | null;
  /** その `instanceId` の既読の連番（`getSeenSeq(instanceId, agent.serverSeenSeq)`）。agent が無ければ使わない。 */
  seenSeq: number;
}

/**
 * **知らせの元の出来事が解消したか**（design「解消の判定」の表そのもの）。
 *
 * - pane が無い・エージェントが居ない・入れ替わった（`instanceId` が違う）→ どちらの種類も解消。
 * - blocked: 入力待ちでなくなった、または別の入力待ち（`since` が違う）に変わった → 解消。
 * - done: また動き出した（working／blocked）・次の完了が来た（`completionSeq` が進んだ）・完了を見た（既読が追いついた）→ 解消。
 *   `unknown`（検知の揺れの可能性）は解消と数えない。
 */
export function isResolved(entry: HistoryEntry, now: PaneNow): boolean {
  if (!now.exists) return true;
  const agent = now.agent;
  if (!agent) return true;
  if (agent.instanceId !== entry.instanceId) return true;
  if (entry.kind === "blocked") return agent.state !== "blocked" || agent.since !== entry.seq;
  if (agent.state === "working" || agent.state === "blocked") return true;
  if (agent.completionSeq > entry.seq) return true;
  return now.seenSeq >= entry.seq;
}

/** 全部を突き合わせて、解消したものを落とす。`removed` は落とした件（呼ぶ側の記録・テスト用）。 */
export function reconcileHistory(
  list: readonly HistoryEntry[],
  lookup: (paneId: string) => PaneNow,
): { list: HistoryEntry[]; removed: HistoryEntry[] } {
  const kept: HistoryEntry[] = [];
  const removed: HistoryEntry[] = [];
  for (const e of list) (isResolved(e, lookup(e.paneId)) ? removed : kept).push(e);
  return { list: kept, removed };
}

/**
 * 保存された値を履歴へ戻す（`localStorage` の中身は信用しない）。形の違う要素は捨てる。**鍵と `kind`・`instanceId`・`seq` の食い違うものも捨てる**
 * （手で書き換えられた値で解消の判定が狂わないように）。期限切れ・同じ pane の重複・上限超過も正規化する。
 */
export function parseHistory(raw: unknown, now: number): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  let out: HistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const { key, kind, paneId, instanceId, seq, label, at, reason } = r;
    if (typeof key !== "string" || typeof paneId !== "string" || typeof instanceId !== "string" || typeof label !== "string") continue;
    if (typeof seq !== "number" || !Number.isFinite(seq) || typeof at !== "number" || !Number.isFinite(at)) continue;
    if (!KINDS.includes(kind as NotifyKind) || !REASONS.includes(reason as HistoryReason)) continue;
    const parsed = parseNotifyKey(key);
    if (!parsed || parsed.kind !== kind || parsed.instanceId !== instanceId || parsed.seq !== seq) continue;
    out = addHistory(out, { key, kind: kind as NotifyKind, paneId, instanceId, seq, label, at, reason: reason as HistoryReason }, now);
  }
  return out;
}

/** ベルのバッヂの文字。0 件は空（バッヂを出さない）・100 件以上は `99+`。 */
export function badgeText(count: number): string {
  if (!(count > 0)) return "";
  return count > 99 ? "99+" : String(Math.floor(count));
}

/** 一覧の時刻（相対）。たった今（1 分未満）／n 分前／n 時間前／n 日前。未来の時刻は「たった今」。 */
export function ageLabel(now: number, at: number): string {
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 60) return "たった今";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 時間前`;
  return `${Math.floor(hour / 24)} 日前`;
}
