import type { DisplayInfo } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import type { DisplayHost } from "../injection.js";
import { dismissWithFocus, focusPlaceOf, headFocusTarget, installKeepFocusRelease, isReleasableFrame, openDisplayMenu, pickFocusTarget, trayFocusTarget, withDisplayChange } from "./displayOps.js";
import { registerFrame, unregisterFrame } from "./frameRegistry.js";

const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({ id, paneId: "p1", name: id, kind: "panel", format: "text", title: id, size: 320, rev: 1, bytes: 1, updatedAt: "x", ...over });

/** pane の本体・端末・パネル（根・見出し・枠）・トレイを作る。 */
function world(opts: { script?: boolean; engaged?: boolean } = {}) {
  document.body.innerHTML = `
    <div data-pane-id="p1">
      <textarea id="term"></textarea>
      <aside data-pane-panel data-display-root="a">
        <div data-display-head><button id="fold" data-pane-panel-fold data-display-keepfocus>▸</button><button id="menu" data-display-menu-button>⋮</button></div>
        <div class="display-frame-wrap" ${opts.script ? `data-display-engaged="${opts.engaged ? "1" : "0"}"` : ""}><iframe id="frame" tabindex="0" data-display-frame ${opts.script ? "data-display-script" : ""}></iframe><div id="cover" data-display-cover></div></div>
      </aside>
      <span data-display-tray><button id="tray" data-display-tray-button data-display-id="a" data-display-keepfocus>a</button></span>
      <div id="blank"></div>
    </div>`;
  const term = document.getElementById("term") as HTMLTextAreaElement;
  const host: DisplayHost = {
    focusTerminal: vi.fn(() => term.focus()),
    focusSelectedTerminal: vi.fn(() => term.focus()),
    injectPrefix: vi.fn(),
    prefixKey: () => ({ key: "b", ctrl: true, alt: false, shift: false, meta: false }),
  };
  return { term, host, el: (id: string) => document.getElementById(id) as HTMLElement };
}

/** フォーカスが `body` に落ちた回数（`focusout` の `relatedTarget` が null、または `activeElement` が body）を数える。 */
function watchBody(): { hits: () => number; stop: () => void } {
  let n = 0;
  const onOut = (e: Event): void => {
    if ((e as FocusEvent).relatedTarget === null) n++;
  };
  document.addEventListener("focusout", onOut, true);
  return { hits: () => n, stop: () => document.removeEventListener("focusout", onOut, true) };
}

beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("focusPlaceOf・isReleasableFrame", () => {
  it("枠・見出し・トレイ・それ以外を見分ける", () => {
    const w = world();
    expect(focusPlaceOf(info("a"))).toBe("other");
    w.el("frame").focus();
    expect(focusPlaceOf(info("a"))).toBe("frame");
    w.el("fold").focus();
    expect(focusPlaceOf(info("a"))).toBe("head");
    w.el("tray").focus();
    expect(focusPlaceOf(info("a"))).toBe("tray");
    w.term.focus();
    expect(focusPlaceOf(info("a"))).toBe("other");
    expect(focusPlaceOf(info("zzz"))).toBe("other");
  });
  it("静的な枠は対象。スクリプトの枠は、操作中（iframe の親の data-display-engaged が 1）のときだけ", () => {
    expect(isReleasableFrame(world().el("frame"))).toBe(true);
    expect(isReleasableFrame(world({ script: true, engaged: true }).el("frame"))).toBe(true);
    expect(isReleasableFrame(world({ script: true, engaged: false }).el("frame"))).toBe(false);
    expect(isReleasableFrame(world().el("term"))).toBe(false);
    expect(isReleasableFrame(null)).toBe(false);
  });
  it("操作中かは iframe の親だけで見る（祖先の同じ名前の属性は見ない）", () => {
    const w = world({ script: true, engaged: false });
    w.el("frame").closest("aside")!.setAttribute("data-display-engaged", "1");
    expect(isReleasableFrame(w.el("frame"))).toBe(false);
  });
});

