import source from "../../public/ask-view/links.js?raw";
import { describe, expect, it } from "vitest";

/** Markdown の枠のリンク判定（`public/ask-view/links.js`。枠の中で動くものと同じファイル）。 */
const mod: { exports: { openableHref: (href: unknown) => boolean } } = { exports: { openableHref: () => false } };
new Function("module", source)(mod);
const { openableHref } = mod.exports;

describe("openableHref", () => {
  it("小文字の http(s):// の URL だけ開ける", () => {
    expect(openableHref("https://example.com/a?b=1#c")).toBe(true);
    expect(openableHref("http://example.com")).toBe(true);
    expect(openableHref("https://user@example.com:8080/")).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<b>x</b>",
    "vbscript:x",
    "file:///etc/passwd",
    "//example.com/x",
    "/abs/path",
    "rel/path.md",
    "./x",
    "#x",
    "",
    "HTTP://example.com/",
    "Https://example.com/",
    " https://example.com/",
    "https://example.com/ ",
    "https://exa\nmple.com/",
    "https://exa\tmple.com/",
    "https://example.com/\u0000",
    "https://example.com/\u0085",
    "https:\\\\example.com",
    "https:example.com",
    "https://",
    "https:///x",
    "mailto:a@example.com",
    "ftp://example.com/",
  ])("開けない: %j", (href) => {
    expect(openableHref(href)).toBe(false);
  });
  it("文字列以外は開けない", () => {
    expect(openableHref(undefined)).toBe(false);
    expect(openableHref(null)).toBe(false);
  });
});
