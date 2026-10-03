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
export const ASK_TIMEOUT_DEFAULT_MS = 540_000;
export const ASK_TIMEOUT_MIN_MS = 1_000;
export const ASK_TIMEOUT_MAX_MS = 86_400_000;
/** サーバが同時に待てる質問の総数（定義 256 KiB × 総数で、メモリと `ask.subscribe` の応答の大きさが頭打ちになる）。 */
export const ASK_PENDING_MAX = 32;
/** 1 つの接続（`ask.open` を送った sodactl 等）が同時に待たせられる質問の数。 */
export const ASK_PENDING_PER_CLIENT_MAX = 8;
/** `ask.open` の `askId` の長さの上限。 */
export const ASK_ASKID_MAX = 64;

// --- 型 ---------------------------------------------------------------------------------

export interface AskOption {
  value: string;
  label: string;
  desc?: string;
  recommended?: true;
  colors?: string[];
}

export type AskQuestionType = "single" | "multi" | "text";

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
  questions: AskQuestion[];
}

export type AskAnswers = Record<string, string | string[]>;

export type AskResult =
  | { status: "answered"; answers: AskAnswers; custom?: string[]; note?: string }
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
  spec: AskSpec;
}

/** 回答の中身（`ask.answer` の本体と、結果の `answered` の中身）。 */
export interface AskAnswerBody {
  answers: AskAnswers;
  custom?: string[];
  note?: string;
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
export function normalizeAskSpec(raw: unknown): Ok | Fail {
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
    if (type !== "single" && type !== "multi" && type !== "text") {
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
      required: q["required"] === true,
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

    if (type !== "text") {
      // 真偽のときだけ写す（それ以外は落とす。誤りにしない）。`text` には選択肢が無いので写さない。
      if (typeof q["filter"] === "boolean") out.filter = q["filter"];
      if (typeof q["showValue"] === "boolean") out.showValue = q["showValue"];
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
        out.options.push(opt);
      }
    }

    const def = q["default"];
    if (type === "multi") {
      if (typeof def === "string") out.default = [def];
      else if (Array.isArray(def)) out.default = def.filter(isScalar).map(String);
    } else if (type === "single") {
      const first = Array.isArray(def) ? def[0] : def;
      if (isScalar(first)) out.default = String(first);
    } else if (typeof def === "string") {
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
}

/** `default` を選択済みにした初期状態。 */
export function initialAskState(spec: AskSpec): AskFormState {
  const state: AskFormState = { picked: {}, otherPicked: {}, otherText: {}, text: {}, note: "" };
  for (const q of spec.questions) {
    if (q.type === "text") {
      state.text[q.id] = typeof q.default === "string" ? q.default : "";
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

/** その質問が、いまの回答（上の質問の答え）で表示されるか（`showIf` の判定）。 */
export function askVisible(q: AskQuestion, answers: AskAnswers): boolean {
  for (const [dep, want] of Object.entries(q.showIf ?? {})) {
    if (!Object.hasOwn(answers, dep)) return false;
    const have = ([] as string[]).concat(answers[dep] ?? []);
    if (!want.some((w) => have.includes(w))) return false;
  }
  return true;
}

function valueOf(q: AskQuestion, state: AskFormState): string | string[] | null {
  if (q.type === "text") return (state.text[q.id] ?? "").trim();
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
): { answers: AskAnswers; custom: string[]; note?: string; visible: string[]; lacking: string[] } {
  const answers: AskAnswers = {};
  const custom: string[] = [];
  const visible: string[] = [];
  const lacking: string[] = [];
  for (const q of spec.questions) {
    if (!askVisible(q, answers)) continue;
    visible.push(q.id);
    const v = valueOf(q, state);
    const missing = q.type === "single" ? v === null : q.required ? (v as string | string[]).length === 0 : false;
    if (missing) lacking.push(q.id);
    if (!missing || q.type !== "single") answers[q.id] = v as string | string[];
    if (q.type !== "text" && state.otherPicked[q.id] === true) custom.push(q.id);
  }
  const out: { answers: AskAnswers; custom: string[]; note?: string; visible: string[]; lacking: string[] } = { answers, custom, visible, lacking };
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
    seen[q.id] = a as string | string[];
  }
  for (const id of Object.keys(answers)) if (!shown.has(id)) return "answers has an unknown question id";
  for (const id of custom) {
    const q = shown.get(id);
    if (!q || q.type === "text" || !q.allowOther) return "custom has an id that does not accept free text";
  }
  if (body.note !== undefined && !spec.note) return "this form has no note field";
  return null;
}

function isAllowedValue(q: AskQuestion, v: string, custom: boolean): boolean {
  if (q.options.some((o) => o.value === v)) return true;
  return custom && v !== "";
}

function index(spec: AskSpec, id: string): number {
  return spec.questions.findIndex((q) => q.id === id);
}
