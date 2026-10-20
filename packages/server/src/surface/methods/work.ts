import { WorkMethods, WorkTransferMethods, WorkAgentMethods, RpcError } from "@sodashitsu/protocol";
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
    surface.register("work.agent_request", { schema: WorkAgentMethods["work.agent_request"], handler: (ctx, p) => { auth(ctx); return requests.create(p); } });
    surface.register("work.agent_requests", { schema: WorkAgentMethods["work.agent_requests"], handler: (ctx, p) => { auth(ctx); return requests.list(p.paneId); } });
    surface.register("work.agent_claim", { schema: WorkAgentMethods["work.agent_claim"], handler: (ctx, p) => { auth(ctx); return requests.claim(p.id); } });
    surface.register("work.agent_finish", { schema: WorkAgentMethods["work.agent_finish"], handler: (ctx, p) => { auth(ctx); return requests.finish(p.id, p.claim, p.state); } });
    surface.register("work.agent_reject", { schema: WorkAgentMethods["work.agent_reject"], handler: (ctx, p) => { auth(ctx); return requests.reject(p.id); } });
  }
  if (deps.workAgentLauncher) surface.register("work.agent_launch", { schema: WorkAgentMethods["work.agent_launch"], handler: (ctx, p) => { auth(ctx); return deps.workAgentLauncher!.launch(p.machineId, p.requestId); } });
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
