import { PANE_OP_ASK_OPEN, normalizeAskSpec, unsupportedTypeReason, type AskResult } from "@sodashitsu/protocol";
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

const ASK_USAGE = "sodactl ask [--timeout <ms>] < spec.json";

export interface AskDeps {
  /** 標準入力を最後まで読む（`ASK_STDIN_MAX_BYTES` を超えたら使い方の誤り）。端末なら使い方の誤り。 */
  readStdin(): Promise<Buffer>;
  print(value: unknown): void;
  /** 受け口（`pane.sock`）へ 1 要求を送る（省くと実物の `callPaneOp`。テストが差し替える）。 */
  callPaneOp?: typeof callPaneOp;
}

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

/**
 * 定義を読んで検査する。誤りは使い方の誤り（終了コード 2）。返すのは送るもの（読んだままのオブジェクト）。
 * 対応していない型の質問があれば `unsupported`（理由）を返す——黙って落とさず、サーバへも送らず `unavailable` にする（20261002-sodactl-ask 追補）。
 */
export async function readAskSpec(deps: AskDeps): Promise<{ kind: "send"; spec: Record<string, unknown> } | { kind: "unsupported"; reason: string }> {
  const raw = await deps.readStdin();
  let parsed: unknown;
  try {
    // 先頭の BOM は読み飛ばす（BOM つきで JSON を書き出すエディタ・ツールがある）。
    parsed = JSON.parse(raw.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new CliUsageError("invalid ask spec: not valid JSON", ASK_USAGE);
  }
  const checked = normalizeAskSpec(parsed);
  if (!checked.ok && checked.unsupportedType !== undefined) return { kind: "unsupported", reason: unsupportedTypeReason(checked.unsupportedType) };
  if (!checked.ok) throw new CliUsageError(`invalid ask spec: ${checked.message}`, ASK_USAGE);
  return { kind: "send", spec: parsed as Record<string, unknown> };
}

/**
 * 呼び出し元の pane の質問を出し、結果が決まるまで待って 1 行の JSON で出す。4 つの `status` はどれも終了コード 0（区別は `status`）。
 * サーバ・接続・認証のエラーは終了コード 1（`reportAndExit`）、使い方・定義の誤りは 2。
 * 経路は 2 つ（20261003-sodactl-ask-socket）: その pane のサーバのログイン不要の受け口（`pane.sock`）を使えればそれで送り、使えなければ今までの
 * `/ws`（ログインが要る）。選ぶのは `viaPaneSocketOrSession`。pane の確認と定義の検査は、どちらの経路でも繋ぐ前に済ませる。
 * Ctrl+C・SIGTERM は何もしない（既定の動作でプロセスが終わり、接続が閉じる → サーバが質問を取り消してブラウザのダイアログを閉じる）。
 */
export async function runAsk(cmd: AskCmd, store: SessionStore, deps: AskDeps = REAL_DEPS): Promise<void> {
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
