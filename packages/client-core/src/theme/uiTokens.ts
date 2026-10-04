import {
  contrastRatio,
  ensureContrast,
  mixHex,
  TERMINAL_PALETTES,
  THEME_APPEARANCE,
  type ThemeName,
} from "@sodashitsu/protocol";

/**
 * 画面の枠の色（CSS 変数。20260921-theme-settings の design D3・表）。**dracula は今の値の定数**（`App.vue` の `:root` はその写しで、
 * 一致は `uiTokens.test.ts` が守る）。ほかの 16 テーマは herdr の画面の枠の配色から組み立て、WCAG のコントラストに**足りない色だけ**
 * 明度を寄せる（`ensureContrast`。色相は保つ）。どのテーマでも表の相手に対して比が足りることは `uiTokens.test.ts` が全数で確かめる（AC9）。
 */

export const CSS_VARS = [
  "--soda-bg",
  "--soda-fg",
  "--soda-menu-bg",
  "--soda-menu-fg",
  "--soda-menu-border",
  "--soda-menu-active-bg",
  "--soda-menu-hover-bg",
  "--soda-accent",
  "--soda-accent-fg",
  "--soda-error-fg",
  "--soda-warn-fg",
  "--soda-state-blocked",
  "--soda-state-working",
  "--soda-state-done",
  "--soda-state-idle",
  "--soda-subtle-bg",
  "--soda-backdrop",
  "--soda-backdrop-strong",
  "--soda-pane-current",
  "--soda-resize-line",
] as const;
export type CssVar = (typeof CSS_VARS)[number];

export interface UiTokens {
  vars: Readonly<Record<CssVar, string>>;
  colorScheme: "light" | "dark";
}

/** 選択の面と枠の背景の最小の比（dracula の 1.56 と同じ程度。decisions D15）。 */
export const MIN_SELECTED_SURFACE_RATIO = 1.5;

/** 薄めて描く文字の最小の透明度（これより薄い文字は無効な部品などで、AC9 の対象外。decisions D2・D6）。 */
export const MUTED_TEXT_ALPHA = 0.7;

/**
 * dracula——**今の見た目そのもの**（`App.vue` の `:root`・各部品に直に書いていた色。research F14〜F16）。変えたのはアクセントだけ
 * （#6272a4 → #6070a1。上の文字が 4.41 で 4.5 を割っていた。decisions D1）。
 */
const DRACULA: UiTokens = {
  vars: {
    "--soda-bg": "#1e1f29",
    "--soda-fg": "#f8f8f2",
    "--soda-menu-bg": "#282a36",
    "--soda-menu-fg": "#f8f8f2",
    "--soda-menu-border": "#44475a",
    "--soda-menu-active-bg": "#44475a",
    "--soda-menu-hover-bg": "#343746",
    "--soda-accent": "#6070a1",
    "--soda-accent-fg": "#f8f8f2",
    "--soda-error-fg": "#ff5555",
    "--soda-warn-fg": "#ffb86c",
    "--soda-state-blocked": "#ff6e6e",
    "--soda-state-working": "#f1fa8c",
    "--soda-state-done": "#50fa7b",
    "--soda-state-idle": "#8a9ad0",
    "--soda-subtle-bg": "rgba(255, 255, 255, 0.08)",
    "--soda-backdrop": "rgba(0, 0, 0, 0.4)",
    "--soda-backdrop-strong": "rgba(0, 0, 0, 0.5)",
    // 選ばれている pane の枠（以前は `--soda-menu-border` を使っていた。decisions D15）。dracula は今の値のまま。
    "--soda-pane-current": "#44475a",
    // 境目の強調の線。accent が menu-bg に 2.94 しか届かないので fg（選び方は `resizeLineColor`。値は uiTokens.test.ts が守る）。
    "--soda-resize-line": "#f8f8f2",
  },
  colorScheme: "dark",
};

