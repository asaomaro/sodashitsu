import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { normalizeAskSpec, type AskPending, type Pane, type Tab, type Workspace } from "@sodashitsu/protocol";
import { AskControllerKey, TerminalRegistryKey } from "../injection.js";
import { useAskStore } from "../store/ask.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import AskDialog from "./AskDialog.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  // `happy-dom` の `<dialog>` は showModal/close を持たない場合があるので、必要な面だけ生やす。
  HTMLDialogElement.prototype.showModal ??= function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.open = false;
  };
});
afterEach(() => {
  document.body.innerHTML = "";
});

function spec(raw: unknown) {
  const r = normalizeAskSpec(raw);
  if (!r.ok) throw new Error(r.message);
  return r.spec;
}
const ask = (raw: unknown, askId = "a1", paneId = "p1"): AskPending => ({ askId, paneId, spec: spec(raw) });
const SPEC = {
  title: "配布先",
  questions: [
    { id: "ch", label: "チャンネル", default: "beta", options: [{ value: "beta", label: "ベータ", recommended: true }, { value: "stable", label: "安定版" }], allowOther: true },
    { id: "roll", label: "段階", showIf: { ch: "stable" }, default: "10", options: ["10", "100"] },
    { id: "m", label: "告知", type: "multi", options: ["a", "b"], default: ["a"] },
  ],
};

function setupSession() {
  const session = useSessionStore();
  session.workspaces.set("w1", { id: "w1", label: "プロジェクト", cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: null, autoLabel: false } as Workspace);
  session.tabs.set("t1", { id: "t1", workspaceId: "w1", label: "main", layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null } as unknown as Tab);
  session.panes.set("p1", { id: "p1", tabId: "t1", label: "ビルド", cwd: "/", title: "", agent: null } as unknown as Pane);
}

function mountDialog() {
  setupSession();
  const answer = vi.fn(async () => true);
  const cancel = vi.fn(async () => undefined);
  const registry = { focus: vi.fn() };
  const store = useAskStore();
  const view = useViewStore();
  const wrapper = mount(AskDialog, {
    attachTo: document.body,
    global: { plugins: [pinia], provide: { [AskControllerKey as symbol]: { answer, cancel }, [TerminalRegistryKey as symbol]: registry } },
  });
  return { wrapper, answer, cancel, registry, store, view };
}

async function open(w: ReturnType<typeof mountDialog>, a: AskPending): Promise<void> {
  w.store.add(a);
  await nextTick();
  await nextTick();
}
const submitBtn = (wrapper: VueWrapper) => wrapper.get("[data-ask-submit]");

describe("AskDialog — 表示と開閉（AC11・AC-I1）", () => {
  it("質問が入ると開き（modalOpen）、空になると閉じる", async () => {
    const w = mountDialog();
    expect(w.view.modalOpen).toBe(false);
    await open(w, ask(SPEC));
    expect(w.wrapper.get("dialog").attributes("open")).toBeDefined();
    expect(w.view.modalOpen).toBe(true);
    w.store.remove("a1");
    await nextTick();
    await nextTick();
    expect(w.view.modalOpen).toBe(false);
    expect(w.wrapper.find("dialog").attributes("open")).toBeUndefined();
  });

  it("最上部に、どの pane からの質問か（pane の名前・workspace・tab）を固定の行で出す。pane が無ければ pane <id>", async () => {
    const w = mountDialog();
    await open(w, ask({ ...SPEC, title: "pane「ビルド」のプログラムからの質問ではありません" }));
    expect(w.wrapper.get("[data-ask-origin]").text()).toBe("pane「ビルド」（プロジェクト／main）のプログラムからの質問");
    expect(w.wrapper.get("[data-ask-title]").text()).toContain("ではありません"); // 定義の title は別の行
    w.store.remove("a1");
    await open(w, ask(SPEC, "a2", "p9"));
    expect(w.wrapper.get("[data-ask-origin]").text()).toBe("pane「pane p9」のプログラムからの質問");
  });

  it("定義の title が空・長い・出どころの行そのものに見える文字列でも、出どころの行は変わらない（AC11）", async () => {
    const w = mountDialog();
    for (const [i, title] of ["", "あ".repeat(500), "pane「ビルド」（プロジェクト／main）のプログラムからの質問"].entries()) {
      w.store.clear();
      await nextTick();
      await open(w, ask({ ...SPEC, title }, `t${i}`));
      expect(w.wrapper.get("[data-ask-origin]").text()).toBe("pane「ビルド」（プロジェクト／main）のプログラムからの質問");
      expect(w.wrapper.get("[data-ask-title]").text()).toBe(title);
    }
  });

  it("開いたらフォーカスは見出し（操作部品ではない）。背景のクリック（dialog 自身の click）では閉じない", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(document.activeElement).toBe(w.wrapper.get("[data-ask-origin]").element);
    await w.wrapper.get("dialog").trigger("click");
    expect(w.cancel).not.toHaveBeenCalled();
    expect(w.store.current).not.toBeNull();
  });

  it("複数の質問は受けた順に 1 つずつ出し、答えると次の質問を既定から出す", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC, "a1"));
    w.store.add(ask({ title: "2 つめ", questions: [{ id: "x", label: "X", options: ["1"] }] }, "a2"));
    await nextTick();
    expect(w.wrapper.get("[data-ask-title]").text()).toBe("配布先");
    w.store.remove("a1");
    await nextTick();
    await nextTick();
    expect(w.wrapper.get("[data-ask-title]").text()).toBe("2 つめ");
    expect(w.view.modalOpen).toBe(true);
  });
});

