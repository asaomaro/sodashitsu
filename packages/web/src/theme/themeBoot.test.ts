import { THEME_NAMES, type ThemeName } from "@sodashitsu/protocol";
import { createPinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import bootSource from "../../public/theme-boot.js?raw";
import { useSettingsStore } from "../store/settings.js";
import { writePrefs } from "../store/view.js";
import { BOOT_KEY, ThemeController } from "./ThemeController.js";
import { resolveTheme, type ThemePrefs } from "@sodashitsu/client-core";
import { CSS_VARS, uiTokens } from "@sodashitsu/client-core";

/** `public/theme-boot.js` を、localStorage・matchMedia・document を差し替えて走らせる（ブラウザの <head> で走るのと同じ素の JS）。 */
function runBoot(opts: {
  stored: string | null;
  dark: boolean | null;
  root: HTMLElement;
  storageThrows?: boolean;
}): void {
  const storage = {
    getItem: (k: string) => {
      if (opts.storageThrows) throw new Error("SecurityError"); // プライベートモード・保存の拒否
      return k === BOOT_KEY ? opts.stored : null;
    },
  };
  // 問い合わせの文字列も見る（本体の main.ts と同じ "(prefers-color-scheme: dark)" でなければ投げる）。
  const matchMedia =
    opts.dark === null
      ? undefined
      : (query: string) => {
          if (query !== "(prefers-color-scheme: dark)")
            throw new Error(`unexpected media query: ${query}`);
          return { matches: opts.dark };
        };
  const doc = { documentElement: opts.root };
  new Function("localStorage", "matchMedia", "document", bootSource)(storage, matchMedia, doc);
}

/** 本体（ThemeController.writeBoot）が、その設定で書く控え。 */
function bootWrittenFor(prefs: ThemePrefs): string {
  localStorage.clear();
  writePrefs({
    theme: prefs.theme,
    themeAuto: prefs.auto,
    themeLight: prefs.light,
    themeDark: prefs.dark,
  });
  const map = new Map<string, string>();
  const storage = {
    setItem: (k: string, v: string) => map.set(k, v),
    getItem: (k: string) => map.get(k) ?? null,
  } as unknown as Storage;
  const controller = new ThemeController({
    settings: useSettingsStore(createPinia()),
    root: document.createElement("div"),
    media: null,
    setTerminalTheme: () => undefined,
    sendTheme: () => undefined,
    storage,
  });
  controller.writeBoot();
  return map.get(BOOT_KEY)!;
}

function appliedVars(root: HTMLElement): Record<string, string> {
  return Object.fromEntries(CSS_VARS.map((k) => [k, root.style.getPropertyValue(k)]));
}

let root: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  root = document.createElement("div");
});

describe("theme-boot.js は本体と同じ組を選ぶ（design D5）", () => {
  const cases: ThemePrefs[] = [
    { theme: "dracula", auto: false, light: null, dark: null },
    { theme: "gruvbox-light", auto: false, light: "one-dark", dark: null },
    { theme: "tokyo-night", auto: true, light: null, dark: null },
    { theme: "nord", auto: true, light: null, dark: null }, // 対の無いテーマ（明るいときは catppuccin-latte。design D7）
    { theme: "vesper", auto: true, light: "dracula", dark: "solarized-light" }, // 明るいときに暗いテーマも選べる
  ];
  for (const prefs of cases) {
    for (const dark of [true, false]) {
      it(`${prefs.theme}・自動 ${prefs.auto ? "入" : "切"}・OS が${dark ? "暗い" : "明るい"}`, () => {
        runBoot({ stored: bootWrittenFor(prefs), dark, root });
        const expected: ThemeName = resolveTheme(prefs, dark);
        expect(appliedVars(root)).toEqual(uiTokens(expected).vars);
        expect(root.style.colorScheme).toBe(uiTokens(expected).colorScheme);
      });
    }
  }

  it("matchMedia が無ければ暗い扱い（本体の store の systemDark の既定と同じ）", () => {
    const prefs: ThemePrefs = { theme: "catppuccin", auto: true, light: null, dark: null };
    runBoot({ stored: bootWrittenFor(prefs), dark: null, root });
    expect(appliedVars(root)).toEqual(uiTokens(resolveTheme(prefs, true)).vars);
  });

  it("17 のテーマすべての固定の控えを当てられる", () => {
    for (const theme of THEME_NAMES) {
      const r = document.createElement("div");
      runBoot({
        stored: bootWrittenFor({ theme, auto: false, light: null, dark: null }),
        dark: true,
        root: r,
      });
      expect(appliedVars(r), theme).toEqual(uiTokens(theme).vars);
    }
  });
});

describe("控えが無い・壊れているときは何もしない（起動できなくならない）", () => {
  for (const [label, stored] of [
    ["無い", null],
    ["JSON でない", "{oops"],
    ["null", "null"],
    ["形が違う", JSON.stringify({ auto: false, fixed: 3 })],
    [
      "自動なのに組が無い",
      JSON.stringify({
        auto: true,
        fixed: { vars: { "--soda-bg": "#000000" }, colorScheme: "dark" },
      }),
    ],
  ] as const) {
    it(label, () => {
      expect(() => runBoot({ stored, dark: true, root })).not.toThrow();
      expect(root.getAttribute("style")).toBeNull();
    });
  }

  it("localStorage を読めない（投げる）", () => {
    expect(() => runBoot({ stored: null, dark: true, root, storageThrows: true })).not.toThrow();
    expect(root.getAttribute("style")).toBeNull();
  });

  it("--soda- で始まらない名前・文字列でない値は当てない", () => {
    const stored = JSON.stringify({
      auto: false,
      fixed: {
        vars: { "--soda-bg": "#101010", color: "red", "--soda-fg": 3 },
        colorScheme: "purple",
      },
    });
    runBoot({ stored, dark: true, root });
    expect(root.style.getPropertyValue("--soda-bg")).toBe("#101010");
    expect(root.style.getPropertyValue("color")).toBe("");
    expect(root.style.getPropertyValue("--soda-fg")).toBe("");
    expect(root.style.colorScheme).toBe("");
  });
});