/** herdr の `Palette` のうち使う項目（`panel_bg`・`surface0`・`text`・`overlay1`・`accent`・`red`・`yellow`・`green`・`peach`）。 */
interface HerdrPalette {
  panelBg: string;
  surface0: string;
  text: string;
  overlay1: string;
  accent: string;
  red: string;
  yellow: string;
  green: string;
  peach: string;
}

/**
 * herdr `da6bcd5969779bfe0396bcf89a8025d4375d611e` の `src/app/state.rs:78-527`（`Palette::catppuccin()` 〜 `vesper()`）の値（research F1）。
 * 手で写さず、ソースから書き出した値を貼った。
 */
const HERDR: Readonly<Record<Exclude<ThemeName, "dracula">, HerdrPalette>> = {
  catppuccin: {
    panelBg: "#181825",
    surface0: "#313244",
    text: "#cdd6f4",
    overlay1: "#7f849c",
    accent: "#89b4fa",
    red: "#f38ba8",
    yellow: "#f9e2af",
    green: "#a6e3a1",
    peach: "#fab387",
  },
  "catppuccin-latte": {
    panelBg: "#eff1f5",
    surface0: "#ccd0da",
    text: "#4c4f69",
    overlay1: "#8c8fa1",
    accent: "#1e66f5",
    red: "#d20f39",
    yellow: "#df8e1d",
    green: "#40a02b",
    peach: "#fe640b",
  },
  "tokyo-night": {
    panelBg: "#1a1b26",
    surface0: "#24283b",
    text: "#c0caf5",
    overlay1: "#697196",
    accent: "#7aa2f7",
    red: "#f7768e",
    yellow: "#e0af68",
    green: "#9ece6a",
    peach: "#ff9e64",
  },
  "tokyo-night-day": {
    panelBg: "#e1e2e7",
    surface0: "#c4c8da",
    text: "#3760bf",
    overlay1: "#68709a",
    accent: "#2e7de9",
    red: "#f52a65",
    yellow: "#8c6c3e",
    green: "#587539",
    peach: "#b15c00",
  },
  nord: {
    panelBg: "#2e3440",
    surface0: "#3b4252",
    text: "#eceff4",
    overlay1: "#646e82",
    accent: "#88c0d0",
    red: "#bf616a",
    yellow: "#ebcb8b",
    green: "#a3be8c",
    peach: "#d08770",
  },
  gruvbox: {
    panelBg: "#282828",
    surface0: "#3c3836",
    text: "#ebdbb2",
    overlay1: "#a89984",
    accent: "#d79921",
    red: "#fb4934",
    yellow: "#fabd2f",
    green: "#b8bb26",
    peach: "#fe8019",
  },
  "gruvbox-light": {
    panelBg: "#fbf1c7",
    surface0: "#ebdbb2",
    text: "#3c3836",
    overlay1: "#7c6f64",
    accent: "#076678",
    red: "#9d0006",
    yellow: "#b57614",
    green: "#79740e",
    peach: "#af3a03",
  },
  "one-dark": {
    panelBg: "#282c34",
    surface0: "#2c313a",
    text: "#abb2bf",
    overlay1: "#737a87",
    accent: "#61afef",
    red: "#e06c75",
    yellow: "#e5c07b",
    green: "#98c379",
    peach: "#d19a66",
  },
  "one-light": {
    panelBg: "#fafafa",
    surface0: "#f0f0f1",
    text: "#383a42",
    overlay1: "#686b77",
    accent: "#4078f2",
    red: "#e45649",
    yellow: "#c18401",
    green: "#50a14f",
    peach: "#986801",
  },
  solarized: {
    panelBg: "#002b36",
    surface0: "#073642",
    text: "#93a1a1",
    overlay1: "#657b83",
    accent: "#268bd2",
    red: "#dc322f",
    yellow: "#b58900",
    green: "#859900",
    peach: "#cb4b16",
  },
  "solarized-light": {
    panelBg: "#fdf6e3",
    surface0: "#eee8d5",
    text: "#657b83",
    overlay1: "#586e75",
    accent: "#268bd2",
    red: "#dc322f",
    yellow: "#b58900",
    green: "#859900",
    peach: "#cb4b16",
  },
  kanagawa: {
    panelBg: "#1f1f28",
    surface0: "#2a2a37",
    text: "#dcd7ba",
    overlay1: "#87867d",
    accent: "#7e9cd8",
    red: "#c34043",
    yellow: "#c0a36e",
    green: "#76946a",
    peach: "#ffa066",
  },
  "kanagawa-lotus": {
    panelBg: "#f2ecbc",
    surface0: "#dcd5ac",
    text: "#545464",
    overlay1: "#8a8980",
    accent: "#4d699b",
    red: "#c84053",
    yellow: "#77713f",
    green: "#6f894e",
    peach: "#cc6d00",
  },
  "rose-pine": {
    panelBg: "#191724",
    surface0: "#1f1d2e",
    text: "#e0def4",
    overlay1: "#908caa",
    accent: "#c4a7e7",
    red: "#eb6f92",
    yellow: "#f6c177",
    green: "#31748f",
    peach: "#ea9a97",
  },
  "rose-pine-dawn": {
    panelBg: "#faf4ed",
    surface0: "#f2e9e1",
    text: "#464261",
    overlay1: "#797593",
    accent: "#907aa9",
    red: "#b4637a",
    yellow: "#ea9d34",
    green: "#286983",
    peach: "#d7827e",
  },
  vesper: {
    panelBg: "#1a1a1a",
    surface0: "#232323",
    text: "#ffffff",
    overlay1: "#7e7e7e",
    accent: "#ffc799",
    red: "#ff8080",
    yellow: "#ffc799",
    green: "#99ffe4",
    peach: "#ffc799",
  },
};

