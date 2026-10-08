import { readFile as fsReadFile, stat as fsStat } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import {
  DISPLAY_CONTENT_MAX_BYTES,
  DISPLAY_FEATURES,
  DISPLAY_OLD_REQUEST_LINE_BYTES,
  DISPLAY_REQUEST_LINE_BYTES,
  DISPLAY_SEND_MAX_BYTES,
  DISPLAY_SCRIPT_FORMAT,
  DISPLAY_WAIT_DEFAULT_MS,
  DISPLAY_WAIT_MIN_MS,
  checkDisplaySend,
  checkDisplaySet,
  displayLimits,
  displayUtf8Bytes,
  type DisplayFeatures,
  type DisplayLine,
  type DisplaySetResult,
  type DisplayWaitResult,
  type MethodName,
} from "@sodashitsu/protocol";
import { CliUsageError, DISPLAY_USAGE, type Command, type DisplayAction } from "../cliArgs.js";
import { resolvePaneRefViaConnect } from "../idRef.js";
import { printJson } from "../output.js";
import { callPaneOp, paneSocketFor } from "../paneSocket.js";
import { resolveCallerPane } from "../paneTarget.js";
import { selfPaneId } from "../selfGuard.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";

/**
 * `sodactl display`（20261007-soda-extensions の design「sodactl」）。pane のプログラムが、その pane の表示の面（パネル・帯）を出す・閉じる・一覧する・操作を待つ。
 * 経路は 2 つ: その pane のサーバのログイン不要の受け口（`pane.sock`）を使えればそれ、使えなければ `/ws`（ログインが要る）。
 * `ask` と違い、**受け口が `unknown_op` を返したら `/ws` へ落とさずに古いサーバとする**（`DisplayUnsupported`）。
 */

type DisplayCmd = Extract<Command, { kind: "display" }>;

/** サーバが `display` を知らない（古い）。コマンドごとに `unsupported` の出力にする。 */
export class DisplayUnsupported extends Error {
  constructor() {
    super("this server does not support display surfaces (update soda)");
    this.name = "DisplayUnsupported";
  }
}
export const DISPLAY_UNSUPPORTED_REASON = "this server does not support display surfaces (update soda)";
/** 表示の面は知っているが `script-html`・`send` を知らない（静的な形式だけの版）。 */
/** `script-html` が設定で無効のときの理由（`display_script_disabled`）。 */
export const DISPLAY_SCRIPT_DISABLED_REASON = "script-html displays are disabled in the settings (スクリプトが動く表示は、設定で無効になっています。設定の画面で「スクリプトが動く表示を許可する」を有効にしてください)";
export const DISPLAY_SCRIPT_UNSUPPORTED_REASON = "this server does not support script-html displays (update soda)";

/** `script-html`・`send` を知らないサーバ（静的な形式だけの版）。`script-html` を出す前に、`display.features` で確かめる。 */
export class DisplayScriptUnsupported extends Error {
  constructor() {
    super(DISPLAY_SCRIPT_UNSUPPORTED_REASON_TEXT);
    this.name = "DisplayScriptUnsupported";
  }
}
const DISPLAY_SCRIPT_UNSUPPORTED_REASON_TEXT = "this server does not support script-html displays (update soda)";

/** `wait` の 1 回の待ち。空で返ったら次を呼ぶ。 */
export const DISPLAY_WAIT_CALL_MS = DISPLAY_WAIT_DEFAULT_MS;
/** 結果が返らないときの保険（待ちの時間に足す余裕）。 */
export const DISPLAY_REQUEST_SLACK_MS = 15_000;
/** 切れてから繋ぎ直しを続ける上限と間隔。 */
export const DISPLAY_RECONNECT_MS = 5_000;
export const DISPLAY_RECONNECT_INTERVAL_MS = 150;
/** 要求の 1 行の上限に対する余裕（受け口の 1 行と `/ws` の 1 通の枠の違い・id などの分）。 */
export const DISPLAY_LINE_MARGIN_BYTES = 512;

