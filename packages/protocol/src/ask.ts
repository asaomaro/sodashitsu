/**
 * pane の中のプログラムが出す質問のフォーム（`sodactl ask`。20261002-sodactl-ask の design「インターフェース / データ構造」）。
 * 定義の検査・回答の集め方・回答の検査は、sodactl・サーバ・ブラウザが**同じ関数**を使う（写しを作らない）。
 * 挙動は ask-form（public_docs の `ask.py` の `normalize()` と `form.html` の `collect()`）に合わせる。
 */

// --- 上限（decisions D2 (n)）-----------------------------------------------------------

/** 定義全体（JSON の UTF-8 のバイト数）。 */
export const ASK_SPEC_MAX_BYTES = 256 * 1024;
export const ASK_QUESTIONS_MAX = 100;
/** 1 つの質問の選択肢の数。 */
export const ASK_OPTIONS_MAX = 200;
/** `id`・`value` の文字数。 */
export const ASK_ID_MAX = 200;
/** `title`・`submit`・`label`・`otherLabel`・`placeholder` 等の短い文字列の文字数。 */
export const ASK_LABEL_MAX = 500;
/** `intro`・`help`・`desc` の文字数。 */
export const ASK_TEXT_MAX = 4000;
/** 1 つの選択肢で使う色の数（超えた分は捨てる。誤りにしない）。 */
export const ASK_COLORS_MAX = 16;
/** 自由入力・`text` の回答・補足の文字数。 */
export const ASK_ANSWER_TEXT_MAX = 10_000;
/** 質問ごとの自由記述（`comments`）の長さの合計（UTF-16 の単位）。回答 1 通が `/ws` の 1 フレームの上限（4MB）に収まるようにする。 */
export const ASK_COMMENTS_TOTAL_MAX = 100_000;
export const ASK_TIMEOUT_DEFAULT_MS = 540_000;
export const ASK_TIMEOUT_MIN_MS = 1_000;
export const ASK_TIMEOUT_MAX_MS = 86_400_000;
/** サーバが同時に待てる質問の総数（定義 256 KiB × 総数で、メモリと `ask.subscribe` の応答の大きさが頭打ちになる）。 */
export const ASK_PENDING_MAX = 32;
/** 1 つの接続（`ask.open` を送った sodactl 等）が同時に待たせられる質問の数。 */
export const ASK_PENDING_PER_CLIENT_MAX = 8;
/** `ask.open` の `askId` の長さの上限。 */
export const ASK_ASKID_MAX = 64;

// --- メディア・成果物（20261004-ask-media-popup）---------------------------------------------

/** 画像・音・成果物 1 ファイルの大きさ（バイト）。 */
export const ASK_MEDIA_FILE_MAX = 8 * 1024 * 1024;
/** Markdown・テキストの成果物（`view`）1 つの大きさ。 */
export const ASK_MEDIA_TEXT_MAX = 2 * 1024 * 1024;
/** 1 つの質問のメディアの合計。 */
export const ASK_MEDIA_TOTAL_MAX = 24 * 1024 * 1024;
/** 1 つの質問のメディアの個数。 */
export const ASK_MEDIA_FILES_MAX = 32;
/** サーバが待っている質問全部のメディアの合計。 */
export const ASK_MEDIA_SERVER_MAX = 128 * 1024 * 1024;
/** 成果物（`view`）の数。 */
export const ASK_VIEW_MAX = 8;
/**
 * 「ローカル起動」（`soda serve` が loopback だけで待ち受け、手元の画面だけが見るとき）の安全弁。上の大きさの上限は外れるが、ブラウザへ渡す方式
 * （`ask.media` の base64 を 1 つの文字列に連結する・`atob`）が、V8 の文字列の長さの限界〔約 5.4 億文字〕に当たらず、メモリを食い尽くさない範囲に止める。
 * 1 ファイル（base64 で約 3.6 億文字）・1 つの質問の合計・サーバ全体。
 */
export const ASK_MEDIA_LOCAL_FILE_MAX = 256 * 1024 * 1024;
export const ASK_MEDIA_LOCAL_TOTAL_MAX = 512 * 1024 * 1024;
export const ASK_MEDIA_LOCAL_SERVER_MAX = 1024 * 1024 * 1024;
/** 選択肢の `code` の文字数。 */
export const ASK_CODE_MAX = 50_000;
/** 選択肢の `lang` の文字数。 */
export const ASK_LANG_MAX = 40;
/** 参照（パス・URL）の文字数（`data:` は定義全体の大きさで抑える）。 */
export const ASK_REF_MAX = 4096;
/** 配る定義の中の、メディアへの参照の接頭辞（サーバが付け直す。pane のプログラムが書いた参照には使わせない）。 */
export const ASK_MEDIA_REF_PREFIX = "media:";

// --- 型 ---------------------------------------------------------------------------------

export interface AskOption {
  value: string;
  label: string;
  desc?: string;
  recommended?: true;
  colors?: string[];
  /** 画像・音の参照。pane のプログラムが書くのはパス・`https://` の URL（画像だけ）・`data:` の URI。ブラウザへ配る定義では `media:<id>`。 */
  image?: string;
  audio?: string;
  /** 等幅で出す文字列（コード・設定・文字で描いた案）。 */
  code?: string;
  /** `code` の種類の名前。`diff` のときは `+`・`-`・`@@` の行を色分けする。 */
  lang?: string;
  /** 分類の見出し（同じ分類は続けて並べる）。 */
  group?: string;
}

export type AskQuestionType = "single" | "multi" | "text" | "edit" | "rank" | "table";

