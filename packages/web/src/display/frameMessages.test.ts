import { describe, expect, it } from "vitest";
import { readFrameMessage } from "./frameMessages.js";

describe("readFrameMessage（prefix の中継）", () => {
  const input = { key: "n", code: "KeyN", ctrl: false, alt: false, shift: false, meta: false };
  it("prefix-key は input が正しければ読む", () => {
    expect(readFrameMessage({ type: "prefix-key", input })).toEqual({ type: "prefix-key", input });
  });
  it.each([
    ["input 無し", { type: "prefix-key" }],
    ["key が長い", { type: "prefix-key", input: { ...input, key: "x".repeat(40) } }],
    ["修飾が真偽でない", { type: "prefix-key", input: { ...input, ctrl: 1 } }],
    ["余計な種類", { type: "key", key: "chord" }],
  ])("捨てる: %s", (_n, m) => {
    expect(readFrameMessage(m)).toBeNull();
  });
  it("key は escape と prefix だけ（従来どおり）", () => {
    expect(readFrameMessage({ type: "key", key: "escape" })).toEqual({ type: "key", key: "escape" });
    expect(readFrameMessage({ type: "key", key: "prefix" })).toEqual({ type: "key", key: "prefix" });
  });
});
