import { z } from "zod";
import type { ErrorCode } from "./errors.js";
import { AskOpenParams } from "./messages.js";

/**
 * pane の中のプログラム向けの、ログイン不要の受け口（`pane.sock`。20261003-sodactl-ask-socket の design「やりとり」）。
 * 状態ディレクトリの Unix ドメイン socket（0600＝同じ利用者だけ）で、**1 接続 1 要求**: 要求を 1 行の JSON で送り、返事を 1 行の JSON で受ける
 * （受け口は返事を書いたら接続を閉じる。2 行目以降は読まない）。`/ws` の RPC は通さず、受け口に登録した操作だけを受ける。
 */

/**
 * 受け口の socket のファイル名（状態ディレクトリの中）。サーバ（`paneSocketPathFor`）と sodactl（`paneSocketPathFromEnv`）の両方がここから読む。
 */
export const PANE_SOCKET_BASENAME = "pane.sock";
/**
 * 公式フック連携の report の socket のファイル名（状態ディレクトリの中。サーバの `agentReportSocketPathFor`）。受け口の定義に置くのは、
 * sodactl が `SODA_PANE_SOCKET` の無い古い pane で、このファイルと同じディレクトリの `PANE_SOCKET_BASENAME` を受け口として導くため
 * （2 つの名前の組がサーバと sodactl でずれると届かない）。
 */
export const AGENT_REPORT_SOCKET_BASENAME = "agent-report.sock";

/** やりとりの版（要求の `v`）。 */
export const PANE_SOCKET_VERSION = 1;
/**
 * 要求 1 行の上限（改行を除く UTF-8 のバイト数）。質問の定義の上限（`ASK_SPEC_MAX_BYTES`）より大きい。
 * 4 MiB（20261007-soda-extensions の D25。1 MiB から上げた）: 表示の面の中身（2 MiB まで）は JSON の文字列として 1 行に載る。`/ws` の 1 通の上限（4 MiB）と同じ値。
 * 受け口の全部の操作に効く（質問の定義は 256 KiB までなので、`ask.open` の動きは変わらない）。`display.ts` の `DISPLAY_REQUEST_LINE_BYTES` と同じ値。
 */
export const PANE_SOCKET_MAX_LINE_BYTES = 4 * 1024 * 1024;
/**
 * 返事 1 行の上限（改行を除く UTF-8 のバイト数。呼び出し側が超えた返事を読まずに切る）。要求の上限より大きくする——
 * `ask.open` の結果は回答の自由入力（1 つ `ASK_ANSWER_TEXT_MAX` 文字まで × 質問 `ASK_QUESTIONS_MAX`）と自由記述（合計 `ASK_COMMENTS_TOTAL_MAX` 文字まで）を含み、多バイト文字なら 3.3MB に届く。
 * 回答はブラウザから `/ws` の 1 通（上限 4MB）で届くので、結果の行もその大きさに収まる。その 2 倍を上限にする。
 */
export const PANE_SOCKET_MAX_REPLY_BYTES = 8 * 1024 * 1024;
/** 同時に開いている接続の上限。 */
export const PANE_SOCKET_MAX_CONNECTIONS = 64;
/** 接続してから要求の 1 行が揃うまでの上限。 */
export const PANE_SOCKET_REQUEST_WAIT_MS = 10_000;

/** 要求（1 行の JSON。末尾は改行）。知らない項目は無視する。`params` は省略できる（schema の出力は `undefined` のまま。受け口が `{}` として扱う）。 */
export const PaneSocketRequest = z.object({
  v: z.literal(PANE_SOCKET_VERSION),
  op: z.string().min(1).max(64),
  /** 呼び出し元が名乗る pane（受け口は実在だけを確かめる）。 */
  paneId: z.string().min(1).max(64),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type PaneSocketRequest = z.infer<typeof PaneSocketRequest>;

/**
 * 受け口の返事の code。`/ws` の `ErrorCode` に、受け口だけの 3 つを足したもの:
 * - `unknown_op`: その操作を受け口が知らない（`/ws` の「知らない方式」は `not_found` で「pane が無い」と見分けられないので、別の code にする）。
 * - `bad_request`: 要求の行が読めない（JSON でない・形が違う・`v` が違う・行が上限を超える）。
 * - `pane_socket_busy`: 受け付けを止めている（引き継ぎの途中）・同時接続の上限。要求は読んでいない＝操作は始まっていない。
 */
export type PaneSocketErrorCode = ErrorCode | "unknown_op" | "bad_request" | "pane_socket_busy";

/** 返事（1 行の JSON。書いたら受け口が接続を閉じる）。 */
export type PaneSocketResponse =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: PaneSocketErrorCode; message: string } };

/** この受け口に載せる操作の名前（足すときはここに 1 行）。 */
export const PANE_OP_ASK_OPEN = "ask.open";
/** 機能確認（引数なし。古い受け口は `unknown_op`）。 */
export const PANE_OP_ASK_FEATURES = "ask.features";
/** `ask.open` の引数（`{ spec, timeoutMs }`）。`paneId` は要求の外側の `paneId` を使うので引数には無い。 */
export const PaneAskOpenParams = AskOpenParams.omit({ paneId: true });
export type PaneAskOpenParams = z.infer<typeof PaneAskOpenParams>;

/** 表示の面（`sodactl display`。20261007-soda-extensions）。引数の schema（`PaneDisplay*Params`）は `messages.ts` にある: `/ws` の schema から `paneId` を除いたもの（strict——`paneId` を載せたら `invalid_params`）。 */
export const PANE_OP_DISPLAY_SET = "display.set";
export const PANE_OP_DISPLAY_CLOSE = "display.close";
export const PANE_OP_DISPLAY_LIST = "display.list";
/** 次の出来事か `timeoutMs` まで応答しない長い要求（接続が終わると待ちを外す）。 */
export const PANE_OP_DISPLAY_WAIT = "display.wait";
/** 機能確認（引数なし。古い受け口は `unknown_op`）。 */
export const PANE_OP_DISPLAY_FEATURES = "display.features";
/** スクリプトが動く面へデータを送る（`sodactl display send`）。 */
export const PANE_OP_DISPLAY_SEND = "display.send";
