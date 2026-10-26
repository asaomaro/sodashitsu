import { expect, it } from "vitest";
import { DesktopMonitorLayout, desktopMonitorAt } from "./desktopMonitors.js";
const monitors = [
  { id: "left", x: -640, y: -200, width: 640, height: 480, primary: false, scalePercent: 125 },
  { id: "right", x: 0, y: 0, width: 800, height: 600, primary: true, scalePercent: 150 },
];
const layout = {
  selected: "all",
  allSupported: true,
  bounds: { x: -640, y: -200, width: 1440, height: 800 },
  monitors,
};
it("keeps negative physical coordinates and mixed scale monitors without mapping the gaps", () => {
  expect(DesktopMonitorLayout.parse(layout)).toEqual(layout);
  const at = (x: number, y: number) =>
    desktopMonitorAt(layout, (x + 640) / 1439, (y + 200) / 799)?.id;
  expect(at(-600, -100)).toBe("left");
  expect(at(700, 500)).toBe("right");
  expect(at(500, -100)).toBeUndefined();
  expect(at(-100, 500)).toBeUndefined();
  expect(desktopMonitorAt(layout, NaN, 0)).toBeUndefined();
  expect(desktopMonitorAt(layout, 1, 1)?.id).toBe("right");
});
it("rejects duplicate IDs, wrong selected bounds, unsupported composites and missing targets", () => {
  for (const value of [
    { ...layout, monitors: [monitors[0], monitors[0]] },
    { ...layout, selected: "missing" },
    { ...layout, selected: "left" },
    { ...layout, allSupported: false },
    { ...layout, bounds: { ...layout.bounds, width: 1400 } },
  ])
    expect(() => DesktopMonitorLayout.parse(value)).toThrow();
  expect(
    DesktopMonitorLayout.parse({
      ...layout,
      selected: "left",
      bounds: { x: -640, y: -200, width: 640, height: 480 },
    }).selected,
  ).toBe("left");
});
it("uses the Windows ties-to-even physical-pixel rule at a gap boundary", () => {
  const value = {
    selected: "all",
    allSupported: true,
    bounds: { x: 0, y: 0, width: 6, height: 1 },
    monitors: [
      { id: "left", x: 0, y: 0, width: 2, height: 1, primary: true },
      { id: "right", x: 3, y: 0, width: 3, height: 1, primary: false },
    ],
  };
  expect(desktopMonitorAt(value, 0.5, 0)).toBeUndefined();
  expect(desktopMonitorAt(value, 0.6, 0)?.id).toBe("right");
});
