import { describe, expect, it } from "vitest";
import {
  ASK_CODE_MAX,
  ASK_COLORS_MAX,
  ASK_COMMENTS_TOTAL_MAX,
  ASK_OPTIONS_MAX,
  ASK_QUESTIONS_MAX,
  ASK_SPEC_MAX_BYTES,
  ASK_VIEW_MAX,
  classifyMediaRef,
  askCommentable,
  checkAskAnswer,
  collectAsk,
  initialAskState,
  isAskColor,
  normalizeAskSpec,
  type AskFormState,
  type AskSpec,
  unsupportedTypeReason,
} from "./ask.js";
import fixture from "./ask.fixture.json" with { type: "json" };

/** `ask-form` の `generate.py --ask-spec` の出力（7 問・テーマ 13 件・出し分け 2 つ）。 */
function spec(raw: unknown): AskSpec {
  const r = normalizeAskSpec(raw);
  if (!r.ok) throw new Error(r.message);
  return r.spec;
}
const bad = (raw: unknown): string => {
  const r = normalizeAskSpec(raw);
  if (r.ok) throw new Error("expected a failure");
  return r.message;
};
/** 誤りの分類（共通の試験データの `reasons` の名前。文言ではなくこれで比べる）。 */
const reason = (raw: unknown): string => {
  const r = normalizeAskSpec(raw);
  if (r.ok) throw new Error("expected a failure");
  return r.reason;
};
const q = (extra: Record<string, unknown> = {}) => ({ id: "a", label: "A", options: ["x", "y"], ...extra });

