import type { CopyCommand } from "@sodashitsu/client-core";
import type { CopyResult, CopyTargetPort } from "../actions/TuiDispatcher.js";
import {
  classify,
  logicalLine,
  logicalStart,
  rangeText,
  rowCells,
  rowEnd,
  snapCol,
  type CellPos,
} from "./bufferText.js";
import type { HeadlessTerminal } from "./PaneTerminal.js";

export type Position = CellPos;

/** 選択の範囲（セルの列。描画が反転して見せる）。 */
export interface Selection {
  from: Position;
  to: Position;
  linewise: boolean;
}

/**
 * 絶対行をスクロールバックの切り詰めに追従させる（xterm のマーカー。切り詰められて行が消えたら先頭に寄せる）。
 */
class TrackedPos {
  private marker: { line: number; isDisposed: boolean; dispose(): void } | undefined;
  private fallbackRow: number;

  constructor(
    private readonly term: HeadlessTerminal,
    pos: Position,
    public col = pos.col,
  ) {
    this.fallbackRow = pos.row;
    this.marker = this.register(pos.row);
  }

  private register(row: number): TrackedPos["marker"] {
    const buf = this.term.buffer.active;
    try {
      return this.term.registerMarker(row - (buf.baseY + buf.cursorY));
    } catch {
      return undefined;
    }
  }

  get row(): number {
    if (!this.marker) return this.fallbackRow;
    return this.marker.isDisposed ? 0 : this.marker.line;
  }

  get pos(): Position {
    return { row: this.row, col: this.col };
  }

  set(pos: Position): void {
    this.marker?.dispose();
    this.fallbackRow = pos.row;
    this.marker = this.register(pos.row);
    this.col = pos.col;
  }

  dispose(): void {
    this.marker?.dispose();
  }
}

/**
 * copy モードの対象（web の `term/CopyTarget.ts` の `XtermCopyTarget` を headless の上に写した）。**列はいつもセルで数える**（全角の行でも強調と写しが
 * 合う）。headless には選択の API が無いので選択は自分で持ち（描画が反転して見せる）、写す文字はバッファから切り出す（折り返しの続きの行へは改行を入れない）。
 * 検索は大小無視で、折り返しをまたいで探し、見つけた所を選んだ状態にする（そのまま `y` で写せる。Esc はまず選択を消す）。位置はスクロールバックの
 * 切り詰めに追従する（xterm のマーカー）。単語の移動は行をまたがない（web の D64 と同じ簡略化）。
 */
export class TuiCopyTarget implements CopyTargetPort {
  private readonly cur: TrackedPos;
  private anchor: TrackedPos | null = null;
  private linewise = false;
  private searchDir: 1 | -1 = 1;
  private searchTerm = "";

  constructor(private readonly term: HeadlessTerminal) {
    this.cur = new TrackedPos(term, this.currentBufferPosition());
  }

  get cursor(): Position {
    return this.cur.pos;
  }

  private setCursor(p: Position): void {
    this.cur.set(p);
  }

  private currentBufferPosition(): Position {
    const buf = this.term.buffer.active;
    const row = buf.baseY + buf.cursorY;
    return { row, col: snapCol(this.term, row, Math.min(buf.cursorX, this.term.cols - 1)) };
  }

  /** 今の選択（無ければ null）。 */
  selection(): Selection | null {
    if (!this.anchor) return null;
    const [from, to] = this.orderedRange();
    return { from, to, linewise: this.linewise };
  }

  resetCursor(): void {
    this.setCursor(this.currentBufferPosition());
    this.clearAnchor();
    this.searchTerm = "";
  }

  /** 抜ける（選択を消し、末尾へスクロールを戻す）。焦点がほかの pane へ移ったときにも呼ぶ。 */
  leave(): void {
    this.clearAnchor();
    this.term.scrollToBottom();
  }

  private clearAnchor(): void {
    this.anchor?.dispose();
    this.anchor = null;
  }

  private setAnchor(p: Position): void {
    this.clearAnchor();
    this.anchor = new TrackedPos(this.term, p);
  }

