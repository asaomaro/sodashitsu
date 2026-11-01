import type { NativeImage } from "electron";
import { pngSize } from "./png.js";

/** NativeImage bitmap pixels are BGRA; keep every nontransparent source pixel. */
export function alphaBounds(bitmap: Uint8Array, width: number, height: number) {
  if (bitmap.length !== width * height * 4) throw Error("画像の画素を確認できません。");
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!bitmap[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  if (right < 0) throw Error("透明な画像だけの素材は使えません。");
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/** Import the existing artwork, trimming spare alpha and scaling without distortion. */
export function characterPng(bytes: Buffer, decode: (bytes: Buffer) => NativeImage): Buffer {
  const expected = pngSize(bytes),
    image = decode(bytes);
  const size = image.getSize();
  if (image.isEmpty() || size.width !== expected.width || size.height !== expected.height)
    throw Error("PNGを読み込めません。");
  const cropped = image.crop(alphaBounds(image.toBitmap(), size.width, size.height));
  const bounds = cropped.getSize();
  for (const limit of [512, 384, 256, 192]) {
    const scale = Math.min(1, limit / Math.max(bounds.width, bounds.height));
    const result = cropped
      .resize({
        width: Math.max(1, Math.round(bounds.width * scale)),
        height: Math.max(1, Math.round(bounds.height * scale)),
        quality: "best",
      })
      .toPNG();
    if (result.byteLength <= 128 * 1024) {
      pngSize(result);
      return result;
    }
  }
  throw Error("立ち絵の保存サイズを小さくできません。");
}
