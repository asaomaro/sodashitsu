import { afterEach, describe, expect, it } from "vitest";
import type { AskFormElement, AskFormSubmitDetail } from "./askFormElement.js";
import "./askFormElement.js";

/**
 * 部品 `<ask-form>`（`third_party/ask-form/ask-form.js`）の読み込みと、**部品の動き**の記録
 * （20261003-ask-form-component の T4・T10）。枠（`AskDialog.vue`）のテストではない。
 * 下の「値が `__other__`・空文字の選択肢」は、protocol（`normalizeAskSpec`・`collectAsk`）がそれらを「ふつうの選択肢」として通す根拠——
 * 部品 1.1.0 は「その他」の印を値ではなく `data-other` 属性で持つ。部品の版を替えてここが落ちたら、部品の動きが変わっている
 * （1.0.1 までは値で見分けていて、例外・未回答・選んだ値と違う回答になった）。
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

/** 値が空文字の選択肢を持つ定義。 */
const WITH_EMPTY = [
  { value: "", label: "なし" },
  { value: "a", label: "エー" },
];
/** 値が空文字の**選択肢**（「その他」の入力ではないほう）。 */
const OPTION_EMPTY = 'input[name="q"][value=""]:not([data-other])';
/** 「その他」を選ぶ入力（ラジオ・チェックボックス）と、その自由入力の欄。 */
const OTHER_PICK = 'input[name="q"][data-other]';
const OTHER_TEXT = "label.opt.other input[type=text]";

function setText(root: ShadowRoot, text: string): void {
  const input = root.querySelector<HTMLInputElement>(OTHER_TEXT);
  if (!input) throw new Error("「その他」の入力欄が無い");
  input.value = text;
}

describe("部品の動き（1.1.0）: 値が __other__ の選択肢はふつうの選択肢", () => {
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

  it("single で既定がその値 → 描けて、選択済みで出る。触らずに決定するとその値", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: OPTIONS, default: "__other__" },
    ]);
    expect(unsupported).toEqual([]);
    expect(root.querySelector<HTMLInputElement>(OPTION_OTHER)?.checked).toBe(true);
    expect(el.value).toEqual({ answers: { q: "__other__" }, lacking: [] });
    el.submit();
    expect(submitted).toEqual([{ answers: { q: "__other__" } }]);
  });

  it("single で後から選ぶ → その値が回答になる（custom は付かない）", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: OPTIONS },
    ]);
    expect(el.value).toEqual({ answers: {}, lacking: ["q"] });
    check(root, OPTION_OTHER);
    expect(el.value).toEqual({ answers: { q: "__other__" }, lacking: [] });
    el.submit();
    expect(submitted).toEqual([{ answers: { q: "__other__" } }]);
    expect(unsupported).toEqual([]);
  });

  it("allowOther と併存する single → 「その他」の入力は値ではなく data-other の印で見分ける（取り違えない）", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: OPTIONS, allowOther: true },
    ]);
    // 値が __other__ の入力は選択肢の 1 つだけ。「その他」の入力は値が空で、印を持つ。
    expect(root.querySelectorAll('input[name="q"][value="__other__"]')).toHaveLength(1);
    const pick = root.querySelector<HTMLInputElement>(OTHER_PICK);
    expect(pick?.closest("label")?.classList.contains("other")).toBe(true);
    expect(pick?.value).toBe("");
    expect(root.querySelectorAll(OTHER_PICK)).toHaveLength(1);

    // 「その他」の入力欄に文字があっても、選択肢を選べば回答は選んだ値。
    setText(root, "別の文字");
    check(root, OPTION_OTHER);
    expect(el.value).toEqual({ answers: { q: "__other__" }, lacking: [] });

    // 「その他」を選べば、回答は入力した文字（custom が付く）。入力が空なら未回答。
    check(root, OTHER_PICK);
    expect(el.value).toEqual({ answers: { q: "別の文字" }, custom: ["q"], lacking: [] });
    setText(root, "  ");
    expect(el.value).toEqual({ answers: {}, custom: ["q"], lacking: ["q"] });

    check(root, OPTION_OTHER);
    el.submit();
    expect(submitted).toEqual([{ answers: { q: "__other__" } }]);
    expect(unsupported).toEqual([]);
  });

  it("既定がその値で allowOther と併存 → 選択肢のほうが選択済みで出る（「その他」は選ばれない）", async () => {
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
    expect(root.querySelector<HTMLInputElement>(OTHER_PICK)?.checked).toBe(false);
    expect(el.value).toEqual({ answers: { q: "__other__" }, lacking: [] });
  });

  it("multi（allowOther なし）で選ぶ → 選んだ値が定義の順に入る", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "multi", options: OPTIONS },
    ]);
    check(root, OPTION_OTHER);
    expect(el.value).toEqual({ answers: { q: ["__other__"] }, lacking: [] });
    check(root, 'input[value="a"]');
    el.submit();
    expect(submitted).toEqual([{ answers: { q: ["a", "__other__"] } }]);
    expect(unsupported).toEqual([]);
  });

  it("multi で「その他」の自由入力と併用できる（選んだ __other__ が落ちない。自由入力は最後）", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "multi", options: OPTIONS, allowOther: true },
    ]);
    check(root, 'input[value="a"]');
    check(root, OPTION_OTHER);
    check(root, OTHER_PICK);
    setText(root, " q ");
    el.submit();
    expect(submitted).toEqual([{ answers: { q: ["a", "__other__", "q"] }, custom: ["q"] }]);
    expect(unsupported).toEqual([]);
  });
});

