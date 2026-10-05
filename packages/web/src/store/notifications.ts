import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
  addHistory as addHistoryPure,
  enqueue as enqueuePure,
  parseHistory,
  reconcileHistory as reconcileHistoryPure,
  removeHistoryByKey,
  removeHistoryByPane,
  type HistoryEntry,
  type PaneNow,
  loadNotifyPrefs as loadNotifyPrefsValue,
  removeByKey as removeByKeyPure,
  removeByPane as removeByPanePure,
  type NotifyKey,
  type NotifyPrefs,
  type QueuedNotification,
} from "@sodashitsu/client-core";
import { readPrefs, writePrefs } from "./view.js";

/**
 * 通知の状態（20260920-agent-notifications の design 概要）。
 * **純粋な規則は `notify/policy.ts`**、**ブラウザ API は `notify/*Port` の実装**、
 * **ここは状態だけ**——3 つを混ぜない。
 */

/** 保存された通知の設定を読む（値ごとに既定へ落とす）。`raw` は `soda.prefs.v1` の `notify`（省略時は読む。サーバから受けた値の反映は渡す。20260927-cli-mode）。 */
export function loadNotifyPrefs(raw: unknown = readPrefs()["notify"]): NotifyPrefs {
  return loadNotifyPrefsValue(raw); // 正規化は client-core（端末版と同じ規則）
}

/**
 * 応答せずに閉じた知らせの履歴の保存先（20261005-notify-bell の design・decisions D2）。**このブラウザの localStorage だけ**（サーバの共有の設定へは載せない）——
 * pane・エージェントの id はマシンごとに衝突し、「閉じた」はこのブラウザでの操作だから。値は `{ [マシンの scope]: HistoryEntry[] }`（`seen.ts` の `seenKeyFor` と同じ scope）。
 */
export const NOTIFY_HISTORY_STORAGE_KEY = "soda.notifyHistory.v1";

function readHistoryMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(NOTIFY_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {}; // 読めない・壊れている環境でも空の履歴で動く
  }
}

function loadHistory(scope: string): HistoryEntry[] {
  return parseHistory(readHistoryMap()[scope], Date.now());
}

