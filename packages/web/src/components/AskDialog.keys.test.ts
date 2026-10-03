import { describe, expect, it, vi } from "vitest";
import type { AskPending, AskSpec } from "@sodashitsu/protocol";
import type { AskFormElement } from "../ask/askFormElement.js";
import {
  PAGED,
  SPEC,
  UNSUPPORTED_TOAST,
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
  settle,
  shadow,
  shownQuestions,
} from "./askDialogTestKit.js";

/** 枠が取り次ぐキー（固定の行にフォーカスがあるとき）と、部品が描けない定義。共通の土台は `askDialogTestKit.ts`。 */

installAskDialogHooks();

describe("AskDialog — 枠が取り次ぐキー（固定の行にフォーカスがあるとき。AC-I3）", () => {
  it("固定の行での Alt+PageDown・Alt+PageUp は、部品の step(1)・step(-1) でページを移す（preventDefault される）。端のページでは移らない", async () => {
    const w = mountDialog();
    const step = vi.spyOn(formProto(), "step");
    await open(w, ask(PAGED));
    // 部品のボタンは押さない（公開のメソッドで移る）。
    const clicks = vi.fn();
    inForm(w, "[data-ask-next]").addEventListener("click", clicks);
    inForm(w, "[data-ask-prev]").addEventListener("click", clicks);
    expect(currentPage(w)).toBe("1");
    expect(key(origin(w), { key: "PageDown", altKey: true }).defaultPrevented).toBe(true);
    expect(step.mock.calls).toEqual([[1]]);
    expect(currentPage(w)).toBe("2");
    expect(shownQuestions(w)).toEqual(["b"]);
    // 部品は、移った先のページの見出しへフォーカスを移す（固定の行から外れる）。
    expect(focusedInForm(w)).toBe(inForm(w, '[data-ask-page="2"]'));
    origin(w).focus();
    expect(key(origin(w), { key: "PageUp", altKey: true }).defaultPrevented).toBe(true);
    expect(step.mock.calls).toEqual([[1], [-1]]);
    expect(currentPage(w)).toBe("1");
    // 最初のページでは戻れない——何も起きないが、ブラウザの既定の動きは止める。
    origin(w).focus();
    expect(key(origin(w), { key: "PageUp", altKey: true }).defaultPrevented).toBe(true);
    expect(currentPage(w)).toBe("1");
    expect(document.activeElement).toBe(origin(w));
    // 最後のページでは進めない。
    for (const page of ["2", "3", "3"]) {
      origin(w).focus();
      expect(key(origin(w), { key: "PageDown", altKey: true }).defaultPrevented).toBe(true);
      expect(currentPage(w)).toBe(page);
    }
    expect(document.activeElement).toBe(origin(w)); // 移らなかったときは、フォーカスも動かない
    expect(clicks).not.toHaveBeenCalled();
    expect(w.answer).not.toHaveBeenCalled();
  });

  it("質問が 1 つも出ていないページは飛ばす（部品の step の決まり）", async () => {
    const w = mountDialog();
    const questions = PAGED.questions.map((q) => (q.id === "b" ? { ...q, showIf: { a: "y" } } : q));
    await open(w, ask({ ...PAGED, questions }));
    key(origin(w), { key: "PageDown", altKey: true });
    expect(currentPage(w)).toBe("3"); // b は隠れている（a は x）
    expect(shownQuestions(w)).toEqual(["c"]);
    origin(w).focus();
    key(origin(w), { key: "PageUp", altKey: true });
    expect(currentPage(w)).toBe("1");
    // b を出すと、飛ばさない。
    pointerPick(input(w, '[data-ask-question="a"] input[value="y"]'));
    origin(w).focus();
    key(origin(w), { key: "PageDown", altKey: true });
    expect(currentPage(w)).toBe("2");
  });

  it("1 枚の定義では、固定の行での Alt+PageDown は何もしない", async () => {
    const w = mountDialog();
    const step = vi.spyOn(formProto(), "step");
    await open(w, ask(SPEC));
    expect(key(origin(w), { key: "PageDown", altKey: true }).defaultPrevented).toBe(true);
    expect(step).toHaveBeenCalledOnce();
    expect(form(w).pageCount).toBe(1);
    expect(document.activeElement).toBe(origin(w));
  });

  it("部品の中のキーは部品だけが扱う（枠と二重に効かない）: 部品の中の Alt+PageDown で進むのは 1 ページ", async () => {
    const w = mountDialog();
    await open(w, ask(PAGED));
    const seen = vi.fn();
    w.wrapper.get("dialog").element.addEventListener("keydown", seen);
    const ev = key(input(w, '[data-ask-question="a"] input[value="x"]'), {
      key: "PageDown",
      altKey: true,
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(currentPage(w)).toBe("2");
    expect(seen).not.toHaveBeenCalled(); // 部品が外へ流さない
    key(input(w, '[data-ask-question="b"] input[value="x"]'), { key: "Enter", ctrlKey: true });
    expect(w.answer).toHaveBeenCalledOnce();
  });

  it("部品が扱わずに流したキー（target は <ask-form>）では、枠は何もしない", async () => {
    const w = mountDialog();
    await open(w, ask(PAGED));
    // 部品の要素から出たように見えるキー（部品のリスナーを通らない形で、枠の判定だけを確かめる）。
    const ev = new KeyboardEvent("keydown", {
      key: "PageDown",
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(ev, "target", { value: form(w) });
    w.wrapper.get("dialog").element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
    expect(currentPage(w)).toBe("1");
  });

  it("dialog の中へ移されたトーストなど、固定の行の外のキーでは Ctrl+Enter で決定せず、ページも移らない", async () => {
    const w = mountDialog();
    const step = vi.spyOn(formProto(), "step");
    await open(w, ask(PAGED));
    const stray = document.createElement("button");
    w.wrapper.get("dialog").element.appendChild(stray); // Teleport されたトーストの代わり
    expect(key(stray, { key: "Enter", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(stray, { key: "PageDown", altKey: true }).defaultPrevented).toBe(false);
    expect(step).not.toHaveBeenCalled();
    expect(w.answer).not.toHaveBeenCalled();
    expect(currentPage(w)).toBe("1");
  });
});

describe("AskDialog — 部品が描けない定義（AC15）", () => {
  /** 検査（`normalizeAskSpec`）を通らずに届いた、部品の知らない型の定義。 */
  const broken = (askId = "a1"): AskPending => ({
    askId,
    paneId: "p1",
    spec: {
      title: "題",
      submit: "決定",
      note: false,
      questions: [{ id: "secret-id", label: "X", type: "matrix", options: [] }],
    } as unknown as AskSpec,
  });

  it("取り消して（answer は呼ばない）、固定の文言のトーストで知らせる。理由（定義に由来する文字列）は画面に出さず console.warn へ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const w = mountDialog();
    await open(w, broken());
    expect(w.cancel).toHaveBeenCalledOnce();
    expect(w.cancel).toHaveBeenCalledWith("a1");
    expect(w.answer).not.toHaveBeenCalled();
    expect(w.view.toasts.map((t) => t.message)).toEqual([UNSUPPORTED_TOAST]);
    // 部品にボタンは無い（利用者は答えられない）。固定の行からの Ctrl+Enter でも送らない。
    expect(shadow(w).querySelector("[data-ask-submit], [data-ask-cancel]")).toBeNull();
    key(origin(w), { key: "Enter", ctrlKey: true });
    expect(w.answer).not.toHaveBeenCalled();
    const shown = `${w.wrapper.get("dialog").element.textContent}${shadow(w).textContent}${JSON.stringify(w.view.toasts)}`;
    expect(shown).not.toContain("matrix");
    expect(shown).not.toContain("secret-id");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]![0])).toContain("matrix");
    expect(form(w).style.height).toBe("");
  });

  it("描けない定義を入れた直後（ask-unsupported が届く前）に先頭の質問が替わっても、取り消すのは描けなかった質問（次の質問ではない）", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const w = mountDialog();
    // 部品は `ask-unsupported` をマイクロタスクで遅らせて出す。定義が入った直後（その前）に、一覧が置き換わって先頭が替わる（接続し直した等）。
    const original = Object.getOwnPropertyDescriptor(formProto(), "spec")?.set;
    if (!original) throw new Error("spec の setter が無い");
    let swapped = false;
    vi.spyOn(formProto(), "spec", "set").mockImplementation(function (
      this: AskFormElement,
      value: unknown,
    ) {
      original.call(this, value);
      if (swapped) return;
      swapped = true;
      w.store.replaceAll([ask(SPEC, "a2"), broken("a1")]);
    });
    await open(w, broken("a1"));
    expect(swapped).toBe(true);
    expect(w.store.current?.askId).toBe("a2");
    expect(w.cancel).toHaveBeenCalledOnce();
    expect(w.cancel).toHaveBeenCalledWith("a1");
    // 替わった先頭の質問（描ける）は、取り消されずに出ている。
    expect(inForm(w, "[data-ask-title]").textContent).toBe("配布先");
    expect(shadow(w).querySelector("[data-ask-submit]")).not.toBeNull();
  });

  it("質問が無くなった後に ask-unsupported が遅れて届いても、古い質問を取り消さず、トーストも出さない", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const w = mountDialog();
    await open(w, ask(SPEC, "a1"));
    const el = form(w); // 質問が無くなると部品は DOM から外れるので、先に取っておく（外れた要素でもリスナーは残る）
    w.store.remove("a1");
    await settle();
    expect(w.store.current).toBeNull();
    el.dispatchEvent(new CustomEvent("ask-unsupported", { detail: { reason: "late" } }));
    expect(w.cancel).not.toHaveBeenCalled();
    expect(w.view.toasts).toEqual([]);
  });

  it("対照: 描ける定義では取り消さず、トーストも出さない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const w = mountDialog();
    await open(w, ask(SPEC));
    expect(w.cancel).not.toHaveBeenCalled();
    expect(w.view.toasts).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("定義を写せなかった（structuredClone が投げた）ときも同じ扱い。前の質問の中身を残さない", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const w = mountDialog();
    await open(w, ask(SPEC, "a1"));
    w.store.add(ask(SPEC, "a2"));
    // 定義の写しだけを失敗させる（happy-dom も `getComputedStyle` の中で structuredClone を使う）。
    const clone = globalThis.structuredClone;
    vi.spyOn(globalThis, "structuredClone").mockImplementation(
      (value: unknown, options?: StructuredSerializeOptions) => {
        if (value !== null && typeof value === "object" && "questions" in value)
          throw new Error("could not be cloned");
        return clone(value, options);
      },
    );
    w.store.remove("a1");
    await settle();
    expect(w.cancel).toHaveBeenCalledOnce();
    expect(w.cancel).toHaveBeenCalledWith("a2");
    expect(w.answer).not.toHaveBeenCalled();
    expect(w.view.toasts.map((t) => t.message)).toEqual([UNSUPPORTED_TOAST]);
    expect(shadow(w).querySelector("[data-ask-question], [data-ask-submit]")).toBeNull();
    expect(form(w).style.height).toBe("");
    expect(warn).toHaveBeenCalledOnce();
  });
});
