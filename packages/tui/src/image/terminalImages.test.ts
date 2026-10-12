import { expect, it } from "vitest";
import { encodeRasterPng } from "@sodashitsu/client-core/imageCodec";
import { TerminalImages, terminalImageProtocol } from "./terminalImages.js";
it("selects safe protocols and allows an explicit off switch", () => {
  expect(terminalImageProtocol({ WT_SESSION: "x" })).toBe("sixel");
  expect(terminalImageProtocol({ TERM_PROGRAM: "iTerm.app" })).toBe("iterm2");
  expect(terminalImageProtocol({ TERM: "xterm-kitty" })).toBe("kitty");
  expect(terminalImageProtocol({ WT_SESSION: "x", SODA_IMAGE_PROTOCOL: "off" })).toBeNull();
  expect(terminalImageProtocol({ WT_SESSION: "x", TMUX: "1" })).toBeNull();
});
it("positions real PNGs via Sixel/iTerm2, requests repaint and clears removed images", () => {
  const base64 = Buffer.from(
    encodeRasterPng({ width: 1, height: 1, rgba: Uint8Array.of(255, 0, 0, 255) }),
  ).toString("base64");
  for (const protocol of ["sixel", "iterm2"] as const) {
    const images = new TerminalImages(protocol, {});
    const out = images.sync([{ imageKey: "red", base64, x: 3, y: 4, cols: 2, rows: 1 }]);
    expect(out).toContain("\x1b[5;4H");
    expect(out).toContain(protocol === "sixel" ? "\x1bP" : "\x1b]1337;");
    expect(images.needsRepaint).toBe(true);
    expect(images.sync([])).toBe("");
    expect(images.needsRepaint).toBe(false);
  }
});
