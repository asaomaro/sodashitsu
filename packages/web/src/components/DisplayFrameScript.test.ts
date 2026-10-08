import type { DisplayContent, DisplayInfo } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ENGAGE_KEYUP_WAIT_MS } from "../display/engageEntry.js";
import { resetFocusOriginTracking } from "../display/focusOrigin.js";
import { engageFrame, focusFrame } from "../display/frameRegistry.js";
import { DisplayControllerKey, DisplayHostKey } from "../injection.js";
import { useDisplayStore } from "../store/display.js";
import DisplayFrame, { DISPLAY_NOTE_FOCUS_DETACHED, DISPLAY_NOTE_UNSUPPORTED } from "./DisplayFrame.vue";

/**
 * スクリプトが動く形式（`script-html`）の枠（`DisplayFrame`）の、覆い・操作の始め方・フォーカスの番・片づけ・版と形式の入れ替え。
 * 本物のブラウザでの確かめ（実際にフォーカスを取られて戻るか・`load` の回数・押下の残りが枠に届かないか）は E2E（`display-script.spec.ts`）。
 */
const info = (over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id: "d1", paneId: "p1", name: "g", kind: "panel", format: "script-html", title: "T", size: 320, rev: 1, bytes: 3, updatedAt: "x", ...over,
});
const content = (over: Partial<DisplayContent> = {}): DisplayContent => ({ id: "d1", rev: 1, format: "script-html", content: "<script>1</script>", ...over });

interface FakePort {
  sent: Record<string, unknown>[];
  onmessage: ((e: { data: unknown }) => void) | null;
}
let ports: FakePort[] = [];
const RealChannel = globalThis.MessageChannel;
let active: Element | null = null;