export interface AskQuestion {
  id: string;
  label: string;
  type: AskQuestionType;
  help?: string;
  /** `text` は空。 */
  options: AskOption[];
  /** `multi` は配列、`single`・`text` は文字列。 */
  default?: string | string[];
  allowOther: boolean;
  otherLabel?: string;
  otherPlaceholder?: string;
  /** 値は文字列の配列に揃える。 */
  showIf?: Record<string, string[]>;
  required: boolean;
  multiline: boolean;
  placeholder?: string;
  minWidth?: number;
  /** まとまりの題（目次の見出し）。書いた質問から新しいまとまり（空文字も「書いた」）。1 つでも書くと、高さに収まっていても目次を出す。 */
  page?: string;
  /** 絞り込みの欄を出すか（無ければ部品の既定: 選択肢 12 件以上で出す）。`text` には無い。 */
  filter?: boolean;
  /** 表示名と値が違う選択肢に、値を出すか（無ければ部品の既定: 出す）。`text` には無い。 */
  showValue?: boolean;
  /** `false` のときだけ持つ（この質問に自由記述を付けない）。`true`・無指定・真偽でない値は項目なし。 */
  comment?: false;
  /** プレビューの置き方。無ければ部品の既定（コードがあれば `side`、画像だけなら `inline`）。 */
  preview?: AskPreview;
  /** `inline` の画像の高さ（px。20〜2000 の整数だけ残す）。 */
  thumb?: number;
  /** `edit`: 最初の文面（直して返してもらう）。 */
  text?: string;
  /** `edit` は行数（1〜60）、`table` は行の一覧。 */
  rows?: number | AskRow[];
  /** `edit`: `false` のとき等幅にしない。 */
  mono?: boolean;
  /** `table`: 見出し（行の列・選ぶ列）。 */
  rowLabel?: string;
  pickLabel?: string;
}

/** `table` の行。`default` はこの行の最初の選択（選択肢の value）。 */
export interface AskRow {
  value: string;
  label: string;
  desc?: string;
  default?: string;
}

export type AskPreview = "side" | "inline";

/** 成果物（`view`）の 1 件（検査後の入力）。`file`（サーバのマシンのパス）か `text`（その場の文字）の片方だけを持つ。 */
export interface AskViewSpec {
  title: string;
  file?: string;
  text?: string;
  /** Markdown を整形せず文字のまま見せる（`file` の `.md` だけ意味がある）。 */
  raw?: true;
}

/** 質問の目次の出し方: `"auto"`（高さに収まらないときだけ出す）／`true`（必ず出す）／`false`（出さない）。1 以上の整数も通す（`true` と同じ扱い。`ask.py` の検査と共通の試験データに合わせる）。 */
export type AskPaging = "auto" | boolean | number;

/** 検査を通った定義（知らない項目は落としてある）。 */
export interface AskSpec {
  title: string;
  intro?: string;
  submit: string;
  /** 補足欄を出すか。 */
  note: boolean;
  notePlaceholder?: string;
  /** 無ければ無いまま（既定は埋めない。部品の既定は `"auto"`）。質問に `page` があれば、`false` でなければ目次を出す。 */
  paging?: AskPaging;
  /** `false` のときだけ持つ（どの質問にも自由記述を付けない）。`true`・無指定・真偽でない値は項目なし。 */
  comments?: false;
  /** 成果物。入力の検査後の形（サーバが読んで `AskPending.view` に移し、配る定義には残さない）。 */
  view?: AskViewSpec[];
  questions: AskQuestion[];
}

/** 1 つの質問の回答: `single`・`text`・`edit` は文字列、`multi`・`rank` は配列、`table` は {行の value: 選んだ value}。 */
export type AskAnswerValue = string | string[] | Record<string, string>;
export type AskAnswers = Record<string, AskAnswerValue>;

/** 質問の id → その質問への自由記述（書いた質問だけ。前後の空白は除いてある）。 */
export type AskComments = Record<string, string>;

export type AskResult =
  | { status: "answered"; answers: AskAnswers; custom?: string[]; edited?: string[]; note?: string; comments?: AskComments }
  | { status: "cancelled" }
  | { status: "timeout" }
  | { status: "unavailable"; reason: string };

/** 対応していない型の質問がある定義への `unavailable` の理由（CLI・サーバで同じ文言にする）。 */
export function unsupportedTypeReason(type: string): string {
  return `this form has a question of type "${type}", which this version of sodactl ask does not support`;
}

/** 待っている質問（`ask.subscribe`・`ask.get` の返り値）。 */
export interface AskPending {
  askId: string;
  paneId: string;
  /** 配る定義。メディアの参照は `media:<id>` に付け替えてあり、`view` は持たない（下の `view`）。 */
  spec: AskSpec;
  /** 取りに行けるメディア（`ask.media`）。メディアが無ければ項目なし。 */
  media?: AskMediaInfo[];
  /** 成果物（タブの並び）。成果物が無ければ項目なし。 */
  view?: AskViewItem[];
  /** 取得に失敗して外した画像の件数（外部 URL）。0 なら項目なし。 */
  warnings?: number;
}

export type AskMediaFileKind = "image" | "audio" | "text" | "markdown" | "html";

/** サーバが保持しているメディアの 1 つ（中身は `ask.media` で分けて取る）。 */
export interface AskMediaInfo {
  id: number;
  kind: AskMediaFileKind;
  mime: string;
  bytes: number;
}

/** 成果物の 1 件（配る形）。`media` は `AskMediaInfo.id`。 */
export interface AskViewItem {
  title: string;
  kind: "text" | "image" | "markdown" | "html";
  media: number;
}

/** `ask.media` の 1 片の生のバイト数（3 の倍数。base64 の片を文字列のまま連結できる）。 */
export { IMAGE_CHUNK_BYTES as ASK_MEDIA_CHUNK_BYTES } from "./image.js";

/** `ask.features` の結果（機能確認）。`features` の名前は下の `ASK_FEATURES`。 */
export interface AskFeatures {
  features: string[];
  limits: AskLimits;
}

export interface AskLimits {
  fileBytes: number;
  textBytes: number;
  totalBytes: number;
  files: number;
  serverBytes: number;
  views: number;
  /**
   * 真なら（ローカル起動。`fileBytes`・`textBytes`・`totalBytes`・`serverBytes` の上限は無い）、上の 4 つの数は**古い読み手のための従来の値**で、実際の安全弁は `safety`。
   * `files`・`views` は変わらず効く。新しい読み手（ask.py）は `unlimited` を見て大きさの確認を飛ばす。古い読み手は数をそのまま使う（従来どおり上限が効く）。
   */
  unlimited?: boolean;
  safety?: { fileBytes: number; totalBytes: number; serverBytes: number };
}

/** 検査に使う実効の上限（`unlimited` のときは安全弁。テキストの成果物も 1 ファイルの安全弁と同じ）。 */
export interface AskByteLimits {
  file: number;
  text: number;
  total: number;
  server: number;
}

