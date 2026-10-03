import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkAskAnswer,
  collectAsk,
  normalizeAskSpec,
  type AskAnswerBody,
  type AskFormState,
} from "./ask.js";

/**
 * ask-form と共通の試験データ（`third_party/ask-form/fixtures/*.json`。public_docs から無改変で写したもの）を読むテスト
 * （20261003-ask-form-component の design AC6）。ask-form の側（`ask.py` の `normalize()`・部品 `<ask-form>` の collect）も
 * 同じファイルを読むので、ここが通っていれば、定義の検査と回答の集め方が両方の実装でそろっている。
 *
 * 比べ方は、試験データの `about` の決まりに従う:
 * - normalize: 比べるのは `expect.spec` に**書いた項目だけ**。誤りは文言ではなく `reason`（分類）。
 *   `sodashitsu` の欄がある例は、そちらの `expect` が期待値（差を黙って飛ばさない）。
 * - collect: `spec` は書かれたままの定義（正規化してから使う）。`state` は既定（`default`）より優先し、書かれていない質問は何も選んでいない。
 *
 * `src` の外の JSON なので、`import` ではなく `fs` で読む（`rootDir` の外を型検査に入れない）。
 */

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "third_party", "ask-form", "fixtures");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

type Expect = { ok: true; spec: JsonObject } | { ok: false; reason: string };

interface NormalizeCase {
  name: string;
  spec: Json;
  expect: Expect;
  sodashitsu?: { note?: string; expect: Expect };
}
interface NormalizeDoc {
  about: string;
  reasons: Record<string, string>;
  cases: NormalizeCase[];
}
interface CollectCase {
  name: string;
  spec: Json;
  state: Partial<AskFormState>;
  expect: {
    answers: Record<string, string | string[]>;
    lacking: string[];
    custom?: string[];
    note?: string;
  };
}
interface CollectDoc {
  about: string;
  cases: CollectCase[];
}

function read<T>(name: string): T {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
}

const normalizeDoc = read<NormalizeDoc>("normalize.json");
const collectDoc = read<CollectDoc>("collect.json");

const isObject = (v: Json | undefined): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 試験データが `expect.spec` に書いている項目の名前（全体・質問・選択肢の段ごと。全部の例から集める）。
 * 「書いた項目だけ比べる」は、この名前の項目を比べる、と読む——実装が足す、試験データに名前の無い項目は比べないが、
 * 名前のある項目は「無い」ことも比べる（例: 空の `showIf` が `{}` のまま残っていたら食い違い）。
 */
function writtenKeys(): { spec: Set<string>; question: Set<string>; option: Set<string> } {
  const keys = { spec: new Set<string>(), question: new Set<string>(), option: new Set<string>() };
  for (const c of normalizeDoc.cases) {
    for (const e of [c.expect, c.sodashitsu?.expect]) {
      if (!e?.ok) continue;
      for (const k of Object.keys(e.spec)) keys.spec.add(k);
      const questions = e.spec["questions"];
      for (const q of Array.isArray(questions) ? questions : []) {
        if (!isObject(q)) continue;
        for (const k of Object.keys(q)) keys.question.add(k);
        const options = q["options"];
        for (const o of Array.isArray(options) ? options : []) {
          if (isObject(o)) for (const k of Object.keys(o)) keys.option.add(k);
        }
      }
    }
  }
  return keys;
}

const pick = (o: JsonObject, keys: Set<string>): JsonObject =>
  Object.fromEntries(Object.entries(o).filter(([k]) => keys.has(k)));

/** 正規化後の定義から、試験データに名前のある項目だけを取り出す。 */
function written(spec: JsonObject, keys: ReturnType<typeof writtenKeys>): JsonObject {
  const out = pick(spec, keys.spec);
  const questions = spec["questions"];
  if (Array.isArray(questions)) {
    out["questions"] = questions.map((q) => {
      if (!isObject(q)) return q;
      const qo = pick(q, keys.question);
      const options = q["options"];
      if (Array.isArray(options)) {
        qo["options"] = options.map((o) => (isObject(o) ? pick(o, keys.option) : o));
      }
      return qo;
    });
  }
  return out;
}

describe("共通の試験データ: 読めている", () => {
  it("normalize.json・collect.json に例がある（読めていないのに通らない）", () => {
    expect(normalizeDoc.cases.length).toBeGreaterThan(0);
    expect(collectDoc.cases.length).toBeGreaterThan(0);
    expect(Object.keys(normalizeDoc.reasons).length).toBeGreaterThan(0);
    // 通る例・誤りの例・`sodashitsu` の欄で上書きする例が、どれも 1 つ以上ある。
    expect(normalizeDoc.cases.some((c) => c.expect.ok)).toBe(true);
    expect(normalizeDoc.cases.some((c) => !c.expect.ok)).toBe(true);
    expect(normalizeDoc.cases.some((c) => c.sodashitsu !== undefined)).toBe(true);
    const names = [...normalizeDoc.cases, ...collectDoc.cases].map((c) => c.name);
    expect(names.every((n) => typeof n === "string" && n !== "")).toBe(true);
  });
});

describe("共通の試験データ: normalize.json（normalizeAskSpec）", () => {
  const keys = writtenKeys();

  it.each(normalizeDoc.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const want = c.sodashitsu?.expect ?? c.expect;
    const got = normalizeAskSpec(structuredClone(c.spec));
    if (!want.ok) {
      // 誤りの分類は、試験データの一覧（reasons）にある名前。
      expect(Object.keys(normalizeDoc.reasons)).toContain(want.reason);
      expect(got.ok ? { ok: true } : { ok: false, reason: got.reason }).toEqual(want);
      return;
    }
    if (!got.ok) throw new Error(`通るはずの定義が誤りになった: ${got.reason}（${got.message}）`);
    expect(written(got.spec as unknown as JsonObject, keys)).toEqual(want.spec);
  });
});

describe("共通の試験データ: collect.json（collectAsk・checkAskAnswer）", () => {
  it.each(collectDoc.cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const normalized = normalizeAskSpec(structuredClone(c.spec));
    if (!normalized.ok) throw new Error(`定義が誤りになった: ${normalized.reason}`);
    const spec = normalized.spec;
    // `state` は既定より優先し、書かれていない質問は何も選んでいない（`initialAskState` の既定は重ねない）。
    const state: AskFormState = {
      picked: {},
      otherPicked: {},
      otherText: {},
      text: {},
      note: "",
      ...structuredClone(c.state),
    };
    const got = collectAsk(spec, state);

    expect(got.answers).toEqual(c.expect.answers);
    expect(got.lacking).toEqual(c.expect.lacking);
    // custom・note は、無いときは項目ごと無い（`collectAsk` の custom は空の配列）。
    expect(got.custom).toEqual(c.expect.custom ?? []);
    expect(got.note).toEqual(c.expect.note);

    if (c.expect.lacking.length === 0) {
      // 未回答が無ければ、その回答はサーバの検査（`ask.answer`）を通る。
      const body: AskAnswerBody = { answers: got.answers };
      if (got.custom.length > 0) body.custom = got.custom;
      if (got.note !== undefined) body.note = got.note;
      expect(checkAskAnswer(spec, body)).toBeNull();
    }
  });
});