describe("部品の動き（1.1.0）: 値が空文字の選択肢も選べる", () => {
  it("single: 選ぶと回答は空文字（未回答ではない）", async () => {
    const { el, root, unsupported, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: WITH_EMPTY },
    ]);
    expect(unsupported).toEqual([]);
    expect(el.value).toEqual({ answers: {}, lacking: ["q"] });
    check(root, OPTION_EMPTY);
    expect(el.value).toEqual({ answers: { q: "" }, lacking: [] });
    el.submit();
    expect(submitted).toEqual([{ answers: { q: "" } }]);
  });

  it("single: 既定が空文字なら選択済みで出る（「その他」は選ばれない）", async () => {
    const { el, root } = await mountForm([
      {
        id: "q",
        label: "Q",
        type: "single",
        options: WITH_EMPTY,
        allowOther: true,
        default: "",
      },
    ]);
    expect(root.querySelector<HTMLInputElement>(OPTION_EMPTY)?.checked).toBe(true);
    expect(root.querySelector<HTMLInputElement>(OTHER_PICK)?.checked).toBe(false);
    expect(el.value).toEqual({ answers: { q: "" }, lacking: [] });
  });

  it("「その他」の空の入力とは別もの: 「その他」を選んで入力が空なら未回答、選択肢の空文字は回答", async () => {
    const { el, root, submitted } = await mountForm([
      { id: "q", label: "Q", type: "single", options: WITH_EMPTY, allowOther: true },
    ]);
    // 値が空の入力は 2 つ（選択肢と「その他」）。印で見分ける。
    expect(root.querySelectorAll('input[name="q"][value=""]')).toHaveLength(2);
    check(root, OTHER_PICK);
    expect(el.value).toEqual({ answers: {}, custom: ["q"], lacking: ["q"] });
    el.submit();
    expect(submitted).toEqual([]);
    check(root, OPTION_EMPTY);
    expect(el.value).toEqual({ answers: { q: "" }, lacking: [] });
    el.submit();
    expect(submitted).toEqual([{ answers: { q: "" } }]);
  });

  it("multi: 空文字の値は定義の位置に入る。「その他」の空の入力は入らず、必須も満たす", async () => {
    const { el, root, submitted } = await mountForm([
      {
        id: "q",
        label: "Q",
        type: "multi",
        options: [...WITH_EMPTY].reverse(),
        allowOther: true,
        required: true,
      },
    ]);
    check(root, OTHER_PICK);
    expect(el.value).toEqual({ answers: { q: [] }, custom: ["q"], lacking: ["q"] });
    check(root, OPTION_EMPTY);
    expect(el.value).toEqual({ answers: { q: [""] }, custom: ["q"], lacking: [] });
    check(root, 'input[value="a"]');
    setText(root, "z");
    el.submit();
    expect(submitted).toEqual([{ answers: { q: ["a", "", "z"] }, custom: ["q"] }]);
  });
});
