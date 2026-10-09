import { AgentForkParams, AgentForkPreviewParams } from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/**
 * エージェントの fork（20261009-agent-fork）。`/ws` の認証済みの接続から使える（`agent.start` と同じ。`pane.sock` には登録しない。A3）。
 * 手順と待ちは `AgentForkRunner`（サーバの部品）が持つ。
 */
export function registerAgentForkMethods(surface: ControlSurface, deps: MethodDeps): void {
  const runner = deps.agentFork;
  if (!runner) return;
  // 読み取りだけ（確定の前の画面）。何も作らず、何も打ち込まない。
  surface.register("agent.fork_preview", {
    schema: AgentForkPreviewParams,
    handler: (_ctx, params) => runner.preview(params),
  });
  // 手順の前半（確かめ・行き先を作る・シェルが入力を受けられるのを待つ・起動の打ち込み）を行い、新しい pane の id を返す。
  // 検知・最初の知らせは裏で続き、進み具合は `agent.fork_progress` で配る。
  surface.register("agent.fork", {
    schema: AgentForkParams,
    handler: async (ctx, params) => {
      deps.clients.touch(ctx.clientId); // 色の問い合わせの答え（pane を作る操作も操作）
      return runner.fork(params, {
        // 起動する前に、操作したクライアントの大きさで始まるよう記録する（`agent.start`・`pane.split` と同じ）。`lineage` は呼ばない（A3・S8: fork に自動の線は付けない）。
        onPaneCreated: (paneId) => deps.sizeAuthority.noteInteraction(ctx.clientId, paneId),
      });
    },
  });
}