  apply(cmd: CopyCommand): CopyResult {
    switch (cmd.op) {
      case "move":
        this.move(cmd.unit, cmd.dir);
        return {};
      case "searchStart":
        this.searchDir = cmd.dir;
        return {};
      case "searchInput":
        this.searchTerm = cmd.text;
        this.runSearch(this.searchDir);
        return {};
      case "searchNext":
        this.runSearch(cmd.reverse ? (this.searchDir === 1 ? -1 : 1) : this.searchDir);
        return {};
      case "selectStart":
        this.setAnchor(this.cursor);
        this.linewise = cmd.linewise;
        return {};
      case "yank": {
        const text = this.selectedText();
        this.leave();
        // 選んでいなければ写さない（空を写して「コピーしました」を出さない）。
        return text === "" ? { exited: true } : { copiedText: text, exited: true };
      }
      case "clearOrExit":
        if (this.anchor) {
          this.clearAnchor();
          return {};
        }
        this.leave();
        return { exited: true };
      case "exit":
        this.leave();
        return { exited: true };
    }
  }

  /** 選んだ文字（折り返しの続きの行へは改行を入れない）。 */
  selectedText(): string {
    const sel = this.selection();
    if (!sel) return "";
    return rangeText(this.term, sel.from, sel.to, sel.linewise);
  }

  lineText(row: number): string {
    return this.term.buffer.active.getLine(row)?.translateToString(true) ?? "";
  }

  private move(unit: Extract<CopyCommand, { op: "move" }>["unit"], dir: -1 | 1): void {
    const rows = this.term.rows;
    const c = this.cursor;
    switch (unit) {
      case "char":
        this.setCursor(this.stepChar(c, dir));
        break;
      case "line":
        this.setCursor(this.clamp({ row: c.row + dir, col: c.col }));
        break;
      case "page":
        this.setCursor(this.clamp({ row: c.row + dir * rows, col: c.col }));
        break;
      case "halfPage":
        this.setCursor(
          this.clamp({ row: c.row + dir * Math.max(1, Math.floor(rows / 2)), col: c.col }),
        );
        break;
      case "paragraph":
        this.setCursor(this.findParagraphBoundary(dir));
        break;
      case "word":
        this.setCursor(this.findWordBoundary(dir, "word", "start"));
        break;
      case "WORD":
        this.setCursor(this.findWordBoundary(dir, "WORD", "start"));
        break;
      case "wordEnd":
        this.setCursor(this.findWordBoundary(1, "word", "end"));
        break;
      case "WORDEnd":
        this.setCursor(this.findWordBoundary(1, "WORD", "end"));
        break;
      case "lineStart":
        this.setCursor({ row: c.row, col: 0 });
        break;
      case "lineEnd":
        this.setCursor(this.clamp({ row: c.row, col: this.term.cols - 1 }));
        break;
      case "bufferTop":
        this.setCursor({ row: 0, col: 0 });
        break;
      case "bufferBottom":
        this.setCursor({ row: this.bottomRow(), col: 0 });
        break;
    }
    this.ensureVisible();
  }

  /** 1 文字（セル）動く。全角は 2 セルを 1 歩で。 */
  private stepChar(c: Position, dir: -1 | 1): Position {
    const cells = rowCells(this.term, c.row);
    let col = c.col + (dir === 1 ? Math.max(1, cells[c.col]?.width ?? 1) : -1);
    col = snapCol(this.term, c.row, Math.max(0, col));
    return this.clamp({ row: c.row, col });
  }

  private ensureVisible(): void {
    const buf = this.term.buffer.active;
    const top = buf.viewportY;
    const rows = this.term.rows;
    const row = this.cursor.row;
    if (row < top) this.term.scrollToLine(row);
    else if (row >= top + rows) this.term.scrollToLine(row - rows + 1);
  }

  /** 行と列を内容の範囲に収める（列は行の内容の最後のセルまで。全角の右半分なら左へ）。 */
  private clamp(p: Position): Position {
    const row = Math.min(this.bottomRow(), Math.max(0, p.row));
    const end = Math.max(1, rowEnd(this.term, row));
    const col = snapCol(this.term, row, Math.min(end - 1, Math.max(0, p.col)));
    return { row, col };
  }

  private bottomRow(): number {
    return this.term.buffer.active.baseY + this.term.rows - 1;
  }

