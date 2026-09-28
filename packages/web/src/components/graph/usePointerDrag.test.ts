import { afterEach, describe, expect, it, vi } from "vitest";
import { startPointerDrag } from "./usePointerDrag.js";

// 20260927-agent-graph の 03-web-graph T2：ドラッグの型（閾値・取り消し）。
function pointer(type: string, init: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init });
}

describe("startPointerDrag", () => {
  const el = document.createElement("div");
  afterEach(() => el.remove());

  function start(threshold = 4) {
    document.body.append(el);
    const h = {
      onStart: vi.fn(),
      onMove: vi.fn(),
      onEnd: vi.fn(),
      onClick: vi.fn(),
      onCancel: vi.fn(),
    };
    const s = startPointerDrag(pointer("pointerdown", { clientX: 10, clientY: 10 }), el, {
      threshold,
      ...h,
    });
    return { s, h };
  }

  it("閾値の内側で離せばクリック、超えればドラッグ（差は押した点から）", () => {
    const a = start();
    window.dispatchEvent(pointer("pointermove", { clientX: 12, clientY: 12 }));
    window.dispatchEvent(pointer("pointerup", { clientX: 12, clientY: 12 }));
    expect(a.h.onClick).toHaveBeenCalledTimes(1);
    expect(a.h.onStart).not.toHaveBeenCalled();
    const b = start();
    window.dispatchEvent(pointer("pointermove", { clientX: 20, clientY: 10 }));
    expect(b.s.dragging).toBe(true);
    expect(b.h.onMove).toHaveBeenCalledWith(expect.anything(), 10, 0);
    window.dispatchEvent(pointer("pointerup", { clientX: 25, clientY: 13 }));
    expect(b.h.onEnd).toHaveBeenCalledWith(expect.anything(), 15, 3);
    expect(b.h.onClick).not.toHaveBeenCalled();
    // 終わった後の動きは届かない
    window.dispatchEvent(pointer("pointermove", { clientX: 90, clientY: 90 }));
    expect(b.h.onMove).toHaveBeenCalledTimes(1);
  });

  it("別の pointerId は無視する", () => {
    const a = start(0);
    window.dispatchEvent(pointer("pointermove", { pointerId: 2, clientX: 50, clientY: 50 }));
    window.dispatchEvent(pointer("pointerup", { pointerId: 2 }));
    expect(a.h.onMove).not.toHaveBeenCalled();
    expect(a.h.onEnd).not.toHaveBeenCalled();
    a.s.cancel();
  });

  it("Esc・pointercancel・キャプチャを失ったら取り消す（Esc は外へ渡さない）", () => {
    const a = start();
    const outer = vi.fn();
    el.addEventListener("keydown", outer);
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    el.dispatchEvent(esc);
    expect(a.h.onCancel).toHaveBeenCalledTimes(1);
    expect(esc.defaultPrevented).toBe(true);
    expect(outer).not.toHaveBeenCalled();
    // 取り消した後の Esc は通る
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(outer).toHaveBeenCalledTimes(1);
    const b = start();
    window.dispatchEvent(pointer("pointercancel"));
    expect(b.h.onCancel).toHaveBeenCalledTimes(1);
    const c = start();
    el.dispatchEvent(pointer("lostpointercapture"));
    expect(c.h.onCancel).toHaveBeenCalledTimes(1);
    window.dispatchEvent(pointer("pointerup"));
    expect(c.h.onClick).not.toHaveBeenCalled();
  });
});
