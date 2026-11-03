import { describe, expect, it } from "vitest";
import { contrastRatio } from "./color.js";
import {
  DEFAULT_THEME,
  DEFAULT_THEME_NAME,
  finalizePalette,
  isThemeName,
  TERMINAL_PALETTES,
  THEME_APPEARANCE,
  THEME_NAMES,
  type TerminalPalette,
} from "./theme.js";

const HEX = /^#[0-9a-f]{6}$/;

describe("THEME_NAMES", () => {
  it("herdr の 18 種（`src/config/theme.rs:4-23`）の順から terminal を除いた17種と製品独自の2種", () => {
    expect(THEME_NAMES).toEqual([
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
    ]);
  });

  it("isThemeName は 19 種だけを通す", () => {
    for (const n of THEME_NAMES) expect(isThemeName(n)).toBe(true);
    expect(isThemeName("terminal")).toBe(false);
    expect(isThemeName("Dracula")).toBe(false);
    expect(isThemeName(undefined)).toBe(false);
    expect(isThemeName(1)).toBe(false);
  });

  it("既定は dracula", () => {
    expect(DEFAULT_THEME_NAME).toBe("dracula");
  });
});

describe("THEME_APPEARANCE", () => {
  it("明るい8種・暗い11種", () => {
    const light = THEME_NAMES.filter((n) => THEME_APPEARANCE[n] === "light");
    expect(light).toEqual([
      "catppuccin-latte",
      "tokyo-night-day",
      "gruvbox-light",
      "one-light",
      "solarized-light",
      "kanagawa-lotus",
      "rose-pine-dawn",
      "sodashitsu-assistant",
    ]);
    expect(THEME_NAMES.length - light.length).toBe(11);
  });

  it("端末の背景の明るさと合う（herdr の `inferred_appearance`：299R+587G+114B >= 128000 なら明るい。research F2）", () => {
    for (const n of THEME_NAMES) {
      const bg = TERMINAL_PALETTES[n].background;
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16)) as [
        number,
        number,
        number,
      ];
      expect(r * 299 + g * 587 + b * 114 >= 128_000 ? "light" : "dark", n).toBe(
        THEME_APPEARANCE[n],
      );
    }
  });
});

