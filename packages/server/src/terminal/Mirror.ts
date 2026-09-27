// `@xterm/headless`・`@xterm/addon-serialize` は minify された CJS バンドルで、Node の ESM ローダ
// （cjs-module-lexer）が named export を静的解析できない（`import { Terminal } from "..."` が
// 実行時に失敗する。vitest/esbuild の変換では見逃していたが、`node dist/*.js` の直接実行で顕在化した）。
// default（名前空間オブジェクト）を受けて実行時に取り出す。
import xtermHeadless from "@xterm/headless";
import xtermAddonSerialize from "@xterm/addon-serialize";
import { win32 } from "node:path";
import { DEFAULT_THEME, DEFAULT_THEME_NAME, THEME_APPEARANCE, type TerminalPalette } from "@wtm/protocol";
import type { Disposable } from "../util/Disposable.js";
import { CELL_PIXELS, windowPixels } from "./cellPixels.js";

const { Terminal } = xtermHeadless;
const { SerializeAddon } = xtermAddonSerialize;
type Terminal = InstanceType<typeof xtermHeadless.Terminal>;
type SerializeAddon = InstanceType<typeof xtermAddonSerialize.SerializeAddon>;

export interface MirrorSnapshot {
  cols: number;
  rows: number;
  text: string;
}

/** 入力の組み立てに要る端末のモード（20260926-agent-prompt-send-keys）。 */
export interface InputModes {
  /** `CSI ? 2004 h`。有効なら貼り付けを `ESC[200~`…`ESC[201~` で包む。 */
  bracketedPaste: boolean;
  /** DECCKM（`CSI ? 1 h`）。有効なら矢印キーを `ESC O A` 等で送る。 */
  applicationCursorKeys: boolean;
}

/**
 * サーバ側の端末エミュレータの包み（architecture.md「Mirror」）。
 * `@xterm/headless` 6.0.0 ＋ `@xterm/addon-serialize` 0.14.0（design E1・E2）。
 */
export interface Mirror {
  write(chunk: string, done?: () => void): void;
  pendingBytes(): number;
  onDrained(cb: () => void): Disposable;
  serialize(scrollbackLines: number): MirrorSnapshot;
  bottomLines(n: number): string[];
  /**
   * 通常バッファの全行（スクロールバック＋画面）の平文（20260926-edit-scrollback）。折り返しで分かれた行は 1 行に戻し、
   * 各行の右端の空白と末尾の空行を落とす。代替画面（vim・less 等）の中でも通常バッファを読む（履歴はそこにしか無い）。
   */
  plainText(): string;
  /**
   * 画面履歴として保存する内容（20260926-screen-history-replay）。通常バッファの先頭から最後の空でない行までを、色・属性つきの ANSI で返す
   * （空でない行が無ければ ""）。代替画面（vim・less 等）の中でも通常バッファを読む。端末のモードと最後のカーソルの位置合わせは含めない
   * ——古いプロセスは戻らないので、流し直す先（新しいシェル）の端末のモードを変えない（design「`Mirror.historyAnsi()`」）。
   */
  historyAnsi(): string;
  title(): string;
  progress(): string | null;
  cwdHint(): string | null;
  onResponse(cb: (data: string) => void): Disposable;
  resize(cols: number, rows: number): void;
  dispose(): void;
  /**
   * 20260924-dark-mode-report。継続通知（`CSI ? 2031 h` で要求される）が有効な pane へ、
   * appearance が前回伝えた値と変わっていれば通知する。無効なら・変わっていなければ何もしない。
   */
  notifyAppearanceMayHaveChanged(): void;
  /** 今の入力のモード（20260926-agent-prompt-send-keys）。書いた直後の出力は `flush()` を待つまで反映されない。 */
  inputModes(): InputModes;
  /** それまでに `write` した出力をエミュレータが処理し終えたら解決する（20260926-agent-prompt-send-keys）。 */
  flush(): Promise<void>;
}

const DRAIN_LOW_WATERMARK = 256 * 1024; // 256KB（design「流量制御」）

export class XtermMirror implements Mirror {
  private readonly term: Terminal;
  private readonly serializeAddon: SerializeAddon;
  private pending = 0;
  private readonly drainListeners = new Set<() => void>();
  private readonly responseListeners = new Set<(data: string) => void>();
  private latestTitle = "";
  private latestProgress: string | null = null;
  private latestCwd: string | null = null;
  private readonly disposables: Disposable[] = [];
  /** 20260924-dark-mode-report。`CSI ? 2031 h`/`l` で有効・無効を切り替える。 */
  private mode2031Enabled = false;
  /** 最後に問い合わせ・通知で伝えた明暗（変わったときだけ通知するための基準点）。 */
  private lastReportedAppearance: "light" | "dark" | null = null;

