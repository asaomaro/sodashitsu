/**
 * クリップボードの画像の貼り付け（20260927-clipboard-image-paste。herdr の `remote_image_paste`・H44）でサーバとブラウザが共有する定数と判定。
 * ブラウザが画像を分けて送り（`pane.image.begin`/`chunk`/`commit`）、サーバが状態ディレクトリの下に置いてパスを返し、ブラウザがそのパスを pane へ貼る。
 */

/** 受け付ける画像の種類（herdr の png/jpg/gif/webp。BMP は受けない）。 */
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

/** 1 枚の上限（herdr の `MAX_CLIPBOARD_IMAGE_PAYLOAD` と同じ 16 MiB）。 */
export const IMAGE_MAX_BYTES = 16 * 1024 * 1024;
/** 1 片の生のバイト数（base64 で 1 MiB。`/ws`・中継の 1 通 4 MiB に余裕を持って収まる。decisions D3）。 */
export const IMAGE_CHUNK_BYTES = 768 * 1024;
/** 1 片の base64 の文字数の上限（`IMAGE_CHUNK_BYTES` × 4 / 3）。 */
export const IMAGE_CHUNK_BASE64_MAX = (IMAGE_CHUNK_BYTES / 3) * 4;
/** ブラウザが貼り付けを受け付けるパスの長さの上限（decisions D7）。 */
export const IMAGE_PATH_MAX = 4096;

export function isImageMimeType(v: unknown): v is ImageMimeType {
  return typeof v === "string" && (IMAGE_MIME_TYPES as readonly string[]).includes(v);
}

/** 置くファイルの拡張子。 */
export function imageExtension(mime: ImageMimeType): "png" | "jpg" | "gif" | "webp" {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
  }
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(head: Uint8Array, bytes: readonly number[], at = 0): boolean {
  if (head.length < at + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (head[at + i] !== bytes[i]) return false;
  return true;
}

function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0));
}

/**
 * 先頭のバイトが宣言した種類のものか（PNG: 89 50 4E 47 0D 0A 1A 0A／JPEG: FF D8 FF／GIF: `GIF87a`・`GIF89a`／WebP: `RIFF` ???? `WEBP`）。
 * 足りない長さは偽。
 */
export function matchesImageMagic(mime: ImageMimeType, head: Uint8Array): boolean {
  switch (mime) {
    case "image/png":
      return startsWith(head, PNG_MAGIC);
    case "image/jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "image/gif":
      return startsWith(head, ascii("GIF87a")) || startsWith(head, ascii("GIF89a"));
    case "image/webp":
      return startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8);
  }
}

/**
 * パスとして pane へ貼ってよいか（空でない・`IMAGE_PATH_MAX` 以下・C0〔0x00-0x1F〕・DEL〔0x7F〕・C1〔0x80-0x9F〕を含まない）。
 * 中継先のリモートのサーバが返すパスは信用しない（`ESC[201~` で bracketed paste を抜けて打鍵を混ぜる等を防ぐ。decisions D4）。
 * 見た目を偽る文字（双方向の書式制御 U+200E・U+200F・U+202A〜U+202E・U+2066〜U+2069、行・段落の区切り U+2028・U+2029）と
 * 対になっていないサロゲートも断る（サーバが作る名前には現れない）。
 */
export function isPastablePath(path: string): boolean {
  if (path.length === 0 || path.length > IMAGE_PATH_MAX) return false;
  for (let i = 0; i < path.length; i++) {
    const c = path.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return false;
    if (
      c === 0x200e ||
      c === 0x200f ||
      (c >= 0x202a && c <= 0x202e) ||
      (c >= 0x2066 && c <= 0x2069) ||
      c === 0x2028 ||
      c === 0x2029
    )
      return false;
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = path.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
