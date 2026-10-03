import { connect } from "node:net";
import { PANE_SOCKET_VERSION } from "@sodashitsu/protocol";
import type { GlobalOpts } from "./cliArgs.js";
import { RpcFailure } from "./wsClient.js";

/**
 * その pane のサーバの、ログイン不要の受け口（`pane.sock`）のクライアントと、経路の選択（20261003-sodactl-ask-socket の design「sodactl」）。
 * 受け口は **1 接続 1 要求**: 要求を 1 行の JSON で書き、返事を 1 行の JSON で読む（返事を書いたら受け口の側から閉じる）。
 * 受け口に載っている操作を使うコマンドは `viaPaneSocketOrSession` だけを使う（経路の選択をコマンドごとに持たない）。
 */

/**
 * 受け口を使うか（使うならそのパス）。条件（decisions D3 (l)）:
 * - 受け口のパスが分かる（`opts.paneSocket`。Windows では `parseArgs` が入れないので、ここで OS は見ない）。
 * - pane の中（`opts.caller` がある）。
 * - 接続先を明示していない（`--url`・`SODACTL_URL`。明示した先がその pane のサーバとは限らないので、明示したら今までの `/ws` の経路）。
 * - `--machine` が無い（別のマシン向け。`--machine local` は `opts.machine` を持たないので使う）。
 */
export function paneSocketFor(opts: GlobalOpts): string | undefined {
  if (!opts.paneSocket) return undefined;
  if (opts.caller === undefined || opts.urlExplicit || opts.machine !== undefined) return undefined;
  return opts.paneSocket;
}

export type PaneOpOutcome =
  | { kind: "result"; result: unknown }
  /** 受け口が使えない（繋げない・その操作を知らない）。呼び出し側は今までの `/ws` の経路へ。操作は始まっていない。 */
  | { kind: "fallback"; reason: string };

/** 受け口が「その操作を知らない・要求を読めない」と返す code（版の違う受け口。操作は始まっていないので `/ws` へ落ちてよい）。 */
const FALLBACK_CODES: readonly string[] = ["unknown_op", "bad_request"];

const NEWLINE = 0x0a;

/**
 * 受け口へ 1 要求を送って返事を待つ（design「`callPaneOp` の分岐」の表）。
 * - 接続できない（`connect` が成立する前のエラー）→ `fallback`。
 * - 返事 `{ok:true}` → `result`。`{ok:false}` で `unknown_op`・`bad_request` → `fallback`。それ以外の code（`pane_socket_busy` を含む）→ `RpcFailure(code)`。
 * - 繋がった後、返事の行が揃う前に閉じた（0 バイトで閉じる・要求の書き込みの途中のエラーを含む）・返事が読めない → `RpcFailure("connection_closed")`。
 *   `/ws` へは落ちない——操作が既に始まっているかもしれず、落ちると二重に行う（decisions D3 (m)）。
 * - `timeoutMs` を過ぎた → 接続を捨てて `RpcFailure("timeout")`。
 *
 * **要求は `write` で送り、返事の行を読むまで `end` しない**（受け口は相手の EOF を「呼び出し元が終わった」＝取り消しとして扱う）。
 */