  /** 単語・WORD の境界（セルの列で。行をまたがない：見つからなければ隣の行の先頭/末尾。web の D64）。 */
  private findWordBoundary(dir: -1 | 1, kind: "word" | "WORD", edge: "start" | "end"): Position {
    const c = this.cursor;
    const cells = rowCells(this.term, c.row);
    const n = cells.length;
    const cls = (i: number): string => {
      let cell = cells[i];
      if (cell?.width === 0) cell = cells[i - 1];
      const k = classify(cell?.ch ?? "");
      return kind === "WORD" ? (k === "space" ? "space" : "word") : k;
    };
    const next = (i: number, d: number): number => {
      let j = i + d;
      while (j >= 0 && j < n && cells[j]?.width === 0) j += d;
      return j;
    };
    if (edge === "start") {
      let i = c.col;
      const start = cls(i);
      while (i >= 0 && i < n && cls(i) === start && start !== "space") i = next(i, dir);
      while (i >= 0 && i < n && cls(i) === "space") i = next(i, dir);
      if (i < 0 || i >= n || i >= rowEnd(this.term, c.row))
        return this.clamp({ row: c.row + dir, col: dir === 1 ? 0 : n - 1 });
      return { row: c.row, col: i };
    }
    let i = next(c.col, 1);
    while (i < n && cls(i) === "space") i = next(i, 1);
    if (i >= n || i >= rowEnd(this.term, c.row)) return this.clamp({ row: c.row + 1, col: 0 });
    const run = cls(i);
    let last = i;
    while (i < n && cls(i) === run) {
      last = i;
      i = next(i, 1);
    }
    return { row: c.row, col: last };
  }

  private findParagraphBoundary(dir: -1 | 1): Position {
    let row = this.cursor.row + dir;
    const bottom = this.bottomRow();
    while (row > 0 && row < bottom && this.lineText(row).trim() !== "") row += dir;
    return this.clamp({ row, col: 0 });
  }

  private orderedRange(): [Position, Position] {
    const cur = this.cursor;
    if (!this.anchor) return [cur, cur];
    const a = this.anchor.pos;
    const [x, y] = a.row < cur.row || (a.row === cur.row && a.col <= cur.col) ? [a, cur] : [cur, a];
    // 終わりが全角の本体なら右半分まで含める。
    const w = rowCells(this.term, y.row)[y.col]?.width ?? 1;
    return [x, { row: y.row, col: y.col + Math.max(0, w - 1) }];
  }

  /**
   * 大小を区別せずに探す（addon-search の既定と同じ）。折り返しをつないだ論理行の中で探すので、行の終わりをまたぐ一致も見つかる。
   * 見つかれば一致を選んだ状態にし、カーソルを一致の終わりへ（`y` でそのまま写せる）。
   */
  private runSearch(dir: 1 | -1): void {
    if (!this.searchTerm) return;
    const needle = this.searchTerm.toLowerCase();
    const bottom = this.bottomRow();
    const lines: { line: ReturnType<typeof logicalLine>["line"]; startRow: number }[] = [];
    for (let row = 0; row <= bottom;) {
      const { line, endRow } = logicalLine(this.term, row);
      lines.push({ line, startRow: row });
      row = endRow + 1;
    }
    const here = this.anchor?.pos ?? this.cursor;
    const curStart = logicalStart(this.term, here.row);
    const curIdx = Math.max(
      0,
      lines.findIndex((l) => l.startRow === curStart),
    );
    const at = (l: (typeof lines)[number], p: Position): number =>
      l.line.pos.findIndex((q) => q.row === p.row && q.col === p.col);
    for (let step = 0; step <= lines.length; step++) {
      const li = (curIdx + dir * step + lines.length * 2) % lines.length;
      const l = lines[li]!;
      const hay = l.line.text.toLowerCase();
      let idx: number;
      if (step === 0) {
        const from = at(l, here);
        idx =
          dir === 1
            ? hay.indexOf(needle, from + 1)
            : from > 0
              ? hay.lastIndexOf(needle, from - 1)
              : -1;
      } else idx = dir === 1 ? hay.indexOf(needle) : hay.lastIndexOf(needle);
      if (idx < 0) continue;
      const start = l.line.pos[idx]!;
      const end = l.line.pos[idx + needle.length - 1] ?? start;
      this.linewise = false;
      this.setAnchor(start);
      this.setCursor(end);
      this.ensureVisible();
      return;
    }
  }
}
