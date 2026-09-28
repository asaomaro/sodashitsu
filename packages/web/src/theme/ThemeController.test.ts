import { TERMINAL_PALETTES, type TerminalPalette, type ThemeName } from "@sodashitsu/protocol";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useSettingsStore } from "../store/settings.js";
import { writePrefs } from "../store/view.js";
import { BOOT_KEY, ThemeController, type BootCache } from "./ThemeController.js";
import { uiTokens } from "@sodashitsu/client-core";

/** `matchMedia("(prefers-color-scheme: dark)")` の偽物（happy-dom の matchMedia は OS の明暗を切り替えて change を出せない）。`set` で切り替える。 */
function fakeMedia(dark: boolean) {
  const listeners = new Set<(ev: MediaQueryListEvent) => void>();
  const media = {
    matches: dark,
    addEventListener: (_: string, fn: (ev: MediaQueryListEvent) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (ev: MediaQueryListEvent) => void) => listeners.delete(fn),
  };
  return {
    media: media as unknown as MediaQueryList,
    set(next: boolean) {
      media.matches = next;
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
    },
  };
}

function fakeStorage() {
  const map = new Map<string, string>();
  const writes: string[] = [];
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes.push(k);
      map.set(k, v);
    },
  } as unknown as Storage;
  return {
    storage,
    writes,
    boot: () => JSON.parse(map.get(BOOT_KEY) ?? "null") as BootCache | null,
  };
}

let pinia: Pinia;
let root: HTMLElement;
let terminalThemes: TerminalPalette[];
let sent: ThemeName[];

beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
  root = document.createElement("div");
  terminalThemes = [];
  sent = [];
});
afterEach(() => localStorage.clear());

function make(
  opts: { dark?: boolean; media?: MediaQueryList | null; storage?: Storage | null } = {},
) {
  const settings = useSettingsStore(pinia);
  const m = fakeMedia(opts.dark ?? true);
  const s = fakeStorage();
  const controller = new ThemeController({
    settings,
    root,
    media: opts.media === undefined ? m.media : opts.media,
    setTerminalTheme: (p) => terminalThemes.push(p),
    sendTheme: (n) => sent.push(n),
    storage: opts.storage === undefined ? s.storage : opts.storage,
  });
  return { settings, controller, media: m, storage: s };
}

describe("ThemeController.start", () => {
  it("いま使うテーマを root（CSS 変数・color-scheme・data-theme）・全端末・サーバへ当て、控えを書く（AC2・AC10）", () => {
    writePrefs({ theme: "gruvbox-light" });
    const { controller, storage } = make();
    controller.start();
    const t = uiTokens("gruvbox-light");
    expect(root.style.getPropertyValue("--soda-menu-bg")).toBe(t.vars["--soda-menu-bg"]);
    expect(root.style.getPropertyValue("--soda-state-working")).toBe(t.vars["--soda-state-working"]);
    expect(root.style.colorScheme).toBe("light");
    expect(root.dataset["theme"]).toBe("gruvbox-light");
    expect(terminalThemes).toEqual([TERMINAL_PALETTES["gruvbox-light"]]);
    expect(sent).toEqual(["gruvbox-light"]);
    expect(storage.boot()).toMatchObject({
      auto: false,
      fixed: { colorScheme: "light", vars: t.vars },
    });
    expect(controller.current()).toBe("gruvbox-light");
  });

  it("1 回目は省略しない：控えが別のテーマの変数を当てていても、保存値が dracula なら dracula に当て直す", () => {
    const nord = uiTokens("nord");
    root.style.setProperty("--soda-menu-bg", nord.vars["--soda-menu-bg"]); // theme-boot.js が古い控えから当てた状態
    root.style.colorScheme = "light";
    const { controller } = make();
    controller.start();
    expect(root.style.getPropertyValue("--soda-menu-bg")).toBe("#282a36");
    expect(root.style.colorScheme).toBe("dark");
    expect(sent).toEqual(["dracula"]);
  });

  it("OS の明暗を読み、自動の切替が入っていればそのテーマ。matchMedia が無ければ暗い扱い", () => {
    writePrefs({ theme: "catppuccin", themeAuto: true });
    make({ dark: false }).controller.start();
    expect(sent).toEqual(["catppuccin-latte"]);
    sent = [];
    pinia = createPinia();
    make({ media: null }).controller.start();
    expect(sent).toEqual(["catppuccin"]);
  });
});

