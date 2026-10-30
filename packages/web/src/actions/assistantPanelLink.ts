import { AssistantPanelTarget } from "@sodashitsu/protocol";
import type { Pane, Tab } from "@sodashitsu/protocol";

export function assistantPanelTarget(hash: string) {
  if (!hash.startsWith("#assistantPane=")) return null;
  const params = new URLSearchParams(hash.slice(1));
  if ([...params.keys()].length !== 3) throw Error("アシスタントの表示先を確認できません。");
  return AssistantPanelTarget.parse(Object.fromEntries(params));
}
export function assistantPanelPane(
  target: NonNullable<ReturnType<typeof assistantPanelTarget>>,
  panes: ReadonlyMap<string, Pane>,
  tabs: ReadonlyMap<string, Tab>,
) {
  const pane = panes.get(target.assistantPane),
    tab = pane && tabs.get(pane.tabId);
  if (
    !pane ||
    !tab ||
    tab.workspaceId !== target.assistantWorkspace ||
    pane.agent?.instanceId !== target.assistantInstance
  )
    throw Error(
      "通知の端末が閉じたか、エージェントが変更されました。この窓を閉じて通知から開き直してください。",
    );
  return { pane, tab };
}
