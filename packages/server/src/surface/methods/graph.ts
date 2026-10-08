import {
  GRAPH_HISTORY_RESPONSE_MAX,
  GraphGetParams,
  GraphHistoryParams,
  GraphPauseParams,
  GraphResumeParams,
  GraphUpdateParams,
  RpcError,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
import { guardGraphUpdate } from "../../graph/updateGuard.js";
import {
  GraphInvalidError,
  GraphLinkNotFoundError,
  GraphRevConflictError,
  GraphStoreClosedError,
} from "../../persist/GraphStore.js";

/**
 * 連携のグラフ（20260927-agent-graph の design「インターフェース / データ構造」）。保存できた変更は `graph.changed` として全クライアントへ配られる
 * （配るのは `composeServer` の `GraphStore.onChange`）。依存が無ければ登録しない（`prefs` と同じ任意の依存）。
 * 履歴は実行（`GraphEngine`）のメモリから新しい順に返す（再起動で消える）。
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
      mapErrors(() => {
        // 方式の層の検査（20261008-graph-first D10）: `node_required`・`frame_overlap`。rev が違うときは、検査より先に `rev_conflict`（取り直してやり直せる）。
        if (params.baseRev === store.get().rev) {
          const failure = guardGraphUpdate(deps.session, store.get(), params.ops);
          if (failure !== null) throw new RpcError(failure.code, failure.message);
        }
        return store.update(params.baseRev, params.ops, ctx.clientId);
      }),
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
    handler: (_ctx, params) => ({ runs: deps.graphHistory?.(params.linkId, params.limit ?? GRAPH_HISTORY_RESPONSE_MAX) ?? [] }),
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
    if (err instanceof GraphStoreClosedError) throw new RpcError("internal", err.message);
    throw err;
  }
}