function setup(props: { info?: DisplayInfo; content?: DisplayContent | null; scriptCapable?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useDisplayStore();
  if (props.scriptCapable === false) store.setScriptCapable(false);
  const messageHandlers: ((d: unknown) => void)[] = [];
  const controller = {
    report: vi.fn(async () => true),
    sendAction: vi.fn(),
    ensureContent: vi.fn(async () => undefined),
    onMessage: vi.fn((_id: string, fn: (d: unknown) => void) => {
      messageHandlers.push(fn);
      return () => undefined;
    }),
  };
  const host = { focusTerminal: vi.fn(), focusSelectedTerminal: vi.fn(), injectPrefix: vi.fn(), prefixKey: () => ({ key: "b", ctrl: true, alt: false, shift: false, meta: false }) };
  const w = mount(DisplayFrame, {
    props: { info: props.info ?? info(), ...(props.content === null ? {} : { content: props.content ?? content() }) },
    global: { plugins: [pinia], provide: { [DisplayControllerKey as symbol]: controller, [DisplayHostKey as symbol]: host } },
    attachTo: document.body,
  });
  const iframe = (w.find("iframe").exists() ? w.find("iframe").element : document.createElement("iframe")) as HTMLIFrameElement;
  const win = { postMessage: vi.fn() } as unknown as Window & { postMessage: ReturnType<typeof vi.fn> };
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
  return { w, store, controller, host, iframe, win, ticket, connect, fromFrame, messageHandlers };
}

/** 親の文書で、その要素にフォーカスが移ったことにする（`focusin`）。 */
function focusOn(el: Element): void {
  active = el;
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

describe("DisplayFrame（スクリプトが動く形式）", () => {
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
          const p = {
            sent: [] as Record<string, unknown>[],
            onmessage: null as FakePort["onmessage"],
            postMessage(m: Record<string, unknown>) {
              p.sent.push(m);
            },
            close() {},
          };
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
  });

  it("専用の頁と sandbox（allow-scripts だけ）・tabindex=-1・data-display-script。覆いがある。静的な形式には覆いも data-display-script も無い", () => {
    const s = setup();
    expect(s.iframe.getAttribute("src")).toContain("/display-view/script.html?t=");
    expect(s.iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(s.iframe.getAttribute("tabindex")).toBe("-1");
    expect(s.iframe.hasAttribute("data-display-script")).toBe(true);
    expect(s.w.find("[data-display-cover]").exists()).toBe(true);
    const t = setup({ info: info({ format: "html" }), content: content({ format: "html" }) });
    expect(t.iframe.getAttribute("src")).toContain("/display-view/frame.html?t=");
    expect(t.iframe.hasAttribute("data-display-script")).toBe(false);
    expect(t.iframe.hasAttribute("tabindex")).toBe(false);
    expect(t.w.find("[data-display-cover]").exists()).toBe(false);
  });

  it("render は 1 回だけ。relayKeys は渡さない（prefix を信頼しない中身に教えない）。前の版・前の形式の中身は送らない", async () => {
    const s = setup({ content: content({ rev: 1 }) });
    const port = s.connect();
    const renders = (): Record<string, unknown>[] => port.sent.filter((m) => m["type"] === "render");
    expect(renders()).toHaveLength(1);
    expect(renders()[0]).toMatchObject({ rev: 1, format: "script-html", relayKeys: [] });
    await s.w.setProps({ content: content({ rev: 1, content: "<script>changed</script>" }) });
    expect(renders()).toHaveLength(1); // 同じ版を 2 回送らない
    // 形式の違う前の中身（html）は送らない
    const t = setup({ content: content({ format: "html" }) });
    const p2 = t.connect();
    expect(p2.sent.filter((m) => m["type"] === "render")).toHaveLength(0);
  });

  it("版が替わると枠が作り直され（別の iframe・別の合い札）、覆いが戻り、新しい版の中身を 1 回だけ送る", async () => {
    const s = setup();
    const port = s.connect();
    await s.w.find("[data-display-cover]").exists();
    s.fromFrame(port, { type: "rendered", rev: 1 });
    // 操作を始める
    focusFrame("d1");
    vi.advanceTimersByTime(ENGAGE_KEYUP_WAIT_MS);
    await nextTick();
    expect(s.w.find("[data-display-cover]").exists()).toBe(false);
    const before = s.w.find("iframe").element;
    await s.w.setProps({ info: info({ rev: 2 }), content: content({ rev: 2 }) });
    await nextTick();
    expect(s.w.find("iframe").element).not.toBe(before);
    expect(s.w.find("[data-display-cover]").exists()).toBe(true); // 操作中が解けて、新しい枠は覆いの下
    expect(s.w.find("[data-display-engaged]").attributes("data-display-engaged")).toBe("0");
    expect(s.store.focusedDisplayId).toBeNull();
  });

  it("形式の切り替え html → script-html → html: iframe が毎回別の要素・src と sandbox が形式の値・覆いが付く／外れる", async () => {
    const s = setup({ info: info({ format: "html" }), content: content({ format: "html" }) });
    const seen: Element[] = [s.w.find("iframe").element];
    expect(s.w.find("iframe").attributes("sandbox")).toBe("allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox");
    await s.w.setProps({ info: info({ format: "script-html" }), content: content() });
    seen.push(s.w.find("iframe").element);
    expect(s.w.find("iframe").attributes("sandbox")).toBe("allow-scripts");
    expect(s.w.find("iframe").attributes("src")).toContain("script.html");
    expect(s.w.find("[data-display-cover]").exists()).toBe(true);
    await s.w.setProps({ info: info({ format: "html" }), content: content({ format: "html" }) });
    seen.push(s.w.find("iframe").element);
    expect(s.w.find("iframe").attributes("src")).toContain("frame.html");
    expect(s.w.find("[data-display-cover]").exists()).toBe(false);
    expect(s.w.find("iframe").attributes("data-display-script")).toBeUndefined();
    expect(new Set(seen).size).toBe(3);
  });

  it("覆いを押しても操作は始まらず、フォーカスも動かない。［操作する］を強調する（1 秒）", async () => {
    const s = setup();
    s.connect();
    const cover = s.w.find("[data-display-cover]");
    await cover.trigger("pointerdown");
    await cover.trigger("click");
    expect(s.iframe.focus).not.toHaveBeenCalled();
    expect(s.w.find("[data-display-cover]").exists()).toBe(true);
    expect(s.store.engageHint).toBe("d1");
    vi.advanceTimersByTime(1000);
    expect(s.store.engageHint).toBeNull();
    // 枠そのものを押しても（pointerdown が親に届くとき）始まらない
    await s.w.find("iframe").trigger("click");
    expect(s.iframe.focus).not.toHaveBeenCalled();
  });

  it("覆いの上のホイールは port の scroll で枠へ伝える", async () => {
    const s = setup();
    const port = s.connect();
    await s.w.find("[data-display-cover]").trigger("wheel", { deltaX: 3, deltaY: 40, deltaMode: 0 });
    expect(port.sent).toContainEqual({ type: "scroll", dx: 3, dy: 40 });
  });

  it("［操作する］ボタン（ポインタの click）はすぐ始める。キーボード（detail 0）と prefix+i は keyup を受けてから始める", async () => {
    const s = setup();
    const port = s.connect();
    // ポインタ
    expect(engageFrame("d1", { detail: 1 })).toBe(true);
    await nextTick();
    expect(s.iframe.focus).toHaveBeenCalledTimes(1);
    expect(port.sent).toContainEqual({ type: "focus" });
    expect(s.w.find("[data-display-cover]").exists()).toBe(false);
    expect(s.store.focusedDisplayId).toBe("d1");
    // 一度終える（Esc）
    s.fromFrame(port, { type: "key", key: "escape" });
    await nextTick();
    expect(s.host.focusTerminal).toHaveBeenCalledWith("p1");
    expect(s.store.focusedDisplayId).toBeNull();
    expect(s.w.find("[data-display-cover]").exists()).toBe(true);
    // キーボードの Enter（detail 0）: keyup の前には始まらない
    (s.iframe.focus as ReturnType<typeof vi.fn>).mockClear();
    engageFrame("d1", { detail: 0 });
    expect(s.iframe.focus).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    vi.advanceTimersByTime(0);
    expect(s.iframe.focus).toHaveBeenCalledTimes(1);
    s.fromFrame(port, { type: "key", key: "escape" });
    // prefix+i
    (s.iframe.focus as ReturnType<typeof vi.fn>).mockClear();
    expect(focusFrame("d1")).toBe(true);
    expect(s.iframe.focus).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "i" }));
    vi.advanceTimersByTime(0);
    expect(s.iframe.focus).toHaveBeenCalledTimes(1);
  });

  it("枠からの key: 操作中の escape だけ受ける。prefix は操作中でも受けない。操作中でなければ escape も捨てる（端末へ動かさない・prefix にならない）", async () => {
    const s = setup();
    const port = s.connect();
    s.fromFrame(port, { type: "key", key: "escape" });
    s.fromFrame(port, { type: "key", key: "prefix" });
    expect(s.host.focusTerminal).not.toHaveBeenCalled();
    expect(s.host.injectPrefix).not.toHaveBeenCalled();
    // フォーカスを取っている最中（操作中でない）でも同じ
    active = s.iframe;
    s.fromFrame(port, { type: "key", key: "prefix" });
    s.fromFrame(port, { type: "key", key: "escape" });
    expect(s.host.injectPrefix).not.toHaveBeenCalled();
    expect(s.host.focusTerminal).not.toHaveBeenCalled();
    // 操作中
    active = document.body;
    engageFrame("d1", { detail: 1 });
    s.fromFrame(port, { type: "key", key: "prefix" });
    expect(s.host.injectPrefix).not.toHaveBeenCalled();
    expect(s.store.focusedDisplayId).toBe("d1");
    s.fromFrame(port, { type: "key", key: "escape" });
    expect(s.host.focusTerminal).toHaveBeenCalledWith("p1");
  });

  it("操作中でないのに枠がフォーカスを取ったら、元の場所へ戻し、focus_steal を 1 回知らせる。取られたままは見回りのたびに数え直さない", async () => {
    const s = setup();
    s.connect();
    const term = document.createElement("input");
    document.body.appendChild(term);
    term.focus = vi.fn(() => void (active = term));
    focusOn(term); // 元の場所を覚える
    active = s.iframe;
    s.iframe.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(term.focus).toHaveBeenCalled();
    expect(active).toBe(term);
    expect(s.controller.report).toHaveBeenCalledTimes(1);
    expect(s.controller.report).toHaveBeenCalledWith("d1", "focus_steal", { paneId: "p1", format: "script-html" });
    expect(s.w.find("iframe").exists()).toBe(true);
    // もう 1 回取る（新しい 1 回）
    active = s.iframe;
    vi.advanceTimersByTime(250);
    expect(s.controller.report).toHaveBeenCalledTimes(2);
  });

  it("戻せなかったとき（取られたまま）は、見回りが何度来ても 1 回しか知らせず、枠をこの画面から外して固定の文言と［もう一度出す］を出す", async () => {
    const s = setup();
    s.connect();
    const term = document.createElement("input");
    document.body.appendChild(term);
    term.focus = vi.fn(); // 戻らない
    s.iframe.blur = vi.fn(); // 戻らない
    s.host.focusSelectedTerminal.mockImplementation(() => undefined);
    focusOn(term);
    active = s.iframe;
    vi.advanceTimersByTime(250);
    await nextTick();
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(s.controller.report).toHaveBeenCalledTimes(1);
    expect(s.w.find("iframe").exists()).toBe(false);
    expect(s.w.find("[data-display-note]").text()).toContain(DISPLAY_NOTE_FOCUS_DETACHED);
    const before = s.w.find("[data-display-redisplay]");
    expect(before.exists()).toBe(true);
    await before.trigger("click");
    await nextTick();
    expect(s.w.find("iframe").exists()).toBe(true); // もう一度出す
    expect(s.w.find("[data-display-redisplay]").exists()).toBe(false);
  });

  it("知らせを送れない間（切断中）は、この画面の中で数え、3 回で枠を外す", async () => {
    const s = setup();
    s.connect();
    s.controller.report.mockImplementation(async () => false);
    for (let i = 0; i < 3; i++) {
      active = s.iframe;
      s.iframe.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(10); // report の Promise を回す
      active = document.body;
      vi.advanceTimersByTime(250);
    }
    await nextTick();
    expect(s.w.find("iframe").exists()).toBe(false);
    expect(s.w.find("[data-display-note]").text()).toContain(DISPLAY_NOTE_FOCUS_DETACHED);
  });

  it("知らせは画面が見えているときだけ送る", () => {
    const s = setup();
    s.connect();
    const vis = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    active = s.iframe;
    s.iframe.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(s.controller.report).not.toHaveBeenCalled();
    vis.mockRestore();
  });

  it("操作中の枠のフォーカスは取ったことにしない。操作中に focus() が呼ばれても数えない。余白を押して離れたあと、取り返したら数える", async () => {
    const s = setup();
    s.connect();
    engageFrame("d1", { detail: 1 });
    await nextTick();
    vi.advanceTimersByTime(1000);
    expect(s.controller.report).not.toHaveBeenCalled(); // 操作中
    // フォーカスを受けない余白を押す（pointerdown が親の文書で、枠でない要素に起きる）
    const margin = document.createElement("div");
    document.body.appendChild(margin);
    margin.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(s.store.focusedDisplayId).toBeNull(); // 操作中が解けた
    vi.advanceTimersByTime(1);
    // スクリプトが focus() で取り返す（activeElement は枠のまま）→ 横取りとして数える
    expect(s.controller.report).toHaveBeenCalledWith("d1", "focus_steal", { paneId: "p1", format: "script-html" });
    await nextTick();
    expect(s.w.find("[data-display-cover]").exists()).toBe(true);
  });

  it("片づけのとき、操作中でないのにフォーカスが枠にあれば、focus_steal を 1 回送ってから外す。操作中・フォーカスなしなら送らない", () => {
    const a = setup();
    a.connect();
    active = a.iframe;
    a.w.unmount();
    expect(a.controller.report).toHaveBeenCalledTimes(1);
    expect(a.controller.report).toHaveBeenCalledWith("d1", "focus_steal", { paneId: "p1", format: "script-html" });
    active = document.body;
    const b = setup();
    b.connect();
    b.w.unmount();
    expect(b.controller.report).not.toHaveBeenCalled();
    active = document.body;
    const c = setup();
    c.connect();
    engageFrame("d1", { detail: 1 });
    c.w.unmount();
    expect(c.controller.report).not.toHaveBeenCalled(); // 操作中
  });

  it("合い札の合わない合図・10 秒の時間切れでは、focus_steal も navigated も送らない（フォーカスが枠にあっても）", async () => {
    const s = setup();
    s.iframe.dispatchEvent(new Event("load"));
    window.dispatchEvent(new MessageEvent("message", { data: { type: "display-ready", t: "0".repeat(32) }, source: s.win as unknown as MessageEventSource }));
    active = s.iframe;
    s.w.unmount();
    expect(s.controller.report).not.toHaveBeenCalled();
    const t = setup();
    vi.advanceTimersByTime(10_000);
    await nextTick();
    active = t.iframe;
    t.w.unmount();
    expect(t.controller.report).not.toHaveBeenCalled();
  });

  it("load の 2 回目は必ず report(navigated)（枠の知らせに依らない）。1 回のままなら閉じない。報告は sendAction の頻度の制限に掛からない", async () => {
    const s = setup();
    s.connect();
    s.fromFrame(ports[0]!, { type: "rendered", rev: 1 });
    vi.advanceTimersByTime(5000);
    expect(s.controller.report).not.toHaveBeenCalled();
    s.iframe.dispatchEvent(new Event("load"));
    await nextTick();
    expect(s.controller.report).toHaveBeenCalledWith("d1", "navigated", { paneId: "p1", format: "script-html" });
    expect(s.w.find("iframe").exists()).toBe(false);
    expect(s.controller.sendAction).not.toHaveBeenCalled(); // 操作の経路とは別
  });

  it("枠の action は sendAction へ（rev は枠の言う値）", () => {
    const s = setup();
    const port = s.connect();
    s.fromFrame(port, { type: "action", rev: 1, action: "pick", data: { id: "3" } });
    expect(s.controller.sendAction).toHaveBeenCalledWith("d1", 1, "pick", { id: "3" });
  });

  it("display.message を port の message へ（接続した後だけ。保存しない）", () => {
    const s = setup();
    expect(s.controller.onMessage).toHaveBeenCalledWith("d1", expect.any(Function));
    const h = s.messageHandlers[0]!;
    h({ before: true }); // まだ接続していない
    const port = s.connect();
    h({ n: 1 });
    expect(port.sent.filter((m) => m["type"] === "message")).toEqual([{ type: "message", data: { n: 1 } }]);
  });

  it("スクリプトが動く形式を出せると名乗っていない画面は、枠を作らず固定の文言（スクリプトは動かない）", () => {
    const s = setup({ scriptCapable: false });
    expect(s.w.find("iframe").exists()).toBe(false);
    expect(s.w.find("[data-display-note]").text()).toBe(DISPLAY_NOTE_UNSUPPORTED);
    expect(s.w.find("[data-display-cover]").exists()).toBe(false);
    expect(s.controller.ensureContent).not.toHaveBeenCalled();
  });

  it("静的な枠: よそからフォーカスが来た（foreign-focus）ら元の場所へ戻す。直前に Tab を受けていた・こちらが移した直後は戻さない。回数には数えない", async () => {
    const s = setup({ info: info({ format: "html" }), content: content({ format: "html" }) });
    const port = s.connect();
    const term = document.createElement("input");
    document.body.appendChild(term);
    term.focus = vi.fn(() => void (active = term));
    focusOn(term);
    // 1. 兄弟のスクリプトが移した: Tab も自分の移動も無い
    active = s.iframe;
    s.fromFrame(port, { type: "foreign-focus" });
    expect(term.focus).toHaveBeenCalledTimes(1);
    expect(s.controller.report).not.toHaveBeenCalled();
    // 2. Tab で入った
    active = s.iframe;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    s.fromFrame(port, { type: "foreign-focus" });
    expect(term.focus).toHaveBeenCalledTimes(1);
    // 3. prefix+i（自分で移した）
    vi.advanceTimersByTime(1000);
    active = document.body;
    focusFrame("d1");
    active = s.iframe;
    s.fromFrame(port, { type: "foreign-focus" });
    expect(term.focus).toHaveBeenCalledTimes(1);
  });

  it("スクリプトの枠は foreign-focus を受けても何もしない", () => {
    const s = setup();
    const port = s.connect();
    active = s.iframe;
    const before = (s.iframe.blur as ReturnType<typeof vi.fn>).mock.calls.length;
    s.fromFrame(port, { type: "foreign-focus" });
    expect((s.iframe.blur as ReturnType<typeof vi.fn>).mock.calls.length).toBe(before);
  });
});
