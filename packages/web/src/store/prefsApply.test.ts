import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick, watch } from "vue";
import { applyPrefsToStores } from "./prefsApply.js";
import { useSettingsStore } from "./settings.js";
import { useViewStore } from "./view.js";
import { useNotificationsStore } from "./notifications.js";

// 20260927-cli-mode の T6：サーバから受けた共有の設定を各ストアへ当てる。
let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  localStorage.clear();
});

const raw = {
  statusSymbols: false,
  keyboardLockInFullscreen: true,
  paneFrameThickness: "thick",
  paneAgentNameVisible: true,
  tabBarPosition: "bottom",
  tabBarRight: [{ kind: "hostname" }],
  tabBarRightSeparator: " | ",
  paneOuterBorders: true,
  paneBorders: "off",
  paneGaps: false,
  scrollback: 2000,
  newCwdPolicy: "path",
  newCwdPath: "/tmp",
  shellCwdTracking: false,
  theme: "nord",
  themeAuto: false,
  keys: { prefix: "ctrl+a" },
  agentSort: "priority",
  workspaceSort: "name",
  collapsedAutoGroups: ["/r/.git"],
  ungroupedCollapsed: true,
  notify: { toast: false, desktop: true, sound: false },
  notifyHintPending: true,
  notifyHintDone: true,
  sidebarWidth: 300,
  sidebarCollapsed: true,
  sidebarSectionRatio: 0.3,
  sidebarSectionsCollapsed: { agents: true },
};

describe("applyPrefsToStores", () => {
  it("保存の項目名をストアの値へ（読み込みと同じ load* で）当てる", () => {
    const settings = useSettingsStore(pinia);
    const view = useViewStore(pinia);
    const notifications = useNotificationsStore(pinia);
    applyPrefsToStores(pinia, raw);
    expect(settings.statusSymbols).toBe(false);
    expect(settings.keyboardLockInFullscreen).toBe(true);
    expect(settings.paneFrameThickness).toBe("thick");
    expect(settings.paneAgentNameVisible).toBe(true);
    expect(settings.tabBarPosition).toBe("bottom");
    expect(settings.tabBarRight).toEqual([{ kind: "hostname" }]);
    expect(settings.tabBarRightSeparator).toBe(" | ");
    expect(settings.paneOuterBorders).toBe(true);
    expect(settings.paneBorders).toBe("off");
    expect(settings.paneGaps).toBe(false);
    expect(settings.scrollback).toBe(2000);
    expect(settings.newCwdPolicy).toBe("path");
    expect(settings.newCwdPath).toBe("/tmp");
    expect(settings.shellCwdTracking).toBe(false);
    expect(settings.theme).toBe("nord");
    expect(settings.keymap.prefix).toBe("ctrl+a");
    expect(view.agentSort).toBe("priority");
    expect(view.workspaceSort).toBe("name");
    expect([...view.collapsedAutoGroups]).toEqual(["/r/.git"]);
    expect(view.ungroupedCollapsed).toBe(true);
    expect(notifications.prefs).toEqual({ toast: false, desktop: true, sound: false });
    expect(notifications.hintPending).toBe(true);
    expect(notifications.hintDone).toBe(true);
    // 端末ごとの項目には触れない
    expect(view.sidebarWidth).not.toBe(300);
    expect(view.sidebarCollapsed).toBe(false);
    expect(view.sidebarSectionRatio).toBeNull();
    expect(view.sectionsCollapsed).toEqual({ spaces: false, agents: false });
  });

  it("壊れた値・無い項目は既定へ落とす", () => {
    const settings = useSettingsStore(pinia);
    applyPrefsToStores(pinia, raw);
    applyPrefsToStores(pinia, { statusSymbols: "yes", paneBorders: 3 });
    expect(settings.statusSymbols).toBe(true);
    expect(settings.shellCwdTracking).toBe(true);
    expect(settings.paneBorders).toBe("always");
    expect(settings.theme).not.toBe("nord");
  });

  it("同じ値なら代入しない（watch を走らせない）", async () => {
    const settings = useSettingsStore(pinia);
    const view = useViewStore(pinia);
    const notifications = useNotificationsStore(pinia);
    applyPrefsToStores(pinia, raw);
    await nextTick();
    const fired: string[] = [];
    watch(
      () => settings.keyPrefs,
      () => fired.push("keyPrefs"),
    );
    watch(
      () => settings.tabBarRight,
      () => fired.push("tabBarRight"),
    );
    watch(
      () => settings.themeOverrides,
      () => fired.push("themeOverrides"),
    );
    watch(
      () => settings.sidebarRows,
      () => fired.push("sidebarRows"),
    );
    watch(
      () => view.collapsedAutoGroups,
      () => fired.push("collapsedAutoGroups"),
    );
    watch(
      () => view.ungroupedCollapsed,
      () => fired.push("ungroupedCollapsed"),
    );
    watch(
      () => notifications.prefs,
      () => fired.push("notify"),
    );
    applyPrefsToStores(pinia, JSON.parse(JSON.stringify(raw)) as Record<string, unknown>);
    await nextTick();
    expect(fired).toEqual([]);
  });
});
