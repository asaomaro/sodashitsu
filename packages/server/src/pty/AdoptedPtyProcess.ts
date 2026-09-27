import { readFileSync, write as fsWrite } from "node:fs";
import { ReadStream } from "node:tty";
import type { Disposable, PtyProcess } from "./PtyBackend.js";
import { nodePtyNative } from "./nodePtyNative.js";
import {
  type HandleBackedStream,
  restartHandleReading,
  stopHandleReading,
} from "./socketReading.js";

export interface AdoptedPtyDeps {
  /** master の大きさを変える（既定は node-pty のネイティブの `resize`）。 */
  resize: (
    fd: number,
    cols: number,
    rows: number,
    pixels?: { width: number; height: number },
  ) => void;
  /** pid のプロセスが終わっていれば（ゾンビなら）waitpid の形の状態、まだ動いている・分からなければ undefined。 */
  readExitStatus: (pid: number) => number | undefined;
  /** シグナルを送る（既定は `process.kill`）。 */
  kill: (pid: number, signal: NodeJS.Signals) => void;
  /** 終了（ゾンビ）を見に行く間隔（ms。0 以下なら見ない）。 */
  exitPollMs: number;
  /**
   * 読み取りが終わった（slave が全部閉じた）後、ゾンビになるのを待つ上限（ms）。カーネルは fd を閉じる（hangup）のをゾンビに変えるより
   * 先に行うので、`close` の直後はまだ終了の状態が読めないことがある。
   */
  exitSettleMs: number;
}

const DEFAULT_DEPS: AdoptedPtyDeps = {
  resize: (fd, cols, rows, pixels) =>
    nodePtyNative().resize(fd, cols, rows, pixels?.width ?? 0, pixels?.height ?? 0),
  readExitStatus: (pid) => readProcExitStatus(pid),
  kill: (pid, signal) => process.kill(pid, signal),
  exitPollMs: 1000,
  exitSettleMs: 500,
};

/**
 * `/proc/<pid>/stat` から、ゾンビのプロセスの終了の状態（waitpid の形。proc_pid_stat(5) の 52 番目の `exit_code`）を読む（Linux だけ。
 * research F4.2）。動いている・無い・読めない・Linux 以外は undefined。
 */
