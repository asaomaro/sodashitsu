import { expect, test } from "../support/fixtures.js";

test("browser terminal loads bundled Nerd Font icons without changing ordinary text", async ({
  page,
  appServer,
}) => {
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await page.waitForSelector(".xterm-helper-textarea");
  // Observe the browser's actual rasterized glyphs, not merely PTY output bytes.
  const result = await page.evaluate(async () => {
    const family = '"Sodashitsu Nerd Symbols", monospace';
    const icons = ["\uf07b", "\ue5ff", "\uf1d3", "\u{f0151}", "\ue620"];
    const faces = await document.fonts.load(`32px ${family}`, icons.join(""));
    const pixels = (text: string, font: string) => {
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 60;
      const ctx = canvas.getContext("2d")!;
      ctx.font = `32px ${font}`;
      ctx.fillText(text, 4, 40);
      return Array.from(ctx.getImageData(0, 0, 80, 60).data).join(",");
    };
    return {
      loaded: faces.some(
        (f) => f.family.includes("Sodashitsu Nerd Symbols") && f.status === "loaded",
      ),
      iconDifferences: icons.map((icon) => pixels(icon, family) !== pixels(icon, "monospace")),
      ordinaryUnchanged: pixels("Ab09", family) === pixels("Ab09", "monospace"),
    };
  });
  expect(result.loaded).toBe(true);
  expect(result.iconDifferences).toEqual([true, true, true, true, true]);
  expect(result.ordinaryUnchanged).toBe(true);
});
