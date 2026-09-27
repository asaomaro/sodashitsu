import * as nodePty from "node-pty";
import type { Disposable, PtyBackend, PtyProcess, PtySpawnOptions } from "./PtyBackend.js";
import { AdoptedPtyProcess } from "./AdoptedPtyProcess.js";
import { type HandleBackedStream, restartHandleReading, stopHandleReading } from "./socketReading.js";

/**
 * node-pty 1.2.0-beta.15 での実装（research.md F8.1）。
 * Windows では既定で同梱の ConPTY（`useConptyDll: true`）を使う。古い system ConPTY は
 * Kitty keyboard のシーケンスを落とすため（`[H]windows-beta.mdx:106-108`）。
 * `WTM_WINDOWS_CONPTY=system` で OS 付属の ConPTY に戻せる（herdr の `HERDR_WINDOWS_CONPTY=system` と同じ考え方）。
 */
export class NodePtyBackend implements PtyBackend {
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  spawn(opts: PtySpawnOptions): PtyProcess {
    const isWindows = process.platform === "win32";
    const useConptyDll = isWindows && this.env["WTM_WINDOWS_CONPTY"] !== "system";
    const pty = nodePty.spawn(opts.shell, opts.args, {
      name: "xterm-256color",
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: opts.env,
      ...(isWindows ? { useConptyDll } : {}),
    });
    return new NodePtyProcess(pty);
  }

  /** execve をまたいで引き継いだ master（20260926-live-handoff）。Windows（ConPTY）には fd が無いので使えない。 */
  adopt(opts: { fd: number; pid: number }): PtyProcess {
    if (process.platform === "win32") throw new Error("adopting a PTY is not supported on Windows");
    return new AdoptedPtyProcess(opts.fd, opts.pid);
  }
}

class NodePtyProcess implements PtyProcess {
  /** node-pty に渡した書き込みの長さ（同じ順。Unix の待ちの量を O(1) で出すため。decisions D9）。 */
  private readonly sent = new SentLengths();

  constructor(private readonly pty: nodePty.IPty) {}

  get pid(): number {
    return this.pty.pid;
  }

  onData(cb: (chunk: string) => void): Disposable {
    return this.pty.onData(cb);
  }

  onExit(cb: (e: { exitCode: number; signal?: number }) => void): Disposable {
    return this.pty.onExit(cb);
  }