/** 1 つの経路で `op` を呼ぶ。`params` に `paneId` は入れない（transport が足す）。 */
export interface DisplayTransport {
  call(op: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown>;
}

export interface DisplayDeps {
  /** 標準入力を `max` バイトまで読む（超えたら使い方の誤り。端末なら使い方の誤り）。 */
  readStdin(max: number): Promise<Buffer>;
  /** 通常のファイルを `max` バイトまで読む（無い・通常のファイルでない・超えたら使い方の誤り）。相対パスは cwd から解く。 */
  readFile(path: string, max: number): Promise<Buffer>;
  /** stdout に 1 行の JSON を書く。 */
  print(value: unknown): void;
  /** stdout が閉じたか（読み手が閉じた）。 */
  outputClosed(): boolean;
  callPaneOp?: typeof callPaneOp;
  /** テストの差し替え口。省くと実物（受け口 → `/ws`）。 */
  transport?: DisplayTransport;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// --- 実物の入出力 ----------------------------------------------------------------------------

function readStdinLimited(stream: NodeJS.ReadableStream & { isTTY?: boolean }, max: number): Promise<Buffer> {
  if (stream.isTTY === true) {
    return Promise.reject(new CliUsageError("no content on stdin", `表示する中身を標準入力で渡すか、--text・--markdown-file・--html-file を付けてください。\n${DISPLAY_USAGE}`));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > max) {
        chunks.length = 0;
        (stream as { destroy?: () => void }).destroy?.(); // 以後は読まない
        reject(new CliUsageError(`the content on stdin is larger than ${max} bytes`, DISPLAY_USAGE));
        return;
      }
      chunks.push(buf);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", () => reject(new CliUsageError("cannot read the content from stdin", DISPLAY_USAGE)));
  });
}

async function readRegularFile(path: string, max: number): Promise<Buffer> {
  let st;
  try {
    st = await fsStat(resolvePath(path));
  } catch {
    throw new CliUsageError(`cannot read ${path}: file not found`, DISPLAY_USAGE);
  }
  if (!st.isFile()) throw new CliUsageError(`cannot read ${path}: not a regular file`, DISPLAY_USAGE);
  if (st.size > max) throw new CliUsageError(`${path} is larger than ${max} bytes`, DISPLAY_USAGE);
  let buf: Buffer;
  try {
    buf = await fsReadFile(resolvePath(path));
  } catch {
    throw new CliUsageError(`cannot read ${path}`, DISPLAY_USAGE);
  }
  if (buf.length > max) throw new CliUsageError(`${path} is larger than ${max} bytes`, DISPLAY_USAGE);
  return buf;
}

let stdoutClosed = false;
function realPrint(value: unknown): void {
  if (stdoutClosed) return;
  printJson(value);
}
function watchStdout(): void {
  process.stdout.once("error", () => (stdoutClosed = true));
  process.stdout.once("close", () => (stdoutClosed = true));
}

export const REAL_DISPLAY_DEPS: DisplayDeps = {
  readStdin: (max) => readStdinLimited(process.stdin, max),
  readFile: readRegularFile,
  print: realPrint,
  outputClosed: () => stdoutClosed || process.stdout.destroyed || process.stdout.writableEnded,
};

// --- 経路 ------------------------------------------------------------------------------------

/** 繋ぎ直す価値のある失敗（切れた・繋がらない・入れ替えの途中）か。 */
export function isReconnectable(err: unknown): boolean {
  if (err instanceof RpcFailure) return err.code === "connection_closed" || err.code === "pane_socket_busy" || err.code === "machine_unavailable";
  if (err instanceof Error && !(err instanceof CliUsageError)) {
    const code = (err as { code?: unknown }).code;
    return code === "ECONNREFUSED" || code === "ECONNRESET" || code === "EPIPE" || code === "ENOTFOUND" || code === "ETIMEDOUT" || code === "ECONNABORTED";
  }
  return false;
}

/** `/ws` の 1 要求。結果・接続の切断のどちらか早いほうで終わる（接続が切れても保留の要求は reject されないため）。 */
function requestOverWs(client: SodaClient, op: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    client.onClose((_code, reason) => reject(new RpcFailure("connection_closed", `the server closed the connection${reason ? `: ${reason}` : ""}`)));
    client.request(op as MethodName, params as never, { timeoutMs }).then(resolve, reject);
  });
}

class RealTransport implements DisplayTransport {
  /** `socket`: 受け口で 1 回通った。`ws`: 受け口を使わない（使えなかった）。 */
  private route: "unknown" | "socket" | "ws" = "unknown";

