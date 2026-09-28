import {
  GraphGetParams,
  GraphHistoryParams,
  GraphPauseParams,
  GraphResumeParams,
  GraphUpdateParams,
  RpcError,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
import {
  GraphInvalidError,
  GraphLinkNotFoundError,
  GraphRevConflictError,
} from "../../persist/GraphStore.js";

/**
 * 連携のグラフ（20260927-agent-graph の design「インターフェース / データ構造」）。保存できた変更は `graph.changed` として全クライアントへ配られる
 * （配るのは `composeServer` の `GraphStore.onChange`）。依存が無ければ登録しない（`prefs` と同じ任意の依存）。
 * 実行（`GraphEngine`）は 02-engine-local で足す——それまで履歴は空。
 */
export function registerGraphMethods(surface: ControlSurface, deps: MethodDeps): void {
  const store = deps.graph;
  if (store === undefined) return;
  surface.register("graph.get", {
    schema: GraphGetParams,
    handler: () => store.get(),
  });
  surface.register("graph.update", {
    schema: GraphUpdateParams,
    handler: (ctx, params) =>
      mapErrors(() => store.update(params.baseRev, params.ops, ctx.clientId)),
  });
  surface.register("graph.pause", {
    schema: GraphPauseParams,
    handler: (ctx, params) => mapErrors(() => store.pause(params.linkId, ctx.clientId)),
  });
  surface.register("graph.resume", {
    schema: GraphResumeParams,
    handler: (ctx, params) => mapErrors(() => store.resume(params.linkId, ctx.clientId)),
  });
  surface.register("graph.history", {
    schema: GraphHistoryParams,
    handler: () => ({ runs: [] }),
  });
}

async function mapErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof GraphRevConflictError) throw new RpcError("rev_conflict", err.message);
    if (err instanceof GraphInvalidError)
      throw new RpcError("invalid_params", `invalid graph: ${err.message}`);
    if (err instanceof GraphLinkNotFoundError) throw new RpcError("not_found", err.message);
    throw err;
  }
}
