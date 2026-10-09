import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DOCK_DRAGGING_CLASS, createDockDrag, type DockDragState, type DockZone } from "./dockDrag.js";

const box = { left: 0, top: 0, width: 1000, height: 600 };
const ev = (type: string, x: number, y: number, extra: Record<string, unknown> = {}): PointerEvent => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  for (const [k, v] of Object.entries({ clientX: x, clientY: y, button: 0, pointerId: 1, currentTarget: grip, ...extra })) Object.defineProperty(e, k, { value: v });
  return e as unknown as PointerEvent;
};
let grip: HTMLElement;
let states: (DockDragState | null)[];
let drops: DockZone[];
let modal = false;
let handle: ReturnType<typeof createDockDrag>;
const html = (): boolean => document.documentElement.classList.contains(DOCK_DRAGGING_CLASS);

beforeEach(() => {
  grip = document.createElement("div");
  grip.setPointerCapture = vi.fn();
  grip.releasePointerCapture = vi.fn();
  document.body.append(grip);
  states = [];
  drops = [];
  modal = false;
  handle = createDockDrag({ id: "f1", paneId: "p1", box: () => box, float: () => false, setState: (s) => states.push(s), drop: (z) => drops.push(z), modalOpen: () => modal });
});
afterEach(() => {
  handle.cancel();
  document.body.innerHTML = "";
  document.documentElement.classList.remove(DOCK_DRAGGING_CLASS);
});