describe("normalizeAskSpec — 誤り", () => {
  it("オブジェクトでない・questions が配列でない／空", () => {
    for (const raw of [null, 1, "x", [], { questions: "x" }, { questions: [] }, {}]) expect(bad(raw)).toBeTruthy();
  });
  it("id・label が無い／空・id の重複・知らない type・選択肢が無い／空・value の重複・showIf が無い id を指す", () => {
    expect(bad({ questions: [{ label: "A", options: ["x"] }] })).toMatch(/id and label/);
    expect(bad({ questions: [{ id: "a", label: "", options: ["x"] }] })).toMatch(/id and label/);
    expect(bad({ questions: [q(), q()] })).toContain('duplicate id "a"');
    expect(bad({ questions: [q({ type: 5 })] })).toMatch(/type/);
    expect(bad({ questions: [{ id: "a", label: "A" }] })).toMatch(/options/);
    expect(bad({ questions: [q({ options: [] })] })).toMatch(/options/);
    expect(bad({ questions: [q({ options: ["x", "x"] })] })).toMatch(/duplicate option value/);
    expect(bad({ questions: [q({ options: [{ label: "L" }] })] })).toMatch(/value is required/);
    expect(bad({ questions: [q({ showIf: { nothing: "x" } })] })).toMatch(/unknown question id/);
    expect(bad({ questions: [q({ showIf: "x" })] })).toMatch(/showIf must be an object/);
  });
  it("対応していない型（知らない文字列。edit・rank・table は対応済み）は誤りでなく unsupportedType として返す（黙って落とさない）。型の名前は短い識別子だけ", () => {
    for (const type of ["slider", "radio"]) {
      const r = normalizeAskSpec({ questions: [q({ id: "a" }), { id: "e", label: "E", type, text: "文面" }] });
      expect(r).toMatchObject({ ok: false, unsupportedType: type });
    }
    expect(normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "<script>x</script>" }] })).toMatchObject({ ok: false, unsupportedType: "?" });
    expect(unsupportedTypeReason("slider")).toContain('"slider"');
    // 未対応の型の質問より後ろの誤りも見逃さない（誤りが優先）。前の誤りも同じ
    expect(bad({ questions: [{ id: "e", label: "E", type: "slider" }, { id: "b", label: "B" }] })).toMatch(/options/);
    expect(bad({ questions: [{ id: "e", label: "E", type: "slider" }, q({ id: "b", showIf: { nothing: "x" } })] })).toMatch(/unknown question id/);
    expect(bad({ questions: [{ id: "e", label: "E", type: "slider" }, { id: "e", label: "E2", type: "rank" }] })).toContain('duplicate id "e"');
    // 未対応の質問の id を showIf が指すのは誤りでない
    expect(normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "slider" }, q({ id: "b", showIf: { e: "x" } })] })).toMatchObject({ ok: false, unsupportedType: "slider" });
    // 対応している型どうしの誤りは、今までどおり誤り
    expect(normalizeAskSpec({ questions: [{ id: "a", label: "A" }] })).not.toHaveProperty("unsupportedType");
  });
  it("上限: 定義の大きさ・質問の数・選択肢の数・文字数", () => {
    expect(bad({ questions: [q({ help: "x".repeat(ASK_SPEC_MAX_BYTES) })] })).toMatch(/larger than/);
    expect(bad({ questions: Array.from({ length: ASK_QUESTIONS_MAX + 1 }, (_, i) => q({ id: `q${i}` })) })).toMatch(/more than/);
    expect(bad({ questions: [q({ options: Array.from({ length: ASK_OPTIONS_MAX + 1 }, (_, i) => `v${i}`) })] })).toMatch(/more than/);
    expect(bad({ title: "x".repeat(501), questions: [q()] })).toMatch(/title/);
    expect(bad({ questions: [q({ id: "x".repeat(201) })] })).toMatch(/id is longer/);
    expect(bad({ questions: [q({ help: "x".repeat(4001) })] })).toMatch(/help/);
    expect(bad({ questions: [q({ options: [{ value: "v", desc: "x".repeat(4001) }] })] })).toMatch(/desc/);
  });
  it("敵対的な入力で例外にならず誤りにする／丸める（toString を持つオブジェクト・__proto__・継承されたキー名）", () => {
    const parse = (t: string): unknown => JSON.parse(t);
    expect(bad(parse('{"questions":[{"id":"a","label":"A","options":[{"value":{"toString":"x"}}]}]}'))).toMatch(/value is required/);
    expect(bad(parse('{"questions":[{"id":"__proto__","label":"A","options":["x"]}]}'))).toMatch(/reserved/);
    expect(bad(parse('{"questions":[{"id":"a","label":"A","options":["x"],"showIf":{"__proto__":["x"]}}]}'))).toMatch(/unknown question id/);
    const s2 = spec(parse('{"questions":[{"id":"a","label":"A","options":["x"],"default":{"toString":"x"},"showIf":{}},{"id":"b","label":"B","options":["x"],"default":[{"toString":1},"x"],"type":"multi","showIf":{"a":[{"toString":1},"x"]}}]}'));
    expect(s2.questions[0]!.default).toBeUndefined();
    expect(s2.questions[1]!.default).toEqual(["x"]);
    expect(s2.questions[1]!.showIf).toEqual({ a: ["x"] });
  });
  it("showIf: null・空の配列・空のオブジェクトは無いものとして扱う（ask-form と同じ。項目ごと落とす）", () => {
    expect(spec({ questions: [q({ showIf: null })] }).questions[0]).not.toHaveProperty("showIf");
    expect(spec({ questions: [q({ showIf: [] })] }).questions[0]).not.toHaveProperty("showIf");
    expect(spec({ questions: [q({ showIf: {} })] }).questions[0]).not.toHaveProperty("showIf");
  });
  it("text の default が回答の上限を超える定義は誤り（触らずに決定しても送れなくなるため）。id・value は 200 文字（コードポイント）まで", () => {
    expect(bad({ questions: [{ id: "t", label: "T", type: "text", default: "x".repeat(10_001) }] })).toMatch(/default/);
    spec({ questions: [{ id: "t", label: "T", type: "text", default: "x".repeat(10_000) }] });
    // 絵文字（UTF-16 では 2 単位）の 200 個の id は通り、その回答（zod の上限は UTF-16 の余裕つき）も通る
    const id = "😀".repeat(200);
    expect(spec({ questions: [q({ id })] }).questions[0]!.id).toBe(id);
    expect(bad({ questions: [q({ id: "😀".repeat(201) })] })).toMatch(/id is longer/);
  });
  it("誤りには分類（reason）が付く。上限の超過は全部 too_large・試験データに名前の無い誤りは invalid", () => {
    for (const raw of [null, 1, "x", []]) expect(reason(raw)).toBe("not_object");
    for (const raw of [{}, { questions: "x" }, { questions: [] }]) expect(reason(raw)).toBe("questions_empty");
    expect(reason({ questions: [{ label: "A", options: ["x"] }] })).toBe("id_label_required");
    expect(reason({ questions: [{ id: "a", label: "", options: ["x"] }] })).toBe("id_label_required");
    expect(reason({ questions: [q(), q()] })).toBe("id_duplicate");
    expect(reason({ questions: [{ id: "a", label: "A" }] })).toBe("options_empty");
    expect(reason({ questions: [q({ options: [] })] })).toBe("options_empty");
    expect(reason({ questions: [q({ options: [{ label: "L" }] })] })).toBe("option_value_required");
    expect(reason({ questions: [q({ options: ["x", "x"] })] })).toBe("option_value_duplicate");
    expect(reason({ questions: [q({ showIf: { nothing: "x" } })] })).toBe("showif_unknown_id");
    expect(reason(JSON.parse('{"questions":[{"id":"a","label":"A","options":["x"],"showIf":{"__proto__":["x"]}}]}'))).toBe("showif_unknown_id");
    expect(reason({ questions: [q({ showIf: "x" })] })).toBe("showif_invalid");
    // 対応していない型（unsupportedType と一緒に返る）
    for (const type of ["slider"]) {
      expect(normalizeAskSpec({ questions: [q({ type })] })).toMatchObject({ ok: false, reason: "unsupported_type", unsupportedType: type });
    }
    // 上限
    expect(reason({ questions: [q({ help: "x".repeat(ASK_SPEC_MAX_BYTES) })] })).toBe("too_large");
    expect(reason({ questions: Array.from({ length: ASK_QUESTIONS_MAX + 1 }, (_, i) => q({ id: `q${i}` })) })).toBe("too_large");
    expect(reason({ questions: [q({ options: Array.from({ length: ASK_OPTIONS_MAX + 1 }, (_, i) => `v${i}`) })] })).toBe("too_large");
    expect(reason({ title: "x".repeat(501), questions: [q()] })).toBe("too_large");
    expect(reason({ note: "x".repeat(501), questions: [q()] })).toBe("too_large");
    expect(reason({ questions: [q({ id: "x".repeat(201) })] })).toBe("too_large");
    expect(reason({ questions: [q({ label: "x".repeat(501) })] })).toBe("too_large");
    expect(reason({ questions: [q({ help: "x".repeat(4001) })] })).toBe("too_large");
    expect(reason({ questions: [q({ options: ["x".repeat(201)] })] })).toBe("too_large");
    expect(reason({ questions: [q({ options: [{ value: "v", desc: "x".repeat(4001) }] })] })).toBe("too_large");
    expect(reason({ questions: [{ id: "t", label: "T", type: "text", default: "x".repeat(10_001) }] })).toBe("too_large");
    // Sodashitsu だけの誤り
    expect(reason({ questions: ["x"] })).toBe("invalid");
    expect(reason({ questions: [q({ type: 5 })] })).toBe("invalid");
    expect(reason(JSON.parse('{"questions":[{"id":"__proto__","label":"A","options":["x"]}]}'))).toBe("invalid");
  });
  it("paging: \"auto\"・真偽・1 以上の整数は通る。それ以外は paging_invalid。無い・null は項目なし（既定を埋めない）", () => {
    for (const paging of ["auto", true, false, 1, 3]) expect(spec({ paging, questions: [q()] }).paging).toBe(paging);
    expect(spec({ questions: [q()] })).not.toHaveProperty("paging");
    expect(spec({ paging: null, questions: [q()] })).not.toHaveProperty("paging");
    for (const paging of [0, -1, 1.5, "many", "3", "", [], {}, Number.NaN]) {
      const r = normalizeAskSpec({ paging, questions: [q()] });
      expect(r, JSON.stringify(paging)).toMatchObject({ ok: false, reason: "paging_invalid" });
      expect(r).not.toHaveProperty("unsupportedType");
    }
    expect(bad({ paging: "many", questions: [q()] })).toMatch(/paging/);
  });
  it("page: 文字列（空文字も）は通る。null は項目なし。文字列でなければ page_invalid・501 文字は too_large", () => {
    expect(spec({ questions: [q({ page: "基本" })] }).questions[0]!.page).toBe("基本");
    expect(spec({ questions: [q({ page: "" })] }).questions[0]!.page).toBe("");
    expect(spec({ questions: [q({ page: "x".repeat(500) })] }).questions[0]!.page).toHaveLength(500);
    expect(spec({ questions: [q({ page: null })] }).questions[0]).not.toHaveProperty("page");
    expect(spec({ questions: [q()] }).questions[0]).not.toHaveProperty("page");
    // text の質問にも付く
    expect(spec({ questions: [{ id: "t", label: "T", type: "text", page: "記入" }] }).questions[0]!.page).toBe("記入");
    for (const page of [2, true, ["a"], {}]) expect(reason({ questions: [q({ page })] }), JSON.stringify(page)).toBe("page_invalid");
    expect(reason({ questions: [q({ page: "x".repeat(501) })] })).toBe("too_large");
    expect(bad({ questions: [q({ page: 2 })] })).toMatch(/page must be a string/);
  });
  it("page は type より前に見る: 対応していない型の質問の不正な page も誤り（unavailable にしない）。id の重複はそれより前", () => {
    const r = normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "slider", page: 2 }] });
    expect(r).toMatchObject({ ok: false, reason: "page_invalid" });
    expect(r).not.toHaveProperty("unsupportedType");
    expect(reason({ questions: [{ id: "e", label: "E", type: "slider", page: "x".repeat(501) }] })).toBe("too_large");
    // page が正しければ、今までどおり対応していない型
    expect(normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "slider", page: "直す" }] })).toMatchObject({ ok: false, reason: "unsupported_type", unsupportedType: "slider" });
    expect(reason({ questions: [q(), q({ page: 2 })] })).toBe("id_duplicate");
  });
  it("選択肢の value が __other__ の定義は通る（ふつうの選択肢。「その他」の印は値ではない）", () => {
    for (const extra of [{}, { allowOther: true }, { type: "multi" }]) {
      expect(spec({ questions: [q({ options: ["x", "__other__"], ...extra })] }).questions[0]!.options.map((o) => o.value)).toEqual(["x", "__other__"]);
      expect(spec({ questions: [q({ options: ["x", { value: "__other__", label: "ほか" }], ...extra })] }).questions[0]!.options[1]).toEqual({ value: "__other__", label: "ほか" });
    }
    // default にも使える（選択済みで出て、触らずに決定するとその値）
    const s = spec({ questions: [q({ options: ["x", "__other__"], default: "__other__", allowOther: true })] });
    expect(s.questions[0]!.default).toBe("__other__");
    const r = collectAsk(s, initialAskState(s));
    expect(r).toMatchObject({ answers: { a: "__other__" }, custom: [], lacking: [] });
    expect(checkAskAnswer(s, { answers: r.answers })).toBeNull();
  });
  it("選択肢の value が空文字の定義は通る（表示名が無ければ表示名も空文字）。default が空文字なら選択済み", () => {
    const s = spec({ questions: [q({ options: [{ value: "", label: "なし" }, "x"], default: "" }), q({ id: "m", type: "multi", options: ["", "x"], default: [""] })] });
    expect(s.questions[0]!.options[0]).toEqual({ value: "", label: "なし" });
    expect(s.questions[0]!.default).toBe("");
    expect(s.questions[1]!.options[0]).toEqual({ value: "", label: "" });
    expect(initialAskState(s).picked).toEqual({ a: [""], m: [""] });
    // 空文字の値の選択肢が無い質問では、default の空文字は選択済みにしない
    const none = spec({ questions: [q({ default: "" })] });
    expect(initialAskState(none).picked).toEqual({ a: [] });
    // 空文字の値が 2 つあれば重複
    expect(reason({ questions: [q({ options: ["", { value: "" }] })] })).toBe("option_value_duplicate");
  });
  it("message に定義の文字列（id の重複を除く）を入れない", () => {
    expect(bad({ questions: [q({ label: "SECRET-LABEL", type: "nope" })] })).not.toContain("SECRET");
    expect(bad({ questions: [q({ options: [{ value: "SECRET-VALUE", label: "x".repeat(600) }] })] })).not.toContain("SECRET");
  });
});

