import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import type { CopyCommand } from "@sodashitsu/client-core";

export interface CopyResult {
  copiedText?: string;
  exited?: boolean;
}

/** `CopyCommand` を xterm.js の buffer・選択 API・`@xterm/addon-search` に当てる（architecture.md「term/TerminalRegistry.ts」の `CopyTarget`）。 */
export interface CopyTarget {
  apply(cmd: CopyCommand): CopyResult;
  /** copy モードに入るたび（`prefix+[`）に呼ぶ——カーソルを端末の**現在の**末尾位置へ合わせ直し、
   *  前回の選択・検索状態を捨てる（05-e2e-docs T4 で追加。decisions.md D94）。 */
  resetCursor(): void;
}

interface Position {
  row: number; // 絶対行（buffer の先頭からの行番号。scrollback を含む）
  col: number; // 0 始まり
}

type CharClass = "space" | "word" | "punct";

function classify(ch: string): CharClass {
  if (ch === "" || /\s/.test(ch)) return "space";
  if (/[A-Za-z0-9_]/.test(ch)) return "word";
  return "punct";
}

/**
 * `Terminal`/`SearchAddon` を使う実装（architecture の `CopyTarget`）。
 *
 * **簡略化**（このタスクの時間内で確認できた範囲。decisions.md D64）: 単語・WORD の移動は行をまたがない
 * （行末で見つからなければ次行の先頭へ移るだけ）。検索語の入力（1 文字ずつの組み立て）は `searchInput` を
 * 受け取って置き換えるところまでで、実際にどう文字を集めるか（専用の入力欄か）は T18 の側で決める。
 */
export class XtermCopyTarget implements CopyTarget {
  private cursor: Position;
  private anchor: Position | null = null;
  private linewise = false;
  private searchDir: 1 | -1 = 1;
  private searchTerm = "";

  constructor(
    private readonly term: Terminal,
    private readonly search: SearchAddon,
  ) {
    this.cursor = this.currentBufferPosition();
  }

  private currentBufferPosition(): Position {
    const buf = this.term.buffer.active;
    return { row: buf.baseY + buf.cursorY, col: buf.cursorX };
  }

