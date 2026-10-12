import type { TabViewInstance } from "@sodashitsu/protocol";
/** インスタンスの表示先と情報元を分離する。タブ側のペイン機能は焦点に追従。 */
export function viewInformation(
  view: TabViewInstance,
  focusedPaneId: string,
): TabViewInstance & { sourcePaneId?: string } {
  return {
    ...view,
    ...((view.informationTarget ?? view.target) === "pane"
      ? { sourcePaneId: view.target === "tab" ? focusedPaneId : view.paneId }
      : {}),
  };
}
