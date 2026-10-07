import { IMAGE_CHUNK_BYTES } from "./image.js";

/**
 * 表示の面（パネル・帯。`sodactl display`。20261007-soda-extensions の design「定数と型」）の、型・定数・検査。
 * 操作・出来事の型は、この 1 か所にある（`pane.sock`・`/ws`・`sodactl`・ブラウザが同じものを読む）。
 * 検査の関数は純粋で、サーバ・sodactl・ブラウザが同じものを使う。
 *
 * 静的な形式（`text`・`markdown`・`html`）の分だけ。スクリプトが動く形式（`script-html`）・`display.send`・`focus_steal` は、後の版が
 * ここに足す（`DISPLAY_FORMATS`・`DISPLAY_FEATURES`・`DISPLAY_RENDER_FEATURES`・`DisplayRenderers`・`DisplayLimits`・`DisplayClosedReason` に 1 項目ずつ）。
 */

export const DISPLAY_KINDS = ["panel", "band"] as const;
/** 作者のスクリプトは動かない形式。 */
export const DISPLAY_STATIC_FORMATS = ["text", "markdown", "html"] as const;
/** 出せる形式（後の版が `script-html` を足す）。 */
export const DISPLAY_FORMATS = [...DISPLAY_STATIC_FORMATS] as const;
export const DISPLAY_NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
/** 題の長さの上限（文字＝コードポイント）。制御文字は不可。 */
export const DISPLAY_TITLE_MAX = 80;
/** 中身の上限（UTF-8 のバイト数。利用者の決定 D22）。 */
export const DISPLAY_CONTENT_MAX_BYTES = 2 * 1024 * 1024;
export const DISPLAY_PANELS_PER_PANE_MAX = 4;
export const DISPLAY_BANDS_PER_PANE_MAX = 2;
/** サーバ全体の面の数。 */
export const DISPLAY_TOTAL_MAX = 64;
/** サーバ全体の中身の合計（D25）。 */
export const DISPLAY_SERVER_BYTES_MAX = 32 * 1024 * 1024;
/** 画面が中身を取るときの 1 片（生のバイト数。質問のフォームのメディアと同じ 768 KiB）。 */
export const DISPLAY_GET_CHUNK_BYTES = IMAGE_CHUNK_BYTES;
/** 大きさ（px。panel は幅・band は高さ）。 */
export const DISPLAY_SIZE = {
  panel: { min: 160, max: 800, default: 320 },
  band: { min: 24, max: 96, default: 32 },
} as const;
export const DISPLAY_TTL_MIN_MS = 1_000;
export const DISPLAY_TTL_MAX_MS = 86_400_000;
/** pane ごとの `set` の回数（続けて 10 回まで通り、11 回目は誤り。1 秒に 10 回ぶん戻る）。 */
export const DISPLAY_SET_RATE = { perSec: 10, burst: 10 } as const;
/** pane ごとの `set` の量（続けて 8 MiB まで・毎秒 2 MiB 戻る）。 */
export const DISPLAY_SET_BYTES_RATE = { perSec: 2 * 1024 * 1024, burst: 8 * 1024 * 1024 } as const;
export const DISPLAY_PING_INTERVAL_MS = 2_000;
export const DISPLAY_UNRESPONSIVE_MS = 10_000;
export const DISPLAY_ACTION_NAME_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
/** 操作に添える値の組の数。 */
export const DISPLAY_ACTION_FIELDS_MAX = 64;
/** 欄の名前の文字数。 */
export const DISPLAY_ACTION_KEY_MAX = 64;
/** 操作に添える値の JSON（UTF-8）。 */
export const DISPLAY_ACTION_DATA_MAX_BYTES = 8 * 1024;
/** 接続ごとの操作の頻度。超えた分は捨てる。 */
export const DISPLAY_ACTION_RATE = { perSec: 20, burst: 20 } as const;
/** pane ごとに溜める出来事の数。 */
export const DISPLAY_EVENT_QUEUE_MAX = 64;
export const DISPLAY_WAITERS_PER_PANE_MAX = 4;
export const DISPLAY_WAITERS_MAX = 32; // pane ごとの上限 4 × 8 pane。受け口の同時接続（64）の半分までに抑え、set・close・ask の分を残す
export const DISPLAY_WAIT_MIN_MS = 1_000;
export const DISPLAY_WAIT_MAX_MS = 60_000;
export const DISPLAY_WAIT_DEFAULT_MS = 30_000;
export const DISPLAY_WAIT_NAMES_MAX = 8;
/** sodactl が名乗る機能（`--features` の `sodactl`）。 */
export const DISPLAY_FEATURES = ["panel", "band", "format:text", "format:markdown", "format:html", "actions"] as const;
/** 画面が `display.subscribe` で名乗れる種類。 */
export const DISPLAY_RENDER_FEATURES = ["panel", "band", "actions"] as const;
/** `display.subscribe` の `features` の個数の上限。 */
export const DISPLAY_RENDER_FEATURES_MAX = 8;
/** stdout の行の決まりの版（`display.ready` の `v`）。この決まりそのものを変えるときだけ上げる。 */
export const DISPLAY_LINE_VERSION = 1;
/**
 * 受け口の要求 1 行の上限（`PANE_SOCKET_MAX_LINE_BYTES` と同じ値。`/ws` の 1 通の上限とも同じ）。`paneSocket.ts` を読むと
 * `messages.ts` を通って循環するので、値をここに持つ（同じ値であることは `display.test.ts` が見る）。
 */
