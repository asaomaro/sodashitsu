import { expect, it } from "vitest";
import { isEmbeddedAppEscape } from "./embeddedKeys.js";
it("plain Escape exits the app, but IME cancellation and modified Escape remain terminal input", () => {
  const ev = {
    key: "Escape",
    isComposing: false,
    keyCode: 27,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
  };
  expect(isEmbeddedAppEscape(ev)).toBe(true);
  for (const patch of [
    { isComposing: true },
    { keyCode: 229 },
    { ctrlKey: true },
    { altKey: true },
    { key: "Enter" },
  ])
    expect(isEmbeddedAppEscape({ ...ev, ...patch })).toBe(false);
});