export function readProcExitStatus(
  pid: number,
  platform: NodeJS.Platform = process.platform,
): number | undefined {
  if (platform !== "linux") return undefined;
  let raw: string;
  try {
    raw = readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch {
    return undefined;
  }
  return parseProcStatExitStatus(raw);
}

/** `/proc/<pid>/stat` の中身から、状態が `Z` のときだけ `exit_code` を返す。comm はカッコと空白を含みうるので最後の `)` で切る。 */
export function parseProcStatExitStatus(raw: string): number | undefined {
  const end = raw.lastIndexOf(")");
  if (end < 0) return undefined;
  const fields = raw
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  // ")" の後ろ: state(0) ppid(1) … exit_code は proc_pid_stat(5) の (52)、ここでは 0 始まりで 49。
  if (fields[0] !== "Z") return undefined;
  const value = Number(fields[49]);
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

/** waitpid の形の状態を、node-pty の `onExit` と同じ `{ exitCode, signal }` に直す。 */
export function exitFromWaitStatus(status: number | undefined): {
  exitCode: number;
  signal?: number;
} {
  if (status === undefined) return { exitCode: 0 };
  const signal = status & 0x7f;
  if (signal === 0) return { exitCode: (status >> 8) & 0xff };
  return { exitCode: 0, signal };
}

/**
 * execve で引き継いだ PTY の master（20260926-live-handoff。design「`AdoptedPtyProcess`」）。このプロセスはシェルの親のままだが、
 * 待つ手段（node-pty の waitpid のスレッド）は execve で消えているので、終了は読み取りの終わり（`close`）か、ゾンビになったこと
 * （`/proc/<pid>/stat`。Linux だけ）で知る。ゾンビは回収できない（Node に任意の pid を待つ API が無い。decisions D6）。
 */
export class AdoptedPtyProcess implements PtyProcess {
  private readonly stream: ReadStream;
  private readonly dataListeners = new Set<(chunk: string) => void>();
  private readonly exitListeners = new Set<(e: { exitCode: number; signal?: number }) => void>();
  private readonly deps: AdoptedPtyDeps;
  private readonly queue: { buf: Buffer; offset: number }[] = [];
  private writing = false;
  /** fd を閉じた（`kill`・読み取りの終わり）。 */
  private fdClosed = false;
  private exited = false;
  /** `kill` で閉じたが、書き込みの途中だったので閉じるのを後にした（閉じた番号が再利用されて別のファイルに書かないため）。 */
  private destroyAfterWrite = false;
  private settling = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly fd: number,
    readonly pid: number,
    deps: Partial<AdoptedPtyDeps> = {},
  ) {
    this.deps = { ...DEFAULT_DEPS, ...deps };
    this.stream = new ReadStream(fd);
    this.stream.setEncoding("utf8");
    this.stream.on("data", (chunk: string | Buffer) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const fn of [...this.dataListeners]) fn(text);
    });
    // 相手（slave の側）が全部閉じると EIO（Linux）か EOF が来る。どちらも `close` の後に終了として扱う。
    this.stream.on("error", () => undefined);
    this.stream.on("close", () => {
      this.fdClosed = true;
      this.settleThenFinish();
    });
    if (this.deps.exitPollMs > 0) {
      this.pollTimer = setInterval(() => {
        if (this.deps.readExitStatus(this.pid) !== undefined) this.finish();
      }, this.deps.exitPollMs);
      this.pollTimer.unref();
    }
  }

  onData(cb: (chunk: string) => void): Disposable {
    this.dataListeners.add(cb);
    return { dispose: () => this.dataListeners.delete(cb) };
  }

  onExit(cb: (e: { exitCode: number; signal?: number }) => void): Disposable {
    this.exitListeners.add(cb);
    return { dispose: () => this.exitListeners.delete(cb) };
  }

  write(data: string | Uint8Array): void {
    if (this.fdClosed) return;
    const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data); // 写しを取る（書き終わる前に呼び出し側がバッファを使い回しても中身が変わらない）
    if (buf.length === 0) return;
    this.queue.push({ buf, offset: 0 });
    if (!this.writing) this.drain();
  }

  /** 待ち行列を書く（master は非ブロッキングなので `EAGAIN` は少し待って書き直す。node-pty の `CustomWriteStream` と同じ）。 */
  private drain(): void {
    const head = this.queue[0];
    if (head === undefined || this.fdClosed) {
      this.writing = false;
      if (this.destroyAfterWrite) {
        this.destroyAfterWrite = false;
        this.stream.destroy();
      }
      return;
    }
    this.writing = true;
    fsWrite(this.fd, head.buf, head.offset, head.buf.length - head.offset, null, (err, written) => {
      if (err) {
        if (err.code === "EAGAIN") {
          setTimeout(() => this.drain(), 5);
          return;
        }
        // 端末が閉じた等。残りは捨てる（node-pty と同じ）。
        this.queue.length = 0;
        this.writing = false;
        return;
      }
      head.offset += written;
      if (head.offset >= head.buf.length) this.queue.shift();
      this.drain();
    });
  }

  resize(cols: number, rows: number, pixels?: { width: number; height: number }): void {
    if (this.fdClosed) return;
    try {
      // 画素の大きさ（20260926-kitty-graphics）も node-pty と同じく `ws_xpixel`/`ws_ypixel` に入れる。
      this.deps.resize(this.fd, Math.max(1, cols), Math.max(1, rows), pixels);
    } catch {
      // 閉じた端末（EBADF 等）。
    }
  }

  pause(): void {
    this.stream.pause();
  }

  resume(): void {
    this.stream.resume();
  }

  /** 端末を閉じ（fd を閉じるとシェルに hangup が届く）、SIGHUP も送る（node-pty の `kill` の既定と同じ）。 */
  kill(): void {
    if (!this.fdClosed) {
      this.fdClosed = true;
      this.queue.length = 0;
      if (this.writing)
        this.destroyAfterWrite = true; // 書き込みの戻りで閉じる（`drain`）
      else this.stream.destroy();
    }
    try {
      this.deps.kill(this.pid, "SIGHUP");
    } catch {
      // 既に終わっている。
    }
  }

  holdReading(): boolean {
    return !this.fdClosed && stopHandleReading(this.stream as unknown as HandleBackedStream);
  }

  releaseReading(): void {
    if (!this.fdClosed) restartHandleReading(this.stream as unknown as HandleBackedStream);
  }

  /** もう一度引き継ぐときの master（閉じていなければ）。 */
  handoffFd(): number | undefined {
    return this.fdClosed ? undefined : this.fd;
  }

  /** 読み取りの終わりの後、終了の状態が読めるまで（上限 `exitSettleMs`）待ってから `finish`。 */
  private settleThenFinish(): void {
    if (this.exited || this.settling) return;
    if (this.deps.readExitStatus(this.pid) !== undefined || this.deps.exitSettleMs <= 0) {
      this.finish();
      return;
    }
    this.settling = true;
    const deadline = Date.now() + this.deps.exitSettleMs;
    const tick = (): void => {
      if (this.exited) return;
      if (this.deps.readExitStatus(this.pid) !== undefined || Date.now() >= deadline) {
        this.finish();
        return;
      }
      setTimeout(tick, 20).unref();
    };
    setTimeout(tick, 20).unref();
  }

  private finish(): void {
    if (this.exited) return;
    this.exited = true;
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    const e = exitFromWaitStatus(this.deps.readExitStatus(this.pid));
    for (const fn of [...this.exitListeners]) fn(e);
  }
}
