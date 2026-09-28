import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, watch } from "vue";
import {
  loadKeyboardLockInFullscreen,
  loadPaneAgentNameVisible,
  loadPaneBorders,
  loadPaneFrameThickness,
  loadPaneGaps,
  loadPaneOuterBorders,
  PANE_FRAME_THICKNESS_PX,
  useSettingsStore,
} from "./settings.js";
import { DEFAULT_LAYOUTS } from "@sodashitsu/client-core";
import { readPrefs, writePrefs } from "./view.js";
import { useCommandsStore } from "./commands.js";

let pinia: Pinia;

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  localStorage.clear();
});

describe("loadKeyboardLockInFullscreen（20260922-keybinding-usability。AC11）", () => {
  it("boolean でなければ既定の「無効」（実験的 API なので opt-in）", () => {
    for (const raw of [undefined, null, "true", 0, 1, {}, []]) {
      expect(loadKeyboardLockInFullscreen(raw), String(raw)).toBe(false);
    }
    expect(loadKeyboardLockInFullscreen(true)).toBe(true);
  });
});

// 20260922-appearance-settings-rest T3。
describe("loadPaneFrameThickness・loadPaneAgentNameVisible（AC9〜AC12 の下地）", () => {
  it("3つのどれかはそのまま", () => {
    expect(loadPaneFrameThickness("thin")).toBe("thin");
    expect(loadPaneFrameThickness("default")).toBe("default");
    expect(loadPaneFrameThickness("thick")).toBe("thick");
  });

  it("3つのどれでもなければ既定（default）", () => {
    for (const raw of [undefined, null, "medium", 4, {}, true]) {
      expect(loadPaneFrameThickness(raw), String(raw)).toBe("default");
    }
  });

  it("PANE_FRAME_THICKNESS_PX は3段階とも既定 4px を挟んで単調に増える", () => {
    expect(PANE_FRAME_THICKNESS_PX.thin).toBeLessThan(PANE_FRAME_THICKNESS_PX.default);
    expect(PANE_FRAME_THICKNESS_PX.default).toBe(4); // 今までの固定値（回帰なし）
    expect(PANE_FRAME_THICKNESS_PX.default).toBeLessThan(PANE_FRAME_THICKNESS_PX.thick);
  });

  it("エージェント名表示は boolean はそのまま、それ以外は既定の「切」", () => {
    expect(loadPaneAgentNameVisible(true)).toBe(true);
    expect(loadPaneAgentNameVisible(false)).toBe(false);
    for (const raw of [undefined, null, "true", 1, {}]) {
      expect(loadPaneAgentNameVisible(raw), String(raw)).toBe(false);
    }
  });
});

describe("useSettingsStore — pane の枠・隙間の太さ／エージェント名表示（20260922-appearance-settings-rest）", () => {
  it("何も保存されていなければ、太さは既定・エージェント名表示は無効", () => {
    const store = useSettingsStore(pinia);
    expect(store.paneFrameThickness).toBe("default");
    expect(store.paneAgentNameVisible).toBe(false);
  });

  it("太さを変えると同じストアに反映され、保存され、新しいストアが読み戻す", () => {
    const store = useSettingsStore(pinia);
    store.setPaneFrameThickness("thick");
    expect(store.paneFrameThickness, "押した時点で反映").toBe("thick");
    expect(readPrefs()["paneFrameThickness"]).toBe("thick");
    expect(useSettingsStore(createPinia()).paneFrameThickness).toBe("thick");
  });

  it("エージェント名表示を有効にすると同じストアに反映され、保存され、新しいストアが読み戻す", () => {
    const store = useSettingsStore(pinia);
    store.setPaneAgentNameVisible(true);
    expect(store.paneAgentNameVisible, "押した時点で反映").toBe(true);
    expect(readPrefs()["paneAgentNameVisible"]).toBe(true);
    expect(useSettingsStore(createPinia()).paneAgentNameVisible).toBe(true);
  });

  // `statusSymbols`/`newCwdPolicy` と同じ形（AC3 相当）：壊れた値でも起動できる。
  it("保存された値が壊れていれば既定で起動する", () => {
    writePrefs({ paneFrameThickness: "medium", paneAgentNameVisible: "yes" });
    const store = useSettingsStore(createPinia());
    expect(store.paneFrameThickness).toBe("default");
    expect(store.paneAgentNameVisible).toBe(false);
  });
});

// 20260922-tabbar-pane-appearance（PR #12 から取り込み）。
describe("loadPaneOuterBorders", () => {
  it("boolean はそのまま、それ以外は既定の「切」", () => {
    expect(loadPaneOuterBorders(true)).toBe(true);
    expect(loadPaneOuterBorders(false)).toBe(false);
    for (const raw of [undefined, null, "true", 1, {}]) {
      expect(loadPaneOuterBorders(raw), String(raw)).toBe(false);
    }
  });
});

