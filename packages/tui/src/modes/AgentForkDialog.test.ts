import { describe,it,expect,vi } from "vitest";
import { chordToKeyInput } from "@sodashitsu/client-core";
import type { RequestPort } from "../term/PaneRegistry.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { snapshot } from "../testing/fixtures.js";
import { AgentForkDialog } from "./AgentForkDialog.js";
const preview={available:true,worktreeAvailable:true,suggestedBranch:"fork/topic",sourceDir:"/repo",targetPath:"/wt/topic",dirtyCount:0};
function setup(){
 const calls:[string,unknown][]=[];const model=new SessionModel();model.applySnapshot(snapshot(),"c1");const ui=new UiState(model,()=>{});ui.openDialogWithContext({kind:"agentFork",paneId:"p1"});
 const conn={request:async(method:string,params:unknown)=>{calls.push([method,params]);return method==="agent.fork_preview"?preview:{paneId:"p2"};}} as RequestPort;
 const focus=vi.fn();const d=new AgentForkDialog("p1",ui,conn,()=>{},focus);return {d,calls,ui,focus};
}
const tick=()=>Promise.resolve();
describe("端末のfork画面",()=>{
 it("初期名を消しても勝手に復活せず、カーソル移動だけでは要求しない",async()=>{
  const {d,calls}=setup();await tick();d.handleKey(chordToKeyInput("Tab"));d.handleKey(chordToKeyInput("ctrl+u"));await tick();
  d.handleKey(chordToKeyInput("a"));await tick();expect(calls.at(-1)).toEqual(["agent.fork_preview",{paneId:"p1",branch:"a"}]);
  const n=calls.length;d.handleKey(chordToKeyInput("Left"));await tick();expect(calls).toHaveLength(n);d.dispose();
 });
 it("確定は選んだ行き先とブランチを送り、新しいペインへ移る",async()=>{
  const {d,calls,focus,ui}=setup();await tick();d.handleKey(chordToKeyInput("Space"));await tick();d.handleKey(chordToKeyInput("Enter"));await tick();
  expect(calls).toContainEqual(["agent.fork",{paneId:"p1",target:{kind:"worktree",branch:"fork/topic"},note:true}]);expect(focus).toHaveBeenCalledWith("p2");expect(ui.dialogContext).toBeNull();
 });
 it("閉じた画面の応答が来てもフォーカスを奪わない",async()=>{
  const {d,focus}=setup();await tick();d.handleKey(chordToKeyInput("Enter"));d.dispose();await tick();expect(focus).not.toHaveBeenCalled();
 });
});