  constructor(
    private readonly cmd: DisplayCmd,
    private readonly store: SessionStore,
    private readonly paneId: string,
    private readonly socketPath: string | undefined,
    private readonly callOp: typeof callPaneOp,
  ) {}

  async call(op: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (this.socketPath !== undefined && this.route !== "ws") {
      const outcome = await this.callOp(this.socketPath, { op, paneId: this.paneId, params }, { timeoutMs });
      if (outcome.kind === "result") {
        this.route = "socket";
        return outcome.result;
      }
      // 受け口はその pane のサーバのもの。そこが知らなければ古いサーバと決まる（`/ws` へは落とさない）。
      if (outcome.reason.startsWith("unknown_op")) throw new DisplayUnsupported();
      // 一度受け口で通った後に使えなくなった（サーバが止まった等）なら、`/ws` へ落とさず切れたものとして扱う（繋ぎ直しの対象）。
      if (this.route === "socket") throw new RpcFailure("connection_closed", outcome.reason);
      this.route = "ws";
    }
    return this.viaWs(op, params, timeoutMs);
  }

  private async viaWs(op: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    const withPane = op === "display.features" ? params : { paneId: this.paneId, ...params };
    const run = (o: string, p: Record<string, unknown>, t: number): Promise<unknown> =>
      withSession(this.cmd.opts, this.store, async (client) => {
        await client.hello();
        return requestOverWs(client, o, p, t);
      });
    try {
      return await run(op, withPane, timeoutMs);
    } catch (err) {
      if (!(err instanceof RpcFailure) || err.code !== "not_found") throw err;
      // `/ws` の `not_found` は「知らない方式（古いサーバ）」と「pane が無い」の両方で返る。`display.features` で見分ける。
      if (op === "display.features") throw new DisplayUnsupported();
      try {
        await run("display.features", {}, 10_000);
      } catch (probe) {
        if (probe instanceof RpcFailure && probe.code === "not_found") throw new DisplayUnsupported();
        throw probe;
      }
      throw err; // 方式は通る → pane が無い
    }
  }
}

/** 対象の pane と、受け口を使えるか。`--pane` を省くと呼び出し元の pane。呼び出し元と違う pane は `/ws`。 */
async function resolveDisplayPane(cmd: DisplayCmd, store: SessionStore, spec: string | undefined): Promise<{ paneId: string; socket: string | undefined }> {
  const opts = cmd.opts;
  if (spec === undefined) {
    if (opts.caller === undefined) {
      throw new RpcFailure("caller_pane_unknown", "sodactl display must run inside a pane (SODA_PANE_ID and SODA_SERVER_URL are not set); pass --pane <paneId>");
    }
    const paneId = resolveCallerPane(opts, { kind: "caller", paneId: opts.caller.paneId, explicit: false }); // 接続する前に断る
    return { paneId, socket: paneSocketFor(opts) };
  }
  const paneId = await resolvePaneRefViaConnect(opts, store, spec);
  const self = selfPaneId(opts);
  return { paneId, socket: self !== undefined && self === paneId ? paneSocketFor(opts) : undefined };
}

async function openTransport(cmd: DisplayCmd, store: SessionStore, deps: DisplayDeps, spec: string | undefined): Promise<{ paneId: string; tr: DisplayTransport }> {
  const { paneId, socket } = await resolveDisplayPane(cmd, store, spec);
  const tr = deps.transport ?? new RealTransport(cmd, store, paneId, socket, deps.callPaneOp ?? callPaneOp);
  return { paneId, tr };
}

// --- 中身の読み込み --------------------------------------------------------------------------

const decoder = new TextDecoder("utf-8", { fatal: true });

async function readContent(a: Extract<DisplayAction, { kind: "set" }>, deps: DisplayDeps): Promise<{ format: string; content: string }> {
  if (a.source.kind === "text") return { format: "text", content: a.source.text };
  const buf = a.source.kind === "file" ? await deps.readFile(a.source.path, DISPLAY_CONTENT_MAX_BYTES) : await deps.readStdin(DISPLAY_CONTENT_MAX_BYTES);
  // 中身の指定が無く、標準入力も空（`/dev/null`・空のパイプ）なら、空の面を出さずに誤りにする。空を出したいときは `--text ""`。
  if (a.source.kind === "stdin" && buf.length === 0) {
    throw new CliUsageError("no content on stdin", `標準入力が空です。中身を渡すか、--text・--markdown-file・--html-file を付けてください（空の面は --text "" で出せます）。\n${DISPLAY_USAGE}`);
  }
  let content: string;
  try {
    content = decoder.decode(buf);
  } catch {
    throw new CliUsageError(`${a.source.kind === "file" ? a.source.path : "stdin"} is not valid UTF-8`, DISPLAY_USAGE);
  }
  return { format: a.source.format, content };
}

