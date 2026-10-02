import { Terminal } from "@xterm/xterm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOpenableLinkUri, MouseBridge, type UiPort } from "./MouseBridge.js";

let term: Terminal;
let el: HTMLElement;

beforeEach(() => {
  term = new Terminal({ cols: 40, rows: 10, allowProposedApi: true });
  el = document.createElement("div");
  document.body.appendChild(el);
  term.open(el);
});

afterEach(() => {
  term.dispose();
  el.remove();
  vi.unstubAllGlobals();
});

function makeUi(): UiPort & { toasts: string[]; menus: unknown[] } {
  return {
    toasts: [],
    menus: [],
    toast(m) {
      this.toasts.push(m);
    },
    openContextMenu(target, at) {
      this.menus.push({ target, at });
    },
  };
}

async function write(data: string): Promise<void> {
  await new Promise<void>((resolve) => term.write(data, () => resolve()));
}

async function writeAndSelectAll(): Promise<void> {
  await write("hello world");
  term.selectAll();
}

/** xterm.js がマウスの入力を受ける要素（報告・リンクの判定の listener はここと、その親の `term.element` に付く）。 */
function screen(): HTMLElement {
  return term.element!.querySelector<HTMLElement>(".xterm-screen")!;
}

/** xterm.js の内部のマウスの座標の計算（テストだけの差し替え。下の 2 つの関数の説明を参照）。 */
function mouseService(): { getMouseReportCoords: () => unknown; getCoords: () => unknown } {
  return (term as unknown as { _core: { _mouseService: { getMouseReportCoords: () => unknown; getCoords: () => unknown } } })._core._mouseService;
}

/**
 * xterm.js が作るマウスの報告を、happy-dom でも観測できるようにする（テストだけの内部の差し替え）。happy-dom にはレイアウトが無く、
 * 文字の寸法が測れないと xterm.js は報告を作らない（`MouseService.getMouseReportCoords` が undefined を返す）ので、座標を固定で返す。
 * 報告を作る処理そのもの（どのイベントで何を送るか）は本物の xterm.js のまま。
 */
function observeMouseReports(): string[] {
  mouseService().getMouseReportCoords = () => ({ col: 1, row: 1, x: 5, y: 5 });
  const data: string[] = [];
  term.onData((d) => data.push(d));
  return data;
}

/** リンクの判定（xterm.js の `Linkifier`）が指す文字の位置を固定する（1 始まりの列・行。上と同じ理由のテストだけの差し替え）。 */
function pointAt(col: number, row: number): void {
  mouseService().getCoords = () => [col, row];
}

function fire(type: string, init: MouseEventInit, target: EventTarget = screen()): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 5, clientY: 5, ...init });
  target.dispatchEvent(ev);
  return ev;
}

/** ブラウザと同じ順（mousedown → mouseup → contextmenu。Linux・macOS の Chromium は mousedown の直後に contextmenu）の右クリック。 */
function rightClick(init: MouseEventInit = {}): void {
  fire("mousedown", { button: 2, buttons: 2, ...init });
  fire("contextmenu", { button: 2, buttons: 2, clientX: 10, clientY: 20, ...init });
  fire("mouseup", { button: 2, buttons: 0, ...init });
}

function leftClick(init: MouseEventInit = {}): void {
  fire("mousedown", { button: 0, buttons: 1, detail: 1, ...init });
  fire("mouseup", { button: 0, buttons: 0, detail: 1, ...init });
}