describe("変化を追う", () => {
  it("OS の明暗が変わると当て直し（AC5）、控えは書き直さない（中身が変わらない）", async () => {
    writePrefs({ theme: "tokyo-night", themeAuto: true });
    const { controller, media, storage } = make({ dark: true });
    controller.start();
    const writesAfterStart = storage.writes.length;
    media.set(false);
    await nextTick();
    expect(root.dataset["theme"]).toBe("tokyo-night-day");
    expect(sent).toEqual(["tokyo-night", "tokyo-night-day"]);
    expect(terminalThemes.at(-1)).toBe(TERMINAL_PALETTES["tokyo-night-day"]);
    expect(storage.writes.length).toBe(writesAfterStart);
  });

  it("設定を変えると当て直し、控えを書き直す。いま使うテーマが変わらなくても（暗いときに「明るいとき」を変えた）控えは書き直す", async () => {
    const { settings, controller, storage } = make({ dark: true });
    controller.start();
    settings.setTheme("nord");
    await nextTick();
    expect(root.dataset["theme"]).toBe("nord");
    expect(storage.boot()?.fixed.vars["--soda-menu-bg"]).toBe(
      uiTokens("nord").vars["--soda-menu-bg"],
    );
    settings.setThemeAuto(true);
    await nextTick();
    expect(storage.boot()?.auto).toBe(true); // 自動の切替を入れただけでも控えを書き直す
    const before = sent.length;
    settings.setThemeLight("solarized-light"); // OS は暗いので、いま使うテーマは nord のまま
    await nextTick();
    expect(sent.length).toBe(before);
    expect(storage.boot()).toMatchObject({
      auto: true,
      light: { colorScheme: "light", vars: uiTokens("solarized-light").vars },
    });
  });

  it("「暗いとき」を変えると控えの dark の組を書き直す。最初の控えは固定・明るいとき・暗いときを 1 つのテーマの対で持つ", async () => {
    writePrefs({ theme: "catppuccin" });
    const { settings, controller, storage } = make({ dark: true });
    controller.start();
    expect(storage.boot()).toEqual({
      auto: false,
      fixed: { colorScheme: "dark", vars: uiTokens("catppuccin").vars },
      light: { colorScheme: "light", vars: uiTokens("catppuccin-latte").vars },
      dark: { colorScheme: "dark", vars: uiTokens("catppuccin").vars },
    });
    settings.setThemeDark("one-dark");
    await nextTick();
    expect(storage.boot()?.dark).toEqual({ colorScheme: "dark", vars: uiTokens("one-dark").vars });
  });

  it("自動の切替が入っていて既定の対のまま 1 つのテーマを選んでも、途中の状態のテーマを当てたり送ったりしない（1 回だけ）", async () => {
    writePrefs({ theme: "dracula", themeAuto: true });
    const { settings, controller, storage } = make({ dark: true });
    controller.start();
    const writes = storage.writes.length;
    settings.setTheme("catppuccin-latte"); // theme が先に替わると、途中で「catppuccin-latte の対の暗い側」＝ catppuccin を指す
    await nextTick();
    expect(sent).toEqual(["dracula", "catppuccin-latte"]);
    expect(terminalThemes).toEqual([
      TERMINAL_PALETTES.dracula,
      TERMINAL_PALETTES["catppuccin-latte"],
    ]);
    expect(storage.writes.length).toBe(writes + 1);
    expect(storage.boot()?.auto).toBe(false);
  });

  it("start の前に apply が呼ばれていても、start は同じ名前でも当て直す", () => {
    const { controller } = make();
    controller.apply("dracula");
    root.style.removeProperty("--soda-menu-bg");
    controller.start();
    expect(root.style.getPropertyValue("--soda-menu-bg")).toBe("#282a36");
  });

  it("控えは保存された設定から作る——同じブラウザの別のタブで 1 つのテーマを変えていても、このタブで「暗いとき」を変えたときの控えはそれに揃う", async () => {
    const { settings, controller, storage } = make({ dark: true });
    controller.start();
    writePrefs({ theme: "nord" }); // 別のタブが保存した（このタブの store は dracula のまま）
    settings.setThemeDark("vesper");
    await nextTick();
    expect(storage.boot()?.fixed.vars["--soda-menu-bg"]).toBe(
      uiTokens("nord").vars["--soda-menu-bg"],
    );
    expect(storage.boot()?.dark.vars["--soda-menu-bg"]).toBe(
      uiTokens("vesper").vars["--soda-menu-bg"],
    );
  });

  it("同じ名前なら当て直さない（端末・サーバへ二度送らない）", () => {
    const { controller } = make();
    controller.start();
    controller.apply("dracula");
    expect(terminalThemes).toHaveLength(1);
    expect(sent).toEqual(["dracula"]);
  });

  it("stop の後は追わない", async () => {
    writePrefs({ themeAuto: true, theme: "gruvbox" });
    const { controller, media } = make({ dark: true });
    controller.start();
    controller.stop();
    media.set(false);
    await nextTick();
    expect(sent).toEqual(["gruvbox"]);
  });
});

