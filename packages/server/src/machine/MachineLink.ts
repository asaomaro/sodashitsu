import { spawn as nodeSpawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { Logger } from "../log/Logger.js";
import {
  BRIDGE_FRAME,
  BRIDGE_LIMITS,
  BridgeFrameDecoder,
  BridgeProtocolError,
  encodeBridgeFrame,
  encodeJson,
  parseBridgeHello,
  parseClosePayload,
  truncateUtf8,
  type BridgeFrame,
  type BridgeHello,
} from "./bridgeFrames.js";
import type { MachineProfile } from "./machineRules.js";
import { SSH_COMMAND, sshArgsFor } from "./sshArgs.js";

/**
 * 手元の `wtm serve` から 1 台のマシンへの **1 回の試み**（ssh の子プロセス 1 本の寿命）（20260927-multi-host-machines の design「手元の 1 台の接続」・
 * architecture「設計判断」）。HELLO（版の確かめ）で online になり、切れたら失敗の分類を 1 回だけ報告して終わる。繋ぎ直しは `MachineManager` が
 * 新しい `MachineLink` を作る。**リモートから来るものは信用しない**: 枠の形・大きさ・チャネルの数・HELLO の形と時間を確かめ、外れたら ssh ごと切る。
 */

export interface ChildLike {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: "close", cb: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: "error", cb: (err: NodeJS.ErrnoException) => void): unknown;
}

export type SpawnFn = (command: string, args: string[]) => ChildLike;

/** システムの `ssh` を引数の配列で起動する（シェルを通さない）。 */
export const defaultSpawn: SpawnFn = (command, args) =>
  nodeSpawn(command, args, {
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  }) as unknown as ChildLike;

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(h: unknown): void;
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => {
    const t = setInterval(fn, ms);
    t.unref?.();
    return t;
  },
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export const LINK_TIMEOUTS = {
  /** HELLO を待つ上限（ssh の ConnectTimeout 10 秒＋リモートの起動）。 */
  helloMs: 20_000,
  /** 黙っていたら PING を送る間隔。 */
  pingIntervalMs: 15_000,
  /** 生きているかを確かめる周期（最後に受けた時刻から数えるので、上限の超過を最大でもこの分しか遅らせない）。 */
  healthCheckMs: 1_000,
  /** 最後に何かを受けてからの上限。 */
  silenceMs: 45_000,
  /** SIGTERM の後に SIGKILL するまで。 */
  killGraceMs: 2_000,
} as const;

/** 標準エラーを持つ上限（文字数。理由の表示に最後の行を使うだけ）。 */
const MAX_STDERR_CHARS = 8 * 1024;

export type LinkFailureKind = "attention" | "transient";
export interface LinkFailure {
  kind: LinkFailureKind;
  message: string;
}

export interface LinkEnd {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  spawnError: NodeJS.ErrnoException | undefined;
  protocolError: string | undefined;
  /** 目印の前が上限を超えた（非互換）。 */
  preambleOverflow: boolean;
  sawMarker: boolean;
  sawHello: boolean;
  timeout: "hello" | "health" | undefined;
  /** 自分で閉じた（無効化・削除・停止）。 */
  closedByUs: boolean;
}

const AUTH_RE = /Permission denied|Too many authentication failures/i;
const HOSTKEY_RE =
  /Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|No matching host key/i;
const NOT_FOUND_RE = /command not found|: not found/i;

/** 標準エラーの最後の `n` 行（リモートのシェルの初期化ファイルの雑音で分類を誤らないよう、終わり際だけを見る）。 */
function tailLines(stderr: string, n: number): string {
  return stderr
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(-n)
    .join("\n");
}