describe("MouseBridge — M4（mouseup で選択をコピー）", () => {
  it("選択があれば mouseup でクリップボードへ書き込み、トーストを出す", async () => {
    const writeClipboard = vi.fn().mockResolvedValue(true);
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr", writeClipboard });
    await writeAndSelectAll();

    term.element!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await vi.waitFor(() => expect(writeClipboard).toHaveBeenCalled());
    expect(writeClipboard).toHaveBeenCalledWith(term.getSelection());
    await vi.waitFor(() => expect(ui.toasts).toEqual(["コピーしました"]));
  });

  it("書き込みに失敗したら失敗のトーストを出す", async () => {
    const writeClipboard = vi.fn().mockResolvedValue(false);
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr", writeClipboard });
    await writeAndSelectAll();
    term.element!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await vi.waitFor(() => expect(ui.toasts).toEqual(["コピーできませんでした"]));
  });

  it("選択が無ければ mouseup で何もしない", async () => {
    const writeClipboard = vi.fn().mockResolvedValue(true);
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr", writeClipboard });
    await write("hello");
    term.element!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(ui.toasts).toEqual([]);
  });
});

describe("MouseBridge — M7（右クリックの振り分け）", () => {
  it("常にブラウザの既定のメニューは止める（preventDefault）", () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
    const preventDefault = vi.spyOn(ev, "preventDefault");
    term.element!.dispatchEvent(ev);
    expect(preventDefault).toHaveBeenCalled();
  });

  it("rightClick が 'herdr' なら常に自前のメニューを開く", () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p3", ui, getRightClickTarget: () => "herdr" });
    term.element!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 }));
    expect(ui.menus).toEqual([{ target: { kind: "pane", paneId: "p3" }, at: { x: 10, y: 20 } }]);
  });

  it("rightClick が 'pane' でもアプリがマウス報告を求めていなければ自前のメニューを開く", () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "pane" });
    expect(term.modes.mouseTrackingMode).toBe("none");
    term.element!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 2 }));
    expect(ui.menus).toHaveLength(1);
  });

  it("rightClick が 'pane' でアプリがマウス報告を求めていれば、右クリックの報告（押した・離した）をアプリへ送り、自前のメニューを開かない", async () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "pane" });
    const reports = observeMouseReports();
    await write("\x1b[?1000h\x1b[?1006h"); // vt200 のマウス報告（SGR の形）を有効化
    expect(term.modes.mouseTrackingMode).toBe("vt200");
    rightClick();
    expect(reports).toEqual(["\x1b[<2;2;2M", "\x1b[<2;2;2m"]);
    expect(ui.menus).toEqual([]);
  });

  // D110（D109 で発見）：以前は contextmenu でメニューを開くだけで、xterm.js の mousedown が送る報告を止めていなかった。
  it("rightClick が 'herdr' なら、アプリがマウス報告を求めていても、右クリックはメニューを開くだけで報告をアプリへ送らない", async () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    const reports = observeMouseReports();
    await write("\x1b[?1000h\x1b[?1006h");
    rightClick();
    expect(reports).toEqual([]);
    expect(ui.menus).toEqual([{ target: { kind: "pane", paneId: "p1" }, at: { x: 10, y: 20 } }]);
  });

  it("ボタン・動きの報告を求めるモード（1002・1003）でも、右ボタンを押したまま動かしても報告を送らない", async () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    const reports = observeMouseReports();
    for (const mode of ["\x1b[?1002h", "\x1b[?1003h"]) {
      await write(`${mode}\x1b[?1006h`);
      fire("mousedown", { button: 2, buttons: 2 });
      fire("mousemove", { button: 0, buttons: 2 });
      fire("mousemove", { button: 0, buttons: 2 }, document);
      fire("mouseup", { button: 2, buttons: 0 });
    }
    expect(reports).toEqual([]);
  });

  it("ほかのボタンを押したまま右クリックしても、右ボタンの離した報告を送らない（左ボタンの報告はそのまま）", async () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    const reports = observeMouseReports();
    await write("\x1b[?1000h\x1b[?1006h");
    fire("mousedown", { button: 0, buttons: 1 }); // 左を押したまま（xterm.js が document に離した報告の listener を付ける）
    fire("mousedown", { button: 2, buttons: 3 });
    fire("mouseup", { button: 2, buttons: 1 }); // 右だけ離す
    fire("mouseup", { button: 0, buttons: 0 });
    expect(reports).toEqual(["\x1b[<0;2;2M", "\x1b[<0;2;2m"]);
  });

  // 独立点検 #3：左を押す → 右を押す → 左を離す → 右を離す、の順では、左を離したときは右がまだ押されているので xterm.js は
  // document の listener を外さない。最後の右の mouseup を止めたままにすると、その後の関係の無い mouseup・ドラッグが報告された。
  it("左を押したまま右クリックし、左 → 右の順に離しても、右ボタンの報告は送らず、その後の関係の無い mouseup・ドラッグも報告しない", async () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    const reports = observeMouseReports();
    await write("\x1b[?1002h\x1b[?1006h"); // ボタンを押したままの動き（ドラッグ）も報告するモード
    fire("mousedown", { button: 0, buttons: 1 });
    fire("mousedown", { button: 2, buttons: 3 });
    fire("mouseup", { button: 0, buttons: 2 }); // 左を先に離す（右はまだ押している）
    fire("mouseup", { button: 2, buttons: 0 }); // 最後に右を離す
    expect(reports).toEqual(["\x1b[<0;2;2M", "\x1b[<0;2;2m"]);
    // 端末の外（サイドバー・境界等）でのドラッグと離す操作は、もうアプリへ報告しない。
    fire("mousemove", { button: 0, buttons: 1 }, document);
    fire("mouseup", { button: 0, buttons: 0 }, document);
    expect(reports).toEqual(["\x1b[<0;2;2M", "\x1b[<0;2;2m"]);
    // その後の端末の上の左クリックは今までどおり報告する。
    leftClick();
    expect(reports.slice(2)).toEqual(["\x1b[<0;2;2M", "\x1b[<0;2;2m"]);
  });

  // 独立点検 #1：離したのを取りこぼすと、止める待ちが残って後の関係の無い同じボタンの mouseup を止めていた。
  describe("止めた押下の mouseup を取りこぼしても、後の同じボタンの mouseup を止めない", () => {
    async function setUp(opts: { isMac?: boolean } = {}) {
      let target: "herdr" | "pane" = "herdr";
      new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => target, ...opts });
      const reports = observeMouseReports();
      await write("\x1b[?1000h\x1b[?1006h");
      return { reports, sendToApp: () => (target = "pane") };
    }

    it("押している間に窓のフォーカスを奪われた（blur）", async () => {
      const { reports, sendToApp } = await setUp();
      fire("mousedown", { button: 2, buttons: 2 }); // 止める。この mouseup は届かない
      window.dispatchEvent(new Event("blur"));
      sendToApp(); // 「右クリックを pane に送る」にした後の右クリックは、押した・離したの両方がアプリへ届く
      rightClick();
      expect(reports).toEqual(["\x1b[<2;2;2M", "\x1b[<2;2;2m"]);
    });

    it("次の動き（そのボタンが離れている mousemove）で気づく", async () => {
      const { reports, sendToApp } = await setUp();
      fire("mousedown", { button: 2, buttons: 2 });
      fire("mousemove", { button: 0, buttons: 2 }, document); // まだ押している間は止める待ちのまま
      fire("mousemove", { button: 0, buttons: 0 }, document); // 離れていた
      sendToApp();
      rightClick();
      expect(reports).toEqual(["\x1b[<2;2;2M", "\x1b[<2;2;2m"]);
    });

    it("次の押下（そのボタンが離れている mousedown）で気づく", async () => {
      const { reports, sendToApp } = await setUp();
      fire("mousedown", { button: 2, buttons: 2 });
      leftClick(); // 右は離れている（buttons は 1）
      sendToApp();
      rightClick();
      expect(reports).toEqual(["\x1b[<0;2;2M", "\x1b[<0;2;2m", "\x1b[<2;2;2M", "\x1b[<2;2;2m"]);
    });

    it("macOS の Ctrl＋クリックの mouseup を取りこぼしても、次の左クリックの離した報告を止めない", async () => {
      const { reports } = await setUp({ isMac: true });
      fire("mousedown", { button: 0, buttons: 1, ctrlKey: true }); // 副ボタンのクリックとして止める
      fire("mousemove", { button: 0, buttons: 0 }, document); // 離したのを取りこぼした
      leftClick();
      expect(reports).toEqual(["\x1b[<0;2;2M", "\x1b[<0;2;2m"]);
    });
  });

  it("左ボタンの報告は止めない（止めるのは、メニューを開く右ボタンだけ）", async () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    const reports = observeMouseReports();
    await write("\x1b[?1000h\x1b[?1006h");
    leftClick();
    expect(reports).toEqual(["\x1b[<0;2;2M", "\x1b[<0;2;2m"]);
  });

  it("macOS の Ctrl＋クリック（副ボタンのクリック）も、メニューを開くときは報告を送らない。macOS 以外の Ctrl＋クリックは左ボタンの報告のまま", async () => {
    const mac = makeUi();
    new MouseBridge({ term, paneId: "p1", ui: mac, getRightClickTarget: () => "herdr", isMac: true });
    const reports = observeMouseReports();
    await write("\x1b[?1000h\x1b[?1006h");
    fire("mousedown", { button: 0, buttons: 1, ctrlKey: true });
    fire("contextmenu", { button: 0, buttons: 1, ctrlKey: true, clientX: 10, clientY: 20 });
    fire("mouseup", { button: 0, buttons: 0, ctrlKey: true });
    expect(reports).toEqual([]);
    expect(mac.menus).toHaveLength(1);

    const other = new Terminal({ cols: 40, rows: 10, allowProposedApi: true });
    const otherEl = document.createElement("div");
    document.body.appendChild(otherEl);
    other.open(otherEl);
    try {
      new MouseBridge({ term: other, paneId: "p2", ui: makeUi(), getRightClickTarget: () => "herdr", isMac: false });
      (other as unknown as { _core: { _mouseService: { getMouseReportCoords: () => unknown } } })._core._mouseService.getMouseReportCoords = () => ({ col: 1, row: 1, x: 5, y: 5 });
      const otherReports: string[] = [];
      other.onData((d) => otherReports.push(d));
      await new Promise<void>((resolve) => other.write("\x1b[?1000h\x1b[?1006h", () => resolve()));
      const otherScreen = other.element!.querySelector(".xterm-screen")!;
      fire("mousedown", { button: 0, buttons: 1, ctrlKey: true }, otherScreen);
      fire("mouseup", { button: 0, buttons: 0, ctrlKey: true }, otherScreen);
      expect(otherReports).toEqual(["\x1b[<16;2;2M", "\x1b[<16;2;2m"]); // 16 は Ctrl
    } finally {
      other.dispose();
      otherEl.remove();
    }
  });

  it("右ボタンの押下を止めても、その端末にフォーカスする（M1。xterm.js の mousedown がしていたこと）", async () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    await write("\x1b[?1000h");
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    const ev = fire("mousedown", { button: 2, buttons: 2 });
    expect(ev.defaultPrevented).toBe(true); // ブラウザの既定の動作（フォーカスを移す等）は止める
    expect(document.activeElement).toBe(term.textarea);
    other.remove();
  });

  it("アプリがマウス報告を求めていなければ、右ボタンの mousedown を止めない（xterm.js に任せる）", () => {
    const ui = makeUi();
    new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr" });
    const bubbled = vi.fn();
    term.element!.addEventListener("mousedown", bubbled);
    fire("mousedown", { button: 2, buttons: 2 });
    expect(bubbled).toHaveBeenCalledTimes(1);
  });
});

