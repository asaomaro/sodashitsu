import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { WorkMethods, WorkTransferMethods, WorkAgentMethods } from "@sodashitsu/protocol";
import { registerWorkMethods } from "./work.js";
import { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
it("keeps work and transfer methods off unauthenticated/internal/pane contexts", async () => {
  const work = { binding: vi.fn(), inspect: vi.fn(), scope: vi.fn(), skill: vi.fn(), memory: vi.fn() }, transfers = { exportStart: vi.fn(), exportRead: vi.fn(), importStart: vi.fn(), importChunk: vi.fn(), importFinish: vi.fn() };
  const requests = { create: vi.fn(), list: vi.fn(), claim: vi.fn(), finish: vi.fn(), reject: vi.fn() }, launcher = { launch: vi.fn() };
  const surface = new ControlSurface(); registerWorkMethods(surface, { work, workTransfers: transfers, workAgentRequests: requests, workAgentLauncher: launcher, exec: { start: vi.fn() } } as unknown as MethodDeps);
  const scope = { workspaceId: randomUUID(), expectedFolder: "/target", agentKind: "codex" };
  const id = randomUUID(), params: Record<string, unknown> = {
    "work.file_transfer": { ...scope, request: {action:"read_start",path:"report.xlsx"} },
    "work.binding": { action: "get", paneId: id }, "work.inspect": scope, "work.exec": { ...scope, command: "true" },
    "work.skill": { ...scope, id: "a".repeat(64) }, "work.memory": { ...scope, action: "list", sourcePaneId: id },
    "work.export_start": { paneId: id }, "work.export_read": { id, offset: 0 },
    "work.import_start": { ...scope, meta: { kind: "codex", sessionId: id, sourcePaneId: id, bytes: 1, sha256: "a".repeat(64), memories: [], warnings: [] } },
    "work.import_chunk": { id, offset: 0, data: "YQ==" }, "work.import_finish": { id },
    "work.agent_terminal_open":{id,claim:id},"work.agent_terminal_end":{id,claim:id},
    "work.agent_terminal_exchange":{id,claim:id,epoch:id,ack:0},"work.agent_terminal_read":{id,ack:0},"work.agent_terminal_close":{id},
    "work.agent_terminal_ask_start":{id,claim:id,params:{}},"work.agent_terminal_ask_read":{id,claim:id,questionId:id},
    "work.agent_request": { paneId: id, agentKind: "claude", args: [] }, "work.agent_requests": {},
    "work.agent_claim": { id }, "work.agent_finish": { id, claim: id, state: "launched" }, "work.agent_reject": { id },
    "work.agent_launch": { machineId: "a".repeat(32), requestId: id },
    "work.agent_poll":{id,claim:id,paneId:id,state:"idle"},
    "work.agent_instruction_result":{id,claim:id,instructionId:id,state:"sent"},
    "work.agent_plugin":{id,claim:id,request:{action:"operations"}},
    "work.agent_check":{id,claim:id},
    "work.agent_tool":{id,claim:id,tool:{operation:"inspect"}},
  };
  const base = { clientId: "a", sink: { clientId: "a", bufferedAmount: 0, sendOutput() {}, sendSnapshot() {} } };
  for (const name of Object.keys({ ...WorkMethods, ...WorkTransferMethods, ...WorkAgentMethods })) for (const ctx of [base, { ...base, connection: {} }, { ...base, connection: {}, connectionAuthorized: () => false }])
    expect(await surface.invoke(ctx as never, name, params[name])).toMatchObject({ ok: false, error: { code: "unauthorized" } });
  for (const fn of [...Object.values(work), ...Object.values(transfers), ...Object.values(requests), launcher.launch]) expect(fn).not.toHaveBeenCalled();
});

it("retains memory filename and file-search validation when using a fixed plugin lease",async()=>{
  const id=randomUUID(),scope={workspaceId:randomUUID(),expectedFolder:"/project",expectedRoot:"/project",expectedIdentity:"a".repeat(64),agentKind:"codex"};
  const work={memory:vi.fn(async(_params:unknown)=>({files:[]}))},tools={run:vi.fn()};
  const requests={operate:async(_id:string,_claim:string,fn:Function)=>fn(scope,id,()=>{})};
  const surface=new ControlSurface();registerWorkMethods(surface,{work,workAgentRequests:requests,workspaceTools:tools} as unknown as MethodDeps);
  const ctx={clientId:"a",connection:{},connectionAuthorized:()=>true,sink:{}} as never;
  const call=(tool:object)=>surface.invoke(ctx,"work.agent_tool",{id,claim:id,tool});
  for(const name of ["../../../outside.md","CON","NUL.txt","bad.","folder/file.md"])
    expect((await call({operation:"memory",action:"read",name})).ok).toBe(false);
  expect(work.memory).not.toHaveBeenCalled();
  expect((await call({operation:"memory",action:"list",name:"MEMORY.md"})).ok).toBe(true);
  expect(work.memory.mock.calls[0]?.[0]).toMatchObject({...scope,sourcePaneId:id});
  expect((await call({operation:"file",action:"search",query:"x".repeat(257)})).ok).toBe(false);expect(tools.run).not.toHaveBeenCalled();
});
