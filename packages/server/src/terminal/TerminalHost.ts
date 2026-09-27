import { RpcError, type PaneId, type TerminalPalette } from "@wtm/protocol";
import type { PtyProcess } from "../pty/PtyBackend.js";
import type { Disposable } from "../util/Disposable.js";
import { DefaultOutputFanout, type OutputFanout } from "./OutputFanout.js";
import { XtermMirror, type InputModes, type Mirror } from "./Mirror.js";
import { windowPixels } from "./cellPixels.js";
import { KittyGraphicsTranslator, type TranslatedSegment } from "./KittyGraphics.js";

/**
 * 端末のモードに合わせて作る入力（20260926-agent-prompt-send-keys design.md「`TerminalHost.writeModal` と後回し」）。
 * `build` はミラーの flush 後のモードで呼ばれ、返した部分を `delayMs` ずつ間を置いて順に書く。
 */
export interface ModalInput {
  /**
   * flush の後・`build` の前に待つ確かめ直し（任意。20260926-agent-start の review ラウンド 1）。この間に届いた入力は後回しになるので、
   * ここで確かめた状態は他の入力に崩されないまま書き込みに進む。reject すれば何も書かずに `writeModal` を reject する。
   */
  prepare?(): Promise<void>;
  build(modes: InputModes): string[];
  delayMs: number;
}

/** pane 1 つ分の端末（architecture.md「TerminalHost」）。PTY・ミラー・配信・流量制御をまとめる（D26）。 */
export interface TerminalHost {
  readonly paneId: PaneId;
  readonly pid: number;
  readonly mirror: Mirror;
  readonly fanout: OutputFanout;
  write(input: Uint8Array | string): void;
  /**
   * 利用者の入力（INPUT フレーム）を書く（20260927-server-size-input-limits）。まだ PTY へ書けていない入力（`inputBacklog`）＋今回の長さが
   * `MAX_PENDING_INPUT_BYTES` を超えるなら、**何も書かずに** false を返す（途中まで書かない）。サーバ自身の書き込み（問い合わせへの応答）は通らない。
   * テストの偽物は持たなくてよい（持たない host には呼び出し側が `write` する＝今までどおり）。
   */
  writeInput?(input: Uint8Array | string): boolean;
  /**
   * まだ PTY へ書けていない入力の量（後回しの待ち＋PTY の待ちの、バイト数＋件数×`INPUT_CHUNK_COST_BYTES`。PTY の分が測れなければ 0）。O(1)。
   */
  inputBacklog?(): number;
  /**
   * モード付き入力を書く。書き込み待ちが上限を超えるなら何も書かずに `input_queue_full` の RpcError で reject する。書き終えるまで（flush から最後の部分まで）に届いた `write`・`writeModal` は後回しにし、
   * 終わったら届いた順に書く。終了（dispose・PTY の終了）したら reject する。
   */
  writeModal(input: ModalInput): Promise<void>;
  resize(cols: number, rows: number): void;
  lastOutputAt(): number;
  onExit(cb: (code: number) => void): Disposable;
  dispose(): void;
  /**
   * 更新時の引き継ぎ（20260926-live-handoff）の前に読み取りを止め、ミラーへの書き込みを待ってから、渡すもの（master の fd・大きさ・画面）を返す。
   * 渡せない端末（Windows・fd を持たない PTY・止められない）は undefined（何も変えない）。
   */
  holdForHandoff?(): Promise<HandoffHold | undefined>;
  /** この端末の PTY の master の fd（引き継ぎで渡せる PTY だけ。捨てた後は undefined）。 */
  handoffFd?(): number | undefined;
  /** `holdForHandoff` を戻す（引き継ぎをやめたとき）。 */
  releaseHandoffHold?(): void;
  /** 大きさを 1 行（小さければ 1 桁）減らして戻し、SIGWINCH で TUI に描き直させる（引き継いだ直後。herdr の nudge）。ミラーは変えない。 */
  nudgeRedraw?(delayMs?: number): void;
}

/** `holdForHandoff` が返す、引き継ぎで渡すもの。 */
export interface HandoffHold {
  fd: number;
  cols: number;
  rows: number;
  /** ミラーの `historyAnsi()`（通常の画面とスクロールバック）。 */
  screen: string;
}