// --- 実行 ------------------------------------------------------------------------------------

/**
 * 実行して終了コードを返す（0 か 1。使い方の誤り・サーバのエラーは投げて、`reportAndExit` が 2・1 にする）。
 * 古いサーバは `{"status":"unsupported",…}` で終了コード 0（`events` は `display.end`〔`unsupported`〕）。
 */
export async function runDisplay(cmd: DisplayCmd, store: SessionStore, deps: DisplayDeps = REAL_DISPLAY_DEPS): Promise<number> {
  if (deps === REAL_DISPLAY_DEPS) watchStdout();
  const a = cmd.action;
  try {
    switch (a.kind) {
      case "features":
        return await runFeatures(cmd, store, deps);
      case "set":
        return await runSet(cmd, a, store, deps);
      case "send":
        return await runSend(cmd, a, store, deps);
      case "close": {
        const { tr } = await openTransport(cmd, store, deps, a.pane);
        const res = (await tr.call("display.close", a.all ? { all: true } : { name: a.name }, 30_000)) as { closed: string[] };
        deps.print({ status: "ok", closed: res.closed });
        return 0;
      }
      case "list": {
        const { tr } = await openTransport(cmd, store, deps, a.pane);
        const res = (await tr.call("display.list", {}, 30_000)) as { displays: unknown[] };
        deps.print({ status: "ok", displays: res.displays });
        return 0;
      }
      case "wait":
      case "events":
        return await runEvents(cmd, a, store, deps);
    }
  } catch (err) {
    if (err instanceof DisplayScriptUnsupported) {
      deps.print({ status: "unsupported", reason: DISPLAY_SCRIPT_UNSUPPORTED_REASON });
      return 0;
    }
    if (err instanceof DisplayUnsupported) {
      if (a.kind === "events") deps.print({ type: "display.end", reason: "unsupported" } satisfies DisplayLine);
      else deps.print({ status: "unsupported", reason: DISPLAY_UNSUPPORTED_REASON });
      return 0;
    }
    throw err;
  }
}

async function runFeatures(cmd: DisplayCmd, store: SessionStore, deps: DisplayDeps): Promise<number> {
  let server: DisplayFeatures | null = null;
  try {
    // 呼び出し元の pane があれば、その pane のサーバの受け口（ログイン不要）で聞く。無ければ `/ws`（pane は要らない）。
    const caller = cmd.opts.caller;
    const { paneId, socket } = caller !== undefined ? await resolveDisplayPane(cmd, store, undefined) : { paneId: "", socket: undefined };
    const tr = deps.transport ?? new RealTransport(cmd, store, paneId, socket, deps.callPaneOp ?? callPaneOp);
    server = (await tr.call("display.features", {}, 10_000)) as DisplayFeatures;
  } catch {
    server = null; // 古い・繋げない・未ログイン・pane の外
  }
  deps.print({ sodactl: [...DISPLAY_FEATURES], limits: displayLimits(), server });
  return 0;
}

async function requireScriptFeatures(tr: DisplayTransport, need: string[]): Promise<DisplayFeatures> {
  const f = (await tr.call("display.features", {}, 10_000)) as DisplayFeatures;
  const have = Array.isArray(f.features) ? f.features : [];
  if (!need.every((x) => have.includes(x))) throw new DisplayScriptUnsupported();
  // この版は知っているが、設定で無効（既定）。「未対応」（終了コード 0）とは別に、エラー（終了コード 1。`display_script_disabled`）にする。
  if (f.scriptEnabled === false) throw new RpcFailure("display_script_disabled", DISPLAY_SCRIPT_DISABLED_REASON);
  return f;
}