describe("useSettingsStore — tab バーの位置・右端エントリ・pane の外周（20260922-tabbar-pane-appearance。PR #12 から取り込み）", () => {
  it("何も保存されていなければ、位置は上・右端は空・区切りは半角スペース・外周は無し", () => {
    const store = useSettingsStore(pinia);
    expect(store.tabBarPosition).toBe("top");
    expect(store.tabBarRight).toEqual([]);
    expect(store.tabBarRightSeparator).toBe(" ");
    expect(store.paneOuterBorders).toBe(false);
  });

  it("位置を変えると同じストアに反映され、保存され、新しいストアが読み戻す", () => {
    const store = useSettingsStore(pinia);
    store.setTabBarPosition("bottom");
    expect(store.tabBarPosition, "押した時点で反映").toBe("bottom");
    expect(readPrefs()["tabBarPosition"]).toBe("bottom");
    expect(useSettingsStore(createPinia()).tabBarPosition).toBe("bottom");
  });

  it("外周の枠を有効にすると同じストアに反映され、保存され、新しいストアが読み戻す", () => {
    const store = useSettingsStore(pinia);
    store.setPaneOuterBorders(true);
    expect(store.paneOuterBorders, "押した時点で反映").toBe(true);
    expect(readPrefs()["paneOuterBorders"]).toBe(true);
    expect(useSettingsStore(createPinia()).paneOuterBorders).toBe(true);
  });

  it("右端エントリの追加・並び替え・削除・更新・区切り文字（AC3・AC4 相当）", () => {
    const store = useSettingsStore(pinia);
    store.addTabBarRightEntry("hostname");
    store.addTabBarRightEntry("text");
    expect(store.tabBarRight).toEqual([{ kind: "hostname" }, { kind: "text", text: "" }]);

    store.updateTabBarRightEntry(1, { kind: "text", text: "hello" });
    expect(store.tabBarRight[1]).toEqual({ kind: "text", text: "hello" });

    store.moveTabBarRightEntry(1, -1); // 上へ：text が先頭に来る
    expect(store.tabBarRight).toEqual([{ kind: "text", text: "hello" }, { kind: "hostname" }]);
    store.moveTabBarRightEntry(0, -1); // 端（0番目をさらに上へ）は何もしない
    expect(store.tabBarRight).toEqual([{ kind: "text", text: "hello" }, { kind: "hostname" }]);

    store.removeTabBarRightEntry(0);
    expect(store.tabBarRight).toEqual([{ kind: "hostname" }]);
    expect(readPrefs()["tabBarRight"]).toEqual([{ kind: "hostname" }]);

    store.setTabBarRightSeparator(" / ");
    expect(store.tabBarRightSeparator).toBe(" / ");
    expect(readPrefs()["tabBarRightSeparator"]).toBe(" / ");
  });

  it("上限（MAX_TAB_BAR_RIGHT_ENTRIES=16）に達すると追加は何もしない", () => {
    const store = useSettingsStore(pinia);
    for (let i = 0; i < 16; i++) store.addTabBarRightEntry("zoom");
    expect(store.tabBarRight).toHaveLength(16);
    store.addTabBarRightEntry("zoom");
    expect(store.tabBarRight, "17個目は追加されない").toHaveLength(16);
  });

  // `statusSymbols`/`paneFrameThickness` と同じ形：壊れた値でも起動できる。
  it("保存された値が壊れていれば既定で起動する", () => {
    writePrefs({ tabBarPosition: "left", tabBarRight: "not an array", tabBarRightSeparator: 5, paneOuterBorders: "yes" });
    const store = useSettingsStore(createPinia());
    expect(store.tabBarPosition).toBe("top");
    expect(store.tabBarRight).toEqual([]);
    expect(store.tabBarRightSeparator).toBe(" ");
    expect(store.paneOuterBorders).toBe(false);
  });

  it("別のタブ・ウィンドウでの変更に storage イベントで追従する", () => {
    const store = useSettingsStore(pinia);
    writePrefs({ tabBarPosition: "bottom", paneOuterBorders: true });
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    expect(store.tabBarPosition).toBe("bottom");
    expect(store.paneOuterBorders).toBe(true);
  });
});

describe("useSettingsStore — pane の枠の描画モード・隙間（20260926-pane-frame-auto-mode。AC1・AC6）", () => {
  it("読み込み：3 値・boolean はそのまま、それ以外は既定の「常に」「入」（decisions D2）", () => {
    for (const v of ["always", "auto", "off"] as const) expect(loadPaneBorders(v)).toBe(v);
    for (const raw of [undefined, null, "framed", true, 1, {}]) {
      expect(loadPaneBorders(raw), String(raw)).toBe("always");
    }
    expect(loadPaneGaps(false)).toBe(false);
    expect(loadPaneGaps(true)).toBe(true);
    for (const raw of [undefined, null, "false", 0, {}]) {
      expect(loadPaneGaps(raw), String(raw)).toBe(true);
    }
  });

  it("何も保存されていなければ「常に」「入」、壊れた値でも同じ", () => {
    expect(useSettingsStore(pinia).paneBorders).toBe("always");
    expect(useSettingsStore(pinia).paneGaps).toBe(true);
    writePrefs({ paneBorders: "framed", paneGaps: "no" });
    const store = useSettingsStore(createPinia());
    expect(store.paneBorders).toBe("always");
    expect(store.paneGaps).toBe(true);
  });

  it("変えると同じストアに反映され、保存され、新しいストアが読み戻す", () => {
    const store = useSettingsStore(pinia);
    store.setPaneBorders("auto");
    store.setPaneGaps(false);
    expect(store.paneBorders, "押した時点で反映").toBe("auto");
    expect(store.paneGaps).toBe(false);
    expect(readPrefs()["paneBorders"]).toBe("auto");
    expect(readPrefs()["paneGaps"]).toBe(false);
    const reloaded = useSettingsStore(createPinia());
    expect(reloaded.paneBorders).toBe("auto");
    expect(reloaded.paneGaps).toBe(false);
  });

  it("別のタブ・ウィンドウでの変更に storage イベントで追従する", () => {
    const store = useSettingsStore(pinia);
    writePrefs({ paneBorders: "off", paneGaps: false });
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    expect(store.paneBorders).toBe("off");
    expect(store.paneGaps).toBe(false);
  });
});

