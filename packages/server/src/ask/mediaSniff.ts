/**
 * メディアの種類を**先頭バイト**から決める（20261004-ask-media-popup の design「サーバ: `AskMedia`」）。拡張子・Content-Type・`data:` の MIME は信用せず、
 * ここで決めた種類から MIME を決める（`.png` の名前のテキストファイルや、`/etc/passwd` を画像として出させない）。
 */

export type SniffKind =
  "png" | "jpeg" | "gif" | "webp" | "avif" | "svg" | "wav" | "mp3" | "ogg" | "m4a" | "aac" | "flac";

export interface Sniffed {
  kind: SniffKind;
  mime: string;
  media: "image" | "audio";
}

const INFO: Record<SniffKind, { mime: string; media: "image" | "audio" }> = {
  png: { mime: "image/png", media: "image" },
  jpeg: { mime: "image/jpeg", media: "image" },
  gif: { mime: "image/gif", media: "image" },
  webp: { mime: "image/webp", media: "image" },
  avif: { mime: "image/avif", media: "image" },
  svg: { mime: "image/svg+xml", media: "image" },
  wav: { mime: "audio/wav", media: "audio" },
  mp3: { mime: "audio/mpeg", media: "audio" },
  ogg: { mime: "audio/ogg", media: "audio" },
  m4a: { mime: "audio/mp4", media: "audio" },
  aac: { mime: "audio/aac", media: "audio" },
  flac: { mime: "audio/flac", media: "audio" },
};

/** 拡張子（小文字・ドット付き）→ その拡張子で許す種類。 */
export const EXTENSION_KINDS: Record<string, SniffKind[]> = {
  ".png": ["png"],
  ".jpg": ["jpeg"],
  ".jpeg": ["jpeg"],
  ".gif": ["gif"],
  ".webp": ["webp"],
  ".avif": ["avif"],
  ".svg": ["svg"],
  ".wav": ["wav"],
  ".mp3": ["mp3"],
  ".ogg": ["ogg"],
  ".oga": ["ogg"],
  ".opus": ["ogg"],
  ".m4a": ["m4a"],
  ".aac": ["aac"],
  ".flac": ["flac"],
};

/** `data:` の MIME → その MIME で許す種類。 */
export const MIME_KINDS: Record<string, SniffKind[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpeg"],
  "image/gif": ["gif"],
  "image/webp": ["webp"],
  "image/avif": ["avif"],
  "image/svg+xml": ["svg"],
  "audio/wav": ["wav"],
  "audio/x-wav": ["wav"],
  "audio/wave": ["wav"],
  "audio/mpeg": ["mp3"],
  "audio/mp3": ["mp3"],
  "audio/ogg": ["ogg"],
  "audio/opus": ["ogg"],
  "audio/mp4": ["m4a"],
  "audio/x-m4a": ["m4a"],
  "audio/aac": ["aac"],
  "audio/flac": ["flac"],
};

const ascii = (b: Uint8Array, at: number, s: string): boolean => {
  if (b.length < at + s.length) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
};

/** ISO ベースメディア（`ftyp`）の brand の一覧（主 brand と互換 brand）。 */
function ftypBrands(b: Uint8Array): string[] | null {
  if (!ascii(b, 4, "ftyp") || b.length < 12) return null;
  const size = ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0;
  const end = Math.min(b.length, size >= 16 && size <= 4096 ? size : 64);
  const brands = [String.fromCharCode(b[8]!, b[9]!, b[10]!, b[11]!)];
  for (let at = 16; at + 4 <= end; at += 4)
    brands.push(String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!));
  return brands;
}

/** SVG か: 先頭の BOM・空白・XML 宣言・コメント・DOCTYPE を読み飛ばして `<svg` で始まる。 */
function isSvg(b: Uint8Array): boolean {
  // `TextDecoder` は先頭の BOM を取り除く。
  let t = new TextDecoder("utf-8").decode(b.subarray(0, 8192));
  for (let guard = 0; guard < 32; guard++) {
    t = t.replace(/^\s+/, "");
    if (t.startsWith("<?")) {
      const end = t.indexOf("?>");
      if (end < 0) return false;
      t = t.slice(end + 2);
    } else if (t.startsWith("<!--")) {
      const end = t.indexOf("-->");
      if (end < 0) return false;
      t = t.slice(end + 3);
    } else if (/^<!DOCTYPE/i.test(t)) {
      // 内部サブセット `[...]` があれば、その閉じまで読み飛ばす。
      const open = t.indexOf("[");
      const close = t.indexOf(">");
      if (close < 0) return false;
      if (open >= 0 && open < close) {
        const endSub = t.indexOf("]>");
        if (endSub < 0) return false;
        t = t.slice(endSub + 2);
      } else t = t.slice(close + 1);
    } else break;
  }
  return /^<svg[\s>/]/.test(t);
}

/** 先頭バイトから種類を決める。許す種類のどれでもなければ null。 */
export function sniffMedia(b: Uint8Array): Sniffed | null {
  const make = (kind: SniffKind): Sniffed => ({ kind, ...INFO[kind] });
  if (b.length < 4) return null;
  if (b[0] === 0x89 && ascii(b, 1, "PNG\r\n") && b[6] === 0x1a && b[7] === 0x0a) return make("png");
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return make("jpeg");
  if (ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a")) return make("gif");
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return make("webp");
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE")) return make("wav");
  if (ascii(b, 0, "OggS")) return make("ogg");
  if (ascii(b, 0, "fLaC")) return make("flac");
  if (ascii(b, 0, "ID3")) return make("mp3");
  const brands = ftypBrands(b);
  if (brands !== null)
    return brands[0] === "avif" || brands[0] === "avis"
      ? make("avif")
      : brands.includes("avif") && brands[0] !== "M4A "
        ? make("avif")
        : make("m4a");
  if (b[0] === 0xff) {
    // ADTS（AAC）は同期の 12 ビットの後の layer が 00。MPEG audio は layer が 00 でなく、version が 01（予約）でない。
    if ((b[1]! & 0xf6) === 0xf0) return make("aac");
    if ((b[1]! & 0xe0) === 0xe0 && ((b[1]! >> 1) & 3) !== 0 && ((b[1]! >> 3) & 3) !== 1)
      return make("mp3");
  }
  if (isSvg(b)) return make("svg");
  return null;
}

/** 文字として読めるか: NUL が無く、UTF-8 として正しい（テキスト・Markdown・HTML の成果物）。 */
export function isUtf8Text(b: Uint8Array): boolean {
  if (b.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}
