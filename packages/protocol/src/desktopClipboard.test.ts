import { expect, it } from "vitest";
import {
  clipboardPngSize,
  encodeClipboardBundle,
  decodeClipboardBundle,
  DesktopRichClipboardRequest,
  DesktopRichClipboardResult,
  DESKTOP_CLIPBOARD_BUNDLE_BYTES,
} from "./desktopClipboard.js";
it("round trips Unicode HTML/RTF with plain text fallback without normalizing the content", () => {
  const value = {
    text: "表😀",
    html: '<table><tr><td style="color:red">表😀</td></tr></table>',
    rtf: btoa("{\\rtf1 a}"),
  };
  expect(decodeClipboardBundle(encodeClipboardBundle(value))).toEqual(value);
});
it("rejects oversized/unknown formats, invalid utf8/base64 and malformed native input", () => {
  for (const value of [
    {},
    { unknown: "a" },
    { html: "x".repeat(512 * 1024 + 1) },
    { text: "x".repeat(512 * 1024 + 1) },
    { rtf: "plain" },
    { png: "abc" },
  ])
    expect(() => encodeClipboardBundle(value)).toThrow();
  expect(() => decodeClipboardBundle(new Uint8Array([0xff]))).toThrow();
  expect(() => decodeClipboardBundle(new Uint8Array(DESKTOP_CLIPBOARD_BUNDLE_BYTES + 1))).toThrow();
  expect(() =>
    DesktopRichClipboardRequest.parse({
      type: "clipboard_rich",
      id: "22222222-2222-4222-8222-222222222222",
      operation: "commit",
      enabled: true,
    }),
  ).toThrow();
});
it("checks PNG dimensions before an image decoder can allocate pixels", () => {
  const png = new Uint8Array(33);
  png.set([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
  const view = new DataView(png.buffer);
  view.setUint32(16, 4096);
  view.setUint32(20, 1800);
  expect(clipboardPngSize(png)).toEqual({ width: 4096, height: 1800 });
  view.setUint32(20, 4096);
  expect(() => clipboardPngSize(png)).toThrow("dimensions");
});
it("restricts each chunk and total bundle independently", () => {
  const id = "22222222-2222-4222-8222-222222222222";
  expect(
    DesktopRichClipboardRequest.parse({
      type: "clipboard_rich",
      id,
      operation: "push",
      offset: 0,
      data: "AA==",
    }),
  ).toBeTruthy();
  expect(() =>
    DesktopRichClipboardRequest.parse({
      type: "clipboard_rich",
      id,
      operation: "push",
      offset: 0,
      data: "A".repeat(22000),
    }),
  ).toThrow();
  expect(() =>
    DesktopRichClipboardResult.parse({
      type: "clipboard_rich_result",
      id,
      ok: true,
      stage: "chunk",
      data: "!bad",
    }),
  ).toThrow();
});

it("rejects a padded base64 chunk whose decoded bytes exceed 16KiB", () => {
  const id = "22222222-2222-4222-8222-222222222222",
    data = "AAAA".repeat(5462);
  expect(data.length).toBe(21848);
  expect(() =>
    DesktopRichClipboardRequest.parse({
      type: "clipboard_rich",
      id,
      operation: "push",
      offset: 0,
      data,
    }),
  ).toThrow();
  expect(() =>
    DesktopRichClipboardResult.parse({
      type: "clipboard_rich_result",
      id,
      ok: true,
      stage: "chunk",
      data,
    }),
  ).toThrow();
});

it("keeps legacy-sized text compatible but permits larger rich plain text within the byte ceiling", () => {
  expect(
    decodeClipboardBundle(encodeClipboardBundle({ text: "x".repeat(100000) })).text?.length,
  ).toBe(100000);
  expect(() => encodeClipboardBundle({ text: "表".repeat(200000) })).toThrow();
  expect(() => encodeClipboardBundle({ rtf: btoa("{\\rtf1 x}\0") })).toThrow();
});