function saveHistory(scope: string, list: readonly HistoryEntry[]): void {
  try {
    const map = readHistoryMap();
    if (list.length === 0) delete map[scope];
    else map[scope] = list;
    localStorage.setItem(NOTIFY_HISTORY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 保存できなくても致命的ではない（この画面の間だけ残る＝メモリだけで動く）。
  }
}

function loadFlag(key: string): boolean {
  return readPrefs()[key] === true;
}

export const useNotificationsStore = defineStore("notifications", () => {
  const prefs = ref<NotifyPrefs>(loadNotifyPrefs());

  /**
   * **判定済み**の鍵（`Map<paneId, Set<NotifyKey>>`）。「知らせ済み」ではない——
   * **出さないと決めた場合も入れる**。入れないと「見ていたから出さなかった」出来事が
   * 再接続のスナップショットで一斉に出る（AC14）。
   *
   * **掃除は件数の上限ではなく pane の寿命**（`forgetPane`）。件数の LRU にすると、
   * **長く入力待ちのままの鍵ほど古い側に落ちて押し出され、再接続で再通知される**。
   */
  const judged = ref(new Map<string, Set<NotifyKey>>());

  /** 未処理の知らせ（`prefix+o` の行き先）。**最大 8 件**（`policy.MAX_QUEUED`）。 */
  const queue = ref<QueuedNotification[]>([]);

  /** 案内（AC5）。`pending` は「最初の出来事を判定した」印で、**出したかどうかではない**。 */
  const hintPending = ref(loadFlag("notifyHintPending"));
  const hintDone = ref(loadFlag("notifyHintDone"));
  /** いま出している案内のトーストの id。**重ねないための印**（無いとフォーカスのたびに増える）。 */
  const hintToastId = ref<number | null>(null);

  /** この環境で OS 通知を出せるか。Android Chrome は `new Notification()` が throw するので**出してみるまで分からない**。 */
  const desktopUsable = ref(true);
  /**
   * **いま音を鳴らせない状態か**（AC13。自動再生の制限に掛かっている）。
   * 立てるのは鳴らせなかった知らせ、下ろすのは**鳴った時点と、解除できた時点**
   * （`NotificationController.#unlockSound()`。D12）——「直近の再生の結果」ではない。
   * 下ろす側を再生だけにすると、**解除できているのに設定が「押せば鳴る」と言い続ける**。
   */
  const soundBlocked = ref(false);
  /** この環境で音を鳴らせるか（`AudioContext` が無い／作れない）。**一度立てたら下ろさない**（環境の性質）。 */
  const soundUsable = ref(true);

  const queueLength = computed(() => queue.value.length);

  /**
   * **応答せずに閉じた知らせの履歴**（追加順＝古い→新しい。**いまのマシンの scope の分だけ**）。待ち行列（`queue`）とは別の置き場で、ベルの件数はこちらだけを数える。
   * 規則（同じ pane につき最新の 1 件・50 件・7 日・解消の判定）は `client-core/notify/history.ts`。
   */
  const historyScope = ref("local");
  const history = ref<HistoryEntry[]>(loadHistory("local"));
  const historyCount = computed(() => history.value.length);

  function setHistory(next: HistoryEntry[]): void {
    history.value = next;
    saveHistory(historyScope.value, next);
  }

  /** 1 件足す（同じ pane の古いものは置き換わる）。 */
  function addHistory(entry: HistoryEntry): void {
    setHistory(addHistoryPure(history.value, entry, Date.now()));
  }

  /** 鍵で外す。外した件があれば `true`。 */
  function removeHistory(key: string): boolean {
    const next = removeHistoryByKey(history.value, key);
    if (next.length === history.value.length) return false;
    setHistory(next);
    return true;
  }

  function removeHistoryPane(paneId: string): void {
    const next = removeHistoryByPane(history.value, paneId);
    if (next.length !== history.value.length) setHistory(next);
  }

  function clearHistory(): void {
    if (history.value.length > 0) setHistory([]);
  }

  /** 解消した件を落とす（`lookup` はその pane のいまの状態）。落とした件を返す。 */
  function reconcileHistory(lookup: (paneId: string) => PaneNow): HistoryEntry[] {
    const r = reconcileHistoryPure(history.value, lookup);
    if (r.removed.length > 0) setHistory(r.list);
    return r.removed;
  }

  /** マシンの切り替え（`main.ts` の `setSeenScope` と同じ契機）。切り替え先の履歴を読み込む。**掃除は切り替え先の最初のスナップショット**で行う。 */
  function setHistoryScope(scope: string): void {
    if (scope === historyScope.value) return;
    historyScope.value = scope;
    history.value = loadHistory(scope);
  }

  function setPrefs(patch: Partial<NotifyPrefs>): void {
    prefs.value = { ...prefs.value, ...patch };
    writePrefs({ notify: { ...prefs.value } });
  }

  function markJudged(paneId: string, key: NotifyKey): void {
    const set = judged.value.get(paneId) ?? new Set<NotifyKey>();
    set.add(key);
    judged.value.set(paneId, set);
  }

  function isJudged(paneId: string, key: NotifyKey): boolean {
    return judged.value.get(paneId)?.has(key) === true;
  }

  /** pane が閉じたら、その pane の鍵をまとめて捨てる（件数で切らない理由は `judged` の注記）。 */
  function forgetPane(paneId: string): void {
    judged.value.delete(paneId);
  }

  /** **基準線を引く**（初回のスナップショット）。何も知らせずに鍵だけ入れる。 */
  function baseline(entries: { paneId: string; keys: NotifyKey[] }[]): void {
    for (const e of entries) for (const k of e.keys) markJudged(e.paneId, k);
  }

  /** 1 件積む。**押し出された／置き換えられた件を返す**（呼ぶ側が片付ける。戻り値を捨てない）。 */
  function push(entry: QueuedNotification): QueuedNotification[] {
    const r = enqueuePure(queue.value, entry);
    queue.value = r.queue;
    return r.removed;
  }

  function removeKey(key: NotifyKey): QueuedNotification[] {
    const r = removeByKeyPure(queue.value, key);
    queue.value = r.queue;
    return r.removed;
  }

  function removePane(paneId: string): QueuedNotification[] {
    const r = removeByPanePure(queue.value, paneId);
    queue.value = r.queue;
    return r.removed;
  }

  /** トーストが（利用者の操作などで）消えた件を待ち行列から外す。**`dismissToast` は呼ばない**（再入を避ける）。 */
  function dropMissingToasts(aliveToastIds: ReadonlySet<number>): QueuedNotification[] {
    const gone = queue.value.filter((q) => q.toastId != null && !aliveToastIds.has(q.toastId));
    if (gone.length > 0) queue.value = queue.value.filter((q) => q.toastId == null || aliveToastIds.has(q.toastId));
    return gone;
  }

  function setHintPending(v: boolean): void {
    hintPending.value = v;
    writePrefs({ notifyHintPending: v });
  }

  function setHintDone(v: boolean): void {
    hintDone.value = v;
    writePrefs({ notifyHintDone: v });
  }

  return {
    prefs,
    judged,
    queue,
    queueLength,
    history,
    historyScope,
    historyCount,
    addHistory,
    removeHistory,
    removeHistoryPane,
    clearHistory,
    reconcileHistory,
    setHistoryScope,
    hintPending,
    hintDone,
    hintToastId,
    desktopUsable,
    soundBlocked,
    soundUsable,
    setPrefs,
    markJudged,
    isJudged,
    forgetPane,
    baseline,
    push,
    removeKey,
    removePane,
    dropMissingToasts,
    setHintPending,
    setHintDone,
  };
});
