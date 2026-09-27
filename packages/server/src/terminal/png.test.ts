import { crc32, deflateSync, inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng, isPng, pngSize } from "./png.js";

/** PNG のチャンクを順に取り出す（テスト用の最小の読み取り）。 */
function chunks(png: Uint8Array): { type: string; data: Uint8Array }[] {
  const out: { type: string; data: Uint8Array }[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let at = 8;
  while (at < png.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({ type, data: png.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
  }
  return out;
}

/** テスト用の PNG の復号（8 ビットの RGB/RGBA・インタレース無しだけ）。フィルタ 0〜4 を戻す。 */
function decodePixels(png: Uint8Array): Uint8Array {
  const cs = chunks(png);
  const ihdr = new DataView(cs[0]!.data.buffer, cs[0]!.data.byteOffset, 13);
  const width = ihdr.getUint32(0);
  const height = ihdr.getUint32(4);
  const bpp = cs[0]!.data[9] === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(cs.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i]!;
      const a = i >= bpp ? out[y * stride + i - bpp]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + i]! : 0;
      const c = y > 0 && i >= bpp ? out[(y - 1) * stride + i - bpp]! : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const pred = [0, a, b, (a + b) >> 1, paeth][filter]!;
      out[y * stride + i] = (x + pred) & 0xff;
    }
  }
  return out;
}

