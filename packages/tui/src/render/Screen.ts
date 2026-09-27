/*
 * 差分描画の手順（`Screen.frame`）は herdr（https://github.com/herdrdev/herdr、commit da6bcd5969779bfe0396bcf89a8025d4375d611e）の
 * `src/protocol/render_ansi.rs`（`blit_frame_to_with_cursor_memory_and_clear_policy`・`blit_patch_to`。全角の右隣の無効化・隣り合う ASCII の CUP の省略・
 * 同期出力・最後のカーソル）を TypeScript へ移したもの（Apache-2.0。無改変ではなく本製品の型に合わせて書き直した。ルートの `NOTICE` を参照）。
 */
import { charWidth } from "./width.js";
import { DEFAULT_COLOR, sgrOf, type ColorMode, type PackedColor } from "./color.js";
import type { CursorStyle } from "../term/PaneTerminal.js";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 1 セル（architecture の `Cell`。`width` 0 = 全角の右隣）。 */
export interface Cell {
  ch: string;
  width: 0 | 1 | 2;
  fg: PackedColor;
  bg: PackedColor;
  attrs: number;
}

/**
 * セル格子（平たい配列。research §1.4）。**不変条件：幅 0 のセルは必ず幅 2 のセルの右隣にだけある**——書き込み（`set`）が壊れた組を空白に直す。
 */
export class Grid {
  readonly ch: string[];
  readonly width: Uint8Array;
  readonly fg: Uint32Array;
  readonly bg: Uint32Array;
  readonly attrs: Uint16Array;

  constructor(
    readonly w: number,
    readonly h: number,
    bg: PackedColor = DEFAULT_COLOR,
  ) {
    const n = w * h;
    this.ch = new Array<string>(n).fill(" ");
    this.width = new Uint8Array(n).fill(1);
    this.fg = new Uint32Array(n);
    this.bg = new Uint32Array(n).fill(bg);
    this.attrs = new Uint16Array(n);
  }

  cell(x: number, y: number): Cell {
    const i = y * this.w + x;
    return {
      ch: this.ch[i]!,
      width: this.width[i] as 0 | 1 | 2,
      fg: this.fg[i]!,
      bg: this.bg[i]!,
      attrs: this.attrs[i]!,
    };
  }

  /** 1 行の文字（幅 0 のセルは飛ばす。テスト用）。 */
  rowText(y: number): string {
    let s = "";
    for (let x = 0; x < this.w; x++)
      if (this.width[y * this.w + x] !== 0) s += this.ch[y * this.w + x];
    return s;
  }

  /**
   * 1 セル書く。`width` 2 は右隣を幅 0 にする（右端からはみ出すなら空白にする）。上書きで壊れた全角の組は空白に直す。
   */
  set(
    x: number,
    y: number,
    ch: string,
    width: 1 | 2,
    fg: PackedColor,
    bg: PackedColor,
    attrs = 0,
  ): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    if (width === 2 && x + 1 >= this.w) {
      ch = " ";
      width = 1;
    }
    const i = y * this.w + x;
    this.breakPairAt(x, y);
    if (width === 2) this.breakPairAt(x + 1, y);
    this.ch[i] = ch;
    this.width[i] = width;
    this.fg[i] = fg;
    this.bg[i] = bg;
    this.attrs[i] = attrs;
    if (width === 2) {
      const j = i + 1;
      this.ch[j] = "";
      this.width[j] = 0;
      this.fg[j] = fg;
      this.bg[j] = bg;
      this.attrs[j] = attrs;
    }
  }

  /** 結合文字を (x, y) のセル（全角の右半分なら左の本体）へ足す。 */
  private appendToCell(x: number, y: number, mark: string): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    let i = y * this.w + x;
    if (this.width[i] === 0 && x > 0) i -= 1;
    this.ch[i] = (this.ch[i] ?? "") + mark;
  }

  /** (x, y) を上書きする前に、そこに掛かっている全角の組の片割れを空白にする。 */
  private breakPairAt(x: number, y: number): void {
    const i = y * this.w + x;
    if (this.width[i] === 0 && x > 0) {
      this.ch[i - 1] = " ";
      this.width[i - 1] = 1;
    } else if (this.width[i] === 2 && x + 1 < this.w) {
      this.ch[i + 1] = " ";
      this.width[i + 1] = 1;
    }
  }

  fill(r: Rect, fg: PackedColor, bg: PackedColor, ch = " "): void {
    const x0 = Math.max(0, r.x);
    const y0 = Math.max(0, r.y);
    const x1 = Math.min(this.w, r.x + r.w);
    const y1 = Math.min(this.h, r.y + r.h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) this.set(x, y, ch, 1, fg, bg);
  }

  /** 文字列を書く（`maxWidth` 桁まで。全角がはみ出すなら手前で止める）。書いた桁数を返す。 */
  text(
    x: number,
    y: number,
    s: string,
    fg: PackedColor,
    bg: PackedColor,
    attrs = 0,
    maxWidth = this.w - x,
  ): number {
    let col = 0;
    for (const chr of s) {
      const cp = chr.codePointAt(0)!;
      const cw = charWidth(cp);
      if (cw === 0) {
        // 結合文字（NFD の濁点等）は直前に書いたセルへ足す（pane の中の xterm と同じく 1 セルにまとめる）。制御文字は出さない。
        if (cp >= 0x20 && col > 0) this.appendToCell(x + col - 1, y, chr);
        continue;
      }
      if (col + cw > maxWidth) break;
      this.set(x + col, y, chr, cw, fg, bg, attrs);
      col += cw;
    }
    return col;
  }

  /** 別の格子の同じ位置の矩形を写す（描き直さない pane の中身。大きさが同じ格子の間だけ）。 */
  copyFrom(src: Grid, r: Rect): void {
    if (src.w !== this.w || src.h !== this.h) return;
    for (let y = r.y; y < r.y + r.h; y++) {
      const start = y * this.w + r.x;
      const end = start + r.w;
      for (let i = start; i < end; i++) this.ch[i] = src.ch[i]!;
      this.width.set(src.width.subarray(start, end), start);
      this.fg.set(src.fg.subarray(start, end), start);
      this.bg.set(src.bg.subarray(start, end), start);
      this.attrs.set(src.attrs.subarray(start, end), start);
    }
  }
}

