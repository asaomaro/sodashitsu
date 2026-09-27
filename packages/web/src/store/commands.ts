import type { CommandInfo, CommandListResult } from "@sodashitsu/protocol";
import { defineStore } from "pinia";
import { ref } from "vue";

/** 閉じた popup の控えを残す数（自分のものでない id も入るので、古いものから捨てる）。 */
export const CLOSED_POPUPS_MAX = 32;

/**
 * 独自コマンド（20260927-custom-command-keys）の一覧（**サーバ全体**の設定。ブラウザには保存しない）。接続ごとに `command.list` で取り直し
 * （`main.ts`）、`command.updated` イベント（`StoreAdapter`）・`reload_config`（`ActionDispatcher`）で置き換える。コマンドの文字列は来ない。
 *
 * `closedPopups` は、`command.run` の応答より先に届いた `command.popup_closed` の控え（popup の部品が応答の後に `takeClosed` で取り出す）。
 * 開いている popup そのものは部品（`CommandPopupSession`）が持つ（architecture の状態の持ち主の表）。
 */
export const useCommandsStore = defineStore("commands", () => {
  const catalog = ref<CommandInfo[]>([]);
  const problem = ref<string | null>(null);
  const closedPopups = new Map<string, number | undefined>();
  /** 閉じた知らせを受けるたびに進む（開いている popup の部品が `watch` する）。 */
  const closedSeq = ref(0);

  function setCatalog(r: CommandListResult): void {
    catalog.value = r.commands;
    problem.value = r.problem;
  }

  function notePopupClosed(popupId: string, exitCode?: number): void {
    closedPopups.delete(popupId);
    closedPopups.set(popupId, exitCode);
    while (closedPopups.size > CLOSED_POPUPS_MAX)
      closedPopups.delete(closedPopups.keys().next().value!);
    closedSeq.value++;
  }

  /** その popup の閉じた知らせを取り出して消す。来ていなければ `{ closed: false }`。 */
  function takeClosed(
    popupId: string,
  ): { closed: false } | { closed: true; exitCode: number | undefined } {
    if (!closedPopups.has(popupId)) return { closed: false };
    const exitCode = closedPopups.get(popupId);
    closedPopups.delete(popupId);
    return { closed: true, exitCode };
  }

  return { catalog, problem, closedSeq, setCatalog, notePopupClosed, takeClosed };
});
