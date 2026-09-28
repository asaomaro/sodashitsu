import { DEFAULT_THEME_NAME, isThemeName, type ThemeName } from "@sodashitsu/protocol";

/**
 * テーマの名前の扱い（20260921-theme-settings）。**どのテーマを使うかの規則はここの 1 か所**——設定の store・`ThemeController`・設定ダイアログは
 * ここを呼ぶ。`public/theme-boot.js`（最初の描画）は明暗の選び方だけを複製し、`themeBoot.test.ts` で揃っていることを確かめる（design D5）。
 */

/** 設定の一覧に出す名前（上流のテーマの正式な呼び名。design「インターフェース」web）。 */
export const THEME_LABELS: Readonly<Record<ThemeName, string>> = {
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
};

/** herdr の `sibling_theme_names`（`src/app/mod.rs:219-244`）の 7 組。[暗い, 明るい]。 */
const SIBLINGS: readonly (readonly [ThemeName, ThemeName])[] = [
  ["catppuccin", "catppuccin-latte"],
  ["tokyo-night", "tokyo-night-day"],
  ["gruvbox", "gruvbox-light"],
  ["one-dark", "one-light"],
  ["solarized", "solarized-light"],
  ["kanagawa", "kanagawa-lotus"],
  ["rose-pine", "rose-pine-dawn"],
];

/** 対の無いテーマの明るい側（design D7：herdr が明るい側の名前を知らないときに落とす先。herdr 自身は対の無い名前を明暗とも同じにする）。 */
const LIGHT_FALLBACK: ThemeName = "catppuccin-latte";

/** そのテーマの対（自動の切替の「明るいとき」「暗いとき」の既定。AC6）。対の無いテーマ（dracula・nord・vesper）は暗いときが自身。 */
export function siblingThemes(name: ThemeName): { light: ThemeName; dark: ThemeName } {
  const pair = SIBLINGS.find(([dark, light]) => name === dark || name === light);
  return pair ? { dark: pair[0], light: pair[1] } : { dark: name, light: LIGHT_FALLBACK };
}

/** このブラウザのテーマの設定。`light`・`dark` の null は「まだ選んでいない」——1 つのテーマの対に追従する（AC6）。 */
export interface ThemePrefs {
  theme: ThemeName;
  auto: boolean;
  light: ThemeName | null;
  dark: ThemeName | null;
}

/** 自動の切替で使う 2 つ（選んでいなければ `theme` の対）。 */
export function lightDarkOf(p: ThemePrefs): { light: ThemeName; dark: ThemeName } {
  const sib = siblingThemes(p.theme);
  return { light: p.light ?? sib.light, dark: p.dark ?? sib.dark };
}

/** いま使うテーマ。自動の切替が切なら 1 つのテーマ、入なら OS の明暗に合ったほう（AC5・AC7）。 */
export function resolveTheme(p: ThemePrefs, systemDark: boolean): ThemeName {
  if (!p.auto) return p.theme;
  const ld = lightDarkOf(p);
  return systemDark ? ld.dark : ld.light;
}

/**
 * 保存された値を**値ごとに**読む（AC4）：1 つのテーマが名前でなければ dracula、自動の切替が boolean でなければ切、「明るいとき」「暗いとき」が
 * 名前でなければ null（＝対の既定）。
 */
export function loadThemePrefs(raw: Record<string, unknown>): ThemePrefs {
  return {
    theme: isThemeName(raw["theme"]) ? raw["theme"] : DEFAULT_THEME_NAME,
    auto: typeof raw["themeAuto"] === "boolean" ? raw["themeAuto"] : false,
    light: isThemeName(raw["themeLight"]) ? raw["themeLight"] : null,
    dark: isThemeName(raw["themeDark"]) ? raw["themeDark"] : null,
  };
}
