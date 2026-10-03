import { describe, expect, it } from "vitest";
import {
  ASK_COLORS_MAX,
  ASK_OPTIONS_MAX,
  ASK_QUESTIONS_MAX,
  ASK_SPEC_MAX_BYTES,
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
  it("対応していない型（edit・rank・table・知らない文字列）は誤りでなく unsupportedType として返す（黙って落とさない）。型の名前は短い識別子だけ", () => {
    for (const type of ["edit", "rank", "table", "radio"]) {
      const r = normalizeAskSpec({ questions: [q({ id: "a" }), { id: "e", label: "E", type, text: "文面" }] });
      expect(r).toMatchObject({ ok: false, unsupportedType: type });
    }
    expect(normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "<script>x</script>" }] })).toMatchObject({ ok: false, unsupportedType: "?" });
    expect(unsupportedTypeReason("edit")).toContain('"edit"');
    // 未対応の型の質問より後ろの誤りも見逃さない（誤りが優先）。前の誤りも同じ
    expect(bad({ questions: [{ id: "e", label: "E", type: "edit" }, { id: "b", label: "B" }] })).toMatch(/options/);
    expect(bad({ questions: [{ id: "e", label: "E", type: "edit" }, q({ id: "b", showIf: { nothing: "x" } })] })).toMatch(/unknown question id/);
    expect(bad({ questions: [{ id: "e", label: "E", type: "edit" }, { id: "e", label: "E2", type: "rank" }] })).toContain('duplicate id "e"');
    // 未対応の質問の id を showIf が指すのは誤りでない
    expect(normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "edit" }, q({ id: "b", showIf: { e: "x" } })] })).toMatchObject({ ok: false, unsupportedType: "edit" });
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
    for (const type of ["edit", "rank", "table", "slider"]) {
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
    const r = normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "edit", page: 2 }] });
    expect(r).toMatchObject({ ok: false, reason: "page_invalid" });
    expect(r).not.toHaveProperty("unsupportedType");
    expect(reason({ questions: [{ id: "e", label: "E", type: "edit", page: "x".repeat(501) }] })).toBe("too_large");
    // page が正しければ、今までどおり対応していない型
    expect(normalizeAskSpec({ questions: [{ id: "e", label: "E", type: "edit", page: "直す" }] })).toMatchObject({ ok: false, reason: "unsupported_type", unsupportedType: "edit" });
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
  it("この作業で通さない項目（code・group・image・audio・preview・thumb）は、正規化後に無い", () => {
    const s = spec({
      questions: [{ ...q({ preview: "side", thumb: 120, paging: 2 }), options: [{ value: "x", code: "let a = 1;", lang: "js", group: "G", image: "a.png", audio: "a.mp3" }] }],
    });
    expect(s.questions[0]).toEqual({ id: "a", label: "A", type: "single", options: [{ value: "x", label: "x" }], allowOther: false, required: false, multiline: false });
    // paging は全体の項目（質問に書いても通さない）・page は質問の項目（全体に書いても通さない）
    expect(spec({ page: "基本", questions: [q()] })).not.toHaveProperty("page");
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
