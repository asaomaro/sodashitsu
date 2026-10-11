import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, join, sep } from "node:path";
import { RpcError, hasForbiddenChars, type ExtPane, type AgentKindsResult } from "@sodashitsu/protocol";
import { z } from "zod";
import type { SessionService } from "../session/SessionService.js";
import type { AgentStarter } from "../agent/AgentStarter.js";

export const TASK_AGENT_KINDS = ["claude", "codex"] as const;
export const TaskStartSchema = z.strictObject({ paneId:z.string(), kind:z.enum(TASK_AGENT_KINDS), taskFile:z.string().min(1).max(4096) });
type TaskStart = z.infer<typeof TaskStartSchema>;
export interface TaskAgentResult { paneId:string; kind:string; name:string; status:"submitted" }
export interface TaskAgentDeps {
  session:Pick<SessionService,"splitPane"|"getPane"|"getTab">;
  starter:Pick<AgentStarter,"start"|"isShellAvailable">;
  kinds:()=>Promise<AgentKindsResult>;
}
/** Only creates fresh work panes. No prompt or arbitrary argv can target existing terminals. */
export class TaskAgentLauncher {
  private active=new Map<string,{paneId:string; result:TaskAgentResult}>();
  private pending=new Map<string,{kind:string;promise:Promise<TaskAgentResult>}>();
  constructor(private deps:TaskAgentDeps) {}
  async kinds():Promise<AgentKindsResult> {
    return {kinds:(await this.deps.kinds()).kinds.filter(k=>TASK_AGENT_KINDS.includes(k.kind as typeof TASK_AGENT_KINDS[number]))};
  }
  start(key:string,p:TaskStart,target:()=>ExtPane):Promise<TaskAgentResult> {
    for(const [id,item] of this.active)if(!this.deps.session.getPane(item.paneId))this.active.delete(id);
    const bound=target();
    const id=JSON.stringify([key,bound.tabId,bound.projectDir,p.taskFile]);
    const pending=this.pending.get(id);if(pending){if(pending.kind!==p.kind)throw new RpcError("agent_pane_busy","別のエージェントで依頼の起動中です");return pending.promise;}
    const cached=this.active.get(id);
    if(cached && this.deps.session.getPane(cached.paneId)?.tabId!==bound.tabId)this.active.delete(id);
    const previous=this.active.get(id);
    if(previous && this.deps.session.getPane(previous.paneId)){if(previous.result.kind!==p.kind)throw new RpcError("agent_pane_busy","この制作には依頼済みの作業ペインがあります");return Promise.resolve(previous.result);}
    if(this.pending.size>=16 || this.active.size>=128)throw new RpcError("agent_pane_busy","自動依頼の件数上限に達しました");
    const promise=this.launch(p,target).then(result=>{this.active.set(id,{paneId:result.paneId,result});return result;}).finally(()=>this.pending.delete(id));
    this.pending.set(id,{kind:p.kind,promise});return promise;
  }
  private async launch(p:TaskStart,target:()=>ExtPane):Promise<TaskAgentResult> {
    const origin=target();
    let paneId:string|undefined;
    if(!origin.projectDir)throw new RpcError("invalid_params","PJフォルダを設定してください");
    const guard=()=>{const now=target();if(now.tabId!==origin.tabId || now.projectDir!==origin.projectDir)throw new RpcError("not_found","依頼先のPJまたはタブが変わりました");if(paneId && this.deps.session.getPane(paneId)?.tabId!==origin.tabId)throw new RpcError("not_found","新しい作業ペインが移動または削除されました");return now;};
    if(isAbsolute(p.taskFile)||p.taskFile.split(/[\\/]/).some(s=>!s||s==="."||s==="..")||hasForbiddenChars(p.taskFile))throw new RpcError("invalid_params","制作指示はPJ内の相対パスで指定してください");
    const root=await realpath(origin.projectDir);guard();
    const path=join(root,p.taskFile), file=await lstat(path);guard();
    if(!file.isFile()||file.size>65536||!(await realpath(path)).startsWith(root+sep))throw new RpcError("invalid_params","制作指示はPJ内の64KiB以下の通常ファイルが必要です");
    guard();
    if(!(await this.kinds()).kinds.some(k=>k.kind===p.kind&&k.available))throw new RpcError("unsupported_agent_kind","選択したエージェントはサーバで起動できません");
    guard();
    // The scoped target contains its tab, but may be a virtual app anchor.
    const workerId=origin.virtual ? undefined : origin.id;
    const worker=workerId ? this.deps.session.getPane(workerId) : undefined;
    const source=worker && !worker.virtual ? worker : this.deps.session.getPane(this.deps.session.getTab(origin.tabId!)?.focusedPaneId ?? "");
    if(!source)throw new RpcError("not_found","作業ペインが見つかりません");
    try {
      const created=await this.deps.session.splitPane(source.id,"right",undefined,{policy:"path",path:root});paneId=created.pane.id;guard();
      const until=Date.now()+8000;
      while(!(await this.deps.starter.isShellAvailable(paneId))){guard();if(Date.now()>=until)throw new RpcError("agent_pane_busy","新しい端末の起動が完了しませんでした");await new Promise(r=>setTimeout(r,50));}
      guard();if(this.deps.session.getPane(paneId)?.tabId!==origin.tabId)throw new RpcError("not_found","新しい作業ペインが移動または削除されました");
      const name="task-"+randomUUID().replaceAll("-","").slice(0,20);
      const prompt=`制作指示ファイル ${JSON.stringify(path)} を読み、指定されたスキルに従って制作を進めてください。成果物を制作フォルダに保存し、指示ファイルのコマンドで進捗を更新してください。`;
      await this.deps.starter.start({paneId,name,kind:p.kind,args:[prompt]},guard,{skipInterrupt:true,beforeWrite:guard});
      return {paneId,kind:p.kind,name,status:"submitted"};
    } catch(err) {
      // Preserve failed panes for inspection; a user may already be interacting with the fresh terminal.
      if(paneId)throw new RpcError(err instanceof RpcError?err.code:"agent_start_input_failed",`${err instanceof Error?err.message:'起動に失敗しました'} · 作業ペイン ${paneId}`);
      throw err;
    }
  }
}
