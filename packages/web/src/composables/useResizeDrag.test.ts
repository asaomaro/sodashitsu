import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { useResizeDrag, type ResizeDragOptions } from "./useResizeDrag.js";

const created: { finish(): void }[] = [];

function setup(over: Partial<ResizeDragOptions<number>> = {}) {
  const calls: string[] = [];
  const el = document.createElement("div");
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();
  const opts: ResizeDragOptions<number> = {
    axis: "x",
    begin: () => {
      calls.push("begin");
      return 100;
    },
    move: (ev, s) => calls.push(`move:${ev.clientX}:${s}`),
    commit: (s) => calls.push(`commit:${s}`),
    cancel: (s) => calls.push(`cancel:${s}`),
    reset: () => calls.push("reset"),
    ...over,
  };
  const drag = useResizeDrag(opts);
  created.push(drag);
  const ev = (init: { button?: number; clientX?: number; clientY?: number } = {}) => {
    const e = {
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      currentTarget: el,
      preventDefault: vi.fn(),
      ...init,
    };
    return e as unknown as PointerEvent & { preventDefault: ReturnType<typeof vi.fn> };
  };
  return { calls, el, drag, ev };
}

function key(k: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  document.body.dispatchEvent(e); // 実際のキー入力と同じく、window の capture を通って下へ伝わる経路
  return e;
}

const html = () => document.documentElement.classList;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  for (const d of created.splice(0)) d.finish(); // 終えていないドラッグの window リスナーを次のテストへ残さない
  vi.useRealTimers();
  html().remove("soda-resizing", "soda-resizing-x", "soda-resizing-y");
});

