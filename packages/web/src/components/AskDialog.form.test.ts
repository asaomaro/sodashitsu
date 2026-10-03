import { describe, expect, it, vi } from "vitest";
import { toRaw } from "vue";
import type { AskSpec, Pane } from "@sodashitsu/protocol";
import { useSessionStore } from "../store/session.js";
import {
  INNER_HEIGHT,
  type Mounted,
  ORIGIN,
  PAGED,
  SPEC,
  allInForm,
  arrowMove,
  ask,
  currentPage,
  focusedInForm,
  form,
  formProto,
  inForm,
  input,
  installAskDialogHooks,
  key,
  mountDialog,
  open,
  origin,
  pointerPick,
  recordSpecSets,
  resetPinia,
  setInnerHeight,
  settle,
  shadow,
  shownQuestions,
  spacePick,
  type,
} from "./askDialogTestKit.js";

/** 枠（`AskDialog.vue`）が部品 `<ask-form>` へ定義を入れる動きと、部品が描くもの・確定／取り消し・即確定。共通の土台は `askDialogTestKit.ts`。 */

installAskDialogHooks();

describe("AskDialog — 部品へ定義を入れる（1 回だけ・写し・高さ）", () => {
  it("同じ質問のままの再描画では定義を入れ直さない（入力が消えない）", async () => {
    const w = mountDialog();
    const sets = recordSpecSets();
    await open(w, ask(SPEC));
    pointerPick(input(w, 'input[value="stable"]'));
    type(inForm<HTMLTextAreaElement>(w, "[data-ask-note] textarea"), "メモ");
    // 固定の行が変わる（pane の名前が替わった）＝枠が描き直される。
    const session = useSessionStore();
    session.panes.set("p1", { ...session.panes.get("p1")!, label: "改名" } as Pane);
    await settle();
    expect(origin(w).textContent).toBe("pane「改名」（プロジェクト／main）のプログラムからの質問");
    expect(sets).toHaveLength(1);
    expect(input(w, 'input[value="stable"]').checked).toBe(true);
    expect(inForm<HTMLTextAreaElement>(w, "[data-ask-note] textarea").value).toBe("メモ");
  });

  it("部品へ渡すのは写し。部品が定義に書き込んでも、store の定義は変わらない", async () => {
    const w = mountDialog();
    const a = ask(SPEC);
    const before = JSON.stringify(a.spec);
    await open(w, a);
    const given = form(w).spec as AskSpec;
    const stored = toRaw(w.store.current!.spec);
    expect(given).not.toBe(stored);
    expect(given.questions[0]!.options[0]).not.toBe(stored.questions[0]!.options[0]);
    // 部品は選択肢に `_image`・`_audio` を書き込む（＝そのまま渡すと store に付く）。
    expect(Object.keys(given.questions[0]!.options[0]!)).toContain("_image");
    expect(Object.keys(stored.questions[0]!.options[0]!)).not.toContain("_image");
    expect(JSON.stringify(stored)).toBe(before);
  });

  it("定義を入れる前に高さを与え、大きさが取れない環境（単体テスト）では部品に高さを残さない", async () => {
    const w = mountDialog();
    const sets = recordSpecSets();
    await open(w, ask(SPEC));
    expect(sets).toHaveLength(1);
    expect(sets[0]!.height).toMatch(/^\d+px$/); // 先に「使える最大」を与えてから入れている
    expect(parseInt(sets[0]!.height, 10)).toBeGreaterThan(0);
    expect(form(w).contentHeight).toBe(0);
    expect(form(w).style.height).toBe("");
  });

  it("大きさが取れたら、いちばん高いページの高さに合わせる（最大は超えない）。resize では最大だけを当て直し、relayout しない", async () => {
    const w = mountDialog();
    vi.spyOn(formProto(), "contentHeight", "get").mockReturnValue(300);
    const relayout = vi.spyOn(formProto(), "relayout");
    await open(w, ask(SPEC));
    expect(relayout).toHaveBeenCalledOnce();
    expect(form(w).style.height).toBe("300px");

    setInnerHeight(200);
    window.dispatchEvent(new Event("resize"));
    const max = parseInt(form(w).style.height, 10);
    expect(max).toBeLessThanOrEqual(200 - 16); // 画面の高さ − 上下の余白（固定の行と枠線は、この環境では 0）
    expect(max).toBeGreaterThan(200 - 16 - 20);

    setInnerHeight(INNER_HEIGHT);
    window.dispatchEvent(new Event("resize"));
    expect(form(w).style.height).toBe("300px");
    expect(relayout).toHaveBeenCalledOnce();
  });

  it("resize のリスナーは開いている間だけ付く（閉じる・アンマウントで外す）", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const resizeOf = (calls: unknown[][]) =>
      calls.filter((c) => c[0] === "resize").map((c) => c[1]);
    const w = mountDialog();
    expect(resizeOf(add.mock.calls)).toHaveLength(0); // 質問が無い間は付けない
    await open(w, ask(SPEC));
    const added = resizeOf(add.mock.calls);
    expect(added).toHaveLength(1);
    remove.mockClear();
    w.store.remove("a1");
    await settle();
    expect(resizeOf(remove.mock.calls)).toEqual([added[0]]);

    // 開いたままアンマウントされても外す。
    await open(w, ask(SPEC, "a2"));
    expect(new Set(resizeOf(add.mock.calls)).size).toBe(1); // 同じ関数（二重には付かない）
    remove.mockClear();
    w.wrapper.unmount();
    expect(resizeOf(remove.mock.calls)).toEqual([added[0]]);
  });

  it("テーマの変数を割り当てる規則（scoped の .ask-form）が部品の要素に当たる（枠と同じ scope の印が付く）", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    const scopeOf = (el: Element) => el.getAttributeNames().filter((n) => n.startsWith("data-v-"));
    expect(form(w).classList.contains("ask-form")).toBe(true);
    expect(scopeOf(form(w))).toHaveLength(1);
    expect(scopeOf(form(w))).toEqual(scopeOf(w.wrapper.get("dialog").element));
  });
});