export function askByteLimits(unlimited: boolean): AskByteLimits {
  return unlimited
    ? { file: ASK_MEDIA_LOCAL_FILE_MAX, text: ASK_MEDIA_LOCAL_FILE_MAX, total: ASK_MEDIA_LOCAL_TOTAL_MAX, server: ASK_MEDIA_LOCAL_SERVER_MAX }
    : { file: ASK_MEDIA_FILE_MAX, text: ASK_MEDIA_TEXT_MAX, total: ASK_MEDIA_TOTAL_MAX, server: ASK_MEDIA_SERVER_MAX };
}

/** このサーバ・sodactl が受けられる機能（`sodactl ask --features`・`ask.features`）。 */
export const ASK_FEATURES = ["media", "view", "types:edit", "types:rank", "types:table", "remote-image"] as const;

export function askLimits(unlimited = false): AskLimits {
  const base: AskLimits = {
    fileBytes: ASK_MEDIA_FILE_MAX,
    textBytes: ASK_MEDIA_TEXT_MAX,
    totalBytes: ASK_MEDIA_TOTAL_MAX,
    files: ASK_MEDIA_FILES_MAX,
    serverBytes: ASK_MEDIA_SERVER_MAX,
    views: ASK_VIEW_MAX,
  };
  if (!unlimited) return base;
  return {
    ...base,
    unlimited: true,
    safety: { fileBytes: ASK_MEDIA_LOCAL_FILE_MAX, totalBytes: ASK_MEDIA_LOCAL_TOTAL_MAX, serverBytes: ASK_MEDIA_LOCAL_SERVER_MAX },
  };
}

/** 回答の中身（`ask.answer` の本体と、結果の `answered` の中身）。 */
export interface AskAnswerBody {
  answers: AskAnswers;
  custom?: string[];
  /** 直された `edit` の質問の id。 */
  edited?: string[];
  note?: string;
  comments?: AskComments;
}

// --- 補助 -------------------------------------------------------------------------------

