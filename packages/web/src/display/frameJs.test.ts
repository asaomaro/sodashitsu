import frameSource from "../../public/display-view/frame.js?raw";
import linksSource from "../../public/ask-view/links.js?raw";
import sanitizeSource from "../../public/display-view/sanitize.js?raw";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 静的な形式の枠のスクリプト（`public/display-view/frame.js`。枠の中で動くものと同じファイル）を、偽の `parent`・`window`・port で動かす。
 * 親からの `display-init`（port）→ `render` → 枠の返事、`click`・`submit`・`Esc`、`format` が静的でない `render` の拒否を見る。
 */
interface FakePort {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

function boot(search = "?t=ticket123") {
  document.body.innerHTML = "";
  const links: { exports: unknown } = { exports: {} };
  new Function("module", linksSource)(links);
  const self: Record<string, unknown> = { askViewLinks: links.exports, marked: { parse: (s: string) => `<h1>${s}</h1>` } };
  new Function("self", sanitizeSource)(self);
  const parent = { postMessage: vi.fn() };
  const fakeWindow = new EventTarget();
  new Function("self", "parent", "window", "location", frameSource)(self, parent, fakeWindow, { search });
  const port: FakePort = { onmessage: null, postMessage: vi.fn() };
  const fire = (type: string, ev: Record<string, unknown>): void => void fakeWindow.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), ev));
  const init = (source: unknown = parent): void => fire("message", { source, data: { type: "display-init", v: 1 }, ports: [port] });
  const render = (msg: Record<string, unknown>): void => port.onmessage?.({ data: { type: "render", theme: { dark: true, vars: {} }, relayKeys: [], ...msg } });
  const root = (): HTMLElement => document.body.querySelector("#soda-display-root") as HTMLElement;
  return { parent, port, fire, init, render, root };
}

