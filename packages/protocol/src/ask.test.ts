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
  it("showIf: null・空の配列は無いものとして扱う（ask-form と同じ）", () => {
    expect(spec({ questions: [q({ showIf: null })] }).questions[0]).not.toHaveProperty("showIf");
    expect(spec({ questions: [q({ showIf: [] })] }).questions[0]).not.toHaveProperty("showIf");
  });
  it("text の default が回答の上限を超える定義は誤り（触らずに決定しても送れなくなるため）。id・value は 200 文字（コードポイント）まで", () => {
    expect(bad({ questions: [{ id: "t", label: "T", type: "text", default: "x".repeat(10_001) }] })).toMatch(/default/);
    spec({ questions: [{ id: "t", label: "T", type: "text", default: "x".repeat(10_000) }] });
    // 絵文字（UTF-16 では 2 単位）の 200 個の id は通り、その回答（zod の上限は UTF-16 の余裕つき）も通る
    const id = "😀".repeat(200);
    expect(spec({ questions: [q({ id })] }).questions[0]!.id).toBe(id);
    expect(bad({ questions: [q({ id: "😀".repeat(201) })] })).toMatch(/id is longer/);
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
  it("「その他」: 選んで入力があれば値は入力（trim）で custom に id が入る。入力が空なら選択は無いもの（ただし custom には入る＝form.html と同じ）", () => {
    const s = spec({ questions: [q({ id: "a", allowOther: true }), q({ id: "m", type: "multi", options: ["x"], allowOther: true, default: ["x"] })] });
    const r = collectAsk(s, state(s, { picked: { a: [] }, otherPicked: { a: true, m: true }, otherText: { a: "  自由  ", m: "extra" } }));
    expect(r.answers).toEqual({ a: "自由", m: ["x", "extra"] });
    expect(r.custom).toEqual(["a", "m"]);
    const empty = collectAsk(s, state(s, { picked: { a: [] }, otherPicked: { a: true }, otherText: { a: "   " } }));
    expect(empty.lacking).toEqual(["a"]);
    expect(empty.answers).not.toHaveProperty("a");
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
