import type { DisplayContent, DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { frameKey, framePage } from "../display/framePage.js";
import { readFrameMessage } from "../display/frameMessages.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import DisplayFrame, { DISPLAY_NOTE_UNSUPPORTED, DISPLAY_VIEW_SANDBOX } from "./DisplayFrame.vue";

const info = (over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id: "d1", paneId: "p1", name: "main", kind: "panel", format: "html", title: "T", size: 320, rev: 1, bytes: 3, updatedAt: "x", ...over,
});
const content = (over: Partial<DisplayContent> = {}): DisplayContent => ({ id: "d1", rev: 1, format: "html", content: "<p>x</p>", ...over });

/** iframe の窓の代わり（postMessage を記録する）。 */
function fakeWin() {
  return { postMessage: vi.fn() } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> };
}

function setup(props: { info?: DisplayInfo; content?: DisplayContent } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const controller = { report: vi.fn(async () => true), sendAction: vi.fn(), ensureContent: vi.fn(async () => undefined), onMessage: vi.fn(() => () => undefined) };
  const host = { focusTerminal: vi.fn(), focusSelectedTerminal: vi.fn(), injectPrefix: vi.fn(), prefixKey: () => ({ key: "b", ctrl: true, alt: false, shift: false, meta: false }) };
  const w = mount(DisplayFrame, {
    props: { info: props.info ?? info(), content: props.content },
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller, [DisplayHostKey as symbol]: host } },
    attachTo: document.body,
  });
  const iframe = (w.find("iframe").exists() ? w.find("iframe").element : document.createElement("iframe")) as HTMLIFrameElement;
  const win = fakeWin();
  Object.defineProperty(iframe, "contentWindow", { value: win, configurable: true });
  const ticket = new URL(iframe.getAttribute("src") ?? "/?t=", "http://x").searchParams.get("t")!;
  const ready = (t = ticket, source: unknown = win): void => {
    window.dispatchEvent(new MessageEvent("message", { data: { type: "display-ready", t }, source: source as MessageEventSource }));
  };
  const load = (): void => void iframe.dispatchEvent(new Event("load"));
  return { w, controller, host, iframe, win, ticket, ready, load, store: useDisplayStore() };
}

describe("framePage / frameKey / readFrameMessage", () => {
  it("静的な形式は静的な頁、script-html は専用の頁と sandbox。未知の形式は null", () => {
    for (const f of ["text", "markdown", "html"]) expect(framePage(f)).toEqual({ page: "/display-view/frame.html", sandbox: DISPLAY_VIEW_SANDBOX, kind: "static" });
    // スクリプトが動く形式は、別の頁・別の sandbox（allow-scripts だけ）。知らない形式は null
    expect(framePage("script-html")).toEqual({ page: "/display-view/script.html", sandbox: "allow-scripts", kind: "script" });
    expect(framePage("future-x")).toBeNull();
    expect(framePage("")).toBeNull();
    expect(framePage("script-html")!.sandbox).not.toContain("allow-same-origin");
    expect(DISPLAY_VIEW_SANDBOX).not.toContain("allow-same-origin");
    expect(frameKey({ id: "a", format: "html" })).toBe("a:html");
    // スクリプトが動く形式は版も入る（版が替わったら枠ごと作り直す）
    expect(frameKey({ id: "a", format: "script-html", rev: 3 })).toBe("a:script-html:3");
    expect(frameKey({ id: "a", format: "script-html", rev: 4 })).not.toBe(frameKey({ id: "a", format: "script-html", rev: 3 }));
    expect(frameKey({ id: "a", format: "html", rev: 4 })).toBe("a:html");
  });
  it("枠の知らせの検査", () => {
    expect(readFrameMessage({ type: "action", rev: 1, action: "go", data: { value: "1" } })).toEqual({ type: "action", rev: 1, action: "go", data: { value: "1" } });
    expect(readFrameMessage({ type: "action", rev: 0, action: "go" })).toBeNull();
    expect(readFrameMessage({ type: "action", rev: 1, action: "bad name" })).toBeNull();
    expect(readFrameMessage({ type: "key", key: "x" })).toBeNull();
    expect(readFrameMessage({ type: "key", key: "prefix" })).toEqual({ type: "key", key: "prefix" });
    expect(readFrameMessage({ type: "pong", n: 1.5 })).toBeNull();
    expect(readFrameMessage({ type: "failed", rev: 2 })).toEqual({ type: "failed", rev: 2 });
    expect(readFrameMessage({ type: "failed", rev: 0 })).toBeNull();
    expect(readFrameMessage(null)).toBeNull();
  });
});