export function callPaneOp(
  path: string,
  req: { op: string; paneId: string; params?: Record<string, unknown> },
  opts: { timeoutMs: number },
): Promise<PaneOpOutcome> {
  return new Promise<PaneOpOutcome>((resolve, reject) => {
    let connected = false;
    let settled = false;
    const chunks: Buffer[] = [];
    const sock = connect(path);

    /** 1 回だけ結果を決め、接続を捨てる（返事の後のデータ・エラーは見ない）。 */
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      fn();
    };
    const closed = (detail: string): void =>
      settle(() => reject(new RpcFailure("connection_closed", `the pane socket closed the connection ${detail}`)));

    const timer = setTimeout(
      () => settle(() => reject(new RpcFailure("timeout", `no reply from the pane socket for ${req.op} within ${opts.timeoutMs}ms`))),
      opts.timeoutMs,
    );

    sock.on("connect", () => {
      connected = true;
      const line: Record<string, unknown> = { v: PANE_SOCKET_VERSION, op: req.op, paneId: req.paneId };
      if (req.params !== undefined) line["params"] = req.params;
      sock.write(`${JSON.stringify(line)}\n`);
    });
    sock.on("data", (chunk: Buffer) => {
      const nl = chunk.indexOf(NEWLINE);
      if (nl < 0) {
        chunks.push(chunk);
        return;
      }
      // バイトのまま繋いでから読む（多バイト文字がかたまりの境目で割れていても壊さない）。2 行目以降は読まない。
      const text = Buffer.concat([...chunks, chunk.subarray(0, nl)]).toString("utf8");
      settle(() => {
        try {
          resolve(outcomeOf(text));
        } catch (err) {
          reject(err);
        }
      });
    });
    sock.on("error", (err: NodeJS.ErrnoException) => {
      // 繋がる前のエラー（ENOENT・ECONNREFUSED・EACCES・ENOTSOCK 等）だけが「受け口が使えない」。
      if (!connected) {
        settle(() => resolve({ kind: "fallback", reason: `cannot connect to the pane socket: ${err.code ?? err.message}` }));
        return;
      }
      // 繋がった後のエラー（受け口が先に閉じたときの EPIPE・ECONNRESET 等）はここでは決めない。続く `close` で決める——
      // エラーより前に**読めた**返事の行は `data` で既に結果になっている。
      // 読む前に要求の書き込みが失敗した（EPIPE）ときは、Node が接続を捨てるので、届いていても読んでいない返事は失われ、`connection_closed` になる。
      // これはクライアントの側では防げない。受け口の側が、要求を読まずに断るときは相手が閉じるまで読み捨てて待つことで防ぐ（`PaneSocket` の `refuse`）。
    });
    sock.on("close", () => closed("before replying"));
  });
}

/** 返事の 1 行を結果にする。読めない返事は `connection_closed`（返事が無かったのと同じ扱い。`/ws` へは落ちない）。 */
function outcomeOf(text: string): PaneOpOutcome {
  const malformed = (): RpcFailure => new RpcFailure("connection_closed", "the pane socket sent a reply that is not a valid response line");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw malformed();
  }
  if (typeof raw !== "object" || raw === null) throw malformed();
  const res = raw as { ok?: unknown; result?: unknown; error?: unknown };
  if (res.ok === true) return { kind: "result", result: res.result };
  if (res.ok !== false || typeof res.error !== "object" || res.error === null) throw malformed();
  const { code, message } = res.error as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || code === "") throw malformed();
  const msg = typeof message === "string" ? message : code;
  if (FALLBACK_CODES.includes(code)) return { kind: "fallback", reason: `${code}: ${msg}` };
  throw new RpcFailure(code, msg);
}

/** 受け口の操作（`viaPaneSocketOrSession` に渡す）。`timeoutMs` は返事を待つ上限。 */
export interface PaneOpCall {
  name: string;
  params?: Record<string, unknown>;
  timeoutMs: number;
}

/**
 * 受け口を使えれば使い、使えない（`paneSocketFor` が無い・`fallback`）なら `viaSession`（今までの `/ws` の経路）を呼ぶ。
 * 落ちたことは知らせない（decisions D3 (n)。落ちた先が成功すれば利用者に関係が無く、失敗すれば今までどおりのエラーが出る）。
 * 操作のエラー（`RpcFailure`）は落とさずそのまま投げる。`call` はテストの差し替え口（既定は実物の `callPaneOp`）。
 */
export async function viaPaneSocketOrSession<T>(
  opts: GlobalOpts,
  paneId: string,
  op: PaneOpCall,
  viaSession: () => Promise<T>,
  call: typeof callPaneOp = callPaneOp,
): Promise<T> {
  const path = paneSocketFor(opts);
  if (path === undefined) return viaSession();
  const req = op.params === undefined ? { op: op.name, paneId } : { op: op.name, paneId, params: op.params };
  const outcome = await call(path, req, { timeoutMs: op.timeoutMs });
  if (outcome.kind === "fallback") return viaSession();
  return outcome.result as T;
}