/** `send`: スクリプトが動く面へデータを送る（保存されない）。データは `--json` か標準入力。 */
async function runSend(cmd: DisplayCmd, a: Extract<DisplayAction, { kind: "send" }>, store: SessionStore, deps: DisplayDeps): Promise<number> {
  let text = a.json;
  if (text === undefined) {
    // 64 KiB を超えるものは、読み切る前に使い方の誤り。
    const buf = await deps.readStdin(DISPLAY_SEND_MAX_BYTES + 1);
    if (buf.length === 0) throw new CliUsageError("no data on stdin", `送るデータを --json か標準入力で渡してください。\n${DISPLAY_USAGE}`);
    try {
      text = decoder.decode(buf);
    } catch {
      throw new CliUsageError("stdin is not valid UTF-8", DISPLAY_USAGE);
    }
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new CliUsageError("the data is not valid JSON", `送るデータは JSON として読める必要があります。\n${DISPLAY_USAGE}`);
  }
  const checked = checkDisplaySend(data);
  if (!checked.ok) throw new CliUsageError(`invalid data: ${checked.reason}`, DISPLAY_USAGE);
  const { tr } = await openTransport(cmd, store, deps, a.pane);
  await requireScriptFeatures(tr, ["format:script-html", "send"]);
  const res = (await tr.call("display.send", { name: a.name, data }, 30_000)) as { delivered: number };
  deps.print({ status: "ok", delivered: res.delivered });
  return 0;
}

async function runSet(cmd: DisplayCmd, a: Extract<DisplayAction, { kind: "set" }>, store: SessionStore, deps: DisplayDeps): Promise<number> {
  const { format, content } = await readContent(a, deps);
  const checked = checkDisplaySet({
    name: a.name,
    kind: a.displayKind,
    format,
    content,
    ...(a.title !== undefined ? { title: a.title } : {}),
    ...(a.size !== undefined ? { size: a.size } : {}),
    ...(a.ttlMs !== undefined ? { ttlMs: a.ttlMs } : {}),
  });
  if (!checked.ok) throw new CliUsageError(`invalid display: ${checked.reason}`, DISPLAY_USAGE);
  const { paneId, tr } = await openTransport(cmd, store, deps, a.pane);
  const body = checked.value as unknown as Record<string, unknown>;
  // `script-html` は、出す前に必ず機能確認（`format:script-html`・`send` が無い版は「未対応」。古い受け口の `unknown_op` は `DisplayUnsupported`）。
  if (format === DISPLAY_SCRIPT_FORMAT) await requireScriptFeatures(tr, ["format:script-html", "send"]);

  // 組み立てた要求の 1 行が上限を超えないか（中身は JSON の文字列として載るので、エスケープの要る文字が多いと 2 MiB 以内でも 1 行が膨らむ）。
  const line = displayUtf8Bytes(JSON.stringify({ v: 1, op: "display.set", paneId, params: body })) + 1;
  // `/ws` の 1 通（`{id,method,params:{paneId,…}}`）も同じ上限に収まるよう、余裕（`DISPLAY_LINE_MARGIN_BYTES`）を持たせる。超える通信は切れてしまうので、送らずに誤りにする。
  if (line + DISPLAY_LINE_MARGIN_BYTES > DISPLAY_REQUEST_LINE_BYTES) {
    throw new CliUsageError("the request is too large: the content has too many characters that need escaping (\", \\, newlines, control characters)", DISPLAY_USAGE);
  }
  // 古いサーバの受け口は 1 行 1 MiB で、超えると `bad_request` を返して `/ws` へ落ちてしまう。先に機能確認をして、古いサーバは「未対応」と分かるようにする。
  if (line > DISPLAY_OLD_REQUEST_LINE_BYTES) {
    const f = (await tr.call("display.features", {}, 10_000)) as DisplayFeatures;
    const lim = f.limits as { requestLineBytes?: unknown; contentBytes?: unknown } | undefined;
    if (typeof lim?.requestLineBytes === "number" && line + DISPLAY_LINE_MARGIN_BYTES > lim.requestLineBytes) {
      throw new CliUsageError(`the request (${line} bytes) is larger than this server accepts (${lim.requestLineBytes} bytes)`, DISPLAY_USAGE);
    }
    if (typeof lim?.contentBytes === "number" && displayUtf8Bytes(content) > lim.contentBytes) {
      throw new CliUsageError(`the content is larger than this server accepts (${lim.contentBytes} bytes)`, DISPLAY_USAGE);
    }
  }
  let result: DisplaySetResult;
  try {
    result = (await tr.call("display.set", body, 60_000)) as DisplaySetResult;
  } catch (err) {
    // 版の違いで sodactl の検査を通ったものをサーバが断ったときも、使い方の誤りとして終わる（終了コード 2）。
    if (err instanceof RpcFailure && err.code === "invalid_display") throw new CliUsageError(`invalid display: ${err.message}`, DISPLAY_USAGE);
    throw err;
  }
  if (!a.wait) {
    deps.print({ status: "ok", display: result.display, renderers: result.renderers, epoch: result.epoch, next: result.next });
    return 0;
  }
  // `set` と `wait` の間の出来事を落とさないよう、`set` の結果の `epoch`・`next` から待つ。
  const io = makeLoopIo(tr, deps);
  const out = await runWaitLoop(io, { names: [a.name], since: result.next, epoch: result.epoch, mode: "once", totalTimeoutMs: a.timeoutMs });
  return finishOnce(out, deps);
}

