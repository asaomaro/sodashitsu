// `@xterm/headless`・`@xterm/addon-unicode11` は CJS のバンドルで、Node の ESM ローダが named export を静的に解析できない
// （server の `terminal/Mirror.ts` の冒頭と同じ事情）。default（名前空間オブジェクト）を受けて実行時に取り出す。
import xtermHeadless from "@xterm/headless";
import xtermUnicode11 from "@xterm/addon-unicode11";
import { InlineImageFilter, parseInlineImage } from "../image/inlineImages.js";

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

/** pane の中の画像（OSC 1337 File=。サーバが Kitty graphics を作り直したもの）。 */
export interface InlinePlacement {
  id: number;
  /** 置いたときのバッファ（代替画面の画像は通常の画面に出さない）。 */
  buffer: "normal" | "alternate";
  marker: { readonly line: number; readonly isDisposed: boolean; dispose(): void };
  col: number;
  cols: number;
  rows: number;
  base64: string;
}
/** 覚えておく画像の数（base64 を持つので少なく）。 */
const MAX_IMAGES = 32;

/** `hyperlinkAt` が読む xterm の中の形（@xterm/headless 6.0.0）。 */
interface XtermCore {
  buffer?: {
    lines: {
      get(
        row: number,
      ): { loadCell(col: number, cell: unknown): { extended?: { urlId?: number } } } | undefined;
    };
    getNullCell(): unknown;
  };
  _oscLinkService?: { getLinkData(id: number): { uri?: string } | undefined };
}

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
    // 画像（サーバが作り直した OSC 1337 File=）。置いた位置と大きさを覚える（描画が [画像] の印か、対応する外側の端末へ出し直す。05 の T5）。
    this.disposers.push(parser.registerOscHandler(1337, (data) => this.onInlineImage(data)));
    this.disposers.push(this.term.onWriteParsed(() => this.markDirty()));
    this.disposers.push(this.term.onScroll(() => this.markDirty()));
  }

  /**
   * その位置（今のバッファの絶対行・セルの列）の文字に付いている OSC 8 のハイパーリンクの URI（無ければ null。M6・H09）。
   * **xterm がセルごとに持つリンクの id を読む**——リンクはそのリンクの中で書かれたセルにだけ付き、上書き（`\r` の後の書き直し・消去）で外れ、
   * 代替画面とは別のバッファで、大きさを変えた折り返し直しにもセルと一緒に動く。だから今見えている文字が、そのリンクで書かれた文字のときだけ開く
   * （始まりと終わりの位置だけを覚えると、上書き・代替画面・カーソルの移動・折り返し直しの後に見えない URL を開く。04 review ラウンド 2）。
   * 公開の型に無いので xterm の中（`_core` の `buffer.lines`・`extended.urlId`・`_oscLinkService`。@xterm/headless 6.0.0 に固定）を読む。
   * 読めない版では null（リンクを開かない側へ落とす）。
   */
  hyperlinkAt(row: number, col: number): string | null {
    try {
      const core = (this.term as unknown as { _core?: XtermCore })._core;
      const buffer = core?.buffer;
      const line = buffer?.lines.get(row);
      if (!core?._oscLinkService || !buffer || !line) return null;
      // 読み出し先は新しいセル（`getNullCell()` は xterm が共有して使う空のセルなので、そこへ書き込まない）。
      const CellData = (buffer.getNullCell() as { constructor: new () => unknown }).constructor;
      const cell = line.loadCell(col, new CellData());
      const id = cell.extended?.urlId;
      if (typeof id !== "number" || id === 0) return null;
      const uri = core._oscLinkService.getLinkData(id)?.uri;
      return typeof uri === "string" && uri !== "" ? uri : null;
    } catch {
      return null;
    }
  }

  /** SNAPSHOT：大きさを合わせ、消してから書き直す（流量制御の回復でいつでも届く）。 */
  snapshot(cols: number, rows: number, text: string): void {
    if (this.disposed) return;
    this.resize(cols, rows);
    this.term.write(`\x1bc${text}`);
  }

  output(chunk: Uint8Array): void {
    if (this.disposed) return;
    // 画像の後にブラウザの addon と同じだけ IND を足す（サーバのミラーと並びをそろえる。image/inlineImages.ts）。
    this.term.write(this.imageFilter.feed(chunk));
  }

  /** 置いた画像（新しいものが後ろ。上限を超えたら古いものから捨てる）。 */
  readonly images: InlinePlacement[] = [];
  private nextImageId = 1;
  private readonly imageFilter = new InlineImageFilter();

  private onInlineImage(data: string): boolean {
    const img = parseInlineImage(data);
    if (!img) return false;
    const buf = this.term.buffer.active;
    let marker: InlinePlacement["marker"] | undefined;
    try {
      marker = this.term.registerMarker(0) ?? undefined;
    } catch {
      marker = undefined;
    }
    if (!marker) return true;
    this.images.push({
      id: this.nextImageId++,
      buffer: buf.type,
      marker,
      col: buf.cursorX,
      cols: img.cols,
      rows: img.rows,
      base64: img.base64,
    });
    while (this.images.length > MAX_IMAGES) this.images.shift()!.marker.dispose();
    this.markDirty();
    return true;
  }

  /** 今のバッファで、まだ行が残っている画像（絶対行つき）。 */
  liveImages(): (InlinePlacement & { row: number })[] {
    const type = this.term.buffer.active.type;
    const out: (InlinePlacement & { row: number })[] = [];
    for (let i = this.images.length - 1; i >= 0; i--) {
      const im = this.images[i]!;
      if (im.marker.isDisposed) {
        this.images.splice(i, 1);
        continue;
      }
      if (im.buffer === type) out.unshift({ ...im, row: im.marker.line });
    }
    return out;
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
    // RIS（SNAPSHOT の書き直しを含む）で画像も消える。
    for (const im of this.images.splice(0)) im.marker.dispose();
  }
}
