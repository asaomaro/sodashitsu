import { COMMAND_ID_RE } from "./commands.js";
import type { DisplayLimits } from "./display.js";

/**
 * 拡張（設定に登録した別プロセスのプログラムを Sodashitsu が起動・停止し、標準入出力の NDJSON でやり取りする）の型と定数。
 * 決まりの本文は `docs/extensions.md`。サーバ（`packages/server/src/extensions/`）・`sodactl ext`・画面が同じ定数を使う。
 */

export const EXTENSION_PROTOCOL_VERSION = 1;
export const EXTENSIONS_FILE_NAME = "extensions.json";
export const PROJECT_EXTENSIONS_DIR = ".soda";
/** 拡張の id は、独自コマンドの id と同じ規則。 */
export const EXTENSION_ID_RE = COMMAND_ID_RE;
export const EXTENSION_COMMAND_MAX = 1024;
export const EXTENSION_DESCRIPTION_MAX = 200;
export const EXTENSION_PATH_MAX = 1024;
export const EXTENSIONS_FILE_MAX_BYTES = 65_536;
/** 利用者 16・プロジェクトごと 16。 */
export const EXTENSIONS_PER_FILE_MAX = 16;
/** 設定を読む根の数。 */
export const EXTENSION_PROJECT_ROOTS_MAX = 32;
/** 同時に動かす合計。 */
export const EXTENSIONS_RUNNING_MAX = 32;
export const EXTENSION_ALLOW_VALUES = ["script-html"] as const;
export const EXTENSION_UNRESPONSIVE_VALUES = ["pass", "block"] as const;
/** 拡張 → サーバの 1 行（受け口の 1 行と同じ）。 */
export const EXTENSION_LINE_MAX_BYTES = 4 * 1024 * 1024;
/** 超えたら読むのを待つ。 */
export const EXTENSION_REQUEST_RATE = { perSec: 50, burst: 100 } as const;
/** 拡張ごとの量。 */
export const EXTENSION_INPUT_BYTES_RATE = { perSec: 2 * 1024 * 1024, burst: 8 * 1024 * 1024 } as const;
/** 全部の拡張の合計の量。 */
export const EXTENSION_TOTAL_INPUT_BYTES_RATE = { perSec: 8 * 1024 * 1024, burst: 16 * 1024 * 1024 } as const;
/** これだけ処理したら、イベントループへ返す。 */
export const EXTENSION_PUMP_BATCH = { lines: 16, ms: 8 } as const;
export const EXTENSION_STDERR_BYTES_RATE = { perSec: 256 * 1024, burst: 1024 * 1024 } as const;
/** 設定・記録・根を読む 1 回の上限。 */
export const EXTENSION_FILE_TIMEOUT_MS = 2_000;
/** 承認の記録の見張り。 */
export const EXTENSION_APPROVALS_POLL_MS = 5_000;
/** 面を持つ pane の見直し。 */
export const EXTENSION_SCOPE_REVIEW_MS = 2_000;
/** 時間切れの後の、差を埋める仕事の予約。 */
export const EXTENSION_RETRY_AFTER_TIMEOUT = { delayMs: 5_000, max: 3 } as const;
/** 根を引く処理。 */
export const EXTENSION_ROOTS_RESOLVE = { parallel: 2, totalMs: 5_000 } as const;
/** 承認の記録の、鍵のファイル。 */
export const EXTENSION_LOCK = { retryMs: 50, staleMs: 30_000 } as const;
/** グループに残りがあるかを見る間隔。 */
export const EXTENSION_SWEEP_POLL_MS = 50;
/** 続けて壊れた行の上限。 */
export const EXTENSION_BAD_LINES_MAX = 20;
export const EXTENSION_OUT_QUEUE_MAX_LINES = 512;
export const EXTENSION_OUT_QUEUE_MAX_BYTES = 8 * 1024 * 1024;
export const EXTENSION_WRITE_STALL_MS = 30_000;
/** 合図 → 強制終了。 */
export const EXTENSION_STOP_GRACE_MS = 2_000;
/** 止める処理が待つ上限（猶予を含む）。 */
export const EXTENSION_STOP_WAIT_MS = 3_000;
export const EXTENSION_BACKOFF = { minMs: 1_000, maxMs: 60_000 } as const;
/** 続けて落ちた回数の上限。 */
export const EXTENSION_CRASH_MAX = 5;
/** これだけ動いたら、回数を数え直す。 */
export const EXTENSION_STABLE_MS = 60_000;
export const EXTENSION_LOG_LINES_MAX = 200;
export const EXTENSION_LOG_LINE_MAX_BYTES = 4_096;
/** 1 つの拡張が出せる面。 */
export const EXTENSION_DISPLAYS_MAX = 16;
/** 1 つの拡張が出せる面の、中身の合計（サーバ全体の上限を、1 つの拡張が使い切らないように）。 */
export const EXTENSION_DISPLAY_BYTES_MAX = 8 * 1024 * 1024;
export const EXTENSION_APPROVALS_MAX = 256;
/** id が文字列のときの長さ。 */
export const EXTENSION_REQUEST_ID_MAX = 64;
export const EXTENSION_METHOD_NAME_MAX = 64;
export const EXTENSION_PANES_DEBOUNCE_MS = 100;
/** ダイアログの［承認して動かす］を押せない時間（web が使う）。 */
export const EXTENSION_APPROVE_DELAY_MS = 1_000;

