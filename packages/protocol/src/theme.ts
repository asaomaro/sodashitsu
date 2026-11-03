import { contrastRatio } from "./color.js";

/**
 * テーマ（20260921-theme-settings。herdr のテーマ）。**名前ごとの端末の配色**をここに置く——web の xterm.js と、サーバの Mirror
 * （色の問い合わせ OSC 4/10/11/12 への応答。ブラウザ側の応答は握りつぶしている）が同じ値を使う（design D1）。画面の枠の色
 * （CSS 変数）は web の `theme/uiTokens.ts` が持つ。
 */

/** herdr の `THEME_NAMES`（`src/config/theme.rs:4-23`）の順から `terminal` を除いた 17 種と製品独自の2種（ブラウザにはホストの端末が無い）。 */
export const THEME_NAMES = [
  "catppuccin",
  "catppuccin-latte",
  "tokyo-night",
  "tokyo-night-day",
  "dracula",
  "nord",
  "gruvbox",
  "gruvbox-light",
  "one-dark",
  "one-light",
  "solarized",
  "solarized-light",
  "kanagawa",
  "kanagawa-lotus",
  "rose-pine",
  "rose-pine-dawn",
  "vesper",
  "sodashitsu-assistant",
  "sodashitsu-assistant-dark",
] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export function isThemeName(v: unknown): v is ThemeName {
  return typeof v === "string" && (THEME_NAMES as readonly string[]).includes(v);
}

/** 既定は dracula——今の見た目のまま（herdr の既定 catppuccin とは違う。requirements の非機能要件）。 */
export const DEFAULT_THEME_NAME: ThemeName = "dracula";

/** 明暗（明るい 8 種・暗い 11 種。requirements のスコープ）。 */
export const THEME_APPEARANCE: Readonly<Record<ThemeName, "light" | "dark">> = {
  catppuccin: "dark",
  "catppuccin-latte": "light",
  "tokyo-night": "dark",
  "tokyo-night-day": "light",
  dracula: "dark",
  nord: "dark",
  gruvbox: "dark",
  "gruvbox-light": "light",
  "one-dark": "dark",
  "one-light": "light",
  solarized: "dark",
  "solarized-light": "light",
  kanagawa: "dark",
  "kanagawa-lotus": "light",
  "rose-pine": "dark",
  "rose-pine-dawn": "light",
  vesper: "dark",
  "sodashitsu-assistant": "light",
  "sodashitsu-assistant-dark": "dark",
};

/** 端末の配色。サーバの Mirror は foreground・background・cursor・ansi で答え、web の xterm.js は全部を使う。 */
export interface TerminalPalette {
  foreground: string;
  background: string;
  cursor: string;
  /** ブロックカーソルの下の文字の色。無ければ xterm.js の既定（`#000000`）。 */
  cursorAccent?: string;
  /** 選択の背景。無ければ xterm.js の既定（`rgba(255, 255, 255, 0.3)`）。 */
  selectionBackground?: string;
  /** 選択した文字の色。無ければ文字の色のまま（xterm.js の既定）。 */
  selectionForeground?: string;
  /** OSC 4 のインデックスカラー（0〜15）。 */
  ansi: [
    string, string, string, string, string, string, string, string,
    string, string, string, string, string, string, string, string,
  ];
}

/**
 * Dracula——**今の既定の配色そのもの**（配色集の `Dracula.json` と 16 色・背景・文字・カーソルが一致する。research F9）。
 * 選択の色は持たない（今の xterm.js の既定の選択の色を保つ。design D2）。名前は以前から使っているので残す。
 */
export const DEFAULT_THEME: TerminalPalette = {
  foreground: "#f8f8f2",
  background: "#282a36",
  cursor: "#f8f8f2",
  ansi: [
    "#21222c", "#ff5555", "#50fa7b", "#f1fa8c",
    "#bd93f9", "#ff79c6", "#8be9fd", "#f8f8f2",
    "#6272a4", "#ff6e6e", "#69ff94", "#ffffa5",
    "#d6acff", "#ff92df", "#a4ffff", "#ffffff",
  ],
};

