import { describe, expect, it } from "vitest";
import { frameKey, placedFrameKey } from "./framePage.js";

describe("placedFrameKey", () => {
  it("frameKey に置き場所を足す。置き場所が替わると鍵が替わり、同じ置き場所なら同じ", () => {
    const info = { id: "d1", format: "text" };
    expect(placedFrameKey(info, "dock:right")).toBe(`${frameKey(info)}@dock:right`);
    expect(placedFrameKey(info, "band:top")).not.toBe(placedFrameKey(info, "band:bottom"));
    expect(placedFrameKey(info, "dock:right")).toBe(placedFrameKey({ ...info }, "dock:right"));
    const script = { id: "d1", format: "script-html", rev: 3 };
    expect(placedFrameKey(script, "sheet")).toBe("d1:script-html:3@sheet");
    expect(placedFrameKey({ ...script, rev: 4 }, "sheet")).not.toBe(placedFrameKey(script, "sheet"));
  });
});