const PAUSE_THRESHOLD_BYTES = 1024 * 1024; // 1MB（design「流量制御」）
/**
 * pane ごとの、まだ PTY へ書けていない利用者の入力の上限（20260927-server-size-input-limits の decisions D2）。1 通の INPUT の上限（1 MiB）の 16 倍（1 件ごとに `INPUT_CHUNK_COST_BYTES` を上乗せするので、1 MiB の INPUT は 15 通まで）——
 * 数 MB の貼り付け・流し込みは読みの遅いプログラムにも届き、読まない pane（raw モードで固まった TUI 等）1 つあたりのメモリはここで止まる。
 */
export const MAX_PENDING_INPUT_BYTES = 16 * 1024 * 1024;
/**
 * 待ちの 1 件あたりに上乗せして数えるバイト数（decisions D9。node-pty の待ちの 1 件は中身とは別に約 200 バイトを使う）。1 バイトずつの大量の入力でも、
 * 待ちは約 6.5 万件（実メモリ約 13 MB）で止まる。行ごとに 1 通送る数 MB の流し込み（80 字×3.7 万通≒12.5 MB）は通る。
 */
export const INPUT_CHUNK_COST_BYTES = 256;
/** `nudgeRedraw` の、減らしてから戻すまでの間（ms）。 */
const NUDGE_DELAY_MS = 100;
const enc = new TextEncoder();

interface ModalJob {
  input: ModalInput;
  resolve: () => void;
  reject: (err: Error) => void;
}
type QueuedInput = { kind: "raw"; data: Uint8Array | string } | { kind: "modal"; job: ModalJob };

export class DefaultTerminalHost implements TerminalHost {
  readonly mirror: Mirror;
  readonly fanout: OutputFanout;
  private lastOutput = Date.now();
  private readonly exitListeners = new Set<(code: number) => void>();
  /** 出力の Kitty graphics を読み分ける（20260926-kitty-graphics design「4.」）。 */
  private readonly kitty = new KittyGraphicsTranslator();
  private readonly disposables: Disposable[] = [];
  private paused = false;
  /** 引き継ぎのために読み取りを止めている（流量制御の `onDrained` で再開しない）。 */
  private heldForHandoff = false;
  private disposed = false;
  private cols: number;
  private rows: number;
  /** モード付き入力を処理中（この間の入力は `queue` へ）。 */
  private busy = false;
  private inputClosed = false;
  private activeModal: ModalJob | null = null;
  private readonly queue: QueuedInput[] = [];
  /** `queue` の素の入力のバイト数と件数（`inputBacklog` を O(1) で出すため。decisions D9）。 */
  private queuedRawBytes = 0;
  private queuedRawCount = 0;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeDelay: (() => void) | null = null;

  constructor(
    readonly paneId: PaneId,
    private readonly pty: PtyProcess,
    cols: number,
    rows: number,
    scrollbackLines: number,
    /** 色の問い合わせに答える配色（20260921-theme-settings の design D6）。省けば今までどおり dracula。 */
    palette?: () => TerminalPalette,
    /** 明暗の問い合わせに答える appearance（20260924-dark-mode-report）。省けば今までどおり dark（dracula）。 */
    appearance?: () => "light" | "dark",
  ) {
    this.cols = cols;
    this.rows = rows;
    this.mirror = new XtermMirror(cols, rows, scrollbackLines, palette, appearance);
    this.fanout = new DefaultOutputFanout(paneId, this.mirror);

    // PTY の出力は、同じ呼び出しの中で Mirror と OutputFanout の両方に渡す（design「流量制御と文字列の変換」）。
    // Kitty graphics の画像は、ブラウザへは iTerm2 形式の画像、ミラーへは同じだけのカーソル移動として渡し、応答は PTY へ返す
    // （20260926-kitty-graphics design「4.」）。画像を含まない出力は元の文字列のまま両方へ渡る。
    this.disposables.push(
      pty.onData((chunk) => {
        this.lastOutput = Date.now();
        for (const seg of this.kitty.process(chunk)) this.deliver(seg);
        if (!this.paused && this.mirror.pendingBytes() > PAUSE_THRESHOLD_BYTES) {
          this.paused = true;
          this.pty.pause();
        }
      }),
    );
    this.disposables.push(
      this.mirror.onDrained(() => {
        if (this.paused) {
          this.paused = false;
          if (!this.heldForHandoff) this.pty.resume();
        }
        this.fanout.retryStale();
      }),
    );
    // 端末からの問い合わせへの応答は、ミラーが作ったものを PTY へ戻す（D17）。
    this.disposables.push(this.mirror.onResponse((data) => this.pty.write(data)));
    this.disposables.push(
      pty.onExit((e) => {
        this.closeInput();
        for (const fn of [...this.exitListeners]) fn(e.exitCode);
      }),
    );
  }