describe("normalizeAskSpec — 既定と丸め", () => {
  it("既定: title・submit・note・type・真偽の項目", () => {
    const s = spec({ questions: [q()] });
    expect(s).toMatchObject({ title: "質問", submit: "決定", note: true });
    expect(s.questions[0]).toMatchObject({ type: "single", allowOther: false, required: false, multiline: false });
  });
  it("選択肢の文字列は {value,label}・value は文字列化・label の既定は value・recommended は true だけ", () => {
    const s = spec({ questions: [q({ options: ["x", { value: 3 }, { value: "r", label: "R", recommended: true }, { value: "n", recommended: "yes" }] })] });
    expect(s.questions[0]!.options).toEqual([
      { value: "x", label: "x" },
      { value: "3", label: "3" },
      { value: "r", label: "R", recommended: true },
      { value: "n", label: "n" },
    ]);
  });
  it("multi の default の文字列は配列・single の default の配列は先頭", () => {
    expect(spec({ questions: [q({ type: "multi", default: "x" })] }).questions[0]!.default).toEqual(["x"]);
    expect(spec({ questions: [q({ default: ["y", "x"] })] }).questions[0]!.default).toBe("y");
  });
  it("showIf の値は文字列の配列に揃える。下の質問を指してもよい（ask-form と同じ）", () => {
    const s = spec({ questions: [q({ id: "a", showIf: { b: 1 } }), q({ id: "b", showIf: { a: ["x", "y"] } })] });
    expect(s.questions[0]!.showIf).toEqual({ b: ["1"] });
    expect(s.questions[1]!.showIf).toEqual({ a: ["x", "y"] });
  });
  it("note: false で欄なし・文字列なら入力例。minWidth は 60〜600 の整数だけ", () => {
    expect(spec({ note: false, questions: [q()] }).note).toBe(false);
    expect(spec({ note: "例", questions: [q()] })).toMatchObject({ note: true, notePlaceholder: "例" });
    expect(spec({ questions: [q({ minWidth: 100 })] }).questions[0]!.minWidth).toBe(100);
    expect(spec({ questions: [q({ minWidth: 10 })] }).questions[0]!.minWidth).toBeUndefined();
    expect(spec({ questions: [q({ minWidth: 1.5 })] }).questions[0]!.minWidth).toBeUndefined();
  });
  it("知らない項目は落とし、型の違う任意の文字列の項目は捨てる", () => {
    const s = spec({ future: 1, questions: [{ ...q({ help: 3, future: 2 }), options: [{ value: "x", future: 3, desc: 5 }] }] });
    expect(s).not.toHaveProperty("future");
    expect(s.questions[0]).not.toHaveProperty("future");
    expect(s.questions[0]).not.toHaveProperty("help");
    expect(s.questions[0]!.options[0]).toEqual({ value: "x", label: "x" });
  });
  it("filter・showValue は真偽のときだけ残す（文字列・数は落とす。誤りにしない）。text の質問では落とす", () => {
    expect(spec({ questions: [q({ filter: true, showValue: false })] }).questions[0]).toMatchObject({ filter: true, showValue: false });
    expect(spec({ questions: [q({ type: "multi", filter: false, showValue: true })] }).questions[0]).toMatchObject({ filter: false, showValue: true });
    for (const v of ["true", "false", 1, 0, null, {}]) {
      const got = spec({ questions: [q({ filter: v, showValue: v })] }).questions[0];
      expect(got, JSON.stringify(v)).not.toHaveProperty("filter");
      expect(got, JSON.stringify(v)).not.toHaveProperty("showValue");
    }
    const none = spec({ questions: [q()] }).questions[0];
    expect(none).not.toHaveProperty("filter");
    expect(none).not.toHaveProperty("showValue");
    const text = spec({ questions: [{ id: "t", label: "T", type: "text", filter: true, showValue: false }] }).questions[0];
    expect(text).not.toHaveProperty("filter");
    expect(text).not.toHaveProperty("showValue");
  });
  it("paging は全体の項目（質問に書いても通さない）・page は質問の項目（全体に書いても通さない）。text にはプレビューの項目を付けない", () => {
    const s = spec({ page: "基本", questions: [{ id: "t", label: "T", type: "text", preview: "side", thumb: 120, paging: 2 }] });
    expect(s).not.toHaveProperty("page");
    expect(s.questions[0]).toEqual({ id: "t", label: "T", type: "text", options: [], allowOther: false, required: false, multiline: false });
  });
  it("text は options が無くてよい", () => {
    expect(spec({ questions: [{ id: "t", label: "T", type: "text", default: "d", multiline: true }] }).questions[0]).toMatchObject({ type: "text", options: [], default: "d", multiline: true });
  });
  it("colors は色の形だけ残し、上限で切る（誤りにしない）", () => {
    const colors = ["#fff", "red; background:url(x)", "#1a56db", "javascript:alert(1)", ...Array.from({ length: 30 }, () => "#000000")];
    const opt = spec({ questions: [q({ options: [{ value: "x", colors }] })] }).questions[0]!.options[0]!;
    expect(opt.colors).toHaveLength(ASK_COLORS_MAX);
    expect(opt.colors!.slice(0, 2)).toEqual(["#fff", "#1a56db"]);
    expect(spec({ questions: [q({ options: [{ value: "x", colors: ["red"] }] })] }).questions[0]!.options[0]).not.toHaveProperty("colors");
  });
  it("確かめ用の定義（7 問・テーマ 13 件）を通す", () => {
    const s = spec(fixture);
    expect(s.questions).toHaveLength(7);
    expect(s.questions[0]!.options).toHaveLength(13);
    expect(s.questions[0]!.options[0]!.colors).toEqual(["#1a56db", "#0ea5e9", "#6366f1", "#0d9488"]);
    expect(s.questions[4]!.showIf).toEqual({ layout: ["plain", "cards", "timeline", "accordion"] });
  });
});