/** 最後に置く本物のカーソル（焦点の pane の入力位置。IME の候補窓の位置。research §3.4）。 */
export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  style: CursorStyle;
  blink: boolean;
}

/** DECSCUSR の番号。 */
function shapeOf(c: CursorState): number {
  const base = c.style === "block" ? 1 : c.style === "underline" ? 3 : 5;
  return c.blink ? base : base + 1;
}

/**
 * 差分描画（20260927-cli-mode の design「render/Screen.ts」。herdr の `render_ansi.rs` の手順を写した）:
 * 1. 最初・大きさが変わった・`invalidate` の後は全部（`CSI 2J` → 全セル）。以後は前のフレームと違うセルだけ。
 * 2. 全体を同期出力 `CSI ?2026 h/l` で包み、描く前にカーソルを隠す。
 * 3. SGR は前のセルと違うときだけ出す。隣り合う ASCII の幅 1 のセルは CUP を省く。
 * 4. 前後いずれかのフレームで幅 2 だったセルの右隣は無効化して描き直す。幅 2 を描いたら右の 1 セルは飛ばす。
 * 5. 最後にカーソルを焦点の pane の位置へ置き（隠れていても置く）、形と表示を戻す。同期出力を閉じた後にもう一度置く（Windows 以外）。
 */
export class Screen {
  private prev: Grid | null = null;
  private lastShape = -1;

  constructor(
    private mode: ColorMode,
    private readonly repeatImeAnchor = true,
  ) {}

  get colorMode(): ColorMode {
    return this.mode;
  }

  /** 色の出し方を替える（次は全部描き直す）。 */
  setColorMode(mode: ColorMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.invalidate();
  }

  invalidate(): void {
    this.prev = null;
    this.lastShape = -1;
  }

  frame(next: Grid, cursor: CursorState | null): string {
    const prev = this.prev && this.prev.w === next.w && this.prev.h === next.h ? this.prev : null;
    let out = "\x1b[?2026h\x1b[?25l";
    if (!prev) out += "\x1b[0m\x1b[2J";
    let lastSgr = "";
    const w = next.w;
    for (let y = 0; y < next.h; y++) {
      let invalidated = 0;
      let toSkip = 0;
      let nextInline = -1;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const nw = next.width[i]!;
        const pw = prev ? prev.width[i]! : 1;
        const changed =
          !prev ||
          prev.ch[i] !== next.ch[i] ||
          pw !== nw ||
          prev.fg[i] !== next.fg[i] ||
          prev.bg[i] !== next.bg[i] ||
          prev.attrs[i] !== next.attrs[i];
        if (nw !== 0 && toSkip === 0 && (changed || invalidated > 0)) {
          if (nextInline !== x || invalidated > 0) out += `\x1b[${y + 1};${x + 1}H`;
          const sgr = sgrOf(next.fg[i]!, next.bg[i]!, next.attrs[i]!, this.mode);
          if (sgr !== lastSgr) {
            out += sgr;
            lastSgr = sgr;
          }
          const ch = next.ch[i]!;
          out += ch === "" ? " " : ch;
          nextInline = nw === 1 && ch.length === 1 && ch.charCodeAt(0) < 0x7f ? x + 1 : -1;
        }
        toSkip = Math.max(0, nw - 1);
        const affected = Math.max(nw, pw);
        invalidated = Math.max(0, Math.max(affected, invalidated) - 1);
      }
    }
    if (lastSgr !== "") out += "\x1b[0m";
    const c = cursor ?? { x: 0, y: 0, visible: false, style: "block" as const, blink: false };
    const cup = `\x1b[${clamp(c.y, 0, next.h - 1) + 1};${clamp(c.x, 0, next.w - 1) + 1}H`;
    out += cup;
    if (c.visible) {
      const shape = shapeOf(c);
      if (shape !== this.lastShape) {
        out += `\x1b[${shape} q`;
        this.lastShape = shape;
      }
      out += "\x1b[?25h";
    }
    out += "\x1b[?2026l";
    if (this.repeatImeAnchor) out += cup;
    this.prev = next;
    return out;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
