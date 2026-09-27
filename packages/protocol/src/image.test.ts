import { describe, expect, it } from "vitest";
import {
  IMAGE_CHUNK_BASE64_MAX,
  IMAGE_CHUNK_BYTES,
  IMAGE_MAX_BYTES,
  IMAGE_PATH_MAX,
  imageExtension,
  isImageMimeType,
  isPastablePath,
  matchesImageMagic,
} from "./image.js";
import { METHOD_SCHEMAS } from "./messages.js";

const bytes = (...xs: (number | string)[]): Uint8Array =>
  new Uint8Array(
    xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])),
  );

describe("image の定数（20260927-clipboard-image-paste）", () => {
  it("16 MiB・1 片 768 KiB・base64 で 1 MiB", () => {
    expect(IMAGE_MAX_BYTES).toBe(16 * 1024 * 1024);
    expect(IMAGE_CHUNK_BYTES).toBe(768 * 1024);
    expect(IMAGE_CHUNK_BASE64_MAX).toBe(1024 * 1024);
  });

  it("種類と拡張子", () => {
    expect(isImageMimeType("image/png")).toBe(true);
    expect(isImageMimeType("image/bmp")).toBe(false);
    expect(isImageMimeType(1)).toBe(false);
    expect(imageExtension("image/png")).toBe("png");
    expect(imageExtension("image/jpeg")).toBe("jpg");
    expect(imageExtension("image/gif")).toBe("gif");
    expect(imageExtension("image/webp")).toBe("webp");
  });
});

