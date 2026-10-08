import scriptPage from "../../public/display-view/script.html?raw";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * スクリプトが動く形式の枠の土台（`public/display-view/script.html` の中の `<script>`。枠の中で動くものと同じ）を、偽の `parent`・`window`・port で動かす。
 * 親以外の `display-init` を受けない・2 回目を受けない・静的な形式の `render` を拒む・`soda.action` の規則・`onMessage`・`ping`・差し込みの順を見る。
 * 本物のブラウザでの確かめ（`load` が 1 回のまま・ふつうの HTML とグラフのライブラリ）は E2E。
 */
interface FakePort {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
}

function scriptBody(): string {
  const m = /<script>([\s\S]*?)<\/script>/.exec(scriptPage);
  if (!m) throw new Error("no script in script.html");
  return m[1]!;
}

type Win = EventTarget & { soda?: unknown; scrollBy?: ReturnType<typeof vi.fn>; focus?: ReturnType<typeof vi.fn> };

function boot(search = "?t=ticket123") {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  const parent = { postMessage: vi.fn() };
  const fakeWindow: Win = new EventTarget();
  fakeWindow.scrollBy = vi.fn();
  fakeWindow.focus = vi.fn();
  new Function("parent", "window", "location", scriptBody())(parent, fakeWindow, { search });
  const port: FakePort = { onmessage: null, postMessage: vi.fn() };
  const fire = (type: string, ev: Record<string, unknown>): void => void fakeWindow.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), ev));
  const init = (source: unknown = parent): void => fire("message", { source, data: { type: "display-init", v: 1 }, ports: [port] });
  const send = (msg: Record<string, unknown>): void => port.onmessage?.({ data: msg });
  const render = (msg: Record<string, unknown>): void => send({ type: "render", theme: { dark: true, vars: { "--soda-bg": "#111" } }, ...msg });
  return { parent, port, fire, init, send, render, win: fakeWindow };
}
const posted = (f: ReturnType<typeof boot>): unknown[] => f.port.postMessage.mock.calls.map((c) => c[0]);