/** `rgba(r, g, b, a)` を不透明な下地 `base` に重ねた色（半透明の変数を検査の相手にするときに使う）。 */
export function overlay(rgba: string, base: string): string {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(rgba);
  if (!m) throw new Error(`rgba(r, g, b, a) で渡す: ${rgba}`);
  const hex = `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`;
  return mixHex(hex, base, Number(m[4]));
}

/** 淡い面（`--soda-subtle-bg`。半透明）を不透明な下地に重ねた色（検査の相手に使う）。 */
export function subtleOver(tokens: UiTokens, base: string): string {
  return overlay(tokens.vars["--soda-subtle-bg"], base);
}

/** 白と黒のどちらとの比が大きいか（＝明るい色か）。 */
function isLightColor(hex: string): boolean {
  return contrastRatio(hex, "#000000") > contrastRatio(hex, "#ffffff");
}

/** 境目の線に求める、背景に対する最小の比（WCAG 1.4.11 の非テキストの 3:1。20261004-ui-interaction-polish）。 */
export const MIN_RESIZE_LINE_RATIO = 3;

/**
 * 境目の強調の線の色（`--soda-resize-line`）。`accent` が `bg`・`menuBg` の両方に 3:1 以上ならそれ、
 * そうでなければ `fg`（両方を満たすものが無いときは、両方に対する比の低いほうが大きい色）。
 */
export function resizeLineColor(bg: string, menuBg: string, accent: string, fg: string): string {
  const floor = (c: string) => Math.min(contrastRatio(c, bg), contrastRatio(c, menuBg));
  if (floor(accent) >= MIN_RESIZE_LINE_RATIO) return accent;
  return floor(fg) >= floor(accent) ? fg : accent;
}