  /**
   * `XtermCopyTarget` は pane を acquire したとき（`TerminalRegistry.create`）に一度だけ作られ、以後
   * その pane の copy モードのたびに使い回される——コンストラクタで読んだカーソル位置は、そのとき限りの
   * ものでしかない。以後の copy モードへの再入場で位置を合わせ直さないと、mount 時点のバッファ位置
   * （たいていほぼ先頭）にずっと固定されたままになる（実地の Playwright で発見。scrollback を溜めてから
   * copy モードに入っても、末尾ではなくバッファの先頭付近から始まっていた。decisions.md D94）。
   */
  resetCursor(): void {
    this.cursor = this.currentBufferPosition();
    this.clearSelection();
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
        this.applySelection();
        return {};
      case "yank":
        return this.yank();
      case "clearOrExit":
        return this.clearOrExit();
      case "exit":
        this.clearSelection();
        return { exited: true };
    }
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
        this.cursor = this.clamp({ row: this.cursor.row + dir * Math.max(1, Math.floor(rows / 2)), col: this.cursor.col });
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
        this.cursor = { row: this.cursor.row, col: Math.max(0, this.lineLength(this.cursor.row) - 1) };
        break;
      case "bufferTop":
        this.cursor = { row: 0, col: 0 };
        break;
      case "bufferBottom":
        this.cursor = { row: this.bottomRow(), col: 0 };
        break;
    }
    if (this.anchor) this.applySelection();
    else this.term.scrollToLine(Math.max(0, this.cursor.row - Math.floor(rows / 2)));
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

  private lineText(row: number): string {
    return this.term.buffer.active.getLine(row)?.translateToString(true) ?? "";
  }

  private lineLength(row: number): number {
    return Math.max(1, this.lineText(row).length);
  }

  /** 単語/WORD の境界を探す（行をまたがない。見つからなければ隣の行の先頭/末尾。D64）。 */
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
      // 今の連の終わりまで進み、続く空白を飛ばして次の語の先頭へ。
      while (i < text.length && cls(i) === startClass && startClass !== "space") i += dir === 1 ? 1 : -1;
      while (i >= 0 && i < text.length && cls(i) === "space") i += dir === 1 ? 1 : -1;
      if (i < 0 || i >= text.length) {
        const nextRow = this.clamp({ row: this.cursor.row + dir, col: dir === 1 ? 0 : text.length - 1 });
        return nextRow;
      }
      return { row: this.cursor.row, col: i };
    }
    // edge === "end"（wordEnd/WORDEnd。常に前方）
    i = this.cursor.col + 1;
    while (i < text.length && classify(text[i] ?? "") === "space") i++;
    const runClass = kind === "WORD" ? "word" : classify(text[i] ?? "");
    while (i < text.length && (kind === "WORD" ? classify(text[i] ?? "") !== "space" : classify(text[i] ?? "") === runClass)) i++;
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

  private applySelection(): void {
    if (!this.anchor) return;
    const [from, to] = this.orderedRange();
    if (this.linewise) {
      this.term.selectLines(from.row, to.row);
    } else {
      const length = to.row === from.row ? to.col - from.col + 1 : this.lineLength(from.row) - from.col; // 簡略化：複数行は先頭行のみ即時反映
      this.term.select(from.col, from.row, Math.max(1, length));
    }
  }

  private orderedRange(): [Position, Position] {
    if (!this.anchor) return [this.cursor, this.cursor];
    const [a, b] = [this.anchor, this.cursor];
    return a.row < b.row || (a.row === b.row && a.col <= b.col) ? [a, b] : [b, a];
  }

  private yank(): CopyResult {
    const text = this.term.hasSelection() ? this.term.getSelection() : "";
    this.clearSelection();
    return { copiedText: text, exited: true };
  }

  private clearOrExit(): CopyResult {
    if (this.term.hasSelection() || this.anchor) {
      this.clearSelection();
      return {};
    }
    return { exited: true };
  }

  private clearSelection(): void {
    this.anchor = null;
    this.term.clearSelection();
  }

  /**
   * 検索が当たったら `this.cursor` を一致箇所の先頭へ合わせる（05-e2e-docs T4 で追加。decisions.md D94）。
   * `SearchAddon.findNext`/`findPrevious` は xterm.js 自身の選択状態（`term.hasSelection()`）を動かす
   * だけで、`this.cursor` には触れない——合わせ直さないと、検索の直後に `v`/`V` で選択し直したときに
   * **一致箇所ではなく、検索前の古いカーソル位置から**選択が始まってしまう（yank だけなら
   * `term.getSelection()` を直接読むので問題にならないが、「検索して見つけた行をそこから選択し直す」
   * という設計の想定どおりの使い方（design「検索：/・?、繰り返しはn/N」の次に「選択とコピー：v・Space・V」
   * が続く）で初めて症状が出る。実地の Playwright で発見）。合わせた後は `anchor` を消す
   * （検索は新しい位置への「移動」として扱う——選択を検索をまたいで伸ばす機能は design に無い）。
   */
  private runSearch(dir: 1 | -1): void {
    if (!this.searchTerm) return;
    const found = dir === 1 ? this.search.findNext(this.searchTerm) : this.search.findPrevious(this.searchTerm);
    if (!found) return;
    const range = this.term.getSelectionPosition();
    if (!range) return;
    // `IBufferCellPosition` の doc コメントは「1-based」と書いているが、実測では 0-based だった
    // （`getSelection()` の実テキストと突き合わせて確認済み。`x`・`y` とも `IBuffer.cursorY`/
    // `baseY` と同じ 0-based の絶対座標として扱える）。
    this.cursor = { row: range.start.y, col: range.start.x };
    this.anchor = null;
  }
}
