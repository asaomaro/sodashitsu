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