  write(data: string | Uint8Array): void {
    // node-pty の write は string | Buffer を受ける。Uint8Array は Buffer のビューにして渡す。
    this.pty.write(typeof data === "string" ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    // node-pty（Unix）は UTF-8 に直した長さの 1 件を待ちに積む（空なら積まない）。同じ長さを覚える。
    if (process.platform !== "win32") {
      this.sent.push(typeof data === "string" ? Buffer.byteLength(data, "utf8") : data.byteLength);
      // 上限の判定を通らない書き込み（問い合わせへの応答等）だけが続く pane でも覚えた長さが際限なく増えないよう、時々詰め直す（T11 の点検）。
      if (this.sent.remembered() > SENT_RECONCILE_EVERY) this.pendingWriteBytes();
    }
  }

  /**
   * まだ書けていない入力（20260927-server-size-input-limits の decisions D4）。node-pty は書き終わりを公開の API で知らせないので内部を読む:
   * Unix は `UnixTerminal._writeStream._writeQueue`（`{ buffer, offset }[]`。`EAGAIN` の間ここに残る）、Windows は `_agent.inSocket`（`net.Socket`）の
   * `writableLength`。形が違えば（版の更新）undefined＝測れない。版は `package.json` で固定し、Unix の形は統合テストが確かめる。
   * Windows で ready になる前の書き込みは `_deferreds`（関数の包み）に積まれ、ここには数えない（起動直後の短い間だけ。少なめに数える＝捨てない側）。
   */
  pendingWriteBytes(): number | undefined {
    try {
      if (process.platform === "win32") {
        const len = (
          this.pty as unknown as { _agent?: { inSocket?: { writableLength?: unknown } } }
        )._agent?.inSocket?.writableLength;
        return typeof len === "number" && len >= 0 ? len : undefined;
      }
      const queue = this.unixQueue();
      if (!Array.isArray(queue)) return undefined;
      // 償却 O(1)：覚えた長さと待ちの件数の差で書き終えた先頭を捨て、先頭の書きかけ（offset）を引く。合わなければ全件を数える（想定外の経路）。
      const head = (queue[0] as { offset?: unknown } | undefined)?.offset;
      const fast = this.sent.reconcile(queue.length, typeof head === "number" ? head : 0);
      return fast ?? sumPendingChunks(queue);
    } catch {
      return undefined;
    }
  }

  /**
   * 待ちの件数。O(1)。Unix は node-pty の待ちの件数。Windows は `_agent.inSocket`（`net.Socket`）の内部の書き込み待ちの件数
   * （`_writableState.buffered.length - bufferedIndex`、書いている途中の 1 件を足す。実機では確かめていない。形が違えば undefined＝0 とみなす）。
   */
  pendingWriteChunks(): number | undefined {
    if (process.platform === "win32") return windowsSocketChunks(this.pty);
    try {
      const queue = this.unixQueue();
      return Array.isArray(queue) ? queue.length : undefined;
    } catch {
      return undefined;
    }
  }

  private unixQueue(): unknown {
    return (this.pty as unknown as { _writeStream?: { _writeQueue?: unknown } })._writeStream
      ?._writeQueue;
  }

  resize(cols: number, rows: number, pixels?: { width: number; height: number }): void {
    // ConPTY は 0 を渡すと落ちることがある（node-pty #877）ので、下限 1 に丸める。画素は node-pty が Unix で `ws_xpixel`/`ws_ypixel` に入れる
    // （Windows は無視する。node-pty の型定義 `resize(columns, rows, pixelSize?)`）。
    if (pixels) this.pty.resize(Math.max(1, cols), Math.max(1, rows), pixels);
    else this.pty.resize(Math.max(1, cols), Math.max(1, rows));
  }

  pause(): void {
    this.pty.pause();
  }

  resume(): void {
    this.pty.resume();
  }

  kill(): void {
    this.pty.kill();
  }

  /** node-pty（Unix）の master の fd（`UnixTerminal.fd`。close-on-exec が付いていないので execve の後も残る。research F2.3）。 */
  handoffFd(): number | undefined {
    if (process.platform === "win32") return undefined;
    const fd = (this.pty as unknown as { fd?: unknown }).fd;
    return typeof fd === "number" && Number.isInteger(fd) && fd >= 0 ? fd : undefined;
  }

  holdReading(): boolean {
    const socket = this.socket();
    return socket !== undefined && stopHandleReading(socket);
  }

  releaseReading(): void {
    const socket = this.socket();
    if (socket !== undefined) restartHandleReading(socket);
  }

  /** node-pty（Unix）が master を読む `tty.ReadStream`（`UnixTerminal._socket`。内部）。 */
  private socket(): HandleBackedStream | undefined {
    if (process.platform === "win32") return undefined;
    const socket = (this.pty as unknown as { _socket?: HandleBackedStream })._socket;
    return socket ?? undefined;
  }
}

/**
 * node-pty の書き込み待ちの列（`{ buffer, offset }[]`）の残りのバイト数。形が違えば undefined（20260927-server-size-input-limits）。
 * 書き出しはテストのため。
 */
export function sumPendingChunks(queue: unknown): number | undefined {
  if (!Array.isArray(queue)) return undefined;
  let total = 0;
  for (const task of queue as unknown[]) {
    const t = task as { buffer?: unknown; offset?: unknown } | null;
    const buffer = t?.buffer;
    const offset = t?.offset;
    if (!(buffer instanceof Uint8Array) || typeof offset !== "number") return undefined;
    total += Math.max(0, buffer.byteLength - offset);
  }
  return total;
}

/** 覚えた長さがこの件数を超えたら、書き込みのたびに詰め直す（`NodePtyProcess.write`）。 */
const SENT_RECONCILE_EVERY = 1024;

/** Windows の node-pty の入力の socket の書き込み待ちの件数（内部の形を読む。無ければ undefined）。書き出しはテストのため。 */
export function windowsSocketChunks(pty: unknown): number | undefined {
  try {
    const socket = (
      pty as {
        _agent?: {
          inSocket?: {
            _writableState?: { buffered?: unknown; bufferedIndex?: unknown; writing?: unknown };
          };
        };
      }
    )._agent?.inSocket;
    const state = socket?._writableState;
    const buffered = state?.buffered;
    const index = state?.bufferedIndex;
    if (!Array.isArray(buffered) || typeof index !== "number") return undefined;
    // 書いている途中の分は 1 件と数える。`net.Socket` は writev を持つので、途中の分が複数件の束のときは束の件数−1 だけ少なく数える
    // （T11 の点検。最悪で件数の上限の約 2 倍まで積まれうるが、バイト数の上限は別に効く）。
    return Math.max(0, buffered.length - index) + (state?.writing === true ? 1 : 0);
  } catch {
    return undefined;
  }
}

/**
 * node-pty に渡した書き込みの長さを渡した順に覚え、node-pty の待ちの件数から「まだ書けていないバイト数」を O(1)（償却）で出す（decisions D9）。
 * node-pty は 1 回の `write` を 1 件として末尾に積み、書き終えた件を先頭から取り除く（空の書き込みは積まない）。だから待ちが L 件なら、覚えた長さの
 * 後ろの L 件が残りで、そのうち先頭は `offset` まで書けている。書き出しはテストのため。
 */
export class SentLengths {
  private lengths: number[] = [];
  private head = 0;
  private total = 0;

  /** 覚えている（まだ書き終えたと分かっていない）件数。 */
  remembered(): number {
    return this.lengths.length - this.head;
  }

  push(len: number): void {
    if (len <= 0) return;
    this.lengths.push(len);
    this.total += len;
  }

  /** 待ちが `queueLength` 件・先頭が `headOffset` まで書けているときの残りのバイト数。覚えた件数より待ちが多い（食い違い）なら undefined。 */
  reconcile(queueLength: number, headOffset: number): number | undefined {
    let remembered = this.lengths.length - this.head;
    if (queueLength > remembered) return undefined;
    while (remembered > queueLength) {
      this.total -= this.lengths[this.head]!;
      this.head += 1;
      remembered -= 1;
    }
    if (this.head > 1024 && this.head * 2 > this.lengths.length) {
      this.lengths = this.lengths.slice(this.head);
      this.head = 0;
    }
    return queueLength === 0 ? 0 : this.total - headOffset;
  }
}