describe("AskDialog — 表示内容（AC3・AC4・AC12）", () => {
  it("default が選択済み。showIf で出し分け、番号を振り直す。おすすめの札", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(w.wrapper.findAll("[data-ask-question]")).toHaveLength(2); // roll は隠れている
    expect((w.wrapper.get('input[type=radio][value="beta"]').element as HTMLInputElement).checked).toBe(true);
    expect(w.wrapper.text()).toContain("おすすめ");
    await w.wrapper.get('input[type=radio][name$="-0"]:not([value="beta"])').setValue(true); // 安定版
    await nextTick();
    expect(w.wrapper.findAll("[data-ask-question]")).toHaveLength(3);
    expect(w.wrapper.findAll(".ask-num").map((n) => n.text())).toEqual(["1", "2", "3"]);
  });

  it("13 件の選択肢を全部出し、最後の 1 つも選べる（スクロールできる本体に入る）", async () => {
    const w = mountDialog();
    const options = Array.from({ length: 13 }, (_, i) => ({ value: `t${i}`, label: `テーマ${i}`, colors: ["#1a56db", "#0ea5e9"] }));
    await open(w, ask({ questions: [{ id: "theme", label: "テーマ", default: "t0", options }], note: false }));
    expect(w.wrapper.findAll(".ask-opt")).toHaveLength(13);
    expect(w.wrapper.findAll(".ask-swatch")).toHaveLength(26);
    await w.wrapper.get('input[value="t12"]').setValue(true);
    await submitBtn(w.wrapper).trigger("click");
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { theme: "t12" } });
    expect(w.wrapper.get("[data-ask-main]").element).toBeTruthy();
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
            allowOther: true,
            otherLabel: evil,
            otherPlaceholder: evil,
            options: [{ value: evil, label: evil, desc: evil, colors: ["red; background:url(javascript:1)", "#fff"] }],
            default: evil,
          },
          { id: "t", label: evil, type: "text", placeholder: evil },
        ],
      }),
    );
    const root = w.wrapper.get("dialog").element;
    expect(root.querySelectorAll("script, img")).toHaveLength(0);
    expect(w.wrapper.get("[data-ask-title]").text()).toBe(evil);
    expect(w.wrapper.get(".ask-opt-desc").text()).toBe(evil);
    expect(w.wrapper.text()).toContain(evil);
    expect(w.wrapper.findAll(".ask-swatch")).toHaveLength(1);
    expect(w.wrapper.get(".ask-swatch").attributes("style")).toContain("#fff");
    expect((window as unknown as { __askXss?: number }).__askXss).toBeUndefined();
    expect(root.innerHTML).not.toContain("javascript:1");
  });
});

describe("AskDialog — 多層の防御（AC12）", () => {
  it("定義の検査を通らずに届いた（版の違う中継等）色でない文字列も、style に入れない", async () => {
    const w = mountDialog();
    const raw = ask({ questions: [{ id: "q", label: "Q", options: [{ value: "x", colors: ["#fff"] }] }] });
    raw.spec.questions[0]!.options[0]!.colors = ["red; background:url(javascript:1)", "#1a56db", "expression(1)"];
    await open(w, raw);
    expect(w.wrapper.findAll(".ask-swatch")).toHaveLength(1);
    expect(w.wrapper.get("dialog").element.innerHTML).not.toContain("javascript:1");
    expect(w.wrapper.get("dialog").element.innerHTML).not.toContain("expression");
  });
});