  /**
   * `palette` は色の問い合わせに答える配色を返す関数（20260921-theme-settings の design D6）。**答える瞬間に呼ぶ**——その pane を操作している
   * ブラウザがテーマを変えたら次の答えから変わる。既定は今までの答え（dracula）。**投げてはならない**——xterm headless は OSC のハンドラを
   * try/catch で囲わないので、投げると書き込みの列が止まり（PTY は pause されたまま戻らない）、サーバも落ちる（`answerPaletteFor` は投げない）。
   * `appearance` は同じ形で明暗を返す関数（20260924-dark-mode-report。`answerAppearanceFor`）。
   */
  constructor(
    cols: number,
    rows: number,
    scrollback: number,
    private readonly palette: () => TerminalPalette = () => DEFAULT_THEME,
    private readonly appearance: () => "light" | "dark" = () => THEME_APPEARANCE[DEFAULT_THEME_NAME],
  ) {
    // `windowOptions` の 2 つは画素の大きさの問い合わせ（CSI 14 t・CSI 16 t）を下の自前のハンドラへ通すため（20260926-kitty-graphics）。
    // xterm.js は公開の `registerCsiHandler({ final: "t" })` のハンドラを、その Ps の `windowOptions` が無効なら呼ばずに握りつぶす
    // （headless 6.0.0 の `registerCsiHandler` の実装）。headless 自身は画素を持たないので、有効にしても自分では答えない。
    this.term = new Terminal({
      cols,
      rows,
      scrollback,
      allowProposedApi: true,
      windowOptions: { getWinSizePixels: true, getCellSizePixels: true },
    });
    this.serializeAddon = new SerializeAddon();
    this.term.loadAddon(this.serializeAddon);

    // 端末アプリからの問い合わせへの応答（DA1・DA2・CPR・DECRQM・DECRQSS）は headless が標準で onData に出す（E1）。
    this.disposables.push(this.term.onData((data) => this.emitResponse(data)));
    this.disposables.push(this.term.onTitleChange((title) => (this.latestTitle = sanitizeOsc(title))));

    // 色の問い合わせ（OSC 4/10/11/12）には headless は応答しないので、`palette()` の配色で応答する（D17・20260921-theme-settings の design D6）。
    this.disposables.push(this.term.parser.registerOscHandler(10, (data) => this.handleColorQuery(data, "foreground", 10)));
    this.disposables.push(this.term.parser.registerOscHandler(11, (data) => this.handleColorQuery(data, "background", 11)));
    this.disposables.push(this.term.parser.registerOscHandler(12, (data) => this.handleColorQuery(data, "cursor", 12)));
    this.disposables.push(this.term.parser.registerOscHandler(4, (data) => this.handlePaletteQuery(data)));

    // OSC 9;4 は進捗（Windows Terminal/ConEmu 方式）。design「OSC の取得」。
    this.disposables.push(
      this.term.parser.registerOscHandler(9, (data) => {
        if (data.startsWith("4;")) {
          this.latestProgress = data;
          return true;
        }
        return false; // 通常の通知（OSC 9）は関与しない
      }),
    );
    // OSC 7 は cwd（file://host/path）。design「OSC の取得」。
    this.disposables.push(
      this.term.parser.registerOscHandler(7, (data) => {
        this.latestCwd = parseOsc7(data);
        return true;
      }),
    );

    // 明暗の問い合わせ・継続通知（CSI ?996n・CSI ?2031h/l。20260924-dark-mode-report。
    // design「振る舞いの詳細」）。**常に false を返して委譲する**——CSI は複数の Pm を束ねて
    // 送れる（例 `CSI ?2031;1049h`）うえ、ハンドラの登録は LIFO で `true` を返すと連鎖が
    // そこで止まる。単純に「対象 Ps なら true」にすると、束ねられた他のモード（例 1049＝
    // オルタネートスクリーン）が黙って無効化される（review round1 must で発覚・実証済み）。
    // xterm 内蔵の `setModePrivate`/`resetModePrivate` は未知のモード番号を無条件で無視する
    // だけなので、false を返して委譲しても 996/2031 の処理自体は失われない。
    this.disposables.push(this.term.parser.registerCsiHandler({ prefix: "?", final: "n" }, (params) => this.handleAppearanceQuery(params)));
    this.disposables.push(this.term.parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => this.handleMode2031(params, true)));
    this.disposables.push(this.term.parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => this.handleMode2031(params, false)));
    // 画素の大きさの問い合わせ（CSI 14 t・CSI 16 t。20260926-kitty-graphics design「5.」）。サーバは基準のセルの大きさ（decisions D3）で答える
    // （画像を出すツールが画像の大きさを決めるのに使う）。他の `CSI … t`（窓の操作等）は false で xterm.js に委ねる。
    this.disposables.push(this.term.parser.registerCsiHandler({ final: "t" }, (params) => this.handlePixelSizeQuery(params)));
    // RIS（端末の完全リセット）で継続通知の登録もリセットする（herdr と同じ挙動。design「振る舞いの詳細」手順6）。
    // xterm 自身の RIS 処理は妨げない（false を返して委譲する）。
    this.disposables.push(
      this.term.parser.registerEscHandler({ final: "c" }, () => {
        this.mode2031Enabled = false;
        return false;
      }),
    );
  }

  write(chunk: string, done?: () => void): void {
    this.pending += Buffer.byteLength(chunk, "utf8");
    this.term.write(chunk, () => {
      this.pending -= Buffer.byteLength(chunk, "utf8");
      if (this.pending < 0) this.pending = 0;
      if (this.pending <= DRAIN_LOW_WATERMARK) {
        for (const fn of [...this.drainListeners]) fn();
      }
      done?.();
    });
  }

  pendingBytes(): number {
    return this.pending;
  }

  inputModes(): InputModes {
    return {
      bracketedPaste: this.term.modes.bracketedPasteMode,
      applicationCursorKeys: this.term.modes.applicationCursorKeysMode,
    };
  }

  flush(): Promise<void> {
    // 空の書き込みのコールバックは、それより前の書き込みを全部処理した後に呼ばれる（research F1 の実測）。
    return new Promise((resolve) => this.term.write("", resolve));
  }

  onDrained(cb: () => void): Disposable {
    this.drainListeners.add(cb);
    return { dispose: () => this.drainListeners.delete(cb) };
  }

  serialize(scrollbackLines: number): MirrorSnapshot {
    const text = this.serializeAddon.serialize({ scrollback: scrollbackLines });
    return { cols: this.term.cols, rows: this.term.rows, text };
  }

  bottomLines(n: number): string[] {
    const buf = this.term.buffer.active;
    const out: string[] = [];
    const start = Math.max(0, buf.baseY + this.term.rows - n);
    for (let y = start; y < buf.baseY + this.term.rows; y++) {
      const line = buf.getLine(y);
      if (line) out.push(line.translateToString(true));
    }
    return out;
  }

  plainText(): string {
    const buf = this.term.buffer.normal;
    const lines: string[] = [];
    let current = "";
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const continues = buf.getLine(y + 1)?.isWrapped === true;
      current += line.translateToString(true); // 書いた空白は残り、書いていないセルだけ落ちる
      if (!continues) {
        lines.push(current.replace(/ +$/, ""));
        current = "";
      }
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
  }

  historyAnsi(): string {
    const buf = this.term.buffer.normal;
    let last = -1;
    for (let y = buf.length - 1; y >= 0; y--) {
      if ((buf.getLine(y)?.translateToString(true) ?? "") !== "") {
        last = y;
        break;
      }
    }
    if (last < 0) return "";
    // `range` を渡すと通常バッファの指定行だけを、最後のカーソルの位置合わせ無しで出す（research F2）。
    return this.serializeAddon.serialize({ range: { start: 0, end: last }, excludeAltBuffer: true, excludeModes: true });
  }

  title(): string {
    return this.latestTitle;
  }
  progress(): string | null {
    return this.latestProgress;
  }
  cwdHint(): string | null {
    return this.latestCwd;
  }

  onResponse(cb: (data: string) => void): Disposable {
    this.responseListeners.add(cb);
    return { dispose: () => this.responseListeners.delete(cb) };
  }

  notifyAppearanceMayHaveChanged(): void {
    if (!this.mode2031Enabled) return;
    const next = this.appearance();
    if (next === this.lastReportedAppearance) return;
    this.lastReportedAppearance = next;
    this.emitResponse(appearanceReport(next));
  }

  resize(cols: number, rows: number): void {
    this.term.resize(Math.max(1, cols), Math.max(1, rows));
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.term.dispose();
  }

  private emitResponse(data: string): void {
    for (const fn of [...this.responseListeners]) fn(data);
  }

  private handlePixelSizeQuery(params: (number | number[])[]): boolean {
    if (params[0] === 14) {
      const px = windowPixels(this.term.cols, this.term.rows);
      this.emitResponse(`\x1b[4;${px.height};${px.width}t`);
      return true;
    }
    if (params[0] === 16) {
      this.emitResponse(`\x1b[6;${CELL_PIXELS.height};${CELL_PIXELS.width}t`);
      return true;
    }
    return false;
  }

  private handleColorQuery(data: string, key: "foreground" | "background" | "cursor", oscNumber: 10 | 11 | 12): boolean {
    if (data !== "?") return false; // 問い合わせ以外（実際に色を設定する OSC）は関与しない
    this.emitResponse(`\x1b]${oscNumber};${hexToXtermRgb(this.palette()[key])}\x07`);
    return true;
  }

  private handlePaletteQuery(data: string): boolean {
    // 形式: "<idx>;?"（複数指定 "<idx>;?;<idx2>;?..." も許容する）
    const parts = data.split(";");
    let ansi: TerminalPalette["ansi"] | undefined; // 最初の問い合わせで 1 回だけ引く（設定の OSC 4 では引かない。1 回の中で配色を揃える）
    let matched = false;
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const idxStr = parts[i];
      const query = parts[i + 1];
      if (query !== "?" || idxStr === undefined) continue;
      const idx = Number(idxStr);
      ansi ??= this.palette().ansi;
      if (!Number.isInteger(idx) || idx < 0 || idx >= ansi.length) continue;
      const color = ansi[idx];
      if (color === undefined) continue;
      this.emitResponse(`\x1b]4;${idx};${hexToXtermRgb(color)}\x07`);
      matched = true;
    }
    return matched;
  }

  /**
   * `CSI ? 996 n`（20260924-dark-mode-report）。他の Pm と束ねられていてもよいよう `params`
   * 全体を走査する。**常に false を返して委譲する**（review round1 must。上の登録箇所の
   * コメント参照）——ここで true を返すと、同じ CSI に束ねられた他の私用モードの処理を
   * 止めてしまう。
   */
  private handleAppearanceQuery(params: (number | number[])[]): boolean {
    if (params.includes(996)) {
      const current = this.appearance();
      this.lastReportedAppearance = current; // 問い合わせでも「最後に伝えた値」を更新する（設計方針）
      this.emitResponse(appearanceReport(current));
    }
    return false;
  }

  /**
   * `CSI ? 2031 h`/`l`（20260924-dark-mode-report）。他の Pm と束ねられていてもよいよう
   * `params` 全体を走査する。**常に false を返して委譲する**（review round1 must。上の登録
   * 箇所のコメント参照）。
   */
  private handleMode2031(params: (number | number[])[], enable: boolean): boolean {
    if (params.includes(2031)) {
      this.mode2031Enabled = enable;
      // 有効化した時点の値を基準にする（通知はしない。design「設計方針」。herdr と同じ）——
      // これが無いと、事前に CSI ?996n で問い合わせていない場合に `lastReportedAppearance` が
      // null のままで、次の notifyAppearanceMayHaveChanged が「変わった」と誤検知してしまう
      // （coding 中にテストで発見。decisions.md D1）。
      if (enable) this.lastReportedAppearance = this.appearance();
    }
    return false;
  }
}

