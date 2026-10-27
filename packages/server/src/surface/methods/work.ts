import { WorkMethods, WorkTransferMethods, WorkAgentMethods, WorkspaceToolsParams, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface, MethodContext } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
export function registerWorkMethods(surface: ControlSurface, deps: MethodDeps): void {
  const work = deps.work;
  if (!work) return;
  const auth = (ctx: MethodContext) => {
    if (!ctx.connection || !ctx.connectionAuthorized?.()) throw new RpcError("unauthorized", "A live authenticated connection is required");
  };
  const requests = deps.workAgentRequests;
  if (requests) {
    surface.register("work.agent_terminal_ask_start",{schema:WorkAgentMethods["work.agent_terminal_ask_start"],handler:(ctx,p)=>{auth(ctx);return requests.terminalAskStart(ctx.clientId,p.id,p.claim,p.params,()=>auth(ctx));}});
    surface.register("work.agent_terminal_ask_read",{schema:WorkAgentMethods["work.agent_terminal_ask_read"],handler:(ctx,p)=>{auth(ctx);return requests.terminalAskRead(ctx.clientId,p.id,p.claim,p.questionId);}});
    surface.register("work.agent_terminal_end",{schema:WorkAgentMethods["work.agent_terminal_end"],handler:(ctx,p)=>{auth(ctx);return requests.terminalEnd(p.id,p.claim);}});
    surface.register("work.agent_terminal_open",{schema:WorkAgentMethods["work.agent_terminal_open"],handler:(ctx,p)=>{auth(ctx);return requests.terminalOpen(p.id,p.claim);}});
    surface.register("work.agent_terminal_exchange",{schema:WorkAgentMethods["work.agent_terminal_exchange"],handler:(ctx,p)=>{auth(ctx);return requests.terminalExchange(p.id,p.claim,p);}});
    surface.register("work.agent_terminal_read",{schema:WorkAgentMethods["work.agent_terminal_read"],handler:(ctx,p)=>{auth(ctx);return requests.terminalRead(ctx.clientId,p.id,p);}});
    surface.register("work.agent_terminal_close",{schema:WorkAgentMethods["work.agent_terminal_close"],handler:(ctx,p)=>{auth(ctx);return requests.terminalClose(ctx.clientId,p.id);}});
    surface.register("work.agent_request", { schema: WorkAgentMethods["work.agent_request"], handler: (ctx, p) => { auth(ctx); return requests.create(p,undefined,ctx.clientId,()=>auth(ctx)); } });
    surface.register("work.agent_requests", { schema: WorkAgentMethods["work.agent_requests"], handler: (ctx, p) => { auth(ctx); return requests.list(p.paneId); } });
    surface.register("work.agent_claim", { schema: WorkAgentMethods["work.agent_claim"], handler: (ctx, p) => { auth(ctx); return requests.claim(p.id); } });
    surface.register("work.agent_finish", { schema: WorkAgentMethods["work.agent_finish"], handler: (ctx, p) => { auth(ctx); return requests.finish(p.id, p.claim, p.state); } });
    surface.register("work.agent_reject", { schema: WorkAgentMethods["work.agent_reject"], handler: (ctx, p) => { auth(ctx); return requests.reject(p.id); } });
    surface.register("work.agent_poll", { schema: WorkAgentMethods["work.agent_poll"], handler: (ctx, p) => { auth(ctx); return requests.poll(p.id,p.claim,p.paneId,p.state); } });
    surface.register("work.agent_instruction_result", { schema: WorkAgentMethods["work.agent_instruction_result"], handler: (ctx, p) => { auth(ctx); return requests.instructionResult(p.id,p.claim,p.instructionId,p.state,p.message); } });
    surface.register("work.agent_plugin", { schema: WorkAgentMethods["work.agent_plugin"], handler: (ctx, p) => { auth(ctx); return requests.plugin(p.id,p.claim,p.request); } });
    surface.register("work.agent_check", { schema: WorkAgentMethods["work.agent_check"], handler: (ctx, p) => { auth(ctx); return requests.check(p.id,p.claim); } });
    surface.register("work.agent_tool",{schema:WorkAgentMethods["work.agent_tool"],handler:async(ctx,p)=>{
      auth(ctx);
      return requests.operate(p.id,p.claim,async(scope,sourcePaneId,guard)=>{
        const tool=p.tool;const check=()=>{auth(ctx);guard();};check();
        if(tool.operation==="transfer")throw new RpcError("invalid_params","転送は操作元から開始してください");
        if(tool.operation==="transfer_chunk")return work.transfer({...scope,request:tool.request},ctx.clientId,check);
        if(tool.operation==="inspect")return work.inspect(scope);
        if(tool.operation==="skill")return work.skill({...scope,id:tool.id,path:tool.path});
        if(tool.operation==="plugin")return requests.plugin(p.id,p.claim,tool.request);
        if(tool.operation==="memory")return work.memory(WorkMethods["work.memory"].parse({...scope,sourcePaneId,action:tool.action,name:tool.name,...(tool.content!==undefined?{content:tool.content}:{}),...(tool.version?{version:tool.version}:{})}),check);
        if(tool.operation==="file"){
          if(!deps.workspaceTools)throw new RpcError("not_found","ファイル操作を利用できません");
          return deps.workspaceTools.run(WorkspaceToolsParams.parse({...scope,operation:tool.action,path:tool.path,...(tool.query!==undefined?{query:tool.query,grep:true}:{}),...(tool.content!==undefined?{content:tool.content}:{}),...(tool.version?{version:tool.version}:{})}),check);
        }
        if(!deps.exec)throw new RpcError("not_found","コマンド実行を利用できません");
        const cwd=await work.scope(scope);check();
        return deps.exec.start(ctx.clientId,{command:tool.command,cwd,timeoutMs:tool.timeoutMs,encoding:tool.encoding});
      });
    }});
  }
  if (deps.workAgentLauncher) surface.register("work.agent_launch", { schema: WorkAgentMethods["work.agent_launch"], handler: (ctx, p) => { auth(ctx); return deps.workAgentLauncher!.launch(p.machineId, p.requestId); } });
  surface.register("work.file_transfer", { schema: WorkMethods["work.file_transfer"], handler: (ctx, p) => { auth(ctx); return work.transfer(p, ctx.clientId, () => auth(ctx)); } });
  surface.register("work.binding", { schema: WorkMethods["work.binding"], handler: (ctx, p) => { auth(ctx); return work.binding(p); } });
  surface.register("work.inspect", { schema: WorkMethods["work.inspect"], handler: (ctx, p) => { auth(ctx); return work.inspect(p); } });
  if (deps.exec) surface.register("work.exec", { schema: WorkMethods["work.exec"], handler: async (ctx, p) => {
    auth(ctx); const cwd = await work.scope(p); auth(ctx);
    return deps.exec!.start(ctx.clientId, { command: p.command, cwd, timeoutMs: p.timeoutMs, encoding: p.encoding });
  } });
  surface.register("work.skill", { schema: WorkMethods["work.skill"], handler: (ctx, p) => { auth(ctx); return work.skill(p); } });
  surface.register("work.memory", { schema: WorkMethods["work.memory"], handler: (ctx, p) => { auth(ctx); return work.memory(p); } });
  const transfers = deps.workTransfers;
  if (transfers) {
    surface.register("work.export_start", { schema: WorkTransferMethods["work.export_start"], handler: (ctx, p) => { auth(ctx); return transfers.exportStart(ctx.clientId, p.paneId); } });
    surface.register("work.export_read", { schema: WorkTransferMethods["work.export_read"], handler: (ctx, p) => { auth(ctx); return transfers.exportRead(ctx.clientId, p.id, p.offset); } });
    surface.register("work.import_start", { schema: WorkTransferMethods["work.import_start"], handler: (ctx, p) => { auth(ctx); return transfers.importStart(ctx.clientId, p); } });
    surface.register("work.import_chunk", { schema: WorkTransferMethods["work.import_chunk"], handler: (ctx, p) => { auth(ctx); return transfers.importChunk(ctx.clientId, p.id, p.offset, p.data); } });
    surface.register("work.import_finish", { schema: WorkTransferMethods["work.import_finish"], handler: (ctx, p) => { auth(ctx); return transfers.importFinish(ctx.clientId, p.id); } });
  }
}