export const DISPLAY_REQUEST_LINE_BYTES = 4 * 1024 * 1024;
/** 受け口の要求の 1 行が、これを超えると古いサーバ（1 MiB）では `bad_request` になる。 */
export const DISPLAY_OLD_REQUEST_LINE_BYTES = 1024 * 1024;

export type DisplayKind = (typeof DISPLAY_KINDS)[number];
export type DisplayFormat = (typeof DISPLAY_FORMATS)[number];
/**
 * 読み手の側（サーバ → 画面・sodactl が受け取る値）の型は、後の版が足す値・項目を受けても落ちないようにする:
 * 未知の `format` は文字列として通し、表示する側が「出せない」と扱う。書き手の側（`display.set` の要求）は `DisplayFormat` の厳しい検査のまま。
 */
export type DisplayFormatValue = DisplayFormat | (string & {});

/** 面の見出し（中身は含まない）。 */
export interface DisplayInfo {
  /** UUID。同じ pane・同じ名前で出ている間は変わらない。閉じて出し直すと変わる。 */
  id: string;
  paneId: string;
  name: string;
  kind: DisplayKind;
  format: DisplayFormatValue;
  /** 省いたら name。 */
  title: string;
  /** px（panel は幅・band は高さ）。 */
  size: number;
  /** 1 から。set のたびに 1 増える。 */
  rev: number;
  /** 中身の UTF-8 のバイト数。 */
  bytes: number;
  /** ISO 8601。 */
  updatedAt: string;
}
/** `display.get` の 1 片。`base64` は、中身（UTF-8）の `offset` からの `DISPLAY_GET_CHUNK_BYTES` 以下のバイト列。`totalBytes` は中身全体のバイト数（`DisplayInfo.bytes` と同じ値。`DisplayInfo.size` の px とは別物）。 */
export interface DisplayChunk {
  id: string;
  rev: number;
  format: DisplayFormatValue;
  totalBytes: number;
  offset: number;
  base64: string;
  eof: boolean;
}
/** 画面が組み立てた中身（ブラウザの中だけの型）。 */
export interface DisplayContent {
  id: string;
  rev: number;
  format: DisplayFormatValue;
  content: string;
}
/** その種類を出せると名乗った画面の数（後の版が `scriptHtml` を足す）。 */
export interface DisplayRenderers {
  panel: number;
  band: number;
  actions: number;
  /** 後の版が足す種類（読み手は知らない項目を無視する）。 */
  [kind: string]: number;
}
export interface DisplayLimits {
  contentBytes: number;
  titleChars: number;
  panelsPerPane: number;
  bandsPerPane: number;
  total: number;
  serverBytes: number;
  panelSize: { min: number; max: number; default: number };
  bandSize: { min: number; max: number; default: number };
  setPerSec: number;
  setBytesBurst: number;
  setBytesPerSec: number;
  actionDataBytes: number;
  waitersPerPane: number;
  eventQueue: number;
  waitMaxMs: number;
  /** このサーバの受け口が受ける 1 行の上限（4 MiB）。sodactl が、送る前に見る。 */
  requestLineBytes: number;
  /** 後の版が足す項目（読み手は知らない項目を無視する）。 */
  [key: string]: unknown;
}
export interface DisplayFeatures {
  features: string[];
  limits: DisplayLimits;
  renderers: DisplayRenderers;
  /** サーバの起動ごとの印。`display.wait` に渡すと、入れ替え・再起動を見分けられる。 */
  epoch: string;
}
/** `set` の中身（`paneId` を除いたもの）。`checkDisplaySet` が返す形で、受け口の `PaneDisplaySetParams` と同じ項目。 */
export interface DisplaySetBody {
  name: string;
  kind: DisplayKind;
  format: DisplayFormat;
  content: string;
  title?: string;
  size?: number;
  ttlMs?: number;
}
export interface DisplaySetResult {
  display: DisplayInfo;
  renderers: DisplayRenderers;
  epoch: string;
  next: number;
}
export interface DisplayWaitResult {
  epoch: string;
  next: number;
  events: DisplayEvent[];
  dropped: number;
  reset: boolean;
}

