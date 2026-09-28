/** agents の並び順（20260920-sidebar-tabbar-controls）。`grouped` は並べ替えない（既定）。 */
export type AgentSort = "grouped" | "priority";

/** workspace（spaces 区画）の並び順（20260922-appearance-settings-rest）。`opened` は今までどおり
 *  サーバから届いた順（既定）。`name` は workspace のラベルの文字列順。 */
export type WorkspaceSort = "opened" | "name";
