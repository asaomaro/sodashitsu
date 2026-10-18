import { expect, it } from "vitest";
import { chooseMaximumDisplayMode, sameDisplay } from "./display.js";
import { normalizeSettings } from "./settings.js";
const modes = [
  { width: 640, height: 480 },
  { width: 800, height: 600 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
it("chooses the largest supported mode by pixel count without mutating the mode list", () => {
  const original = structuredClone(modes);
  expect(chooseMaximumDisplayMode(modes)).toEqual(modes[3]);
  expect(chooseMaximumDisplayMode([...modes].reverse())).toEqual(modes[3]);
  expect(modes).toEqual(original);
  expect(chooseMaximumDisplayMode([{width:2560,height:800}, {width:1920,height:1200}])).toEqual({width:1920,height:1200});
  expect(chooseMaximumDisplayMode([])).toBeUndefined();
  expect(sameDisplay(modes[0], { ...modes[0]! })).toBe(true);
  expect(sameDisplay(undefined, modes[0])).toBe(false);
});
it("excludes modes beyond the capture limits and resolves equal areas deterministically", () => {
  expect(chooseMaximumDisplayMode([...modes, {width:7680,height:4320}, {width:4096,height:2400}, {width:319,height:200}])).toEqual(modes[3]);
  expect(chooseMaximumDisplayMode([{width:1920,height:1200}, {width:2560,height:900}])).toEqual({width:2560,height:900});
});
it("never persists display-mode changes or permission in rendering preferences", () => {
  const normalized = normalizeSettings({ display: { width: 800, height: 600 }, features: true });
  expect(normalized).not.toHaveProperty("display");
  expect(normalized).not.toHaveProperty("features");
});
