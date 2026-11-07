import {expect,it} from "vitest";
import {isAssistantPane,type Pane,type Workspace,type Tab} from "./model.js";
it("hides only the exact owned pane through its real tab and workspace",()=>{
 const pane={id:"captain",tabId:"tab"} as Pane;
 const tab={id:"tab",workspaceId:"workspace"} as Tab;
 const workspace={id:"workspace",assistant:{paneId:"captain"}} as Workspace;
 expect(isAssistantPane(pane,workspace,tab)).toBe(true);
 expect(isAssistantPane({...pane,id:"sibling"},workspace,tab)).toBe(false);
 expect(isAssistantPane(pane,{...workspace,id:"foreign"},tab)).toBe(false);
 expect(isAssistantPane(pane,workspace,{...tab,id:"foreign"})).toBe(false);
 expect(isAssistantPane(pane,undefined,tab)).toBe(false);
 expect(isAssistantPane(pane,workspace,undefined)).toBe(false);
 expect(isAssistantPane(pane,{...workspace,assistant:undefined} as unknown as Workspace,tab)).toBe(false);
});