describe("TERMINAL_PALETTES", () => {
  it("19 種すべてに、#rrggbb の文字・背景・カーソルと 16 色がある", () => {
    for (const n of THEME_NAMES) {
      const p = TERMINAL_PALETTES[n];
      expect(
        [p.foreground, p.background, p.cursor].every((c) => HEX.test(c)),
        n,
      ).toBe(true);
      expect(p.ansi, n).toHaveLength(16);
      expect(
        p.ansi.every((c) => HEX.test(c)),
        n,
      ).toBe(true);
      if (p.selectionBackground !== undefined) expect(p.selectionBackground, n).toMatch(HEX);
      if (p.selectionForeground !== undefined) expect(p.selectionForeground, n).toMatch(HEX);
    }
  });

  it("dracula は今の既定の配色そのもの（DEFAULT_THEME。選択の色を持たない）", () => {
    expect(TERMINAL_PALETTES.dracula).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toEqual({
      foreground: "#f8f8f2",
      background: "#282a36",
      cursor: "#f8f8f2",
      ansi: [
        "#21222c",
        "#ff5555",
        "#50fa7b",
        "#f1fa8c",
        "#bd93f9",
        "#ff79c6",
        "#8be9fd",
        "#f8f8f2",
        "#6272a4",
        "#ff6e6e",
        "#69ff94",
        "#ffffa5",
        "#d6acff",
        "#ff92df",
        "#a4ffff",
        "#ffffff",
      ],
    });
  });

  it("上流の値を写している（抜き取り：配色集 0b55a9e の Catppuccin Mocha・Solarized Light・Vesper）", () => {
    expect(TERMINAL_PALETTES.catppuccin.background).toBe("#1e1e2e");
    expect(TERMINAL_PALETTES.catppuccin.ansi[1]).toBe("#f38ba8");
    expect(TERMINAL_PALETTES["solarized-light"].foreground).toBe("#657b83");
    expect(TERMINAL_PALETTES["solarized-light"].ansi[4]).toBe("#268bd2");
    expect(TERMINAL_PALETTES.vesper.background).toBe("#101010");
    expect(TERMINAL_PALETTES.vesper.ansi[15]).toBe("#ffffff");
  });

  it("規則 (a)：既存の上流テーマで選んだ文字を背景色にするのは、ちょうど5つ（design D2・decisions D5）", () => {
    const inverted = THEME_NAMES.filter(
      (n) => !n.startsWith("sodashitsu-assistant") && TERMINAL_PALETTES[n].selectionForeground !== undefined,
    );
    expect(inverted).toEqual(["catppuccin", "nord", "gruvbox-light", "kanagawa", "kanagawa-lotus"]);
    for (const n of inverted) {
      const p = TERMINAL_PALETTES[n];
      expect(p.selectionForeground).toBe(p.background);
      expect(
        contrastRatio(p.selectionForeground!, p.selectionBackground!),
        n,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("規則 (c)：dracula 以外は、ブロックカーソルの下の文字が背景色で、カーソルとの比が 3 以上（decisions D10）", () => {
    for (const n of THEME_NAMES.filter((x) => x !== "dracula")) {
      const p = TERMINAL_PALETTES[n];
      expect(p.cursorAccent, n).toBe(p.background);
      expect(contrastRatio(p.cursorAccent!, p.cursor), n).toBeGreaterThanOrEqual(3);
    }
    expect(TERMINAL_PALETTES.dracula).not.toHaveProperty("cursorAccent"); // 今の xterm.js の既定のまま
  });

  it("規則 (b)：カーソルを文字の色にするのは catppuccin-latte と one-light の 2 つ。どのテーマでもカーソルと背景の比は 3 以上", () => {
    expect(TERMINAL_PALETTES["catppuccin-latte"].cursor).toBe(
      TERMINAL_PALETTES["catppuccin-latte"].foreground,
    );
    expect(TERMINAL_PALETTES["one-light"].cursor).toBe(TERMINAL_PALETTES["one-light"].foreground);
    // 比が足りているテーマは上流のカーソルのまま（文字の色と違うものを抜き取り）。
    expect(TERMINAL_PALETTES.catppuccin.cursor).toBe("#f5e0dc");
    expect(TERMINAL_PALETTES.nord.cursor).toBe("#eceff4");
    expect(TERMINAL_PALETTES["kanagawa-lotus"].cursor).toBe("#43436c");
    expect(TERMINAL_PALETTES.vesper.cursor).toBe("#acb1ab");
    for (const n of THEME_NAMES) {
      const p = TERMINAL_PALETTES[n];
      expect(contrastRatio(p.cursor, p.background), n).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("finalizePalette", () => {
  const base: TerminalPalette = {
    foreground: "#dcd7ba",
    background: "#1f1f28",
    cursor: "#dcd7ba",
    ansi: DEFAULT_THEME.ansi,
  };

  it("文字と選択の比が 3 未満で背景のほうが見分けやすければ、選んだ文字を背景色にする", () => {
    expect(finalizePalette({ ...base, selectionBackground: "#dcd7ba" }).selectionForeground).toBe(
      "#1f1f28",
    );
  });

  it("文字と選択の比が 3 未満でも、背景のほうがもっと悪ければ当てない（tokyo-night-day の形）", () => {
    // 文字 #3760bf・背景 #e1e2e7・選択 #99a7df：文字と選択 2.49、背景と選択 1.81。
    const p = finalizePalette({
      ...base,
      foreground: "#3760bf",
      background: "#e1e2e7",
      cursor: "#3760bf",
      selectionBackground: "#99a7df",
    });
    expect(contrastRatio("#3760bf", "#99a7df")).toBeLessThan(3);
    expect(p.selectionForeground).toBeUndefined();
  });

  it("選択の色が無ければ選んだ文字の色も足さない。既にあれば触らない", () => {
    expect(finalizePalette(base).selectionForeground).toBeUndefined();
    expect(
      finalizePalette({ ...base, selectionBackground: "#dcd7ba", selectionForeground: "#ff0000" })
        .selectionForeground,
    ).toBe("#ff0000");
  });

  it("カーソルが背景に溶けるなら文字の色にし、見えるならそのまま", () => {
    expect(
      finalizePalette({ ...base, background: "#f9f9f9", foreground: "#2a2c33", cursor: "#bbbbbb" })
        .cursor,
    ).toBe("#2a2c33");
    // 文字の色（#dcd7ba）と違い、背景と 3 以上あるカーソルはそのまま。
    expect(finalizePalette({ ...base, cursor: "#f5e0dc" }).cursor).toBe("#f5e0dc");
  });

  it("元の配色を書き換えない", () => {
    const src = { ...base, selectionBackground: "#dcd7ba" };
    finalizePalette(src);
    expect(src).not.toHaveProperty("selectionForeground");
  });
});
