/**
 * pane を起動するときの環境変数（20260926-agent-skill-file の design「pane の環境」）。
 *
 * サーバの環境（`base`）を写し、次を**写さない**:
 * - wtmctl の設定の `WTMCTL_URL`・`WTMCTL_TOKEN`——サーバを起動した環境の設定で、pane のサーバを指すとは限らない。token は秘密で、
 *   pane の全プロセス（そこで動くエージェントの会話の記録を含む）に流さない（decisions.md D3）。
 * - サーバが管理する `WTM_PANE_ID`・`WTM_SERVER_URL`・`WTM_AGENT_REPORT_SOCKET`・`WTM_SESSION`（20260926-named-session-ui）の古い値（別の wtm の pane の中でサーバを起動した等）。
 *   サーバが入れた値だけが pane に届く（herdr の「管理する変数は herdr の値が勝つ」と同じ）。
 *
 * Windows の環境変数は大文字小文字を区別しないので、`win32` では区別せずに比べる。それ以外の OS では完全一致（小文字の同名の変数は
 * 利用者のもので、wtmctl もサーバも読まない）。
 */

export const PANE_ENV_DROPPED: readonly string[] = [
  "WTMCTL_URL",
  "WTMCTL_TOKEN",
  "WTM_PANE_ID",
  "WTM_SERVER_URL",
  "WTM_AGENT_REPORT_SOCKET",
  "WTM_SESSION",
];

export interface PaneEnvManaged {
  paneId: string;
  /** その pane を動かしているサーバへ wtmctl がつなげる URL（`paneServerUrl`）。無ければ入れない。 */
  serverUrl?: string | undefined;
  /** 公式フック連携の report の socket。無ければ入れない。 */
  agentReportSocketPath?: string | undefined;
  /**
   * 名前付き session の名前（20260926-named-session-ui）。あれば `WTM_SESSION` に入れる（herdr の pane が `HERDR_SESSION` を引き継ぐのと同じ。
   * pane の中の `wtm token reset` 等が自分の session を既定にする）。既定の session では入れない。
   */
  sessionName?: string | undefined;
}

export function buildPaneEnv(
  base: NodeJS.ProcessEnv,
  managed: PaneEnvManaged,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const caseInsensitive = platform === "win32";
  const dropped = new Set(
    caseInsensitive ? PANE_ENV_DROPPED.map((k) => k.toUpperCase()) : PANE_ENV_DROPPED,
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value === undefined) continue;
    if (dropped.has(caseInsensitive ? key.toUpperCase() : key)) continue;
    env[key] = value;
  }
  env["WTM_PANE_ID"] = managed.paneId;
  if (managed.serverUrl) env["WTM_SERVER_URL"] = managed.serverUrl;
  if (managed.agentReportSocketPath) env["WTM_AGENT_REPORT_SOCKET"] = managed.agentReportSocketPath;
  if (managed.sessionName) env["WTM_SESSION"] = managed.sessionName;
  return env;
}