  private deliver(seg: TranslatedSegment): void {
    switch (seg.kind) {
      case "text":
        this.mirror.write(seg.text);
        this.fanout.push(enc.encode(seg.text));
        return;
      case "image":
        this.mirror.write(seg.mirror);
        this.fanout.push(enc.encode(seg.client));
        return;
      case "response":
        // ミラーがそれより前の出力を処理し終えた後に返す（同じ出力で先に来た問い合わせへのミラーの応答を追い越さない。decisions D6）。
        this.mirror.write("", () => {
          if (this.disposed) return;
          try {
            this.pty.write(seg.data);
          } catch {
            // 終了した PTY への書き込み。ミラーの書き込みのコールバックの中なので投げない（投げるとミラーの処理が止まる）。
          }
        });
        return;
    }
  }

  get pid(): number {
    return this.pty.pid;
  }

  writeInput(input: Uint8Array | string): boolean {
    if (this.inputClosed) {
      this.write(input); // 終了した端末は今までどおり（PTY が捨てる）。知らせない
      return true;
    }
    const len = byteLengthOf(input);
    if (len > 0 && this.inputBacklog() + len + INPUT_CHUNK_COST_BYTES > MAX_PENDING_INPUT_BYTES)
      return false;
    this.write(input);
    return true;
  }

  inputBacklog(): number {
    const ptyBytes = this.pty.pendingWriteBytes?.() ?? 0;
    const ptyChunks = this.pty.pendingWriteChunks?.() ?? 0;
    return (
      this.queuedRawBytes + ptyBytes + (this.queuedRawCount + ptyChunks) * INPUT_CHUNK_COST_BYTES
    );
  }

  write(input: Uint8Array | string): void {
    if (this.busy) {
      this.queue.push({ kind: "raw", data: input });
      this.queuedRawBytes += byteLengthOf(input);
      this.queuedRawCount += 1;
      return;
    }
    this.pty.write(input);
  }

  writeModal(input: ModalInput): Promise<void> {
    if (this.inputClosed) return Promise.reject(new Error("terminal closed"));
    return new Promise<void>((resolve, reject) => {
      const job: ModalJob = { input, resolve, reject };
      if (this.busy) this.queue.push({ kind: "modal", job });
      else void this.runModal(job);
    });
  }

