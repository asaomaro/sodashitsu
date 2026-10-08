import type { Pinia } from "pinia";
import {
  loadKeyPrefs,
  loadSidebarRows,
  loadTabBarPosition,
  loadTabBarRightEntries,
  loadTabBarRightSeparator,
  loadThemePrefs,
} from "@sodashitsu/client-core";
import { loadThemeOverrides } from "../theme/themeOverrides.js";
import { loadScrollbackPref } from "../term/scrollback.js";
import {
  loadKeyboardLockInFullscreen,
  loadNewCwdPath,
  loadNewCwdPolicy,
  loadPaneAgentNameVisible,
  loadPaneBorders,
  loadPaneFrameThickness,
  loadPaneGaps,
  loadPaneOuterBorders,
  loadDisplayScriptEnabled,
  loadShellCwdTracking,
  loadStatusSymbols,
  useSettingsStore,
} from "./settings.js";
import { loadAgentSort, loadCollapsedAutoGroups, loadUngroupedCollapsed, loadWorkspaceSort, useViewStore } from "./view.js";
import { loadNotifyPrefs, useNotificationsStore } from "./notifications.js";
import { useOnboardingStore } from "./onboarding.js";

/**
 * サーバから受けた共有の設定（`prefs.get`・`prefs.changed`。20260927-cli-mode）を各ストアへ当てる。`raw` は `soda.prefs.v1` の全体
 * （`view.ts` の `replaceSharedPrefs` の戻り値——端末ごとの項目は手元のまま）。読み込みと同じ `load*` で値ごとに正規化する。
 *
 * **端末ごとの項目（サイドバーの幅・折りたたみ）には触れない**。`reload_config`（`ActionDispatcher.reloadConfig`）と違い、キーの割り当て・色の上書き・
 * 通知の設定も当てる（ほかの端末で変えた値が、この画面に届くように）。値が同じなら代入しない（watch を無駄に走らせない）。
 */
export function applyPrefsToStores(pinia: Pinia, raw: Record<string, unknown>): void {
  const settings = useSettingsStore(pinia);
  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]): void => {
    if (JSON.stringify(settings[key]) !== JSON.stringify(value)) settings[key] = value;
  };
  set("statusSymbols", loadStatusSymbols(raw["statusSymbols"]));
  set("keyboardLockInFullscreen", loadKeyboardLockInFullscreen(raw["keyboardLockInFullscreen"]));
  set("paneFrameThickness", loadPaneFrameThickness(raw["paneFrameThickness"]));
  set("paneAgentNameVisible", loadPaneAgentNameVisible(raw["paneAgentNameVisible"]));
  set("tabBarPosition", loadTabBarPosition(raw["tabBarPosition"]));
  set("tabBarRight", loadTabBarRightEntries(raw["tabBarRight"]));
  set("tabBarRightSeparator", loadTabBarRightSeparator(raw["tabBarRightSeparator"]));
  set("paneOuterBorders", loadPaneOuterBorders(raw["paneOuterBorders"]));
  set("paneBorders", loadPaneBorders(raw["paneBorders"]));
  set("paneGaps", loadPaneGaps(raw["paneGaps"]));
  set("scrollback", loadScrollbackPref(raw["scrollback"]));
  set("newCwdPolicy", loadNewCwdPolicy(raw["newCwdPolicy"]));
  set("newCwdPath", loadNewCwdPath(raw["newCwdPath"]));
  set("shellCwdTracking", loadShellCwdTracking(raw["shellCwdTracking"]));
  set("displayScriptEnabled", loadDisplayScriptEnabled(raw["displayScriptEnabled"]));
  const theme = loadThemePrefs(raw);
  set("theme", theme.theme);
  set("themeAuto", theme.auto);
  set("themeLight", theme.light);
  set("themeDark", theme.dark);
  set("sidebarRows", loadSidebarRows(raw["sidebarRows"]));
  set("keyPrefs", loadKeyPrefs(raw["keys"]));
  set("themeOverrides", loadThemeOverrides(raw["themeOverrides"]));

  const view = useViewStore(pinia);
  const agentSort = loadAgentSort(raw);
  if (view.agentSort !== agentSort) view.agentSort = agentSort;
  const workspaceSort = loadWorkspaceSort(raw["workspaceSort"]);
  if (view.workspaceSort !== workspaceSort) view.workspaceSort = workspaceSort;
  const collapsed = loadCollapsedAutoGroups(raw["collapsedAutoGroups"]);
  if (
    JSON.stringify([...collapsed].sort()) !== JSON.stringify([...view.collapsedAutoGroups].sort())
  )
    view.collapsedAutoGroups = collapsed;
  const ungroupedCollapsed = loadUngroupedCollapsed(raw["ungroupedCollapsed"]);
  if (view.ungroupedCollapsed !== ungroupedCollapsed) view.ungroupedCollapsed = ungroupedCollapsed;

  const notifications = useNotificationsStore(pinia);
  const notify = loadNotifyPrefs(raw["notify"]);
  if (JSON.stringify(notify) !== JSON.stringify(notifications.prefs)) notifications.prefs = notify;
  if (notifications.hintPending !== (raw["notifyHintPending"] === true))
    notifications.hintPending = raw["notifyHintPending"] === true;
  if (notifications.hintDone !== (raw["notifyHintDone"] === true))
    notifications.hintDone = raw["notifyHintDone"] === true;

  // はじめの案内：端末版・ほかのブラウザで済ませた（共有の `onboarding: false`）なら、このブラウザでも出さない。
  if (raw["onboarding"] === false) useOnboardingStore(pinia).suppress();
}