describe("withDisplayChange（フォーカスの行き先の表の全行）", () => {
  it("見出しのボタン: 変更の前に、同期で端末へ移る。変更の後に行き先へ。body を通らない", async () => {
    const w = world();
    w.el("fold").focus();
    const seen: Element[] = [];
    const watch = watchBody();
    await withDisplayChange(info("a"), () => seen.push(document.activeElement!), () => w.el("tray"), w.host);
    watch.stop();
    expect(seen[0]).toBe(w.term); // 変更の時点で、すでに端末
    expect(document.activeElement).toBe(w.el("tray")); // 行き先
    expect(w.host.focusTerminal).toHaveBeenCalledWith("p1");
    expect(watch.hits()).toBe(0);
  });
  it("トレイのボタン: 同じ。行き先は見出しの［たたむ］", async () => {
    const w = world();
    w.el("tray").focus();
    const seen: Element[] = [];
    await withDisplayChange(info("a"), () => seen.push(document.activeElement!), () => w.el("fold"), w.host);
    expect(seen[0]).toBe(w.term);
    expect(document.activeElement).toBe(w.el("fold"));
  });
  it("浮いた窓のトレイのボタン（keepTrayFocus）は、変更の前に端末へ移さない", async () => {
    const w = world();
    w.el("tray").focus();
    const seen: Element[] = [];
    await withDisplayChange(info("a"), () => seen.push(document.activeElement!), () => null, w.host, { keepTrayFocus: true });
    expect(seen[0]).toBe(w.el("tray"));
    expect(w.host.focusTerminal).not.toHaveBeenCalled();
  });
  it("操作中のスクリプトの枠: 先に endEngageFrame して端末へ。静的な枠も端末へ", async () => {
    for (const script of [true, false]) {
      const w = world({ script, engaged: true });
      const endEngage = vi.fn();
      const reg = { focusInside: vi.fn(), endEngage };
      registerFrame("a", reg);
      w.el("frame").focus();
      await withDisplayChange(info("a"), () => undefined, () => w.el("tray"), w.host);
      expect(endEngage).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(w.term);
      unregisterFrame("a", reg);
    }
  });
  it("端末にフォーカスがあるなら動かさない（マウスで押した・端末から開いたメニュー）", async () => {
    const w = world();
    w.term.focus();
    await withDisplayChange(info("a"), () => undefined, () => w.el("tray"), w.host);
    expect(document.activeElement).toBe(w.term);
    expect(w.host.focusTerminal).not.toHaveBeenCalled();
  });
  it("行き先の部品が無い（null・外れている）なら端末。変更の後に body なら端末", async () => {
    const w = world();
    w.el("fold").focus();
    await withDisplayChange(info("a"), () => undefined, () => null, w.host);
    expect(document.activeElement).toBe(w.term);
    (document.activeElement as HTMLElement).blur();
    await withDisplayChange(info("a"), () => undefined, () => null, w.host);
    expect(document.activeElement).toBe(w.term); // 備え（手順 4）
  });
  it("操作中でないスクリプトの枠にフォーカスがあるときは、枠からは動かさない（取られたことは DisplayFrame の数え方に任せる）", async () => {
    const w = world({ script: true, engaged: false });
    w.el("frame").focus();
    const endEngage = vi.fn();
    const reg = { focusInside: vi.fn(), endEngage };
    registerFrame("a", reg);
    await withDisplayChange(info("a"), () => undefined, () => null, w.host);
    unregisterFrame("a", reg);
    expect(endEngage).not.toHaveBeenCalled();
    expect(w.host.focusTerminal).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(w.el("frame"));
  });
  it("host が無くても落ちない", async () => {
    const w = world();
    w.el("fold").focus();
    await expect(withDisplayChange(info("a"), () => undefined, () => w.el("tray"), undefined)).resolves.toBeUndefined();
  });
});

describe("dismissWithFocus・openDisplayMenu", () => {
  it("閉じる: 見出しのボタンにフォーカスがあれば、先に端末へ移してから dismiss", () => {
    const w = world();
    w.el("fold").focus();
    const order: string[] = [];
    dismissWithFocus(info("a"), () => order.push(document.activeElement === w.term ? "term" : "other"), w.host);
    expect(order).toEqual(["term"]);
    w.term.focus();
    (w.host.focusTerminal as ReturnType<typeof vi.fn>).mockClear();
    dismissWithFocus(info("a"), () => undefined, w.host);
    expect(w.host.focusTerminal).not.toHaveBeenCalled();
  });
  it("メニューを開く前に、フォーカスが面の枠（静的・操作中のスクリプト）にあれば端末へ移す。操作中でないスクリプトの枠・端末なら動かさない", () => {
    for (const [script, engaged, moves] of [[false, false, true], [true, true, true], [true, false, false]] as const) {
      const w = world({ script, engaged });
      w.el("frame").focus();
      const open = vi.fn();
      openDisplayMenu(open, { kind: "display", id: "a" }, { x: 1, y: 2 }, w.host, "p1");
      expect(open).toHaveBeenCalledWith({ kind: "display", id: "a" }, { x: 1, y: 2 });
      expect((w.host.focusTerminal as ReturnType<typeof vi.fn>).mock.calls.length > 0).toBe(moves);
    }
  });
});