describe("DisplayFrame", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("sandbox に allow-same-origin が無く、src に合い札が付く", () => {
    const s = setup();
    expect(s.iframe.getAttribute("sandbox")).toBe(DISPLAY_VIEW_SANDBOX);
    expect(s.ticket).toMatch(/^[0-9a-f]{32}$/);
    expect(s.iframe.getAttribute("src")).toContain("/display-view/frame.html?t=");
  });

  it("display-ready が load より先でも、load の前には display-init も render も送らない", async () => {
    const s = setup({ content: content() });
    s.ready();
    await nextTick();
    expect(s.win.postMessage).not.toHaveBeenCalled();
    s.load();
    expect(s.win.postMessage).toHaveBeenCalledTimes(1);
    expect(s.win.postMessage.mock.calls[0]![0]).toEqual({ type: "display-init", v: 1 });
    await nextTick();
    expect(s.iframe.getAttribute("data-display-loads")).toBe("1");
  });

  it("load が先でも、display-ready の前には送らない。中身がストアにあっても最初の load の後にしか render しない", async () => {
    const s = setup({ content: content() });
    s.load();
    expect(s.win.postMessage).not.toHaveBeenCalled();
    s.ready();
    expect(s.win.postMessage).toHaveBeenCalledTimes(1);
  });

  it("送り主の窓が違う display-ready は丸ごと無視する（待ちを打ち切らない）", () => {
    const s = setup();
    s.ready(s.ticket, fakeWin());
    s.load();
    expect(s.win.postMessage).not.toHaveBeenCalled();
    expect(s.w.find("[data-display-note]").exists()).toBe(false);
    s.ready(); // 本物が後から来れば通る
    expect(s.win.postMessage).toHaveBeenCalledTimes(1);
  });

  it("合い札の合わない display-ready（その窓から）は、通り道も中身も渡さず固定の文言。report は送らない", async () => {
    const s = setup({ content: content() });
    s.load();
    s.ready("0".repeat(32));
    await nextTick();
    expect(s.win.postMessage).not.toHaveBeenCalled();
    expect(s.w.find("[data-display-note]").exists()).toBe(true);
    expect(s.controller.report).not.toHaveBeenCalled();
  });

  it("display-ready は 1 回だけ受ける（同じ合い札の 2 回目は受けない）", () => {
    const s = setup();
    s.load();
    s.ready();
    s.ready();
    expect(s.win.postMessage).toHaveBeenCalledTimes(1);
  });

  it("10 秒待っても合図が来なければ固定の文言（知らせは送らない）", async () => {
    const s = setup();
    vi.advanceTimersByTime(10_000);
    await nextTick();
    expect(s.w.find("iframe").exists()).toBe(false);
    expect(s.w.find("[data-display-note]").exists()).toBe(true);
    expect(s.controller.report).not.toHaveBeenCalled();
  });

  it("load の 2 回目で iframe を外して report(navigated)（paneId と format つき）", async () => {
    const s = setup();
    s.load();
    s.ready();
    s.load();
    await nextTick();
    expect(s.w.find("iframe").exists()).toBe(false);
    expect(s.controller.report).toHaveBeenCalledWith("d1", "navigated", { paneId: "p1", format: "html" });
  });

  it("render は、中身の id・版・形式が見出しと一致するときだけ送る", async () => {
    const sent: { type: string; rev: number; format: string; relayKeys: unknown[] }[] = [];
    const Real = globalThis.MessageChannel;
    vi.stubGlobal(
      "MessageChannel",
      class {
        port1 = { postMessage: (m: never) => void sent.push(m), close: () => undefined, onmessage: null as unknown };
        port2 = {};
      },
    );
    try {
      const s = setup({ content: content({ rev: 1 }) });
      s.load();
      s.ready();
      expect(sent.filter((m) => m.type === "render")).toHaveLength(1); // 最初の版（一致）
      await s.w.setProps({ info: info({ rev: 2 }), content: content({ rev: 1 }) });
      expect(sent.filter((m) => m.type === "render")).toHaveLength(1); // 版が違う前の中身は送らない
      await s.w.setProps({ info: info({ rev: 2 }), content: content({ rev: 2, content: "<b>n</b>" }) });
      const renders = sent.filter((m) => m.type === "render");
      expect(renders).toHaveLength(2);
      expect(renders[1]).toMatchObject({ rev: 2, format: "html" });
      expect(renders[1]!.relayKeys).toHaveLength(1);
    } finally {
      vi.stubGlobal("MessageChannel", Real);
    }
  });

  it("枠が failed を知らせたら固定の文言を出し（枠は残る）、次の rendered で消す", async () => {
    const ports: { onmessage: ((e: { data: unknown }) => void) | null }[] = [];
    const Real = globalThis.MessageChannel;
    vi.stubGlobal(
      "MessageChannel",
      class {
        port1 = { postMessage: () => undefined, close: () => undefined, onmessage: null as ((e: { data: unknown }) => void) | null };
        port2 = {};
        constructor() {
          ports.push(this.port1);
        }
      },
    );
    try {
      const s = setup({ content: content() });
      s.load();
      s.ready();
      ports[0]!.onmessage!({ data: { type: "failed", rev: 1 } });
      await nextTick();
      expect(s.w.find("[data-display-render-failed]").exists()).toBe(true);
      expect(s.w.find("iframe").exists()).toBe(true);
      ports[0]!.onmessage!({ data: { type: "rendered", rev: 2 } });
      await nextTick();
      expect(s.w.find("[data-display-render-failed]").exists()).toBe(false);
    } finally {
      vi.stubGlobal("MessageChannel", Real);
    }
  });

  it("見回り: 見えている間に 10 秒返事が無ければ report(unresponsive)。見えていない間は数えない", async () => {
    const s = setup();
    s.load();
    s.ready();
    const vis = vi.spyOn(document, "visibilityState", "get");
    vis.mockReturnValue("hidden");
    vi.advanceTimersByTime(30_000);
    expect(s.controller.report).not.toHaveBeenCalled();
    vis.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(8_000);
    expect(s.controller.report).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4_000);
    await nextTick();
    expect(s.controller.report).toHaveBeenCalledWith("d1", "unresponsive", { paneId: "p1", format: "html" });
    vis.mockRestore();
  });

  it("未知の形式は枠を作らず固定の文言。形式が替わると iframe が別の要素になる", async () => {
    const s = setup({ info: info({ format: "future-x" }) });
    expect(s.w.find("iframe").exists()).toBe(false);
    expect(s.w.find("[data-display-note]").text()).toBe(DISPLAY_NOTE_UNSUPPORTED);
    expect(s.controller.ensureContent).not.toHaveBeenCalled();
    const t = setup({ info: info({ format: "html" }) });
    const before = t.w.find("iframe").element;
    await t.w.setProps({ info: info({ format: "markdown" }) });
    expect(t.w.find("iframe").element).not.toBe(before);
    await t.w.setProps({ info: info({ format: "future-x" }) });
    expect(t.w.find("iframe").exists()).toBe(false);
  });

  it("接続が切れて台帳を空にしたとき（store.clear）も、フォーカスのある枠は端末へ戻す", async () => {
    const s = setup();
    s.store.upsert(info());
    s.store.setFocused("d1");
    s.store.clear();
    s.w.unmount();
    expect(s.host.focusTerminal).toHaveBeenCalledWith("p1");
    expect(s.store.focusedDisplayId).toBeNull();
  });

  it("フォーカスのある枠が外れたら端末へ戻す", async () => {
    const s = setup();
    s.store.setFocused("d1");
    s.w.unmount();
    expect(s.host.focusTerminal).toHaveBeenCalledWith("p1");
    expect(s.store.focusedDisplayId).toBeNull();
  });
});
