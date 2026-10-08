import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFocusOriginTracking, rememberedOrigin, resetFocusOriginTracking, restoreFocus, tabPressedWithin } from "./focusOrigin.js";

function focusIn(el: Element): void {
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}
function mk(html: string): HTMLElement {
  const d = document.createElement("div");
  d.innerHTML = html;
  document.body.appendChild(d);
  return d;
}

describe("focusOrigin（元の場所の追跡と戻し方）", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    resetFocusOriginTracking();
    installFocusOriginTracking();
  });
  afterEach(() => resetFocusOriginTracking());

  it("最後にフォーカスのあった要素を覚える。表示の枠・覆い・［操作する］ボタンは覚えない（面が続けて取っても、枠どうしで回らない）", () => {
    const root = mk(`<input id="term"><iframe data-display-frame id="f1"></iframe><div class="display-frame-cover" id="cv"></div><button class="display-engage" id="eng">x</button><iframe data-display-frame id="f2"></iframe>`);
    focusIn(root.querySelector("#term")!);
    expect(rememberedOrigin()?.id).toBe("term");
    for (const id of ["f1", "cv", "eng", "f2", "f1", "f2"]) focusIn(root.querySelector(`#${id}`)!);
    expect(rememberedOrigin()?.id).toBe("term");
    // 枠の中の要素（子孫）も覚えない
    const inner = document.createElement("span");
    root.querySelector("#cv")!.appendChild(inner);
    focusIn(inner);
    expect(rememberedOrigin()?.id).toBe("term");
  });

  it("body は覚えない。DOM から外れた要素は『無い』扱い", () => {
    const root = mk(`<input id="a"><input id="b">`);
    focusIn(root.querySelector("#a")!);
    focusIn(document.body);
    expect(rememberedOrigin()?.id).toBe("a");
    root.querySelector("#a")!.remove();
    expect(rememberedOrigin()).toBeNull();
  });

  it("restoreFocus: 覚えた要素へ戻す。戻ったら true（fallback は呼ばない）", () => {
    const root = mk(`<input id="a"><iframe data-display-frame id="f"></iframe>`);
    const a = root.querySelector("#a") as HTMLInputElement;
    const f = root.querySelector("#f") as HTMLIFrameElement;
    focusIn(a);
    let active: Element | null = f;
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => active);
    a.focus = vi.fn(() => void (active = a));
    const fallback = vi.fn();
    expect(restoreFocus(f, fallback)).toBe(true);
    expect(a.focus).toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("覚えた要素が無い・使えないときは fallback（利用者が選んでいる pane の端末）へ", () => {
    const root = mk(`<iframe data-display-frame id="f"></iframe>`);
    const f = root.querySelector("#f") as HTMLIFrameElement;
    let active: Element | null = f;
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => active);
    const fallback = vi.fn(() => void (active = document.body));
    expect(restoreFocus(f, fallback)).toBe(true);
    expect(fallback).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("戻せなければ iframe.blur() してもう 1 回。それでも戻らなければ false", () => {
    const root = mk(`<input id="a"><iframe data-display-frame id="f"></iframe>`);
    const a = root.querySelector("#a") as HTMLInputElement;
    const f = root.querySelector("#f") as HTMLIFrameElement;
    focusIn(a);
    let active: Element | null = f;
    vi.spyOn(document, "activeElement", "get").mockImplementation(() => active);
    a.focus = vi.fn(); // 戻らない
    f.blur = vi.fn();
    const fallback = vi.fn(); // 端末へも戻らない
    expect(restoreFocus(f, fallback)).toBe(false);
    expect(f.blur).toHaveBeenCalledTimes(1);
    expect(a.focus).toHaveBeenCalledTimes(2);
    // blur したら戻れる場合
    f.blur = vi.fn(() => void (active = document.body));
    active = f;
    expect(restoreFocus(f, fallback)).toBe(true);
    vi.restoreAllMocks();
  });

  it("tabPressedWithin: 親の文書で Tab を受けた直後だけ真", () => {
    expect(tabPressedWithin(500)).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(tabPressedWithin(500)).toBe(true);
    expect(tabPressedWithin(-1)).toBe(false);
    resetFocusOriginTracking();
    expect(tabPressedWithin(500)).toBe(false);
  });
});