describe("useResizeDrag", () => {
  it("左ボタン以外では始めない", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev({ button: 2 }));
    expect(calls).toEqual([]);
    expect(drag.dragging.value).toBe(false);
  });

  it("enabled が false なら始めない（preventDefault もしない）", () => {
    const { calls, drag, ev } = setup({ enabled: () => false });
    const e = ev();
    drag.onPointerDown(e);
    expect(calls).toEqual([]);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("pointerdown でフォーカスを移さず（preventDefault）、pointer capture と begin を呼ぶ", () => {
    const { calls, el, drag, ev } = setup();
    const e = ev();
    drag.onPointerDown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(el.setPointerCapture).toHaveBeenCalledWith(1);
    expect(calls).toEqual(["begin"]);
    expect(drag.dragging.value).toBe(true);
  });

  it("続けて届いた move は 1 回の描画で 1 回にまとまり、最後のイベントが使われる（AC21）", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerMove(ev({ clientX: 10 }));
    drag.onPointerMove(ev({ clientX: 20 }));
    drag.onPointerMove(ev({ clientX: 30 }));
    expect(calls).toEqual(["begin"]);
    vi.advanceTimersByTime(50);
    expect(calls).toEqual(["begin", "move:30:100"]);
  });

  it("離すと、ためた移動を反映してから commit する", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerMove(ev({ clientX: 40 }));
    drag.onPointerEnd(ev());
    expect(calls).toEqual(["begin", "move:40:100", "commit:100"]);
    vi.advanceTimersByTime(50);
    expect(calls).toHaveLength(3); // 描画の予約は捨てられている
    expect(drag.dragging.value).toBe(false);
  });

  it("動かさずに離したら commit を呼ばない", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerEnd(ev());
    expect(calls).toEqual(["begin"]);
  });

  it("2 回目の pointerup／lostpointercapture は何もしない", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerMove(ev({ clientX: 5 }));
    drag.onPointerEnd(ev());
    drag.onPointerEnd(ev());
    expect(calls.filter((c) => c.startsWith("commit"))).toHaveLength(1);
  });

  it("Esc で cancel（commit は呼ばれず、ためた移動は捨てる）", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerMove(ev({ clientX: 40 }));
    const e = key("Escape");
    expect(e.defaultPrevented).toBe(true);
    expect(calls).toEqual(["begin", "cancel:100"]);
    vi.advanceTimersByTime(50);
    drag.onPointerEnd(ev());
    expect(calls).toEqual(["begin", "cancel:100"]);
    expect(html().contains("soda-resizing")).toBe(false);
  });

  it("ドラッグ中のほかのキーは preventDefault と stopPropagation の両方で止める", () => {
    const { drag, ev } = setup();
    drag.onPointerDown(ev());
    const spy = vi.fn();
    document.body.addEventListener("keydown", spy);
    const e = key("a");
    document.body.removeEventListener("keydown", spy);
    expect(e.defaultPrevented).toBe(true);
    expect(spy).not.toHaveBeenCalled(); // capture で止まり、下へ伝わらない
    drag.finish();
    const after = key("a");
    expect(after.defaultPrevented).toBe(false);
  });

  it("350ms 以内の 2 回目の pointerdown は reset（ドラッグは始めない）", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerEnd(ev());
    vi.advanceTimersByTime(100);
    drag.onPointerDown(ev());
    expect(calls).toEqual(["begin", "reset"]);
    expect(drag.dragging.value).toBe(false);
  });

  it("動かしたドラッグの直後（350ms 以内）の pointerdown は reset ではなく新しいドラッグ（素早い 2 回のドラッグで保存した値を消さない）", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerMove(ev({ clientX: 5 }));
    drag.onPointerEnd(ev());
    vi.advanceTimersByTime(100);
    drag.onPointerDown(ev());
    expect(calls).toEqual(["begin", "move:5:100", "commit:100", "begin"]);
    expect(calls).not.toContain("reset");
    expect(drag.dragging.value).toBe(true);
  });

  it("押している間の数 px のぶれは動かしたことにしない（commit・move を呼ばず、直後の pointerdown はダブルクリックの reset）", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev({ clientX: 10, clientY: 10 }));
    drag.onPointerMove(ev({ clientX: 11, clientY: 12 }));
    vi.advanceTimersByTime(20);
    drag.onPointerEnd(ev());
    vi.advanceTimersByTime(100);
    drag.onPointerDown(ev({ clientX: 10, clientY: 10 }));
    expect(calls).toEqual(["begin", "reset"]);
  });

  it("しきい値（3px）以上動けば動かしたことになる（ぶれを超えた後は小さな動きも反映する）", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev({ clientX: 10, clientY: 10 }));
    drag.onPointerMove(ev({ clientX: 13, clientY: 10 }));
    drag.onPointerMove(ev({ clientX: 11, clientY: 10 }));
    drag.onPointerEnd(ev());
    expect(calls).toEqual(["begin", "move:11:100", "commit:100"]);
  });

  it("Esc で取り消した直後の pointerdown も reset ではない", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    key("Escape");
    vi.advanceTimersByTime(100);
    drag.onPointerDown(ev());
    expect(calls).toEqual(["begin", "cancel:100", "begin"]);
  });

  it("reset の直後の 3 回目の pointerdown は新しいクリックの 1 回目（続けて reset にならない）", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerEnd(ev());
    drag.onPointerDown(ev()); // reset
    vi.advanceTimersByTime(50);
    drag.onPointerDown(ev());
    expect(calls).toEqual(["begin", "reset", "begin"]);
  });

  it("ドラッグ中の 2 本目の pointerdown は reset も新しいドラッグも始めない", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerDown(ev());
    expect(calls).toEqual(["begin"]);
    expect(drag.dragging.value).toBe(true);
  });

  it("releasePointerCapture が lostpointercapture を同期で起こしても、commit は 1 回", () => {
    const { calls, el, drag, ev } = setup();
    el.releasePointerCapture = vi.fn(() => drag.onPointerEnd(ev()));
    drag.onPointerDown(ev());
    drag.onPointerMove(ev({ clientX: 3 }));
    drag.onPointerEnd(ev());
    expect(calls.filter((c) => c.startsWith("commit"))).toEqual(["commit:100"]);
  });

  it("350ms を過ぎた 2 回目は新しいドラッグ", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerEnd(ev());
    vi.advanceTimersByTime(400);
    drag.onPointerDown(ev());
    expect(calls).toEqual(["begin", "begin"]);
  });

  it("ドラッグ中は <html> に soda-resizing と向きのクラス、終わったら外す", () => {
    const { drag, ev } = setup({ axis: "y" });
    drag.onPointerDown(ev());
    expect(html().contains("soda-resizing")).toBe(true);
    expect(html().contains("soda-resizing-y")).toBe(true);
    drag.onPointerEnd(ev());
    expect(html().contains("soda-resizing")).toBe(false);
    expect(html().contains("soda-resizing-y")).toBe(false);
  });

  it("finish() は動かしていれば確定する", () => {
    const { calls, drag, ev } = setup();
    drag.onPointerDown(ev());
    drag.onPointerMove(ev({ clientX: 7 }));
    drag.finish();
    expect(calls).toEqual(["begin", "move:7:100", "commit:100"]);
    expect(drag.dragging.value).toBe(false);
  });

  it("unmount で <html> のクラスと window のリスナーを外す", () => {
    const calls: string[] = [];
    let drag!: ReturnType<typeof useResizeDrag<number>>;
    const C = defineComponent({
      setup() {
        drag = useResizeDrag<number>({
          axis: "x",
          begin: () => 1,
          move: () => undefined,
          commit: () => calls.push("commit"),
          cancel: () => undefined,
          reset: () => undefined,
        });
        return () => h("div");
      },
    });
    const w = mount(C, { attachTo: document.body });
    drag.onPointerDown({ button: 0, pointerId: 1, currentTarget: null, preventDefault: () => undefined } as unknown as PointerEvent);
    drag.onPointerMove({ clientX: 1 } as PointerEvent);
    expect(html().contains("soda-resizing")).toBe(true);
    w.unmount();
    expect(html().contains("soda-resizing")).toBe(false);
    expect(key("a").defaultPrevented).toBe(false);
    expect(calls).toEqual(["commit"]);
  });
});