describe("useSettingsStore", () => {
  it("何も保存されていなければ、記号は入・scrollback は自動（AC7）", () => {
    const store = useSettingsStore(pinia);
    expect(store.statusSymbols).toBe(true);
    expect(store.scrollback).toBe("auto");
  });

  it("記号表示を切ると同じストアに反映され、保存され、新しいストアが読み戻す", () => {
    const store = useSettingsStore(pinia);
    store.setStatusSymbols(false);
    expect(store.statusSymbols, "押した時点で反映（再読み込みを待たない）").toBe(false);
    expect(readPrefs()["statusSymbols"]).toBe(false);
    expect(useSettingsStore(createPinia()).statusSymbols).toBe(false);
  });

  it("keyboardLockInFullscreen は既定が無効で、切り替えると反映・保存され、新しいストアが読み戻す（20260922-keybinding-usability。AC11）", () => {
    const store = useSettingsStore(pinia);
    expect(store.keyboardLockInFullscreen).toBe(false);
    store.setKeyboardLockInFullscreen(true);
    expect(store.keyboardLockInFullscreen, "押した時点で反映").toBe(true);
    expect(readPrefs()["keyboardLockInFullscreen"]).toBe(true);
    expect(useSettingsStore(createPinia()).keyboardLockInFullscreen).toBe(true);
  });

  // AC10：再読み込み（＝新しいストア）でも残る。
  it("scrollback の設定は同じストアに反映され、保存され、新しいストアが読み戻す", () => {
    const store = useSettingsStore(pinia);
    store.setScrollback(2000);
    expect(store.scrollback, "選んだ時点で反映").toBe(2000);
    expect(readPrefs()["scrollback"]).toBe(2000);
    expect(useSettingsStore(createPinia()).scrollback).toBe(2000);
  });

  it("自動に戻すと \"auto\" が保存される", () => {
    const store = useSettingsStore(pinia);
    store.setScrollback(2000);
    store.setScrollback("auto");
    expect(readPrefs()["scrollback"], "キーを消すのではなく \"auto\" を書く").toBe("auto");
    expect(useSettingsStore(createPinia()).scrollback).toBe("auto");
  });

  // 他の好み（通知・並び順・サイドバー）を消さない——`writePrefs` の併合に乗っている。
  it("保存しても他の好みは消えない", () => {
    writePrefs({ agentSort: "priority", notify: { toast: false, desktop: false, sound: true } });
    const store = useSettingsStore(pinia);
    store.setStatusSymbols(false);
    store.setScrollback(5000);
    expect(readPrefs()).toMatchObject({ agentSort: "priority", notify: { toast: false, sound: true }, statusSymbols: false, scrollback: 5000 });
  });

  // AC3：壊れた値でも起動できる。
  it("保存された値が壊れていれば既定で起動する", () => {
    writePrefs({ statusSymbols: "off", scrollback: -10 });
    const store = useSettingsStore(createPinia());
    expect(store.statusSymbols).toBe(true);
    expect(store.scrollback).toBe("auto");
  });
});

describe("useSettingsStore — 新しく開く場所", () => {
  it("何も保存されていなければ「引き継ぐ」、パスは空（AC4）", () => {
    const store = useSettingsStore(pinia);
    expect(store.newCwdPolicy).toBe("follow");
    expect(store.newCwdPath).toBe("");
  });

  it("方針とパスは同じストアに反映され、保存され、新しいストアが読み戻す（AC-I1）", () => {
    const store = useSettingsStore(pinia);
    store.setNewCwdPolicy("path");
    store.setNewCwdPath("~/work");
    expect(store.newCwdPolicy, "選んだ時点で反映").toBe("path");
    expect(store.newCwdPath).toBe("~/work");
    expect(readPrefs()).toMatchObject({ newCwdPolicy: "path", newCwdPath: "~/work" });
    const reloaded = useSettingsStore(createPinia());
    expect(reloaded.newCwdPolicy).toBe("path");
    expect(reloaded.newCwdPath).toBe("~/work");
  });

  it("保存しても他の好みは消えない", () => {
    writePrefs({ statusSymbols: false, scrollback: 5000 });
    useSettingsStore(pinia).setNewCwdPolicy("home");
    expect(readPrefs()).toMatchObject({
      statusSymbols: false,
      scrollback: 5000,
      newCwdPolicy: "home",
    });
  });

  it("保存された値が壊れていれば既定で起動する", () => {
    writePrefs({ newCwdPolicy: "somewhere", newCwdPath: 42 });
    const store = useSettingsStore(createPinia());
    expect(store.newCwdPolicy).toBe("follow");
    expect(store.newCwdPath).toBe("");
  });
});

