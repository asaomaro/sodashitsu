import { THEME_APPEARANCE, THEME_NAMES, type ThemeName } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  lightDarkOf,
  loadThemePrefs,
  resolveTheme,
  siblingThemes,
  THEME_LABELS,
  type ThemePrefs,
} from "./themes.js";

const prefs = (p: Partial<ThemePrefs>): ThemePrefs => ({
  theme: "dracula",
  auto: false,
  light: null,
  dark: null,
  ...p,
});

describe("THEME_LABELS", () => {
  it("17 のテーマすべてに、design の表示名（上流のテーマの正式な呼び名）", () => {
    expect(THEME_LABELS).toEqual({
      catppuccin: "Catppuccin Mocha",
      "catppuccin-latte": "Catppuccin Latte",
      "tokyo-night": "Tokyo Night",
      "tokyo-night-day": "Tokyo Night Day",
      dracula: "Dracula",
      nord: "Nord",
      gruvbox: "Gruvbox Dark",
      "gruvbox-light": "Gruvbox Light",
      "one-dark": "One Dark",
      "one-light": "One Light",
      solarized: "Solarized Dark",
      "solarized-light": "Solarized Light",
      kanagawa: "Kanagawa Wave",
      "kanagawa-lotus": "Kanagawa Lotus",
      "rose-pine": "Rosé Pine",
      "rose-pine-dawn": "Rosé Pine Dawn",
      vesper: "Vesper",
    });
    expect(Object.keys(THEME_LABELS).sort()).toEqual([...THEME_NAMES].sort());
  });
});

describe("siblingThemes（AC6・design D7）", () => {
  it("herdr の 7 組は、どちら側から引いても同じ対", () => {
    const pairs: [ThemeName, ThemeName][] = [
      ["catppuccin", "catppuccin-latte"],
      ["tokyo-night", "tokyo-night-day"],
      ["gruvbox", "gruvbox-light"],
      ["one-dark", "one-light"],
      ["solarized", "solarized-light"],
      ["kanagawa", "kanagawa-lotus"],
      ["rose-pine", "rose-pine-dawn"],
    ];
    for (const [dark, light] of pairs) {
      expect(siblingThemes(dark)).toEqual({ dark, light });
      expect(siblingThemes(light)).toEqual({ dark, light });
    }
  });

  it("対の無い dracula・nord・vesper は、暗いときが自身・明るいときが catppuccin-latte（herdr は明暗とも自身）", () => {
    for (const n of ["dracula", "nord", "vesper"] as const) {
      expect(siblingThemes(n)).toEqual({ dark: n, light: "catppuccin-latte" });
    }
  });

  it("どのテーマでも、対の明るい側は明るいテーマ・暗い側は暗いテーマ", () => {
    for (const n of THEME_NAMES) {
      const s = siblingThemes(n);
      expect(THEME_APPEARANCE[s.light], n).toBe("light");
      expect(THEME_APPEARANCE[s.dark], n).toBe("dark");
    }
  });
});

describe("lightDarkOf / resolveTheme（AC5・AC7）", () => {
  it("自動の切替が切なら、OS の明暗に依らず 1 つのテーマ", () => {
    const p = prefs({ theme: "nord", light: "one-light", dark: "kanagawa" });
    expect(resolveTheme(p, true)).toBe("nord");
    expect(resolveTheme(p, false)).toBe("nord");
  });

  it("自動の切替が入なら、OS が暗いとき「暗いとき」、明るいとき「明るいとき」", () => {
    const p = prefs({ theme: "dracula", auto: true, light: "solarized-light", dark: "kanagawa" });
    expect(resolveTheme(p, true)).toBe("kanagawa");
    expect(resolveTheme(p, false)).toBe("solarized-light");
  });

  it("明るいとき・暗いときをまだ選んでいなければ（null）、1 つのテーマの対に追従する", () => {
    expect(lightDarkOf(prefs({ theme: "gruvbox" }))).toEqual({
      light: "gruvbox-light",
      dark: "gruvbox",
    });
    expect(lightDarkOf(prefs({ theme: "rose-pine-dawn" }))).toEqual({
      light: "rose-pine-dawn",
      dark: "rose-pine",
    });
    expect(resolveTheme(prefs({ theme: "tokyo-night", auto: true }), false)).toBe(
      "tokyo-night-day",
    );
    // 片方だけ選んでいれば、もう片方は対のまま。
    expect(lightDarkOf(prefs({ theme: "gruvbox", dark: "vesper" }))).toEqual({
      light: "gruvbox-light",
      dark: "vesper",
    });
  });
});

describe("loadThemePrefs（AC4：値ごとに落とす）", () => {
  it("何も保存していなければ dracula・切・対の既定", () => {
    expect(loadThemePrefs({})).toEqual({ theme: "dracula", auto: false, light: null, dark: null });
  });

  it("保存した「切」はそのまま切として読む（入に戻さない）", () => {
    expect(loadThemePrefs({ themeAuto: false }).auto).toBe(false);
    expect(loadThemePrefs({ theme: "nord", themeAuto: false, themeLight: "one-light" }).auto).toBe(
      false,
    );
  });

  it("明るいとき・暗いときは 17 のどれでもよい（明るいときに暗いテーマを選んでも、そのまま使う。AC5）", () => {
    const p = loadThemePrefs({
      theme: "nord",
      themeAuto: true,
      themeLight: "dracula",
      themeDark: "solarized-light",
    });
    expect(p).toMatchObject({ light: "dracula", dark: "solarized-light" });
    expect(resolveTheme(p, false)).toBe("dracula");
    expect(resolveTheme(p, true)).toBe("solarized-light");
  });

  it("正しい値はそのまま読む", () => {
    expect(
      loadThemePrefs({
        theme: "one-dark",
        themeAuto: true,
        themeLight: "one-light",
        themeDark: "vesper",
      }),
    ).toEqual({
      theme: "one-dark",
      auto: true,
      light: "one-light",
      dark: "vesper",
    });
  });

  it("壊れた値・知らない名前は、その値だけを落とす（ほかの値は保つ）", () => {
    expect(loadThemePrefs({ theme: "terminal", themeAuto: true, themeLight: "one-light" })).toEqual(
      {
        theme: "dracula",
        auto: true,
        light: "one-light",
        dark: null,
      },
    );
    expect(
      loadThemePrefs({ theme: "nord", themeAuto: "yes", themeLight: 3, themeDark: "Nord" }),
    ).toEqual({
      theme: "nord",
      auto: false,
      light: null,
      dark: null,
    });
  });

  it("壊れた「明るいとき」は dracula ではなく対の既定（null）に落ち、解決すると 1 つのテーマの対になる", () => {
    const p = loadThemePrefs({ theme: "kanagawa", themeAuto: true, themeLight: "lattee" });
    expect(p.light).toBeNull();
    expect(resolveTheme(p, false)).toBe("kanagawa-lotus");
  });
});
