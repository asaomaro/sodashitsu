import { DEFAULT_THEME, type TerminalPalette } from "@sodashitsu/protocol";
import type { ITheme } from "@xterm/xterm";

const ANSI_NAMES = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

/**
 * 端末の配色（`@sodashitsu/protocol` の `TERMINAL_PALETTES` の 1 つ。サーバの色の問い合わせの答えと同じ値）を xterm.js の `ITheme` に変換する。
 * 選択の色は配色が持つときだけ渡す（dracula は持たない＝xterm.js の既定のまま。20260921-theme-settings の design D2）。
 */
export function toXtermTheme(palette: TerminalPalette = DEFAULT_THEME): ITheme {
  const theme: ITheme = {
    foreground: palette.foreground,
    background: palette.background,
    cursor: palette.cursor,
    ...(palette.cursorAccent !== undefined ? { cursorAccent: palette.cursorAccent } : {}),
    ...(palette.selectionBackground !== undefined
      ? { selectionBackground: palette.selectionBackground }
      : {}),
    ...(palette.selectionForeground !== undefined
      ? { selectionForeground: palette.selectionForeground }
      : {}),
  };
  ANSI_NAMES.forEach((name, i) => {
    (theme as Record<string, string>)[name] = palette.ansi[i]!;
  });
  return theme;
}