export type ExtensionScope = "user" | "project";
export type ExtensionRunState =
  | "running" // 動作中
  | "backoff" // 落ちた。起動し直しを待っている
  | "failed" // 続けて落ちたので止めた
  | "exited" // 自分で終了した（終了コード 0）
  | "disabled" // 無効（設定の enabled: false か、画面で切った）
  | "pending" // 承認待ち（プロジェクトだけ）
  | "denied" // 承認しない（プロジェクトだけ）
  | "over_limit" // 同時に動かす合計の上限のため、動かしていない
  | "waiting"; // 設定か無効の記録を読めない（時間切れ・一時の失敗）ので、起動を見送っている。読めれば起動する

export type ExtensionExitReason = "exited" | "crashed" | "spawn_failed" | "bad_lines" | "not_reading" | "stopped";

/** プロジェクトの拡張の、承認の画面に出す中身（PR3 が使う。型はここで定義する）。 */
export interface ExtensionApprovalView {
  digest: string;
  status: "approved" | "denied" | "none";
  command: string;
  cwd: string;
  /** 根・.soda・設定ファイルのどれかを、グループが書ける。 */
  groupWritable: boolean;
  decidedAt?: string;
  /** 最後に承認した中身（あれば。「承認しない」とした中身は、ここに入らない）。 */
  previous?: { command: string; description: string | null; enabled: boolean; allow: string[]; onUnresponsive: string };
  /** この (根, id) で、前に別の中身を「承認しない」とした。 */
  deniedBefore: boolean;
  /** この (根, id) に、承認の記録が残っている（いまの登録と鍵が違っても。その中身へ戻ると、動く）。 */
  approvedAlive: boolean;
}

export interface ExtensionInfo {
  key: string;
  id: string;
  scope: ExtensionScope;
  /** プロジェクト: 根の実体のパス。 */
  root?: string;
  /** 読んだ設定ファイルのパス。 */
  configPath: string;
  description?: string;
  allow: string[];
  onUnresponsive: "pass" | "block";
  state: ExtensionRunState;
  enabledInConfig: boolean;
  disabledByUser: boolean;
  /** 動作中: この起動の UUID。 */
  runId?: string;
  /** ISO 8601。 */
  startedAt?: string;
  /** 続けて落ちた回数。 */
  failures: number;
  /** backoff のとき。 */
  nextRetryAt?: string;
  lastExit?: { code: number | null; signal: string | null; at: string; reason: ExtensionExitReason };
  /** いま出している面の数。 */
  displays: number;
  /** プロジェクトだけ（PR3）。 */
  approval?: ExtensionApprovalView;
}

export interface ExtensionFileProblem {
  scope: ExtensionScope | "state";
  root?: string;
  path: string;
  problem: string;
}

/** 承認の記録 1 件の見出し（コマンドは含めない）。PR3 が使う。 */
export interface ExtensionApprovalRecordView {
  root: string;
  id: string;
  approvedAt?: string;
  deniedAt?: string;
  /** いまの一覧に、その (根, id) の拡張がある。 */
  active: boolean;
}

export interface ExtensionListResult {
  extensions: ExtensionInfo[];
  problems: ExtensionFileProblem[];
  userConfigPath: string;
  /** PR3。承認の記録の全部（いま一覧に無い根・id のものを含む）。 */
  approvals?: ExtensionApprovalRecordView[];
}

export interface ExtensionLogResult {
  lines: string[];
  /** あふれて捨てた行数。 */
  dropped: number;
}

/** 拡張に見せる pane。 */
export interface ExtPane {
  id: string;
  label: string | null;
  workspaceId: string;
  workspaceLabel: string;
  workspaceCwd: string;
  agent: string | null;
}

export interface ExtLimits {
  lineBytes: number;
  requestsPerSec: number;
  inputBytesPerSec: number;
  outQueueLines: number;
  displays: number;
  displayBytes: number;
}

/**
 * 表示の面の出来事（`DisplayEvent`）から、待ちの印 `seq` を除いたもの。閉じた理由は、表示の面の 7 つに、
 * `pane_closed`（pane が閉じた）と `out_of_scope`（pane が、拡張の範囲の外へ出た）が加わる。
 */