/**
 * 閉じた理由。
 * - `closed`: プログラムの close（自分の close も届く）／`dismissed`: 利用者が閉じた／`expired`: `--ttl-ms`
 * - `navigated`: 枠が別のページへ移ったので、アプリが止めた／`unresponsive`: 枠が 10 秒返事をしないので、アプリが止めた
 */
export type DisplayClosedReason = "closed" | "dismissed" | "expired" | "navigated" | "unresponsive";
/** 読み手の側の理由（後の版が足す理由を受けても落ちない。知らない理由は「閉じた」として扱う）。 */
export type DisplayClosedReasonValue = DisplayClosedReason | (string & {});

/** サーバが溜めて `display.wait` で返す出来事。sodactl はそのまま 1 行にする。 */
export type DisplayEvent =
  | { type: "display.action"; seq: number; paneId: string; name: string; rev: number; action: string; data?: Record<string, string>; at: string }
  | { type: "display.closed"; seq: number; paneId: string; name: string; reason: DisplayClosedReasonValue; at: string };

/** sodactl が stdout に書く行（`display wait`・`display events`・`set --wait`）。上の `DisplayEvent` に、sodactl が作る行を足したもの。 */
export type DisplayLine =
  | DisplayEvent
  | { type: "display.ready"; v: 1; paneId: string; epoch: string; features: string[]; renderers: DisplayRenderers }
  | { type: "display.dropped"; count: number }
  | { type: "display.reset"; reason: "server_restarted"; epoch: string }
  | { type: "display.timeout" }
  | { type: "display.end"; reason: "pane_closed" | "connection_closed" | "unsupported" | "busy" };

/** `display.report` の `problem`（画面が、枠の異常を知らせる）。後の版が `focus_steal` を足す。 */
export const DISPLAY_REPORT_PROBLEMS = ["navigated", "unresponsive"] as const;
export type DisplayReportProblem = (typeof DISPLAY_REPORT_PROBLEMS)[number];

export function displayLimits(): DisplayLimits {
  return {
    contentBytes: DISPLAY_CONTENT_MAX_BYTES,
    titleChars: DISPLAY_TITLE_MAX,
    panelsPerPane: DISPLAY_PANELS_PER_PANE_MAX,
    bandsPerPane: DISPLAY_BANDS_PER_PANE_MAX,
    total: DISPLAY_TOTAL_MAX,
    serverBytes: DISPLAY_SERVER_BYTES_MAX,
    panelSize: { ...DISPLAY_SIZE.panel },
    bandSize: { ...DISPLAY_SIZE.band },
    setPerSec: DISPLAY_SET_RATE.perSec,
    setBytesBurst: DISPLAY_SET_BYTES_RATE.burst,
    setBytesPerSec: DISPLAY_SET_BYTES_RATE.perSec,
    actionDataBytes: DISPLAY_ACTION_DATA_MAX_BYTES,
    waitersPerPane: DISPLAY_WAITERS_PER_PANE_MAX,
    eventQueue: DISPLAY_EVENT_QUEUE_MAX,
    waitMaxMs: DISPLAY_WAIT_MAX_MS,
    requestLineBytes: DISPLAY_REQUEST_LINE_BYTES,
  };
}

/** 文字列の UTF-8 のバイト数。 */
export function displayUtf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

export type DisplayCheck<T> = { ok: true; value: T } | { ok: false; reason: string };

// 制御文字（C0・DEL・C1）と、行・段落の区切り。題に入れない。
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isOneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/**
 * `set` の中身を検査して、決まった形に直す（名前・種類・形・題・大きさ・中身のバイト数・`ttlMs`）。知らない項目は落とす。
 * 題は制御文字を拒否し、前後の空白を除く（空になったら省いたものとして扱う）。中身のバイト数は UTF-8 で数える。
 */