async function runEvents(cmd: DisplayCmd, a: Extract<DisplayAction, { kind: "wait" | "events" }>, store: SessionStore, deps: DisplayDeps): Promise<number> {
  const { paneId, tr } = await openTransport(cmd, store, deps, a.pane);
  // まず機能確認で `epoch` を得る（ここで古いサーバも分かる）。
  const f = (await tr.call("display.features", {}, 10_000)) as DisplayFeatures;
  // `display.ready` の後の出来事を落とさないよう、ready を出す前に、その pane の今の通し番号（と、それを数えたサーバの印）を得て、最初の待ちから `since` を付ける。
  const l = (await tr.call("display.list", {}, 10_000)) as { seq?: unknown; epoch?: unknown };
  const serverEpoch = typeof l.epoch === "string" ? l.epoch : f.epoch;
  const startSince = a.since ?? (typeof l.seq === "number" ? l.seq : undefined);
  const io = makeLoopIo(tr, deps);
  const stream = a.kind === "events";
  if (stream) io.emit({ type: "display.ready", v: 1, paneId, epoch: serverEpoch, features: f.features, renderers: f.renderers });
  const names = a.kind === "wait" ? (a.name === undefined ? [] : [a.name]) : a.names;
  let out: LoopOutcome;
  try {
    out = await runWaitLoop(io, {
      names,
      since: startSince,
      epoch: a.epoch ?? serverEpoch,
      mode: stream ? "stream" : "once",
      totalTimeoutMs: a.kind === "wait" ? a.timeoutMs : undefined,
    });
  } catch (err) {
    // 待ちの上限（pane 4・全体）。黙って終わらず、終わりの行に理由を出し、エラー（標準エラー）はそのまま投げる。
    if (stream && err instanceof RpcFailure && err.code === "display_busy") deps.print({ type: "display.end", reason: "busy" } satisfies DisplayLine);
    throw err;
  }
  if (!stream) return finishOnce(out, deps);
  if (out.end === "done") return 0;
  deps.print({ type: "display.end", reason: out.end } satisfies DisplayLine);
  return out.end === "connection_closed" ? 1 : 0;
}

/** `wait`・`set --wait` の終わり方。 */
function finishOnce(out: LoopOutcome, deps: DisplayDeps): number {
  switch (out.end) {
    case "done":
      return 0;
    case "unsupported":
      deps.print({ status: "unsupported", reason: DISPLAY_UNSUPPORTED_REASON });
      return 0;
    case "pane_closed":
      throw out.error ?? new RpcFailure("not_found", "pane not found");
    case "connection_closed":
      throw out.error instanceof RpcFailure ? out.error : new RpcFailure("connection_closed", "lost the connection to the server");
  }
}

// --- 待ちの繰り返し --------------------------------------------------------------------------

export interface WaitLoopIo {
  /** `display.wait` を 1 回呼ぶ（`paneId` は経路が足す）。 */
  call(params: Record<string, unknown>, timeoutMs: number): Promise<DisplayWaitResult>;
  /** 行を stdout へ。stdout が閉じていれば行を出さずに `output_closed` を投げる。 */
  emit(line: DisplayLine): void;
  now(): number;
  sleep(ms: number): Promise<void>;
}

export type LoopOutcome =
  | { end: "done" }
  | { end: "unsupported" }
  | { end: "pane_closed"; error?: RpcFailure }
  | { end: "connection_closed"; error?: unknown };