describe("matchesImageMagic", () => {
  it("PNG は 8 バイトの印", () => {
    expect(matchesImageMagic("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(
      true,
    );
    expect(matchesImageMagic("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0b))).toBe(false);
    expect(matchesImageMagic("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a))).toBe(false); // 足りない
  });
  it("JPEG は FF D8 FF", () => {
    expect(matchesImageMagic("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesImageMagic("image/jpeg", bytes(0xff, 0xd8, 0xfe))).toBe(false);
    expect(matchesImageMagic("image/jpeg", bytes(0xff, 0xd8))).toBe(false); // 足りない
  });
  it("GIF は GIF87a・GIF89a", () => {
    expect(matchesImageMagic("image/gif", bytes("GIF87a"))).toBe(true);
    expect(matchesImageMagic("image/gif", bytes("GIF89a"))).toBe(true);
    expect(matchesImageMagic("image/gif", bytes("GIF88a"))).toBe(false);
    expect(matchesImageMagic("image/gif", bytes("GIF89"))).toBe(false); // 足りない
  });
  it("WebP は RIFF ???? WEBP", () => {
    expect(matchesImageMagic("image/webp", bytes("RIFF", 1, 2, 3, 4, "WEBP"))).toBe(true);
    expect(matchesImageMagic("image/webp", bytes("RIFF", 1, 2, 3, 4, "WAVE"))).toBe(false);
    expect(matchesImageMagic("image/webp", bytes("RIFX", 1, 2, 3, 4, "WEBP"))).toBe(false);
    expect(matchesImageMagic("image/webp", bytes("RIFF", 1, 2, 3, 4, "WEB"))).toBe(false); // 11 バイト
  });
  it("宣言と違う種類は偽（PNG の中身を JPEG と言っても通らない）", () => {
    expect(matchesImageMagic("image/jpeg", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(false);
  });
});

describe("isPastablePath", () => {
  it("普通の絶対パスは貼ってよい", () => {
    expect(
      isPastablePath("/home/u/.local/state/sodashitsu/clipboard-images/soda-image-x.png"),
    ).toBe(true);
    expect(isPastablePath("C:\\Users\\A B\\x.png")).toBe(true);
    expect(isPastablePath("/tmp/日本語.png")).toBe(true);
  });
  it("空・長すぎるものは断る", () => {
    expect(isPastablePath("")).toBe(false);
    expect(isPastablePath("/".repeat(IMAGE_PATH_MAX))).toBe(true);
    expect(isPastablePath("/".repeat(IMAGE_PATH_MAX + 1))).toBe(false);
  });
  it("C0・DEL・C1 を含むものは断る（bracketed paste を抜ける ESC・改行等）", () => {
    for (const c of [0x00, 0x09, 0x0a, 0x0d, 0x1b, 0x1f, 0x7f, 0x80, 0x9b, 0x9f]) {
      expect(isPastablePath(`/tmp/a${String.fromCharCode(c)}b.png`)).toBe(false);
    }
    expect(isPastablePath("/tmp/a\u00a0b.png")).toBe(true); // C1 の直後（NBSP）は通す
    expect(isPastablePath("/tmp/a b.png")).toBe(true); // 0x20 は通す
  });
  it("見た目を偽る書式制御・区切り・対になっていないサロゲートは断る。対のサロゲート（絵文字）は通す", () => {
    for (const c of [0x200e, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069, 0x2028, 0x2029]) {
      expect(isPastablePath(`/tmp/a${String.fromCharCode(c)}b.png`)).toBe(false);
    }
    expect(isPastablePath("/tmp/a\ud800b.png")).toBe(false);
    expect(isPastablePath("/tmp/a\udc00b.png")).toBe(false);
    expect(isPastablePath("/tmp/a\ud800")).toBe(false);
    expect(isPastablePath("/tmp/😀.png")).toBe(true);
    expect(isPastablePath("/tmp/a\u2030b.png")).toBe(true); // 範囲の外（‰）
  });
});

describe("pane.image.* のスキーマ", () => {
  it("begin: 種類は 4 つだけ、size は 1 以上の整数（上限はハンドラが見る）", () => {
    const s = METHOD_SCHEMAS["pane.image.begin"];
    expect(
      s.safeParse({ paneId: "p1", mime: "image/png", size: IMAGE_MAX_BYTES + 1 }).success,
    ).toBe(true);
    expect(s.safeParse({ paneId: "p1", mime: "image/bmp", size: 1 }).success).toBe(false);
    expect(s.safeParse({ paneId: "p1", mime: "image/png", size: 0 }).success).toBe(false);
    expect(s.safeParse({ paneId: "p1", mime: "image/png", size: 1.5 }).success).toBe(false);
    expect(s.safeParse({ paneId: "p1", mime: "image/png", size: 1, path: "/etc/x" }).success).toBe(
      true,
    ); // 余計な鍵は落ちる
    const parsed = s.parse({ paneId: "p1", mime: "image/png", size: 1, path: "/etc/x" });
    expect(parsed).not.toHaveProperty("path");
  });
  it("chunk: base64 の文字だけ・4 の倍数・1 MiB まで", () => {
    const s = METHOD_SCHEMAS["pane.image.chunk"];
    expect(s.safeParse({ uploadId: "u", offset: 0, data: "AAAA" }).success).toBe(true);
    expect(s.safeParse({ uploadId: "u", offset: 0, data: "AA==" }).success).toBe(true);
    expect(s.safeParse({ uploadId: "u", offset: 0, data: "AAA" }).success).toBe(false);
    expect(s.safeParse({ uploadId: "u", offset: 0, data: "AA-_" }).success).toBe(false);
    expect(
      s.safeParse({ uploadId: "u", offset: 0, data: "A".repeat(IMAGE_CHUNK_BASE64_MAX) }).success,
    ).toBe(true);
    expect(
      s.safeParse({ uploadId: "u", offset: 0, data: "A".repeat(IMAGE_CHUNK_BASE64_MAX + 4) })
        .success,
    ).toBe(false);
    expect(s.safeParse({ uploadId: "u", offset: -1, data: "AAAA" }).success).toBe(false);
  });
  it("commit・cancel: uploadId だけ", () => {
    expect(METHOD_SCHEMAS["pane.image.commit"].safeParse({ uploadId: "u" }).success).toBe(true);
    expect(METHOD_SCHEMAS["pane.image.cancel"].safeParse({ uploadId: "" }).success).toBe(false);
  });
});