describe("createDockDrag", () => {
  it("6px 未満は、ただの押下（何もしない）。離しても落とさない", () => {
    handle.onPointerDown(ev("pointerdown", 500, 300));
    handle.onPointerMove(ev("pointermove", 504, 303)); // 距離 5
    expect(handle.dragging()).toBe(false);
    expect(html()).toBe(false);
    handle.onPointerUp(ev("pointerup", 504, 303));
    expect(drops).toEqual([]);
    expect(states).toEqual([]);
  });
  it("6px 動くと始まり、html にクラス・状態に場所。各場所で離すと、その場所で落とす（中央は落とせない）", () => {
    const cases: [number, number, DockZone | null][] = [[500, 30, "top"], [500, 580, "bottom"], [30, 300, "left"], [970, 300, "right"], [500, 300, null], [-10, 300, null]];
    for (const [x, y, want] of cases) {
      drops.length = 0;
      handle.onPointerDown(ev("pointerdown", 400, 300));
      handle.onPointerMove(ev("pointermove", x, y));
      if (x === 400) continue;
      expect(handle.dragging()).toBe(true);
      expect(html()).toBe(true);
      expect(states.at(-1)).toEqual({ id: "f1", paneId: "p1", zone: want });
      handle.onPointerUp(ev("pointerup", x, y));
      expect(html()).toBe(false);
      expect(states.at(-1)).toBeNull();
      expect(drops, `${x},${y}`).toEqual(want === null ? [] : [want]);
    }
  });
  it("押したのが左ボタンでなければ始めない。フォーカスを移さない（pointerdown を preventDefault）", () => {
    const down = ev("pointerdown", 1, 1);
    handle.onPointerDown(down);
    expect(down.defaultPrevented).toBe(true);
    handle.cancel();
    handle.onPointerDown(ev("pointerdown", 1, 1, { button: 2 }));
    handle.onPointerMove(ev("pointermove", 100, 100));
    expect(handle.dragging()).toBe(false);
  });
  it("取り消し 5 通り: Esc・pointercancel・lostpointercapture（pointerup 前）・modal が開いた・外から cancel。どれも落とさず、状態とクラスを戻す", () => {
    const start = (): void => {
      handle.onPointerDown(ev("pointerdown", 400, 300));
      handle.onPointerMove(ev("pointermove", 30, 300));
      expect(html()).toBe(true);
    };
    const check = (label: string): void => {
      expect(html(), label).toBe(false);
      expect(states.at(-1), label).toBeNull();
      expect(drops, label).toEqual([]);
      expect(handle.dragging(), label).toBe(false);
    };
    start();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    check("Esc");
    start();
    handle.onPointerCancel(ev("pointercancel", 30, 300));
    check("pointercancel");
    start();
    handle.onPointerCancel(ev("lostpointercapture", 30, 300));
    check("lostpointercapture");
    modal = true;
    handle.onPointerDown(ev("pointerdown", 400, 300));
    handle.onPointerMove(ev("pointermove", 30, 300));
    check("modal が開いた");
    modal = false;
    start();
    handle.cancel();
    check("cancel");
    // 取り消した後に離しても、落とさない
    handle.onPointerUp(ev("pointerup", 30, 300));
    expect(drops).toEqual([]);
  });
  it("ドラッグ中のキーは端末へ流さない（preventDefault・stopPropagation）。始まる前の Esc 以外は触らない", () => {
    handle.onPointerDown(ev("pointerdown", 400, 300));
    const before = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false); // 6px 動く前は、ふつうのキー
    handle.onPointerMove(ev("pointermove", 30, 300));
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    const during = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled(); // capture で止まる
    document.removeEventListener("keydown", seen);
  });
  it("つかんだ面が途中で替わったら（見出しの部品が別の面の見出しになった）、動かす・離すとき取り消す。別の面を動かさない", () => {
    let id = "f1";
    const h = createDockDrag({ get id() { return id; }, paneId: "p1", box: () => box, float: () => false, setState: (s) => states.push(s), drop: (z) => drops.push(z) });
    // 動かす途中で替わる → 取り消し（状態・クラスを戻し、離しても落とさない）
    h.onPointerDown(ev("pointerdown", 400, 300));
    h.onPointerMove(ev("pointermove", 30, 300));
    expect(html()).toBe(true);
    id = "f2";
    h.onPointerMove(ev("pointermove", 40, 300));
    expect(html()).toBe(false);
    expect(states.at(-1)).toBeNull();
    expect(h.dragging()).toBe(false);
    h.onPointerUp(ev("pointerup", 40, 300));
    expect(drops).toEqual([]);
    // 離す瞬間に替わっていても、落とさない
    id = "f1";
    h.onPointerDown(ev("pointerdown", 400, 300));
    h.onPointerMove(ev("pointermove", 30, 300));
    id = "f2";
    h.onPointerUp(ev("pointerup", 30, 300));
    expect(drops).toEqual([]);
    expect(html()).toBe(false);
    expect(states.at(-1)).toBeNull();
    // 替わらなければ、いつもどおり落とす
    id = "f1";
    h.onPointerDown(ev("pointerdown", 400, 300));
    h.onPointerMove(ev("pointermove", 30, 300));
    h.onPointerUp(ev("pointerup", 30, 300));
    expect(drops).toEqual(["left"]);
  });
  it("箱が取れなければ、何も落とせない", () => {
    const h = createDockDrag({ id: "f1", paneId: "p1", box: () => null, float: () => false, setState: (s) => states.push(s), drop: (z) => drops.push(z) });
    h.onPointerDown(ev("pointerdown", 400, 300));
    h.onPointerMove(ev("pointermove", 30, 300));
    h.onPointerUp(ev("pointerup", 30, 300));
    expect(drops).toEqual([]);
  });
});

describe("createDockDrag — 中央（浮いた窓。PR-C）", () => {
  it("float が真のとき、中央で離すと 'float' で落とし、離した位置を渡す。偽なら落とせない", () => {
    const at: { x: number; y: number }[] = [];
    const h = createDockDrag({ id: "f1", paneId: "p1", box: () => box, float: () => true, setState: (s) => states.push(s), drop: (z, p) => (drops.push(z), at.push(p)) });
    h.onPointerDown(ev("pointerdown", 400, 300));
    h.onPointerMove(ev("pointermove", 520, 310));
    expect(states.at(-1)).toEqual({ id: "f1", paneId: "p1", zone: "float" });
    h.onPointerUp(ev("pointerup", 520, 310));
    expect(drops).toEqual(["float"]);
    expect(at).toEqual([{ x: 520, y: 310 }]);
    expect(html()).toBe(false);
    h.cancel();
  });
  it("Esc で取り消すと、落とさない（窓にならない）", () => {
    const h = createDockDrag({ id: "f1", paneId: "p1", box: () => box, float: () => true, setState: (s) => states.push(s), drop: (z) => drops.push(z) });
    h.onPointerDown(ev("pointerdown", 400, 300));
    h.onPointerMove(ev("pointermove", 520, 310));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    h.onPointerUp(ev("pointerup", 520, 310));
    expect(drops).toEqual([]);
    expect(html()).toBe(false);
  });
});
