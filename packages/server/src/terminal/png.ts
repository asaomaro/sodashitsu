import { crc32, deflateSync } from "node:zlib";

/**
 * Kitty graphics の画像をブラウザへ送る前の PNG の扱い（20260926-kitty-graphics design「インターフェース」）。
 * PNG を**復号はしない**（Node に復号器が無い）。検査は署名・チャンクの並び・各チャンクの CRC まで（design「エラー処理」）。
 */

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

function readU32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) | (bytes[at + 1]! << 16) | (bytes[at + 2]! << 8) | bytes[at + 3]!) >>> 0
  );
}

function hasSignature(bytes: Uint8Array): boolean {
  if (bytes.length < SIGNATURE.length) return false;
  for (let i = 0; i < SIGNATURE.length; i++) if (bytes[i] !== SIGNATURE[i]) return false;
  return true;
}

/**
 * PNG として形が正しいか。署名・最初のチャンクが 13 バイトの IHDR・最後のチャンクが IEND で後ろに余りが無いこと・
 * 長さ 0 の IEND・途中に IDAT が 1 つ以上あって連続していること・全てのチャンクの CRC が合うことを見る。
 */
export function isPng(bytes: Uint8Array): boolean {
  if (!hasSignature(bytes)) return false;
  let at = SIGNATURE.length;
  let first = true;
  let sawIdat = false;
  let idatEnded = false;
  while (at + 12 <= bytes.length) {
    const len = readU32(bytes, at);
    if (len > bytes.length - at - 12) return false;
    const type = String.fromCharCode(
      bytes[at + 4]!,
      bytes[at + 5]!,
      bytes[at + 6]!,
      bytes[at + 7]!,
    );
    const crc = readU32(bytes, at + 8 + len);
    if (crc32(bytes.subarray(at + 4, at + 8 + len)) !== crc) return false;
    if (first) {
      if (type !== "IHDR" || len !== 13) return false;
      first = false;
    }
    if (type === "IDAT") {
      if (idatEnded) return false; // IDAT は連続していなければならない
      sawIdat = true;
    } else if (sawIdat) {
      idatEnded = true;
    }
    at += 12 + len;
    if (type === "IEND") return sawIdat && len === 0 && at === bytes.length;
  }
  return false;
}

/** IHDR の幅と高さ（署名と IHDR の位置だけを見る。形全体の検査は `isPng`）。 */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (!hasSignature(bytes) || bytes.length < 24) return null;
  const type = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (type !== "IHDR") return null;
  return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * 生の画素（行の先頭から、1 画素 `channels` バイト。3=RGB・4=RGBA）を PNG にする。`pixels` は少なくとも
 * `width*height*channels` バイト要る（余りは使わない）。各行のフィルタは Paeth（先頭の行は Sub）。
 */
export function encodePng(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4,
): Uint8Array {
  const stride = width * channels;
  if (
    !(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) ||
    pixels.length < stride * height
  )
    throw new Error("not enough pixel data");
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    const out = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    // 各行を Paeth（先頭の行は前の行が無いので Sub）で差分にする。写真のような画像はフィルタ 0 のままではほとんど縮まない
    // （20260926-kitty-graphics の review ラウンド 1）。行ごとに 5 種を試して選ぶ方式は、主スレッドで 1 枚ぶんを 5 回なめるので
    // 4 MP で 1 秒近く止まった（実測）。1 回なめるだけのこの方式にした。
    const filter = prev ? 4 : 1;
    applyFilter(filter, row, prev, channels, out);
    raw[y * (stride + 1)] = filter;
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = channels === 4 ? 6 : 2; // 色の種類（6=RGBA・2=RGB）
  // 10〜12（圧縮・フィルタ・インタレース）は 0。
  const parts = [
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** `row` に PNG のフィルタ（1=Sub・4=Paeth）を掛けた結果を `out` に書く。 */
function applyFilter(
  filter: 1 | 4,
  row: Uint8Array,
  prev: Uint8Array | null,
  bpp: number,
  out: Uint8Array,
): void {
  const n = row.length;
  if (filter === 1 || !prev) {
    for (let i = 0; i < n; i++) out[i] = (row[i]! - (i >= bpp ? row[i - bpp]! : 0)) & 0xff;
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = i >= bpp ? row[i - bpp]! : 0;
    const b = prev[i]!;
    const c = i >= bpp ? prev[i - bpp]! : 0;
    const p = a + b - c;
    const pa = p > a ? p - a : a - p;
    const pb = p > b ? p - b : b - p;
    const pc = p > c ? p - c : c - p;
    out[i] = (row[i]! - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
  }
}
