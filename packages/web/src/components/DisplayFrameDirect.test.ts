import { DEFAULT_KEYMAP, type Action } from "@sodashitsu/client-core";
import type { DisplayContent, DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { resetFocusOriginTracking } from "../display/focusOrigin.js";
import { stopFocusDropWatch } from "../display/focusDrop.js";
import { scriptFramesSnapshot, unregisterScriptFrame } from "../display/frameRegistry.js";
import { RELAY_ACTION_MAX } from "../display/prefixRelay.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import DisplayFrame from "./DisplayFrame.vue";

/**
 * アプリタブのメイン画面（`main` ＋ 拡張が出した script の面）の枠。覆いなし・開いた時点で操作中・`Esc` は抜けない・prefix の中継（許可表の操作だけ）。
 * 本物のブラウザでの確かめ（キーが枠へ届く・フォーカスが端末に無い）は E2E（`app-view-direct.spec.ts`）。
 */
const ext = { type: "extension", id: "demo", scope: "user" } as const;
const info = (over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id: "d1", paneId: "p1", name: "app", kind: "panel", format: "script-html", title: "T", size: 320, rev: 1, bytes: 3, updatedAt: "x", source: ext, ...over,
});
const content = (): DisplayContent => ({ id: "d1", rev: 1, format: "script-html", content: "<script>1</script>" });

interface FakePort {
  sent: Record<string, unknown>[];
  onmessage: ((e: { data: unknown }) => void) | null;
}
let ports: FakePort[] = [];
const RealChannel = globalThis.MessageChannel;
let active: Element | null = null;

function setup(props: { info?: DisplayInfo; main?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDisplayStore();
  useSettingsStore().displayScriptEnabled = true;
  const controller = {
    report: vi.fn(async () => true),
    sendAction: vi.fn(),
    ensureContent: vi.fn(async () => undefined),
    onMessage: vi.fn(() => () => undefined),
  };
  const run = vi.fn<(a: Action) => void>();
  const host = {
    focusTerminal: vi.fn(),
    focusSelectedTerminal: vi.fn(),
    injectPrefix: vi.fn(),
    prefixKey: () => ({ key: "b", ctrl: true, alt: false, shift: false, meta: false }),
    relayKeymap: () => DEFAULT_KEYMAP,
    runRelayedAction: run,
  };
  const w = mount(DisplayFrame, {
    props: { info: props.info ?? info(), content: content(), ...(props.main === false ? {} : { main: true }) },
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller, [DisplayHostKey as symbol]: host } },
    attachTo: document.body,
  });
  const iframe = w.find("iframe").element as HTMLIFrameElement;
  const win = { postMessage: vi.fn() } as unknown as Window;
  Object.defineProperty(iframe, "contentWindow", { value: win, configurable: true });
  iframe.focus = vi.fn(() => void (active = iframe));
  iframe.blur = vi.fn(() => void (active = document.body));
  const ticket = new URL(iframe.getAttribute("src") ?? "/?t=", "http://x").searchParams.get("t")!;
  const connect = (): FakePort => {
    iframe.dispatchEvent(new Event("load"));
    window.dispatchEvent(new MessageEvent("message", { data: { type: "display-ready", t: ticket }, source: win as unknown as MessageEventSource }));
    return ports[ports.length - 1]!;
  };
  const fromFrame = (port: FakePort, data: unknown): void => port.onmessage!({ data });
  return { w, store, controller, host, run, iframe, connect, fromFrame };
}
const renderOf = (p: FakePort): Record<string, unknown> | undefined => p.sent.find((m) => m["type"] === "render");

