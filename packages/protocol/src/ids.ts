/**
 * ID の形式。design.md「識別子」・architecture.md「識別子」参照。
 * 実体（workspace・tab・pane・レイアウトの分割ノード・検出したエージェントのインスタンス・手動グループ・連携のグラフの線）の id は、
 * すべて UUID（`crypto.randomUUID()`。小文字・ハイフン付き 36 文字）。連番ではないので再利用されず、作った順を表さない
 * （順が要る所は明示的な順序を持つ）。
 */
export type WorkspaceId = string;
export type TabId = string;
export type PaneId = string;
export type SplitId = string;
export type AgentInstanceId = string;
export type ClientId = string;
export type GroupId = string;

/** UUID（小文字・ハイフン付き 36 文字）の形。 */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * 実体の id として受ける文字列の形（UUID を基本に、英数字・ハイフンの 1〜64 文字まで緩める）。
 * 形の検証は「別の値が紛れ込まない」ためだけで、UUID であることまでは求めない（テストの固定の id を通すため）。
 */
export const ENTITY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** 人に見せる短い呼び名（先頭 8 文字）。UUID 以外の短い id はそのまま。 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
