import {resourceHostIdentity} from "@sodashitsu/client-core/nodeResourceIdentity";
import { ResourceAppReportParams,type ResourceProcess } from "@sodashitsu/protocol";
import { ProcessResourceSampler } from "./ResourceProcesses.js";
import { MachineAddParams, MachineManageParams } from "@sodashitsu/protocol";
import {
  PairingStartParams,
  PairingConfirmParams,
  PairingRejectParams,
} from "@sodashitsu/protocol";
import { SystemResourceSampler } from "./SystemResources.js";
import {
  RpcError,
  ServerStopParams,
  DelegationInviteParams,
  DelegationStartParams,
  DelegationStopParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * サーバの停止（20260927-cli-mode。design「server」）。認証済みの接続（`/ws` の upgrade が Cookie と Origin を検査する）から受け、**応答を返してから**
 * 制御の socket の止める指示（`soda session stop`）と同じ経路（`ComposedServer.onStopRequest` に登録した停止の手順）で止める。全 OS で使える。
 *
 * 受け付けの判断（引き継ぎの最中は断る・止まる途中なら何もしない・止める手順が無ければ断る）は制御の socket と共有する（`handoff/controlRequests.ts`）。
 * 止める手順は返事の後に呼ばれるので、返事の中で次の macrotask（`setImmediate`）まで待ち、この方式の応答をクライアントへ書き終えてから止め始める。
 */
export function registerServerMethods(surface: ControlSurface, deps: MethodDeps): void {
  if (deps.delegations) {
    const d = deps.delegations;
    surface.register("machine.add", { schema: MachineAddParams, handler: (_ctx, p) => d.add(p) });
    surface.register("machine.connections", {
      schema: ServerStopParams,
      handler: () => d.connections(),
    });
    surface.register("machine.manage", {
      schema: MachineManageParams,
      handler: (_ctx, p) => d.manage(p.id, p.action),
    });
    surface.register("machine.request_delegation", {
      schema: PairingStartParams,
      handler: (_ctx, p) => d.requestPairing(p.url, p.label),
    });
    surface.register("machine.confirm_delegation", {
      schema: PairingConfirmParams,
      handler: (_ctx, p) => d.confirmPairing(p.id, p.code),
    });
    surface.register("machine.pairing_requests", {
      schema: ServerStopParams,
      handler: () => d.pairing.list(),
    });
    surface.register("machine.reject_pairing", {
      schema: PairingRejectParams,
      handler: (_ctx, p) => d.pairing.reject(p.id),
    });
    surface.register("machine.invite", {
      schema: DelegationInviteParams,
      handler: (_ctx, p) => d.invite(p.label),
    });
    surface.register("machine.delegate", {
      schema: DelegationStartParams,
      handler: (_ctx, p) => d.start(p),
    });
    surface.register("machine.delegations", { schema: ServerStopParams, handler: () => d.list() });
    surface.register("machine.stop_delegation", {
      schema: DelegationStopParams,
      handler: (_ctx, p) => d.stop(p.id),
    });
  }
  const resources = new SystemResourceSampler();
  surface.register("server.resources", {
    schema: ServerStopParams,
    handler: () => ({ ...resources.get(), agents: deps.session.agentCounts() }),
  });
  const processes = new ProcessResourceSampler();
  let demandUntil = 0;
  const appReports = new Map<string,{at:number;deviceId:string;hostId:string|null;rows:ResourceProcess[]}>();
  surface.register("server.resource_app_demand", {
    schema:ServerStopParams,handler:()=>({active:Date.now()<demandUntil}),
  });
  surface.register("server.resource_app_report", {
    schema:ResourceAppReportParams,handler:(ctx,p)=>{
      const now=Date.now();
      for(const [key,value] of appReports)if(now-value.at>15000)appReports.delete(key);
      if(now>=demandUntil)return {};
      // New connections replace their previous reports; never retain unbounded device history.
      for(const [key,value] of appReports)if(value.deviceId===p.deviceId)appReports.delete(key);
      if(appReports.size>=32)appReports.delete(appReports.keys().next().value!);
      appReports.set(ctx.clientId,{at:now,deviceId:p.deviceId,hostId:p.hostId,rows:p.processes.map(row=>({
        id:`app:${p.deviceId}:${row.pid}:${row.startedAt}`,startIdentity:row.startIdentity,pid:row.pid,parentPid:null,
        name:row.name,group:"app",label:"デスクトップアシスタント",source:`app:${p.deviceId}`,
        platform:p.platform,cpuPercent:row.cpuPercent,rssBytes:row.rssBytes,threads:null,
      }))});return {};
    },
  });
  surface.register("server.resource_monitor", {
    schema:ServerStopParams,handler:async()=>{
      demandUntil=Date.now()+12000;
      const panes=deps.session.snapshot().panes.flatMap(p=>{
        const terminal=deps.terminals.get(p.id);
        return terminal?[{pid:terminal.pid,paneId:p.id,label:p.agent?.name||p.label||p.agent?.label||p.id.slice(0,8),agent:!!p.agent}]:[];
      });
      const result=await processes.get(panes),now=Date.now();
      for(const [key,value] of appReports)if(now-value.at>15000)appReports.delete(key);
      const hostId=await resourceHostIdentity();
      const reportedHere=new Set([...appReports.values()].filter(r=>hostId!==null&&r.hostId===hostId).flatMap(r=>r.rows.filter(row=>row.startIdentity!==null).map(row=>`${row.pid}:${row.startIdentity}`)));
      return {sampledAt:result.at,system:{...resources.get(),agents:deps.session.agentCounts()},
        processes:[...result.rows.filter(row=>!reportedHere.has(`${row.pid}:${row.startIdentity}`)),...[...appReports.values()].flatMap(r=>r.rows)],
        warnings:result.warning?[result.warning]:[]};
    },
  });
  surface.register("server.stop", {
    schema: ServerStopParams,
    handler: () =>
      new Promise<Record<string, never>>((resolve, reject) => {
        const stop = deps.stopServer;
        if (stop === undefined) {
          reject(
            new RpcError("server_stop_unsupported", "this server does not accept stop requests"),
          );
          return;
        }
        stop(async (r) => {
          if (r.ok) resolve({});
          else
            reject(
              new RpcError(
                r.reason === "busy" ? "server_busy" : "server_stop_unsupported",
                r.message,
              ),
            );
          await new Promise<void>((done) => setImmediate(done));
        }).catch(reject);
      }),
  });
}