function build(name: Exclude<ThemeName, "dracula">): UiTokens {
  const p = HERDR[name];
  const dark = THEME_APPEARANCE[name] === "dark";
  const away = dark ? "#ffffff" : "#000000"; // 文字・状態の色を寄せる向き（背景から遠ざかる）
  const menuBg = p.panelBg;
  // 選択の面（表示中の tab・サイドバーの行・goto とメニューの選んだ項目）は、枠の背景から少なくとも 1.5 だけ離す——herdr の `surface0` のままでは
  // one-dark・rose-pine で 1.07 と見分けられない（dracula は 1.56。review ラウンド 1。decisions D15）。
  const active = ensureContrast(p.surface0, [menuBg], MIN_SELECTED_SURFACE_RATIO, away);
  const hover = mixHex(menuBg, active, 0.5);
  const bg = mixHex(menuBg, "#000000", dark ? 0.75 : 0.96);
  const subtle = dark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)";
  const terminalBg = TERMINAL_PALETTES[name].background;
  const rows = [bg, menuBg, hover, active];
  // 文字：0.7 に薄めても 4.5（淡い面の上を含む）。フォーカスの枠としては端末の背景に対して 3。
  const fg = ensureContrast(
    ensureContrast(
      p.text,
      [...rows, overlay(subtle, bg), overlay(subtle, menuBg)],
      4.5,
      away,
      MUTED_TEXT_ALPHA,
    ),
    [terminalBg],
    3,
    away,
  );
  // アクセント（押された状態の下地）：上に載る文字は fg と menu-bg のうち比が大きいほう。足りなければアクセントをその文字から遠ざける。
  const accentFg = contrastRatio(fg, p.accent) >= contrastRatio(menuBg, p.accent) ? fg : menuBg;
  const accent = ensureContrast(
    p.accent,
    [accentFg],
    4.5,
    isLightColor(accentFg) ? "#000000" : "#ffffff",
  );
  return {
    vars: {
      "--soda-bg": bg,
      "--soda-fg": fg,
      "--soda-menu-bg": menuBg,
      "--soda-menu-fg": fg,
      "--soda-menu-border": p.surface0,
      "--soda-menu-active-bg": active,
      "--soda-menu-hover-bg": hover,
      "--soda-accent": accent,
      "--soda-accent-fg": accentFg,
      "--soda-error-fg": ensureContrast(p.red, [bg, menuBg, terminalBg], 4.5, away),
      "--soda-warn-fg": ensureContrast(p.peach, [menuBg, hover, active], 4.5, away),
      "--soda-state-blocked": ensureContrast(p.red, rows, 3, away),
      "--soda-state-working": ensureContrast(p.yellow, rows, 3, away),
      "--soda-state-done": ensureContrast(p.green, rows, 3, away),
      "--soda-state-idle": ensureContrast(p.overlay1, rows, 3, away),
      "--soda-subtle-bg": subtle,
      // ダイアログの後ろの幕は黒——明るいテーマでもダイアログを浮かせる（research「実装時の注意」）。全テーマ同じ値。
      "--soda-backdrop": "rgba(0, 0, 0, 0.4)",
      // 再接続の表示の幕は、その上に文字（--soda-fg）を直に描く。明るいテーマの文字は暗いので、黒い幕では端末の背景の上で 4.5 に届かない
      // （3.2〜3.5）——明るいテーマは白い幕にする（decisions D9）。
      "--soda-backdrop-strong": dark ? "rgba(0, 0, 0, 0.5)" : "rgba(255, 255, 255, 0.6)",
      // 選ばれている pane の枠は、周りの背景（bg）と端末の背景に対して 3:1（どの pane に入力が行くかを示す状態の印。WCAG 1.4.11。decisions D15）。
      "--soda-pane-current": ensureContrast(p.surface0, [bg, terminalBg], 3, away),
      // 境目の強調の線。accent が背景に 3:1 を割るテーマ（dracula・tokyo-night-day・solarized-light・rose-pine-dawn）は fg にする。
      "--soda-resize-line": resizeLineColor(bg, menuBg, accent, fg),
    },
    colorScheme: dark ? "dark" : "light",
  };
}

const cache = new Map<ThemeName, UiTokens>();

/** そのテーマの画面の枠の色。 */
export function uiTokens(name: ThemeName): UiTokens {
  if (name === "dracula") return DRACULA;
  let t = cache.get(name);
  if (!t) {
    t = build(name);
    cache.set(name, t);
  }
  return t;
}
