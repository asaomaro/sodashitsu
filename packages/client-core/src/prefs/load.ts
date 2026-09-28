import type { NewCwd } from "@sodashitsu/protocol";
import { DEFAULT_NOTIFY_PREFS, type NotifyPrefs } from "../notify/policy.js";
import type { AgentSort, WorkspaceSort } from "./types.js";

/**
 * 共有の設定（`soda.prefs.v1`・サーバの `prefs.json`）の値ごとの読み込み・既定・正規化（web と端末版が同じ規則で読む。20260927-cli-mode の
 * decisions D-5。統合の review で web の `store/*.ts` から移した）。どれも**壊れた値・無い値は既定へ落とす**（保存値は書き換えない）。
 */

/**
 * 状態を色に加えて記号でも示すか。**boolean でなければ既定の「入」**（20260921-herdr-settings-gaps の AC3・AC7）。
 *
 * **既定が herdr と逆**（herdr の `ui.status_indicators` の既定は `dots`＝色だけ）。WCAG 1.4.1 は色を唯一の手段に
 * することを禁じており、既定で違反した状態を出さない（decisions D1）。
 */
export function loadStatusSymbols(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : true;
}

/** 枠の描画モード。always=常に・auto=分割しているときだけ・off=描かない（herdr の `ui.pane_borders` と同じ綴り）。 */
export type PaneBorders = "always" | "auto" | "off";
export const PANE_BORDERS: readonly PaneBorders[] = ["always", "auto", "off"];

/**
 * pane の枠の描画モード（20260926-pane-frame-auto-mode）。3 値のどれかでなければ既定の「常に」——herdr の既定（`auto`）と逆で、
 * 今までの見た目（単一 pane にも枠）を既定にする（decisions D2）。
 */
export function loadPaneBorders(raw: unknown): PaneBorders {
  return PANE_BORDERS.includes(raw as PaneBorders) ? (raw as PaneBorders) : "always";
}

/** pane の間の隙間（herdr の `ui.pane_gaps`）。boolean でなければ既定の「入」（今までの見た目）。 */
export function loadPaneGaps(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : true;
}

/** pane にエージェント名を可視で出すか（20260922-appearance-settings-rest）。既定は無効（opt-in）。 */
export function loadPaneAgentNameVisible(raw: unknown): boolean {
  return typeof raw === "boolean" ? raw : false;
}

/** 通知の設定（`notify`。20260920-agent-notifications）。値ごとに既定へ落とす。 */
export function loadNotifyPrefs(raw: unknown): NotifyPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_NOTIFY_PREFS };
  const o = raw as Record<string, unknown>;
  const pick = (k: keyof NotifyPrefs): boolean =>
    typeof o[k] === "boolean" ? (o[k] as boolean) : DEFAULT_NOTIFY_PREFS[k];
  return { toast: pick("toast"), desktop: pick("desktop"), sound: pick("sound") };
}

/** agents の並び順（`agentSort` の値。20260920-sidebar-tabbar-controls）。壊れた値は既定の `grouped`。 */
export function loadAgentSort(raw: unknown): AgentSort {
  return raw === "priority" || raw === "grouped" ? raw : "grouped";
}

/** workspace の並び順（20260922-appearance-settings-rest の AC3）。壊れた値は `opened`。 */
export function loadWorkspaceSort(raw: unknown): WorkspaceSort {
  return raw === "name" || raw === "opened" ? raw : "opened";
}

/** worktree 自動グループの折りたたみ（`repoKey` の配列。20260923-workspace-grouping）。文字列でない要素は捨てる。 */
export function loadCollapsedAutoGroups(raw: unknown): Set<string> {
  return Array.isArray(raw)
    ? new Set(raw.filter((v): v is string => typeof v === "string"))
    : new Set();
}

/** 新しく開く場所の方針（20260921-new-terminal-cwd。herdr の `terminal.new_cwd`）。 */
export type NewCwdPolicy = NewCwd["policy"];
const NEW_CWD_POLICIES: readonly NewCwdPolicy[] = ["follow", "home", "current", "path"];

/** 保存された方針を読む。**4 つのどれかでなければ既定の「引き継ぐ」**（herdr の既定と同じ。AC4）。 */
export function loadNewCwdPolicy(raw: unknown): NewCwdPolicy {
  return NEW_CWD_POLICIES.includes(raw as NewCwdPolicy) ? (raw as NewCwdPolicy) : "follow";
}

/** 保存された「指定した場所」を読む。文字列でなければ空（検証はサーバ。空なら使えない場所として知らされる）。 */
export function loadNewCwdPath(raw: unknown): string {
  return typeof raw === "string" ? raw : "";
}

/**
 * 作成の要求に載せる形を作る。**`sourcePaneId` は「引き継ぐ」のときだけ**、null なら載せない（元の pane が無い →
 * サーバが以前と同じ場所で開く。design D7）。「指定した場所」は入れたままの文字列を送る（`~` の展開と検証はサーバ）。
 */
export function buildNewCwd(
  policy: NewCwdPolicy,
  path: string,
  sourcePaneId: string | null,
): NewCwd {
  switch (policy) {
    case "follow":
      return sourcePaneId === null ? { policy } : { policy, sourcePaneId };
    case "home":
    case "current":
      return { policy };
    case "path":
      return { policy, path };
  }
}