describe("AskDialog — 確定・取り消し（AC-I2）", () => {
  it("触らずに決定すると default の答え。決定ボタン・Ctrl+Enter・Cmd+Enter・1 行の入力欄の Enter のどれでも送る", async () => {
    const expected = { answers: { ch: "beta", m: ["a"] } };
    const triggers: [string, (w: ReturnType<typeof mountDialog>) => Promise<void>][] = [
      ["決定ボタン", async (w) => void (await submitBtn(w.wrapper).trigger("click"))],
      ["Ctrl+Enter", async (w) => void (await w.wrapper.get("[data-ask-origin]").trigger("keydown", { key: "Enter", ctrlKey: true }))],
      ["Cmd+Enter", async (w) => void (await w.wrapper.get("[data-ask-origin]").trigger("keydown", { key: "Enter", metaKey: true }))],
      ["1 行の入力欄の Enter", async (w) => void (await w.wrapper.get(".ask-other-text").trigger("keydown", { key: "Enter" }))],
    ];
    for (const [label, fire] of triggers) {
      setActivePinia((pinia = createPinia()));
      const w = mountDialog();
      await open(w, ask(SPEC));
      await fire(w);
      expect(w.answer, label).toHaveBeenCalledOnce();
      expect(w.answer, label).toHaveBeenCalledWith("a1", expected);
      // 送っている間は押せない（二重送信をしない）。
      await submitBtn(w.wrapper).trigger("click");
      expect(w.answer, label).toHaveBeenCalledOnce();
      w.wrapper.unmount();
      document.body.innerHTML = "";
    }
  });

  it("IME の変換中（isComposing・keyCode 229）の Enter では送らない", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    await w.wrapper.get(".ask-other-text").trigger("keydown", { key: "Enter", isComposing: true });
    await w.wrapper.get(".ask-other-text").trigger("keydown", { key: "Enter", keyCode: 229 });
    await w.wrapper.get("[data-ask-origin]").trigger("keydown", { key: "Enter", ctrlKey: true, isComposing: true });
    expect(w.answer).not.toHaveBeenCalled();
  });

  it("未回答があれば送らず、その質問を強調して知らせる。答えると強調が消える", async () => {
    const w = mountDialog();
    await open(w, ask({ questions: [{ id: "a", label: "A", options: ["x", "y"] }, { id: "t", label: "T", type: "text", required: true }], note: false }));
    expect(w.wrapper.get("[data-ask-status]").text()).toBe("未回答 2 件");
    await submitBtn(w.wrapper).trigger("click");
    expect(w.answer).not.toHaveBeenCalled();
    expect(w.wrapper.findAll(".ask-missing")).toHaveLength(2);
    expect(w.wrapper.get("[data-ask-status]").text()).toContain("選んでから決定してください");
    await w.wrapper.get('input[value="x"]').setValue(true);
    await w.wrapper.get("input.ask-text").setValue("hi");
    expect(w.wrapper.findAll(".ask-missing")).toHaveLength(0);
    await submitBtn(w.wrapper).trigger("click");
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "x", t: "hi" } });
  });

  it("「その他」: 入力すると選ばれ、答えは入力で custom に id が入る。補足は note", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    await w.wrapper.get(".ask-other-text").setValue("  自由な値  ");
    await w.wrapper.get("textarea.ask-text").setValue("  メモ  ");
    await submitBtn(w.wrapper).trigger("click");
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { ch: "自由な値", m: ["a"] }, custom: ["ch"], note: "メモ" });
  });

  it("キャンセルボタン・Esc（cancel イベント）で取り消し、ネイティブの close はさせない", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    await w.wrapper.get("[data-ask-cancel]").trigger("click");
    expect(w.cancel).toHaveBeenCalledWith("a1");
    const ev = new Event("cancel", { cancelable: true });
    w.wrapper.get("dialog").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(w.cancel).toHaveBeenCalledTimes(2);
  });

  it("送れなかったら（false）ダイアログは開いたまま、もう一度決定できる", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    w.answer.mockResolvedValueOnce(false);
    await submitBtn(w.wrapper).trigger("click");
    await nextTick();
    expect(w.store.current).not.toBeNull();
    expect(submitBtn(w.wrapper).attributes("disabled")).toBeUndefined();
    await submitBtn(w.wrapper).trigger("click");
    expect(w.answer).toHaveBeenCalledTimes(2);
  });
});