/**
 * 既存の16テーマは上流の配色、sodashitsu-assistantの2種は製品独自の配色。既存テーマの出典は `mbadolato/iTerm2-Color-Schemes` の
 * `0b55a9e609daa0727be7d0d4705616dbe8d08fed` の `windowsterminal/<名前>.json`（各行の注記。research F8）。16 色の順は
 * black・red・green・yellow・blue・purple・cyan・white とその bright。手で写さず、ファイルから書き出した値を貼った。
 */
const TERMINAL_BASE: Readonly<Record<Exclude<ThemeName, "dracula">, TerminalPalette>> = {
  // Product palettes: cream/navy and the desktop assistant's navy/gold.
  "sodashitsu-assistant": {
    foreground: "#172438", background: "#fbf8f0", cursor: "#86620f",
    selectionBackground: "#e5be61", selectionForeground: "#172438",
    ansi: ["#172438", "#a32f38", "#236f43", "#86620f", "#245d99", "#78509b", "#116e78", "#d9d1bd",
      "#52657a", "#bd3c46", "#287b4d", "#916b12", "#286cb0", "#8958ae", "#137c88", "#fffdf8"],
  },
  "sodashitsu-assistant-dark": {
    foreground: "#edf3fa", background: "#172438", cursor: "#e5be61",
    selectionBackground: "#c9a64f", selectionForeground: "#142136",
    ansi: ["#101927", "#ff9b9b", "#8ed7a6", "#e5be61", "#90bfff", "#c9b5ff", "#7ce1df", "#edf3fa",
      "#869bb4", "#ffb8b8", "#a9edbf", "#f3d98e", "#b3d4ff", "#ded0ff", "#a4f2ed", "#ffffff"],
  },
  // windowsterminal/Catppuccin Mocha.json
  "catppuccin": {
    foreground: "#cdd6f4",
    background: "#1e1e2e",
    cursor: "#f5e0dc",
    selectionBackground: "#f5e0dc",
    ansi: [
      "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af",
      "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
      "#585b70", "#f7aec2", "#c2ecbf", "#fcd682",
      "#aeccfc", "#f398da", "#b1eae1", "#a6adc8",
    ],
  },
  // windowsterminal/Catppuccin Latte.json
  "catppuccin-latte": {
    foreground: "#4c4f69",
    background: "#eff1f5",
    cursor: "#dc8a78",
    selectionBackground: "#dc8a78",
    ansi: [
      "#bcc0cc", "#d20f39", "#40a02b", "#df8e1d",
      "#1e66f5", "#ea76cb", "#179299", "#5c5f77",
      "#acb0be", "#e7103f", "#46b02f", "#e49931",
      "#3878f6", "#ef95d7", "#19a1a8", "#6c6f85",
    ],
  },
  // windowsterminal/TokyoNight.json
  "tokyo-night": {
    foreground: "#c0caf5",
    background: "#1a1b26",
    cursor: "#c0caf5",
    selectionBackground: "#33467c",
    ansi: [
      "#15161e", "#f7768e", "#9ece6a", "#e0af68",
      "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
      "#414868", "#f7768e", "#9ece6a", "#e0af68",
      "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
    ],
  },
  // windowsterminal/TokyoNight Day.json
  "tokyo-night-day": {
    foreground: "#3760bf",
    background: "#e1e2e7",
    cursor: "#3760bf",
    selectionBackground: "#99a7df",
    ansi: [
      "#e9e9ed", "#f52a65", "#587539", "#8c6c3e",
      "#2e7de9", "#9854f1", "#007197", "#6172b0",
      "#a1a6c5", "#f52a65", "#587539", "#8c6c3e",
      "#2e7de9", "#9854f1", "#007197", "#3760bf",
    ],
  },
  // windowsterminal/Nord.json
  "nord": {
    foreground: "#d8dee9",
    background: "#2e3440",
    cursor: "#eceff4",
    selectionBackground: "#eceff4",
    ansi: [
      "#3b4252", "#bf616a", "#a3be8c", "#ebcb8b",
      "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
      "#596377", "#bf616a", "#a3be8c", "#ebcb8b",
      "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4",
    ],
  },
  // windowsterminal/Gruvbox Dark.json
  "gruvbox": {
    foreground: "#ebdbb2",
    background: "#282828",
    cursor: "#ebdbb2",
    selectionBackground: "#665c54",
    ansi: [
      "#282828", "#cc241d", "#98971a", "#d79921",
      "#458588", "#b16286", "#689d6a", "#a89984",
      "#928374", "#fb4934", "#b8bb26", "#fabd2f",
      "#83a598", "#d3869b", "#8ec07c", "#ebdbb2",
    ],
  },
  // windowsterminal/Gruvbox Light.json
  "gruvbox-light": {
    foreground: "#3c3836",
    background: "#fbf1c7",
    cursor: "#3c3836",
    selectionBackground: "#3c3836",
    ansi: [
      "#fbf1c7", "#cc241d", "#98971a", "#d79921",
      "#458588", "#b16286", "#689d6a", "#7c6f64",
      "#928374", "#9d0006", "#79740e", "#b57614",
      "#076678", "#8f3f71", "#427b58", "#3c3836",
    ],
  },
  // windowsterminal/Atom One Dark.json
  "one-dark": {
    foreground: "#abb2bf",
    background: "#21252b",
    cursor: "#abb2bf",
    selectionBackground: "#323844",
    ansi: [
      "#21252b", "#e06c75", "#98c379", "#e5c07b",
      "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
      "#767676", "#e06c75", "#98c379", "#e5c07b",
      "#61afef", "#c678dd", "#56b6c2", "#abb2bf",
    ],
  },
  // windowsterminal/Atom One Light.json
  "one-light": {
    foreground: "#2a2c33",
    background: "#f9f9f9",
    cursor: "#bbbbbb",
    selectionBackground: "#ededed",
    ansi: [
      "#000000", "#de3e35", "#3f953a", "#d2b67c",
      "#2f5af3", "#950095", "#3f953a", "#bbbbbb",
      "#000000", "#de3e35", "#3f953a", "#d2b67c",
      "#2f5af3", "#a00095", "#3f953a", "#ffffff",
    ],
  },
  // windowsterminal/iTerm2 Solarized Dark.json
  "solarized": {
    foreground: "#839496",
    background: "#002b36",
    cursor: "#839496",
    selectionBackground: "#073642",
    ansi: [
      "#073642", "#dc322f", "#859900", "#b58900",
      "#268bd2", "#d33682", "#2aa198", "#eee8d5",
      "#335e69", "#cb4b16", "#586e75", "#657b83",
      "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
    ],
  },
  // windowsterminal/iTerm2 Solarized Light.json
  "solarized-light": {
    foreground: "#657b83",
    background: "#fdf6e3",
    cursor: "#657b83",
    selectionBackground: "#eee8d5",
    ansi: [
      "#073642", "#dc322f", "#859900", "#b58900",
      "#268bd2", "#d33682", "#2aa198", "#bbb5a2",
      "#002b36", "#cb4b16", "#586e75", "#657b83",
      "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
    ],
  },
  // windowsterminal/Kanagawa Wave.json
  "kanagawa": {
    foreground: "#dcd7ba",
    background: "#1f1f28",
    cursor: "#dcd7ba",
    selectionBackground: "#dcd7ba",
    ansi: [
      "#090618", "#c34043", "#76946a", "#c0a36e",
      "#7e9cd8", "#957fb8", "#6a9589", "#c8c093",
      "#727169", "#e82424", "#98bb6c", "#e6c384",
      "#7fb4ca", "#938aa9", "#7aa89f", "#dcd7ba",
    ],
  },
  // windowsterminal/Kanagawa Lotus.json
  "kanagawa-lotus": {
    foreground: "#545464",
    background: "#f2ecbc",
    cursor: "#43436c",
    selectionBackground: "#545464",
    ansi: [
      "#1f1f28", "#c84053", "#6f894e", "#77713f",
      "#4d699b", "#b35b79", "#597b75", "#545464",
      "#8a8980", "#d7474b", "#6e915f", "#836f4a",
      "#6693bf", "#624c83", "#5e857a", "#43436c",
    ],
  },
  // windowsterminal/Rose Pine.json
  "rose-pine": {
    foreground: "#e0def4",
    background: "#191724",
    cursor: "#e0def4",
    selectionBackground: "#403d52",
    ansi: [
      "#26233a", "#eb6f92", "#31748f", "#f6c177",
      "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
      "#6e6a86", "#eb6f92", "#31748f", "#f6c177",
      "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
    ],
  },
  // windowsterminal/Rose Pine Dawn.json
  "rose-pine-dawn": {
    foreground: "#575279",
    background: "#faf4ed",
    cursor: "#575279",
    selectionBackground: "#dfdad9",
    ansi: [
      "#f2e9e1", "#b4637a", "#286983", "#ea9d34",
      "#56949f", "#907aa9", "#d7827e", "#575279",
      "#9893a5", "#b4637a", "#286983", "#ea9d34",
      "#56949f", "#907aa9", "#d7827e", "#575279",
    ],
  },
  // windowsterminal/Vesper.json
  "vesper": {
    foreground: "#ffffff",
    background: "#101010",
    cursor: "#acb1ab",
    selectionBackground: "#988049",
    ansi: [
      "#101010", "#f5a191", "#90b99f", "#e6b99d",
      "#aca1cf", "#e29eca", "#ea83a5", "#a0a0a0",
      "#7e7e7e", "#ff8080", "#99ffe4", "#ffc799",
      "#b9aeda", "#ecaad6", "#f591b2", "#ffffff",
    ],
  },
};

