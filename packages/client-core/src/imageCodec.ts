/** Node専用。ブラウザの共通入口からはexportしない。入力・展開・描画仕事量に上限を設ける。 */
import { crc32, deflateSync, inflateSync } from "node:zlib";
export interface Raster {
  width: number;
  height: number;
  rgba: Uint8Array;
}
const SIDE = 4096,
  PIXELS = 4_194_304,
  BYTES = 16 * 1024 * 1024;
function dimensions(w: number, h: number) {
  if (
    !Number.isInteger(w) ||
    !Number.isInteger(h) ||
    w < 1 ||
    h < 1 ||
    w > SIDE ||
    h > SIDE ||
    w * h > PIXELS
  )
    throw new Error("image dimensions");
}
export function encodeRasterPng(r: Raster): Uint8Array {
  dimensions(r.width, r.height);
  if (r.rgba.length !== r.width * r.height * 4) throw new Error("raster length");
  const chunk = (name: string, data: Uint8Array) => {
    const b = Buffer.alloc(data.length + 12);
    b.writeUInt32BE(data.length);
    b.write(name, 4, "ascii");
    b.set(data, 8);
    b.writeUInt32BE(crc32(b.subarray(4, -4)), b.length - 4);
    return b;
  };
  const hdr = Buffer.alloc(13);
  hdr.writeUInt32BE(r.width);
  hdr.writeUInt32BE(r.height, 4);
  hdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((r.width * 4 + 1) * r.height);
  for (let y = 0; y < r.height; y++)
    raw.set(r.rgba.subarray(y * r.width * 4, (y + 1) * r.width * 4), y * (r.width * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", hdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]);
}
export function decodeRasterPng(bytes: Uint8Array): Raster {
  const b = Buffer.from(bytes);
  if (b.length > BYTES || !b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    throw new Error("PNG signature");
  let at = 8,
    w = 0,
    h = 0,
    type = 0,
    depth = 0,
    channels = 0,
    ended = false,
    idatEnded = false,
    sawIdat = false,
    palette: Buffer | undefined,
    alpha: Buffer | undefined;
  const parts: Buffer[] = [];
  for (let count = 0; at + 12 <= b.length && count < 4096; count++) {
    const n = b.readUInt32BE(at),
      name = b.toString("ascii", at + 4, at + 8);
    if (
      n > b.length - at - 12 ||
      crc32(b.subarray(at + 4, at + 8 + n)) !== b.readUInt32BE(at + 8 + n)
    )
      throw new Error("PNG chunk");
    const data = b.subarray(at + 8, at + 8 + n);
    if (at === 8) {
      if (name !== "IHDR" || n !== 13) throw new Error("PNG header");
      w = data.readUInt32BE();
      h = data.readUInt32BE(4);
      dimensions(w, h);
      depth = data[8]!;
      type = data[9]!;
      channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type] ?? 0;
      if (!channels || depth !== 8 || data[10] !== 0 || data[11] !== 0 || data[12] !== 0)
        throw new Error("unsupported PNG encoding");
    } else if (name === "IHDR") throw new Error("duplicate PNG header");
    if (name === "IDAT") {
      if (idatEnded) throw new Error("PNG IDAT order");
      parts.push(data);
      sawIdat = true;
    } else if (sawIdat) idatEnded = true;
    if (name === "PLTE") {
      if (sawIdat || n < 3 || n > 768 || n % 3) throw new Error("PNG palette");
      palette = data;
    }
    if (name === "tRNS") {
      if (sawIdat) throw new Error("PNG alpha");
      alpha = data;
    }
    at += 12 + n;
    if (name === "IEND") {
      if (n || at !== b.length || !sawIdat) throw new Error("PNG end");
      ended = true;
      break;
    }
    if (!["IHDR", "IDAT", "PLTE", "tRNS"].includes(name) && (b[at - n - 8]! & 32) === 0)
      throw new Error("unknown PNG critical chunk");
  }
  if (!ended || (type === 3 && !palette)) throw new Error("incomplete PNG");
  const stride = w * channels,
    expected = (stride + 1) * h,
    raw = inflateSync(Buffer.concat(parts), { maxOutputLength: expected });
  if (raw.length !== expected) throw new Error("PNG data length");
  const rgba = new Uint8Array(w * h * 4),
    prev = new Uint8Array(stride),
    row = new Uint8Array(stride);
  const paeth = (a: number, c: number, d: number) => {
    const p = a + c - d,
      da = Math.abs(p - a),
      dc = Math.abs(p - c),
      dd = Math.abs(p - d);
    return da <= dc && da <= dd ? a : dc <= dd ? c : d;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]!;
    if (f > 4) throw new Error("PNG filter");
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels]! : 0,
        c = prev[x]!,
        d = x >= channels ? prev[x - channels]! : 0;
      row[x] =
        (raw[y * (stride + 1) + 1 + x]! +
          (f === 0
            ? 0
            : f === 1
              ? a
              : f === 2
                ? c
                : f === 3
                  ? Math.floor((a + c) / 2)
                  : paeth(a, c, d))) &
        255;
    }
    for (let x = 0; x < w; x++) {
      const i = x * channels,
        j = (y * w + x) * 4;
      if (type === 3) {
        const p = row[i]! * 3;
        if (p + 2 >= palette!.length) throw new Error("PNG palette index");
        rgba.set(palette!.subarray(p, p + 3), j);
        rgba[j + 3] = alpha?.[row[i]!] ?? 255;
      } else if (type === 0 || type === 4) {
        rgba[j] = rgba[j + 1] = rgba[j + 2] = row[i]!;
        rgba[j + 3] =
          type === 4
            ? row[i + 1]!
            : alpha?.length === 2 && row[i] === alpha.readUInt16BE()
              ? 0
              : 255;
      } else {
        rgba.set(row.subarray(i, i + 3), j);
        rgba[j + 3] =
          type === 6
            ? row[i + 3]!
            : alpha?.length === 6 &&
                row[i] === alpha.readUInt16BE() &&
                row[i + 1] === alpha.readUInt16BE(2) &&
                row[i + 2] === alpha.readUInt16BE(4)
              ? 0
              : 255;
      }
    }
    prev.set(row);
  }
  return { width: w, height: h, rgba };
}
/** Sixel: 固定256色、透過ピクセルは描かない。文字矩形より大きいラスタを作らない。 */
export function encodeSixel(r: Raster, width: number, height: number): string {
  dimensions(r.width, r.height);
  width = Math.max(1, Math.min(640, Math.floor(width)));
  height = Math.max(1, Math.min(480, Math.floor(height)));
  const pixels = new Int16Array(width * height).fill(-1),
    colors = new Set<number>();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i =
        (Math.floor((y * r.height) / height) * r.width + Math.floor((x * r.width) / width)) * 4;
      if (r.rgba[i + 3]! < 128) continue;
      const c = ((r.rgba[i]! >> 5) << 5) | ((r.rgba[i + 1]! >> 5) << 2) | (r.rgba[i + 2]! >> 6);
      pixels[y * width + x] = c;
      colors.add(c);
    }
  let out = `\x1bP0;1q"1;1;${width};${height}`;
  for (const c of colors)
    out += `#${c};2;${Math.round(((c >> 5) * 100) / 7)};${Math.round((((c >> 2) & 7) * 100) / 7)};${Math.round(((c & 3) * 100) / 3)}`;
  for (let y = 0; y < height; y += 6) {
    if (y) out += "-";
    for (const c of colors) {
      let line = "",
        last = 0,
        run = 0;
      const flush = () => {
        if (run)
          line +=
            run > 3
              ? `!${run}${String.fromCharCode(last + 63)}`
              : String.fromCharCode(last + 63).repeat(run);
      };
      for (let x = 0; x < width; x++) {
        let mask = 0;
        for (let bit = 0; bit < 6 && y + bit < height; bit++)
          if (pixels[(y + bit) * width + x] === c) mask |= 1 << bit;
        if (run && mask !== last) {
          flush();
          run = 0;
        }
        last = mask;
        run++;
      }
      flush();
      if (/[\x40-\x7e]/.test(line)) out += `#${c}${line}$`;
    }
  }
  return out + "\x1b\\";
}
/** 上限つきSixel復号（RGB/HLS・repeat・raster attributes）。 */
export function decodeSixel(data: string, transparent = true): Raster {
  if (data.length > 8 * 1024 * 1024) throw new Error("Sixel input limit");
  const max = 1024,
    pixels = new Uint8Array(max * max * 4);
  if (!transparent) for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  const palette = new Map<number, number[]>(),
    defaults = [
      [0, 0, 0],
      [0, 0, 255],
      [255, 0, 0],
      [0, 255, 0],
      [255, 0, 255],
      [0, 255, 255],
      [255, 255, 0],
      [255, 255, 255],
    ];
  defaults.forEach((v, i) => palette.set(i, v));
  let declaredH = 0;
  let x = 0,
    y = 0,
    w = 0,
    h = 0,
    color = 0,
    work = 0;
  const numbers = (at: number) => {
    const match = /^[\d;]{1,96}/.exec(data.slice(at, at + 97));
    if (!match) throw new Error("Sixel parameters");
    return { n: match[0].split(";").map(Number), end: at + match[0].length };
  };
  const paint = (bits: number, n: number) => {
    if (!Number.isSafeInteger(n) || n < 1 || x + n > max || y >= max || work + n * 6 > 8_388_608)
      throw new Error("Sixel work limit");
    work += n * 6;
    const rgb = palette.get(color) ?? [0, 0, 0];
    for (let xx = x; xx < x + n; xx++)
      for (let bit = 0; bit < 6 && y + bit < max; bit++)
        if (bits & (1 << bit)) {
          const at = ((y + bit) * max + xx) * 4;
          pixels.set(rgb, at);
          pixels[at + 3] = 255;
        }
    x += n;
    w = Math.max(w, x);
    h = Math.max(h, Math.min(max, y + 6));
  };
  for (let i = 0; i < data.length;) {
    const c = data[i++]!;
    if (c >= "?" && c <= "~") paint(c.charCodeAt(0) - 63, 1);
    else if (c === "!") {
      const p = numbers(i);
      i = p.end;
      const b = data[i++]?.charCodeAt(0);
      if (b === undefined || b < 63 || b > 126) throw new Error("Sixel repeat");
      paint(b - 63, p.n[0]!);
    } else if (c === "#") {
      const p = numbers(i);
      i = p.end;
      color = p.n[0]!;
      if (color > 255 || !Number.isSafeInteger(color)) throw new Error("Sixel color");
      if (p.n.length > 1) {
        const [, mode, a, b, d] = p.n;
        if (a === undefined || b === undefined || d === undefined)
          throw new Error("Sixel color spec");
        if (mode === 2) {
          if ([a, b, d].some((n) => n > 100)) throw new Error("Sixel RGB");
          palette.set(
            color,
            [a, b, d].map((n) => Math.round((n * 255) / 100)),
          );
        } else if (mode === 1) {
          if (a > 360 || b > 100 || d > 100) throw new Error("Sixel HLS");
          const hue = ((a + 240) % 360) / 60,
            l = b / 100,
            s = d / 100,
            chroma = (1 - Math.abs(2 * l - 1)) * s,
            z = chroma * (1 - Math.abs((hue % 2) - 1)),
            m = l - chroma / 2;
          const rgb =
            hue < 1
              ? [chroma, z, 0]
              : hue < 2
                ? [z, chroma, 0]
                : hue < 3
                  ? [0, chroma, z]
                  : hue < 4
                    ? [0, z, chroma]
                    : hue < 5
                      ? [z, 0, chroma]
                      : [chroma, 0, z];
          palette.set(
            color,
            rgb.map((n) => Math.round((n + m) * 255)),
          );
        } else throw new Error("Sixel color mode");
      }
    } else if (c === '"') {
      const p = numbers(i);
      i = p.end;
      const dw = p.n[2] ?? 0,
        dh = p.n[3] ?? 0;
      if (dw > max || dh > max) throw new Error("Sixel raster limit");
      w = Math.max(w, dw);
      h = Math.max(h, dh);
      declaredH = dh;
    } else if (c === "$") x = 0;
    else if (c === "-") {
      x = 0;
      y += 6;
      if (y >= max) throw new Error("Sixel rows");
    } else if (!/\s/.test(c)) throw new Error("Sixel command");
  }
  if (declaredH) h = Math.min(h, declaredH);
  dimensions(w, h);
  const rgba = new Uint8Array(w * h * 4);
  for (let yy = 0; yy < h; yy++)
    rgba.set(pixels.subarray(yy * max * 4, (yy * max + w) * 4), yy * w * 4);
  return { width: w, height: h, rgba };
}
