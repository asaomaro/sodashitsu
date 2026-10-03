import { afterEach, describe, expect, it } from "vitest";
import type { AskFormElement, AskFormSubmitDetail } from "./askFormElement.js";
import "./askFormElement.js";

/**
 * 部品 `<ask-form>`（`third_party/ask-form/ask-form.js`）の読み込みと、**部品のいまの動き**の記録
 * （20261003-ask-form-component の T4）。枠（`AskDialog.vue`）のテストではない。
 * 下の「`__other__`」は、protocol が「選択肢の `value` が `__other__` の定義は誤り」にしている根拠——
 * 部品の版を替えてここが落ちたら、部品の動きが変わっている（`normalizeAskSpec` の検査を外せるかを見直す）。
 */

interface Observed {
  el: AskFormElement & { readonly value: unknown };
  root: ShadowRoot;
  /** 出た `ask-unsupported` の `reason`。 */
  unsupported: string[];
  /** 出た `ask-submit` の `detail`。 */
  submitted: AskFormSubmitDetail[];
}

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const el of mounted.splice(0)) el.remove();
});

/** 部品を置いて定義を入れ、`ask-unsupported`（マイクロタスクで遅れて出る）を待つ。 */
async function mountForm(questions: Record<string, unknown>[]): Promise<Observed> {
  const el = document.createElement("ask-form") as Observed["el"];
  const unsupported: string[] = [];
  const submitted: AskFormSubmitDetail[] = [];
  el.addEventListener("ask-unsupported", (ev) => {
    unsupported.push((ev as CustomEvent<{ reason: string }>).detail.reason);
  });
  el.addEventListener("ask-submit", (ev) => {
    submitted.push((ev as CustomEvent<AskFormSubmitDetail>).detail);
  });
  document.body.append(el);
  mounted.push(el);
  el.spec = { title: "確認", submit: "決定", note: false, questions };
  await Promise.resolve();
  const root = el.shadowRoot;
  if (!root) throw new Error("shadowRoot が無い");
  return { el, root, unsupported, submitted };
}

/** 入力を選ぶ（`checked` を立てるだけ。`change` は出さない——部品は回答を DOM から読む）。 */
function check(root: ShadowRoot, selector: string): void {
  const input = root.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`入力が無い: ${selector}`);
  input.checked = true;
}

const OPTIONS = [
  { value: "a", label: "エー" },
  { value: "__other__", label: "オー" },
];
/** 値が `__other__` の**選択肢**（「その他」の入力ではないほう）。 */
const OPTION_OTHER = 'label.opt:not(.other) input[value="__other__"]';

describe("部品の読み込み", () => {
  it("import すると <ask-form> が登録されている", () => {
    const ctor = customElements.get("ask-form");
    expect(ctor).toBeDefined();
    expect(document.createElement("ask-form")).toBeInstanceOf(ctor);
  });

  it("spec を入れると shadowRoot に質問が描かれ、決定で ask-submit が出る", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "color", label: "色を選んでください", type: "single", options: OPTIONS.slice(0, 1) },
      { id: "memo", label: "メモ", type: "text" },
    ]);
    expect(unsupported).toEqual([]);
    expect(root.querySelector("[data-ask-title]")?.textContent).toBe("確認");
    const questions = [...root.querySelectorAll("[data-ask-question]")];
    expect(questions.map((q) => q.getAttribute("data-ask-question"))).toEqual(["color", "memo"]);
    expect(questions[0]?.querySelector("legend")?.textContent).toContain("色を選んでください");
    expect(root.querySelectorAll('input[type=radio][name="color"]')).toHaveLength(1);
    expect(root.querySelector("[data-ask-submit]")).not.toBeNull();
    expect(el.pageCount).toBe(1);
    // ライト DOM からは見えない（枠のテストは shadowRoot の中を探す）。
    expect(el.querySelector("[data-ask-question]")).toBeNull();

    // 未回答（single が選ばれていない）では出ない。
    el.submit();
    expect(submitted).toEqual([]);
    check(root, 'input[value="a"]');
    el.submit();
    expect(submitted).toEqual([{ answers: { color: "a", memo: "" } }]);
  });

  it("描けない定義（知らない型）は ask-unsupported を出し、ボタンを描かない", async () => {
    const { root, unsupported } = await mountForm([{ id: "x", label: "X", type: "matrix" }]);
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toContain("matrix");
    expect(root.querySelector("[data-ask-submit]")).toBeNull();
  });
});

