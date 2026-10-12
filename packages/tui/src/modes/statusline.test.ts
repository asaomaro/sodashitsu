import { expect, it } from "vitest";
import { paletteColor } from "../render/color.js";
import { statuslineRows } from "./statusline.js";
it("colors status and rate limits through wrapping, decodes escaped text and ignores unknown tone values", () => {
  const rows = statuslineRows(
    '<div data-soda-statusline><span data-soda-color="active">working</span> · <span data-soda-color="danger">Context 95% &amp; cap</span><span data-soda-color="evil"> —</span></div>',
    10,
  )!;
  expect(
    rows
      .flat()
      .map((s) => s.text)
      .join(""),
  ).toBe("working · Context 95% & cap —");
  expect(rows.flat().find((s) => s.text.includes("working"))?.fg).toBe(paletteColor(6));
  expect(
    rows
      .flat()
      .filter((s) => s.fg === paletteColor(1))
      .map((s) => s.text)
      .join(""),
  ).toBe("Context 95% & cap");
  expect(rows.at(-1)!.at(-1)!.fg).toBeUndefined();
  expect(statuslineRows("<p>ordinary HTML</p>", 20)).toBeNull();
});