/**
 * 上流の値に 3 つの規則を当てる（design D2・decisions D5・D10）：
 * (a) 文字と選択の背景の比が 3 未満で、背景色と選択の背景の比のほうが大きいなら、選択した文字を背景色にする——配色集の元の端末は
 *     選択した文字を反転させる前提の値を持つ（research F10）。xterm.js はそのままだと選んだ文字が背景に溶ける。
 * (b) カーソルと背景の比が 3 未満なら、カーソルを文字の色にする（research F11）。
 * (c) ブロックカーソルの下の文字を背景色にする——xterm.js の既定は固定の #000000 で、明るいテーマ（暗いカーソル）では読めない。
 */
export function finalizePalette(p: TerminalPalette): TerminalPalette {
  const out: TerminalPalette = { ...p };
  if (p.selectionBackground !== undefined && p.selectionForeground === undefined) {
    const fgSel = contrastRatio(p.foreground, p.selectionBackground);
    const bgSel = contrastRatio(p.background, p.selectionBackground);
    if (fgSel < 3 && bgSel > fgSel) out.selectionForeground = p.background;
  }
  if (contrastRatio(p.cursor, p.background) < 3) out.cursor = p.foreground;
  if (p.cursorAccent === undefined) out.cursorAccent = p.background;
  return out;
}

/** 名前ごとの端末の配色（web の表示とサーバの答えの両方がここを引く）。dracula は `DEFAULT_THEME`、ほかは基礎配色＋規則。 */
export const TERMINAL_PALETTES: Readonly<Record<ThemeName, TerminalPalette>> = Object.fromEntries(
  THEME_NAMES.map((name) => [name, name === "dracula" ? DEFAULT_THEME : finalizePalette(TERMINAL_BASE[name])]),
) as Record<ThemeName, TerminalPalette>;

export const BUTTON_THEME_MODES = ["none", "actions", "features"] as const;
export type ButtonThemeMode = (typeof BUTTON_THEME_MODES)[number];