describe("installKeepFocusRelease", () => {
  const press = (el: Element, trusted = true): void => {
    const ev = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "isTrusted", { value: trusted }); // jsdom の合成イベントは isTrusted が偽
    el.dispatchEvent(ev);
  };
  let off: () => void = () => undefined;
  afterEach(() => off());

  it("操作中のスクリプトの枠・静的な枠にフォーカスがあるとき、フォーカスを取らない部品・覆いの押下で、その枠の pane の端末へ移る", () => {
    for (const script of [true, false]) {
      const w = world({ script, engaged: true });
      off = installKeepFocusRelease(w.host, () => false);
      for (const target of ["fold", "tray", "cover"]) {
        w.el("frame").focus();
        (w.host.focusTerminal as ReturnType<typeof vi.fn>).mockClear();
        press(w.el(target));
        expect(w.host.focusTerminal, `${script}:${target}`).toHaveBeenCalledWith("p1");
        expect(document.activeElement).toBe(w.term);
      }
      off();
    }
  });
  it("何もしない場合: 枠に無い・操作中でないスクリプトの枠・フォーカスを取らない部品でない押下", () => {
    const w = world({ script: true, engaged: false });
    off = installKeepFocusRelease(w.host, () => false);
    w.el("frame").focus();
    press(w.el("fold"));
    expect(w.host.focusTerminal).not.toHaveBeenCalled(); // 操作中でないスクリプトの枠
    const w2 = world({ script: true, engaged: true });
    off();
    off = installKeepFocusRelease(w2.host, () => false);
    w2.term.focus();
    press(w2.el("fold"));
    expect(w2.host.focusTerminal).not.toHaveBeenCalled(); // 枠にフォーカスが無い
    w2.el("frame").focus();
    press(w2.el("blank"));
    expect(w2.host.focusTerminal).not.toHaveBeenCalled(); // 押した先が keepfocus でない
  });
  it("合成の（isTrusted でない）押下では何もしない", () => {
    const w = world({ engaged: true });
    off = installKeepFocusRelease(w.host, () => false);
    w.el("frame").focus();
    press(w.el("fold"), false);
    expect(w.host.focusTerminal).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(w.el("frame"));
    press(w.el("fold"), true);
    expect(w.host.focusTerminal).toHaveBeenCalledTimes(1);
  });
  it("モバイルでは、押下のたびに見て、働かせない（登録した後で真になっても）", () => {
    const w = world({ engaged: true });
    let mobile = false;
    off = installKeepFocusRelease(w.host, () => mobile);
    w.el("frame").focus();
    mobile = true;
    press(w.el("fold"));
    expect(w.host.focusTerminal).not.toHaveBeenCalled();
    mobile = false;
    press(w.el("fold"));
    expect(w.host.focusTerminal).toHaveBeenCalledTimes(1);
  });
  it("window の capture で聞く（document の capture の聞き手より先に走る）", () => {
    const w = world({ engaged: true });
    off = installKeepFocusRelease(w.host, () => false);
    const order: string[] = [];
    (w.host.focusTerminal as ReturnType<typeof vi.fn>).mockImplementation(() => order.push("release"));
    document.addEventListener("pointerdown", () => order.push("document"), true);
    w.el("frame").focus();
    press(w.el("fold"));
    expect(order).toEqual(["release", "document"]);
  });
  it("解除の関数を呼ぶと聞かなくなる", () => {
    const w = world({ engaged: true });
    off = installKeepFocusRelease(w.host, () => false);
    off();
    w.el("frame").focus();
    press(w.el("fold"));
    expect(w.host.focusTerminal).not.toHaveBeenCalled();
  });
});

describe("pickFocusTarget（prefix+i の行き先）", () => {
  const faces = [info("p1"), info("p2"), info("b1", { kind: "band" }), info("b2", { kind: "band" })];
  const none = new Set<string>();
  it("① 開いているパネル: 最後に操作した面 → 無ければ出た順", () => {
    expect(pickFocusTarget(faces, () => false, none, "p2")).toEqual({ info: faces[1], open: false });
    expect(pickFocusTarget(faces, () => false, none, null)).toEqual({ info: faces[0], open: false });
    expect(pickFocusTarget(faces, () => false, none, "zzz")).toEqual({ info: faces[0], open: false });
  });
  it("② たたんだパネル（開いてから）。パネルが帯より先", () => {
    expect(pickFocusTarget(faces, (d) => d.kind === "panel", none, null)).toEqual({ info: faces[0], open: true });
  });
  it("③ 開いている帯・④ たたんだ帯", () => {
    const bandsOnly = faces.filter((f) => f.kind === "band");
    expect(pickFocusTarget(bandsOnly, (d) => d.id === "b1", none, null)).toEqual({ info: bandsOnly[1], open: false });
    expect(pickFocusTarget(bandsOnly, () => true, none, null)).toEqual({ info: bandsOnly[0], open: true });
  });
  it("自動でたたまれた面は飛ばす。面が無ければ null", () => {
    expect(pickFocusTarget(faces, () => false, new Set(["p1"]), null)).toEqual({ info: faces[1], open: false });
    expect(pickFocusTarget(faces, () => false, new Set(["p1", "p2", "b1", "b2"]), null)).toBeNull();
    expect(pickFocusTarget([], () => false, none, null)).toBeNull();
  });
});

describe("headFocusTarget・trayFocusTarget", () => {
  it("見出しは［たたむ］を優先し、無ければ［⋮］。トレイは面のボタン", () => {
    const w = world();
    expect(headFocusTarget("a")).toBe(w.el("fold"));
    w.el("fold").remove();
    expect(headFocusTarget("a")).toBe(w.el("menu"));
    expect(trayFocusTarget("a")).toBe(w.el("tray"));
    expect(headFocusTarget("none")).toBeNull();
    void nextTick;
  });
});
