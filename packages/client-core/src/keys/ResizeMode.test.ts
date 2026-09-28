import { describe, expect, it } from "vitest";
import type { KeyInput } from "./actions.js";
import { ResizeMode } from "./ResizeMode.js";

function key(k: string): KeyInput {
  return { key: k, code: "", ctrl: false, alt: false, shift: false, meta: false, type: "keydown", composing: false };
}

describe("ResizeMode", () => {
  const mode = new ResizeMode();

  it("h/j/k/l・矢印で 0.05 ずつ動かす方向を返す（留まる）", () => {
    expect(mode.handle(key("h"))).toEqual({ action: { type: "resizeBy", dir: "left", amount: 0.05 } });
    expect(mode.handle(key("j"))).toEqual({ action: { type: "resizeBy", dir: "down", amount: 0.05 } });
    expect(mode.handle(key("k"))).toEqual({ action: { type: "resizeBy", dir: "up", amount: 0.05 } });
    expect(mode.handle(key("l"))).toEqual({ action: { type: "resizeBy", dir: "right", amount: 0.05 } });
    expect(mode.handle(key("ArrowLeft"))).toEqual({ action: { type: "resizeBy", dir: "left", amount: 0.05 } });
    expect(mode.handle(key("ArrowDown"))).toEqual({ action: { type: "resizeBy", dir: "down", amount: 0.05 } });
    expect(mode.handle(key("ArrowUp"))).toEqual({ action: { type: "resizeBy", dir: "up", amount: 0.05 } });
    expect(mode.handle(key("ArrowRight"))).toEqual({ action: { type: "resizeBy", dir: "right", amount: 0.05 } });
  });

  it("Esc・Enter・素の r で抜ける（herdr の実測。D56 の訂正 3）", () => {
    expect(mode.handle(key("Escape"))).toEqual({ exit: true });
    expect(mode.handle(key("Enter"))).toEqual({ exit: true });
    expect(mode.handle(key("r"))).toEqual({ exit: true });
  });

  it("割り当ての無いキーは何もしない（留まる）", () => {
    expect(mode.handle(key("z"))).toEqual({});
  });
});