describe("AskDialog — 部品が描くもの（AC2）", () => {
  it("default が選択済み。showIf で出し分け、番号を振り直す。おすすめの札・「その他」・補足", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(shownQuestions(w)).toEqual(["ch", "m"]); // roll は隠れている
    expect(input(w, 'input[type=radio][value="beta"]').checked).toBe(true);
    expect(input(w, 'input[type=checkbox][value="a"]').checked).toBe(true);
    expect(allInForm(w, ".badge").map((b) => b.textContent)).toEqual(["おすすめ"]);
    expect(inForm(w, '[data-ask-question="ch"] label.opt.other .name').textContent).toBe("その他");
    expect(inForm(w, "[data-ask-note] textarea").getAttribute("aria-label")).toBe("補足");
    pointerPick(input(w, 'input[type=radio][value="stable"]'));
    expect(shownQuestions(w)).toEqual(["ch", "roll", "m"]);
    expect(
      allInForm(w, "[data-ask-question]:not([hidden]) .num").map((n) => n.textContent),
    ).toEqual(["1", "2", "3"]);
  });

  it("補足なし（note: false）では補足欄を描かない", async () => {
    const w = mountDialog();
    await open(w, ask({ ...SPEC, note: false }));
    expect(shadow(w).querySelector("[data-ask-note]")).toBeNull();
  });

  it("13 件の選択肢を全部出し、色の帯を描き、最後の 1 つも選べる", async () => {
    const w = mountDialog();
    const options = Array.from({ length: 13 }, (_, i) => ({
      value: `t${i}`,
      label: `テーマ${i}`,
      colors: ["#1a56db", "#0ea5e9"],
    }));
    await open(
      w,
      ask({
        questions: [
          { id: "theme", label: "テーマ", default: "t0", options },
          { id: "x", label: "X", default: "1", options: ["1"] },
        ],
        note: false,
      }),
    );
    expect(allInForm(w, '[data-ask-question="theme"] label.opt')).toHaveLength(13);
    expect(allInForm(w, ".sw i")).toHaveLength(26);
    expect(inForm(w, ".sw i").style.backgroundColor).not.toBe("");
    pointerPick(input(w, 'input[value="t12"]'));
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { theme: "t12", x: "1" } });
  });

  it("page を書いた定義はページに分かれる（番号と題・出ているのは今のページの質問だけ）", async () => {
    const w = mountDialog();
    await open(w, ask(PAGED));
    expect(form(w).pageCount).toBe(3);
    expect(allInForm(w, "[data-ask-page]").map((b) => b.textContent)).toEqual([
      "1基本",
      "2詳細",
      "3確認",
    ]);
    expect(currentPage(w)).toBe("1");
    expect(shownQuestions(w)).toEqual(["a"]);
    inForm(w, "[data-ask-next]").click();
    expect(currentPage(w)).toBe("2");
    expect(shownQuestions(w)).toEqual(["b"]);
    // 決定はどのページからでもでき、全部のページの回答が入る。
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "x", b: "x", c: "x" } });
  });

  it("page・paging を書かない定義は、大きさが取れない環境では 1 枚のまま（番号を出さない）", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(form(w).pageCount).toBe(1);
    expect(inForm(w, "nav.steps").hidden).toBe(true);
    expect(inForm(w, "[data-ask-next]").hidden).toBe(true);
  });

  it("定義のどの文字列に <script>・<img onerror> を入れても、文字のまま表示される。色でない文字列は style に入らない", async () => {
    const w = mountDialog();
    const evil = '<script>window.__askXss=1</script><img src=x onerror="window.__askXss=2">';
    await open(
      w,
      ask({
        title: evil,
        intro: evil,
        submit: evil,
        note: evil,
        questions: [
          {
            id: "q",
            label: evil,
            help: evil,
            page: evil,
            allowOther: true,
            otherLabel: evil,
            otherPlaceholder: evil,
            options: [
              {
                value: evil,
                label: evil,
                desc: evil,
                colors: ["red; background:url(javascript:1)", "#fff"],
              },
            ],
            default: evil,
          },
          { id: "t", label: evil, type: "text", placeholder: evil, page: "2" },
        ],
      }),
    );
    const dialog = w.wrapper.get("dialog").element;
    const root = shadow(w);
    expect(dialog.querySelectorAll("script, img")).toHaveLength(0);
    // 部品の中にも無い（拡大表示の `img` は、開いたときにだけ入る）。
    expect(root.querySelectorAll("script, img")).toHaveLength(0);
    expect(origin(w).textContent).toBe(ORIGIN);
    expect(inForm(w, "[data-ask-title]").textContent).toBe(evil);
    expect(inForm(w, ".intro").textContent).toBe(evil);
    expect(inForm(w, ".help").textContent).toBe(evil);
    expect(inForm(w, "label.opt .name").textContent).toBe(evil);
    expect(inForm(w, "label.opt .desc").textContent).toBe(evil);
    expect(inForm(w, "label.opt.other .name").textContent).toBe(evil);
    expect(inForm(w, '[data-ask-page="1"]').textContent).toBe(`1${evil}`);
    expect(inForm(w, "[data-ask-submit]").textContent).toContain(evil);
    expect(input(w, "label.opt:not(.other) input").value).toBe(evil);
    expect(allInForm(w, ".sw i")).toHaveLength(1);
    expect(inForm(w, ".sw i").getAttribute("style")).toContain("#fff");
    expect((window as unknown as { __askXss?: number }).__askXss).toBeUndefined();
    expect(root.innerHTML).not.toContain("javascript:1");
  });

  it("画像の無い定義では、部品の中に img が無い（拡大表示は、開いたときにだけ Shadow DOM に入る）", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(shadow(w).querySelector("img")).toBeNull();
    expect(shadow(w).querySelector(".lb")).toBeNull();
    // 決定を試みた後・ページを移った後も同じ。
    w.store.clear();
    await settle();
    await open(
      w,
      ask(
        { ...PAGED, questions: [...PAGED.questions, { id: "d", label: "D", options: ["x"] }] },
        "a2",
      ),
    );
    inForm(w, "[data-ask-submit]").click();
    form(w).step(1);
    expect(w.answer).not.toHaveBeenCalled();
    expect(shadow(w).querySelector("img, .lb")).toBeNull();
  });

  it("定義の検査を通らずに届いた（版の違う中継等）色でない文字列も、部品は style に入れない", async () => {
    const w = mountDialog();
    const raw = ask({
      questions: [{ id: "q", label: "Q", options: [{ value: "x", colors: ["#fff"] }] }],
    });
    raw.spec.questions[0]!.options[0]!.colors = [
      "red; background:url(javascript:1)",
      "#1a56db",
      "expression(1)",
    ];
    await open(w, raw);
    expect(allInForm(w, ".sw i")).toHaveLength(1);
    expect(shadow(w).innerHTML).not.toContain("javascript:1");
    expect(shadow(w).innerHTML).not.toContain("expression");
  });
});

