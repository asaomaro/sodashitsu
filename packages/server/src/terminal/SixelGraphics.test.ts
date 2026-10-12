import { expect, it } from "vitest";
import { SixelGraphicsTranslator } from "./SixelGraphics.js";
import { decodeRasterPng } from "@sodashitsu/client-core/imageCodec";
it("translates split Sixel into an image and matching mirror cursor motion", () => {
  const t = new SixelGraphicsTranslator();
  expect(t.process("before\x1bP0;1q#1;2;100;0;0!9~")).toEqual([{ kind: "text", text: "before" }]);
  const out = t.process("-!9~\x1b\\after");
  expect(out[0]).toMatchObject({ kind: "image", mirror: "" });
  const im = out[0] as { client: string };
  const png = im.client.split(":")[1]!.slice(0, -1);
  expect(decodeRasterPng(Buffer.from(png, "base64"))).toMatchObject({ width: 9, height: 12 });
  expect(out[1]).toEqual({ kind: "text", text: "after" });
});
it("keeps ordinary DCS and split ESC sequences, and discards aborted or over-limit images", () => {
  const t = new SixelGraphicsTranslator();
  expect(t.process("\x1bP1$r\x1b\\")).toEqual([{ kind: "text", text: "\x1bP1$r\x1b\\" }]);
  expect(t.process("\x1b")).toEqual([{ kind: "text", text: "\x1b" }]);
  expect(t.process("[31mX")).toEqual([{ kind: "text", text: "[31mX" }]);
  expect(t.process("\x1bPq!999999~\x1b\\ok")).toEqual([{ kind: "text", text: "ok" }]);
  expect(t.process("\x1bPq~\x18ok")).toEqual([{ kind: "text", text: "\x18ok" }]);
});
it("recognizes C1 ST without consuming following text", () => {
  const t = new SixelGraphicsTranslator();
  expect(t.process("\x1bP1$r\x9cprompt")).toEqual([{ kind: "text", text: "\x1bP1$r\x1b\\prompt" }]);
  expect(t.process("\x90q#1;2;100;0;0!9~\x9cafter")[1]).toEqual({ kind: "text", text: "after" });
});
it("does not delay a trailing ESC and cancels its emitted prefix if the next chunk is Sixel", () => {
  const t = new SixelGraphicsTranslator();
  expect(t.process("text\x1b")).toEqual([{ kind: "text", text: "text\x1b" }]);
  const out = t.process("Pq#1;2;100;0;0!9~\x1b\\");
  expect(out[0]).toEqual({ kind: "text", text: "\x18" });
  expect(out[1]).toMatchObject({ kind: "image" });
});
