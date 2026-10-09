import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENGAGE_SETTLE_MS, installEngageGuard } from "./engageGuard.js";

type R = { x: number; y: number; w: number; h: number };
let t = 1000;
let off: (() => void) | null = null;
const blocked: (string | null)[] = [];
const clicks: string[] = [];
const rects = new Map<Element, R>();
/** ボタンの上に乗って、点を覆うもの（窓など）。 */
let covers: R[] = [];

const inside = (r: R, x: number, y: number): boolean => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

function face(id: string, r: R): HTMLButtonElement {
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
  for (const ty of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) press(el, ty);
};
/** 見回りを 1 回進める。 */
const tick = (): void => {
  t += 60;
  vi.advanceTimersByTime(60);
};
/** 500ms より長く、何も動かない状態にする。 */
const settle = (): void => {
  tick();
  t += ENGAGE_SETTLE_MS + 20;
  tick();
  t += ENGAGE_SETTLE_MS + 20;
};

beforeEach(() => {
  vi.useFakeTimers();
  t = 1000;
  blocked.length = 0;
  clicks.length = 0;
  covers = [];
  rects.clear();
  document.elementFromPoint = (x: number, y: number): Element | null => {
    if (covers.some((c) => inside(c, x, y))) return document.body;
    for (const [b, r] of rects) if (b.isConnected && inside(r, x, y)) return b;
    return document.body;
  };
  off = installEngageGuard({ onBlocked: (id) => blocked.push(id), now: () => t });
});
afterEach(() => {
  off?.();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("installEngageGuard（［操作する］は、画面のどれかの箱が直前に動いていたら、すべての押しを受けない）", () => {
  it("動いていないボタンは、遅れずに効く。面が 1 つだけでも、出て 500ms 後なら効く", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    tick();
    fullPress(a); // 出た直後（見回りが見たばかり）は受けない
    expect(clicks).toEqual([]);
    settle();
    fullPress(a);
    expect(clicks).toEqual(["a"]);
    fullPress(a);
    expect(clicks).toEqual(["a", "a"]);
  });
  it("見回りが一度も見ていないボタンへの押しは、必ず『現れた』として受けない（面が 1 つだけでも）", () => {
    settle();
    const n = face("n", { x: 10, y: 10, w: 60, h: 24 }); // 見回りの前に押される
    fullPress(n);
    expect(clicks).toEqual([]);
    expect(blocked).toEqual(["n"]);
  });
  it("R1: 面が 1 つ消えて 1 つ現れる（close → set。同じ場所）と、すぐの押しは受けない。500ms 後は受ける", () => {
    const a = face("pa", { x: 100, y: 10, w: 60, h: 24 });
    settle();
    fullPress(a);
    expect(clicks).toEqual(["pa"]);
    a.parentElement!.remove();
    rects.delete(a);
    const b = face("pb", { x: 100, y: 10, w: 60, h: 24 });
    tick();
    fullPress(b);
    expect(clicks).toEqual(["pa"]);
    expect(blocked.length).toBeGreaterThan(0);
    settle();
    fullPress(b);
    expect(clicks).toEqual(["pa", "pb"]);
  });
  it("要素は同じでも、面の id が替わったら、動いたと見なす", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    settle();
    a.parentElement!.setAttribute("data-display-root", "other");
    tick();
    fullPress(a);
    expect(clicks).toEqual([]);
  });
  it("R2: ほかのボタン（窓の中）だけが動いて、押すボタンの箱は動かない（中心は覆われたまま・端だけが出る）と、押しを受けない", () => {
    const target = face("T", { x: 300, y: 10, w: 200, h: 24 });
    const n = face("N", { x: 450, y: 10, w: 60, h: 24 });
    covers = [{ x: 20, y: 0, w: 480, h: 60 }]; // 窓 W が T を覆う（N は W の中）
    rects.set(n, { x: 450, y: 10, w: 40, h: 24 });
    settle();
    // W と N が左へ動く。T の箱は動かず、中心は覆われたまま、右の端だけが出る
    covers = [{ x: 20, y: 0, w: 400, h: 60 }];
    rects.set(n, { x: 370, y: 10, w: 40, h: 24 });
    tick();
    press(target, "pointerdown"); // 端（x=490）を押した
    press(target, "click");
    expect(clicks).toEqual([]);
    expect(blocked.length).toBeGreaterThan(0);
    settle();
    fullPress(target);
    expect(clicks).toEqual(["T"]);
  });
  it("覆われた（見えなくなった）直後も受けない", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    settle();
    covers = [{ x: 0, y: 0, w: 100, h: 100 }];
    tick();
    covers = [];
    fullPress(a); // 覆いが外れた直後（見え方が変わった）
    expect(clicks).toEqual([]);
  });
  it("直前の 500ms に箱が動いたボタンは、押しを受けない。強調の通知が 1 回。500ms 待てば効く", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    face("b", { x: 200, y: 10, w: 60, h: 24 });
    settle();
    rects.set(a, { x: 150, y: 10, w: 60, h: 24 });
    t += 100;
    fullPress(a);
    expect(clicks).toEqual([]);
    expect(blocked).toEqual(["a"]);
    settle();
    fullPress(a);
    expect(clicks).toEqual(["a"]);
  });
  it("R3: 押し始めを止めて、click が出ないまま 2 秒たつと、後のキーボードの押し（click だけ）は受ける。押し始めを止めたときにも知らせる", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    settle();
    rects.set(a, { x: 11, y: 10, w: 60, h: 24 });
    press(a, "pointerdown");
    expect(blocked).toEqual(["a"]); // 押し始めを止めたときに知らせる
    // 外で離した（click が出ない）→ しばらくして
    t += 3000;
    tick();
    settle();
    press(a, "click"); // キーボードの Enter
    expect(clicks).toEqual(["a"]);
  });
  it("押し始めを止めた長押しは、500ms を過ぎても、その押しの click を受けない。知らせは 1 回だけ", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    settle();
    rects.set(a, { x: 11, y: 10, w: 60, h: 24 });
    press(a, "pointerdown");
    t += 900;
    press(a, "pointerup");
    press(a, "click");
    expect(clicks).toEqual([]);
    expect(blocked).toEqual(["a"]);
  });
  it("本物でない押し（isTrusted でない）は、止めない。ボタンでない場所の押しには触れない", () => {
    const a = face("a", { x: 10, y: 10, w: 60, h: 24 });
    a.click();
    expect(clicks).toEqual(["a"]);
    const div = document.createElement("div");
    document.body.append(div);
    expect(press(div, "click").defaultPrevented).toBe(false);
  });
});
