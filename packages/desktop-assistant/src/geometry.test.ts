import { expect, it } from "vitest";
import { DesktopAssistantPreferences } from "@sodashitsu/protocol";
import { bubbleBounds } from "./geometry.js";
it("keeps character and tray bubbles within the selected secondary monitor and falls back on removal", () => {
  const displays = [
    { id: "primary", workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
    { id: "secondary", workArea: { x: -640, y: 0, width: 640, height: 480 } },
  ];
  const prefs = DesktopAssistantPreferences.parse({
    position: { displayId: "secondary", x: -620, y: 430 },
  });
  const bounds = bubbleBounds(prefs, displays);
  expect(bounds).toMatchObject({ width: 400, height: 480, y: 0 });
  expect(bounds.x).toBeGreaterThanOrEqual(-640);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(0);
  const fallback = bubbleBounds(prefs, displays.slice(0, 1));
  expect(fallback.x).toBeGreaterThanOrEqual(0);
  expect(fallback.y).toBeGreaterThanOrEqual(0);
  expect(bubbleBounds({ ...prefs, mode: "tray" }, displays).y).toBe(0);
});