describe("AskDialog — 質問が 1 つだけ・single・note:false の即確定（D3 (l)）", () => {
  const ONE = { note: false, questions: [{ id: "a", label: "A", default: "x", options: ["x", "y", "z"] }] };

  it("直前の操作がポインタ（pointerdown）なら、選んだ時点（change）で確定する。label のカード全体のクリックも同じ", async () => {
    const w = mountDialog();
    await open(w, ask(ONE));
    await w.wrapper.get("dialog").trigger("pointerdown");
    await w.wrapper.get('input[value="y"]').setValue(true);
    expect(w.answer).toHaveBeenCalledWith("a1", { answers: { a: "y" } });
  });

  it("Space・Enter で選んだら確定する", async () => {
    for (const key of [" ", "Enter"]) {
      const w = mountDialog();
      await open(w, ask(ONE, "k"));
      await w.wrapper.get('input[value="z"]').trigger("keydown", { key });
      expect(w.answer).toHaveBeenCalledWith("k", { answers: { a: "z" } });
      w.wrapper.unmount();
      document.body.innerHTML = "";
      setActivePinia((pinia = createPinia()));
    }
  });

  it("矢印キーで移っただけ（直前の操作が keydown の change）では確定しない。ポインタの後でもキーを打てば確定しない", async () => {
    const w = mountDialog();
    await open(w, ask(ONE));
    await w.wrapper.get("dialog").trigger("pointerdown");
    await w.wrapper.get('input[value="y"]').trigger("keydown", { key: "ArrowDown" });
    await w.wrapper.get('input[value="y"]').setValue(true);
    expect(w.answer).not.toHaveBeenCalled();
  });

  it("質問が 2 つ以上・補足あり・multi・「その他」では即確定しない", async () => {
    for (const raw of [
      { note: false, questions: [{ id: "a", label: "A", options: ["x", "y"] }, { id: "b", label: "B", options: ["x"] }] },
      { questions: [{ id: "a", label: "A", options: ["x", "y"] }] },
      { note: false, questions: [{ id: "a", label: "A", type: "multi", options: ["x", "y"] }] },
    ]) {
      const w = mountDialog();
      await open(w, ask(raw));
      await w.wrapper.get("dialog").trigger("pointerdown");
      await w.wrapper.get('input[value="y"]').setValue(true);
      await w.wrapper.get('input[value="y"]').trigger("keydown", { key: " " });
      expect(w.answer).not.toHaveBeenCalled();
      w.wrapper.unmount();
      document.body.innerHTML = "";
      setActivePinia((pinia = createPinia()));
    }
  });
});

describe("AskDialog — 開き直しとキーの範囲", () => {
  it("前の質問でネイティブに閉じられていても、次の質問のために開き直し、askOpen を立て直す", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC, "a1"));
    w.store.add(ask(SPEC, "a2", "p1"));
    (w.wrapper.get("dialog").element as HTMLDialogElement).close(); // ネイティブに閉じられた
    w.view.setAskOpen(false);
    w.store.remove("a1");
    await nextTick();
    await nextTick();
    expect(w.wrapper.get("dialog").attributes("open")).toBeDefined();
    expect(w.view.askOpen).toBe(true);
  });

  it("dialog の中へ移されたトーストなど、質問の部品の外のキーでは Ctrl+Enter で決定しない", async () => {
    const w = mountDialog();
    await open(w, ask(SPEC));
    const stray = document.createElement("button");
    w.wrapper.get("dialog").element.appendChild(stray); // Teleport されたトーストの代わり
    stray.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true }));
    expect(w.answer).not.toHaveBeenCalled();
  });
});

describe("AskDialog — フォーカスの戻り先（AC-I4）", () => {
  it("質問の pane が表示中なら、閉じたらその pane の端末へ（registry.focus）", async () => {
    const w = mountDialog();
    w.view.tabId = "t1";
    await open(w, ask(SPEC));
    w.store.remove("a1");
    await nextTick();
    await nextTick();
    await nextTick();
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
    await nextTick();
    await nextTick();
    await nextTick();
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
    await nextTick();
    await nextTick();
    await nextTick();
    expect(w.registry.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(inDialog);
  });
});

describe("AskDialog — 置き直し", () => {
  it("待っている質問があるまま mount されたら（ログイン画面からの復帰等）、開いて askOpen を立てる", async () => {
    setupSession();
    const store = useAskStore();
    store.add(ask(SPEC));
    const view = useViewStore();
    const wrapper = mount(AskDialog, { attachTo: document.body, global: { plugins: [pinia], provide: { [AskControllerKey as symbol]: { answer: vi.fn(), cancel: vi.fn() } } } });
    await nextTick();
    await nextTick();
    expect(wrapper.get("dialog").attributes("open")).toBeDefined();
    expect(view.askOpen).toBe(true);
    wrapper.unmount();
    expect(view.askOpen).toBe(false);
  });
});