describe("useSettingsStore — テーマ（20260921-theme-settings）", () => {
  it("何も保存されていなければ dracula・切・対の既定で、いま使うのは dracula（AC4）", () => {
    const store = useSettingsStore(pinia);
    expect(store.theme).toBe("dracula");
    expect(store.themeAuto).toBe(false);
    expect(store.themeLight).toBeNull();
    expect(store.themeDark).toBeNull();
    expect(store.effectiveTheme).toBe("dracula");
  });

  it("保存した値を値ごとに読み戻す（壊れた値だけを落とす。AC3・AC4）", () => {
    writePrefs({ theme: "gruvbox", themeAuto: true, themeLight: "lattee", themeDark: "vesper" });
    const store = useSettingsStore(pinia);
    expect(store.theme).toBe("gruvbox");
    expect(store.themeAuto).toBe(true);
    expect(store.themeLight).toBeNull();
    expect(store.themeDark).toBe("vesper");
  });

  it("1 つのテーマを選ぶと反映・保存され、自動の切替が入っていたら切る（AC7）", () => {
    const store = useSettingsStore(pinia);
    store.setThemeAuto(true);
    store.setTheme("nord");
    expect(store.theme).toBe("nord");
    expect(store.themeAuto).toBe(false);
    expect(store.effectiveTheme).toBe("nord");
    expect(readPrefs()).toMatchObject({ theme: "nord", themeAuto: false });
    const again = useSettingsStore(createPinia());
    expect(again.theme).toBe("nord");
    expect(again.themeAuto).toBe(false);
  });

  it("自動の切替が入っていれば、OS の明暗（systemDark）でいま使うテーマが替わる。切ると 1 つのテーマに戻る（AC5・AC7）", () => {
    const store = useSettingsStore(pinia);
    store.setTheme("tokyo-night");
    store.setThemeAuto(true);
    expect(readPrefs()["themeAuto"]).toBe(true); // 入を保存する（AC3）
    expect(useSettingsStore(createPinia()).themeAuto).toBe(true);
    store.systemDark = true;
    expect(store.effectiveTheme).toBe("tokyo-night");
    store.systemDark = false;
    expect(store.effectiveTheme).toBe("tokyo-night-day");
    store.setThemeAuto(false);
    expect(store.effectiveTheme).toBe("tokyo-night");
    expect(readPrefs()["themeAuto"]).toBe(false);
  });

  it("明るいとき・暗いときを選ぶと保存され、null を入れると対の既定に戻り、1 つのテーマの変更に追従する（AC6）", () => {
    const store = useSettingsStore(pinia);
    store.setTheme("gruvbox");
    store.setThemeAuto(true);
    store.systemDark = false;
    store.setThemeLight("one-light");
    expect(store.effectiveTheme).toBe("one-light");
    expect(readPrefs()["themeLight"]).toBe("one-light");
    // 選んだ後は、1 つのテーマを変えても追従しない（setTheme は自動を切るので、入れ直す）。
    store.setTheme("kanagawa");
    store.setThemeAuto(true);
    expect(store.effectiveTheme).toBe("one-light");
    // null で既定（対）に戻ると、また追従する。
    store.setThemeLight(null);
    expect(store.themeLight).toBeNull();
    expect(readPrefs()["themeLight"]).toBeNull();
    expect(store.effectiveTheme).toBe("kanagawa-lotus");
    store.setThemeDark("vesper");
    expect(readPrefs()["themeDark"]).toBe("vesper");
    store.systemDark = true;
    expect(store.effectiveTheme).toBe("vesper");
    // 新しいストアで読み直しても、null（対の既定）と選んだ値がそのまま戻る。
    const again = useSettingsStore(createPinia());
    expect(again.themeLight).toBeNull();
    expect(again.themeDark).toBe("vesper");
    again.systemDark = false;
    expect(again.effectiveTheme).toBe("kanagawa-lotus");
  });

  it("テーマを保存しても他の好みは消えない", () => {
    writePrefs({ statusSymbols: false, newCwdPolicy: "home" });
    const store = useSettingsStore(pinia);
    store.setTheme("one-dark");
    store.setThemeLight("solarized-light");
    expect(readPrefs()).toMatchObject({ statusSymbols: false, newCwdPolicy: "home", theme: "one-dark", themeLight: "solarized-light" });
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260921-keybinding-customization：キーの割り当て（AC3・AC4・AC8・AC9）
// ---------------------------------------------------------------------------------------------------------------------

describe("useSettingsStore — キーの割り当て（AC8）", () => {
  it("何も保存されていなければ既定の表（prefix は ctrl+b・割り当ては既定）", () => {
    const store = useSettingsStore(pinia);
    expect(store.keyPrefs).toEqual({ prefix: null, bindings: {}, navigateKeys: {}, commands: {} });
    expect(store.keymap.prefix).toBe("ctrl+b");
    expect(store.keymap.bindingsOf("split_vertical")).toEqual(["prefix+v"]);
    expect([...store.keymap.directMap.keys()]).toEqual(["ctrl+v"]); // 既定の直接のキーは画像の貼り付けだけ（20260927-clipboard-image-paste）
  });

  it("prefix・割り当てを変えると、解決した表が即時に変わり、soda.prefs.v1 の keys に差だけが保存される", () => {
    const store = useSettingsStore(pinia);
    store.setKeyPrefix("ctrl+a");
    store.setKeyBindings("split_vertical", ["prefix+v", "ctrl+alt+d"]);
    expect(store.keymap.prefix).toBe("ctrl+a");
    expect(store.keymap.bindingsOf("split_vertical")).toEqual(["prefix+v", "ctrl+alt+d"]);
    expect(store.keymap.directMap.get("ctrl+alt+d")).toEqual({ type: "split", dir: "right" });
    expect(readPrefs()["keys"]).toEqual({ prefix: "ctrl+a", bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"] } });
  });

  it("再読み込みで残る（別の pinia で読み直す）", () => {
    const first = useSettingsStore(pinia);
    first.setKeyPrefix("alt+x");
    first.setKeyBindings("help", []);
    const second = useSettingsStore(createPinia());
    expect(second.keymap.prefix).toBe("alt+x");
    expect(second.keymap.bindingsOf("help")).toEqual([]);
    expect(second.keymap.hintFor("help")).toBeNull();
  });

  it("壊れた保存値は値ごとに落として既定へ戻し、残りは生かして起動する", () => {
    writePrefs({ keys: { prefix: "cmd+b", bindings: { zoom: ["prefix+y"], bogus: ["prefix+q"], goto: 42 } } });
    const store = useSettingsStore(pinia);
    expect(store.keymap.prefix).toBe("ctrl+b"); // 送れない形の prefix は既定へ
    expect(store.keymap.bindingsOf("zoom")).toEqual(["prefix+y"]); // 有効な上書きは生きる
    expect(store.keymap.bindingsOf("goto")).toEqual(["prefix+g"]); // 配列でない値は既定へ
  });

  it("JSON でない・形が違う keys は既定（起動できる）", () => {
    for (const keys of ["x", 42, [], null]) {
      localStorage.clear();
      writePrefs({ keys });
      expect(useSettingsStore(createPinia()).keymap.prefix, JSON.stringify(keys)).toBe("ctrl+b");
    }
  });

  it("既定と同じ内容に戻せば上書きを消し、差が無くなれば keys ごと消える", () => {
    const store = useSettingsStore(pinia);
    store.setKeyBindings("zoom", ["prefix+y"]);
    expect(readPrefs()["keys"]).toBeDefined();
    store.setKeyBindings("zoom", ["prefix+z"]);
    expect(store.keyPrefs.bindings).toEqual({});
    expect(readPrefs()).not.toHaveProperty("keys");
  });

  it("通らない値は反映せず捨てる（二重の守り）：無効な文字列・送れない prefix・全部無効な入力", () => {
    const store = useSettingsStore(pinia);
    store.setKeyPrefix("cmd+b");
    expect(store.keymap.prefix).toBe("ctrl+b");
    store.setKeyBindings("zoom", ["nonsense"]);
    expect(store.keyPrefs.bindings).toEqual({});
    expect(readPrefs()).not.toHaveProperty("keys");
    store.setKeyBindings("zoom", ["prefix+y", "nonsense"]); // 有効な分だけ反映
    expect(store.keymap.bindingsOf("zoom")).toEqual(["prefix+y"]);
  });

  it("replaceKeyPrefs を直に呼んでも、読めない値は反映も保存もしない（二重の守り。setKeyPrefix・setKeyBindings は手前で弾くので、ここでしか届かない）", () => {
    const store = useSettingsStore(pinia);
    store.replaceKeyPrefs({ prefix: "cmd+b", bindings: { zoom: ["nonsense"] }, navigateKeys: {}, commands: {} });
    expect(store.keyPrefs).toEqual({ prefix: null, bindings: {}, navigateKeys: {}, commands: {} });
    expect(store.keymap.prefix).toBe("ctrl+b");
    expect(readPrefs()).not.toHaveProperty("keys");
    // 一部だけ読めないなら、読める分だけ（状態にも保存にも）残る。
    store.replaceKeyPrefs({
      prefix: "cmd+b",
      bindings: { zoom: ["prefix+y", "nonsense"] },
      navigateKeys: {},
      commands: {},
    });
    expect(store.keyPrefs).toEqual({
      prefix: null,
      bindings: { zoom: ["prefix+y"] },
      navigateKeys: {},
      commands: {},
    });
    expect(readPrefs()["keys"]).toEqual({ bindings: { zoom: ["prefix+y"] } });
  });

  it("別のウィンドウで割り当てが変わったら（storage イベント）追従し、古い状態から別の変更をしても先の変更を上書きしない", () => {
    const store = useSettingsStore(pinia);
    store.setKeyBindings("zoom", ["prefix+y"]);
    // 別のウィンドウが prefix を変えて保存した（自分の書き込みでは storage は発火しない。ここでは書いてから発火させる）。
    writePrefs({ keys: { prefix: "alt+x", bindings: { zoom: ["prefix+y"] } } });
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    expect(store.keymap.prefix).toBe("alt+x");
    const km = store.keymap;
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" })); // 変わっていなければ表を作り直さない
    expect(store.keymap).toBe(km);
    // このウィンドウで別の操作を変えても、先に保存された prefix は残る。
    store.setKeyBindings("help", ["prefix+u"]);
    expect(readPrefs()["keys"]).toEqual({
      prefix: "alt+x",
      bindings: { zoom: ["prefix+y"], help: ["prefix+u"] },
    });
  });

  it("他の設定を消さない（keys は併合して書く）", () => {
    writePrefs({ statusSymbols: false, theme: "nord" });
    const store = useSettingsStore(pinia);
    store.setKeyPrefix("ctrl+a");
    expect(readPrefs()["statusSymbols"]).toBe(false);
    expect(readPrefs()["theme"]).toBe("nord");
    expect(readPrefs()["keys"]).toEqual({ prefix: "ctrl+a" });
  });
});

describe("useSettingsStore — キーの戻し（AC9）", () => {
  it("操作ごと・prefix・すべてを既定へ戻す", () => {
    const store = useSettingsStore(pinia);
    store.setKeyPrefix("ctrl+a");
    store.setKeyBindings("zoom", ["prefix+y"]);
    store.setKeyBindings("help", []);
    store.resetKeyAction("zoom");
    expect(store.keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
    expect(store.keymap.bindingsOf("help")).toEqual([]); // 他の操作は変わらない
    store.resetKeyPrefix();
    expect(store.keymap.prefix).toBe("ctrl+b");
    expect(store.keymap.bindingsOf("help")).toEqual([]);
    store.resetAllKeys();
    expect(store.keyPrefs).toEqual({ prefix: null, bindings: {}, navigateKeys: {}, commands: {} });
    expect(store.keymap.bindingsOf("help")).toEqual(["prefix+?"]);
    expect(readPrefs()).not.toHaveProperty("keys");
  });

  it("すべて戻すは、prefix を変えたままでも prefix も戻す", () => {
    const store = useSettingsStore(pinia);
    store.setKeyPrefix("ctrl+a");
    store.setKeyBindings("zoom", ["prefix+y"]);
    store.resetAllKeys();
    expect(store.keymap.prefix).toBe("ctrl+b");
    expect(store.keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
    expect(readPrefs()).not.toHaveProperty("keys");
  });

  it("replaceKeyPrefs：戻し・おすすめの結果（KeyPrefs）をそのまま採る", () => {
    const store = useSettingsStore(pinia);
    store.replaceKeyPrefs({
      prefix: "alt+x",
      bindings: { zoom: ["ctrl+alt+z", "prefix+z"] },
      navigateKeys: {},
      commands: {},
    });
    expect(store.keymap.prefix).toBe("alt+x");
    expect(store.keymap.bindingsOf("zoom")).toEqual(["ctrl+alt+z", "prefix+z"]);
  });

  it("同じ内容を渡し直しても、書かず、keymap も作り直さない（購読は変えたときだけ動く。押すたびに作り直さない）", async () => {
    const store = useSettingsStore(pinia);
    const next = {
      prefix: "alt+x",
      bindings: { zoom: ["ctrl+alt+z", "prefix+z"] },
      navigateKeys: {},
      commands: {},
    };
    store.replaceKeyPrefs(next);
    const km = store.keymap;
    let fired = 0;
    watch(
      () => store.keymap,
      () => (fired += 1),
      { flush: "sync" },
    );
    const setItem = vi.spyOn(localStorage, "setItem");
    try {
      store.replaceKeyPrefs({
        prefix: "alt+x",
        bindings: { zoom: ["ctrl+alt+z", "prefix+z"] },
        navigateKeys: {},
        commands: {},
      });
      store.setKeyPrefix("alt+x");
      store.setKeyBindings("zoom", ["ctrl+alt+z", "prefix+z"]);
      await nextTick();
      expect(store.keymap, "同じ表のまま").toBe(km);
      expect(fired).toBe(0);
      expect(setItem).not.toHaveBeenCalled();
      store.setKeyPrefix("alt+y"); // 変えれば作り直され、購読が動き、保存される
      expect(store.keymap).not.toBe(km);
      expect(fired).toBe(1);
      expect(setItem).toHaveBeenCalledTimes(1);
    } finally {
      setItem.mockRestore();
    }
  });

  it("壊れた keys が保存に残っていても、すべて戻す・prefix を戻す操作で保存が直る（状態は既定のまま・表は作り直さない）", () => {
    writePrefs({ keys: "x" });
    const a = useSettingsStore(pinia);
    expect(a.keyPrefs).toEqual({ prefix: null, bindings: {}, navigateKeys: {}, commands: {} });
    const km = a.keymap;
    a.resetAllKeys();
    expect(readPrefs()).not.toHaveProperty("keys");
    expect(a.keymap).toBe(km);

    writePrefs({ keys: { prefix: "cmd+b" } }); // 送れない prefix（読み込みで落ちる）
    const b = useSettingsStore(createPinia());
    expect(b.keymap.prefix).toBe("ctrl+b");
    b.setKeyPrefix(null);
    expect(readPrefs()).not.toHaveProperty("keys");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260923-navigate-mode-keys：navigate モードの6操作の割り当て（AC1・AC5・AC6）
// ---------------------------------------------------------------------------------------------------------------------

describe("useSettingsStore — navigate モードの移動キー（AC1・AC5・AC6）", () => {
  it("何も保存されていなければ既定の表", () => {
    const store = useSettingsStore(pinia);
    expect(store.keyPrefs.navigateKeys).toEqual({});
    expect(store.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
    expect(store.navigateKeymap.bindingsOf("navigate_workspace_up")).toEqual(["up"]);
  });

  it("setNavigateKeyBindings で変えると、解決した表が即時に変わり、soda.prefs.v1 の keys.navigate に差だけが保存される", () => {
    const store = useSettingsStore(pinia);
    store.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    expect(store.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["ctrl+h"]);
    expect(store.navigateKeymap.ownerOf("h")).toBeNull(); // 既定の h は空く
    expect(readPrefs()["keys"]).toEqual({ navigate: { navigate_pane_left: ["ctrl+h"] } });
  });

  it("34〜35操作側の割り当てには影響しない（navigate 専用の表として独立している）", () => {
    const store = useSettingsStore(pinia);
    store.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    // keyPrefs は1つの ref なので、navigate だけを変えても `keymap`（34〜35操作側）は作り直る
    // （`keyPrefs.value` の差し替えに反応するため。design「store」の対象は「別の表を持つ」ことで、
    // computed の参照安定性の保証までは含まない）が、**中身**（bindings の割り当て）は変わらない。
    expect(store.keymap.bindingsOf("focus_pane_left")).toEqual(["prefix+h"]); // 34〜35操作側は無傷
    expect(store.keyPrefs.bindings).toEqual({});
    expect(store.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["ctrl+h"]);
  });

  it("resetNavigateKey で1操作だけ既定へ戻す", () => {
    const store = useSettingsStore(pinia);
    store.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    store.setNavigateKeyBindings("navigate_pane_down", ["ctrl+j"]);
    store.resetNavigateKey("navigate_pane_left");
    expect(store.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
    expect(store.navigateKeymap.bindingsOf("navigate_pane_down")).toEqual(["ctrl+j"]); // 他は変わらない
  });

  it("resetAllKeys は navigateKeys も一緒に既定へ戻す（design「設計方針」）", () => {
    const store = useSettingsStore(pinia);
    store.setKeyPrefix("ctrl+a");
    store.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    store.resetAllKeys();
    expect(store.keyPrefs).toEqual({ prefix: null, bindings: {}, navigateKeys: {}, commands: {} });
    expect(store.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
    expect(readPrefs()).not.toHaveProperty("keys");
  });

  it("通らない値は反映せず捨てる（二重の守り）：予約キー・全部無効な入力", () => {
    const store = useSettingsStore(pinia);
    store.setNavigateKeyBindings("navigate_pane_left", ["esc"]);
    expect(store.keyPrefs.navigateKeys).toEqual({});
    store.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h", "esc"]); // 有効な分だけ反映
    expect(store.navigateKeymap.bindingsOf("navigate_pane_left")).toEqual(["ctrl+h"]);
  });

  it("別のウィンドウで navigate の割り当てが変わったら（storage イベント）追従する", () => {
    const store = useSettingsStore(pinia);
    store.setNavigateKeyBindings("navigate_pane_left", ["ctrl+h"]);
    writePrefs({ keys: { navigate: { navigate_pane_left: ["ctrl+h"], navigate_pane_down: ["ctrl+j"] } } });
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    expect(store.navigateKeymap.bindingsOf("navigate_pane_down")).toEqual(["ctrl+j"]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260922-theme-custom-overrides：色の個別の上書き（AC6・AC7・AC8）
// ---------------------------------------------------------------------------------------------------------------------

describe("useSettingsStore — 色の個別の上書き（AC6・AC7・AC8）", () => {
  it("何も保存されていなければ上書き無し", () => {
    const store = useSettingsStore(pinia);
    expect(store.themeOverrides).toEqual({ light: {}, dark: {} });
  });

  it("setThemeOverride で反映・保存する。既定との差だけを持つ", () => {
    const store = useSettingsStore(pinia);
    store.setThemeOverride("light", "--soda-accent", "#a6e3a1");
    expect(store.themeOverrides).toEqual({ light: { "--soda-accent": "#a6e3a1" }, dark: {} });
    expect(readPrefs()["themeOverrides"]).toEqual({ light: { "--soda-accent": "#a6e3a1" } });
    const again = useSettingsStore(createPinia());
    expect(again.themeOverrides).toEqual({ light: { "--soda-accent": "#a6e3a1" }, dark: {} });
  });

  it("読めない値（構文が通らない色）は反映せず捨てる（二重の守り。setThemeOverride は妥当な値を渡す前提だが、直に replaceThemeOverrides を呼ぶ経路もある）", () => {
    const store = useSettingsStore(pinia);
    store.replaceThemeOverrides({ light: { "--soda-accent": "notacolor" }, dark: {} });
    expect(store.themeOverrides).toEqual({ light: {}, dark: {} });
    expect(readPrefs()).not.toHaveProperty("themeOverrides");
  });

  it("resetThemeOverride はその 1 項目だけを外す（ほかは残る。AC6）", () => {
    const store = useSettingsStore(pinia);
    store.setThemeOverride("light", "--soda-accent", "#fff");
    store.setThemeOverride("light", "--soda-bg", "#000");
    store.resetThemeOverride("light", "--soda-accent");
    expect(store.themeOverrides).toEqual({ light: { "--soda-bg": "#000" }, dark: {} });
  });

  it("resetAllThemeOverrides はすべて消し、themeOverrides ごと保存から消える（AC7）", () => {
    const store = useSettingsStore(pinia);
    store.setThemeOverride("light", "--soda-accent", "#fff");
    store.setThemeOverride("dark", "--soda-bg", "#000");
    store.resetAllThemeOverrides();
    expect(store.themeOverrides).toEqual({ light: {}, dark: {} });
    expect(readPrefs()).not.toHaveProperty("themeOverrides");
  });

  it("同じ内容を渡し直しても書かない（keys と同じ「二重の守り」の形）", () => {
    const store = useSettingsStore(pinia);
    store.setThemeOverride("light", "--soda-accent", "#fff");
    const setItem = vi.spyOn(localStorage, "setItem");
    try {
      store.setThemeOverride("light", "--soda-accent", "#fff");
      expect(setItem).not.toHaveBeenCalled();
      store.setThemeOverride("light", "--soda-accent", "#000"); // 変えれば書かれる
      expect(setItem).toHaveBeenCalledTimes(1);
    } finally {
      setItem.mockRestore();
    }
  });

  it("上書きを保存しても他の好み（テーマ・キー）は消えない", () => {
    writePrefs({ theme: "nord" });
    const store = useSettingsStore(pinia);
    store.setKeyPrefix("ctrl+a");
    store.setThemeOverride("dark", "--soda-accent", "#89b4fa");
    expect(readPrefs()).toMatchObject({
      theme: "nord",
      keys: { prefix: "ctrl+a" },
      themeOverrides: { dark: { "--soda-accent": "#89b4fa" } },
    });
  });

  it("別のウィンドウで上書きが変わったら（storage イベント）追従し、古い状態から別の変更をしても先の変更を上書きしない", () => {
    const store = useSettingsStore(pinia);
    store.setThemeOverride("light", "--soda-accent", "#fff");
    // 別のウィンドウが暗いときの上書きを足して保存した（自分の書き込みでは storage は発火しない。ここでは書いてから発火させる）。
    writePrefs({
      themeOverrides: { light: { "--soda-accent": "#fff" }, dark: { "--soda-bg": "#000" } },
    });
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    expect(store.themeOverrides).toEqual({ light: { "--soda-accent": "#fff" }, dark: { "--soda-bg": "#000" } });
    const snapshot = store.themeOverrides;
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" })); // 変わっていなければ表を作り直さない
    expect(store.themeOverrides).toBe(snapshot);
    // このウィンドウで別の CSS 変数を変えても、先に保存された分は残る。
    store.setThemeOverride("light", "--soda-menu-bg", "#111");
    expect(readPrefs()["themeOverrides"]).toEqual({
      light: { "--soda-accent": "#fff", "--soda-menu-bg": "#111" },
      dark: { "--soda-bg": "#000" },
    });
  });
});

describe("useSettingsStore — 独自コマンドの一覧と keymap（20260927-custom-command-keys の AC13）", () => {
  it("保存した割り当ては一覧に来たときだけ keymap に載り、一覧から消えると外れる（保存は残る）", () => {
    writePrefs({ keys: { commands: { git: ["prefix+alt+g"] } } });
    const store = useSettingsStore(pinia);
    const commands = useCommandsStore(pinia);
    expect(store.keymap.prefixMap.get("alt+g")).toBeUndefined();
    commands.setCatalog({ commands: [{ id: "git", type: "popup", description: "lazygit" }], problem: null });
    expect(store.keymap.prefixMap.get("alt+g")).toEqual({ type: "runCommand", commandId: "git" });
    expect(store.keymap.labelOf("command:git")).toBe("lazygit");
    commands.setCatalog({ commands: [], problem: null });
    expect(store.keymap.prefixMap.get("alt+g")).toBeUndefined();
    expect(store.keyPrefs.commands).toEqual({ git: ["prefix+alt+g"] });
  });

  it("setKeyBindings で独自コマンドに割り当てると保存される", () => {
    const store = useSettingsStore(pinia);
    store.setKeyBindings("command:build", ["ctrl+alt+b"]);
    expect((readPrefs()["keys"] as { commands: unknown }).commands).toEqual({ build: ["ctrl+alt+b"] });
  });
});

describe("useSettingsStore — サイドバーの行の並び（20260927-sidebar-row-tokens の AC11・AC15）", () => {
  it("何も保存されていなければ区画ごとに既定（null）で、使う並びは既定の並び", () => {
    const store = useSettingsStore(pinia);
    expect(store.sidebarRows).toEqual({ spaces: null, agents: null });
    expect(store.spacesLayout).toEqual(DEFAULT_LAYOUTS.spaces);
    expect(store.agentsLayout).toEqual(DEFAULT_LAYOUTS.agents);
  });

  it("区画を差し替えると反映・保存され、新しいストアが読み戻す。null で既定へ戻し、両方既定なら項目ごと消える", () => {
    const store = useSettingsStore(pinia);
    store.setSidebarLayout("spaces", [[{ token: "workspace", fg: "#f00" }], [{ token: "$build" }]]);
    expect(store.spacesLayout).toEqual([[{ token: "workspace", fg: "#f00" }], [{ token: "$build" }]]);
    expect(readPrefs()["sidebarRows"]).toEqual({ spaces: [[{ token: "workspace", fg: "#f00" }], [{ token: "$build" }]] });
    expect(useSettingsStore(createPinia()).spacesLayout).toEqual([[{ token: "workspace", fg: "#f00" }], [{ token: "$build" }]]);
    store.setSidebarLayout("agents", [[{ token: "agent" }]]);
    expect(readPrefs()["sidebarRows"]).toEqual({ spaces: [[{ token: "workspace", fg: "#f00" }], [{ token: "$build" }]], agents: [[{ token: "agent" }]] });
    store.setSidebarLayout("spaces", null);
    expect(store.spacesLayout).toEqual(DEFAULT_LAYOUTS.spaces);
    expect(readPrefs()["sidebarRows"]).toEqual({ agents: [[{ token: "agent" }]] });
    store.setSidebarLayout("agents", null);
    expect("sidebarRows" in readPrefs()).toBe(false);
  });

  it("読めない値は反映も保存もしない（二重の守り）", () => {
    const store = useSettingsStore(pinia);
    store.setSidebarLayout("spaces", [[{ token: "tab" }, { token: "workspace", fg: "red" }]]);
    expect(store.spacesLayout).toEqual([[{ token: "workspace" }]]);
    expect(readPrefs()["sidebarRows"]).toEqual({ spaces: [[{ token: "workspace" }]] });
  });

  it("状態も保存も同じなら書かない。保存だけが違えば保存だけ直す", () => {
    const store = useSettingsStore(pinia);
    store.setSidebarLayout("spaces", [[{ token: "workspace" }]]);
    const spy = vi.spyOn(localStorage, "setItem");
    store.setSidebarLayout("spaces", [[{ token: "workspace" }]]);
    expect(spy).not.toHaveBeenCalled();
    localStorage.setItem("soda.prefs.v1", JSON.stringify({ sidebarRows: "broken" }));
    spy.mockClear();
    store.setSidebarLayout("spaces", [[{ token: "workspace" }]]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(readPrefs()["sidebarRows"]).toEqual({ spaces: [[{ token: "workspace" }]] });
    spy.mockRestore();
  });

  it("保存が壊れていれば値ごとに落として起動する", () => {
    writePrefs({ sidebarRows: { spaces: "x", agents: [[{ token: "agent" }, { token: "nope" }]] } });
    const store = useSettingsStore(createPinia());
    expect(store.sidebarRows).toEqual({ spaces: null, agents: [[{ token: "agent" }]] });
  });

  it("別のタブ・ウィンドウでの変更に storage イベントで追従し、その後こちらで別の区画を変えても先の変更を上書きしない", () => {
    const store = useSettingsStore(pinia);
    writePrefs({ sidebarRows: { agents: [[{ token: "tab" }]] } });
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    expect(store.agentsLayout).toEqual([[{ token: "tab" }]]);
    store.setSidebarLayout("spaces", [[{ token: "workspace" }]]);
    expect(readPrefs()["sidebarRows"]).toEqual({ spaces: [[{ token: "workspace" }]], agents: [[{ token: "tab" }]] });
  });

  it("storage イベントでも値が変わっていなければ差し替えない（同じ参照のまま）", () => {
    const store = useSettingsStore(pinia);
    store.setSidebarLayout("spaces", [[{ token: "workspace" }]]);
    const before = store.sidebarRows;
    window.dispatchEvent(new StorageEvent("storage", { key: "soda.prefs.v1" }));
    expect(store.sidebarRows).toBe(before);
  });
});
