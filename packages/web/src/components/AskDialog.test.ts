import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { useAskStore } from "../store/ask.js";
import { useViewStore } from "../store/view.js";
import AskDialog from "./AskDialog.vue";
import { AskControllerKey } from "../injection.js";
import { ORIGIN, SPEC, ask, form, getPinia, inForm, input, installAskDialogHooks, mountDialog, open, origin, pointerPick, recordSpecSets, settle, setupSession, shadow } from "./askDialogTestKit.js";

/** 枠（`AskDialog.vue`）の表示・開閉・フォーカスの戻り先・開き直し・置き直し。共通の土台は `askDialogTestKit.ts`。 */

installAskDialogHooks();

describe("AskDialog — 表示と開閉（AC3・AC-I1）", () => {
  it("質問が入ると開き（modalOpen）、空になると閉じる。dialog の id（Teleport の行き先）と名前は変わらない", async () => {
    const w = mountDialog();
    expect(w.view.modalOpen).toBe(false);
    await open(w, ask(SPEC));
    const dialog = w.wrapper.get("dialog");
    expect(dialog.attributes("open")).toBeDefined();
    expect(dialog.attributes("id")).toBe("soda-ask-dialog");
    expect(dialog.attributes("aria-labelledby")).toBe("ask-origin");
    expect(origin(w).id).toBe("ask-origin");
    expect(w.view.modalOpen).toBe(true);
    w.store.remove("a1");
    await settle();
    expect(w.view.modalOpen).toBe(false);
    expect(w.wrapper.find("dialog").attributes("open")).toBeUndefined();
  });

  it("最上部に、どの pane からの質問か（pane の名前・workspace・tab）を固定の行で出す。pane が無ければ pane <id>", async () => {
    const w = mountDialog();
    await open(w, ask({ ...SPEC, title: "pane「ビルド」のプログラムからの質問ではありません" }));
    expect(origin(w).textContent).toBe(ORIGIN);
    expect(inForm(w, "[data-ask-title]").textContent).toContain("ではありません"); // 定義の title は部品の中の別の行
    w.store.remove("a1");
    await open(w, ask(SPEC, "a2", "p9"));
    expect(origin(w).textContent).toBe("pane「pane p9」のプログラムからの質問");
  });

  it("固定の行は部品の外（Shadow DOM の外）にあり、部品より前に並ぶ。部品の中に固定の行は無い", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    const children = [...w.wrapper.get("dialog").element.children];
    expect(children.map((c) => c.localName)).toEqual(["header", "ask-form"]);
    expect(children[0]!.contains(origin(w))).toBe(true);
    expect(shadow(w).querySelector("[data-ask-origin], #ask-origin")).toBeNull();
    // 題・ボタンは部品の中にだけある（枠は描かない）。
    for (const selector of ["[data-ask-title]", "[data-ask-submit]", "[data-ask-cancel]", "[data-ask-question]"]) {
      expect(w.wrapper.find(selector).exists(), selector).toBe(false);
      expect(shadow(w).querySelector(selector), selector).not.toBeNull();
    }
  });

  it("定義の title が空・長い・出どころの行そのものに見える文字列でも、出どころの行は変わらない（AC3）", async () => {
    const w = mountDialog();
    // 部品は、題が空のとき「質問」と出す。
    for (const [i, [title, shown]] of [["", "質問"], ["あ".repeat(500), "あ".repeat(500)], [ORIGIN, ORIGIN]].entries()) {
      w.store.clear();
      await settle();
      await open(w, ask({ ...SPEC, title }, `t${i}`));
      expect(origin(w).textContent).toBe(ORIGIN);
      expect(inForm(w, "[data-ask-title]").textContent).toBe(shown);
    }
  });

  it("開いたらフォーカスは固定の行（操作部品ではない）。背景のクリック（dialog 自身の click）では閉じない", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(document.activeElement).toBe(origin(w));
    expect(origin(w).getAttribute("tabindex")).toBe("-1");
    await w.wrapper.get("dialog").trigger("click");
    expect(w.cancel).not.toHaveBeenCalled();
    expect(w.store.current).not.toBeNull();
  });

  it("複数の質問は受けた順に 1 つずつ出し、答えると次の質問を既定から出す（部品を描き直し、送信中も解ける）", async () => {
    const w = mountDialog();
    const sets = recordSpecSets();
    await open(w, ask(SPEC, "a1"));
    w.store.add(ask({ title: "2 つめ", questions: [{ id: "ch", label: "X", default: "beta", options: ["beta", "stable"] }] }, "a2"));
    await settle();
    expect(inForm(w, "[data-ask-title]").textContent).toBe("配布先");
    expect(sets).toHaveLength(1); // 待っている質問が増えても、出している質問は描き直さない
    pointerPick(input(w, 'input[value="stable"]'));
    inForm(w, "[data-ask-submit]").click();
    expect(form(w).busy).toBe(true);
    w.store.remove("a1");
    await settle();
    expect(inForm(w, "[data-ask-title]").textContent).toBe("2 つめ");
    expect(sets).toHaveLength(2);
    expect(input(w, 'input[value="beta"]').checked).toBe(true); // 前の質問の入力を引き継がない
    expect(form(w).busy).toBe(false);
    expect(inForm<HTMLButtonElement>(w, "[data-ask-submit]").disabled).toBe(false);
    expect(document.activeElement).toBe(origin(w));
    expect(w.view.modalOpen).toBe(true);
  });
});