/** 標準エラーの最後の空でない 1 行（制御文字を除き 200 文字まで）。 */
export function lastStderrLine(stderr: string): string {
  const lines = stderr
    .split(/\r?\n/)
    .map((l) => l.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").trim());
  const last = [...lines].reverse().find((l) => l.length > 0) ?? "";
  return last.length > 200 ? `${last.slice(0, 200)}…` : last;
}

function withDetail(message: string, stderr: string): string {
  const line = lastStderrLine(stderr);
  return line ? `${message}（${line}）` : message;
}

/**
 * 失敗の分類（design「判定の順」）。最初に当たったもの: (1) spawn の失敗 → (2) 認証・ホスト鍵 → (3) リモートに wtm が無い → (4) リモートで wtm serve が
 * 動いていない → (5) 枠・HELLO の違反・目印の前が上限超え → (6) 目印が来ないまま 0・1・2 で終わった → (7) それ以外は transient。
 * (3)〜(6) は HELLO を受ける前だけ（HELLO の後の終了はどの終了コードでも (7)）。
 */
export function classifyLinkFailure(end: LinkEnd): LinkFailure {
  if (end.closedByUs) return { kind: "transient", message: "接続を閉じました" };
  if (end.spawnError) {
    if (end.spawnError.code === "ENOENT")
      return {
        kind: "attention",
        message: "ssh が見つかりません（OpenSSH のクライアントを入れてください）",
      };
    return { kind: "attention", message: `ssh を起動できません（${end.spawnError.message}）` };
  }
  if (!end.sawHello && HOSTKEY_RE.test(end.stderr)) {
    return {
      kind: "attention",
      message: withDetail(
        "ホスト鍵を確かめられません（ふだんの端末で ssh <宛先> を一度実行して鍵を確かめてください）",
        end.stderr,
      ),
    };
  }
  if (!end.sawHello && AUTH_RE.test(end.stderr)) {
    return {
      kind: "attention",
      message: withDetail(
        "SSH の認証に失敗しました（ssh <宛先> で確かめ、鍵のパスフレーズは ssh-agent に入れてください）",
        end.stderr,
      ),
    };
  }
  if (!end.sawHello) {
    if (
      end.exitCode === 127 ||
      (end.exitCode !== null && end.exitCode !== 255 && NOT_FOUND_RE.test(tailLines(end.stderr, 2)))
    ) {
      return {
        kind: "attention",
        message: withDetail(
          "リモートに wtm が見つかりません（リモートの PATH に wtm を入れてください）",
          end.stderr,
        ),
      };
    }
    if (end.exitCode === 3)
      return {
        kind: "attention",
        message: withDetail(
          "リモートで wtm serve が動いていません（リモートで起動してください）",
          end.stderr,
        ),
      };
    if (end.protocolError !== undefined || end.preambleOverflow) {
      return {
        kind: "attention",
        message: `リモートの wtm がこの版の中継に対応していません（リモートの wtm を更新してください）: ${end.protocolError ?? "no bridge marker"}`,
      };
    }
    if (!end.sawMarker && (end.exitCode === 0 || end.exitCode === 1 || end.exitCode === 2)) {
      return {
        kind: "attention",
        message: withDetail(
          "リモートの wtm bridge が中継を始められませんでした（リモートの wtm の版と bridge.sock を確かめてください）",
          end.stderr,
        ),
      };
    }
  } else if (end.protocolError !== undefined) {
    // HELLO の後の違反も、リモートが信用できない形を送ったので切る。繋ぎ直しで戻りうるので transient（同じ違反が続けば毎回ここに来る）。
    return {
      kind: "transient",
      message: `中継の枠が壊れていたので切りました: ${end.protocolError}`,
    };
  }
  if (end.timeout === "hello")
    return { kind: "transient", message: withDetail("応答がありません（時間切れ）", end.stderr) };
  if (end.timeout === "health")
    return { kind: "transient", message: "応答がありません（生きているかの確かめに答えない）" };
  return { kind: "transient", message: withDetail("接続が切れました", end.stderr) };
}

export interface MachineLinkDeps {
  spawn?: SpawnFn;
  clock?: Clock;
  logger?: Logger;
}

export interface LinkChannel {
  readonly id: number;
  /** このチャネルが書いて、まだ ssh へ流れていないバイト（write の callback で減らす）。 */
  readonly pendingBytes: number;
  sendText(s: string): void;
  sendBinary(b: Uint8Array): void;
  close(code: number, reason: string): void;
  onText(cb: (s: string) => void): void;
  onBinary(cb: (b: Uint8Array) => void): void;
  onClose(cb: (code: number, reason: string) => void): void;
}

type LinkState = "idle" | "starting" | "online" | "closed";

export class MachineLink {
  private readonly spawnFn: SpawnFn;
  private readonly clock: Clock;
  private state: LinkState = "idle";
  private child: ChildLike | undefined;
  private readonly decoder = new BridgeFrameDecoder({ role: "link" });
  private helloInfo: BridgeHello | undefined;
  private readonly channels = new Map<number, LinkChannelImpl>();
  private nextChannelId = 1;
  private lastReceivedAt = 0;
  private helloTimer: unknown;
  private healthTimer: unknown;
  private lastPingAt = 0;
  private stderrBuf = "";
  private readonly stderrDecoder = new StringDecoder("utf8");
  private readonly logger: Logger | undefined;
  private readonly onlineCbs: (() => void)[] = [];
  private readonly closedCbs: ((f: LinkFailure) => void)[] = [];
  private end: Partial<LinkEnd> = {};
  private resolveExited!: () => void;
  /** ssh の子プロセスが終わった（start しなかった・起こせなかったなら閉じたとき）。引き継ぎ（execve）の前に待つ——待たずに置き換わると回収されない子が残る。 */
  readonly exited: Promise<void> = new Promise((resolve) => {
    this.resolveExited = resolve;
  });

  constructor(
    readonly profile: MachineProfile,
    deps: MachineLinkDeps = {},
  ) {
    this.spawnFn = deps.spawn ?? defaultSpawn;
    this.clock = deps.clock ?? realClock;
    this.logger = deps.logger;
  }

  get hello(): BridgeHello | undefined {
    return this.helloInfo;
  }
  get online(): boolean {
    return this.state === "online";
  }
  /** 読むのを止めている理由（中継の接続ごと）。1 つでもあれば ssh の標準出力を読まない（背圧）。 */
  private readonly readHolds = new Set<unknown>();

  /**
   * ssh の標準出力を読むのを止める（ブラウザが遅い。review ラウンド 1）。読まないとリモートの `bridge.sock` の書き込み待ちが増え、リモートの `OutputFanout` の
   * 流量制御（出力を捨て、再開したら SNAPSHOT）が効く。同じ ssh の上のほかの接続も止まるので、呼ぶ側は長く止めない（上限時間で閉じる）。
   */
  holdReading(key: unknown): void {
    this.readHolds.add(key);
    this.child?.stdout.pause();
  }

  releaseReading(key: unknown): void {
    if (!this.readHolds.delete(key)) return;
    if (this.readHolds.size === 0) this.child?.stdout.resume();
  }

  /** ssh の標準入力の書き込み待ち（全チャネルの合計）。 */
  get pendingBytes(): number {
    return this.child?.stdin.writableLength ?? 0;
  }

  onOnline(cb: () => void): void {
    this.onlineCbs.push(cb);
  }
  onClosed(cb: (f: LinkFailure) => void): void {
    this.closedCbs.push(cb);
  }

  start(): void {
    if (this.state !== "idle") return;
    this.state = "starting";
    let args: string[];
    try {
      args = sshArgsFor(this.profile);
    } catch (err) {
      this.finish({
        spawnError: Object.assign(new Error((err as Error).message), {
          code: "EINVAL",
        }) as NodeJS.ErrnoException,
      });
      return;
    }
    let child: ChildLike;
    try {
      child = this.spawnFn(SSH_COMMAND, args);
    } catch (err) {
      this.finish({ spawnError: err as NodeJS.ErrnoException });
      return;
    }
    this.child = child;
    this.lastReceivedAt = this.clock.now();
    child.on("error", (err) => this.finish({ spawnError: this.end.sawMarker ? undefined : err }));
    child.on("close", (code, signal) => {
      this.finish({ exitCode: code, signal });
      this.resolveExited();
    });
    // パイプの失敗は close で報告する（リスナが無いと未処理の 'error' で手元のサーバが落ちる）。
    child.stdin.on("error", () => undefined);
    child.stdout.on("error", () => undefined);
    child.stderr.on("error", () => undefined);
    child.stderr.on("data", (chunk: Buffer | string) => {
      // かたまりの境目で切れた多バイト文字を化けさせない。
      this.stderrBuf += typeof chunk === "string" ? chunk : this.stderrDecoder.write(chunk);
      if (this.stderrBuf.length > MAX_STDERR_CHARS) {
        let cut = this.stderrBuf.slice(-MAX_STDERR_CHARS);
        const first = cut.charCodeAt(0);
        if (first >= 0xdc00 && first <= 0xdfff) cut = cut.slice(1); // サロゲートペアの後ろ半分から始めない
        this.stderrBuf = cut;
      }
    });
    child.stdout.on("data", (chunk: Buffer) =>
      this.onData(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
    );
    this.helloTimer = this.clock.setTimeout(
      () => this.finish({ timeout: "hello" }),
      LINK_TIMEOUTS.helloMs,
    );
  }

  /** online のときだけ新しいチャネルを開く（同時に 64 まで。番号は再利用しない）。 */
  openChannel(): LinkChannel | undefined {
    if (this.state !== "online" || this.channels.size >= BRIDGE_LIMITS.maxChannels)
      return undefined;
    if (this.nextChannelId > BRIDGE_LIMITS.maxChannelId) {
      this.close();
      return undefined;
    }
    const id = this.nextChannelId++;
    const ch = new LinkChannelImpl(id, this);
    this.channels.set(id, ch);
    this.writeFrame(encodeBridgeFrame(BRIDGE_FRAME.OPEN, id));
    return ch;
  }

  /** 自分で閉じる（無効化・削除・停止）。リモートの `wtm serve` は止めない。 */
  close(): void {
    this.finish({ closedByUs: true });
  }

  /** @internal チャネルが枠を書く。書き終えたら `done` を呼ぶ。 */
  writeFrame(frame: Uint8Array, done?: () => void): void {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed || this.state === "closed") {
      done?.();
      return;
    }
    stdin.write(frame, () => done?.());
  }

  /** @internal */
  forgetChannel(id: number): void {
    this.channels.delete(id);
  }

  private onData(bytes: Uint8Array): void {
    if (this.state === "closed") return;
    this.lastReceivedAt = this.clock.now();
    let frames: BridgeFrame[];
    try {
      frames = this.decoder.push(bytes);
    } catch (err) {
      const preamble = err instanceof BridgeProtocolError && /marker not found/.test(err.message);
      this.end.sawMarker = this.decoder.sawMarker;
      this.finish(
        preamble ? { preambleOverflow: true } : { protocolError: String((err as Error).message) },
      );
      return;
    }
    this.end.sawMarker = this.decoder.sawMarker;
    for (const f of frames) {
      if (this.isClosed()) return;
      this.onFrame(f);
    }
  }

  private onFrame(f: BridgeFrame): void {
    switch (f.type) {
      case BRIDGE_FRAME.HELLO: {
        if (this.helloInfo !== undefined) {
          this.finish({ protocolError: "second hello" });
          return;
        }
        try {
          this.helloInfo = parseBridgeHello(f.payload);
        } catch (err) {
          this.finish({ protocolError: (err as Error).message });
          return;
        }
        this.end.sawHello = true;
        this.state = "online";
        this.clock.clearTimeout(this.helloTimer);
        this.lastPingAt = this.clock.now();
        this.healthTimer = this.clock.setInterval(
          () => this.checkHealth(),
          LINK_TIMEOUTS.healthCheckMs,
        );
        for (const cb of this.onlineCbs) cb();
        return;
      }
      case BRIDGE_FRAME.PONG:
        return;
      default: {
        if (this.helloInfo === undefined) {
          this.finish({ protocolError: "frame before hello" });
          return;
        }
        const ch = this.channels.get(f.channel);
        if (!ch) return; // 閉じたチャネル宛て（行き違い）
        if (f.type === BRIDGE_FRAME.TEXT) ch.deliverText(new TextDecoder().decode(f.payload));
        else if (f.type === BRIDGE_FRAME.BINARY) ch.deliverBinary(f.payload);
        else if (f.type === BRIDGE_FRAME.CLOSE) {
          const { code, reason } = parseClosePayload(f.payload);
          ch.remoteClosed(code, reason);
        }
      }
    }
  }

  private isClosed(): boolean {
    return this.state === "closed";
  }

  private checkHealth(): void {
    if (this.state !== "online") return;
    // 自分で読むのを止めている間（背圧）は、黙っているのではない——止めた時間を沈黙に数えない（止める側が 15 秒で閉じる）。
    if (this.readHolds.size > 0) {
      this.lastReceivedAt = this.clock.now();
      return;
    }
    const quiet = this.clock.now() - this.lastReceivedAt;
    if (quiet >= LINK_TIMEOUTS.silenceMs) {
      this.finish({ timeout: "health" });
      return;
    }
    const now = this.clock.now();
    if (
      quiet >= LINK_TIMEOUTS.pingIntervalMs &&
      now - this.lastPingAt >= LINK_TIMEOUTS.pingIntervalMs
    ) {
      this.lastPingAt = now;
      this.writeFrame(encodeBridgeFrame(BRIDGE_FRAME.PING, 0, encodeJson(now)));
    }
  }

  private finish(info: Partial<LinkEnd>): void {
    if (this.state === "closed") return;
    this.state = "closed";
    this.end = { ...this.end, ...info };
    this.clock.clearTimeout(this.helloTimer);
    this.clock.clearInterval(this.healthTimer);
    this.readHolds.clear();
    for (const ch of [...this.channels.values()]) ch.remoteClosed(1012, "machine disconnected");
    this.channels.clear();
    const child = this.child;
    if (!child) this.resolveExited();
    if (child) {
      try {
        child.stdin.end();
      } catch {
        // 既に閉じている
      }
      child.kill("SIGTERM");
      this.clock.setTimeout(() => child.kill("SIGKILL"), LINK_TIMEOUTS.killGraceMs);
    }
    const failure = classifyLinkFailure({
      exitCode: this.end.exitCode ?? null,
      signal: this.end.signal ?? null,
      stderr: this.stderrBuf + this.stderrDecoder.end(),
      spawnError: this.end.spawnError,
      protocolError: this.end.protocolError,
      preambleOverflow: this.end.preambleOverflow ?? false,
      sawMarker: this.end.sawMarker ?? false,
      sawHello: this.end.sawHello ?? false,
      timeout: this.end.timeout,
      closedByUs: this.end.closedByUs ?? false,
    });
    this.logger?.info("machine link closed", {
      machine: this.profile.id,
      kind: failure.kind,
      reason: failure.message,
    });
    for (const cb of this.closedCbs) cb(failure);
  }
}

class LinkChannelImpl implements LinkChannel {
  private readonly textCbs: ((s: string) => void)[] = [];
  private readonly binaryCbs: ((b: Uint8Array) => void)[] = [];
  private readonly closeCbs: ((code: number, reason: string) => void)[] = [];
  private closed = false;
  private pending = 0;

  constructor(
    readonly id: number,
    private readonly link: MachineLink,
  ) {}

  get pendingBytes(): number {
    return this.pending;
  }

  sendText(s: string): void {
    this.send(BRIDGE_FRAME.TEXT, new TextEncoder().encode(s));
  }
  sendBinary(b: Uint8Array): void {
    this.send(BRIDGE_FRAME.BINARY, b);
  }

  private send(
    type: typeof BRIDGE_FRAME.TEXT | typeof BRIDGE_FRAME.BINARY,
    payload: Uint8Array,
  ): void {
    if (this.closed) return;
    if (payload.byteLength > BRIDGE_LIMITS.maxMessageBytes) {
      this.close(1009, "message too big");
      return;
    }
    const frame = encodeBridgeFrame(type, this.id, payload);
    this.pending += frame.byteLength;
    this.link.writeFrame(frame, () => {
      this.pending -= frame.byteLength;
    });
  }

  onText(cb: (s: string) => void): void {
    this.textCbs.push(cb);
  }
  onBinary(cb: (b: Uint8Array) => void): void {
    this.binaryCbs.push(cb);
  }
  onClose(cb: (code: number, reason: string) => void): void {
    this.closeCbs.push(cb);
  }

  /** こちら（ブラウザ側）から閉じる。リモートへ CLOSE を送る。 */
  close(code: number, reason: string): void {
    if (this.closed) return;
    this.link.writeFrame(
      encodeBridgeFrame(
        BRIDGE_FRAME.CLOSE,
        this.id,
        encodeJson({ code, reason: truncateUtf8(reason, 120) }),
      ),
    );
    this.finish(code, reason);
  }

  deliverText(s: string): void {
    if (!this.closed) for (const cb of this.textCbs) cb(s);
  }
  deliverBinary(b: Uint8Array): void {
    if (!this.closed) for (const cb of this.binaryCbs) cb(b);
  }
  remoteClosed(code: number, reason: string): void {
    if (!this.closed) this.finish(code, reason);
  }

  private finish(code: number, reason: string): void {
    this.closed = true;
    this.link.forgetChannel(this.id);
    for (const cb of this.closeCbs) cb(code, reason);
  }
}