/** `CSI ? 997 ; 1|2 n`（1=dark、2=light。20260924-dark-mode-report）。 */
function appearanceReport(a: "light" | "dark"): string {
  return a === "dark" ? "\x1b[?997;1n" : "\x1b[?997;2n";
}

/** `#RRGGBB` → `rgb:RRRR/GGGG/BBBB`（xterm の色応答の慣習。各バイトを 16 bit に複製する）。 */
function hexToXtermRgb(hex: string): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return "rgb:0000/0000/0000";
  const [, r, g, b] = m;
  return `rgb:${r}${r}/${g}${g}/${b}${b}`;
}

/**
 * OSC 7 の `file://host/path`（または `file:///path`）から、この端末上のパスを取り出す。
 * サーバが Windows なら `file://host/C:/Users/u` の pathname（`/C:/Users/u`）を `C:\Users\u` に直す——そのままでは
 * 使えない場所になり、新しく開く場所の「引き継ぐ」も `Pane.cwd` も追従しない（20260921-new-terminal-cwd の独立点検）。
 */
export function parseOsc7(data: string, platform: NodeJS.Platform = process.platform): string | null {
  try {
    const url = new URL(data);
    if (url.protocol !== "file:") return null;
    const path = decodeURIComponent(url.pathname);
    if (platform === "win32" && /^\/[A-Za-z]:(\/|$)/.test(path)) {
      return win32.normalize(`${path.slice(1, 3)}\\${path.slice(4)}`);
    }
    return path;
  } catch {
    return null;
  }
}

/** タイトルに紛れ込みうる制御文字を落とす（design「安全化済み」）。 */
function sanitizeOsc(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