describe("部品のいまの動き: 値が __other__ の選択肢（部品 1.0.1。protocol が検査で断る根拠）", () => {
  it("対照: ふつうの値の選択肢は、選んだ値がそのまま回答になる", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: OPTIONS },
    ]);
    check(root, 'input[value="a"]');
    expect(el.value).toEqual({ answers: { q: "a" }, lacking: [] });
    el.submit();
    expect(submitted).toEqual([{ answers: { q: "a" } }]);
    expect(unsupported).toEqual([]);
  });

  it("(a) allowOther なしの single で既定がその値 → 描けない（例外 → ask-unsupported）", async () => {
    const { el, root, unsupported } = await mountForm([
      { id: "q", label: "Q", type: "single", options: OPTIONS, default: "__other__" },
    ]);
    expect(unsupported).toHaveLength(1);
    expect(unsupported[0]).toMatch(/^render failed: /);
    expect(root.querySelector("[data-ask-question]")).toBeNull();
    expect(el.value).toBeNull();
  });

  it("(b) allowOther なしの single で後から選ぶ → 回答を読む所で例外（ask-unsupported は出ず、決定もできない）", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: OPTIONS },
    ]);
    expect(unsupported).toEqual([]);
    check(root, OPTION_OTHER);
    expect(() => el.value).toThrow(TypeError);
    expect(() => el.submit()).toThrow(TypeError);
    await Promise.resolve();
    expect(submitted).toEqual([]);
    expect(unsupported).toEqual([]);
  });

  it("(c) allowOther と併存する single → 「その他」の入力と取り違え、選んでも未回答のまま（決定できない）", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: OPTIONS, allowOther: true },
    ]);
    // 値が __other__ の入力が 2 つ出来る（選択肢と、「その他」）。
    expect(root.querySelectorAll('input[name="q"][value="__other__"]')).toHaveLength(2);
    check(root, OPTION_OTHER);
    expect(el.value).toEqual({ answers: {}, lacking: ["q"] });
    el.submit();
    expect(submitted).toEqual([]);

    // 「その他」の入力欄に文字があると、選択肢を選んだだけで、その文字が回答になる（選んだ値と違う回答）。
    const text = root.querySelector<HTMLInputElement>("label.opt.other input[type=text]");
    if (!text) throw new Error("「その他」の入力欄が無い");
    text.value = "別の文字";
    expect(el.value).toEqual({ answers: { q: "別の文字" }, lacking: [] });
    expect(unsupported).toEqual([]);
  });

  it("(c) 既定がその値で allowOther と併存 → 描けるが、既定は回答にならない（未回答）", async () => {
    const { el, root, unsupported } = await mountForm([
      {
        id: "q",
        label: "Q",
        type: "single",
        options: OPTIONS,
        allowOther: true,
        default: "__other__",
      },
    ]);
    expect(unsupported).toEqual([]);
    expect(root.querySelector<HTMLInputElement>(OPTION_OTHER)?.checked).toBe(true);
    expect(el.value).toEqual({ answers: {}, lacking: ["q"] });
  });

  it("(d) multi（allowOther なし）で選ぶ → 回答を読む所で例外", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "multi", options: OPTIONS },
    ]);
    check(root, OPTION_OTHER);
    expect(() => el.value).toThrow(TypeError);
    expect(() => el.submit()).toThrow(TypeError);
    await Promise.resolve();
    expect(submitted).toEqual([]);
    expect(unsupported).toEqual([]);
  });

  it("(d) multi で allowOther と併存 → 選んだ値が黙って落ち、空の回答が決定される（選んだ値と違う回答）", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "multi", options: OPTIONS, allowOther: true },
    ]);
    check(root, 'input[value="a"]');
    check(root, OPTION_OTHER);
    el.submit();
    // 利用者は「a」と「__other__」の 2 つを選んだのに、送られるのは「a」だけ。
    expect(submitted).toEqual([{ answers: { q: ["a"] } }]);
    expect(unsupported).toEqual([]);
  });
});
