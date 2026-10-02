import type { AskPending } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）の待ち行列。pane のプログラムが出した質問を受けた順に持ち、先頭を `AskDialog` が出す
 * （同時に別の pane から来ても 1 つずつ）。**サーバが持つ回答待ちの写し**で、接続ごとに `ask.subscribe` の応答で丸ごと置き換える。
 */
export const useAskStore = defineStore("ask", () => {
  const queue = ref<AskPending[]>([]);
  /** いま出す質問（先頭）。 */
  const current = computed<AskPending | null>(() => queue.value[0] ?? null);

  /** `ask.subscribe` の応答（接続ごと）で丸ごと置き換える。 */
  function replaceAll(asks: readonly AskPending[]): void {
    queue.value = [...asks];
  }

  /** `ask.opened` の後に `ask.get` で取った質問を足す（同じ askId は足さない）。 */
  function add(ask: AskPending): void {
    if (queue.value.some((a) => a.askId === ask.askId)) return;
    queue.value = [...queue.value, ask];
  }

  /** 閉じた質問を外す（`ask.closed`・回答／取り消しの後）。知らない id は何もしない。 */
  function remove(askId: string): void {
    if (!queue.value.some((a) => a.askId === askId)) return;
    queue.value = queue.value.filter((a) => a.askId !== askId);
  }

  /** 切断・マシンの切り替えで空にする。 */
  function clear(): void {
    queue.value = [];
  }

  return { queue, current, replaceAll, add, remove, clear };
});