export type ExtDisplayEvent =
  | {
      type: "display.action";
      paneId: string;
      name: string;
      rev: number;
      action: string;
      data?: Record<string, string>;
      at: string;
      source?: "static" | "script";
    }
  | { type: "display.closed"; paneId: string; name: string; reason: string; at: string };

/** サーバ → 拡張の行。 */
export type ExtLine =
  | {
      type: "ext.hello";
      v: 1;
      runId: string;
      extension: { id: string; scope: ExtensionScope; root?: string };
      allow: string[];
      onUnresponsive: "pass" | "block";
      methods: string[];
      events: string[];
      display: { features: string[]; scriptEnabled: boolean; limits: DisplayLimits };
      limits: ExtLimits;
    }
  | { type: "ext.result"; id: string | number; ok: true; result: unknown }
  | { type: "ext.result"; id: string | number; ok: false; error: { code: string; message: string } }
  /** どの要求にも結び付かない誤り（3 つとも「続けて壊れた行」に数える）。 */
  | { type: "ext.error"; code: "bad_line" | "line_too_long" | "bad_request"; message: string }
  | { type: "ext.dropped"; count: number }
  | { type: "ext.panes"; panes: ExtPane[] }
  | ExtDisplayEvent;

/** 拡張 → サーバの要求。 */
export interface ExtRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}
export type ExtRequestParse =
  | { ok: true; request: ExtRequest }
  | { ok: false; code: "bad_line" | "bad_request"; message: string };

export const EXT_EVENT_TYPES = ["ext.hello", "ext.result", "ext.error", "ext.dropped", "ext.panes", "display.action", "display.closed"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * 1 行を要求として読む（純粋）。JSON でない → `bad_line`。オブジェクトでない・`method` が 1〜64 文字の文字列でない・
 * `id` が有限の数でも 1〜64 文字の文字列でもない・`params` がオブジェクト（配列でない）でない → `bad_request`。知らない項目は無視する。
 */
export function parseExtRequest(line: string): ExtRequestParse {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { ok: false, code: "bad_line", message: "the line is not JSON" };
  }
  if (!isPlainObject(raw)) return { ok: false, code: "bad_request", message: "the request must be a JSON object" };
  const method = Object.prototype.hasOwnProperty.call(raw, "method") ? raw.method : undefined;
  if (typeof method !== "string" || method.length < 1 || method.length > EXTENSION_METHOD_NAME_MAX) {
    return { ok: false, code: "bad_request", message: "method must be a string of 1 to 64 characters" };
  }
  const out: ExtRequest = { method };
  if (Object.prototype.hasOwnProperty.call(raw, "id") && raw.id !== undefined && raw.id !== null) {
    const id = raw.id;
    if (typeof id === "number") {
      if (!Number.isFinite(id)) return { ok: false, code: "bad_request", message: "id must be a finite number or a string" };
    } else if (typeof id !== "string" || id.length < 1 || id.length > EXTENSION_REQUEST_ID_MAX) {
      return { ok: false, code: "bad_request", message: "id must be a finite number or a string of 1 to 64 characters" };
    }
    out.id = id;
  } else if (Object.prototype.hasOwnProperty.call(raw, "id") && raw.id === null) {
    return { ok: false, code: "bad_request", message: "id must be a finite number or a string of 1 to 64 characters" };
  }
  if (Object.prototype.hasOwnProperty.call(raw, "params") && raw.params !== undefined) {
    if (!isPlainObject(raw.params)) return { ok: false, code: "bad_request", message: "params must be an object" };
    out.params = raw.params;
  }
  return { ok: true, request: out };
}

/**
 * 設定の検査・根のパスの検査・画面の表示が、同じものを使う。制御（Cc）・書式（Cf）・私用（Co）・未割り当て（Cn）・サロゲート（Cs）・
 * 行と段落の区切り（Zl・Zp）・U+0020 以外の空白（Zs）と、見えない埋め草・異体字セレクタ。
 */
const FORBIDDEN_CHARS_RE = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Zl}\p{Zp}ᅟᅠㅤﾠ͏︀-️\u{E0100}-\u{E01EF}]|(?! )\p{Zs}/u;
export function hasForbiddenChars(s: string): boolean {
  return FORBIDDEN_CHARS_RE.test(s);
}

export function extLimits(): ExtLimits {
  return {
    lineBytes: EXTENSION_LINE_MAX_BYTES,
    requestsPerSec: EXTENSION_REQUEST_RATE.perSec,
    inputBytesPerSec: EXTENSION_INPUT_BYTES_RATE.perSec,
    outQueueLines: EXTENSION_OUT_QUEUE_MAX_LINES,
    displays: EXTENSION_DISPLAYS_MAX,
    displayBytes: EXTENSION_DISPLAY_BYTES_MAX,
  };
}
