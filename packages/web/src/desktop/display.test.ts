import { expect, it } from "vitest";
import { chooseDisplayMode, sameDisplay } from "./display.js";
import { normalizeSettings } from "./settings.js";
const modes = [
  { width: 640, height: 480 },
  { width: 800, height: 600 },
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
];
it("chooses a supported mode that fits and preserves 1:1 with scroll when none fits", () => {
  expect(chooseDisplayMode(modes, { width: 1310, height: 800 })).toEqual(modes[2]);
  expect(chooseDisplayMode(modes, { width: 700, height: 520 })).toEqual(modes[0]);
  expect(chooseDisplayMode(modes, { width: 400, height: 250 })).toEqual(modes[0]);
  expect(chooseDisplayMode(modes, { width: 1920, height: 1080 })).toEqual(modes[3]);
  expect(chooseDisplayMode([], { width: 1000, height: 1000 })).toBeUndefined();
  expect(sameDisplay(modes[0], { ...modes[0]! })).toBe(true);
  expect(sameDisplay(undefined, modes[0])).toBe(false);
});
it("never persists display-mode changes or permission in rendering preferences", () => {
  const normalized = normalizeSettings({ display: { width: 800, height: 600 }, features: true });
  expect(normalized).not.toHaveProperty("display");
  expect(normalized).not.toHaveProperty("features");
});