describe("encodePng", () => {
  it("各行を Paeth（先頭は Sub）で差分にし、復号すると元の画素に戻る。滑らかな画像はフィルタ 0 だけより縮む", () => {
    const w = 64;
    const h = 48;
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        px[i] = (x * 3 + y) & 0xff;
        px[i + 1] = (y * 5 + (x >> 1)) & 0xff;
        px[i + 2] = ((x * y) >> 3) & 0xff;
        px[i + 3] = 255 - ((x + y) & 0x7f);
      }
    const png = encodePng(px, w, h, 4);
    expect(isPng(png)).toBe(true);
    expect(Buffer.from(decodePixels(png)).equals(Buffer.from(px))).toBe(true);
    const idat = chunks(png).find((c) => c.type === "IDAT")!.data;
    const raw = inflateSync(idat);
    const filters = new Set<number>();
    for (let y = 0; y < h; y++) filters.add(raw[y * (w * 4 + 1)]!);
    expect([...filters].some((f) => f !== 0)).toBe(true);
    const plain = new Uint8Array((w * 4 + 1) * h);
    for (let y = 0; y < h; y++)
      plain.set(px.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    expect(idat.length).toBeLessThan(deflateSync(plain, { level: 6 }).length);
  });

  it("RGBA の画素を、IHDR・IDAT・IEND の PNG にし、IDAT を展開して行のフィルタを戻すと元の画素に戻る", () => {
    const pixels = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]); // 2×2 RGBA
    const png = encodePng(pixels, 2, 2, 4);
    expect(isPng(png)).toBe(true);
    expect(pngSize(png)).toEqual({ width: 2, height: 2 });
    const cs = chunks(png);
    expect(cs.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const ihdr = cs[0]!.data;
    expect([...ihdr.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
    expect([...decodePixels(png)]).toEqual([...pixels]);
  });

  it("ばらつきの大きい画素（Paeth の予測が同点になる所を含む）も、復号すると元に戻る", () => {
    const w = 37;
    const h = 23;
    for (const ch of [3, 4] as const) {
      const px = new Uint8Array(w * h * ch);
      let s = 7;
      for (let i = 0; i < px.length; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        px[i] = (s >> 8) & 0x0f ? (s >> 16) & 0xff : 128; // 同じ値が並ぶ所（予測が同点）を混ぜる
      }
      expect(Buffer.from(decodePixels(encodePng(px, w, h, ch))).equals(Buffer.from(px))).toBe(true);
    }
  });

  it("RGB は色の種類 2 で、1 画素 3 バイトとして読む（余りのバイトは使わない）", () => {
    const png = encodePng(Uint8Array.from([1, 2, 3, 4, 5, 6, 99]), 2, 1, 3);
    const cs = chunks(png);
    expect(cs[0]!.data[9]).toBe(2);
    expect([...decodePixels(png)]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("画素が足りなければ投げる", () => {
    expect(() => encodePng(new Uint8Array(3), 2, 1, 3)).toThrow();
    expect(() => encodePng(new Uint8Array(0), 0, 0, 3)).toThrow();
    expect(() => encodePng(new Uint8Array(100), 2.5, 2, 4)).toThrow(); // 整数でない幅は IHDR と行の長さが食い違う
  });
});

describe("isPng / pngSize", () => {
  const good = encodePng(new Uint8Array(3 * 4 * 4), 3, 4, 4);

  it("正しい PNG は真、大きさは IHDR から読む", () => {
    expect(isPng(good)).toBe(true);
    expect(pngSize(good)).toEqual({ width: 3, height: 4 });
  });

  it("署名の誤り・途中で切れたもの・CRC の不一致・IEND の後の余り・IHDR 以外で始まるものは偽", () => {
    const badSig = good.slice();
    badSig[1] = 0;
    expect(isPng(badSig)).toBe(false);
    expect(pngSize(badSig)).toBeNull();
    expect(isPng(good.subarray(0, good.length - 1))).toBe(false);
    const badCrc = good.slice();
    badCrc[good.length - 20] = badCrc[good.length - 20]! ^ 0xff; // IDAT の中身を壊す
    expect(isPng(badCrc)).toBe(false);
    const trailing = new Uint8Array(good.length + 1);
    trailing.set(good);
    expect(isPng(trailing)).toBe(false);
    const cs = chunks(good);
    // IDAT が無い（IHDR→IEND）
    const noIdat = new Uint8Array(8 + 25 + 12);
    noIdat.set(good.subarray(0, 8 + 25));
    noIdat.set(good.subarray(good.length - 12), 8 + 25);
    expect(cs[0]!.type).toBe("IHDR");
    expect(isPng(noIdat)).toBe(false);
  });

  it("最初のチャンクが IHDR でないもの（IDAT→IHDR→IEND の並び）は偽", () => {
    const cs = chunks(good);
    const idat = good.subarray(8 + 25, good.length - 12); // IHDR（25 バイト）の後・IEND（12 バイト）の前
    expect(cs.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    const reordered = new Uint8Array(good.length);
    reordered.set(good.subarray(0, 8));
    reordered.set(idat, 8);
    reordered.set(good.subarray(8, 8 + 25), 8 + idat.length);
    reordered.set(good.subarray(good.length - 12), 8 + idat.length + 25);
    expect(isPng(reordered)).toBe(false);
  });

  /** チャンクを 1 つ作る（CRC は正しく付ける）。 */
  function makeChunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  }
  function join(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }

  it("IHDR の長さが 13 でない・IEND の長さが 0 でない・IEND の後にチャンクが続く・IDAT が途切れて再び来るものは偽", () => {
    const [ihdr, idat, iend] = chunks(good).map((c) => makeChunk(c.type, c.data));
    const sig = good.subarray(0, 8);
    expect(isPng(join(sig, ihdr!, idat!, iend!))).toBe(true); // 組み直しても正しい（下の比較の基準）
    expect(isPng(join(sig, makeChunk("IHDR", new Uint8Array(14)), idat!, iend!))).toBe(false);
    expect(isPng(join(sig, ihdr!, idat!, makeChunk("IEND", Uint8Array.of(1))))).toBe(false);
    expect(isPng(join(sig, ihdr!, idat!, iend!, makeChunk("tEXt", Uint8Array.of(65))))).toBe(false);
    expect(isPng(join(sig, ihdr!, idat!, makeChunk("tEXt", Uint8Array.of(65)), idat!, iend!))).toBe(
      false,
    );
    expect(isPng(join(sig, ihdr!, makeChunk("tEXt", Uint8Array.of(65)), idat!, idat!, iend!))).toBe(
      true,
    );
  });

  it("空・署名だけは偽", () => {
    expect(isPng(new Uint8Array(0))).toBe(false);
    expect(isPng(good.subarray(0, 8))).toBe(false);
    expect(pngSize(good.subarray(0, 8))).toBeNull();
  });
});