describe("AskDialog — 確定・取り消し（AC-I2）", () => {
  it("触らずに決定すると default の答え。部品の［決定］・部品の中の Ctrl+Enter・1 行の入力欄の Enter、固定の行での Ctrl+Enter・Cmd+Enter のどれでも送る", async () => {
    const expected = { answers: { ch: "beta", m: ["a"] } };
    const triggers: [string, (w: Mounted) => void][] = [
      ["決定ボタン", (w) => inForm(w, "[data-ask-submit]").click()],
      [
        "部品の中の Ctrl+Enter",
        (w) => void key(input(w, 'input[value="beta"]'), { key: "Enter", ctrlKey: true }),
      ],
      [
        "1 行の入力欄の Enter",
        (w) => void key(input(w, "label.opt.other input[type=text]"), { key: "Enter" }),
      ],
      ["固定の行の Ctrl+Enter", (w) => void key(origin(w), { key: "Enter", ctrlKey: true })],
      ["固定の行の Cmd+Enter", (w) => void key(origin(w), { key: "Enter", metaKey: true })],
    ];
    for (const [label, fire] of triggers) {
      resetPinia();
      const w = mountDialog();
      await open(w, ask(SPEC));
      fire(w);
      expect(w.answer, label).toHaveBeenCalledOnce();
      expect(w.answer, label).toHaveBeenCalledWith("a1", expected);
      // 送っている間は押せない（二重送信をしない）。
      expect(form(w).busy, label).toBe(true);
      expect(inForm<HTMLButtonElement>(w, "[data-ask-submit]").disabled, label).toBe(true);
      expect(inForm<HTMLButtonElement>(w, "[data-ask-cancel]").disabled, label).toBe(true);
      inForm(w, "[data-ask-submit]").click();
      key(origin(w), { key: "Enter", ctrlKey: true });
      expect(w.answer, label).toHaveBeenCalledOnce();
      w.wrapper.unmount();
      document.body.innerHTML = "";
    }
  });

  it("固定の行での Ctrl+Enter は既定の動きを止める（preventDefault）", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(key(origin(w), { key: "Enter", ctrlKey: true }).defaultPrevented).toBe(true);
    // 枠が取り次がないキーは止めない。
    expect(key(origin(w), { key: "Enter" }).defaultPrevented).toBe(false);
    expect(key(origin(w), { key: "PageDown" }).defaultPrevented).toBe(false);
    expect(w.answer).toHaveBeenCalledOnce();
  });

  it("送るのは answers・custom・note だけ（部品の detail のほかの項目は送らない）", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    const detail = {
      answers: { ch: "beta", m: ["a"] },
      custom: ["ch"],
      edited: ["ch"],
      note: "メモ",
      lacking: [],
    };
    form(w).dispatchEvent(new CustomEvent("ask-submit", { detail, bubbles: true, composed: true }));
    expect(w.answer).toHaveBeenCalledWith("a1", {
      answers: { ch: "beta", m: ["a"] },
      custom: ["ch"],
      note: "メモ",
    });
    expect(Object.keys(w.answer.mock.calls[0]![1] as object).sort()).toEqual([
      "answers",
      "custom",
      "note",
    ]);
  });

  it("IME の変換中（isComposing・keyCode 229）の Enter では送らない（部品の中・固定の行のどちらも）", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    const other = input(w, "label.opt.other input[type=text]");
    key(other, { key: "Enter" }, { isComposing: true });
    key(other, { key: "Enter" }, { keyCode: 229 });
    const composing = key(origin(w), { key: "Enter", ctrlKey: true }, { isComposing: true });
    const ime = key(origin(w), { key: "Enter", ctrlKey: true }, { keyCode: 229 });
    expect(composing.defaultPrevented).toBe(false);
    expect(ime.defaultPrevented).toBe(false);
    expect(w.answer).not.toHaveBeenCalled();
  });

  it("未回答があれば送らず、部品がその質問を強調して知らせる。答えると強調が消える", async () => {
    const w = mountDialog();
    await open(
      w,
      ask({
        questions: [
          { id: "a", label: "A", options: ["x", "y"] },
          { id: "t", label: "T", type: "text", required: true },
        ],
        note: false,
      }),
    );
    expect(inForm(w, "[data-ask-status]").textContent).toBe("未回答 2 件");
    inForm(w, "[data-ask-submit]").click();
    key(origin(w), { key: "Enter", ctrlKey: true });
    expect(w.answer).not.toHaveBeenCalled();
    expect(form(w).busy).toBe(false);
    expect(allInForm(w, "fieldset.missing")).toHaveLength(2);
    expect(inForm(w, "[data-ask-status]").textContent).toContain("答えてから決定してください");
    pointerPick(input(w, 'input[value="x"]'));
    type(input(w, '[data-ask-question="t"] input[type=text]'), "hi");
    expect(allInForm(w, "fieldset.missing")).toHaveLength(0);
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "x", t: "hi" } });
  });

  it("未回答のまま決定すると、未回答の質問に aria-invalid が付き、最初の未回答の質問のページへ移って、その入力へフォーカスが移る", async () => {
    const w = mountDialog();
    await open(
      w,
      ask({
        note: false,
        questions: [
          { id: "a", label: "A", page: "基本", default: "x", options: ["x", "y"] },
          { id: "b", label: "B", page: "詳細", options: ["p", "q"] },
          { id: "t", label: "T", page: "確認", type: "text", required: true },
        ],
      }),
    );
    const invalid = () =>
      allInForm(w, 'fieldset[aria-invalid="true"]').map((f) => f.getAttribute("data-ask-question"));
    expect(invalid()).toEqual([]); // 決定を試みるまでは付かない
    expect(currentPage(w)).toBe("1");
    expect(document.activeElement).toBe(origin(w));

    key(origin(w), { key: "Enter", ctrlKey: true });
    expect(w.answer).not.toHaveBeenCalled();
    expect(invalid()).toEqual(["b", "t"]);
    expect(allInForm(w, "fieldset[aria-invalid]")).toHaveLength(2); // 答えてある質問には付かない
    expect(currentPage(w)).toBe("2");
    // 最初の未回答の質問（b）の最初の入力。選ばれはしない（フォーカスだけ）。
    const first = input(w, '[data-ask-question="b"] input[value="p"]');
    expect(focusedInForm(w)).toBe(first);
    expect(document.activeElement).toBe(form(w));
    expect(first.checked).toBe(false);

    // 答えた質問からは外れ、次に決定すると、残った未回答の質問（t）の入力へ移る。
    pointerPick(first);
    expect(invalid()).toEqual(["t"]);
    inForm(w, "[data-ask-submit]").click();
    expect(currentPage(w)).toBe("3");
    expect(focusedInForm(w)).toBe(input(w, '[data-ask-question="t"] input[type=text]'));
    type(input(w, '[data-ask-question="t"] input[type=text]'), "hi");
    expect(allInForm(w, "fieldset[aria-invalid]")).toHaveLength(0);
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledOnce();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "x", b: "p", t: "hi" } });
  });

  it("値が __other__ の選択肢を選んで決定すると、その値が回答として送られる（「その他」の自由入力と併用できる）", async () => {
    const w = mountDialog();
    await open(
      w,
      ask({
        note: false,
        questions: [
          {
            id: "s",
            label: "S",
            allowOther: true,
            options: ["x", { value: "__other__", label: "ほか" }],
          },
          { id: "m", label: "M", type: "multi", allowOther: true, options: ["x", "__other__"] },
        ],
      }),
    );
    pointerPick(input(w, '[data-ask-question="s"] input[value="__other__"]'));
    pointerPick(input(w, '[data-ask-question="m"] input[value="__other__"]'));
    type(input(w, '[data-ask-question="m"] label.opt.other input[type=text]'), "自由");
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledOnce();
    expect(w.answer).toHaveBeenCalledWith("a1", {
      answers: { s: "__other__", m: ["__other__", "自由"] },
      custom: ["m"],
    });
  });

  it("値が空文字の選択肢を選んで決定すると、空文字が回答として送られる（未回答にならない。「その他」の空の入力は未回答のまま）", async () => {
    const w = mountDialog();
    await open(
      w,
      ask({
        note: false,
        questions: [
          { id: "s", label: "S", allowOther: true, options: [{ value: "", label: "なし" }, "x"] },
          {
            id: "m",
            label: "M",
            type: "multi",
            required: true,
            options: ["x", { value: "", label: "なし" }],
          },
        ],
      }),
    );
    // 「その他」を選んだだけ（入力が空）では未回答。
    pointerPick(input(w, '[data-ask-question="s"] input[data-other]'));
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).not.toHaveBeenCalled();
    expect(
      allInForm(w, 'fieldset[aria-invalid="true"]').map((f) => f.getAttribute("data-ask-question")),
    ).toEqual(["s", "m"]);

    pointerPick(input(w, '[data-ask-question="s"] input[value=""]:not([data-other])'));
    pointerPick(input(w, '[data-ask-question="m"] input[value=""]'));
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledOnce();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { s: "", m: [""] } });
  });

  it("「その他」: 入力すると選ばれ、答えは入力で custom に id が入る。補足は note", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    type(input(w, "label.opt.other input[type=text]"), "  自由な値  ");
    expect(input(w, "label.opt.other input[type=radio]").checked).toBe(true);
    type(inForm<HTMLTextAreaElement>(w, "[data-ask-note] textarea"), "  メモ  ");
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledWith("a1", {
      answers: { ch: "自由な値", m: ["a"] },
      custom: ["ch"],
      note: "メモ",
    });
  });

  it("部品の［キャンセル］・Esc（cancel イベント）で取り消し、ネイティブの close はさせない", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    inForm(w, "[data-ask-cancel]").click();
    expect(w.cancel).toHaveBeenCalledWith("a1");
    expect(w.answer).not.toHaveBeenCalled();
    const ev = new Event("cancel", { cancelable: true });
    w.wrapper.get("dialog").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(w.cancel).toHaveBeenCalledTimes(2);
  });

  it("送信中でも Esc（cancel イベント）で取り消せる", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    inForm(w, "[data-ask-submit]").click();
    expect(form(w).busy).toBe(true);
    w.wrapper.get("dialog").element.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(w.cancel).toHaveBeenCalledWith("a1");
  });

  it("送れなかったら（false）ダイアログは開いたまま、busy が戻り、もう一度決定できる", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    w.answer.mockResolvedValueOnce(false);
    inForm(w, "[data-ask-submit]").click();
    expect(form(w).busy).toBe(true);
    await settle();
    expect(w.store.current).not.toBeNull();
    expect(form(w).busy).toBe(false);
    expect(inForm<HTMLButtonElement>(w, "[data-ask-submit]").disabled).toBe(false);
    expect(inForm<HTMLButtonElement>(w, "[data-ask-cancel]").disabled).toBe(false);
    inForm(w, "[data-ask-submit]").click();
    expect(w.answer).toHaveBeenCalledTimes(2);
  });

  it("送れなかった応答が次の質問に替わった後で届いても、次の質問の busy は触らない", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC, "a1"));
    let fail: (ok: boolean) => void = () => undefined;
    w.answer.mockImplementationOnce(() => new Promise<boolean>((resolve) => (fail = resolve)));
    inForm(w, "[data-ask-submit]").click();
    w.store.add(ask(SPEC, "a2"));
    w.store.remove("a1");
    await settle();
    inForm(w, "[data-ask-submit]").click(); // 次の質問を送信中
    expect(w.answer).toHaveBeenLastCalledWith("a2", expect.anything());
    expect(form(w).busy).toBe(true);
    fail(false);
    await settle();
    expect(form(w).busy).toBe(true);
  });
});