describe("MouseBridge — M6（リンクの起動）", () => {
  it("出力の中の URL は、ただのクリックでは開かず、Ctrl を押しながらのクリックで開く", async () => {
    const openLink = vi.fn();
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink, isMac: false });
    await write("visit https://example.com/plain now");
    pointAt(12, 1); // URL（7 列目から）の上
    fire("mousemove", {});
    leftClick();
    expect(openLink).not.toHaveBeenCalled();
    leftClick({ metaKey: true }); // Ctrl 以外の修飾キーでは開かない（macOS 以外）
    expect(openLink).not.toHaveBeenCalled();
    leftClick({ ctrlKey: true });
    expect(openLink).toHaveBeenCalledTimes(1);
    expect(openLink).toHaveBeenCalledWith("https://example.com/plain");
  });

  it("macOS では Cmd を押しながらのクリックで開き、Ctrl＋クリック（副ボタンのクリック）では開かない", async () => {
    const openLink = vi.fn();
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink, isMac: true });
    await write("https://example.com/mac");
    pointAt(3, 1);
    fire("mousemove", {});
    leftClick({ ctrlKey: true });
    expect(openLink).not.toHaveBeenCalled();
    leftClick({ metaKey: true });
    expect(openLink).toHaveBeenCalledWith("https://example.com/mac");
  });

  it("OSC 8 のリンクは、ただのクリックでは開かず（確認のダイアログも出さない）、Ctrl を押しながらのクリックで開く", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal("open", vi.fn(() => null));
    const openLink = vi.fn();
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink, isMac: false });
    await write("\x1b]8;;https://example.com/osc8\x1b\\osc8-text\x1b]8;;\x1b\\ tail");
    pointAt(3, 1);
    fire("mousemove", {});
    leftClick();
    expect(confirm).not.toHaveBeenCalled(); // 以前は linkHandler が無く、xterm.js の既定が confirm() を出していた
    expect(openLink).not.toHaveBeenCalled();
    leftClick({ ctrlKey: true });
    expect(openLink).toHaveBeenCalledWith("https://example.com/osc8");
    expect(confirm).not.toHaveBeenCalled();
  });

  it("右クリックではリンクを開かない（xterm.js はボタンを見ずに、離したときに開こうとする）", async () => {
    const openLink = vi.fn();
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink, isMac: false });
    await write("https://example.com/right");
    pointAt(3, 1);
    fire("mousemove", { ctrlKey: true });
    rightClick({ ctrlKey: true });
    expect(openLink).not.toHaveBeenCalled();
  });

  it("http/https 以外の scheme は、Ctrl を押しながらでも開かない", async () => {
    const openLink = vi.fn();
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink, isMac: false });
    const ctrlClick = new MouseEvent("mouseup", { button: 0, ctrlKey: true });
    const range = { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } };
    const handler = term.options.linkHandler!;
    expect(handler.allowNonHttpProtocols).toBe(false);
    for (const uri of ["javascript:alert(1)", "file:///etc/passwd", "mailto:a@example.com", "data:text/html,x", "not a url"]) handler.activate(ctrlClick, uri, range);
    expect(openLink).not.toHaveBeenCalled();
    handler.activate(ctrlClick, "http://example.com/", range);
    expect(openLink).toHaveBeenCalledWith("http://example.com/");
    // xterm.js 自身も、OSC 8 の http/https 以外はリンクにしない（`allowNonHttpProtocols: false`）。
    await write("\x1b]8;;javascript:alert(1)\x1b\\js-link\x1b]8;;\x1b\\");
    pointAt(3, 1);
    fire("mousemove", { ctrlKey: true });
    leftClick({ ctrlKey: true });
    expect(openLink).toHaveBeenCalledTimes(1);
  });

  it("Ctrl を押している間だけ、重なったリンクに下線と指のカーソルを出す（押す・離すを重なったまま反映する）", async () => {
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink: vi.fn(), isMac: false });
    await write("https://example.com/hover");
    pointAt(3, 1);
    const current = (): { state?: { decorations: { underline: boolean; pointerCursor: boolean } } } | undefined =>
      (term as unknown as { _core: { linkifier: { currentLink?: { state?: { decorations: { underline: boolean; pointerCursor: boolean } } } } } })._core.linkifier.currentLink;
    fire("mousemove", {});
    expect(current()).toBeDefined(); // リンクに重なっている
    expect(current()!.state!.decorations).toEqual({ underline: false, pointerCursor: false });
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true }));
    expect(current()!.state!.decorations).toEqual({ underline: true, pointerCursor: true });
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", ctrlKey: false }));
    expect(current()!.state!.decorations.underline).toBe(false);
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(false);

    fire("mousemove", { ctrlKey: true, clientX: 6 }); // マウスの動きに乗った修飾キーでも反映する
    expect(current()!.state!.decorations.underline).toBe(true);
    window.dispatchEvent(new Event("blur")); // 押したまま窓を離れたら、押していない扱いに戻す
    expect(current()!.state!.decorations.underline).toBe(false);
  });

  it("前に重なったリンクへ戻ったときも、そのときの修飾キーの状態で下線を出す", async () => {
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink: vi.fn(), isMac: false });
    await write("https://example.com/again   x");
    pointAt(3, 1);
    fire("mousemove", {}); // 押さずに重なる（xterm.js はこの行のリンクを覚える）
    pointAt(29, 1);
    fire("mousemove", { clientX: 6 }); // リンクの外へ
    pointAt(3, 1);
    fire("mousemove", { ctrlKey: true, clientX: 7 }); // 押しながら同じリンクへ戻る
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(true);
  });

  it("isOpenableLinkUri：http/https だけを開いてよいとする", () => {
    expect(isOpenableLinkUri("https://example.com/a?b#c")).toBe(true);
    expect(isOpenableLinkUri("HTTP://EXAMPLE.COM/")).toBe(true);
    expect(isOpenableLinkUri("javascript:alert(1)")).toBe(false);
    expect(isOpenableLinkUri("file:///etc/passwd")).toBe(false);
    expect(isOpenableLinkUri("vscode://file/x")).toBe(false);
    expect(isOpenableLinkUri("example.com")).toBe(false);
  });
});

