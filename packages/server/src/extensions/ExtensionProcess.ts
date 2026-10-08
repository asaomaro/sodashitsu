import { spawn as nodeSpawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { performance } from "node:perf_hooks";
import {
  EXTENSION_BAD_LINES_MAX,
  EXTENSION_INPUT_BYTES_RATE,
  EXTENSION_LOG_LINES_MAX,
  EXTENSION_LOG_LINE_MAX_BYTES,
  EXTENSION_OUT_QUEUE_MAX_BYTES,
  EXTENSION_OUT_QUEUE_MAX_LINES,
  EXTENSION_PUMP_BATCH,
  EXTENSION_REQUEST_RATE,
  EXTENSION_STDERR_BYTES_RATE,
  EXTENSION_STOP_GRACE_MS,
  EXTENSION_STOP_WAIT_MS,
  EXTENSION_SWEEP_POLL_MS,
  EXTENSION_WRITE_STALL_MS,
  parseExtRequest,
  type ExtLine,
  type ExtRequest,
  type ExtensionExitReason,
  type ExtensionLogResult,
  type ExtensionScope,
} from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";
import { realClock, type Clock } from "../machine/MachineLink.js";
import { TokenBucket } from "../display/rateLimit.js";
import { extensionArgv, killTreeCommand } from "./extensionLaunch.js";
import { LineReader, type LineItem } from "./lineReader.js";

/**
 * 拡張 1 回ぶんの起動（20261007-ext-host）。子プロセスを**新しいプロセスのグループ**で起動し、標準出力を行で読み、標準入力へ行を書き、
 * 標準エラーを輪の記録に取る。止めるときは、グループごと（`sweepGroup`）。
 * **拡張のコマンドを `spawn` するのは `ExtensionHost.startOne` の 1 か所だけ**（`start()` はそこからだけ呼ばれる）。
 */

export interface ExtChild {
  pid?: number | undefined;
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  on(ev: "exit", fn: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  on(ev: "error", fn: (err: Error) => void): void;
}
export type ExtSpawn = (
  file: string,
  args: string[],
  opts: { cwd: string; env: Record<string, string>; detached: boolean; windowsVerbatimArguments: boolean },
) => ExtChild;

export type KillGroup = (pid: number, signal: "SIGTERM" | "SIGKILL" | 0) => void;
export type RunFile = (file: string, args: string[], opts: { cwd: string }) => void;

/**
 * 量の桶。**借りられる**（片はもう届いているので、足りなくても受け取り、足りない分は「待つ時間」にして返す）。
 * `consume` が返すのは、読むのを待つべきミリ秒（0 なら待たない）。`display/rateLimit.ts` の `TokenBucket`（借りない）と別に持つのは、
 * 受けた片を捨てずに、次の片を待たせるため。全部の拡張で 1 つを共有できる。
 */
export class DebtBucket {
  private tokens: number;
  private last: number | undefined;
  constructor(private readonly rate: { perSec: number; burst: number }) {
    this.tokens = rate.burst;
  }
  consume(now: number, n: number): number {
    if (this.last !== undefined && now > this.last) {
      this.tokens = Math.min(this.rate.burst, this.tokens + ((now - this.last) / 1000) * this.rate.perSec);
    }
    if (this.last === undefined || now > this.last) this.last = now;
    this.tokens -= n;
    return this.tokens < 0 ? Math.ceil((-this.tokens / this.rate.perSec) * 1000) : 0;
  }
}

export interface ExtProcessDeps {
  spawn?: ExtSpawn;
  /** グループへ合図を送る。グループが無ければ `ESRCH` を投げる（既定は `process.kill(-pid, signal)`）。 */
  killGroup?: KillGroup;
  runFile?: RunFile;
  /** 全部の拡張で共有する量の桶。 */
  totalBytes?: DebtBucket;
  clock?: Clock;
  platform?: NodeJS.Platform;
  logger: Logger;
}
export interface ExtExit {
  code: number | null;
  signal: string | null;
  reason: ExtensionExitReason;
  uptimeMs: number;
}
export interface ExtProcessSpec {
  key: string;
  id: string;
  scope: ExtensionScope;
  root: string | null;
  command: string;
  cwd: string;
  runId: string;
}
type StopReason = "stopped" | "bad_lines" | "not_reading";

const defaultSpawn: ExtSpawn = (file, args, opts) =>
  nodeSpawn(file, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
    detached: opts.detached,
    windowsVerbatimArguments: opts.windowsVerbatimArguments,
  });

const defaultKillGroup: KillGroup = (pid, signal) => {
  process.kill(-pid, signal);
};

const defaultRunFile: RunFile = (file, args, opts) => {
  const c = nodeSpawn(file, args, { cwd: opts.cwd, stdio: "ignore", windowsHide: true, shell: false });
  c.on("error", () => undefined);
  c.unref();
};

const noop = (): void => undefined;
/** 標準エラーの記録で `?` に替える文字: 制御文字・DEL・書字方向を変える文字（端末で `sodactl ext log` を見る人の目を偽らない）。 */
// eslint-disable-next-line no-control-regex
const BAD_LOG_CHARS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;
const STDIO_CLOSE_WAIT_MS = 200;
/**
 * 1 つの片（`data` の 1 回）に掛ける最低の課金（バイト相当）。1 バイトずつ書き続ける拡張が、量の桶（バイト数だけを数える）に掛からずに、
 * 片の数でメモリと CPU を使い切るのを防ぐ。ふつうの 1 行（数十バイト以上の要求）や大きな 1 行は、実際の大きさで数えるので影響が小さい。
 */
export const EXTENSION_MIN_CHUNK_CHARGE = 1024;
const LINE_RETRY_MS = Math.ceil(1000 / EXTENSION_REQUEST_RATE.perSec);

interface OutItem {
  text: string;
  bytes: number;
  droppable: boolean;
  coalesce?: string;
  /** `ext.dropped` の印（数を持つ）。 */
  dropped?: number;
}

export class ExtensionProcess {
  readonly runId: string;
  readonly exited: Promise<ExtExit>;
  readonly settled: Promise<void>;

  private readonly clock: Clock;
  private readonly platform: NodeJS.Platform;
  private readonly logger: Logger;
  private readonly spawnFn: ExtSpawn;
  private readonly killGroup: KillGroup;
  private readonly runFile: RunFile;
  private readonly totalBytes: DebtBucket | undefined;

  private child: ExtChild | null = null;
  private startedAt = 0;
  private started = false;
  private childExited = false;
  private stopReason: StopReason | null = null;
  private stopP: Promise<void> | null = null;
  private resolveExited!: (e: ExtExit) => void;
  private resolveSettled!: () => void;
  private settledFlag = false;
  private forceSettleTimer: unknown = null;

  // 読む
  private readonly reader = new LineReader();
  private held: LineItem | null = null;
  private badLines = 0;
  private pumping = false;
  private readPaused = false;
  private byteTimer: unknown = null;
  private lineTimer: unknown = null;
  private yieldPending = false;
  private readonly lineBucket = new TokenBucket(EXTENSION_REQUEST_RATE);
  private readonly bytesBucket = new DebtBucket(EXTENSION_INPUT_BYTES_RATE);

  // 書く
  private outQ: OutItem[] = [];
  private outBytes = 0;
  private dropCount = 0;
  private blocked = false;
  private stallTimer: unknown = null;
  private stdinEnded = false;

  // 標準エラー
  private readonly decoder = new StringDecoder("utf8");
  private carry = "";
  private ring: string[] = [];
  private ringDropped = 0;
  private readonly stderrBucket = new DebtBucket(EXTENSION_STDERR_BYTES_RATE);
  private stderrTimer: unknown = null;
  private stderrPaused = false;

  // グループを掃く
  private sweepP: Promise<void> | null = null;
  private sweepDone = false;

  constructor(
    private readonly spec: ExtProcessSpec,
    private readonly env: Record<string, string>,
    private readonly handlers: { onRequest(req: ExtRequest): void },
    deps: ExtProcessDeps,
  ) {
    this.runId = spec.runId;
    this.clock = deps.clock ?? realClock;
    this.platform = deps.platform ?? process.platform;
    this.logger = deps.logger;
    this.spawnFn = deps.spawn ?? defaultSpawn;
    this.killGroup = deps.killGroup ?? defaultKillGroup;
    this.runFile = deps.runFile ?? defaultRunFile;
    this.totalBytes = deps.totalBytes;
    this.exited = new Promise<ExtExit>((r) => (this.resolveExited = r));
    this.settled = new Promise<void>((r) => (this.resolveSettled = r));
  }

  /** ログに出す共通の項目（コマンド・標準エラーの中身・面の中身は入れない）。 */
  private fields(extra?: Record<string, unknown>): Record<string, unknown> {
    return { extension: this.spec.key, run: this.runId, ...extra };
  }

  // --- 起動 ---------------------------------------------------------------------------------------------------------

  start(): void {
    if (this.started) return;
    this.started = true;
    this.startedAt = this.clock.now();
    let child: ExtChild;
    try {
      const argv = extensionArgv(this.spec.command, this.platform, this.env);
      child = this.spawnFn(argv[0]!, argv.slice(1), {
        cwd: this.spec.cwd,
        env: this.env,
        detached: this.platform !== "win32",
        windowsVerbatimArguments: this.platform === "win32",
      });
    } catch {
      this.logger.warn("extension spawn failed", this.fields({ reason: "spawn_failed" }));
      this.failSpawn();
      return;
    }
    this.child = child;
    // 受け手が無いと、EPIPE などでサーバが落ちる。
    child.stdin.on("error", noop);
    child.stdout.on("error", noop);
    child.stderr.on("error", noop);
    child.on("error", () => {
      if (!this.childExited && child.pid === undefined) {
        this.logger.warn("extension spawn failed", this.fields({ reason: "spawn_failed" }));
        this.failSpawn();
      }
    });
    child.on("exit", (code, signal) => this.onChildExit(code, signal));
    child.stdout.on("data", (chunk: Buffer | string) => this.onStdout(typeof chunk === "string" ? Buffer.from(chunk) : chunk));
    child.stderr.on("data", (chunk: Buffer | string) => this.onStderr(chunk));
    child.stderr.on("end", () => this.flushCarry(true));
  }

  private failSpawn(): void {
    if (this.childExited) return;
    this.childExited = true;
    this.resolveExited({ code: null, signal: null, reason: "spawn_failed", uptimeMs: 0 });
    this.destroyStdio(true);
    this.settle();
  }

  // --- 読む ---------------------------------------------------------------------------------------------------------

  private get inputOpen(): boolean {
    return !this.childExited && this.stopReason === null;
  }

  private pauseReading(): void {
    if (this.readPaused || this.child === null) return;
    this.readPaused = true;
    (this.child.stdout as NodeJS.ReadableStream).pause();
  }

  private resumeReading(): void {
    if (!this.readPaused || this.child === null || !this.inputOpen) return;
    this.readPaused = false;
    (this.child.stdout as NodeJS.ReadableStream).resume();
  }

  private onStdout(chunk: Buffer): void {
    if (!this.inputOpen) return;
    try {
      const now = this.clock.now();
      // 量は、片を受けた時点で数える（行の成立を待たない。改行の無い出力にも効く）。拡張ごとと、全部の合計の両方。
      const charge = Math.max(chunk.length, EXTENSION_MIN_CHUNK_CHARGE);
      const wait = Math.max(this.bytesBucket.consume(now, charge), this.totalBytes?.consume(now, charge) ?? 0);
      this.reader.push(chunk);
      if (wait > 0) {
        this.pauseReading();
        if (this.byteTimer !== null) this.clock.clearTimeout(this.byteTimer);
        this.byteTimer = this.clock.setTimeout(() => {
          this.byteTimer = null;
          this.pump();
        }, wait);
      }
      this.pump();
    } catch (err) {
      this.logger.warn("extension input failed", this.fields({ kind: errorKind(err) }));
    }
  }

  /** 1 行ずつ処理する。**再入しない**。16 行か 8 ミリ秒ごとに、イベントループへ返す。 */
  private pump(): void {
    if (this.pumping || this.yieldPending) return;
    this.pumping = true;
    try {
      let count = 0;
      const t0 = performance.now();
      for (;;) {
        if (!this.inputOpen) return;
        if (this.held === null) {
          this.held = this.reader.next();
          if (this.held === null) break;
        }
        // 行の桶。足りなければ、読むのを待つ（捨てない・誤りにしない）。
        if (!this.lineBucket.take(this.clock.now())) {
          this.pauseReading();
          if (this.lineTimer === null) {
            this.lineTimer = this.clock.setTimeout(() => {
              this.lineTimer = null;
              this.pump();
            }, LINE_RETRY_MS);
          }
          return;
        }
        const item = this.held;
        this.held = null;
        this.handleItem(item);
        count += 1;
        if (count >= EXTENSION_PUMP_BATCH.lines || performance.now() - t0 >= EXTENSION_PUMP_BATCH.ms) {
          this.pauseReading();
          this.yieldPending = true;
          setImmediate(() => {
            this.yieldPending = false;
            this.pump();
          });
          return;
        }
      }
      if (this.byteTimer === null && this.lineTimer === null) this.resumeReading();
    } finally {
      this.pumping = false;
    }
  }

  private handleItem(item: LineItem): void {
    try {
      if (item.kind === "too_long") return this.badLine("line_too_long", "the line is too long");
      if (item.kind === "bad_utf8") return this.badLine("bad_line", "the line is not valid UTF-8");
      const parsed = parseExtRequest(item.text);
      if (!parsed.ok) return this.badLine(parsed.code, parsed.message);
      this.badLines = 0;
      this.handlers.onRequest(parsed.request);
    } catch (err) {
      // 漏れた例外は、その行を「壊れた行」に数える（サーバを落とさない）。
      this.logger.warn("extension request failed", this.fields({ kind: errorKind(err) }));
      this.badLine("bad_request", "the request could not be processed");
    }
  }

  private badLine(code: "bad_line" | "line_too_long" | "bad_request", message: string): void {
    this.send({ type: "ext.error", code, message });
    this.badLines += 1;
    if (this.badLines >= EXTENSION_BAD_LINES_MAX) {
      this.logger.warn("extension stopped", this.fields({ reason: "bad_lines" }));
      void this.stop("bad_lines");
    }
  }

  // --- 書く ---------------------------------------------------------------------------------------------------------

  send(line: ExtLine, opts: { droppable?: boolean; coalesce?: "ext.panes" } = {}): void {
    if (!this.inputOpen || this.child === null || this.stdinEnded) return;
    try {
      const text = JSON.stringify(line) + "\n";
      const bytes = Buffer.byteLength(text);
      const droppable = opts.droppable === true || opts.coalesce !== undefined || line.type === "ext.dropped";
      if (opts.coalesce !== undefined) {
        const i = this.outQ.findIndex((q) => q.coalesce === opts.coalesce);
        if (i !== -1) {
          this.outBytes += bytes - this.outQ[i]!.bytes;
          this.outQ[i] = { text, bytes, droppable: true, coalesce: opts.coalesce };
          this.flush();
          return;
        }
      }
      if (!this.fits(bytes)) {
        // 捨ててよい行を、古いものから捨てる。
        while (!this.fits(bytes)) {
          const i = this.outQ.findIndex((q) => q.droppable);
          if (i === -1) break;
          const [gone] = this.outQ.splice(i, 1);
          this.outBytes -= gone!.bytes;
          this.dropCount += gone!.dropped ?? 1;
        }
        if (!this.fits(bytes)) {
          if (droppable) {
            this.dropCount += 1;
            return;
          }
          this.logger.warn("extension stopped", this.fields({ reason: "not_reading" }));
          void this.stop("not_reading");
          return;
        }
      }
      this.outQ.push({ text, bytes, droppable, ...(opts.coalesce !== undefined ? { coalesce: opts.coalesce } : {}) });
      this.outBytes += bytes;
      this.flush();
    } catch (err) {
      this.logger.warn("extension send failed", this.fields({ kind: errorKind(err) }));
    }
  }

  private fits(bytes: number): boolean {
    return this.outQ.length + 1 <= EXTENSION_OUT_QUEUE_MAX_LINES && this.outBytes + bytes <= EXTENSION_OUT_QUEUE_MAX_BYTES;
  }

  private flush(): void {
    const child = this.child;
    if (child === null || this.stdinEnded) return;
    for (;;) {
      // 空きが出来ていたら、捨てた数を知らせる。
      if (this.dropCount > 0 && this.outQ.length < EXTENSION_OUT_QUEUE_MAX_LINES) {
        const text = JSON.stringify({ type: "ext.dropped", count: this.dropCount } satisfies ExtLine) + "\n";
        const bytes = Buffer.byteLength(text);
        if (this.outBytes + bytes <= EXTENSION_OUT_QUEUE_MAX_BYTES) {
          this.outQ.push({ text, bytes, droppable: true, dropped: this.dropCount });
          this.outBytes += bytes;
          this.dropCount = 0;
        }
      }
      while (!this.blocked && this.outQ.length > 0) {
        const item = this.outQ.shift()!;
        this.outBytes -= item.bytes;
        let ok = true;
        try {
          ok = (child.stdin as NodeJS.WritableStream).write(item.text);
        } catch {
          ok = true; // 書けない（EPIPE など）。続けて exit が来る。
        }
        if (!ok) {
          this.blocked = true;
          (child.stdin as NodeJS.WritableStream).once("drain", () => {
            this.blocked = false;
            this.disarmStall();
            this.flush();
          });
        }
      }
      // 書き切って空きがあるのに、知らせていない捨てた数があれば、もう一度。
      if (!(this.dropCount > 0 && !this.blocked && this.outQ.length === 0)) break;
    }
    if (this.blocked && this.outQ.length > 0) this.armStall();
    else this.disarmStall();
  }

  private armStall(): void {
    if (this.stallTimer !== null) return;
    this.stallTimer = this.clock.setTimeout(() => {
      this.stallTimer = null;
      if (this.blocked && this.outQ.length > 0) {
        this.logger.warn("extension stopped", this.fields({ reason: "not_reading" }));
        void this.stop("not_reading");
      }
    }, EXTENSION_WRITE_STALL_MS);
  }

  private disarmStall(): void {
    if (this.stallTimer !== null) this.clock.clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  // --- 標準エラー -----------------------------------------------------------------------------------------------------

  private onStderr(chunk: Buffer | string): void {
    try {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      this.carry += this.decoder.write(buf);
      this.cutCarry();
      const wait = this.stderrBucket.consume(this.clock.now(), Math.max(buf.length, EXTENSION_MIN_CHUNK_CHARGE));
      if (wait > 0 && !this.childExited && this.child !== null) {
        if (!this.stderrPaused) {
          this.stderrPaused = true;
          (this.child.stderr as NodeJS.ReadableStream).pause();
        }
        if (this.stderrTimer !== null) this.clock.clearTimeout(this.stderrTimer);
        this.stderrTimer = this.clock.setTimeout(() => {
          this.stderrTimer = null;
          this.resumeStderr();
        }, wait);
      }
    } catch (err) {
      this.logger.warn("extension stderr failed", this.fields({ kind: errorKind(err) }));
    }
  }

  private resumeStderr(): void {
    if (!this.stderrPaused || this.child === null) return;
    this.stderrPaused = false;
    (this.child.stderr as NodeJS.ReadableStream).resume();
  }

  private cutCarry(): void {
    for (;;) {
      const nl = this.carry.indexOf("\n");
      if (nl === -1) break;
      this.pushLog(this.carry.slice(0, nl));
      this.carry = this.carry.slice(nl + 1);
    }
    // 改行の無い出力は、4 KiB ごとに 1 行にする。
    while (this.carry.length >= EXTENSION_LOG_LINE_MAX_BYTES) {
      this.pushLog(this.carry.slice(0, EXTENSION_LOG_LINE_MAX_BYTES));
      this.carry = this.carry.slice(EXTENSION_LOG_LINE_MAX_BYTES);
    }
  }

  private flushCarry(final: boolean): void {
    if (final) this.carry += this.decoder.end();
    this.cutCarry();
    if (final && this.carry !== "") {
      this.pushLog(this.carry);
      this.carry = "";
    }
  }

  private pushLog(raw: string): void {
    // eslint-disable-next-line no-control-regex
    let line = raw.replace(BAD_LOG_CHARS, "?");
    if (line.length > EXTENSION_LOG_LINE_MAX_BYTES) line = line.slice(0, EXTENSION_LOG_LINE_MAX_BYTES);
    this.ring.push(line);
    if (this.ring.length > EXTENSION_LOG_LINES_MAX) {
      this.ring.shift();
      this.ringDropped += 1;
    }
  }

  log(): ExtensionLogResult {
    // 途中の行（改行がまだ無い）も、見えるようにする。
    const lines = this.carry !== "" ? [...this.ring, this.carry.replace(BAD_LOG_CHARS, "?")] : [...this.ring];
    return { lines, dropped: this.ringDropped };
  }

  // --- グループを掃く ---------------------------------------------------------------------------------------------------

  private wait(ms: number): Promise<void> {
    return new Promise((r) => this.clock.setTimeout(r, ms));
  }

  private groupExists(pid: number): boolean {
    try {
      this.killGroup(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code !== "ESRCH"; // EPERM などは「残っているが、送れない」
    }
  }

  /**
   * POSIX。止めるとき・子が自分で終わったとき・落ちたとき、の全部で使う、ただ 1 つの手順。**起動 1 回につき、生涯で 1 回だけ**
   * （終わった後に頼まれたら、何もせずにすぐ返る。グループが空になった後の番号は再利用されうる）。
   * 合図を送るのは、直前の確かめで「残っている」と分かったときだけ（確かめと送る処理の間に、待ちを挟まない）。
   */
  private sweepGroup(): Promise<void> {
    const pid = this.child?.pid;
    if (this.platform === "win32" || pid === undefined || this.sweepDone) return Promise.resolve();
    if (this.sweepP !== null) return this.sweepP;
    this.sweepP = (async () => {
      try {
        const start = this.clock.now();
        if (!this.groupExists(pid)) return;
        try {
          this.killGroup(pid, "SIGTERM");
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ESRCH") return;
        }
        let killed = false;
        for (;;) {
          await this.wait(EXTENSION_SWEEP_POLL_MS);
          if (!this.groupExists(pid)) return;
          const elapsed = this.clock.now() - start;
          if (!killed && elapsed >= EXTENSION_STOP_GRACE_MS) {
            killed = true;
            try {
              this.killGroup(pid, "SIGKILL");
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === "ESRCH") return;
            }
          }
          if (elapsed >= EXTENSION_STOP_WAIT_MS) {
            this.logger.warn("extension group remains", this.fields({ reason: "sweep_timeout" }));
            return;
          }
        }
      } catch (err) {
        this.logger.warn("extension sweep failed", this.fields({ kind: errorKind(err) }));
      } finally {
        this.sweepDone = true;
        this.maybeSettle();
      }
    })();
    return this.sweepP;
  }

  // --- 止める・終わる -----------------------------------------------------------------------------------------------------

  private onChildExit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.childExited) return;
    this.childExited = true;
    const reason: ExtensionExitReason = this.stopReason ?? (code === 0 && signal === null ? "exited" : "crashed");
    this.resolveExited({ code, signal, reason, uptimeMs: Math.max(0, this.clock.now() - this.startedAt) });
    this.closeStdio();
    if (this.forceSettleTimer === null) {
      this.forceSettleTimer = this.clock.setTimeout(() => this.settle(), EXTENSION_STOP_WAIT_MS);
    }
    if (this.platform === "win32") {
      this.maybeSettle();
    } else {
      // 止めていない exit でも、残った孫を掃く。
      void this.sweepGroup();
    }
  }

  private maybeSettle(): void {
    if (!this.childExited) return;
    if (this.platform !== "win32" && this.child?.pid !== undefined && !this.sweepDone) return;
    this.settle();
  }

  private settle(): void {
    if (this.settledFlag) return;
    this.settledFlag = true;
    if (this.forceSettleTimer !== null) this.clock.clearTimeout(this.forceSettleTimer);
    this.forceSettleTimer = null;
    this.disarmStall();
    for (const t of [this.byteTimer, this.lineTimer, this.stderrTimer]) if (t !== null) this.clock.clearTimeout(t);
    this.byteTimer = this.lineTimer = this.stderrTimer = null;
    this.resolveSettled();
  }

  /** 子が `exit` したら、サーバの側の stdio を閉じる。`stdout`・`stderr` は、読み残しを待ってから（200 ミリ秒まで）。 */
  private closeStdio(): void {
    const child = this.child;
    if (child === null) return;
    this.endStdin();
    this.resumeStderr();
    for (const s of [child.stdout, child.stderr] as NodeJS.ReadableStream[]) {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.clock.clearTimeout(timer);
        (s as unknown as { destroy?: () => void }).destroy?.();
      };
      const timer = this.clock.setTimeout(finish, STDIO_CLOSE_WAIT_MS);
      s.once("end", finish);
      s.once("close", finish);
      s.resume();
    }
  }

  private destroyStdio(immediate: boolean): void {
    const child = this.child;
    if (child === null) return;
    this.endStdin();
    if (immediate) {
      for (const s of [child.stdout, child.stderr, child.stdin] as unknown as { destroy?: () => void }[]) {
        try {
          s.destroy?.();
        } catch {
          // 閉じ済み
        }
      }
    }
  }

  private endStdin(): void {
    if (this.stdinEnded || this.child === null) return;
    this.stdinEnded = true;
    try {
      this.child.stdin.end();
    } catch {
      // EPIPE など
    }
  }

  /** 何度呼んでもよい。`EXTENSION_STOP_WAIT_MS` 以内に必ず返る。終わった後に呼ばれたら、何もせずにすぐ返る。 */
  stop(reason: StopReason): Promise<void> {
    if (this.settledFlag) return Promise.resolve();
    if (this.stopP !== null) return this.stopP;
    const child = this.child;
    // 起動していない・spawn が失敗した（pid が無い）なら、止めるものが無い。
    if (!this.started || child === null || child.pid === undefined) return Promise.resolve();
    if (!this.childExited) this.stopReason = reason;
    this.stopP = this.doStop(child);
    return this.stopP;
  }

  private async doStop(child: ExtChild | null): Promise<void> {
    if (child === null) return;
    this.endStdin();
    const hard = new Promise<"timeout">((r) => this.clock.setTimeout(() => r("timeout"), EXTENSION_STOP_WAIT_MS));
    if (this.platform === "win32") {
      if (!this.childExited) {
        void this.wait(EXTENSION_STOP_GRACE_MS).then(() => {
          const pid = child.pid;
          if (this.childExited || pid === undefined) return;
          const cmd = killTreeCommand(pid, this.platform, this.env);
          if (cmd === null) return;
          try {
            this.runFile(cmd.file, cmd.args, { cwd: cmd.cwd });
          } catch (err) {
            this.logger.warn("extension taskkill failed", this.fields({ kind: errorKind(err) }));
          }
        });
      }
    } else {
      void this.sweepGroup();
    }
    const done = Promise.all([this.exited, this.settled]).then(() => "done" as const);
    const r = await Promise.race([done, hard]);
    if (r === "timeout") {
      this.logger.warn("extension stop timed out", this.fields({ reason: "stop_timeout" }));
      this.destroyStdio(true);
      this.settle();
    }
  }
}

function errorKind(err: unknown): string {
  return err instanceof Error ? err.constructor.name : typeof err;
}