describe("resend・控えの書き込みの失敗", () => {
  it("resend は直前に当てた名前を送り直す。start の前は何もしない", () => {
    const { controller } = make();
    controller.resend();
    expect(sent).toEqual([]);
    controller.start();
    controller.resend();
    expect(sent).toEqual(["dracula", "dracula"]);
  });

  it("控えを書けなくても（storage が投げる・無い）落ちない", () => {
    const throwing = {
      setItem: () => {
        throw new Error("quota");
      },
    } as unknown as Storage;
    expect(() => make({ storage: throwing }).controller.start()).not.toThrow();
    pinia = createPinia();
    expect(() => make({ storage: null }).controller.start()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260922-theme-custom-overrides：色の個別の上書き（AC2・AC3・AC4・AC9）
// ---------------------------------------------------------------------------------------------------------------------

describe("色の上書き", () => {
  it("いま当たっているテーマの colorScheme に合う層だけが当たる（明るいテーマなら明るいときの上書き）", () => {
    writePrefs({ theme: "one-light" }); // colorScheme: light
    const { settings, controller } = make();
    settings.setThemeOverride("light", "--soda-accent", "#a6e3a1");
    settings.setThemeOverride("dark", "--soda-accent", "#89b4fa"); // 効かないはず（暗いときの上書き）
    controller.start();
    expect(root.style.getPropertyValue("--soda-accent")).toBe("#a6e3a1");
  });

  it("themeAuto の真偽ではなく colorScheme で選ぶ：auto が切のまま明るいテーマ 1 つを固定していても、明るいときの上書きが効く（AC3 の逸脱）", () => {
    writePrefs({ theme: "one-light", themeAuto: false });
    const { settings, controller } = make();
    settings.setThemeOverride("light", "--soda-bg", "#eff1f5");
    controller.start();
    expect(root.style.getPropertyValue("--soda-bg")).toBe("#eff1f5");
  });

  it("上書きは、コントラスト調整済みの計算結果の上にそのまま当たる（AC2。再計算しない）", () => {
    writePrefs({ theme: "dracula" });
    const { settings, controller } = make();
    const before = root.style.getPropertyValue("--soda-menu-bg");
    expect(before).not.toBe("#000000"); // 上書き前は既定の値
    settings.setThemeOverride("dark", "--soda-menu-bg", "#000000");
    controller.start();
    expect(root.style.getPropertyValue("--soda-menu-bg")).toBe("#000000");
    // 上書きしていない変数は既定の値のまま（コントラスト調整の結果を維持）。
    const t = uiTokens("dracula");
    expect(root.style.getPropertyValue("--soda-accent")).toBe(t.vars["--soda-accent"]);
  });

  it("apply() の『同じ名前なら省く』最適化は壊れない：テーマ名を変えずに上書きだけ変えても、applyOverrides() 経由で再適用される（研究 F5 の回帰）", async () => {
    writePrefs({ theme: "dracula" });
    const { settings, controller } = make();
    controller.start();
    expect(sent).toEqual(["dracula"]); // 起動で 1 回送る
    settings.setThemeOverride("dark", "--soda-accent", "#ff0000");
    await nextTick();
    expect(root.style.getPropertyValue("--soda-accent")).toBe("#ff0000");
    // テーマ名は変わっていないので、端末の色・サーバへ送る名前は増えない（上書きは画面の枠だけに効く）。
    expect(sent).toEqual(["dracula"]);
    expect(terminalThemes).toEqual([TERMINAL_PALETTES["dracula"]]);
  });

  it("applyOverrides() は start() の前（applied が null）では何もしない", () => {
    const { settings, controller } = make();
    settings.setThemeOverride("dark", "--soda-accent", "#ff0000");
    expect(() => controller.applyOverrides()).not.toThrow();
    expect(root.style.getPropertyValue("--soda-accent")).toBe("");
  });

  it("テーマを替えると、新しいテーマの colorScheme に合う層に切り替わる", async () => {
    writePrefs({ theme: "dracula" }); // dark
    const { settings, controller } = make();
    settings.setThemeOverride("dark", "--soda-accent", "#da0000");
    settings.setThemeOverride("light", "--soda-accent", "#11a000");
    controller.start();
    expect(root.style.getPropertyValue("--soda-accent")).toBe("#da0000");
    settings.setTheme("one-light"); // light
    await nextTick(); // effectiveTheme の変化を追う watch は非同期
    expect(root.style.getPropertyValue("--soda-accent")).toBe("#11a000");
  });

  it("上書きが無ければ、従来どおりの値になる（回帰）", () => {
    writePrefs({ theme: "nord" });
    const { controller } = make();
    controller.start();
    const t = uiTokens("nord");
    for (const key of Object.keys(t.vars) as (keyof typeof t.vars)[])
      expect(root.style.getPropertyValue(key)).toBe(t.vars[key]);
  });

  it("控え（writeBoot）にも上書きが入る", () => {
    writePrefs({
      theme: "dracula",
      themeOverrides: { dark: { "--soda-accent": "#ff00ff" } },
    });
    const { controller, storage } = make();
    controller.start();
    expect(storage.boot()?.fixed.vars["--soda-accent"]).toBe("#ff00ff");
  });

  it("上書きを変えると、控えも書き直される（開き直しでも一瞬既定の色が出ないよう。AC9）", async () => {
    writePrefs({ theme: "dracula" });
    const { settings, controller, storage } = make();
    controller.start();
    expect(storage.boot()?.fixed.vars["--soda-accent"]).not.toBe("#123456");
    settings.setThemeOverride("dark", "--soda-accent", "#123456");
    await nextTick(); // themeOverrides の変化を追う watch は非同期
    expect(storage.boot()?.fixed.vars["--soda-accent"]).toBe("#123456");
  });

  it("控えの上書きも保存された設定から作る——同じブラウザの別のタブが上書きを変えていても（このタブの store は古いまま）、このタブで書き直す控えはそれに揃う", async () => {
    writePrefs({ theme: "dracula" });
    const { settings, controller, storage } = make();
    controller.start();
    writePrefs({ themeOverrides: { dark: { "--soda-accent": "#1a2b3c" } } }); // 別のタブが保存した（このタブの store は追従前）
    settings.setThemeDark("vesper"); // このタブで何か別の設定を変え、writeBoot を起こす
    await nextTick();
    expect(storage.boot()?.fixed.vars["--soda-accent"]).toBe("#1a2b3c");
  });
});
