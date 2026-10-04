import { stat as fsStat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, isAbsolute, resolve as resolvePath } from "node:path";
import {
  ASK_FEATURES,
  ASK_MEDIA_FILE_MAX,
  ASK_MEDIA_FILES_MAX,
  ASK_MEDIA_TEXT_MAX,
  ASK_MEDIA_TOTAL_MAX,
  PANE_OP_ASK_FEATURES,
  PANE_OP_ASK_OPEN,
  askLimits,
  classifyMediaRef,
  normalizeAskSpec,
  unsupportedTypeReason,
  type AskFeatures,
  type AskResult,
  type AskSpec,
} from "@sodashitsu/protocol";
import { CliUsageError, type Command } from "../cliArgs.js";
import { printJson } from "../output.js";
import { callPaneOp, viaPaneSocketOrSession } from "../paneSocket.js";
import { resolveCallerPane } from "../paneTarget.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";

/** `sodactl ask`（20261002-sodactl-ask の design「sodactl ask」）。 */

type AskCmd = Extract<Command, { kind: "ask" }>;

/** 標準入力から読む大きさの上限（際限なく読まないための保険。定義の上限 `ASK_SPEC_MAX_BYTES` の判定は `normalizeAskSpec`）。 */
export const ASK_STDIN_MAX_BYTES = 1024 * 1024;
/** サーバが結果を返さないときの保険（`--timeout` に足す余裕）。 */
export const ASK_REQUEST_SLACK_MS = 15_000;

const ASK_USAGE = "sodactl ask [--timeout <ms>] < spec.json   |   sodactl ask --features";

export interface AskDeps {
  /** 標準入力を最後まで読む（`ASK_STDIN_MAX_BYTES` を超えたら使い方の誤り）。端末なら使い方の誤り。 */
  readStdin(): Promise<Buffer>;
  print(value: unknown): void;
  /** 受け口（`pane.sock`）へ 1 要求を送る（省くと実物の `callPaneOp`。テストが差し替える）。 */
  callPaneOp?: typeof callPaneOp;
  /** 相対パスを解く cwd・`~/` のホーム（省くと実物。テストが差し替える）。 */
  cwd?: () => string;
  home?: () => string;
  /** ファイルの種類と大きさ（無い・読めなければ null）。省くと実物の `stat`。 */
  stat?: (path: string) => Promise<{ isFile: boolean; size: number } | null>;
}

const realStat: NonNullable<AskDeps["stat"]> = async (path) => {
  try {
    const st = await fsStat(path);
    return { isFile: st.isFile(), size: st.size };
  } catch {
    return null;
  }
};

/** 標準入力を最後まで読む。端末（TTY）からは読まない（定義を打つ待ちで固まらないように）。 */
export function readStdinAll(stream: NodeJS.ReadableStream & { isTTY?: boolean }, max: number = ASK_STDIN_MAX_BYTES): Promise<Buffer> {
  if (stream.isTTY === true) {
    return Promise.reject(new CliUsageError("no spec on stdin", `質問の定義（JSON）を標準入力で渡してください。例: ${ASK_USAGE}`));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    stream.on("data", (chunk: Buffer | string) => {
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > max) {
        chunks.length = 0;
        (stream as { destroy?: () => void }).destroy?.(); // 以後は読まない（上限を超えた分を読み続けて溜めない）
        reject(new CliUsageError(`the spec on stdin is larger than ${max} bytes`, ASK_USAGE));
        return;
      }
      chunks.push(buf);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    // 読めない標準入力（壊れた fd 等）は、定義が無いのと同じ使い方の誤りとして終わる。
    stream.on("error", () => reject(new CliUsageError("cannot read the spec from stdin", ASK_USAGE)));
  });
}

const REAL_DEPS: AskDeps = {
  readStdin: () => readStdinAll(process.stdin),
  print: printJson,
};

/** 定義が使う機能（古いサーバに無ければ `unavailable` にする。名前は `ASK_FEATURES`）。 */
export function requiredFeatures(spec: AskSpec): string[] {
  const need = new Set<string>();
  if (spec.view !== undefined) need.add("view");
  for (const q of spec.questions) {
    if (q.type === "edit" || q.type === "rank" || q.type === "table") need.add(`types:${q.type}`);
    if (q.preview !== undefined || q.thumb !== undefined) need.add("media");
    for (const o of q.options) {
      if (o.image !== undefined || o.audio !== undefined || o.code !== undefined || o.lang !== undefined || o.group !== undefined) need.add("media");
      if (o.image?.startsWith("https://")) need.add("remote-image");
    }
  }
  return [...need];
}

