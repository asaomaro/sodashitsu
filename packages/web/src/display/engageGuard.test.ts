import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGAGE_SETTLE_MS, installEngageGuard } from "./engageGuard.js";

let t = 1000;
let off: (() => void) | null = null;
const blocked: (string | null)[] = [];
const clicks: string[] = [];
const rects = new Map<Element, { x: number; y: number; w: number; h: number }>();
let covered = new Set<Element>();

function face(id: string, r: { x: number; y: number; w: number; h: number }): HTMLButtonElement {
  const root = document.createElement("div");
  root.setAttribute("data-display-root", id);
  const b = document.createElement("button");
  b.setAttribute("data-display-engage", "");
  b.addEventListener("click", () => clicks.push(id));
  root.append(b);
  document.body.append(root);
  rects.set(b, r);
  b.getBoundingClientRect = () => {
    const v = rects.get(b)!;
    return { x: v.x, y: v.y, width: v.w, height: v.h, left: v.x, top: v.y, right: v.x + v.w, bottom: v.y + v.h, toJSON: () => ({}) } as DOMRect;
  };
  return b;
}
/** 本物の押し（isTrusted）を模す。 */
function press(el: Element, type: string): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "isTrusted", { value: true });
  el.dispatchEvent(e);
  return e;
}
const fullPress = (el: Element): void => {
  press(el, "pointerdown");
  press(el, "mousedown");
  press(el, "pointerup");
  press(el, "mouseup");
  press(el, "click");
};

beforeEach(() => {
  vi.useFakeTimers();
  t = 1000;
  blocked.length = 0;
  clicks.length = 0;
  covered = new Set();
  document.elementFromPoint = (): Element | null => {
    for (const b of document.querySelectorAll("[data-display-engage]")) if (!covered.has(b)) return b;
    return document.body;
  };
  off = installEngageGuard({ onBlocked: (id) => blocked.push(id), now: () => t });
});
afterEach(() => {
  off?.();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("installEngageGuard（［操作する］は、直前に箱が動いていたら押しを受けない）", () => {
  it("動いていないボタンは、遅れずに効く（面が 1 つだけでも、2 つでも）", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    fullPress(a); // 初めて見るボタンで、ほかに［操作する］が無い
    expect(clicks).toEqual(["a"]);
    const b = face("b", { x: 200, y: 10, w: 60, h: 24 }); // 2 つ目が現れた
    vi.advanceTimersByTime(60);
    t += ENGAGE_SETTLE_MS + 10; // b が現れてから 500ms 待つ
    fullPress(a);
    fullPress(b);
    expect(clicks).toEqual(["a", "a", "b"]);
    expect(blocked).toEqual([]);
  });
  it("直前の 500ms に箱が動いたボタンは、押しを受けない。強調の通知が 1 回。500ms 待てば効く", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    face("b", { x: 200, y: 10, w: 60, h: 24 });
    t += 1000;
    vi.advanceTimersByTime(60);
    rects.set(a, { x: 150, y: 10, w: 60, h: 24 }); // 右のパネルが出て、窓が動いた
    t += 100;
    fullPress(a);
    expect(clicks).toEqual([]);
    expect(blocked).toEqual(["a"]);
    t += ENGAGE_SETTLE_MS + 10;
    fullPress(a);
    expect(clicks).toEqual(["a"]);
  });
  it("別の部品の下から出てきたボタン（覆われていたのが見えるようになった）も、受けない", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    face("b", { x: 200, y: 10, w: 60, h: 24 });
    covered.add(a);
    t += 1000;
    vi.advanceTimersByTime(60);
    covered.delete(a);
    t += 60;
    vi.advanceTimersByTime(60);
    t += 60;
    fullPress(a);
    expect(clicks).toEqual([]);
    expect(blocked).toEqual(["a"]);
  });
  it("ほかの［操作する］がある中で新しく現れたボタンは、500ms は受けない。1 つだけのときは受ける", () => {
    face("a", { x: 10, y: 10, w: 60, h: 24 });
    t += 1000;
    const n = face("n", { x: 10, y: 10, w: 60, h: 24 });
    fullPress(n);
    expect(clicks).toEqual([]);
    expect(blocked).toEqual(["n"]);
  });
  it("押し始めを止めたら、長押しで 500ms を過ぎても、その押しの click は受けない", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    face("b", { x: 200, y: 10, w: 60, h: 24 });
    t += 1000;
    vi.advanceTimersByTime(60);
    rects.set(a, { x: 11, y: 10, w: 60, h: 24 });
    press(a, "pointerdown");
    t += 900;
    press(a, "pointerup");
    press(a, "click");
    expect(clicks).toEqual([]);
  });
  it("本物でない押し（isTrusted でない）は、止めない", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    face("b", { x: 200, y: 10, w: 60, h: 24 });
    rects.set(a, { x: 99, y: 10, w: 60, h: 24 });
    a.click();
    expect(clicks).toEqual(["a"]);
  });
  it("ボタンでない場所の押しには触れない", () => {
    const div = document.createElement("div");
    document.body.append(div);
    const e = press(div, "click");
    expect(e.defaultPrevented).toBe(false);
  });
});
