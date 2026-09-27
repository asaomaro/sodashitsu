import type { CopyCommand } from "@sodashitsu/client-core";
import type { CopyResult, CopyTargetPort } from "../actions/TuiDispatcher.js";
import type { HeadlessTerminal } from "./PaneTerminal.js";

export interface Position {
  /** 絶対行（バッファの先頭から。スクロールバックを含む）。 */
  row: number;
  col: number;
}

/** 選択の範囲（描画が反転して見せる）。 */
export interface Selection {
  from: Position;
  to: Position;
  linewise: boolean;
}

type CharClass = "space" | "word" | "punct";

function classify(ch: string): CharClass {
  if (ch === "" || /\s/.test(ch)) return "space";
  if (/[A-Za-z0-9_]/.test(ch)) return "word";
  return "punct";
}

/**
 * copy モードの対象（web の `term/CopyTarget.ts` の `XtermCopyTarget` を headless の上に写した）。headless には選択の API が無いので、
 * 選択は自分で持ち（描画が反転して見せる）、コピーする文字はバッファから切り出す。検索は addon-search の代わりに行の文字列を大小無視で探す。
 * 簡略化は web と同じ（単語・WORD の移動は行をまたがない。web の D64）。
 */
export class TuiCopyTarget implements CopyTargetPort {
  cursor: Position;
  private anchor: Position | null = null;
  private linewise = false;
  private searchDir: 1 | -1 = 1;
  private searchTerm = "";

  constructor(private readonly term: HeadlessTerminal) {
    this.cursor = this.currentBufferPosition();
  }

  private currentBufferPosition(): Position {
    const buf = this.term.buffer.active;
    return { row: buf.baseY + buf.cursorY, col: Math.min(buf.cursorX, this.term.cols - 1) };
  }

  /** 今の選択（無ければ null）。 */
  selection(): Selection | null {
    if (!this.anchor) return null;
    const [from, to] = this.orderedRange();
    return { from, to, linewise: this.linewise };
  }

