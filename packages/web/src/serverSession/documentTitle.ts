/**
 * ブラウザのタブのタイトル（H14。20260926-named-session-ui の AC3）。既定の session は今までどおり `{hostname}: {workspace}`（どちらか
 * 欠ければ製品名 `Sodashitsu`）。名前付き session は `{hostname} [{名前}]: {workspace}`（欠ければ `Sodashitsu [{名前}]`）——見た目が同じタブを取り違えない。
 */
export function documentTitle(
  hostname: string | undefined,
  sessionName: string | undefined,
  workspaceLabel: string | null | undefined,
): string {
  const tag = sessionName !== undefined ? ` [${sessionName}]` : "";
  return hostname && workspaceLabel ? `${hostname}${tag}: ${workspaceLabel}` : `Sodashitsu${tag}`;
}
