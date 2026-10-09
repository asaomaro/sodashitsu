import { AgentForkPreviewParams } from "@sodashitsu/protocol";
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
}