export function checkDisplaySet(raw: unknown): DisplayCheck<DisplaySetBody> {
  if (!isRecord(raw)) return { ok: false, reason: "display must be an object" };
  const { name, kind, format, content, title, size, ttlMs } = raw;
  if (typeof name !== "string" || !DISPLAY_NAME_RE.test(name)) return { ok: false, reason: "name must be 1-32 characters of A-Z a-z 0-9 _ -" };
  if (!isOneOf(DISPLAY_KINDS, kind)) return { ok: false, reason: `kind must be one of: ${DISPLAY_KINDS.join(", ")}` };
  if (!isOneOf(DISPLAY_FORMATS, format)) return { ok: false, reason: `format must be one of: ${DISPLAY_FORMATS.join(", ")}` };
  if (typeof content !== "string") return { ok: false, reason: "content must be a string" };
  if (displayUtf8Bytes(content) > DISPLAY_CONTENT_MAX_BYTES) {
    return { ok: false, reason: `content is too large (max ${DISPLAY_CONTENT_MAX_BYTES} bytes in UTF-8)` };
  }
  const value: DisplaySetBody = { name, kind, format, content };
  if (title !== undefined) {
    if (typeof title !== "string") return { ok: false, reason: "title must be a string" };
    if (CONTROL_RE.test(title)) return { ok: false, reason: "title must not contain control characters" };
    const t = title.trim();
    if ([...t].length > DISPLAY_TITLE_MAX) return { ok: false, reason: `title is too long (max ${DISPLAY_TITLE_MAX} characters)` };
    if (t !== "") value.title = t;
  }
  if (size !== undefined) {
    const range = DISPLAY_SIZE[kind];
    if (typeof size !== "number" || !Number.isInteger(size) || size < range.min || size > range.max) {
      return { ok: false, reason: `size for ${kind} must be an integer from ${range.min} to ${range.max} (px)` };
    }
    value.size = size;
  }
  if (ttlMs !== undefined) {
    if (typeof ttlMs !== "number" || !Number.isInteger(ttlMs) || ttlMs < DISPLAY_TTL_MIN_MS || ttlMs > DISPLAY_TTL_MAX_MS) {
      return { ok: false, reason: `ttlMs must be an integer from ${DISPLAY_TTL_MIN_MS} to ${DISPLAY_TTL_MAX_MS}` };
    }
    value.ttlMs = ttlMs;
  }
  return { ok: true, value };
}

/**
 * 操作（`{action, data?}`）を検査する（操作の名前・値はすべて文字列・組の数・欄の名前の長さ・JSON のバイト数）。
 * 返す `data` は新しいオブジェクトで、入力のものを共有しない。
 */
export function checkDisplayAction(raw: unknown): DisplayCheck<{ action: string; data?: Record<string, string> }> {
  if (!isRecord(raw)) return { ok: false, reason: "action must be an object" };
  const { action, data } = raw;
  if (typeof action !== "string" || !DISPLAY_ACTION_NAME_RE.test(action)) {
    return { ok: false, reason: "action name must be 1-64 characters of A-Z a-z 0-9 _ . : -" };
  }
  if (data === undefined) return { ok: true, value: { action } };
  if (!isRecord(data)) return { ok: false, reason: "action data must be an object" };
  const entries = Object.entries(data);
  if (entries.length > DISPLAY_ACTION_FIELDS_MAX) return { ok: false, reason: `action data has too many fields (max ${DISPLAY_ACTION_FIELDS_MAX})` };
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (k.length === 0 || [...k].length > DISPLAY_ACTION_KEY_MAX) {
      return { ok: false, reason: `action data field names must be 1-${DISPLAY_ACTION_KEY_MAX} characters` };
    }
    if (typeof v !== "string") return { ok: false, reason: "action data values must be strings" };
    // `__proto__` も自分の項目として入れる（代入だと prototype を書き換えてしまう）。
    Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  if (displayUtf8Bytes(JSON.stringify(out)) > DISPLAY_ACTION_DATA_MAX_BYTES) {
    return { ok: false, reason: `action data is too large (max ${DISPLAY_ACTION_DATA_MAX_BYTES} bytes as JSON)` };
  }
  return { ok: true, value: { action, data: out } };
}

/**
 * stdout の 1 行を読む。`type` が文字列の JSON オブジェクトなら、**知らない `type`・知らない項目があっても落とさず**返す
 * （読み手は知らない行を無視する決まり）。JSON でない・オブジェクトでない・`type` が文字列でないなら `null`。
 * 型は読み手の利便のためで、知らない行は `{ type: string }` として通る。
 */
export function parseDisplayLine(line: string): DisplayLine | null {
  let v: unknown;
  try {
    v = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(v) || typeof v.type !== "string") return null;
  return v as unknown as DisplayLine;
}

/**
 * 面の見出しを、読み手の側のゆるさで読む（`display.subscribe` の一覧・`display.updated` の 1 件）。必要な項目の型だけを見て、
 * **未知の `format`・未知の項目では落とさず**そのまま通す（表示する側が、知らない `format` を「出せない」と扱う）。読めなければ `null`
 * （一覧の 1 件が壊れていても、ほかの面は読める）。
 */
export function readDisplayInfo(raw: unknown): DisplayInfo | null {
  if (!isRecord(raw)) return null;
  const r = raw;
  if (
    typeof r.id !== "string" ||
    typeof r.paneId !== "string" ||
    typeof r.name !== "string" ||
    !isOneOf(DISPLAY_KINDS, r.kind) ||
    typeof r.format !== "string" ||
    typeof r.title !== "string" ||
    typeof r.size !== "number" ||
    typeof r.rev !== "number" ||
    typeof r.bytes !== "number" ||
    typeof r.updatedAt !== "string"
  ) {
    return null;
  }
  return r as unknown as DisplayInfo;
}
