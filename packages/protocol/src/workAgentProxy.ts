/** Private work-agent IPC lifecycle reasons; never contains remote input or credentials. */
export const WORK_AGENT_PROXY_CLOSE_MESSAGES = {
  server_restarting:
    "操作元サーバーの更新で作業先proxyを終了しました。接続先からエージェントを起動し直してください",
  server_stopped: "操作元サーバーの停止で作業先proxyを終了しました",
  pane_closed: "エージェントのpaneが閉じられたため作業先proxyを終了しました",
  lease_expired: "作業先proxyの24時間の有効期限が切れました。起動し直してください",
  reconnect_expired: "作業先との接続が60秒以内に復旧しなかったためproxyを終了しました",
  target_validation_failed:
    "作業先PC・PJ・元の依頼権限を再確認できないためproxyを終了しました。接続先から起動し直してください",
  agent_stopped: "担当エージェントの終了を確認したため作業先proxyを終了しました",
  proxy_error: "作業先proxyの通信処理に異常が発生したため終了しました",
  requested_close: "エージェントからの終了要求で作業先proxyを終了しました",
  launch_failed: "エージェントの起動に失敗したため作業先proxyを終了しました",
} as const;
export type WorkAgentProxyCloseReason = keyof typeof WORK_AGENT_PROXY_CLOSE_MESSAGES;
export function workAgentProxyCloseMessage(reason: unknown): string | undefined {
  return typeof reason === "string" && Object.hasOwn(WORK_AGENT_PROXY_CLOSE_MESSAGES, reason)
    ? WORK_AGENT_PROXY_CLOSE_MESSAGES[reason as WorkAgentProxyCloseReason]
    : undefined;
}
