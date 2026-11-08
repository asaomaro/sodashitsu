import {assistantPanelPane,type assistantPanelTarget} from "../actions/assistantPanelLink.js";
import type {Pane,Tab,Workspace} from "@sodashitsu/protocol";
export type AssistantPinnedTarget=NonNullable<ReturnType<typeof assistantPanelTarget>>;
interface RawModel {panes:ReadonlyMap<string,Pane>;tabs:ReadonlyMap<string,Tab>;workspaces:ReadonlyMap<string,Workspace>}
interface FocusView {workspaceId:string|null;tabId:string|null;focusedPaneId:string|null}
/** Dedicated reply window only. Ordinary navigation/history keeps using the normal projection.
 * The input guard separately checks machine, project continuity and every final write. */
export function focusAssistantPanelView(target:AssistantPinnedTarget,model:RawModel,view:FocusView):boolean {
 try{
  const {pane,tab}=assistantPanelPane(target,model.panes,model.tabs);
  if(!model.workspaces.has(tab.workspaceId))return false;
  view.workspaceId=tab.workspaceId;view.tabId=tab.id;view.focusedPaneId=pane.id;
  return true;
 }catch{return false;}
}
