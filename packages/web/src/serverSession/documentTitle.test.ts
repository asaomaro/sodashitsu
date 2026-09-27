import { describe, expect, it } from "vitest";
import { documentTitle } from "./documentTitle.js";

/** 20260926-named-session-ui（AC3・AC17）。 */
describe("documentTitle", () => {
  it("既定の session は今までどおり（{hostname}: {workspace}・欠ければ Sodashitsu）", () => {
    expect(documentTitle("host", undefined, "ws")).toBe("host: ws");
    expect(documentTitle("host", undefined, null)).toBe("Sodashitsu");
    expect(documentTitle(undefined, undefined, "ws")).toBe("Sodashitsu");
    expect(documentTitle("", undefined, "ws")).toBe("Sodashitsu");
  });

  it("名前付き session は名前を含む", () => {
    expect(documentTitle("host", "work", "ws")).toBe("host [work]: ws");
    expect(documentTitle("host", "work", undefined)).toBe("Sodashitsu [work]");
  });
});