describe("DisplayFrame（アプリタブのメイン画面）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ports = [];
    active = document.body;
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => active);
    vi.stubGlobal(
      "MessageChannel",
      class {
        port1: FakePort & { postMessage(m: Record<string, unknown>): void; close(): void };
        port2 = {};
        constructor() {
          const p = { sent: [] as Record<string, unknown>[], onmessage: null as FakePort["onmessage"], postMessage(m: Record<string, unknown>) { p.sent.push(m); }, close() {} };
          this.port1 = p;
          ports.push(p);
        }
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.stubGlobal("MessageChannel", RealChannel);
    document.body.innerHTML = "";
    resetFocusOriginTracking();
    for (const f of scriptFramesSnapshot()) unregisterScriptFrame(f.id);
    stopFocusDropWatch();
  });

  it("A: 覆いが無く、接続したら枠へフォーカスして操作中。render は direct と prefix の中継を伝える", async () => {
    const s = setup();
    expect(s.w.find("[data-display-cover]").exists()).toBe(false);
    const port = s.connect();
    await nextTick();
    expect(s.iframe.focus).toHaveBeenCalled();
    expect(port.sent).toContainEqual({ type: "focus" });
    expect(s.w.find("[data-display-engaged]").attributes("data-display-engaged")).toBe("1");
    expect(s.w.find("[data-display-direct]").exists()).toBe(true);
    expect(renderOf(port)).toMatchObject({ direct: true, relayKeys: [{ key: "b", ctrl: true }] });
    expect(s.controller.report).not.toHaveBeenCalled();
  });

  // 負の対照（C）: 同じ拡張の面でも、パネル・帯・浮いた窓（main を渡さない置き場所）は今どおり覆いと［操作する］。
  it("C: main を渡さない置き場所（パネル等）は、拡張の面でも覆いがあり、自動では操作中にならず、direct も relayKeys も渡さない", () => {
    const s = setup({ main: false });
    expect(s.w.find("[data-display-cover]").exists()).toBe(true);
    const port = s.connect();
    expect(s.iframe.focus).not.toHaveBeenCalled();
    expect(s.w.find("[data-display-direct]").exists()).toBe(false);
    expect(renderOf(port)).toMatchObject({ relayKeys: [] });
    expect(renderOf(port)).not.toHaveProperty("direct");
  });

  // 負の対照: pane のプログラムが同じ名前の面を出しても（source が付かない）、main の置き場所でも A は効かない。
  it.each([
    ["source が無い（pane のプログラムの面）", undefined],
    ["builtin", { type: "builtin", id: "workspace" }],
    ["形の違う source", { type: "extension", id: "../x", scope: "user" }],
  ])("pane のプログラムの面は main でも覆いがあり、自動で操作中にならない: %s", (_n, source) => {
    const i = info();
    if (source === undefined) delete i.source;
    else Object.assign(i, { source });
    const s = setup({ info: i });
    expect(s.w.find("[data-display-cover]").exists()).toBe(true);
    const port = s.connect();
    expect(s.iframe.focus).not.toHaveBeenCalled();
    expect(s.w.find("[data-display-direct]").exists()).toBe(false);
    expect(renderOf(port)).toMatchObject({ relayKeys: [] });
    expect(renderOf(port)).not.toHaveProperty("direct");
  });

  it("版が替わっての作り直しでは、利用者が枠の外で打っているなら、フォーカスを奪わない（最初の接続は操作中にする）", async () => {
    const s = setup();
    s.connect();
    expect(s.iframe.focus).toHaveBeenCalledTimes(1);
    const input = document.createElement("input");
    document.body.appendChild(input);
    active = input; // 利用者が別の入力欄で打っている
    await s.w.setProps({ info: info({ rev: 2 }), content: { ...content(), rev: 2 } });
    const iframe2 = s.w.find("iframe").element as HTMLIFrameElement;
    iframe2.focus = vi.fn();
    Object.defineProperty(iframe2, "contentWindow", { value: { postMessage: vi.fn() }, configurable: true });
    const t = new URL(iframe2.getAttribute("src") ?? "/?t=", "http://x").searchParams.get("t")!;
    iframe2.dispatchEvent(new Event("load"));
    window.dispatchEvent(new MessageEvent("message", { data: { type: "display-ready", t }, source: iframe2.contentWindow as unknown as MessageEventSource }));
    expect(iframe2.focus).not.toHaveBeenCalled();
  });

  it("S2: 新しいインスタンスの最初の接続でも、枠の外の入力欄で打っている・ダイアログが開いているときは奪わない", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    active = input;
    const s = setup();
    s.connect();
    expect(s.iframe.focus).not.toHaveBeenCalled();
    const dlg = document.createElement("dialog");
    const btn = document.createElement("button");
    dlg.appendChild(btn);
    document.body.appendChild(dlg);
    active = btn;
    const s2 = setup();
    s2.connect();
    expect(s2.iframe.focus).not.toHaveBeenCalled();
    active = document.body;
    const s3 = setup();
    useViewStore().openDialog = "confirm" as never; // setup が作った pinia がいまの有効なもの
    s3.connect();
    expect(s3.iframe.focus).not.toHaveBeenCalled();
  });

  it("S2: 端末の入力口（xterm）や、ボタンにフォーカスがあるとき（タブを開く・選ぶ操作）は今までどおり取る", () => {
    const ta = document.createElement("textarea");
    ta.className = "xterm-helper-textarea";
    document.body.appendChild(ta);
    active = ta;
    const s = setup();
    s.connect();
    expect(s.iframe.focus).toHaveBeenCalledTimes(1);
  });

  it("B: Esc の知らせでは操作を終えず、端末へフォーカスも移さない", async () => {
    const s = setup();
    const port = s.connect();
    await nextTick();
    s.fromFrame(port, { type: "key", key: "escape" });
    await nextTick();
    expect(s.host.focusTerminal).not.toHaveBeenCalled();
    expect(s.w.find("[data-display-engaged]").attributes("data-display-engaged")).toBe("1");
  });

  it("B: 枠が自分でフォーカスを持っても（利用者が枠を押した）「取った」にならず、サーバへ知らせない", async () => {
    const s = setup();
    s.connect();
    await nextTick();
    active = document.body; // 利用者が余白を押して、操作中が終わった
    window.dispatchEvent(new FocusEvent("blur"));
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(s.w.find("[data-display-engaged]").attributes("data-display-engaged")).toBe("0");
    active = s.iframe; // 枠を押した
    window.dispatchEvent(new FocusEvent("blur"));
    vi.advanceTimersByTime(300);
    await nextTick();
    expect(s.w.find("[data-display-engaged]").attributes("data-display-engaged")).toBe("1");
    expect(s.controller.report).not.toHaveBeenCalled();
  });

  it("B: prefix → n の中継で、許可表の操作（タブの切り替え）を実行し、待ちの終わりを枠へ返す", () => {
    const s = setup();
    const port = s.connect();
    s.fromFrame(port, { type: "key", key: "prefix" });
    expect(port.sent.at(-1)).toEqual({ type: "prefix-state", pending: true });
    expect(s.run).not.toHaveBeenCalled();
    s.fromFrame(port, { type: "prefix-key", input: { key: "n", code: "KeyN", ctrl: false, alt: false, shift: false, meta: false } });
    expect(s.run).toHaveBeenCalledExactlyOnceWith({ type: "tabDelta", delta: 1 });
    expect(port.sent.at(-1)).toEqual({ type: "prefix-state", pending: false });
  });

  // 偽った知らせ: 枠のスクリプトが port へ好きな知らせを送っても、許可表の外の操作は起きない。
  it("偽の知らせ: 閉じる・分割・新規・prefix の二度押しは、中継しても実行しない", () => {
    const s = setup();
    const port = s.connect();
    for (const input of [
      { key: "X", code: "", ctrl: false, alt: false, shift: true, meta: false }, // タブを閉じる
      { key: "v", code: "", ctrl: false, alt: false, shift: false, meta: false }, // 分割
      { key: "c", code: "", ctrl: false, alt: false, shift: false, meta: false }, // 新規タブ
      { key: "x", code: "", ctrl: false, alt: false, shift: false, meta: false }, // pane を閉じる
      { key: "b", code: "", ctrl: true, alt: false, shift: false, meta: false }, // 端末へ prefix を送る
    ]) {
      s.fromFrame(port, { type: "key", key: "prefix" });
      s.fromFrame(port, { type: "prefix-key", input });
    }
    expect(s.run).not.toHaveBeenCalled();
  });

  it("偽の知らせ: prefix 無しの prefix-key・形の違う知らせは何も起こさない", () => {
    const s = setup();
    const port = s.connect();
    s.fromFrame(port, { type: "prefix-key", input: { key: "n", code: "", ctrl: false, alt: false, shift: false, meta: false } });
    s.fromFrame(port, { type: "key", key: "prefix" });
    s.fromFrame(port, { type: "prefix-key", input: { key: 5 } });
    s.fromFrame(port, { type: "prefix-key" });
    expect(s.run).not.toHaveBeenCalled();
  });

  it("偽の知らせ: 連打しても、1 秒に実行できる操作は上限まで", () => {
    const s = setup();
    const port = s.connect();
    for (let i = 0; i < 40; i++) {
      s.fromFrame(port, { type: "key", key: "prefix" });
      s.fromFrame(port, { type: "prefix-key", input: { key: "n", code: "", ctrl: false, alt: false, shift: false, meta: false } });
    }
    expect(s.run.mock.calls.length).toBeLessThanOrEqual(RELAY_ACTION_MAX);
    expect(s.run.mock.calls.length).toBeGreaterThan(0);
  });

  it("main でない置き場所では、prefix の知らせ（偽でも）を中継しない", () => {
    const s = setup({ main: false });
    const port = s.connect();
    s.fromFrame(port, { type: "key", key: "prefix" });
    s.fromFrame(port, { type: "prefix-key", input: { key: "n", code: "", ctrl: false, alt: false, shift: false, meta: false } });
    expect(s.run).not.toHaveBeenCalled();
  });
});
