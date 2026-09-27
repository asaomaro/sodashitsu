import { PrefsGetParams, PrefsSetParams, RpcError } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
import { PrefsTooLargeError } from "../../persist/PrefsStore.js";

/**
 * 共有の設定（20260927-cli-mode。design「インターフェース / データ構造」）。`prefs.set` が保存できたら `prefs.changed` が全クライアントへ配られる
 * （配るのは `composeServer` の `PrefsStore.onChange`）。依存が無ければ登録しない（テストの組み立て等。`agentStarter` と同じ任意の依存）。
 */
export function registerPrefsMethods(surface: ControlSurface, deps: MethodDeps): void {
  const store = deps.prefs;
  if (store === undefined) return;
  surface.register("prefs.get", {
    schema: PrefsGetParams,
    handler: () => store.get(),
  });
  surface.register("prefs.set", {
    schema: PrefsSetParams,
    handler: async (ctx, params) => {
      try {
        return await store.set(params.patch, ctx.clientId);
      } catch (err) {
        if (err instanceof PrefsTooLargeError) throw new RpcError("invalid_params", err.message);
        throw err;
      }
    },
  });
}
