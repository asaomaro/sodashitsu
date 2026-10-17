import { beforeEach, expect, it } from "vitest";
import { loadSettings, normalizeSettings, presets, saveSettings } from "./settings.js";
beforeEach(() => localStorage.clear());
it("keeps preferences per machine and accepts no permissions or credentials", () => {
  expect(loadSettings("a")).toEqual(presets.balanced);
  expect(saveSettings("a", presets.low)).toBe(true);
  expect(loadSettings("a")).toEqual(presets.low);
  expect(loadSettings("b")).toEqual(presets.balanced);
  expect(() => normalizeSettings({ ...presets.low, ticket: "secret", allowInput: true })).toThrow();
  localStorage.setItem(
    "soda:desktop:connection:v1:a",
    JSON.stringify({ ...presets.low, fps: 100 }),
  );
  expect(loadSettings("a")).toEqual(presets.balanced);
  localStorage.setItem("soda:desktop:connection:v1:a", "{");
  expect(loadSettings("a")).toEqual(presets.balanced);
});
it("rejects invalid image modes and connection bounds before reconnecting", () => {
  for (const value of [
    { fps: 0 },
    { width: 8192 },
    { quality: 100 },
    { image: { colorMode: "shell", showCursor: true } },
    { image: { colorMode: "full", showCursor: "yes" } },
  ])
    expect(() => normalizeSettings(value)).toThrow();
});