describe("AskDialog — 質問が 1 つだけ・single・note:false の即確定（部品の動き。AC9）", () => {
  const ONE = {
    note: false,
    questions: [{ id: "a", label: "A", default: "x", options: ["x", "y", "z"] }],
  };

  /** 選択肢を 1 つ操作して、送られた回答を返す（1 件ごとに置き直す）。 */
  async function fireOnce(
    raw: unknown,
    selector: string,
    fire: (el: HTMLInputElement) => void,
  ): Promise<unknown[][]> {
    const w = mountDialog();
    await open(w, ask(raw, "k"));
    fire(input(w, selector));
    const calls = w.answer.mock.calls.map((c) => [...c]);
    w.wrapper.unmount();
    document.body.innerHTML = "";
    resetPinia();
    return calls;
  }
  const HOW: [string, (el: HTMLInputElement) => void][] = [
    ["ポインタ", pointerPick],
    ["Space", spacePick],
    ["Enter", (el) => void key(el, { key: "Enter" })],
  ];

  it("ポインタ・Space・Enter で、選ばれていない選択肢を選んだら、その時点で確定する（回答は 1 回だけ送る）", async () => {
    for (const [label, fire] of HOW) {
      expect(await fireOnce(ONE, 'input[value="z"]', fire), label).toEqual([
        ["k", { answers: { a: "z" } }],
      ]);
    }
  });

  it("既に選ばれている選択肢でも、ポインタ・Space・Enter で確定する（回答は 1 回だけ送る）", async () => {
    for (const [label, fire] of HOW) {
      // x は既定で選ばれている
      expect(await fireOnce(ONE, 'input[value="x"]', fire), label).toEqual([
        ["k", { answers: { a: "x" } }],
      ]);
    }
  });

  it("選択肢の行（label）をポインタで押しても確定する（回答は 1 回だけ送る）", async () => {
    const w = mountDialog();
    await open(w, ask(ONE));
    const y = input(w, 'input[value="y"]');
    const label = y.closest("label");
    if (!label) throw new Error("label が無い");
    pointerPick(label.querySelector<HTMLElement>(".name")!);
    expect(y.checked).toBe(true);
    expect(w.answer).toHaveBeenCalledOnce();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "y" } });
  });

  it("確定した後（送信中）に同じ操作を重ねても、回答は 1 回だけ送る", async () => {
    const w = mountDialog();
    await open(w, ask(ONE));
    const y = input(w, 'input[value="y"]');
    pointerPick(y);
    pointerPick(y);
    spacePick(y);
    key(y, { key: "Enter" });
    pointerPick(input(w, 'input[value="z"]'));
    expect(w.answer).toHaveBeenCalledOnce();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "y" } });
  });

  it("矢印キーで移っただけ（keydown → 移った先の click と change）では確定しない。ポインタの後でも、矢印で移れば確定しない", async () => {
    const w = mountDialog();
    await open(w, ask(ONE));
    const x = input(w, 'input[value="x"]');
    const y = input(w, 'input[value="y"]');
    const z = input(w, 'input[value="z"]');
    arrowMove(x, y);
    expect(y.checked).toBe(true);
    expect(w.answer).not.toHaveBeenCalled();
    // 直前がポインタでも、その後に矢印で移ったのなら確定しない。
    y.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    arrowMove(y, z);
    expect(z.checked).toBe(true);
    expect(w.answer).not.toHaveBeenCalled();
    // 移った先で Space を押せば確定する（既に選ばれている選択肢）。
    spacePick(z);
    expect(w.answer).toHaveBeenCalledOnce();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "z" } });
  });

  it("「その他」を選んだだけでは確定しない（入力して Enter で確定する）", async () => {
    const w = mountDialog();
    await open(
      w,
      ask({
        note: false,
        questions: [{ id: "a", label: "A", default: "x", allowOther: true, options: ["x", "y"] }],
      }),
    );
    const other = input(w, "label.opt.other input[data-other]");
    pointerPick(other);
    spacePick(other);
    key(other, { key: "Enter" });
    expect(other.checked).toBe(true);
    expect(w.answer).not.toHaveBeenCalled();
    const text = input(w, "label.opt.other input[type=text]");
    type(text, "自由");
    key(text, { key: "Enter" });
    expect(w.answer).toHaveBeenCalledOnce();
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "自由" }, custom: ["a"] });
  });

  it("質問が 2 つ以上・補足あり・multi では即確定しない", async () => {
    for (const raw of [
      {
        note: false,
        questions: [
          { id: "a", label: "A", options: ["x", "y"] },
          { id: "b", label: "B", options: ["x"] },
        ],
      },
      { questions: [{ id: "a", label: "A", options: ["x", "y"] }] },
      { note: false, questions: [{ id: "a", label: "A", type: "multi", options: ["x", "y"] }] },
    ]) {
      const w = mountDialog();
      await open(w, ask(raw));
      const y = input(w, '[data-ask-question="a"] input[value="y"]');
      pointerPick(y);
      key(y, { key: "Enter" });
      expect(y.checked).toBe(true);
      expect(w.answer).not.toHaveBeenCalled();
      w.wrapper.unmount();
      document.body.innerHTML = "";
      resetPinia();
    }
  });
});
