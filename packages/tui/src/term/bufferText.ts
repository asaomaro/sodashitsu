import type { HeadlessTerminal } from "./PaneTerminal.js";

/**
 * headless のバッファの文字を**セルの列**で扱う助け（copy モード・マウスの選択）。文字列の添字はセルの列と合わない（全角は 1 文字で 2 セル・
 * 右半分は空のセル）ので、列はいつもセルで数え、文字は `translateToString(trim, 開始の列, 終わりの列)` で切り出す。
 */

export interface CellPos {
  /** 絶対行（バッファの先頭から）。 */
  row: number;
  /** セルの列（0 始まり）。 */
  col: number;
}

type CharClass = "space" | "word" | "punct";

export function classify(ch: string): CharClass {
  if (ch === "" || /\s/.test(ch)) return "space";
  if (/[\p{L}\p{N}_]/u.test(ch)) return "word";
  return "punct";
}

/** その行の各セルの文字と幅（幅 0 は全角の右半分）。 */
export function rowCells(term: HeadlessTerminal, row: number): { ch: string; width: number }[] {
  const line = term.buffer.active.getLine(row);
  const out: { ch: string; width: number }[] = [];
  if (!line) return out;
  const cell = term.buffer.active.getNullCell();
  for (let col = 0; col < term.cols; col++) {
    const c = line.getCell(col, cell);
    out.push({ ch: c?.getChars() ?? "", width: c?.getWidth() ?? 1 });
  }
  return out;
}

/** その行の内容の終わり（最後の空白でないセルの次の列。空行は 0）。 */
export function rowEnd(term: HeadlessTerminal, row: number): number {
  const cells = rowCells(term, row);
  for (let col = cells.length - 1; col >= 0; col--) {
    const c = cells[col]!;
    if (c.width !== 0 && c.ch !== "" && c.ch !== " ") return col + c.width;
  }
  return 0;
}

/** 全角の右半分にいたら左の本体へ寄せる。 */
export function snapCol(term: HeadlessTerminal, row: number, col: number): number {
  if (col <= 0) return 0;
  const cells = rowCells(term, row);
  return cells[col]?.width === 0 ? col - 1 : col;
}

/** 次の行が折り返しの続き（`isWrapped`）か。 */
export function continuesOnNext(term: HeadlessTerminal, row: number): boolean {
  return term.buffer.active.getLine(row + 1)?.isWrapped === true;
}

/** 行の `start`〜`end`（セルの列。`end` を含む）の文字。 */
export function cellRangeText(
  term: HeadlessTerminal,
  row: number,
  start: number,
  end: number,
  trimRight: boolean,
): string {
  const line = term.buffer.active.getLine(row);
  if (!line || end < start) return "";
  return line.translateToString(trimRight, start, Math.min(term.cols, end + 1));
}

/**
 * `from`〜`to`（セル。`to` を含む）の文字。行の区切りは改行、**折り返しの続きの行へは改行を入れない**（一続きの行として写す）。`linewise` は行ごと。
 */
export function rangeText(
  term: HeadlessTerminal,
  from: CellPos,
  to: CellPos,
  linewise: boolean,
): string {
  let out = "";
  for (let row = from.row; row <= to.row; row++) {
    const cont = row < to.row && continuesOnNext(term, row);
    const start = linewise || row > from.row ? 0 : from.col;
    const end = linewise || row < to.row ? term.cols - 1 : to.col;
    // 折り返しの途中の行は右の空白も文字の一部（行末で切れたところ）なので残す。
    out += cellRangeText(term, row, start, end, !cont);
    if (row < to.row && !cont) out += "\n";
  }
  return out;
}

/** 論理行（折り返しをつないだ行）の文字と、各文字のセルの位置。 */
export interface LogicalLine {
  text: string;
  pos: CellPos[];
}

/** `row` を含む論理行の先頭の行。 */
export function logicalStart(term: HeadlessTerminal, row: number): number {
  let r = row;
  while (r > 0 && term.buffer.active.getLine(r)?.isWrapped === true) r--;
  return r;
}

/** `startRow` から始まる論理行。 */
export function logicalLine(
  term: HeadlessTerminal,
  startRow: number,
): { line: LogicalLine; endRow: number } {
  let text = "";
  const pos: CellPos[] = [];
  let row = startRow;
  for (;;) {
    const cells = rowCells(term, row);
    cells.forEach((c, col) => {
      if (c.width === 0) return;
      const ch = c.ch === "" ? " " : c.ch;
      for (const unit of ch) {
        text += unit;
        pos.push({ row, col });
      }
    });
    if (!continuesOnNext(term, row)) break;
    row++;
  }
  return { line: { text, pos }, endRow: row };
}

/** マウスのダブルクリックの単語の区切り（xterm.js の `wordSeparator` の既定に近い。パス・URL は 1 語）。 */
const MOUSE_SEPARATORS = /[\s()[\]{}'"`<>|,;]/;

/**
 * 単語の範囲（セルの列）。`copy` は copy モードの語（英数字・記号・空白の種類が続く所）、`mouse` はダブルクリックの語（区切りの文字の間）。
 * 空白（区切り）なら `col` だけ。
 */
export function wordRange(
  term: HeadlessTerminal,
  row: number,
  col: number,
  mode: "copy" | "mouse" = "copy",
): [number, number] {
  const cells = rowCells(term, row);
  const c0 = snapCol(term, row, col);
  const cls = (i: number): string | null => {
    const c = cells[i];
    if (!c) return null;
    if (c.width === 0) return cls(i - 1);
    if (mode === "mouse") return c.ch === "" || MOUSE_SEPARATORS.test(c.ch) ? "space" : "word";
    return classify(c.ch);
  };
  const k = cls(c0);
  if (k === null || k === "space") return [c0, c0];
  let from = c0;
  let to = c0;
  while (from > 0 && cls(from - 1) === k) from--;
  while (to + 1 < cells.length && cls(to + 1) === k) to++;
  return [snapCol(term, row, from), to];
}