/** JSON にしたときの UTF-8 のバイト数（定義の大きさの判定に使う。循環などで JSON にできなければ無限大）。 */
export function jsonBytes(v: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(v)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** 色として使ってよい文字列か（`#rgb`・`#rgba`・`#rrggbb`・`#rrggbbaa` だけ。スタイルへ他の文字を混ぜさせない）。 */
export function isAskColor(s: unknown): s is string {
  return typeof s === "string" && COLOR_RE.test(s);
}

/** 文字列にしてよい値（文字列・数・真偽）か。オブジェクトの `toString` を呼ばせない（敵対的な入力で例外にしない）。 */
function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** 辞書のキーにしてはいけない名前（代入がプロトタイプの差し替えになる）。 */
const RESERVED_KEY = "__proto__";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 文字数（コードポイント）。 */
function len(s: string): number {
  return Array.from(s).length;
}

// --- メディアの参照 ---------------------------------------------------------------------

export type AskMediaKind = "image" | "audio";
/** 参照の種類。`path` はサーバのマシンのファイル、`https` はサーバが取りに行く URL（画像だけ）、`data` は `data:` の URI。 */
export type AskMediaRefType = "path" | "https" | "data";

const DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|gif|webp|avif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const DATA_AUDIO_RE = /^data:audio\/(?:wav|x-wav|wave|mpeg|mp3|ogg|opus|mp4|x-m4a|aac|flac);base64,[A-Za-z0-9+/]+={0,2}$/;
/** `scheme:` で始まる（Windows のドライブ `C:` は除く）。 */
const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WIN_DRIVE_RE = /^[A-Za-z]:[\\/]/;

/**
 * 参照（`image`・`audio`・`view.file`）の種類を決める。許さないものは null:
 * `https://` 以外の URL（`http:`・`file:`・`javascript:` 等）・`media:`（サーバが付け直すもの）・認証情報つきの URL・443 以外のポート・`data:` の MIME と形の違い・
 * 画像でない `https`（`audio` の `https` は不可）・パスでないもの。
 * `relativePaths` は sodactl の事前の検査用（相対パス・`~/` を通す。サーバへは絶対パスにして送る）。サーバの検査は通さない。
 */
export function classifyMediaRef(ref: string, kind: AskMediaKind | "file", relativePaths = false): AskMediaRefType | null {
  if (ref === "" || ref.includes("\0")) return null;
  if (/^data:/i.test(ref)) {
    if (kind === "file") return null;
    return (kind === "image" ? DATA_IMAGE_RE : DATA_AUDIO_RE).test(ref) ? "data" : null;
  }
  if (/^https:\/\//i.test(ref)) {
    if (kind !== "image") return null;
    if (ref.length > ASK_REF_MAX) return null;
    let u: URL;
    try {
      u = new URL(ref);
    } catch {
      return null;
    }
    if (u.protocol !== "https:" || u.hostname === "" || u.username !== "" || u.password !== "") return null;
    if (u.port !== "" && u.port !== "443") return null;
    return "https";
  }
  if (ref.length > ASK_REF_MAX) return null;
  if (SCHEME_RE.test(ref) && !WIN_DRIVE_RE.test(ref)) return null;
  // UNC（`\\host\share`・`//host/share`・`/\host\share`・`\/host/share`）は通さない（Windows のサーバが外部の SMB へ繋ぎに行く。`\\?\` 系のデバイスパスも同じ形）。
  // 先頭が区切り 2 つのもの（`/` と `\` のどの組み合わせも）を拒否する。POSIX でも `//` 始まりは実装依存で曖昧なので同じく拒否する（docs・既存の期待に `//` 始まりのパスは無い）。
  if (/^[\\/]{2}/.test(ref)) return null;
  if (ref.startsWith("/") || WIN_DRIVE_RE.test(ref)) return "path";
  return relativePaths ? "path" : null;
}

// --- 検査 -------------------------------------------------------------------------------

/**
 * 定義の誤りの分類。共通の試験データ（`third_party/ask-form/fixtures/normalize.json`）の `reasons` の名前のうち Sodashitsu が出すものに、
 * Sodashitsu だけの 2 つ（`not_object`: 定義がオブジェクトでない／`invalid`: 試験データに名前の無い誤り）を足したもの。
 * 上限の超過（大きさ・件数・文字数）は全部 `too_large`。文言（`message`）は直してよいが、分類は ask-form の側と比べるので変えない。
 */
export type AskSpecFailReason =
  | "not_object"
  | "questions_empty"
  | "id_label_required"
  | "id_duplicate"
  | "unsupported_type"
  | "options_empty"
  | "option_value_required"
  | "option_value_duplicate"
  | "showif_unknown_id"
  | "showif_invalid"
  | "paging_invalid"
  | "page_invalid"
  | "code_invalid"
  | "preview_invalid"
  | "row_default_unknown"
  | "media_invalid"
  | "view_invalid"
  | "too_large"
  | "invalid";

/**
 * `unsupportedType` は、`type` が文字列だが **sodactl が対応していない型**のとき（ask-form は `edit`・`rank`・`table` 等の型を足していく）。
 * 質問を黙って落とすと、回答が欠けたまま `answered` になって呼び出し元が聞いたつもりで進んでしまうので、定義の誤り（終了コード 2）にはせず、
 * 呼び出し側が `unavailable` として扱う（ダイアログを出さない）。値は型の名前（短い識別子だけ。それ以外は "?"）。そのときの `reason` は `unsupported_type`。
 */
type Fail = { ok: false; message: string; reason: AskSpecFailReason; unsupportedType?: string };
type Ok = { ok: true; spec: AskSpec };

/**
 * 質問の定義を検査して、既定を埋めた形にする（`ask.py` の `normalize()` と同じ検査＋上限）。知らない項目は落とす。
 * `message` は英語で、場所と理由だけ（定義の文字列の中身は入れない。id の重複のときの id を除く）。
 */
export function normalizeAskSpec(raw: unknown, refOpts: { relativePaths?: boolean } = {}): Ok | Fail {
  const fail = (reason: AskSpecFailReason, message: string): Fail => ({ ok: false, message, reason });
  if (!isObject(raw)) return fail("not_object", "the spec must be an object");
  if (jsonBytes(raw) > ASK_SPEC_MAX_BYTES) return fail("too_large", `the spec is larger than ${ASK_SPEC_MAX_BYTES} bytes`);
  const qs = raw["questions"];
  if (!Array.isArray(qs) || qs.length === 0) return fail("questions_empty", '"questions" must be a non-empty array');
  if (qs.length > ASK_QUESTIONS_MAX) return fail("too_large", `"questions" has more than ${ASK_QUESTIONS_MAX} items`);

  const str = (v: unknown, max: number, where: string): string | undefined | Fail => {
    if (typeof v !== "string") return undefined; // 型の違う任意の文字列の項目は捨てる
    if (len(v) > max) return fail("too_large", `${where} is longer than ${max} characters`);
    return v;
  };
  const isFail = (v: unknown): v is Fail => typeof v === "object" && v !== null && (v as Fail).ok === false;

  const top: Partial<AskSpec> = {};
  for (const [key, max] of [
    ["title", ASK_LABEL_MAX],
    ["intro", ASK_TEXT_MAX],
    ["submit", ASK_LABEL_MAX],
  ] as const) {
    const v = str(raw[key], max, key);
    if (isFail(v)) return v;
    if (v !== undefined) top[key] = v;
  }
  let note = true;
  let notePlaceholder: string | undefined;
  if (raw["note"] === false) note = false;
  else if (typeof raw["note"] === "string") {
    const v = str(raw["note"], ASK_LABEL_MAX, "note");
    if (isFail(v)) return v;
    notePlaceholder = v;
  }
  // `paging`: 無い・null は項目なし（既定は埋めない）。`"auto"`・真偽・1 以上の整数だけ通す（`ask.py` と同じ。共通の試験データに合わせる。数は `true` と同じ扱い）。
  let paging: AskPaging | undefined;
  const pg = raw["paging"];
  if (pg !== undefined && pg !== null) {
    if (pg === "auto" || typeof pg === "boolean" || (typeof pg === "number" && Number.isInteger(pg) && pg >= 1)) paging = pg;
    else return fail("paging_invalid", '"paging" must be "auto", a boolean or an integer of 1 or more');
  }

  // 成果物（`view`）。1 つ（文字列・辞書）か配列。`file` か `text` のどちらか 1 つ（`ask.py` の `normalize_view` と同じ）。
  let view: AskViewSpec[] | undefined;
  const vr = raw["view"];
  if (vr !== undefined && vr !== null) {
    const items: unknown[] = Array.isArray(vr) ? vr : [vr];
    if (items.length === 0) return fail("view_invalid", '"view" must have at least one item');
    if (items.length > ASK_VIEW_MAX) return fail("too_large", `"view" has more than ${ASK_VIEW_MAX} items`);
    view = [];
    for (let i = 0; i < items.length; i++) {
      const vw = Array.isArray(vr) ? `view[${i}]` : "view";
      let v = items[i];
      if (typeof v === "string") v = { file: v };
      if (!isObject(v) || (v["file"] === undefined) === (v["text"] === undefined))
        return fail("view_invalid", `${vw}: exactly one of "file" and "text" is required`);
      const title = str(v["title"], ASK_LABEL_MAX, `${vw}.title`);
      if (isFail(title)) return title;
      if (v["text"] !== undefined) {
        if (typeof v["text"] !== "string") return fail("view_invalid", `${vw}.text must be a string`);
        view.push({ title: title !== undefined && title !== "" ? title : "テキスト", text: v["text"] });
        continue;
      }
      const file = v["file"];
      if (typeof file !== "string" || file === "" || classifyMediaRef(file, "file", refOpts.relativePaths === true) !== "path")
        return fail("view_invalid", `${vw}.file must be an absolute file path`);
      const base = file.split(/[\\/]/).filter((x) => x !== "").pop() ?? file;
      const item: AskViewSpec = { title: title !== undefined && title !== "" ? title : base, file };
      if (v["raw"] === true) item.raw = true;
      view.push(item);
    }
  }

  const questions: AskQuestion[] = [];
  const seen = new Set<string>();
  /** 最初の対応していない型（質問は積まない）。ほかの誤りを見逃さないよう、ループを最後まで回してから返す。 */
  let unsupportedType: string | undefined;
  for (let i = 0; i < qs.length; i++) {
    const where = `questions[${i}]`;
    const q = qs[i];
    if (!isObject(q)) return fail("invalid", `${where} must be an object`);
    const id = q["id"];
    const label = q["label"];
    if (typeof id !== "string" || id === "" || typeof label !== "string" || label === "")
      return fail("id_label_required", `${where}: id and label are required`);
    if (len(id) > ASK_ID_MAX) return fail("too_large", `${where}.id is longer than ${ASK_ID_MAX} characters`);
    if (len(label) > ASK_LABEL_MAX) return fail("too_large", `${where}.label is longer than ${ASK_LABEL_MAX} characters`);
    if (id === RESERVED_KEY) return fail("invalid", `${where}: id "${RESERVED_KEY}" is reserved`);
    if (seen.has(id)) return fail("id_duplicate", `${where}: duplicate id "${id}"`);
    seen.add(id);
    // `page` は `type` より前に見る（`ask.py` と同じ順。対応していない型の質問でも、`page` の誤りは誤り）。
    // 無い・null は項目なし。空文字は通す（部品は「書いた」と扱い、そこから新しいまとまり）。文字列でなければ誤り——`str()` の「捨てる」とは違う。
    const pageRaw = q["page"];
    let page: string | undefined;
    if (pageRaw !== undefined && pageRaw !== null) {
      if (typeof pageRaw !== "string") return fail("page_invalid", `${where}.page must be a string`);
      if (len(pageRaw) > ASK_LABEL_MAX) return fail("too_large", `${where}.page is longer than ${ASK_LABEL_MAX} characters`);
      page = pageRaw;
    }
    const type = q["type"] === undefined ? "single" : q["type"];
    if (type !== "single" && type !== "multi" && type !== "text" && type !== "edit" && type !== "rank" && type !== "table") {
      if (typeof type !== "string") return fail("invalid", `${where}.type must be a string`);
      unsupportedType ??= /^[a-z][a-z0-9_-]{0,31}$/i.test(type) ? type : "?";
      continue; // この質問の中身は読めない（対応していない型の項目）ので、検査せず、答えにも積まない
    }

    const out: AskQuestion = {
      id,
      label,
      type,
      options: [],
      allowOther: q["allowOther"] === true,
      // `edit` は空を許さないのが既定（`required: false` で許す）。ほかは `true` のときだけ必須。
      required: type === "edit" ? q["required"] !== false : q["required"] === true,
      multiline: q["multiline"] === true,
    };
    for (const [key, max] of [
      ["help", ASK_TEXT_MAX],
      ["otherLabel", ASK_LABEL_MAX],
      ["otherPlaceholder", ASK_LABEL_MAX],
      ["placeholder", ASK_LABEL_MAX],
    ] as const) {
      const v = str(q[key], max, `${where}.${key}`);
      if (isFail(v)) return v;
      if (v !== undefined) out[key] = v;
    }
    const mw = q["minWidth"];
    if (typeof mw === "number" && Number.isInteger(mw) && mw >= 60 && mw <= 600) out.minWidth = mw;
    if (page !== undefined) out.page = page;
    // `comment` は `false` のときだけ残す（`ask.py` と同じ。`true`・無い・真偽でない値は項目なし。誤りにしない）。
    if (q["comment"] === false) out.comment = false;

    if (type !== "text" && type !== "edit") {
      // 真偽のときだけ写す（それ以外は落とす。誤りにしない）。`text`・`edit` には選択肢が無いので写さない。
      if (typeof q["filter"] === "boolean") out.filter = q["filter"];
      if (typeof q["showValue"] === "boolean") out.showValue = q["showValue"];
      const pv = q["preview"];
      if (pv !== undefined && pv !== null) {
        if (pv !== "side" && pv !== "inline") return fail("preview_invalid", `${where}.preview must be "side" or "inline"`);
        out.preview = pv;
      }
      const th = q["thumb"];
      if (typeof th === "number" && Number.isInteger(th) && th >= 20 && th <= 2000) out.thumb = th;
      const opts = q["options"];
      if (!Array.isArray(opts) || opts.length === 0) return fail("options_empty", `${where}.options must be a non-empty array`);
      if (opts.length > ASK_OPTIONS_MAX) return fail("too_large", `${where}.options has more than ${ASK_OPTIONS_MAX} items`);
      const values = new Set<string>();
      for (let j = 0; j < opts.length; j++) {
        const ow = `${where}.options[${j}]`;
        let o = opts[j];
        if (typeof o === "string") o = { value: o };
        if (!isObject(o) || !isScalar(o["value"])) return fail("option_value_required", `${ow}: value is required (a string, number or boolean)`);
        const value = String(o["value"]);
        if (len(value) > ASK_ID_MAX) return fail("too_large", `${ow}.value is longer than ${ASK_ID_MAX} characters`);
        if (values.has(value)) return fail("option_value_duplicate", `${where}: duplicate option value`);
        values.add(value);
        const ol = str(o["label"], ASK_LABEL_MAX, `${ow}.label`);
        if (isFail(ol)) return ol;
        const od = str(o["desc"], ASK_TEXT_MAX, `${ow}.desc`);
        if (isFail(od)) return od;
        const opt: AskOption = { value, label: ol ?? value };
        if (od !== undefined) opt.desc = od;
        if (o["recommended"] === true) opt.recommended = true;
        if (Array.isArray(o["colors"])) {
          const colors = o["colors"].filter(isAskColor).slice(0, ASK_COLORS_MAX);
          if (colors.length > 0) opt.colors = colors;
        }
        // メディア・コード・分類（ask.py の `normalize()` と同じ: `code` が文字列でなければ誤り。`image`・`audio` は空・無しなら項目なし）。
        if (o["code"] !== undefined && o["code"] !== null) {
          if (typeof o["code"] !== "string") return fail("code_invalid", `${ow}.code must be a string`);
          if (len(o["code"]) > ASK_CODE_MAX) return fail("too_large", `${ow}.code is longer than ${ASK_CODE_MAX} characters`);
          opt.code = o["code"];
        }
        const lang = str(o["lang"], ASK_LANG_MAX, `${ow}.lang`);
        if (isFail(lang)) return lang;
        if (lang !== undefined) opt.lang = lang;
        const group = str(o["group"], ASK_LABEL_MAX, `${ow}.group`);
        if (isFail(group)) return group;
        if (group !== undefined && group !== "") opt.group = group;
        for (const kind of ["image", "audio"] as const) {
          const ref = o[kind];
          if (ref === undefined || ref === null || ref === "" || ref === false) continue;
          if (typeof ref !== "string") return fail("media_invalid", `${ow}.${kind} must be a string`);
          if (classifyMediaRef(ref, kind, refOpts.relativePaths === true) === null)
            return fail("media_invalid", `${ow}.${kind} must be an absolute file path${kind === "image" ? ", an https URL" : ""} or a data: URI of the same kind`);
          opt[kind] = ref;
        }
        out.options.push(opt);
      }
      if (type === "table") {
        // 行（`ask.py` の `items(q, "rows")`）: 1 つ以上・文字列か {value,label,desc,default}・value は重複なし・`default` は選択肢の value。
        const rr = q["rows"];
        if (!Array.isArray(rr) || rr.length === 0) return fail("options_empty", `${where}.rows must be a non-empty array`);
        if (rr.length > ASK_OPTIONS_MAX) return fail("too_large", `${where}.rows has more than ${ASK_OPTIONS_MAX} items`);
        const rowValues = new Set<string>();
        const rows: AskRow[] = [];
        for (let j = 0; j < rr.length; j++) {
          const rw = `${where}.rows[${j}]`;
          let r = rr[j];
          if (typeof r === "string") r = { value: r };
          if (!isObject(r) || !isScalar(r["value"])) return fail("option_value_required", `${rw}: value is required (a string, number or boolean)`);
          const value = String(r["value"]);
          if (len(value) > ASK_ID_MAX) return fail("too_large", `${rw}.value is longer than ${ASK_ID_MAX} characters`);
          if (rowValues.has(value)) return fail("option_value_duplicate", `${where}: duplicate row value`);
          rowValues.add(value);
          const rl = str(r["label"], ASK_LABEL_MAX, `${rw}.label`);
          if (isFail(rl)) return rl;
          const rd = str(r["desc"], ASK_TEXT_MAX, `${rw}.desc`);
          if (isFail(rd)) return rd;
          const row: AskRow = { value, label: rl ?? value };
          if (rd !== undefined) row.desc = rd;
          if (r["default"] !== undefined && r["default"] !== null) {
            if (!isScalar(r["default"]) || !values.has(String(r["default"]))) return fail("row_default_unknown", `${rw}.default is not one of the options`);
            row.default = String(r["default"]);
          }
          rows.push(row);
        }
        out.rows = rows;
        for (const key of ["rowLabel", "pickLabel"] as const) {
          const v = str(q[key], ASK_LABEL_MAX, `${where}.${key}`);
          if (isFail(v)) return v;
          if (v !== undefined) out[key] = v;
        }
      }
    }

    if (type === "edit") {
      // 最初の文面は `text`（無ければ文字列の `default`）。回答の上限を超える文面は、触らずに決定しても送れなくなるので誤りにする。
      const text = typeof q["text"] === "string" ? q["text"] : typeof q["default"] === "string" ? q["default"] : "";
      if (text.length > ASK_ANSWER_TEXT_MAX) return fail("too_large", `${where}.text is longer than ${ASK_ANSWER_TEXT_MAX} characters`);
      out.text = text;
      const rw = q["rows"];
      if (typeof rw === "number" && Number.isInteger(rw) && rw >= 1 && rw <= 60) out.rows = rw;
      if (typeof q["mono"] === "boolean") out.mono = q["mono"];
    }

    const def = q["default"];
    if (type === "multi") {
      if (typeof def === "string") out.default = [def];
      else if (Array.isArray(def)) out.default = def.filter(isScalar).map(String);
    } else if (type === "single") {
      const first = Array.isArray(def) ? def[0] : def;
      if (isScalar(first)) out.default = String(first);
    } else if (type === "rank") {
      // 最初の順（選択肢の value の並べ替えだけ。そうでなければ項目なし＝選択肢の順）。
      if (Array.isArray(def)) {
        const want = def.filter(isScalar).map(String);
        const have = new Set(out.options.map((o) => o.value));
        if (want.length === have.size && new Set(want).size === want.length && want.every((v) => have.has(v))) out.default = want;
      }
    } else if (type === "table") {
      if (isScalar(def) && out.options.some((o) => o.value === String(def))) out.default = String(def);
    } else if (type === "text" && typeof def === "string") {
      // 回答の上限（`ask.answer` の zod は UTF-16 の長さで見る）を超える初期値は、触らずに決定しても送れなくなるので誤りにする。
      if (def.length > ASK_ANSWER_TEXT_MAX) return fail("too_large", `${where}.default is longer than ${ASK_ANSWER_TEXT_MAX} characters`);
      out.default = def;
    }

    // `showIf` が null・空の配列・空のオブジェクトなら無いものとして扱う（ask-form の `q.get("showIf") or {}` と同じ。項目ごと落とす）。
    const sif = q["showIf"];
    if (sif !== undefined && sif !== null && !(Array.isArray(sif) && sif.length === 0)) {
      if (!isObject(sif)) return fail("showif_invalid", `${where}.showIf must be an object`);
      const cond: Record<string, string[]> = {};
      for (const [dep, want] of Object.entries(sif)) {
        if (dep === RESERVED_KEY) return fail("showif_unknown_id", `${where}.showIf refers to an unknown question id`);
        cond[dep] = (Array.isArray(want) ? want : [want]).filter(isScalar).map(String);
      }
      if (Object.keys(cond).length > 0) out.showIf = cond;
    }
    questions.push(out);
  }
  for (let i = 0; i < questions.length; i++)
    for (const dep of Object.keys(questions[i]!.showIf ?? {}))
      if (!seen.has(dep)) return fail("showif_unknown_id", `questions[${i}].showIf refers to an unknown question id`);

  if (unsupportedType !== undefined) return { ok: false, message: "a question type is not supported", reason: "unsupported_type", unsupportedType };
  const spec: AskSpec = { title: top.title ?? "質問", submit: top.submit ?? "決定", note, questions };
  if (top.intro !== undefined) spec.intro = top.intro;
  if (notePlaceholder !== undefined) spec.notePlaceholder = notePlaceholder;
  if (paging !== undefined) spec.paging = paging;
  // 成果物があれば質問の欄は幅が狭いので、目次は出さない（書いてあればそれに従う。`ask.py` と同じ）。
  if (view !== undefined) {
    spec.view = view;
    spec.paging ??= false;
  }
  if (raw["comments"] === false) spec.comments = false;
  return { ok: true, spec };
}

// --- 回答の集め方（`form.html` の collect() と同じ）-----------------------------------------

/** フォームの入力の状態。 */
export interface AskFormState {
  /** 質問の id → 選んだ選択肢の値（`multi` は複数。空文字の値の選択肢もある）。「その他」を選んだかは値ではなく `otherPicked` で持つ。 */
  picked: Record<string, string[]>;
  otherPicked: Record<string, boolean>;
  otherText: Record<string, string>;
  text: Record<string, string>;
  note: string;
  /** 質問の id → 自由記述の欄の中身（省略可）。 */
  comments?: Record<string, string>;
  /** `rank`: 質問の id → 並べた選択肢の value（省略か不正は選択肢の順）。 */
  order?: Record<string, string[]>;
  /** `table`: 質問の id → {行の value: 選んだ value}（省略した行は、その行の `default` → 質問の `default` → 最初の選択肢）。 */
  rowPick?: Record<string, Record<string, string>>;
}

/** `default` を選択済みにした初期状態。 */
export function initialAskState(spec: AskSpec): AskFormState {
  const state: AskFormState = { picked: {}, otherPicked: {}, otherText: {}, text: {}, note: "" };
  for (const q of spec.questions) {
    if (q.type === "text") {
      state.text[q.id] = typeof q.default === "string" ? q.default : "";
      continue;
    }
    if (q.type === "edit") {
      state.text[q.id] = q.text ?? "";
      continue;
    }
    if (q.type === "rank") {
      (state.order ??= {})[q.id] = rankOrder(q, undefined);
      continue;
    }
    if (q.type === "table") {
      (state.rowPick ??= {})[q.id] = rowPicks(q, undefined);
      continue;
    }
    const values = new Set(q.options.map((o) => o.value));
    const d = q.default === undefined ? [] : Array.isArray(q.default) ? q.default : [q.default];
    state.picked[q.id] = d.filter((v) => values.has(v));
    state.otherPicked[q.id] = false;
    state.otherText[q.id] = "";
  }
  return state;
}

/**
 * その質問に自由記述を付けられるか（部品 `<ask-form>` の `commentable` と同じ 4 条件）。
 * 定義の `comments` が `false` でない・質問の `comment` が `false` でない・`text` でない・即確定のフォーム（質問が 1 つ・`single`・補足なし）でない。
 */
export function askCommentable(spec: AskSpec, q: AskQuestion): boolean {
  if (spec.comments === false || q.comment === false || q.type === "text") return false;
  return !(spec.questions.length === 1 && spec.questions[0]?.type === "single" && !spec.note);
}

/** その質問が、いまの回答（上の質問の答え）で表示されるか（`showIf` の判定）。 */
export function askVisible(q: AskQuestion, answers: AskAnswers): boolean {
  for (const [dep, want] of Object.entries(q.showIf ?? {})) {
    if (!Object.hasOwn(answers, dep)) return false;
    const given = answers[dep];
    const have = typeof given === "string" ? [given] : Array.isArray(given) ? given : []; // 辞書（table）は条件にならない
    if (!want.some((w) => have.includes(w))) return false;
  }
  return true;
}

/** `rank` の並び: 渡された順が選択肢の value の並べ替えならそれ、そうでなければ `default`、それも無ければ選択肢の順（部品の `set` と同じ）。 */
function rankOrder(q: AskQuestion, given: readonly string[] | undefined): string[] {
  const values = q.options.map((o) => o.value);
  const ok = (a: readonly string[] | undefined): a is readonly string[] => a !== undefined && a.length === values.length && new Set(a).size === a.length && a.every((v) => values.includes(v));
  if (ok(given)) return [...given];
  if (Array.isArray(q.default) && ok(q.default)) return [...q.default];
  return values;
}

/** `table` の選択: 行ごとに、渡された値（選択肢にあるもの）→ 行の `default` → 質問の `default` → 最初の選択肢。 */
function rowPicks(q: AskQuestion, given: Record<string, string> | undefined): Record<string, string> {
  const values = new Set(q.options.map((o) => o.value));
  const first = q.options[0]?.value ?? "";
  const qd = typeof q.default === "string" && values.has(q.default) ? q.default : undefined;
  // `Object.fromEntries`（行の value が `__proto__` でも自分のキーになる。代入だとプロトタイプの差し替えになる）。
  return Object.fromEntries(
    (Array.isArray(q.rows) ? q.rows : []).map((r): [string, string] => {
      const g = given !== undefined && Object.hasOwn(given, r.value) ? given[r.value] : undefined;
      return [r.value, g !== undefined && values.has(g) ? g : (r.default ?? qd ?? first)];
    }),
  );
}

function valueOf(q: AskQuestion, state: AskFormState): AskAnswerValue | null {
  if (q.type === "text") return (state.text[q.id] ?? "").trim();
  // 直す: 末尾の空白だけ除く（部品の `get` と同じ。先頭の空白・行頭の字下げは文面の一部）。
  if (q.type === "edit") return (state.text[q.id] ?? q.text ?? "").replace(/\s+$/, "");
  if (q.type === "rank") return rankOrder(q, state.order?.[q.id]);
  if (q.type === "table") return rowPicks(q, state.rowPick?.[q.id]);
  const picked = state.picked[q.id] ?? [];
  const other = (state.otherText[q.id] ?? "").trim();
  // 値が空文字の選択肢は、ふつうの選択肢（選べば回答は `""`）。空文字を落とすのは、空文字の値の選択肢が**無い**質問のときだけ
  // （選択肢に無い空文字は、何も選んでいないのと同じ）。「その他」の空の入力は下の行で別に扱う——選択肢の値とは混ぜない。
  const hasEmpty = q.options.some((o) => o.value === "");
  // 複数選択は、選んだ順ではなく**定義の順**に揃える（部品 `<ask-form>` は DOM の順に読む。選択肢に無い値は入れない）。「その他」の入力は最後。
  const vals = q.type === "multi" ? q.options.map((o) => o.value).filter((v) => picked.includes(v)) : picked.filter((v) => v !== "" || hasEmpty);
  if (state.otherPicked[q.id] === true && other !== "") vals.push(other);
  return q.type === "multi" ? vals : (vals[0] ?? null);
}

/**
 * 上から順に見て、表示条件（`showIf`）を満たす質問だけを回答に入れる。`single` の未回答は answers に入れず `lacking` に数える。
 * 「その他」を選んでいて入力が空のときは、その選択は無いものとして扱う（`form.html` と同じ）。値が空文字の**選択肢**を選んだときは、
 * 回答が `""`（未回答ではない。`multi` は `[""]` で、`required` も満たす）。
 */
export function collectAsk(
  spec: AskSpec,
  state: AskFormState,
): { answers: AskAnswers; custom: string[]; edited: string[]; note?: string; comments?: AskComments; visible: string[]; lacking: string[] } {
  const answers: AskAnswers = {};
  const comments: AskComments = {};
  const custom: string[] = [];
  const edited: string[] = [];
  const visible: string[] = [];
  const lacking: string[] = [];
  for (const q of spec.questions) {
    if (!askVisible(q, answers)) continue;
    visible.push(q.id);
    const v = valueOf(q, state);
    const missing =
      q.type === "single" ? v === null : q.type === "rank" || q.type === "table" ? false : q.required ? (v as string | string[]).length === 0 : false;
    if (missing) lacking.push(q.id);
    if (!missing || q.type !== "single") answers[q.id] = v as AskAnswerValue;
    if ((q.type === "single" || q.type === "multi") && state.otherPicked[q.id] === true) custom.push(q.id);
    if (q.type === "edit" && (state.text[q.id] ?? q.text ?? "") !== (q.text ?? "")) edited.push(q.id);
    // 自由記述: 見えていて付けられる質問の、自分の項目（継承された値は拾わない）。空白だけは入れない。
    if (askCommentable(spec, q) && state.comments !== undefined && Object.hasOwn(state.comments, q.id)) {
      const c = state.comments[q.id];
      if (typeof c === "string" && c.trim() !== "") comments[q.id] = c.trim();
    }
  }
  const out: { answers: AskAnswers; custom: string[]; edited: string[]; note?: string; comments?: AskComments; visible: string[]; lacking: string[] } = { answers, custom, edited, visible, lacking };
  if (Object.keys(comments).length > 0) out.comments = comments;
  const note = spec.note ? state.note.trim() : "";
  if (note !== "") out.note = note;
  return out;
}

/**
 * 回答の検査（サーバが `ask.answer` に当てる）。誤りの理由（英語・中身を含めない）を返す。null は可。
 * `collectAsk` と同じ順で上から見る。空文字の回答は、その質問に値が空文字の選択肢があるときだけ通す（「その他」の入力としては通さない）。
 */
export function checkAskAnswer(spec: AskSpec, body: AskAnswerBody): string | null {
  const answers = body.answers;
  const custom = body.custom ?? [];
  const customSet = new Set(custom);
  if (customSet.size !== custom.length) return "custom has duplicate ids";
  const shown = new Map<string, AskQuestion>();
  const seen: AskAnswers = {};
  for (const q of spec.questions) {
    if (!askVisible(q, seen)) {
      if (Object.hasOwn(answers, q.id)) return `answers has a hidden question: ${index(spec, q.id)}`;
      continue;
    }
    shown.set(q.id, q);
    const a = Object.hasOwn(answers, q.id) ? answers[q.id] : undefined;
    if (q.type === "text") {
      if (typeof a !== "string") return `questions[${index(spec, q.id)}] must be answered with a string`;
      if (q.required && a === "") return `questions[${index(spec, q.id)}] is required`;
    } else if (q.type === "edit") {
      if (typeof a !== "string") return `questions[${index(spec, q.id)}] must be answered with a string`;
      if (q.required && a === "") return `questions[${index(spec, q.id)}] is required`;
    } else if (q.type === "rank") {
      // 選択肢の value の並べ替え（過不足・重複なし）。
      if (!Array.isArray(a) || a.length !== q.options.length || new Set(a).size !== a.length || !a.every((v) => typeof v === "string" && q.options.some((o) => o.value === v)))
        return `questions[${index(spec, q.id)}] must be answered with every option exactly once`;
    } else if (q.type === "table") {
      // 行の value 全部をキーに持ち、値はすべて選択肢の value。
      const rows = Array.isArray(q.rows) ? q.rows : [];
      if (typeof a !== "object" || a === null || Array.isArray(a)) return `questions[${index(spec, q.id)}] must be answered with an object`;
      const keys = Object.keys(a);
      if (keys.length !== rows.length || !rows.every((r) => Object.hasOwn(a, r.value))) return `questions[${index(spec, q.id)}] must have exactly one value for each row`;
      if (!keys.every((k) => q.options.some((o) => o.value === (a as Record<string, string>)[k]))) return `questions[${index(spec, q.id)}] has a value that is not an option`;
    } else if (q.type === "single") {
      if (typeof a !== "string") return `questions[${index(spec, q.id)}] must be answered with a string`;
      if (!isAllowedValue(q, a, customSet.has(q.id))) return `questions[${index(spec, q.id)}] has a value that is not an option`;
    } else {
      if (!Array.isArray(a)) return `questions[${index(spec, q.id)}] must be answered with an array`;
      if (q.required && a.length === 0) return `questions[${index(spec, q.id)}] is required`;
      let others = 0;
      for (const v of a) {
        if (typeof v !== "string") return `questions[${index(spec, q.id)}] must be answered with strings`;
        if (!q.options.some((o) => o.value === v)) {
          others++;
          if (!customSet.has(q.id) || v === "") return `questions[${index(spec, q.id)}] has a value that is not an option`;
        }
      }
      if (others > 1) return `questions[${index(spec, q.id)}] has more than one free-text value`;
    }
    seen[q.id] = a as AskAnswerValue;
  }
  for (const id of Object.keys(answers)) if (!shown.has(id)) return "answers has an unknown question id";
  for (const id of custom) {
    const q = shown.get(id);
    if (!q || (q.type !== "single" && q.type !== "multi") || !q.allowOther) return "custom has an id that does not accept free text";
  }
  const edited = body.edited ?? [];
  if (new Set(edited).size !== edited.length) return "edited has duplicate ids";
  for (const id of edited) if (shown.get(id)?.type !== "edit") return "edited has an id that is not an edit question";
  if (body.note !== undefined && !spec.note) return "this form has no note field";
  if (body.comments !== undefined) {
    let total = 0;
    for (const [id, text] of Object.entries(body.comments)) {
      const q = shown.get(id);
      if (!q) return "comments has an unknown question id";
      if (!askCommentable(spec, q)) return "comments has an id that does not accept a comment";
      if (typeof text !== "string") return "comments must have string values";
      total += text.length;
    }
    if (total > ASK_COMMENTS_TOTAL_MAX) return `comments are longer than ${ASK_COMMENTS_TOTAL_MAX} characters in total`;
  }
  return null;
}

function isAllowedValue(q: AskQuestion, v: string, custom: boolean): boolean {
  if (q.options.some((o) => o.value === v)) return true;
  return custom && v !== "";
}

function index(spec: AskSpec, id: string): number {
  return spec.questions.findIndex((q) => q.id === id);
}