function makeLoopIo(tr: DisplayTransport, deps: DisplayDeps): WaitLoopIo {
  return {
    call: (params, timeoutMs) => tr.call("display.wait", { ...params, timeoutMs }, timeoutMs + DISPLAY_REQUEST_SLACK_MS) as Promise<DisplayWaitResult>,
    emit: (line) => {
      if (deps.outputClosed()) throw new RpcFailure("output_closed", "stdout was closed");
      deps.print(line);
      if (deps.outputClosed()) throw new RpcFailure("output_closed", "stdout was closed");
    },
    now: deps.now ?? (() => Date.now()),
    sleep: deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))),
  };
}

/**
 * `display.wait` を繰り返して、出来事を行にする（design「`wait`・`events` の繰り返し」）。
 * - `once`（`wait`・`set --wait`）: 出来事を 1 つ出したら（または `reset`・時間切れ）終わる。`stream`（`events`）: 出し続ける。
 * - 毎回 `epoch` を渡す（待っている最中にサーバが入れ替わっても、繋ぎ直した先で `reset` になる）。`dropped` は行にする（`stream` のみ）。
 * - 切れた（`connection_closed`・繋がらない・入れ替えの途中）は、最初の失敗から 5 秒まで 150ms おきに繋ぎ直す。戻らなければ `connection_closed`。
 * - `not_found`（`display.features` が通る＝pane が無い）は `pane_closed`。古いサーバは `unsupported`。
 */
export async function runWaitLoop(
  io: WaitLoopIo,
  o: { names: string[]; since: number | undefined; epoch: string; mode: "once" | "stream"; totalTimeoutMs: number | undefined },
): Promise<LoopOutcome> {
  const started = io.now();
  let epoch = o.epoch;
  let since = o.since;
  let firstFail: number | undefined;
  let asked = false;
  for (;;) {
    let callMs = DISPLAY_WAIT_CALL_MS;
    if (o.totalTimeoutMs !== undefined) {
      const left = o.totalTimeoutMs - (io.now() - started);
      if (left <= 0 && asked) {
        io.emit({ type: "display.timeout" });
        return { end: "done" };
      }
      // サーバの 1 回の待ちは 1 秒以上。残りが 1 秒に満たないときは、サーバに聞かず、残りの時間だけ待って時間切れにする（全体の待ち時間を超えない）。
      // ただし、まだ一度も聞いていないときは、残りが短くても 1 回は聞く（サーバの最小の 1 秒で）。
      if (left < DISPLAY_WAIT_MIN_MS && asked) {
        await io.sleep(left);
        io.emit({ type: "display.timeout" });
        return { end: "done" };
      }
      callMs = Math.min(DISPLAY_WAIT_CALL_MS, Math.max(DISPLAY_WAIT_MIN_MS, left));
    }
    let res: DisplayWaitResult;
    try {
      asked = true;
      res = await io.call({ ...(since !== undefined ? { since } : {}), epoch, ...(o.names.length > 0 ? { names: o.names } : {}) }, callMs);
    } catch (err) {
      if (err instanceof DisplayUnsupported) return { end: "unsupported" };
      if (err instanceof RpcFailure && err.code === "not_found") return { end: "pane_closed", error: err };
      if (isReconnectable(err)) {
        firstFail ??= io.now();
        if (io.now() - firstFail + DISPLAY_RECONNECT_INTERVAL_MS > DISPLAY_RECONNECT_MS) return { end: "connection_closed", error: err };
        await io.sleep(DISPLAY_RECONNECT_INTERVAL_MS);
        continue;
      }
      throw err;
    }
    firstFail = undefined;
    if (res.reset) {
      // 入れ替え・再起動。新しい `epoch`・今の `next` から続ける。
      io.emit({ type: "display.reset", reason: "server_restarted", epoch: res.epoch });
      epoch = res.epoch;
      since = res.next;
      if (o.mode === "once") return { end: "done" };
      continue;
    }
    epoch = res.epoch;
    since = res.next;
    if (res.dropped > 0 && o.mode === "stream") io.emit({ type: "display.dropped", count: res.dropped });
    if (res.events.length > 0) {
      if (o.mode === "once") {
        io.emit(res.events[0]!);
        return { end: "done" };
      }
      for (const ev of res.events) io.emit(ev);
    }
  }
}