/** 相対パス・`~/` をこの sodactl の cwd・ホームから絶対パスにする（サーバは別のプロセスで cwd が違う）。URL・`data:`・絶対パスはそのまま。 */
export function absolutizeRef(ref: string, cwd: string, home: string): string {
  if (/^(https:|data:)/i.test(ref) || isAbsolute(ref) || /^[A-Za-z]:[\\/]/.test(ref)) return ref;
  if (ref === "~" || ref.startsWith("~/") || ref.startsWith("~\\")) return resolvePath(home, ref.slice(2));
  return resolvePath(cwd, ref);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 読んだままの定義（正規化前）の、`image`・`audio`・`view.file` のパスを絶対にした写しを返す。見るのは検査を通った定義の形だけ
 * （知らない項目・文字列の選択肢はそのまま）。`refs` は事前確認用に、(場所, 絶対パス) を集める。
 */
export function absolutizePaths(
  raw: Record<string, unknown>,
  cwd: string,
  home: string,
): { spec: Record<string, unknown>; refs: { where: string; path: string; kind: "image" | "audio" | "view-text" | "view-html" | "view-other" }[] } {
  const spec = structuredClone(raw);
  const refs: { where: string; path: string; kind: "image" | "audio" | "view-text" | "view-html" | "view-other" }[] = [];
  const questions = Array.isArray(spec["questions"]) ? spec["questions"] : [];
  questions.forEach((q, qi) => {
    if (!isObj(q) || !Array.isArray(q["options"])) return;
    q["options"].forEach((o, oi) => {
      if (!isObj(o)) return;
      for (const kind of ["image", "audio"] as const) {
        const ref = o[kind];
        if (typeof ref !== "string" || ref === "" || classifyMediaRef(ref, kind, true) !== "path") continue;
        o[kind] = absolutizeRef(ref, cwd, home);
        refs.push({ where: `questions[${qi}].options[${oi}].${kind}`, path: o[kind] as string, kind });
      }
    });
  });
  const view = spec["view"];
  const items: unknown[] = Array.isArray(view) ? view : view === undefined || view === null ? [] : [view];
  items.forEach((v, i) => {
    const holder = typeof v === "string" ? null : v;
    const file = typeof v === "string" ? v : isObj(v) ? v["file"] : undefined;
    if (typeof file !== "string" || file === "" || classifyMediaRef(file, "file", true) !== "path") return;
    const abs = absolutizeRef(file, cwd, home);
    if (holder === null) (view as unknown[])[i] = { file: abs };
    else if (isObj(holder)) holder["file"] = abs;
    else if (!Array.isArray(view)) spec["view"] = { file: abs };
    const ext = extname(abs).toLowerCase();
    refs.push({ where: Array.isArray(view) ? `view[${i}]` : "view", path: abs, kind: ext === ".html" || ext === ".htm" ? "view-html" : [".md", ".markdown"].includes(ext) || ![".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"].includes(ext) ? "view-text" : "view-other" });
  });
  return { spec, refs };
}

/** ファイルの存在・通常ファイル・大きさ・個数・合計を、送る前に確かめる（サーバが同じ検査を持つ。早く・理由つきで終わらせるため）。 */
async function precheckFiles(refs: { where: string; path: string; kind: string }[], stat: NonNullable<AskDeps["stat"]>): Promise<void> {
  const seen = new Map<string, number>();
  let total = 0;
  for (const r of refs) {
    if (seen.has(r.path)) continue;
    const st = await stat(r.path);
    if (st === null) throw new CliUsageError(`invalid ask spec: ${r.where}: file not found`, ASK_USAGE);
    if (!st.isFile) throw new CliUsageError(`invalid ask spec: ${r.where}: not a regular file`, ASK_USAGE);
    const max = r.kind === "view-text" ? ASK_MEDIA_TEXT_MAX : ASK_MEDIA_FILE_MAX;
    if (st.size > max) throw new CliUsageError(`invalid ask spec: ${r.where}: the file is larger than ${max} bytes`, ASK_USAGE);
    seen.set(r.path, st.size);
    total += st.size;
    if (seen.size > ASK_MEDIA_FILES_MAX) throw new CliUsageError(`invalid ask spec: ${r.where}: more than ${ASK_MEDIA_FILES_MAX} media files in one question`, ASK_USAGE);
    if (total > ASK_MEDIA_TOTAL_MAX) throw new CliUsageError(`invalid ask spec: ${r.where}: the media in one question are larger than ${ASK_MEDIA_TOTAL_MAX} bytes in total`, ASK_USAGE);
  }
}

/**
 * 定義を読んで検査する。誤りは使い方の誤り（終了コード 2）。返すのは送るもの（読んだままのオブジェクト。ただし相対パスは絶対にしてある）。
 * 対応していない型の質問があれば `unsupported`（理由）を返す——黙って落とさず、サーバへも送らず `unavailable` にする（20261002-sodactl-ask 追補）。
 * `need` は定義が使う機能（古いサーバに無ければ `unavailable`）。
 */
export async function readAskSpec(
  deps: AskDeps,
): Promise<{ kind: "send"; spec: Record<string, unknown>; need: string[] } | { kind: "unsupported"; reason: string }> {
  const raw = await deps.readStdin();
  let parsed: unknown;
  try {
    // 先頭の BOM は読み飛ばす（BOM つきで JSON を書き出すエディタ・ツールがある）。
    parsed = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new CliUsageError("invalid ask spec: not valid JSON", ASK_USAGE);
  }
  // 相対パスは、この sodactl の cwd から解く（ここでは相対を通し、サーバへは絶対にして送る）。
  const checked = normalizeAskSpec(parsed, { relativePaths: true });
  if (!checked.ok && checked.unsupportedType !== undefined) return { kind: "unsupported", reason: unsupportedTypeReason(checked.unsupportedType) };
  if (!checked.ok) throw new CliUsageError(`invalid ask spec: ${checked.message}`, ASK_USAGE);
  const abs = absolutizePaths(parsed as Record<string, unknown>, (deps.cwd ?? (() => process.cwd()))(), (deps.home ?? homedir)());
  await precheckFiles(abs.refs, deps.stat ?? realStat);
  return { kind: "send", spec: abs.spec, need: requiredFeatures(checked.spec) };
}

/** サーバの機能確認。古いサーバ（`ask.features` を知らない＝`not_found`）は null。ほかの失敗はそのまま投げる。 */
async function probeServer(cmd: AskCmd, paneId: string, store: SessionStore, deps: AskDeps): Promise<AskFeatures | null> {
  try {
    return await viaPaneSocketOrSession<AskFeatures>(
      cmd.opts,
      paneId,
      { name: PANE_OP_ASK_FEATURES, timeoutMs: 10_000 },
      () =>
        withSession(cmd.opts, store, async (client) => {
          await client.hello();
          return client.request("ask.features", {});
        }),
      deps.callPaneOp,
    );
  } catch (err) {
    if (err instanceof RpcFailure && (err.code === "not_found" || err.code === "unknown_op")) return null;
    throw err;
  }
}

/** 古いサーバへの `unavailable` の理由（機能の名前だけ。定義の中身は入れない）。 */
export function missingFeaturesReason(missing: string[]): string {
  return `this server does not support ${missing.join(", ")} in ask forms (update soda)`;
}

/**
 * `sodactl ask --features`: sodactl の機能・上限と、サーバの機能（繋げない・古いときは null）を 1 行の JSON で出す（ask.py が窓へ落とすかの判断に使う）。常に終了コード 0。
 * 定義は読まない（標準入力を使わない）。pane の外・接続できない・認証できないときも `server: null`。
 */
async function runFeatures(cmd: AskCmd, store: SessionStore, deps: AskDeps): Promise<void> {
  let server: AskFeatures | null = null;
  const caller = cmd.opts.caller;
  if (caller !== undefined) {
    try {
      server = await probeServer(cmd, caller.paneId, store, deps);
    } catch {
      server = null;
    }
  }
  deps.print({ sodactl: [...ASK_FEATURES], limits: askLimits(), server });
}

/**
 * 呼び出し元の pane の質問を出し、結果が決まるまで待って 1 行の JSON で出す。4 つの `status` はどれも終了コード 0（区別は `status`）。
 * サーバ・接続・認証のエラーは終了コード 1（`reportAndExit`）、使い方・定義の誤りは 2。
 * 経路は 2 つ（20261003-sodactl-ask-socket）: その pane のサーバのログイン不要の受け口（`pane.sock`）を使えればそれで送り、使えなければ今までの
 * `/ws`（ログインが要る）。選ぶのは `viaPaneSocketOrSession`。pane の確認と定義の検査は、どちらの経路でも繋ぐ前に済ませる。
 * 新しい項目（メディア・成果物・`edit`/`rank`/`table`）を使う定義は、送る前に `ask.features` で確かめ、古いサーバなら `unavailable`（20261004-ask-media-popup）。
 * Ctrl+C・SIGTERM は何もしない（既定の動作でプロセスが終わり、接続が閉じる → サーバが質問を取り消してブラウザのダイアログを閉じる）。
 */
export async function runAsk(cmd: AskCmd, store: SessionStore, deps: AskDeps = REAL_DEPS): Promise<void> {
  if (cmd.features) return runFeatures(cmd, store, deps);
  const caller = cmd.opts.caller;
  if (caller === undefined) {
    throw new RpcFailure("caller_pane_unknown", "sodactl ask must run inside a pane (SODA_PANE_ID and SODA_SERVER_URL are not set)");
  }
  const paneId = resolveCallerPane(cmd.opts, { kind: "caller", paneId: caller.paneId, explicit: false }); // 接続する前に断る
  const read = await readAskSpec(deps);
  if (read.kind === "unsupported") {
    deps.print({ status: "unavailable", reason: read.reason } satisfies AskResult); // サーバへは送らない（接続もしない）
    return;
  }
  const spec = read.spec;
  if (read.need.length > 0) {
    const server = await probeServer(cmd, paneId, store, deps);
    const have = new Set(server?.features ?? []);
    const missing = read.need.filter((f) => !have.has(f));
    if (missing.length > 0) {
      deps.print({ status: "unavailable", reason: missingFeaturesReason(missing) } satisfies AskResult);
      return;
    }
  }
  const timeoutMs = cmd.timeoutMs;
  let result: AskResult;
  try {
    result = await viaPaneSocketOrSession<AskResult>(
      cmd.opts,
      paneId,
      { name: PANE_OP_ASK_OPEN, params: { spec, timeoutMs }, timeoutMs: timeoutMs + ASK_REQUEST_SLACK_MS },
      () =>
        withSession(cmd.opts, store, async (client) => {
          await client.hello();
          return requestAsk(client, paneId, spec, timeoutMs);
        }),
      deps.callPaneOp,
    );
  } catch (err) {
    // 版の違いで sodactl の検査を通った定義をサーバが断ったときも、使い方の誤りとして終わる（終了コード 2）。受け口・`/ws` のどちらが返しても同じ。
    if (err instanceof RpcFailure && err.code === "invalid_ask_spec") throw new CliUsageError(`invalid ask spec: ${err.message}`, ASK_USAGE);
    throw err;
  }
  deps.print(result);
}

/** `/ws` の経路: `ask.open` を送り、結果・接続の切断のどちらか早いほうで終わる（接続が切れても保留の要求は reject されないため）。 */
function requestAsk(client: SodaClient, paneId: string, spec: Record<string, unknown>, timeoutMs: number): Promise<AskResult> {
  return new Promise<AskResult>((resolve, reject) => {
    // `onClose` の購読は外せない（`SodaClient` に外す手段が無い）。結果が先に決まれば、あとの reject は無効で、接続を閉じても（`withSession` の finally）呼ばれない。
    client.onClose((_code, reason) => reject(new RpcFailure("connection_closed", `the server closed the connection${reason ? `: ${reason}` : ""}`)));
    // `invalid_ask_spec` の読み替えは `runAsk`（受け口の経路と同じ 1 か所）。
    client.request("ask.open", { paneId, spec, timeoutMs }, { timeoutMs: timeoutMs + ASK_REQUEST_SLACK_MS }).then(resolve, reject);
  });
}
