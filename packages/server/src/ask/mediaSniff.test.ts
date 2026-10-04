import { describe, expect, it } from "vitest";
import { isUtf8Text, sniffMedia } from "./mediaSniff.js";

const bytes = (...parts: (string | number[])[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));
const box = (brand: string, ...compat: string[]): Uint8Array => {
  const body = bytes("ftyp", brand, [0, 0, 0, 0], ...compat);
  return bytes([0, 0, 0, body.length + 4], [...body]);
};

describe("sniffMedia（先頭バイトで種類を決める）", () => {
  it("画像", () => {
    expect(sniffMedia(bytes([0x89], "PNG\r\n", [0x1a, 0x0a, 0, 0]))).toMatchObject({ kind: "png", mime: "image/png", media: "image" });
    expect(sniffMedia(bytes([0xff, 0xd8, 0xff, 0xe0]))).toMatchObject({ kind: "jpeg" });
    expect(sniffMedia(bytes("GIF89a", [0, 0]))).toMatchObject({ kind: "gif" });
    expect(sniffMedia(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toMatchObject({ kind: "webp" });
    expect(sniffMedia(box("avif", "mif1"))).toMatchObject({ kind: "avif", mime: "image/avif" });
    expect(sniffMedia(box("mif1", "avif"))).toMatchObject({ kind: "avif" });
  });
  it("音", () => {
    expect(sniffMedia(bytes("RIFF", [0, 0, 0, 0], "WAVEfmt "))).toMatchObject({ kind: "wav", media: "audio" });
    expect(sniffMedia(bytes("ID3", [3, 0]))).toMatchObject({ kind: "mp3" });
    expect(sniffMedia(bytes([0xff, 0xfb, 0x90, 0x00]))).toMatchObject({ kind: "mp3" });
    expect(sniffMedia(bytes([0xff, 0xf1, 0x50, 0x80]))).toMatchObject({ kind: "aac" });
    expect(sniffMedia(bytes("OggS", [0, 2]))).toMatchObject({ kind: "ogg" });
    expect(sniffMedia(bytes("fLaC", [0, 0]))).toMatchObject({ kind: "flac" });
    expect(sniffMedia(box("M4A ", "mp42"))).toMatchObject({ kind: "m4a", mime: "audio/mp4" });
  });
  it("SVG は XML 宣言・コメント・DOCTYPE・BOM の後の <svg だけ", () => {
    for (const t of [
      "<svg xmlns='http://www.w3.org/2000/svg'/>",
      "﻿  <?xml version='1.0'?>\n<!-- c -->\n<!DOCTYPE svg PUBLIC 'a' 'b'>\n<svg width='1'/>",
      "<!DOCTYPE svg [<!ENTITY a 'b'>]><svg/>",
    ])
      expect(sniffMedia(new TextEncoder().encode(t)), t).toMatchObject({ kind: "svg", mime: "image/svg+xml" });
    for (const t of ["<html><svg/></html>", "<svgx/>", "hello <svg/>", "<?xml version='1.0'?><html/>", "<!-- <svg/> -->"])
      expect(sniffMedia(new TextEncoder().encode(t)), t).toBeNull();
  });
  it("種類でないもの（/etc/passwd のようなテキスト・短すぎる・0 バイト）は null", () => {
    expect(sniffMedia(new TextEncoder().encode("root:x:0:0:root:/root:/bin/bash\n"))).toBeNull();
    expect(sniffMedia(bytes("abc"))).toBeNull();
    expect(sniffMedia(new Uint8Array(0))).toBeNull();
    expect(sniffMedia(bytes("RIFF", [0, 0, 0, 0], "AVI "))).toBeNull();
  });
});

describe("isUtf8Text", () => {
  it("NUL なし・UTF-8 として正しいものだけ", () => {
    expect(isUtf8Text(new TextEncoder().encode("日本語 text"))).toBe(true);
    expect(isUtf8Text(bytes("a", [0], "b"))).toBe(false);
    expect(isUtf8Text(bytes([0xff, 0xfe, 0x41]))).toBe(false);
  });
});