describe("MouseBridge — ファイルのリンク", () => {
  function makeFiles(existing: Record<string, { path: string; kind: "file" | "dir"; size: number }>) {
    return {
      resolve: vi.fn(async (_paneId: string, paths: string[]) => paths.map((p) => existing[p] ?? null)),
      open: vi.fn(),
      openUri: vi.fn(),
    };
  }
  /** リンクの判定（提供元の非同期の答え）が済むのを待つ。 */
  const linked = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it("出力の中の実在するパスは、Ctrl を押しながらのクリックで開く（ただのクリックでは開かない）", async () => {
    const files = makeFiles({ "src/a.ts": { path: "/w/src/a.ts", kind: "file", size: 3 } });
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink: vi.fn(), isMac: false, files });
    await write("error at src/a.ts:12:3");
    pointAt(12, 1);
    fire("mousemove", {});
    await linked();
    expect(files.resolve).toHaveBeenCalledWith("p1", ["src/a.ts"]);
    leftClick();
    expect(files.open).not.toHaveBeenCalled();
    leftClick({ ctrlKey: true });
    expect(files.open).toHaveBeenCalledWith({ path: "/w/src/a.ts", kind: "file", size: 3 });
  });

  it("実在しないパスはリンクにならない", async () => {
    const files = makeFiles({});
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink: vi.fn(), isMac: false, files });
    await write("error at src/none.ts:1");
    pointAt(12, 1);
    fire("mousemove", { ctrlKey: true });
    await linked();
    leftClick({ ctrlKey: true });
    expect(files.open).not.toHaveBeenCalled();
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(false);
  });

  it("下線と指のカーソルは、URL と同じく Ctrl を押している間だけ出す", async () => {
    const files = makeFiles({ "src/a.ts": { path: "/w/src/a.ts", kind: "file", size: 3 } });
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink: vi.fn(), isMac: false, files });
    await write("src/a.ts");
    pointAt(3, 1);
    fire("mousemove", {});
    await linked();
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(false);
    fire("mousemove", { ctrlKey: true });
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(true);
  });

  it("URL の中のパスらしい部分は、URL のリンクのまま（ファイルとして確かめない）", async () => {
    const files = makeFiles({});
    const openLink = vi.fn();
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink, isMac: false, files });
    await write("https://example.com/src/a.ts");
    pointAt(22, 1);
    fire("mousemove", {});
    await linked();
    leftClick({ ctrlKey: true });
    expect(openLink).toHaveBeenCalledWith("https://example.com/src/a.ts");
    expect(files.resolve).not.toHaveBeenCalled();
  });

  it("OSC 8 の file: のリンクは Ctrl を押しながらのクリックでファイルとして開く。ほかの scheme はリンクにもしない", async () => {
    const files = makeFiles({});
    const openLink = vi.fn();
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink, isMac: false, files });
    await write("\x1b]8;;file://host/w/my%20file.txt\x1b\\osc8-file\x1b]8;;\x1b\\ \x1b]8;;javascript:alert(1)\x1b\\js-link\x1b]8;;\x1b\\");
    pointAt(3, 1);
    fire("mousemove", {});
    await linked();
    leftClick();
    expect(files.openUri).not.toHaveBeenCalled();
    leftClick({ ctrlKey: true });
    expect(files.openUri).toHaveBeenCalledWith("p1", "file://host/w/my%20file.txt");
    expect(openLink).not.toHaveBeenCalled();
    // javascript: のリンクの上：指のカーソルにならず、押しても何も起きない。
    fire("mouseleave", {});
    pointAt(13, 1);
    fire("mousemove", { ctrlKey: true });
    await linked();
    expect(screen().classList.contains("xterm-cursor-pointer")).toBe(false);
    leftClick({ ctrlKey: true });
    expect(files.openUri).toHaveBeenCalledTimes(1);
    expect(openLink).not.toHaveBeenCalled();
  });

  it("files を渡さなければ、今までどおりファイルのリンクを作らない", async () => {
    new MouseBridge({ term, paneId: "p1", ui: makeUi(), getRightClickTarget: () => "herdr", openLink: vi.fn(), isMac: false });
    expect(term.options.linkHandler!.allowNonHttpProtocols).toBe(false);
  });
});