describe("自由記述の指定（comments・comment）", () => {
  it("comments・comment は false のときだけ残す。true・無い・真偽でない値は項目なし（誤りにしない）", () => {
    const s = spec({ comments: false, questions: [q({ comment: false })] });
    expect(s.comments).toBe(false);
    expect(s.questions[0]!.comment).toBe(false);
    for (const v of [true, undefined, null, "false", 0, "", [], {}]) {
      const t = spec({ comments: v, questions: [q({ comment: v })] });
      expect(t).not.toHaveProperty("comments");
      expect(t.questions[0]).not.toHaveProperty("comment");
    }
  });
  it("comment の値が真偽でなくても誤りにならない", () => {
    expect(normalizeAskSpec({ questions: [q({ id: "a", comment: "x" })] }).ok).toBe(true);
  });
  it("askCommentable: 定義の comments: false・質問の comment: false・text・即確定のフォームでは付けない（4 条件）", () => {
    const two = (extra: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => spec({ ...top, questions: [q({ id: "a", ...extra }), q({ id: "b" })] });
    const base = two();
    expect(askCommentable(base, base.questions[0]!)).toBe(true);
    const multi = two({ type: "multi" });
    expect(askCommentable(multi, multi.questions[0]!)).toBe(true);
    const off = two({}, { comments: false });
    expect(askCommentable(off, off.questions[0]!)).toBe(false);
    const qoff = two({ comment: false });
    expect(askCommentable(qoff, qoff.questions[0]!)).toBe(false);
    expect(askCommentable(qoff, qoff.questions[1]!)).toBe(true);
    const text = spec({ questions: [{ id: "t", label: "T", type: "text" }, q({ id: "b" })] });
    expect(askCommentable(text, text.questions[0]!)).toBe(false);
    // 即確定: 質問が 1 つ・single・補足なし
    const instant = spec({ note: false, questions: [q()] });
    expect(askCommentable(instant, instant.questions[0]!)).toBe(false);
    // 補足あり・multi・質問が 2 つなら即確定ではない
    const withNote = spec({ questions: [q()] });
    expect(askCommentable(withNote, withNote.questions[0]!)).toBe(true);
    const oneMulti = spec({ note: false, questions: [q({ type: "multi" })] });
    expect(askCommentable(oneMulti, oneMulti.questions[0]!)).toBe(true);
    const twoNoNote = spec({ note: false, questions: [q({ id: "a" }), q({ id: "b" })] });
    expect(askCommentable(twoNoNote, twoNoNote.questions[0]!)).toBe(true);
  });
});

describe("isAskColor", () => {
  it("#rgb・#rgba・#rrggbb・#rrggbbaa だけ", () => {
    for (const c of ["#fff", "#FFFF", "#1a56db", "#1a56dbcc"]) expect(isAskColor(c)).toBe(true);
    for (const c of ["red", "#ff", "#fffff", "#1a56dbc", "#ggg", "#fff; x", "url(#fff)", "javascript:alert(1)", "expression(1)", "#fff\n", 1, null, undefined]) expect(isAskColor(c)).toBe(false);
  });
});

/** 状態を作る補助。 */
function state(s: AskSpec, over: Partial<AskFormState> = {}): AskFormState {
  const base = initialAskState(s);
  return { ...base, ...over, picked: { ...base.picked, ...over.picked }, otherPicked: { ...base.otherPicked, ...over.otherPicked }, otherText: { ...base.otherText, ...over.otherText }, text: { ...base.text, ...over.text } };
}

describe("collectAsk — form.html の collect() と同じ規則", () => {
  it("default が選択済みで出る。触らずに決定すると default の答え（showIf の質問も条件を満たせば入る）", () => {
    const s = spec(fixture);
    const r = collectAsk(s, initialAskState(s));
    expect(r.lacking).toEqual([]);
    expect(r.answers).toEqual({ theme: "corporate", mode: "single", toc: "sidebar", layout: "plain", design: "deterministic", "auto-figure": "off", motion: "off" });
    expect(r.custom).toEqual([]);
    expect(r.visible).toHaveLength(7);
  });
  it("showIf: 条件を外すと、その質問は answers に入らず visible からも外れる（motion は mode が single/site のときだけ）", () => {
    const s = spec(fixture);
    const r = collectAsk(s, state(s, { picked: { mode: ["print"], layout: ["freeform"] } }));
    expect(r.answers).not.toHaveProperty("motion");
    expect(r.answers).not.toHaveProperty("design");
    expect(r.visible).toEqual(["theme", "mode", "toc", "layout", "auto-figure"]);
    expect(r.lacking).toEqual([]);
  });
  it("showIf は上から順に判定する（隠れた質問に依存する質問も隠れる）", () => {
    const s = spec({
      questions: [
        q({ id: "a", default: "x" }),
        q({ id: "b", default: "x", showIf: { a: "y" } }),
        q({ id: "c", default: "x", showIf: { b: "x" } }),
      ],
    });
    expect(collectAsk(s, initialAskState(s)).answers).toEqual({ a: "x" });
    expect(collectAsk(s, state(s, { picked: { a: ["y"] } })).answers).toEqual({ a: "y", b: "x", c: "x" });
  });
  it("single は未選択が未回答（answers に入らない）。multi・text は required のときだけ未回答（空でも answers に入る）", () => {
    const s = spec({ questions: [q({ id: "a" }), q({ id: "m", type: "multi" }), q({ id: "r", type: "multi", required: true }), { id: "t", label: "T", type: "text" }, { id: "rt", label: "R", type: "text", required: true }] });
    const r = collectAsk(s, initialAskState(s));
    expect(r.lacking).toEqual(["a", "r", "rt"]);
    expect(r.answers).toEqual({ m: [], r: [], t: "", rt: "" });
  });
  it("multi は選んだ値の配列。text は trim した文字列", () => {
    const s = spec({ questions: [q({ id: "m", type: "multi", options: ["a", "b", "c"], default: ["a"] }), { id: "t", label: "T", type: "text" }] });
    const r = collectAsk(s, state(s, { picked: { m: ["a", "c"] }, text: { t: "  hi  " } }));
    expect(r.answers).toEqual({ m: ["a", "c"], t: "hi" });
  });
  it("multi の値は、選んだ順ではなく定義の順に揃える（「その他」の入力は最後）。選択肢に無い値は入れない", () => {
    const s = spec({ questions: [q({ id: "m", type: "multi", options: ["x", "y", "z"], allowOther: true })] });
    expect(collectAsk(s, state(s, { picked: { m: ["z", "x"] } })).answers).toEqual({ m: ["x", "z"] });
    expect(collectAsk(s, state(s, { picked: { m: ["z", "y", "x"] }, otherPicked: { m: true }, otherText: { m: "a" } })).answers).toEqual({ m: ["x", "y", "z", "a"] });
    expect(collectAsk(s, state(s, { picked: { m: ["z", "nope", "x"] } })).answers).toEqual({ m: ["x", "z"] });
    // 定義の順に揃えた回答は、回答の検査を通る
    const r = collectAsk(s, state(s, { picked: { m: ["z", "x"] }, otherPicked: { m: true }, otherText: { m: "a" } }));
    expect(checkAskAnswer(s, { answers: r.answers, custom: r.custom })).toBeNull();
  });
  it("「その他」: 選んで入力があれば値は入力（trim）で custom に id が入る。入力が空なら選択は無いもの（ただし custom には入る＝form.html と同じ）", () => {
    const s = spec({ questions: [q({ id: "a", allowOther: true }), q({ id: "m", type: "multi", options: ["x"], allowOther: true, default: ["x"] })] });
    const r = collectAsk(s, state(s, { picked: { a: [] }, otherPicked: { a: true, m: true }, otherText: { a: "  自由  ", m: "extra" } }));
    expect(r.answers).toEqual({ a: "自由", m: ["x", "extra"] });
    expect(r.custom).toEqual(["a", "m"]);
    const empty = collectAsk(s, state(s, { picked: { a: [] }, otherPicked: { a: true }, otherText: { a: "   " } }));
    expect(empty.lacking).toEqual(["a"]);
    expect(empty.answers).not.toHaveProperty("a");
  });
  it("値が空文字の選択肢: 選べば回答は空文字（未回答ではない）。「その他」の空の入力とは別もの", () => {
    const s = spec({ questions: [q({ id: "a", options: [{ value: "", label: "なし" }, "x"], allowOther: true }), q({ id: "m", type: "multi", options: ["x", { value: "", label: "なし" }], required: true, allowOther: true })] });
    // 選択肢の空文字を選んだ: single は ""、multi は [""]（required も満たす）
    const r = collectAsk(s, state(s, { picked: { a: [""], m: [""] } }));
    expect(r).toMatchObject({ answers: { a: "", m: [""] }, custom: [], lacking: [] });
    expect(checkAskAnswer(s, { answers: r.answers })).toBeNull();
    // multi は定義の順（空文字の値も、その位置）。「その他」の入力は最後
    const both = collectAsk(s, state(s, { picked: { a: ["x"], m: ["", "x"] }, otherPicked: { m: true }, otherText: { m: "q" } }));
    expect(both.answers).toEqual({ a: "x", m: ["x", "", "q"] });
    expect(checkAskAnswer(s, { answers: both.answers, custom: both.custom })).toBeNull();
    // 何も選ばず「その他」を選んで入力が空: 空文字の値の選択肢があっても未回答（空文字の回答にしない）
    const other = collectAsk(s, state(s, { otherPicked: { a: true, m: true }, otherText: { a: "  ", m: "" } }));
    expect(other.lacking).toEqual(["a", "m"]);
    expect(other.answers).toEqual({ m: [] });
    // 選択肢の空文字と「その他」の空の入力を両方選んだ: 回答は選択肢の空文字だけ
    const mixed = collectAsk(s, state(s, { picked: { a: [""], m: [""] }, otherPicked: { a: true, m: true }, otherText: { a: "", m: " " } }));
    expect(mixed.answers).toEqual({ a: "", m: [""] });
    expect(mixed.lacking).toEqual([]);
  });
  it("空文字の値の選択肢が無い質問では、選んだ値の空文字は何も選んでいないのと同じ", () => {
    const s = spec({ questions: [q({ id: "a" }), q({ id: "m", type: "multi", required: true })] });
    const r = collectAsk(s, state(s, { picked: { a: [""], m: [""] } }));
    expect(r.lacking).toEqual(["a", "m"]);
    expect(r.answers).toEqual({ m: [] });
  });
  it("空文字の値の選択肢は showIf の条件にも使える", () => {
    const s = spec({ questions: [q({ id: "a", options: ["", "x"] }), q({ id: "b", default: "x", showIf: { a: "" } })] });
    expect(collectAsk(s, state(s, { picked: { a: [""] } })).answers).toEqual({ a: "", b: "x" });
    expect(collectAsk(s, state(s, { picked: { a: ["x"] } })).answers).toEqual({ a: "x" });
    expect(checkAskAnswer(s, { answers: { a: "", b: "x" } })).toBeNull();
    expect(checkAskAnswer(s, { answers: { a: "x", b: "x" } })).toMatch(/hidden/);
  });
  it("text 型は custom に入らない。補足は trim して空でなければ返す。note: false なら返さない", () => {
    const s = spec({ questions: [{ id: "t", label: "T", type: "text", allowOther: true }] });
    const r = collectAsk(s, state(s, { text: { t: "x" }, note: "  メモ  " }));
    expect(r.custom).toEqual([]);
    expect(r.note).toBe("メモ");
    expect(collectAsk(s, state(s, { note: "   " }))).not.toHaveProperty("note");
    const off = spec({ note: false, questions: [q()] });
    expect(collectAsk(off, state(off, { note: "x" }))).not.toHaveProperty("note");
  });
  it("default が選択肢に無い値なら、選択済みにしない", () => {
    const s = spec({ questions: [q({ default: "nope" })] });
    expect(collectAsk(s, initialAskState(s)).lacking).toEqual(["a"]);
  });
});

describe("checkAskAnswer", () => {
  const s = spec({
    questions: [
      q({ id: "a", default: "x", allowOther: true }),
      q({ id: "b", type: "multi", options: ["p", "q"], required: true, allowOther: true, showIf: { a: "x" } }),
      { id: "t", label: "T", type: "text", required: true },
    ],
  });
  const ok = { answers: { a: "x", b: ["p"], t: "hi" } };
  it("collectAsk が作った回答は通る", () => {
    expect(checkAskAnswer(s, ok)).toBeNull();
    expect(checkAskAnswer(s, { answers: { a: "自由", t: "hi" }, custom: ["a"], note: "n" })).toBeNull();
    expect(checkAskAnswer(s, { answers: { a: "x", b: ["p", "extra"], t: "hi" }, custom: ["b"] })).toBeNull();
  });
  it("隠れた質問の答え・知らない id・型違い・必須の欠け・選択肢に無い値は断る", () => {
    expect(checkAskAnswer(s, { answers: { a: "自由", b: ["p"], t: "hi" }, custom: ["a"] })).toMatch(/hidden/);
    expect(checkAskAnswer(s, { answers: { ...ok.answers, zzz: "1" } })).toMatch(/unknown/);
    expect(checkAskAnswer(s, { answers: { a: ["x"], b: ["p"], t: "hi" } })).toMatch(/string/);
    expect(checkAskAnswer(s, { answers: { a: "x", b: "p", t: "hi" } })).toMatch(/array/);
    expect(checkAskAnswer(s, { answers: { a: "x", b: [], t: "hi" } })).toMatch(/required/);
    expect(checkAskAnswer(s, { answers: { a: "x", b: ["p"], t: "" } })).toMatch(/required/);
    expect(checkAskAnswer(s, { answers: { a: "x", b: ["p"] } })).toMatch(/string/);
    expect(checkAskAnswer(s, { answers: { a: "nope", t: "hi" } })).toMatch(/not an option/);
    expect(checkAskAnswer(s, { answers: { a: "x", b: ["zzz"], t: "hi" } })).toMatch(/not an option/);
  });
  it("空文字の回答は、値が空文字の選択肢がある質問でだけ通る（「その他」の入力としては通さない）", () => {
    const withEmpty = spec({ questions: [q({ id: "a", options: ["", "x"], allowOther: true }), q({ id: "m", type: "multi", options: ["", "x"], allowOther: true })] });
    expect(checkAskAnswer(withEmpty, { answers: { a: "", m: [""] } })).toBeNull();
    expect(checkAskAnswer(withEmpty, { answers: { a: "", m: ["", "自由"] }, custom: ["a", "m"] })).toBeNull();
    const without = spec({ questions: [q({ id: "a", options: ["x"], allowOther: true }), q({ id: "m", type: "multi", options: ["x"], allowOther: true })] });
    expect(checkAskAnswer(without, { answers: { a: "", m: [] } })).toMatch(/questions\[0\].*not an option/);
    expect(checkAskAnswer(without, { answers: { a: "", m: [] }, custom: ["a"] })).toMatch(/questions\[0\].*not an option/);
    expect(checkAskAnswer(without, { answers: { a: "x", m: [""] } })).toMatch(/questions\[1\].*not an option/);
    expect(checkAskAnswer(without, { answers: { a: "x", m: [""] }, custom: ["m"] })).toMatch(/questions\[1\].*not an option/);
  });
  it("値が __other__ の回答は、その値の選択肢があれば通る（無ければ、自由入力の印が要る）", () => {
    const has = spec({ questions: [q({ options: ["x", "__other__"] })] });
    expect(checkAskAnswer(has, { answers: { a: "__other__" } })).toBeNull();
    const no = spec({ questions: [q({ options: ["x"], allowOther: true })] });
    expect(checkAskAnswer(no, { answers: { a: "__other__" } })).toMatch(/not an option/);
    expect(checkAskAnswer(no, { answers: { a: "__other__" }, custom: ["a"] })).toBeNull();
  });
  it("custom: 重複・自由入力を受けない質問・text 型・隠れた質問は断る。自由入力の値は 1 つまで", () => {
    expect(checkAskAnswer(s, { ...ok, custom: ["a", "a"] })).toMatch(/duplicate/);
    expect(checkAskAnswer(s, { ...ok, custom: ["t"] })).toMatch(/free text/);
    expect(checkAskAnswer(s, { ...ok, custom: ["zzz"] })).toMatch(/free text/);
    expect(checkAskAnswer(s, { answers: { a: "x", b: ["e1", "e2"], t: "hi" }, custom: ["b"] })).toMatch(/more than one/);
  });
  it("継承されたキー名（constructor・toString）を持ち込んでも未知の id として断り、そういう id の質問は普通に答えられる", () => {
    const one = spec({ questions: [q({ id: "a", default: "x" })] });
    expect(checkAskAnswer(one, { answers: { a: "x", constructor: "y" } })).toMatch(/unknown/);
    expect(checkAskAnswer(one, { answers: { a: "x", toString: "y" } })).toMatch(/unknown/);
    const odd = spec({ questions: [q({ id: "a", default: "x" }), q({ id: "constructor", showIf: { a: "y" } }), q({ id: "toString", showIf: { constructor: "x" } })] });
    expect(checkAskAnswer(odd, { answers: { a: "x" } })).toBeNull();
    const st = initialAskState(odd);
    expect(collectAsk(odd, st).answers).toEqual({ a: "x" });
  });
  it("補足は note: false の定義では断る", () => {
    const off = spec({ note: false, questions: [q({ default: "x" })] });
    expect(checkAskAnswer(off, { answers: { a: "x" } })).toBeNull();
    expect(checkAskAnswer(off, { answers: { a: "x" }, note: "n" })).toMatch(/no note/);
  });
});

describe("自由記述の回答（comments）", () => {
  // a: 付けられる / b: showIf で隠れうる / t: text（付けられない）/ n: comment: false
  const s = spec({
    questions: [
      q({ id: "a", default: "x" }),
      q({ id: "b", showIf: { a: "x" } }),
      { id: "t", label: "T", type: "text" },
      q({ id: "n", comment: false }),
    ],
  });
  const answers = { a: "x", b: "x", t: "", n: "x" };
  const state = (comments: Record<string, string>): AskFormState => ({ ...initialAskState(s), comments });
  describe("collectAsk", () => {
    it("見えていて付けられる質問の自由記述が、前後の空白を除いて入る。空白だけ・無いものは入らない", () => {
      const r = collectAsk(s, state({ a: " 金曜は避けたい ", b: "   " }));
      expect(r.comments).toEqual({ a: "金曜は避けたい" });
    });
    it("1 つも無ければ comments の項目が無い（state.comments が無いときも）", () => {
      expect(collectAsk(s, state({ a: "  " }))).not.toHaveProperty("comments");
      expect(collectAsk(s, initialAskState(s))).not.toHaveProperty("comments");
    });
    it("隠れている質問・text・comment: false の質問・定義が comments: false のときは入らない", () => {
      const hidden = collectAsk(s, { ...state({ a: "x", b: "隠れた" }), picked: { ...initialAskState(s).picked, a: ["y"] } });
      expect(hidden.comments).toEqual({ a: "x" });
      expect(collectAsk(s, state({ t: "text", n: "off" }))).not.toHaveProperty("comments");
      const off = spec({ comments: false, questions: [q({ id: "a" }), q({ id: "b" })] });
      expect(collectAsk(off, { ...initialAskState(off), comments: { a: "x" } })).not.toHaveProperty("comments");
      const instant = spec({ note: false, questions: [q({ id: "a" })] });
      expect(collectAsk(instant, { ...initialAskState(instant), comments: { a: "x" } })).not.toHaveProperty("comments");
    });
    it("constructor・toString のような継承された値は、自分の項目でないので拾わない", () => {
      const p = spec({ questions: [q({ id: "constructor" }), q({ id: "toString" }), q({ id: "a" })] });
      const inherited = Object.create({ constructor: "継承", toString: "継承" }) as Record<string, string>;
      expect(collectAsk(p, { ...initialAskState(p), comments: inherited })).not.toHaveProperty("comments");
      expect(collectAsk(p, { ...initialAskState(p), comments: Object.assign(inherited, { toString: "自分の" }) }).comments).toEqual({ toString: "自分の" });
    });
  });
  describe("checkAskAnswer", () => {
    const check = (comments: unknown, spec_ = s, ans: Record<string, string> = answers) =>
      checkAskAnswer(spec_, { answers: ans, comments } as never);
    it("付けられる質問の自由記述は通る。{} も通る。10000 文字は通る", () => {
      expect(check({ a: "希望", b: "x" })).toBeNull();
      expect(check({})).toBeNull();
      expect(check({ a: "あ".repeat(10_000) })).toBeNull();
    });
    it("定義に無い id・隠れている質問・text・comment: false・文字列でない値は断る", () => {
      expect(check({ zzz: "x" })).toMatch(/unknown/);
      expect(check({ b: "x" }, s, { a: "y", t: "", n: "x" })).toMatch(/unknown/);
      expect(check({ t: "x" })).toMatch(/does not accept/);
      expect(check({ n: "x" })).toMatch(/does not accept/);
      expect(check({ a: 1 })).toMatch(/string/);
      expect(check({ a: ["x"] })).toMatch(/string/);
    });
    it("定義が comments: false・即確定のフォームでは、どの質問の自由記述も断る", () => {
      const off = spec({ comments: false, questions: [q({ id: "a" })] });
      expect(check({ a: "x" }, off, { a: "x" })).toMatch(/does not accept/);
      const instant = spec({ note: false, questions: [q({ id: "a" })] });
      expect(check({ a: "x" }, instant, { a: "x" })).toMatch(/does not accept/);
    });
    it("長さの合計が上限（100000）を超えたら断る。ちょうどは通る", () => {
      const many = spec({ questions: Array.from({ length: 11 }, (_, i) => q({ id: `q${i}` })) });
      const ans = Object.fromEntries(many.questions.map((x) => [x.id, "x"]));
      const part = (n: number) => Object.fromEntries(many.questions.slice(0, 11).map((x, i) => [x.id, "あ".repeat(i < 10 ? 10_000 : n)]));
      expect(check(part(0), many, ans)).toBeNull();
      expect(ASK_COMMENTS_TOTAL_MAX).toBe(100_000);
      expect(check(part(1), many, ans)).toMatch(/in total/);
    });
    it("__proto__ のキーは、定義の id になれないので「知らない id」として断る。constructor は定義に無ければ断り、あれば通る", () => {
      expect(check(JSON.parse('{"__proto__":"x"}'))).toMatch(/unknown/);
      expect(check({ constructor: "x" })).toMatch(/unknown/);
      const c = spec({ questions: [q({ id: "constructor" }), q({ id: "b" })] });
      expect(check({ constructor: "x" }, c, { constructor: "x", b: "x" })).toBeNull();
    });
  });
});

describe("メディア・コード・view の定義（20261004-ask-media-popup）", () => {
  const png = "data:image/png;base64,iVBORw0KGgo=";
  const opt = (extra: Record<string, unknown>) => ({ value: "x", ...extra });
  const one = (extra: Record<string, unknown>) => spec({ questions: [q({ options: [opt(extra)] })] }).questions[0]!.options[0]!;

  it("image・audio・code・lang・group を写す。空の group・空の参照は項目なし", () => {
    expect(one({ image: "/tmp/a.png", audio: "/tmp/a.wav", code: "a\nb", lang: "diff", group: "G" })).toMatchObject({
      image: "/tmp/a.png",
      audio: "/tmp/a.wav",
      code: "a\nb",
      lang: "diff",
      group: "G",
    });
    const o = one({ image: "", audio: null, group: "" });
    expect(o).not.toHaveProperty("image");
    expect(o).not.toHaveProperty("audio");
    expect(o).not.toHaveProperty("group");
  });

  it("参照の分類: 許すのは絶対パス・https（画像だけ・443 だけ・認証情報なし）・同じ種類の data:", () => {
    expect(classifyMediaRef("/a/b.png", "image")).toBe("path");
    expect(classifyMediaRef("C:\\a\\b.png", "image")).toBe("path");
    expect(classifyMediaRef("https://example.com/a.png", "image")).toBe("https");
    expect(classifyMediaRef("https://example.com:443/a.png", "image")).toBe("https");
    expect(classifyMediaRef(png, "image")).toBe("data");
    for (const [ref, kind] of [
      ["a.png", "image"], // 相対
      ["~/a.png", "image"],
      ["http://example.com/a.png", "image"],
      ["file:///etc/passwd", "image"],
      ["javascript:alert(1)", "image"],
      ["media:0", "image"], // サーバが付け直すもの
      ["https://u:p@example.com/a.png", "image"],
      ["https://example.com:8443/a.png", "image"],
      ["https://example.com/a.wav", "audio"], // 音の https は不可
      [png, "audio"], // 種類違い
      ["data:text/html;base64,PGI+", "image"],
      ["data:image/png,abc", "image"], // base64 でない
      ["\\\\host\\share\\a.png", "image"], // UNC
      ["/a\0b.png", "image"],
      ["", "image"],
    ] as const) {
      expect(classifyMediaRef(ref, kind), ref).toBeNull();
    }
    // sodactl の事前の検査だけが相対パス・~/ を通す
    expect(classifyMediaRef("a.png", "image", true)).toBe("path");
    expect(classifyMediaRef("~/a.png", "image", true)).toBe("path");
    expect(classifyMediaRef("file:///x", "image", true)).toBeNull();
  });

  it("image・audio の誤りは media_invalid、code が文字列でなければ code_invalid", () => {
    expect(reason({ questions: [q({ options: [opt({ image: "a.png" })] })] })).toBe("media_invalid");
    expect(reason({ questions: [q({ options: [opt({ image: 5 })] })] })).toBe("media_invalid");
    expect(reason({ questions: [q({ options: [opt({ audio: "https://example.com/a.wav" })] })] })).toBe("media_invalid");
    expect(reason({ questions: [q({ options: [opt({ code: 5 })] })] })).toBe("code_invalid");
    expect(reason({ questions: [q({ options: [opt({ code: "x".repeat(ASK_CODE_MAX + 1) })] })] })).toBe("too_large");
    expect(normalizeAskSpec({ questions: [q({ options: [opt({ image: "a.png" })] })] }, { relativePaths: true }).ok).toBe(true);
  });

  it("preview は side / inline だけ。thumb は 20〜2000 の整数だけ残す", () => {
    expect(spec({ questions: [q({ preview: "side", thumb: 200 })] }).questions[0]).toMatchObject({ preview: "side", thumb: 200 });
    expect(reason({ questions: [q({ preview: "wide" })] })).toBe("preview_invalid");
    for (const thumb of [19, 2001, 1.5, "130", null]) expect(spec({ questions: [q({ thumb })] }).questions[0]).not.toHaveProperty("thumb");
    expect(spec({ questions: [q({ preview: null })] }).questions[0]).not.toHaveProperty("preview");
  });

  it("view: 文字列・辞書・配列。file か text のどちらか 1 つ。題の既定はファイル名・「テキスト」。paging の既定は false", () => {
    const s1 = spec({ view: "/a/design.md", questions: [q()] });
    expect(s1.view).toEqual([{ title: "design.md", file: "/a/design.md" }]);
    expect(s1.paging).toBe(false);
    const s2 = spec({ view: [{ file: "/a/x.md", raw: true, title: "T" }, { text: "hi" }], paging: true, questions: [q()] });
    expect(s2.view).toEqual([{ title: "T", file: "/a/x.md", raw: true }, { title: "テキスト", text: "hi" }]);
    expect(s2.paging).toBe(true);
    expect(spec({ questions: [q()] })).not.toHaveProperty("view");
    expect(spec({ view: null, questions: [q()] })).not.toHaveProperty("view");
    for (const view of [[], {}, { file: "/a", text: "b" }, { text: 5 }, { file: "rel.md" }, { file: "http://x/a.html" }, 5])
      expect(reason({ view, questions: [q()] }), JSON.stringify(view)).toBe("view_invalid");
    expect(reason({ view: Array.from({ length: ASK_VIEW_MAX + 1 }, () => ({ text: "x" })), questions: [q()] })).toBe("too_large");
  });
});

describe("edit・rank・table（20261004-ask-media-popup）", () => {
  const edit = (extra: Record<string, unknown> = {}) => ({ id: "e", label: "E", type: "edit", text: "1. a\n2. b\n", ...extra });
  const rank = (extra: Record<string, unknown> = {}) => ({ id: "r", label: "R", type: "rank", options: ["a", "b", "c"], ...extra });
  const table = (extra: Record<string, unknown> = {}) => ({ id: "t", label: "T", type: "table", options: ["ok", "ng"], rows: ["x", { value: "y", label: "Y", desc: "d", default: "ng" }], ...extra });

  it("検査: edit は必須が既定・text（無ければ default の文字列）・rows は 1〜60・mono。options は持たない", () => {
    const q0 = spec({ questions: [edit({ rows: 7, mono: false })] }).questions[0]!;
    expect(q0).toMatchObject({ type: "edit", required: true, text: "1. a\n2. b\n", rows: 7, mono: false, options: [] });
    expect(spec({ questions: [edit({ required: false, text: undefined, default: "d" })] }).questions[0]).toMatchObject({ required: false, text: "d" });
    expect(spec({ questions: [edit({ text: undefined })] }).questions[0]).toMatchObject({ text: "" });
    for (const rows of [0, 61, 1.5, "5"]) expect(spec({ questions: [edit({ rows })] }).questions[0]).not.toHaveProperty("rows");
    expect(reason({ questions: [edit({ text: "x".repeat(10_001) })] })).toBe("too_large");
  });
  it("検査: rank・table は options が要る。table は rows（1 つ以上・重複なし・default は選択肢）", () => {
    expect(reason({ questions: [{ id: "r", label: "R", type: "rank" }] })).toBe("options_empty");
    expect(reason({ questions: [table({ rows: undefined })] })).toBe("options_empty");
    expect(reason({ questions: [table({ rows: [] })] })).toBe("options_empty");
    expect(reason({ questions: [table({ rows: ["x", "x"] })] })).toBe("option_value_duplicate");
    expect(reason({ questions: [table({ rows: [{ value: "x", default: "zzz" }] })] })).toBe("row_default_unknown");
    expect(reason({ questions: [table({ rows: [{ label: "L" }] })] })).toBe("option_value_required");
    const t = spec({ questions: [table({ rowLabel: "節", pickLabel: "配置", default: "ng" })] }).questions[0]!;
    expect(t).toMatchObject({ rowLabel: "節", pickLabel: "配置", default: "ng", rows: [{ value: "x", label: "x" }, { value: "y", label: "Y", desc: "d", default: "ng" }] });
    expect(spec({ questions: [table({ default: "zzz" })] }).questions[0]).not.toHaveProperty("default"); // 選択肢に無い既定は落とす
  });
  it("検査: rank の default は選択肢の並べ替えのときだけ残す", () => {
    expect(spec({ questions: [rank({ default: ["c", "a", "b"] })] }).questions[0]!.default).toEqual(["c", "a", "b"]);
    for (const d of [["a", "b"], ["a", "a", "b"], ["a", "b", "z"], "a"]) expect(spec({ questions: [rank({ default: d })] }).questions[0]).not.toHaveProperty("default");
  });
  it("collectAsk: edit は末尾の空白を除いて返し、直したら edited。rank は並べた順（不正は既定の順）。table は行ごと（既定は行の default → 質問の default → 先頭）", () => {
    const s = spec({ questions: [edit(), rank({ default: ["b", "a", "c"] }), table()] });
    const base = collectAsk(s, initialAskState(s));
    expect(base.answers).toEqual({ e: "1. a\n2. b", r: ["b", "a", "c"], t: { x: "ok", y: "ng" } });
    expect(base.edited).toEqual([]);
    expect(base.lacking).toEqual([]);
    const st = initialAskState(s);
    st.text["e"] = "1. a\n2. B\n\n";
    st.order = { r: ["c", "b", "a"] };
    st.rowPick = { t: { x: "ng" } };
    const got = collectAsk(s, st);
    expect(got.answers).toEqual({ e: "1. a\n2. B", r: ["c", "b", "a"], t: { x: "ng", y: "ng" } });
    expect(got.edited).toEqual(["e"]);
    st.order = { r: ["a", "a", "b"] }; // 不正な順は既定へ
    st.rowPick = { t: { x: "zzz" } };
    expect(collectAsk(s, st).answers).toMatchObject({ r: ["b", "a", "c"], t: { x: "ok" } });
  });
  it("collectAsk: 必須の edit が空（空白だけ）なら未回答。required: false なら空でよい", () => {
    const s = spec({ questions: [edit({ text: "" }), edit({ id: "e2", required: false, text: "" })] });
    expect(collectAsk(s, initialAskState(s)).lacking).toEqual(["e"]);
  });
  it("checkAskAnswer: edit は文字列（必須なら空を断る）、rank は並べ替え、table は行と値、edited は edit の質問だけ", () => {
    const s = spec({ questions: [edit(), rank(), table()] });
    const ok = { e: "x", r: ["c", "a", "b"], t: { x: "ok", y: "ng" } };
    expect(checkAskAnswer(s, { answers: ok, edited: ["e"] })).toBeNull();
    expect(checkAskAnswer(s, { answers: { ...ok, e: "" } })).toMatch(/required/);
    expect(checkAskAnswer(s, { answers: { ...ok, e: ["x"] } })).toMatch(/string/);
    for (const r of [["a", "b"], ["a", "a", "b"], ["a", "b", "z"], "a", { a: "b" }]) expect(checkAskAnswer(s, { answers: { ...ok, r } as never }), JSON.stringify(r)).toMatch(/every option exactly once/);
    for (const t of [{ x: "ok" }, { x: "ok", y: "ng", z: "ok" }, { x: "ok", y: "zzz" }, { x: "ok", z: "ng" }, ["ok"], "ok"]) expect(checkAskAnswer(s, { answers: { ...ok, t } as never }), JSON.stringify(t)).not.toBeNull();
    expect(checkAskAnswer(s, { answers: ok, edited: ["r"] })).toMatch(/not an edit/);
    expect(checkAskAnswer(s, { answers: ok, edited: ["e", "e"] })).toMatch(/duplicate/);
    expect(checkAskAnswer(s, { answers: ok, edited: ["nope"] })).toMatch(/not an edit/);
    expect(checkAskAnswer(s, { answers: ok, custom: ["e"] })).toMatch(/free text/);
  });
  it("行の value が __proto__ でも、回答に自分のキーとして入り、サーバの検査を通る", () => {
    const s = spec({ questions: [JSON.parse('{"id":"t","label":"T","type":"table","options":["ok","ng"],"rows":["__proto__","y"]}')] });
    const got = collectAsk(s, initialAskState(s));
    expect(Object.keys(got.answers["t"] as object)).toEqual(["__proto__", "y"]);
    expect(checkAskAnswer(s, { answers: got.answers })).toBeNull();
  });
  it("showIf は single・multi の質問だけが条件になる（辞書の回答は満たさない）", () => {
    const s = spec({ questions: [table({ id: "t" }), q({ id: "b", showIf: { t: "ok" } })] });
    expect(collectAsk(s, initialAskState(s)).visible).toEqual(["t"]);
  });
});
