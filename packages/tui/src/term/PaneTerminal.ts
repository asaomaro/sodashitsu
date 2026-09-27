// `@xterm/headless`・`@xterm/addon-unicode11` は CJS のバンドルで、Node の ESM ローダが named export を静的に解析できない
// （server の `terminal/Mirror.ts` の冒頭と同じ事情）。default（名前空間オブジェクト）を受けて実行時に取り出す。
import xtermHeadless from "@xterm/headless";
import xtermUnicode11 from "@xterm/addon-unicode11";

const { Terminal } = xtermHeadless;
const { Unicode11Addon } = xtermUnicode11;
export type HeadlessTerminal = InstanceType<typeof xtermHeadless.Terminal>;

export type CursorStyle = "block" | "underline" | "bar";
/** マウスの報告の符号化（DECSET 1005/1006/1015/1016。既定は X10 形式）。 */
export type MouseEncoding = "default" | "utf8" | "sgr" | "urxvt" | "sgr-pixels";

const MOUSE_ENCODING_MODES: Readonly<Record<number, MouseEncoding>> = {
  1005: "utf8",
  1006: "sgr",
  1015: "urxvt",
  1016: "sgr-pixels",
};

/**
 * pane ごとの headless（20260927-cli-mode の design「term/PaneTerminal.ts」）。SNAPSHOT で作り直し（`\x1bc`＋本文。client-core の
 * `TerminalSinkPort.onSnapshot` の説明と同じ）、OUTPUT を書く。公開の型に無いモード（カーソルの表示・形、マウスの符号化）は
 * `registerCsiHandler` で自分で追う（常に false を返して xterm 本体の処理に委ねる。server の `Mirror.ts` と同じ作法——束ねられた Pm を
 * 黙って消さない）。**`onData`（問い合わせへの応答）はサーバへ送らない**——答えるのはサーバのミラーだけ（design「ドメイン固有の考慮」）。
 */
export class PaneTerminal {
  readonly term: HeadlessTerminal;
  cursorVisible = true;
  cursorStyle: CursorStyle = "block";
  cursorBlink = false;
  mouseEncoding: MouseEncoding = "default";
  /** 前に読んでから中身が変わった（描画が読み直す）。 */
  dirty = true;
  private disposed = false;
  private readonly disposers: { dispose(): void }[] = [];

  constructor(
    readonly paneId: string,
    cols: number,
    rows: number,
    /** 作ったときの行数（購読で求める行数もこれ。作ってから購読するまでに設定が変わっても食い違わない。web の D6 と同じ）。 */
    readonly scrollback: number,
    private readonly onDirty: (paneId: string) => void = () => undefined,
  ) {
    this.term = new Terminal({
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      scrollback: Math.max(0, scrollback),
      allowProposedApi: true,
    });
    // web と同じ unicode11（全角・絵文字の幅を外側の端末とそろえる。research F1.2）。
    this.term.loadAddon(new Unicode11Addon());
    this.term.unicode.activeVersion = "11";
    const parser = this.term.parser;
    this.disposers.push(
      parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) =>
        this.onDecMode(params, true),
      ),
    );
    this.disposers.push(
      parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) =>
        this.onDecMode(params, false),
      ),
    );
    this.disposers.push(
      parser.registerCsiHandler({ intermediates: " ", final: "q" }, (params) =>
        this.onCursorStyle(params),
      ),
    );
    // DECSTR（`CSI ! p`。ソフトリセット）もカーソルの表示・形を初期値へ戻す（xterm 本体の処理は妨げない）。
    this.disposers.push(
      parser.registerCsiHandler({ intermediates: "!", final: "p" }, () => {
        this.cursorVisible = true;
        this.cursorStyle = "block";
        this.cursorBlink = false;
        this.markDirty();
        return false;
      }),
    );
    // RIS（SNAPSHOT の頭の `\x1bc` を含む）で追っている状態も初期値へ戻す（xterm 自身の RIS は妨げない）。
    this.disposers.push(
      parser.registerEscHandler({ final: "c" }, () => {
        this.resetTracked();
        return false;
      }),
    );
    this.disposers.push(this.term.onWriteParsed(() => this.markDirty()));
    this.disposers.push(this.term.onScroll(() => this.markDirty()));
  }

  /** SNAPSHOT：大きさを合わせ、消してから書き直す（流量制御の回復でいつでも届く）。 */
  snapshot(cols: number, rows: number, text: string): void {
    if (this.disposed) return;
    this.resize(cols, rows);
    this.term.write(`\x1bc${text}`);
  }

  output(chunk: Uint8Array): void {
    if (this.disposed) return;
    this.term.write(chunk);
  }

  /**
   * それまでの書き込みを処理し終えてから大きさを変える（`pane.size_changed`。前の大きさで出た出力を新しい大きさで解釈しない。
   * web の `TerminalRegistry` と同じ順序）。
   */
  resizeAfterWrites(cols: number, rows: number): void {
    if (this.disposed) return;
    this.term.write("", () => this.resize(cols, rows));
  }

  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    const c = Math.max(1, cols);
    const r = Math.max(1, rows);
    if (c === this.term.cols && r === this.term.rows) return;
    this.term.resize(c, r);
    this.markDirty();
  }

  get cols(): number {
    return this.term.cols;
  }

  get rows(): number {
    return this.term.rows;
  }

  get modes(): HeadlessTerminal["modes"] {
    return this.term.modes;
  }

  /** それまでの書き込みを全部処理し終えたら解決する（テスト・測定用）。 */
  flush(): Promise<void> {
    return new Promise((resolve) => this.term.write("", resolve));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.disposers.splice(0)) d.dispose();
    this.term.dispose();
  }

  private markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    this.onDirty(this.paneId);
  }

  private onDecMode(params: (number | number[])[], set: boolean): boolean {
    for (const p of params) {
      const mode = typeof p === "number" ? p : p[0];
      if (mode === 25) this.cursorVisible = set;
      else if (mode !== undefined && mode in MOUSE_ENCODING_MODES) {
        const enc = MOUSE_ENCODING_MODES[mode]!;
        if (set) this.mouseEncoding = enc;
        else if (this.mouseEncoding === enc) this.mouseEncoding = "default";
      }
    }
    this.markDirty();
    return false;
  }

  /** DECSCUSR（`CSI Ps SP q`）：0/1 点滅ブロック・2 ブロック・3 点滅下線・4 下線・5 点滅縦棒・6 縦棒。 */
  private onCursorStyle(params: (number | number[])[]): boolean {
    const first = params[0];
    const ps = typeof first === "number" ? first : (first?.[0] ?? 0);
    if (ps > 6) return false; // xterm は 7 以上を無視する
    this.cursorStyle = ps <= 2 ? "block" : ps <= 4 ? "underline" : "bar";
    this.cursorBlink = ps === 0 || ps % 2 === 1;
    this.markDirty();
    return false;
  }

  private resetTracked(): void {
    this.cursorVisible = true;
    this.cursorStyle = "block";
    this.cursorBlink = false;
    this.mouseEncoding = "default";
  }
}