  resetCursor(): void {
    this.cursor = this.currentBufferPosition();
    this.anchor = null;
    this.searchTerm = "";
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
        this.anchor = { ...this.cursor };
        this.linewise = cmd.linewise;
        return {};
      case "yank": {
        const text = this.selectedText();
        this.anchor = null;
        this.scrollToBottom();
        return { copiedText: text, exited: true };
      }
      case "clearOrExit":
        if (this.anchor) {
          this.anchor = null;
          return {};
        }
        this.scrollToBottom();
        return { exited: true };
      case "exit":
        this.anchor = null;
        this.scrollToBottom();
        return { exited: true };
    }
  }

  /** 選んだ文字（行ごとに右の空白を落として改行でつなぐ）。 */
  selectedText(): string {
    const sel = this.selection();
    if (!sel) return "";
    const lines: string[] = [];
    for (let row = sel.from.row; row <= sel.to.row; row++) {
      const text = this.lineText(row);
      if (sel.linewise) {
        lines.push(text.trimEnd());
        continue;
      }
      const start = row === sel.from.row ? sel.from.col : 0;
      const end = row === sel.to.row ? sel.to.col + 1 : text.length;
      lines.push(text.slice(start, end).trimEnd());
    }
    return lines.join("\n");
  }

  private move(unit: Extract<CopyCommand, { op: "move" }>["unit"], dir: -1 | 1): void {
    const rows = this.term.rows;
    switch (unit) {
      case "char":
        this.cursor = this.clamp({ row: this.cursor.row, col: this.cursor.col + dir });
        break;
      case "line":
        this.cursor = this.clamp({ row: this.cursor.row + dir, col: this.cursor.col });
        break;
      case "page":
        this.cursor = this.clamp({ row: this.cursor.row + dir * rows, col: this.cursor.col });
        break;
      case "halfPage":
        this.cursor = this.clamp({
          row: this.cursor.row + dir * Math.max(1, Math.floor(rows / 2)),
          col: this.cursor.col,
        });
        break;
      case "paragraph":
        this.cursor = this.findParagraphBoundary(dir);
        break;
      case "word":
        this.cursor = this.findWordBoundary(dir, "word", "start");
        break;
      case "WORD":
        this.cursor = this.findWordBoundary(dir, "WORD", "start");
        break;
      case "wordEnd":
        this.cursor = this.findWordBoundary(1, "word", "end");
        break;
      case "WORDEnd":
        this.cursor = this.findWordBoundary(1, "WORD", "end");
        break;
      case "lineStart":
        this.cursor = { row: this.cursor.row, col: 0 };
        break;
      case "lineEnd":
        this.cursor = {
          row: this.cursor.row,
          col: Math.max(0, this.lineLength(this.cursor.row) - 1),
        };
        break;
      case "bufferTop":
        this.cursor = { row: 0, col: 0 };
        break;
      case "bufferBottom":
        this.cursor = { row: this.bottomRow(), col: 0 };
        break;
    }
    this.ensureVisible();
  }

  /** カーソルが画面の外なら、見える所までスクロールする。 */
  private ensureVisible(): void {
    const buf = this.term.buffer.active;
    const top = buf.viewportY;
    const rows = this.term.rows;
    if (this.cursor.row < top) this.term.scrollToLine(this.cursor.row);
    else if (this.cursor.row >= top + rows) this.term.scrollToLine(this.cursor.row - rows + 1);
  }

  private scrollToBottom(): void {
    this.term.scrollToBottom();
  }

  private clamp(p: Position): Position {
    const row = Math.min(this.bottomRow(), Math.max(0, p.row));
    const len = this.lineLength(row);
    const col = Math.min(Math.max(0, len - 1), Math.max(0, p.col));
    return { row, col };
  }

  private bottomRow(): number {
    return this.term.buffer.active.baseY + this.term.rows - 1;
  }

  lineText(row: number): string {
    return this.term.buffer.active.getLine(row)?.translateToString(true) ?? "";
  }

  private lineLength(row: number): number {
    return Math.max(1, this.lineText(row).length);
  }

  private findWordBoundary(dir: -1 | 1, kind: "word" | "WORD", edge: "start" | "end"): Position {
    const text = this.lineText(this.cursor.row);
    const cls = (i: number): CharClass => {
      const c = classify(text[i] ?? "");
      if (kind === "WORD") return c === "space" ? "space" : "word";
      return c;
    };
    let i = this.cursor.col;
    const startClass = cls(i);
    if (edge === "start") {
      while (i < text.length && cls(i) === startClass && startClass !== "space")
        i += dir === 1 ? 1 : -1;
      while (i >= 0 && i < text.length && cls(i) === "space") i += dir === 1 ? 1 : -1;
      if (i < 0 || i >= text.length)
        return this.clamp({ row: this.cursor.row + dir, col: dir === 1 ? 0 : text.length - 1 });
      return { row: this.cursor.row, col: i };
    }
    i = this.cursor.col + 1;
    while (i < text.length && classify(text[i] ?? "") === "space") i++;
    const runClass = kind === "WORD" ? "word" : classify(text[i] ?? "");
    while (
      i < text.length &&
      (kind === "WORD" ? classify(text[i] ?? "") !== "space" : classify(text[i] ?? "") === runClass)
    )
      i++;
    if (i > this.cursor.col + 1) i--;
    if (i >= text.length) return this.clamp({ row: this.cursor.row + 1, col: 0 });
    return { row: this.cursor.row, col: i };
  }

  private findParagraphBoundary(dir: -1 | 1): Position {
    let row = this.cursor.row + dir;
    const bottom = this.bottomRow();
    while (row > 0 && row < bottom && this.lineText(row).trim() !== "") row += dir;
    return this.clamp({ row, col: 0 });
  }

  private orderedRange(): [Position, Position] {
    if (!this.anchor) return [this.cursor, this.cursor];
    const [a, b] = [this.anchor, this.cursor];
    return a.row < b.row || (a.row === b.row && a.col <= b.col) ? [a, b] : [b, a];
  }

  /** 大小を区別せずに探す（addon-search の既定と同じ）。見つかればカーソルをその先頭へ、選択は外す（web の D94）。 */
  private runSearch(dir: 1 | -1): void {
    if (!this.searchTerm) return;
    const needle = this.searchTerm.toLowerCase();
    const bottom = this.bottomRow();
    const total = bottom + 1;
    for (let step = 0; step <= total; step++) {
      const row = (this.cursor.row + dir * step + total * 2) % total;
      const hay = this.lineText(row).toLowerCase();
      let col: number;
      if (dir === 1) col = hay.indexOf(needle, step === 0 ? this.cursor.col + 1 : 0);
      else
        col =
          step === 0
            ? this.cursor.col > 0
              ? hay.lastIndexOf(needle, this.cursor.col - 1)
              : -1
            : hay.lastIndexOf(needle);
      if (col >= 0) {
        this.cursor = { row, col };
        this.anchor = null;
        this.ensureVisible();
        return;
      }
    }
  }
}
