import { DEFAULT_THEME, TERMINAL_PALETTES } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { toXtermTheme } from "./theme.js";

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

describe("toXtermTheme（20260921-theme-settings）", () => {
  it("既定は dracula（今までと同じ）で、選択の色・カーソルの下の文字の色を渡さない（xterm.js の既定のまま）", () => {
    const t = toXtermTheme();
    expect(t).toMatchObject({
      foreground: "#f8f8f2",
      background: "#282a36",
      cursor: "#f8f8f2",
      black: "#21222c",
      brightWhite: "#ffffff",
    });
    expect(t).not.toHaveProperty("selectionBackground");
    expect(t).not.toHaveProperty("selectionForeground");
    expect(t).not.toHaveProperty("cursorAccent");
    expect(toXtermTheme(DEFAULT_THEME)).toEqual(t);
  });

  it("配色の 16 色を xterm.js の名前へ順に当て、選択の色・カーソルの下の文字の色は持っていれば渡す", () => {
    const p = TERMINAL_PALETTES.kanagawa;
    const t = toXtermTheme(p) as Record<string, string>;
    ANSI_NAMES.forEach((name, i) => expect(t[name], name).toBe(p.ansi[i]));
    expect(t).toMatchObject({
      background: p.background,
      cursorAccent: p.background, // 規則 (c)（decisions D10）
      selectionBackground: p.selectionBackground,
      selectionForeground: p.background, // 規則 (a) で反転（decisions D5）
    });
  });
});