describe("script.html（土台）", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("頁の構成: 土台のスクリプトは頁の中に直に書いてあり、外のスクリプトを読まない（script-src に 'self' が要らない）", () => {
    const markup = scriptPage.replace(/<script>[\s\S]*?<\/script>/, "<script></script>");
    expect(markup.match(/<script[\s>]/g)).toHaveLength(1);
    expect(markup).not.toMatch(/<script[^>]*\ssrc=/);
    expect(markup).not.toMatch(/<link[^>]*\shref=|<iframe|<img/);
    const code = scriptBody().replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, ""); // 行コメントを除く
    expect(code).not.toMatch(/document\.write|document\.open/);
  });

  it("読み込みの最後に、URL の合い札を添えて display-ready を親へ送る", () => {
    const f = boot("?t=abc");
    expect(f.parent.postMessage).toHaveBeenCalledWith({ type: "display-ready", t: "abc" }, "*");
  });

  it("display-init は親から 1 回だけ受ける（親以外・2 回目は受けない）", () => {
    const f = boot();
    f.init({}); // 送り主が親でない
    expect(f.port.onmessage).toBeNull();
    f.init();
    expect(f.port.onmessage).not.toBeNull();
    const first = f.port.onmessage;
    const other: FakePort = { onmessage: null, postMessage: vi.fn() };
    f.fire("message", { source: f.parent, data: { type: "display-init" }, ports: [other] });
    expect(other.onmessage).toBeNull();
    expect(f.port.onmessage).toBe(first);
  });

  it("ping には同じ番号の pong を返す", () => {
    const f = boot();
    f.init();
    f.send({ type: "ping", n: 7 });
    expect(f.port.postMessage).toHaveBeenCalledWith({ type: "pong", n: 7 });
  });

  it("script-html でない render は、描かずに rejected を返す。soda も置かない。以後の render も受けない", () => {
    for (const format of ["html", "text", "markdown", "future-x", "", undefined]) {
      const f = boot();
      f.init();
      f.render({ rev: 3, format, source: "<p id='evil'>x</p><script>1</script>" });
      expect(posted(f)).toEqual([{ type: "rejected", rev: 3 }]);
      expect(document.body.querySelector("#evil")).toBeNull();
      expect(f.win.soda).toBeUndefined();
      f.render({ rev: 4, format: "script-html", source: "<p id='late'>x</p>" }); // 1 回だけ
      expect(document.body.querySelector("#late")).toBeNull();
    }
  });

  it("script-html の render: 中身を DOM に差し込み、head の style も入り、rendered を返す。soda が置かれる", () => {
    const f = boot();
    f.init();
    f.render({ rev: 5, format: "script-html", source: "<!doctype html><html lang='en'><head><style>b{color:red}</style></head><body class='k'><p id='p'>hello</p></body></html>" });
    expect(document.body.querySelector("#p")?.textContent).toBe("hello");
    expect(document.head.querySelector("style")?.textContent).toBe("b{color:red}");
    expect(document.body.className).toBe("k");
    expect(posted(f)).toContainEqual({ type: "rendered", rev: 5 });
    const soda = f.win.soda as { version: number; theme: { dark: boolean; vars: Record<string, string> } };
    expect(soda.version).toBe(1);
    expect(soda.theme).toEqual({ dark: true, vars: { "--soda-bg": "#111" } });
    expect(document.documentElement.style.getPropertyValue("--soda-bg")).toBe("#111");
    // 2 回目の render は無視（作り直しは親が枠ごと）
    f.render({ rev: 6, format: "script-html", source: "<p id='again'>x</p>" });
    expect(document.body.querySelector("#again")).toBeNull();
  });

  it("DOMContentLoaded と load の受け手が、差し込みの後に 1 回ずつ呼ばれる", () => {
    const f = boot();
    f.init();
    const seen: string[] = [];
    document.addEventListener("DOMContentLoaded", () => seen.push("dcl:" + (document.body.querySelector("#p") ? "p" : "-")));
    f.win.addEventListener("load", () => seen.push("load:" + (document.body.querySelector("#p") ? "p" : "-")));
    f.render({ rev: 1, format: "script-html", source: "<p id='p'>x</p>" });
    expect(seen).toEqual(["dcl:p", "load:p"]);
  });

  it("入れ子の中身も親を先に入れて、文書の順に入れる。<script> は新しい要素で入る（解釈した木のものは動かさない）", () => {
    const log: string[] = [];
    const orig = Node.prototype.appendChild;
    // 土台は読み込み時に appendChild を控えるので、boot の前に差し込む。
    const spy = vi.spyOn(Node.prototype, "appendChild").mockImplementation(function (this: Node, n: Node) {
      const el = n as Element;
      if (el.localName) log.push(`${(this as Element).localName ?? "?"}>${el.localName}${el.id ? "#" + el.id : ""}`);
      return orig.call(this, n);
    });
    const f = boot();
    f.init();
    try {
      f.render({ rev: 1, format: "script-html", source: "<div id='a'><span id='b'>t</span><script id='s'>1</script><i id='c'></i></div><script id='s2'>2</script>" });
    } finally {
      spy.mockRestore();
    }
    // 親（div）が body に入ってから子が入る。script は元の位置
    expect(log.filter((x) => !x.startsWith("#text") && !x.startsWith("?>") && !x.startsWith("html>"))).toEqual(["body>div#a", "div>span#b", "div>script#s", "div>i#c", "body>script#s2"]);
    const s = document.body.querySelector("#s") as HTMLScriptElement;
    expect(s.textContent).toBe("1");
    expect(document.body.querySelector("#b")?.textContent).toBe("t");
  });

  it("<script src> や不正な属性があっても、差し込みは止まらない", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "script-html", source: "<script src='/display-view/frame.js'></script><p id='after' data-x='1'>ok</p>" });
    expect(document.body.querySelector("#after")?.getAttribute("data-x")).toBe("1");
    expect(posted(f)).toContainEqual({ type: "rendered", rev: 1 });
  });

  it("soda.action: 規則の外は false で何も送らない。規則の内は rev を付けて送る", () => {
    const f = boot();
    f.init();
    f.render({ rev: 4, format: "script-html", source: "<p>x</p>" });
    f.port.postMessage.mockClear();
    const soda = f.win.soda as { action(n: unknown, d?: unknown): boolean };
    expect(soda.action("pick", { id: "3" })).toBe(true);
    expect(soda.action("go")).toBe(true);
    expect(f.port.postMessage.mock.calls.map((c) => c[0])).toEqual([
      { type: "action", rev: 4, action: "pick", data: { id: "3" } },
      { type: "action", rev: 4, action: "go" },
    ]);
    f.port.postMessage.mockClear();
    for (const [n, d] of [
      ["bad name", undefined],
      ["", undefined],
      ["x".repeat(65), undefined],
      [5, undefined],
      ["ok", { a: 1 }],
      ["ok", "str"],
      ["ok", ["a"]],
      ["ok", null],
      ["ok", { v: "x".repeat(9000) }],
      ["ok", Object.fromEntries(Array.from({ length: 65 }, (_, i) => ["k" + i, "v"]))],
      ["ok", { ["k".repeat(65)]: "v" }],
    ] as [unknown, unknown][]) {
      expect(soda.action(n, d), JSON.stringify([n, d]).slice(0, 40)).toBe(false);
    }
    expect(f.port.postMessage).not.toHaveBeenCalled();
  });

  it("soda.onMessage: 登録の順に呼ぶ。解除できる。1 つが投げてもほかを呼ぶ。関数でないものは無視", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "script-html", source: "<p>x</p>" });
    const soda = f.win.soda as { onMessage(fn: unknown): () => void };
    const calls: string[] = [];
    const off1 = soda.onMessage((d: unknown) => calls.push("a:" + JSON.stringify(d)));
    soda.onMessage(() => {
      throw new Error("boom");
    });
    soda.onMessage((d: unknown) => calls.push("c:" + JSON.stringify(d)));
    expect(typeof soda.onMessage("not a function")).toBe("function");
    f.send({ type: "message", data: { n: 1 } });
    expect(calls).toEqual(['a:{"n":1}', 'c:{"n":1}']);
    off1();
    f.send({ type: "message", data: 2 });
    expect(calls).toEqual(['a:{"n":1}', 'c:{"n":1}', "c:2"]);
  });

  it("Esc は port で key:escape を送る。prefix（ほかのキー）は取り次がない", () => {
    const f = boot();
    f.init();
    f.render({ rev: 1, format: "script-html", source: "<p>x</p>", relayKeys: [{ key: "b", ctrl: true }] });
    f.port.postMessage.mockClear();
    const key = (k: string, extra: Record<string, unknown> = {}): void => f.fire("keydown", { key: k, ctrlKey: false, ...extra });
    key("Escape");
    expect(f.port.postMessage).toHaveBeenLastCalledWith({ type: "key", key: "escape" });
    f.port.postMessage.mockClear();
    key("b", { ctrlKey: true }); // relayKeys を渡されても prefix は取り次がない
    key("a");
    key("Escape", { isComposing: true });
    expect(f.port.postMessage).not.toHaveBeenCalled();
  });

  it("scroll は window.scrollBy、focus は window.focus() だけ。数でないスクロールは無視", () => {
    const f = boot();
    f.init();
    f.send({ type: "scroll", dx: 3, dy: -40 });
    expect(f.win.scrollBy).toHaveBeenCalledWith(3, -40);
    f.send({ type: "scroll", dx: "x", dy: Infinity });
    expect(f.win.scrollBy).toHaveBeenCalledTimes(1);
    f.send({ type: "focus" });
    expect(f.win.focus).toHaveBeenCalledTimes(1);
  });

  it("port が無いうちは soda.action は何も送らず落ちない／render の rev が数でなければ何もしない", () => {
    const f = boot();
    f.init();
    f.render({ rev: "1", format: "script-html", source: "<p id='n'>x</p>" });
    expect(document.body.querySelector("#n")).toBeNull();
  });
});