describe("MouseBridge — dispose", () => {
  it("dispose の後は mouseup/contextmenu に反応しない", async () => {
    const writeClipboard = vi.fn().mockResolvedValue(true);
    const ui = makeUi();
    const bridge = new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr", writeClipboard });
    bridge.dispose();
    await writeAndSelectAll();
    term.element!.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    term.element!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(ui.menus).toEqual([]);
  });

  it("dispose の後は右ボタンの押下を止めず、修飾キーも追わない", async () => {
    const ui = makeUi();
    const bridge = new MouseBridge({ term, paneId: "p1", ui, getRightClickTarget: () => "herdr", openLink: vi.fn(), isMac: false });
    await write("\x1b[?1000h");
    fire("mousedown", { button: 2, buttons: 2 }); // 離した mouseup の待ちが残った状態で dispose する
    bridge.dispose();
    const upOnDocument = vi.fn();
    document.addEventListener("mouseup", upOnDocument);
    fire("mouseup", { button: 2, buttons: 0 });
    document.removeEventListener("mouseup", upOnDocument);
    expect(upOnDocument).toHaveBeenCalledTimes(1);
    const bubbled = vi.fn();
    term.element!.addEventListener("mousedown", bubbled);
    fire("mousedown", { button: 2, buttons: 2 });
    expect(bubbled).toHaveBeenCalledTimes(1);
  });
});
