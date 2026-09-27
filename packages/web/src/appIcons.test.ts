import { describe, expect, it } from "vitest";
import html from "../index.html?raw";

/** アプリのアイコン（舵輪のパネル案 P1）。index.html が参照するファイルが public/ にあること。 */
const publicFiles = Object.keys(
  import.meta.glob("../public/*", { query: "?url", import: "default" }),
).map((p) => p.replace("../public/", ""));

describe("アプリのアイコン", () => {
  const hrefs = [
    ...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g),
  ].map((m) => m[1]!);

  it("タブのアイコン（SVG・PNG）とホーム画面のアイコンを参照する", () => {
    expect(hrefs).toEqual(["favicon.svg", "favicon-32.png", "apple-touch-icon.png"]);
  });

  it("参照するファイルとログイン画面のロゴが public/ にある", () => {
    for (const f of [...hrefs, "logo.svg"]) expect(publicFiles, f).toContain(f);
  });
});
