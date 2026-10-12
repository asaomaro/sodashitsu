import { expect, it } from "vitest";
import { loadStatuslineSettings, statuslineGauge, statuslineLimitKind } from "./statusline.js";
it("keeps defaults for old, partial and invalid settings without accepting arbitrary glyphs", () => {
  const s = loadStatuslineSettings({
    fields: { pane: false, context: "no" },
    graphs: { context: { visible: false, pattern: "script" }, weekly: { pattern: "dots" } },
  });
  expect(s.fields.pane).toBe(false);
  expect(s.fields.context).toBe(true);
  expect(s.graphs.context).toEqual({ visible: false, pattern: "blocks" });
  expect(statuslineGauge(62, s.graphs.context)).toBe("62%");
  expect(statuslineGauge(62, s.graphs.weekly)).toBe("●●●●●●○○○○ 62%");
  expect(statuslineGauge(Infinity, s.graphs.weekly)).toBe("—");
  expect(loadStatuslineSettings(null)).toEqual(loadStatuslineSettings({}));
});
it("separates weekly, five-hour and other windows by duration or label", () => {
  expect(statuslineLimitKind({ label: "枠", windowMinutes: 10080 })).toBe("weekly");
  expect(statuslineLimitKind({ label: "7 days" })).toBe("weekly");
  expect(statuslineLimitKind({ label: "5h" })).toBe("fiveHour");
  expect(statuslineLimitKind({ label: "枠", windowMinutes: 300 })).toBe("fiveHour");
  expect(statuslineLimitKind({ label: "15 hours" })).toBe("otherLimits");
  expect(statuslineLimitKind({ label: "17 days" })).toBe("otherLimits");
  expect(statuslineLimitKind({ label: "5h", windowMinutes: 900 })).toBe("otherLimits");
  expect(statuslineLimitKind({ label: "月" })).toBe("otherLimits");
});