  private async runModal(job: ModalJob): Promise<void> {
    this.busy = true;
    this.activeModal = job;
    try {
      await this.mirror.flush();
      if (this.activeModal !== job) return; // 待っている間に終了した（closeInput が reject 済み）
      if (job.input.prepare) {
        await job.input.prepare();
        if (this.activeModal !== job) return;
      }
      const parts = job.input.build(this.mirror.inputModes());
      // 読まない pane に積み続けない（20260927-server-size-input-limits）。何も書かずに断る（途中まで書くと Enter の無い入力が残る）。
      const total = parts.reduce((n, p) => n + byteLengthOf(p), 0);
      const backlog = this.inputBacklog();
      if (
        total > 0 &&
        backlog + total + parts.length * INPUT_CHUNK_COST_BYTES > MAX_PENDING_INPUT_BYTES
      ) {
        throw new RpcError(
          "input_queue_full",
          `pane ${this.paneId} is not reading input (${backlog} bytes pending)`,
        );
      }
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          await this.delay(job.input.delayMs);
          if (this.activeModal !== job) return;
        }
        this.pty.write(parts[i]!);
      }
      this.activeModal = null;
      job.resolve();
    } catch (err) {
      if (this.activeModal !== job) return;
      this.activeModal = null;
      job.reject(err instanceof Error ? err : new Error(String(err)));
    }
    this.drainQueue();
  }

  private delay(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const wake = (): void => {
        this.delayTimer = null;
        this.wakeDelay = null;
        resolve();
      };
      this.wakeDelay = wake;
      this.delayTimer = setTimeout(wake, ms);
    });
  }

  /** 後回しにした入力を届いた順に書く。次のモード付き入力に当たったらそれを始めて止まる。 */
  private drainQueue(): void {
    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      if (next.kind === "raw") {
        this.queuedRawBytes -= byteLengthOf(next.data);
        this.queuedRawCount -= 1;
      }
      if (next.kind === "modal") {
        void this.runModal(next.job);
        return;
      }
      try {
        this.pty.write(next.data);
      } catch {
        // 想定外の例外（PTY の終了は closeInput が先に queue を空にする）。ここで止めると busy が戻らず、
        // 以後の入力が全部溜まったままになるので、後ろの入力の処理を続ける。
      }
    }
    this.busy = false;
  }

  /** 終了（dispose・PTY の終了）。処理中と後回しのモード付き入力を reject し、後回しの素の入力は捨てる。 */
  private closeInput(): void {
    if (this.inputClosed) return;
    this.inputClosed = true;
    const err = new Error("terminal closed");
    const active = this.activeModal;
    this.activeModal = null;
    active?.reject(err);
    for (const q of this.queue.splice(0)) {
      if (q.kind === "modal") q.job.reject(err);
    }
    this.queuedRawBytes = 0;
    this.queuedRawCount = 0;
    this.busy = false;
    if (this.delayTimer !== null) clearTimeout(this.delayTimer);
    this.wakeDelay?.();
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    // 画素の大きさも伝える（Unix の `ws_xpixel`/`ws_ypixel`。画像を出すツールが読む。20260926-kitty-graphics design「5.」・decisions D3・D9）。
    this.pty.resize(cols, rows, windowPixels(cols, rows));
    this.mirror.resize(cols, rows);
  }

  async holdForHandoff(): Promise<HandoffHold | undefined> {
    if (this.disposed || this.heldForHandoff) return undefined;
    const fd = this.pty.handoffFd?.();
    if (fd === undefined || this.pty.holdReading === undefined) return undefined;
    this.heldForHandoff = true;
    // 読み取り済みの分は `holdReading` の中で onData（→ ミラー）へ流し切られる。
    if (!this.pty.holdReading()) {
      this.heldForHandoff = false;
      return undefined;
    }
    await this.mirror.flush();
    // 待っている間に pane が終わった（捨てられた）なら、fd は閉じられている——渡さない。
    if (this.disposed) return undefined;
    return { fd, cols: this.cols, rows: this.rows, screen: this.mirror.historyAnsi() };
  }

  handoffFd(): number | undefined {
    return this.disposed ? undefined : this.pty.handoffFd?.();
  }

  releaseHandoffHold(): void {
    if (!this.heldForHandoff) return;
    this.heldForHandoff = false;
    if (this.disposed) return;
    this.pty.releaseReading?.();
    // 流量制御で止めていたなら、そのまま（`onDrained` が再開する）。
    if (!this.paused) this.pty.resume();
  }

  nudgeRedraw(delayMs = NUDGE_DELAY_MS): void {
    if (this.disposed) return;
    const { cols, rows } = this;
    if (rows > 2) this.pty.resize(cols, rows - 1, windowPixels(cols, rows - 1));
    else if (cols > 4) this.pty.resize(cols - 1, rows, windowPixels(cols - 1, rows));
    else return;
    // 同じ瞬間に戻すと SIGWINCH が 1 つに畳まれ、アプリが読む大きさが変わっていないので描き直さないことがある（Node の tty の
    // 'resize'・ncurses の KEY_RESIZE は大きさが変わったときだけ）。少し間を置いて戻す。その間に大きさが変わった（クライアントが繋いだ）なら戻さない。
    const timer = setTimeout(() => {
      if (this.disposed || this.cols !== cols || this.rows !== rows) return;
      this.pty.resize(cols, rows, windowPixels(cols, rows));
    }, delayMs);
    timer.unref?.();
  }

  lastOutputAt(): number {
    return this.lastOutput;
  }

  onExit(cb: (code: number) => void): Disposable {
    this.exitListeners.add(cb);
    return { dispose: () => this.exitListeners.delete(cb) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closeInput();
    for (const d of this.disposables) d.dispose();
    this.kitty.dispose();
    this.mirror.dispose();
    try {
      this.pty.kill();
    } catch {
      // 既に終了しているプロセスへの kill は無視する。
    }
  }
}

/** 入力のバイト数（文字列は UTF-8 のバイト数）。 */
function byteLengthOf(input: Uint8Array | string): number {
  return typeof input === "string" ? Buffer.byteLength(input, "utf8") : input.byteLength;
}
