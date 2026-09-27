import { RpcError, ServerStopParams } from "@sodashitsu/protocol";
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
