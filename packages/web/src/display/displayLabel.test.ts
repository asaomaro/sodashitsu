import { describe, expect, it } from "vitest";
import { displayBandLabel, displayLabel } from "./displayLabel.js";

describe("displayLabel", () => {
  it("固定の文は面の名前だけで決まる。知らない項目（source など）があっても壊れない", () => {
    expect(displayLabel({ name: "main" })).toBe("pane のプログラムの表示（隔離）· main");
    const withExtra = { name: "main", title: "<b>x</b>", source: "ext-a", other: 1 } as unknown as Parameters<typeof displayLabel>[0];
    expect(displayLabel(withExtra)).toBe("pane のプログラムの表示（隔離）· main");
  });
  it("帯の印は題を添える（題は文字のまま）", () => {
    expect(displayBandLabel({ name: "b", title: "<i>t</i>" })).toBe("pane のプログラムの表示（隔離）· b: <i>t</i>");
  });
});