describe("frame.js", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("読み込みの最後に、URL の合い札を添えて display-ready を親へ送る", () => {
    const f = boot("?t=abc");
    expect(f.parent.postMessage).toHaveBeenCalledWith({ type: "display-ready", t: "abc" }, "*");
  });

  it("display-init は親から 1 回だけ受ける（送り主が違えば受けない）", () => {
    const f = boot();
    f.init({}); // 送り主が親でない
    expect(f.port.onmessage).toBeNull();
    f.init();
    expect(f.port.onmessage).not.toBeNull();
    const first = f.port.onmessage;
    const other: FakePort = { onmessage: null, postMessage: vi.fn() };
    f.fire("message", { source: f.parent, data: { type: "display-init" }, ports: [other] });
    expect(other.onmessage).toBeNull(); // 2 回目の display-init は受けない
    expect(f.port.onmessage).toBe(first);
  });

  it("ping には同じ番号の pong を返す", () => {
    const f = boot();
    f.init();
    f.port.onmessage!({ data: { type: "ping", n: 7 } });
    expect(f.port.postMessage).toHaveBeenCalledWith({ type: "pong", n: 7 });
  });

  it("text は文字のまま、markdown は整形、html は取り除きを通す。描いたら rendered を返す", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "text", source: "<b>x</b>" });
    expect(f.root().querySelector("pre")?.textContent).toBe("<b>x</b>");
    expect(f.root().querySelector("b")).toBeNull();
    f.render({ rev: 2, format: "markdown", source: "見出し" });
    expect(f.root().querySelector("h1")?.textContent).toBe("見出し");
    f.render({ rev: 3, format: "html", source: '<p id="p" onclick="x()">a</p><script>1</script>' });
    expect(f.root().querySelector("#p")?.hasAttribute("onclick")).toBe(false);
    expect(f.root().querySelector("script")).toBeNull();
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "rendered", rev: 3 });
  });

  it("静的な形式（text・markdown・html）でない render は、描かずに rejected を返す", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "html", source: "<p>before</p>" });
    for (const format of ["script-html", "future-x", "", undefined]) {
      f.port.postMessage.mockClear();
      f.render({ rev: 9, format, source: "<p id='evil'>x</p><script>1</script>" });
      expect(f.port.postMessage).toHaveBeenCalledWith({ type: "rejected", rev: 9 });
      expect(f.root().querySelector("#evil")).toBeNull();
      expect(f.root().textContent).toBe("before"); // 前の中身のまま
    }
  });

  it("data-soda-action のボタンの click で action を送る。value は data-soda-value か value。disabled は拾わない", () => {
    const f = boot();
    f.init();
    f.render({ rev: 4, format: "html", source: '<button id="a" data-soda-action="go" data-soda-value="1">a</button><button id="b" data-soda-action="v" value="2">b</button><button id="c" data-soda-action="x" disabled>c</button><button id="d" data-soda-action="bad name">d</button>' });
    f.port.postMessage.mockClear();
    (f.root().querySelector("#a") as HTMLElement).click();
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "action", rev: 4, action: "go", data: { value: "1" } });
    (f.root().querySelector("#b") as HTMLElement).click();
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "action", rev: 4, action: "v", data: { value: "2" } });
    f.port.postMessage.mockClear();
    (f.root().querySelector("#c") as HTMLElement).click();
    (f.root().querySelector("#d") as HTMLElement).click(); // 名前の形が外れた操作は送らない
    expect(f.port.postMessage).not.toHaveBeenCalled();
  });

  it("form の submit は必ず preventDefault し、data-soda-action があれば欄の値を送る", () => {
    const f = boot();
    f.init();
    f.render({ rev: 5, format: "html", source: '<form id="f" data-soda-action="save"><input name="who" value="me"></form><form id="g"><input name="x" value="1"></form>' });
    f.port.postMessage.mockClear();
    const submit = (id: string): Event => {
      const ev = new Event("submit", { bubbles: true, cancelable: true });
      f.root().querySelector(id)!.dispatchEvent(ev);
      return ev;
    };
    expect(submit("#f").defaultPrevented).toBe(true);
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "action", rev: 5, action: "save", data: { who: "me" } });
    f.port.postMessage.mockClear();
    expect(submit("#g").defaultPrevented).toBe(true);
    expect(f.port.postMessage).not.toHaveBeenCalled();
  });

  it("Esc と relayKeys のキーだけを key として親へ取り次ぐ（変換中は除く）", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "text", source: "x", relayKeys: [{ key: "b", ctrl: true, alt: false, shift: false, meta: false }] });
    f.port.postMessage.mockClear();
    const key = (init: Record<string, unknown>) => {
      const ev = { preventDefault: vi.fn(), isComposing: false, keyCode: 0, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init };
      f.fire("keydown", ev);
      return ev;
    };
    expect(key({ key: "Escape" }).preventDefault).toHaveBeenCalled();
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "key", key: "escape" });
    key({ key: "b", ctrlKey: true });
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "key", key: "prefix" });
    f.port.postMessage.mockClear();
    key({ key: "b" }); // 修飾が違う
    key({ key: "Escape", isComposing: true });
    key({ key: "a" });
    expect(f.port.postMessage).not.toHaveBeenCalled();
  });

  it("document のメソッド・プロパティが中身の name で上書きされても、次の render が描かれる（DOM clobbering）", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "html", source: '<img name="createElement"><img name="body"><img name="importNode"><img id="documentElement"><p id="first">1</p>' });
    expect(f.root().querySelector("#first")).not.toBeNull();
    // 生きた document が上書きされた状態を作る（ブラウザでは名前つきの `img` が `document.X` を差し替える。`createElement`・`importNode`・`body` などは、ここの DOM の内部が公開の名前を読むので差し替えられない——その入力での落ち方は E2E〔display-isolation (11)〕で見る）。
    for (const n of ["hasFocus", "getElementById", "querySelector"]) Object.defineProperty(document, n, { value: {}, configurable: true });
    try {
      f.port.postMessage.mockClear();
      f.render({ rev: 2, format: "html", source: '<p id="second">2</p>' });
      expect(f.root().querySelector("#second")).not.toBeNull();
      expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "rendered", rev: 2 });
      f.render({ rev: 3, format: "markdown", source: "m" });
      expect(f.root().querySelector("h1")?.textContent).toBe("m");
      f.render({ rev: 4, format: "text", source: "t" });
      expect(f.root().querySelector("pre")?.textContent).toBe("t");
    } finally {
      for (const n of ["hasFocus", "getElementById", "querySelector"]) delete (document as unknown as Record<string, unknown>)[n];
    }
  });

  it("描画が失敗しても例外を外へ出さず、親へ failed を知らせ、次の render を受ける", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "text", source: "ok" });
    f.port.postMessage.mockClear();
    const bad = { rev: 2, format: "text", source: "x", get theme(): never { throw new Error("boom"); } };
    expect(() => f.port.onmessage!({ data: { type: "render", ...Object.getOwnPropertyDescriptors(bad) && { rev: 2, format: "text", source: "x" }, theme: new Proxy({}, { get() { throw new Error("boom"); } }) } })).not.toThrow();
    expect(f.port.postMessage).toHaveBeenCalledWith({ type: "failed", rev: 2 });
    f.render({ rev: 3, format: "text", source: "after" });
    expect(f.root().querySelector("pre")?.textContent).toBe("after");
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "rendered", rev: 3 });
  });
});
