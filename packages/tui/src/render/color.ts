import { TERMINAL_PALETTES, type ThemeName } from "@sodashitsu/protocol";
import { uiTokens, type CssVar } from "@sodashitsu/client-core";

/**
 * 色（20260927-cli-mode の design「render/color.ts」）。セルの色は 1 つの数に詰める（格子を平たい配列で持つため。research §1.4）:
 * `0` = 外側の端末の既定色、`PALETTE | n` = 256 色の n 番、`RGB | 0xRRGGBB` = truecolor。
 * architecture の `Color`（`default`・`palette`・`rgb`）と同じ 3 種を、この形で表す。
 */
export type PackedColor = number;
export const DEFAULT_COLOR: PackedColor = 0;
const PALETTE = 0x1000000;
const RGB = 0x2000000;

export const paletteColor = (index: number): PackedColor => PALETTE | (index & 0xff);
export const rgbColor = (r: number, g: number, b: number): PackedColor =>
  RGB | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);

/** `#rrggbb`（`#rgb`）→ 色。読めなければ既定色。 */
export function hexColor(hex: string): PackedColor {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return DEFAULT_COLOR;
  let h = m[1]!;
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return RGB | parseInt(h, 16);
}

export type ColorMode = "truecolor" | "256";

/** `COLORTERM=truecolor|24bit` なら RGB で、無ければ 256 色へ寄せる（design「render/color.ts」）。 */
export function colorModeOf(env: Readonly<Record<string, string | undefined>>): ColorMode {
  const ct = (env["COLORTERM"] ?? "").toLowerCase();
  return ct === "truecolor" || ct === "24bit" ? "truecolor" : "256";
}

const CUBE = [0, 95, 135, 175, 215, 255];

/** RGB → 256 色の番号（6×6×6 の立方体と 24 段の灰色のうち近いほう）。 */
export function rgbTo256(r: number, g: number, b: number): number {
  const near = (v: number): number =>
    v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.floor((v - 35) / 40));
  const ri = near(r);
  const gi = near(g);
  const bi = near(b);
  const cube = 16 + 36 * ri + 6 * gi + bi;
  const cr = CUBE[ri]!;
  const cg = CUBE[gi]!;
  const cb = CUBE[bi]!;
  const avg = Math.round((r + g + b) / 3);
  const grayIndex = avg > 238 ? 23 : Math.max(0, Math.round((avg - 8) / 10));
  const gv = 8 + grayIndex * 10;
  const dist = (x: number, y: number, z: number): number =>
    (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2;
  return dist(gv, gv, gv) < dist(cr, cg, cb) ? 232 + grayIndex : cube;
}

/** SGR の色の部分（`38;2;r;g;b`・`48;5;n`・`39`）。 */
export function sgrColorParam(c: PackedColor, background: boolean, mode: ColorMode): string {
  if (c === DEFAULT_COLOR) return background ? "49" : "39";
  if ((c & RGB) !== 0) {
    const r = (c >> 16) & 0xff;
    const g = (c >> 8) & 0xff;
    const b = c & 0xff;
    if (mode === "truecolor") return `${background ? 48 : 38};2;${r};${g};${b}`;
    return `${background ? 48 : 38};5;${rgbTo256(r, g, b)}`;
  }
  return `${background ? 48 : 38};5;${c & 0xff}`;
}

/** 属性のビット（`Grid.attrs`）。 */
export const ATTR = {
  bold: 1,
  dim: 2,
  italic: 4,
  underline: 8,
  blink: 16,
  inverse: 32,
  invisible: 64,
  strikethrough: 128,
  overline: 256,
} as const;

const ATTR_SGR: readonly [number, string][] = [
  [ATTR.bold, "1"],
  [ATTR.dim, "2"],
  [ATTR.italic, "3"],
  [ATTR.underline, "4"],
  [ATTR.blink, "5"],
  [ATTR.inverse, "7"],
  [ATTR.invisible, "8"],
  [ATTR.strikethrough, "9"],
  [ATTR.overline, "53"],
];

/** セルの見た目の SGR 全体（毎回 0 から組み立てる。前の状態に依らないので差分描画の途中から始めても正しい）。 */
export function sgrOf(fg: PackedColor, bg: PackedColor, attrs: number, mode: ColorMode): string {
  let s = "\x1b[0";
  for (const [bit, code] of ATTR_SGR) if (attrs & bit) s += `;${code}`;
  if (fg !== DEFAULT_COLOR) s += `;${sgrColorParam(fg, false, mode)}`;
  if (bg !== DEFAULT_COLOR) s += `;${sgrColorParam(bg, true, mode)}`;
  return `${s}m`;
}

/**
 * テーマの配色（pane の既定色・ANSI 16 色と、画面の枠の色）。**テーマが pane の配色も決める**（web と同じ）：pane の既定色と 0〜15 番は
 * テーマの RGB に置き換え、16〜255 番と RGB はそのまま。
 */
export class ThemeColors {
  readonly paneFg: PackedColor;
  readonly paneBg: PackedColor;
  readonly cursor: PackedColor;
  readonly ansi: readonly PackedColor[];
  private readonly vars: Readonly<Record<CssVar, string>>;

  constructor(readonly name: ThemeName) {
    const pal = TERMINAL_PALETTES[name];
    this.paneFg = hexColor(pal.foreground);
    this.paneBg = hexColor(pal.background);
    this.cursor = hexColor(pal.cursor);
    this.ansi = pal.ansi.map(hexColor);
    this.vars = uiTokens(name).vars;
  }

  /** 画面の枠の色（`--soda-*`）。`rgba(...)` 等の読めない値は既定色。 */
  ui(v: CssVar): PackedColor {
    return hexColor(this.vars[v]);
  }

  /** pane のセルの前景（`kind`: 0 既定・1 パレット・2 RGB）。 */
  paneColor(kind: 0 | 1 | 2, value: number, background: boolean): PackedColor {
    if (kind === 0) return background ? this.paneBg : this.paneFg;
    if (kind === 1) return value < 16 ? this.ansi[value]! : paletteColor(value);
    return RGB | (value & 0xffffff);
  }
}
