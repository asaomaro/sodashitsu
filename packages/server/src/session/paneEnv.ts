/**
 * pane を起動するときの環境変数（20260926-agent-skill-file の design「pane の環境」）。
 *
 * サーバの環境（`base`）を写し、次を**写さない**:
 * - sodactl の設定の `SODACTL_URL`・`SODACTL_TOKEN`——サーバを起動した環境の設定で、pane のサーバを指すとは限らない。token は秘密で、
 *   pane の全プロセス（そこで動くエージェントの会話の記録を含む）に流さない（decisions.md D3）。
 * - サーバが管理する `SODA_PANE_ID`・`SODA_SERVER_URL`・`SODA_AGENT_REPORT_SOCKET`・`SODA_PANE_SOCKET`（20261003-sodactl-ask-socket）・`SODA_SESSION`（20260926-named-session-ui）の古い値（別の soda の pane の中でサーバを起動した等）。
 *   サーバが入れた値だけが pane に届く（herdr の「管理する変数は herdr の値が勝つ」と同じ）。
 *
 * Windows の環境変数は大文字小文字を区別しないので、`win32` では区別せずに比べる。それ以外の OS では完全一致（小文字の同名の変数は
 * 利用者のもので、sodactl もサーバも読まない）。
 */

export const PANE_ENV_DROPPED: readonly string[] = [
  "SODACTL_URL",
  "SODACTL_TOKEN",
  "SODA_PANE_ID",
  "SODA_SERVER_URL",
  "SODA_AGENT_REPORT_SOCKET",
  // ログイン不要の受け口（20261003-sodactl-ask-socket）。古い値を残すと、pane の中の sodactl が別のサーバの受け口へ繋ぎに行く。
  "SODA_PANE_SOCKET",
  "SODA_SESSION",
  // 更新時の引き継ぎの nonce（20260926-live-handoff）。起動の最初に process.env から消すが、pane へは念のため渡さない。
  "SODA_HANDOFF_NONCE",
  // 独自コマンドに渡す変数（20260927-custom-command-keys）。独自コマンドの中でサーバを起動した等で残った古い値を渡さない。
  "SODA_ACTIVE_WORKSPACE_ID",
  "SODA_ACTIVE_TAB_ID",
  "SODA_ACTIVE_PANE_ID",
  "SODA_ACTIVE_PANE_CWD",
  "SODA_COMMAND_ID",
  // 拡張に渡す変数（20261007-ext-host）。拡張から起動したサーバ・拡張の中の pane に、古い値を漏らさない。
  "SODA_EXTENSION_ID",
  "SODA_EXTENSION_SCOPE",
  "SODA_PROJECT_ROOT",
  "SODA_EXTENSION_RUN_ID",
];

export interface PaneEnvManaged {
  /**
   * `SODA_PANE_ID` に入れる pane の id。独自コマンドの popup・裏での実行（20260927-custom-command-keys）はモデルの pane ではないので省く
   * （herdr の popup が `HERDR_PANE_ID` を渡さないのと同じ）。
   */
  paneId?: string | undefined;
  /** その pane を動かしているサーバへ sodactl がつなげる URL（`paneServerUrl`）。無ければ入れない。 */
  serverUrl?: string | undefined;
  /** 公式フック連携の report の socket。無ければ入れない。 */
  agentReportSocketPath?: string | undefined;
  /**
   * pane の中のプログラム向けのログイン不要の受け口（`pane.sock`。20261003-sodactl-ask-socket）のパス。あれば `SODA_PANE_SOCKET` に入れる。
   * 無ければ入れない（Windows では受け口を開かない——`paneSocketPathFor`）。値は socket のパスだけで、秘密は含まない。
   */
  paneSocketPath?: string | undefined;
  /**
   * 名前付き session の名前（20260926-named-session-ui）。あれば `SODA_SESSION` に入れる（herdr の pane が `HERDR_SESSION` を引き継ぐのと同じ。
   * pane の中の `soda token reset` 等が自分の session を既定にする）。既定の session では入れない。
   */
  sessionName?: string | undefined;
  /** 最後に足す変数（独自コマンドの `SODA_ACTIVE_*`・`SODA_COMMAND_ID`。20260927-custom-command-keys）。 */
  extra?: Readonly<Record<string, string>> | undefined;
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
  if (managed.paneId !== undefined) env["SODA_PANE_ID"] = managed.paneId;
  if (managed.serverUrl) env["SODA_SERVER_URL"] = managed.serverUrl;
  if (managed.agentReportSocketPath) env["SODA_AGENT_REPORT_SOCKET"] = managed.agentReportSocketPath;
  if (managed.paneSocketPath) env["SODA_PANE_SOCKET"] = managed.paneSocketPath;
  if (managed.sessionName) env["SODA_SESSION"] = managed.sessionName;
  if (managed.extra) Object.assign(env, managed.extra);
  return env;
}