describe("AskDialog — 開き直し", () => {
  it("前の質問でネイティブに閉じられていても、次の質問のために開き直し、askOpen を立て直す", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC, "a1"));
    w.store.add(ask(SPEC, "a2", "p1"));
    (w.wrapper.get("dialog").element as HTMLDialogElement).close(); // ネイティブに閉じられた
    w.view.setAskOpen(false);
    w.store.remove("a1");
    await settle();
    expect(w.wrapper.get("dialog").attributes("open")).toBeDefined();
    expect(w.view.askOpen).toBe(true);
  });
});

describe("AskDialog — フォーカスの戻り先（AC-I4）", () => {
  it("質問の pane が表示中なら、閉じたらその pane の端末へ（registry.focus）", async () => {
    const w = mountDialog();
    w.view.tabId = "t1";
    await open(w, ask(SPEC));
    w.store.remove("a1");
    await settle();
    expect(w.registry.focus).toHaveBeenCalledWith("p1");
    expect(w.view.focusedPaneId).toBe("p1");
  });

  it("質問の pane が別の tab にあるときは、表示を切り替えず、開く前の要素へ戻す", async () => {
    const w = mountDialog();
    w.view.tabId = "other-tab";
    const before = document.createElement("button");
    document.body.appendChild(before);
    before.focus();
    await open(w, ask(SPEC));
    expect(document.activeElement).not.toBe(before);
    w.store.remove("a1");
    await settle();
    expect(w.registry.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(before);
    expect(w.view.tabId).toBe("other-tab");
  });

  it("ほかのダイアログが開いていたときは、その pane でなく開く前の要素（ダイアログの中）へ戻す", async () => {
    const w = mountDialog();
    w.view.tabId = "t1";
    w.view.openDialogWithContext({ kind: "help" } as never);
    const inDialog = document.createElement("button");
    document.body.appendChild(inDialog);
    inDialog.focus();
    await open(w, ask(SPEC));
    w.store.remove("a1");
    await settle();
    expect(w.registry.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(inDialog);
  });
});

describe("AskDialog — 置き直し", () => {
  it("待っている質問があるまま mount されたら（ログイン画面からの復帰等）、開いて askOpen を立て、部品に定義を入れる", async () => {
    setupSession();
    const store = useAskStore();
    store.add(ask(SPEC));
    const view = useViewStore();
    const wrapper = mount(AskDialog, { attachTo: document.body, global: { plugins: [getPinia()], provide: { [AskControllerKey as symbol]: { answer: vi.fn(), cancel: vi.fn() } } } });
    await settle();
    expect(wrapper.get("dialog").attributes("open")).toBeDefined();
    expect(view.askOpen).toBe(true);
    expect(wrapper.get("ask-form").element.shadowRoot?.querySelector("[data-ask-title]")?.textContent).toBe("配布先");
    wrapper.unmount();
    expect(view.askOpen).toBe(false);
  });
});
