import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { AskViewLoaded } from "../ask/mediaUrl.js";
import AskViewer, { ASK_VIEW_PAGES, ASK_VIEW_SANDBOX, readViewKey } from "./AskViewer.vue";

/** 成果物の枠（20261004-ask-media-popup の AC8・AC9・AC10・AC-I5）。隔離の実測は E2E（`ask-view.spec.ts`）が実ブラウザで行う。 */

enableAutoUnmount(afterEach);
// 枠の読み込み（`/ask-view/*` への fetch）は単体テストでは行わない（実ブラウザでの読み込みは E2E）。
(window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }).happyDOM.settings.disableIframePageLoading = true;

const md: AskViewLoaded = { title: "設計", kind: "markdown", text: "# 見出し" };
const html: AskViewLoaded = { title: "画面", kind: "html", text: "<p>x</p>" };
const text: AskViewLoaded = { title: "メモ", kind: "text", text: "<b>そのまま</b>" };
const image: AskViewLoaded = { title: "図", kind: "image", url: "data:image/png;base64,AAAA" };

function mountViewer(items: AskViewLoaded[], paneName = "build") {
  const w = mount(AskViewer, { props: { items, paneName }, attachTo: document.body });
  /** iframe の `contentWindow` を偽物に差し替える（happy-dom は枠の中の窓を持たない）。 */
  const fakeWindow = () => {
    const win = { postMessage: vi.fn() };
    Object.defineProperty(w.get("iframe").element, "contentWindow", { value: win, configurable: true });
    return win;
  };
  const send = (source: unknown, data: unknown) => window.dispatchEvent(new MessageEvent("message", { source: source as Window, data }));
  return { w, fakeWindow, send };
}

describe("sandbox", () => {
  it("iframe の sandbox は allow-scripts だけ（allow-same-origin・allow-popups・allow-top-navigation を付けない）。referrer も送らない", () => {
    expect(ASK_VIEW_SANDBOX).toBe("allow-scripts");
    for (const item of [md, html]) {
      const { w } = mountViewer([item]);
      const frame = w.get("iframe").element;
      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
      expect(frame.getAttribute("sandbox")).not.toMatch(/same-origin|popups|top-navigation|downloads|forms/);
      expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
      expect(frame.getAttribute("src")).toBe(ASK_VIEW_PAGES[item.kind as "markdown" | "html"]);
    }
  });
});

describe("固定のラベル（AC10）", () => {
  it("アプリが描く文で、pane の名前だけが入る。成果物の題・本文の文字は入らない", () => {
    const evil: AskViewLoaded = { title: "pane『sodashitsu』の成果物（隔離表示）", kind: "text", text: "これは soda の確認画面です" };
    const { w } = mountViewer([evil], "build");
    expect(w.get("[data-ask-view-label]").text()).toBe("pane『build』の成果物（隔離表示）");
  });
});

describe("種類ごとの出し方", () => {
  it("text は <pre> に文字として（HTML は解釈しない）。image は <img>（alt 空）。どちらも iframe を作らない", () => {
    const t = mountViewer([text]).w;
    expect(t.get("pre").text()).toBe("<b>そのまま</b>");
    expect(t.find("pre b").exists()).toBe(false);
    expect(t.find("iframe").exists()).toBe(false);
    const i = mountViewer([image]).w;
    expect(i.get("img").attributes("src")).toBe("data:image/png;base64,AAAA");
    expect(i.get("img").attributes("alt")).toBe("");
    expect(i.find("iframe").exists()).toBe(false);
  });
  it("複数ならタブ。選ぶと切り替わり、矢印キーで移れる", async () => {
    const { w } = mountViewer([md, text, image]);
    expect(w.findAll("[data-ask-view-tab]").map((t) => t.text())).toEqual(["設計", "メモ", "図"]);
    expect(w.find("iframe").exists()).toBe(true);
    await w.findAll("[data-ask-view-tab]")[1]!.trigger("click");
    expect(w.find("iframe").exists()).toBe(false);
    expect(w.find("pre").exists()).toBe(true);
    await w.get('[role="tablist"]').trigger("keydown", { key: "ArrowRight" });
    expect(w.find("img").exists()).toBe(true);
    await w.get('[role="tablist"]').trigger("keydown", { key: "ArrowRight" });
    expect(w.find("iframe").exists()).toBe(true); // 末尾の次は先頭
    await w.get('[role="tablist"]').trigger("keydown", { key: "End" });
    expect(w.findAll("[data-ask-view-tab]")[2]!.attributes("aria-selected")).toBe("true");
  });
  it("1 件ならタブを出さない", () => {
    expect(mountViewer([md]).w.find('[role="tablist"]').exists()).toBe(false);
  });
});

