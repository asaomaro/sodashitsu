import { TERMINAL_PALETTES, type ThemeName } from "@sodashitsu/protocol";
import {
  mergeVars,
  uiTokens,
  type CssVar,
  type ThemeOverrideLayer,
  type ThemeOverrides,
} from "@sodashitsu/client-core";
import { parseCssColor } from "./cssColor.js";

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

/** 色の出し方の設定（手元の `tui-state.json` の `colorMode`）。`auto` は外側の端末から判定する。 */
export type ColorModePref = "auto" | "truecolor" | "256";

/** truecolor を扱うと分かっている端末（`TERM_PROGRAM`）。SSH 越しでは届かないことが多いので、設定・`SODA_TRUECOLOR` でも指定できる。 */
const TRUECOLOR_PROGRAMS: ReadonlySet<string> = new Set([
  "iTerm.app",
  "WezTerm",
  "vscode",
  "ghostty",
]);

/**
 * RGB で出すか 256 色へ寄せるか（design「render/color.ts」。03 の review で判定を広げた）。**環境変数 `SODA_TRUECOLOR`（`1` で truecolor・`0` で 256 色）が最優先**、
 * 次に手元の設定（`tui-state.json` の `colorMode`。端末ごと）、`auto` なら `COLORTERM=truecolor|24bit` → Windows Terminal（`WT_SESSION`）→
 * `TERM` が `-direct` で終わる → `TERM_PROGRAM` が truecolor の端末 → kitty（`KITTY_WINDOW_ID`）。どれでもなければ 256 色。
 */
export function colorModeOf(
  env: Readonly<Record<string, string | undefined>>,
  pref: ColorModePref = "auto",
): ColorMode {
  const forced = env["SODA_TRUECOLOR"];
  if (forced === "1") return "truecolor";
  if (forced === "0") return "256";
  if (pref !== "auto") return pref;
  const ct = (env["COLORTERM"] ?? "").toLowerCase();
  if (ct === "truecolor" || ct === "24bit") return "truecolor";
  if (env["WT_SESSION"]) return "truecolor";
  if ((env["TERM"] ?? "").endsWith("-direct")) return "truecolor";
  if (TRUECOLOR_PROGRAMS.has(env["TERM_PROGRAM"] ?? "")) return "truecolor";
  if (env["KITTY_WINDOW_ID"]) return "truecolor";
  return "256";
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

  private readonly cache = new Map<CssVar, PackedColor>();

  /**
   * `overrides` は共有の設定の色の上書き（`themeOverrides`。web の `ThemeController` と同じく、テーマの明暗の層だけを重ねる）。
   * 端末版で読めない色（`parseCssColor` が読めないもの）はテーマの色のまま。
   */
  constructor(
    readonly name: ThemeName,
    overrides?: ThemeOverrides,
    /**
     * 背景を透かす（端末版の設定「背景を透過する」）。pane の既定の背景と、画面の地（`ground`）を既定の背景（SGR 49）で送る。
     * それ以外（プログラムが指定した背景・選択・強調・メニュー・ダイアログ）は塗ったまま。
     */
    readonly transparent = false,
  ) {
    const pal = TERMINAL_PALETTES[name];
    this.paneFg = hexColor(pal.foreground);
    this.paneBg = hexColor(pal.background);
    this.cursor = hexColor(pal.cursor);
    this.ansi = pal.ansi.map(hexColor);
    const base = uiTokens(name);
    const layer = overrides
      ? base.colorScheme === "light"
        ? overrides.light
        : overrides.dark
      : {};
    const usable: ThemeOverrideLayer = {};
    for (const [k, v] of Object.entries(layer) as [CssVar, string][])
      if (parseCssColor(v)) usable[k] = v;
    this.vars = mergeVars(base.vars, usable);
    this.key = `${name}:${JSON.stringify(usable)}${transparent ? ":transparent" : ""}`;
  }

  /** テーマと効いている上書きを表す鍵（同じなら描き直しの必要が無い）。 */
  readonly key: string;

  /** 画面の枠の色（`--soda-*`）。読めない値は既定色（透明度は捨てる）。 */
  ui(v: CssVar): PackedColor {
    let c = this.cache.get(v);
    if (c === undefined) {
      const rgb = parseCssColor(this.vars[v]);
      c = rgb ? rgbColor(rgb.r, rgb.g, rgb.b) : DEFAULT_COLOR;
      this.cache.set(v, c);
    }
    return c;
  }

  /**
   * 画面の地の色（`--soda-bg`＝空いた場所・tab バー・pane の枠の地、`--soda-menu-bg`＝サイドバーと狭い幅の上辺の地）。透かすときは既定の背景。
   * メニュー・ダイアログ・トーストの地は重なる部品なので、ここではなく `ui` を使う。
   */
  ground(v: "--soda-bg" | "--soda-menu-bg"): PackedColor {
    return this.transparent ? DEFAULT_COLOR : this.ui(v);
  }

  /** pane の既定の背景（セルが背景を指定していないところ。透かすときは既定の背景）。 */
  get paneGround(): PackedColor {
    return this.transparent ? DEFAULT_COLOR : this.paneBg;
  }

  /** pane のセルの前景（`kind`: 0 既定・1 パレット・2 RGB）。 */
  paneColor(kind: 0 | 1 | 2, value: number, background: boolean): PackedColor {
    if (kind === 0) return background ? this.paneGround : this.paneFg;
    if (kind === 1) return value < 16 ? this.ansi[value]! : paletteColor(value);
    return RGB | (value & 0xffffff);
  }
}