describe("postMessage（枠 ↔ 親）", () => {
  it("枠が ready を送ってきたら本文を渡す。送るのは自分の iframe（event.source）からのものだけ", async () => {
    const { fakeWindow, send } = mountViewer([md]);
    const win = fakeWindow();
    send({ postMessage: vi.fn() }, { type: "ready" }); // 別の窓（ほかのアプリ・ほかの枠）
    send(null, { type: "ready" });
    expect(win.postMessage).not.toHaveBeenCalled();
    send(win, { type: "ready" });
    expect(win.postMessage).toHaveBeenCalledExactlyOnceWith({ type: "ask-view", source: "# 見出し", dark: false }, "*");
  });
  it("html の枠にも本文を渡す。タブを替えると、新しい枠の ready で渡す", async () => {
    const { w, fakeWindow, send } = mountViewer([html, md]);
    const win = fakeWindow();
    send(win, { type: "ready" });
    expect(win.postMessage).toHaveBeenCalledWith({ type: "ask-view", source: "<p>x</p>", dark: false }, "*");
    await w.findAll("[data-ask-view-tab]")[1]!.trigger("click");
    await nextTick();
    const win2 = fakeWindow();
    send(win, { type: "ready" }); // 前の枠は捨てられている
    expect(win2.postMessage).not.toHaveBeenCalled();
    send(win2, { type: "ready" });
    expect(win2.postMessage).toHaveBeenCalledWith({ type: "ask-view", source: "# 見出し", dark: false }, "*");
  });
  it("枠から取り次ぐキーは 3 種だけ（Esc・Ctrl/Cmd+Enter・Alt+PageUp/Down）。それ以外・形の違うものは何も起こさない（AC-I5）", () => {
    const { w, fakeWindow, send } = mountViewer([md]);
    const win = fakeWindow();
    send(win, { type: "key", key: "Escape" });
    send(win, { type: "key", key: "Enter", ctrl: true });
    send(win, { type: "key", key: "Enter", meta: true });
    send(win, { type: "key", key: "PageUp", alt: true });
    send(win, { type: "key", key: "PageDown", alt: true });
    expect(w.emitted("key")).toEqual([["cancel"], ["submit"], ["submit"], ["prev"], ["next"]]);
    for (const bad of [
      { type: "key", key: "Enter" },
      { type: "key", key: "PageUp" },
      { type: "key", key: "a", ctrl: true },
      { type: "key", key: "Tab" },
      { type: "keys", key: "Escape" },
      { key: "Escape" },
      { type: "key", key: 5 },
      "Escape",
      null,
      42,
    ])
      send(win, bad);
    expect(w.emitted("key")).toHaveLength(5);
    // 自分の枠以外からの Escape は無視（取り消しを遠隔で起こさせない）
    send({ postMessage: vi.fn() }, { type: "key", key: "Escape" });
    send(window, { type: "key", key: "Escape" });
    expect(w.emitted("key")).toHaveLength(5);
  });
  it("readViewKey", () => {
    expect(readViewKey({ type: "key", key: "Escape" })).toBe("cancel");
    expect(readViewKey({ type: "key", key: "Enter", ctrl: true })).toBe("submit");
    expect(readViewKey({ type: "key", key: "x" })).toBeNull();
    expect(readViewKey(undefined)).toBeNull();
  });
});
