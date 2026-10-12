import { expect, it } from "vitest";
import { crc32, deflateSync } from "node:zlib";
import { decodeRasterPng, encodeRasterPng, encodeSixel, decodeSixel } from "./imageCodec.js";
const raster = { width: 4, height: 6, rgba: new Uint8Array(4 * 6 * 4).fill(255) };
for (let i = 0; i < raster.rgba.length; i += 4) {
  raster.rgba[i + 1] = 0;
  raster.rgba[i + 2] = 0;
}
it("roundtrips PNG, encodes red Sixel, and decodes color and repeat commands", () => {
  const bytes = encodeRasterPng(raster);
  expect(decodeRasterPng(bytes)).toEqual(raster);
  const s = encodeSixel(raster, 4, 6);
  expect(s).toContain(";2;100;0;0");
  expect(decodeSixel(s.slice(s.indexOf("q") + 1, -2))).toEqual(raster);
  expect(decodeSixel("#1;2;100;0;0#1!4~").rgba.slice(0, 4)).toEqual(Uint8Array.of(255, 0, 0, 255));
});
it("rejects broken PNG CRC, overlarge dimensions, truncated data, excessive sixel repeats and raster declarations", () => {
  const b = Buffer.from(encodeRasterPng(raster));
  b[30] = b[30]! ^ 1;
  expect(() => decodeRasterPng(b)).toThrow();
  expect(() => decodeRasterPng(b.slice(0, -4))).toThrow();
  expect(() => encodeRasterPng({ width: 100000, height: 1, rgba: new Uint8Array() })).toThrow();
  for (const s of ["!999999~", '"1;1;99999;1', "#999~", "#0;2;999;0;0~"])
    expect(() => decodeSixel(s)).toThrow();
});
it("bounds decompression before allocating a PNG scanline buffer", () => {
  const b = Buffer.from(encodeRasterPng(raster));
  const hdr = b.subarray(8, 33),
    payload = deflateSync(Buffer.alloc(10000));
  const id = Buffer.alloc(payload.length + 12);
  id.writeUInt32BE(payload.length);
  id.write("IDAT", 4);
  id.set(payload, 8);
  id.writeUInt32BE(crc32(id.subarray(4, -4)), id.length - 4);
  const bomb = Buffer.concat([b.subarray(0, 8), hdr, id, b.subarray(-12)]);
  expect(() => decodeRasterPng(bomb)).toThrow();
});
it("clips the last sixel band to declared raster height", () => {
  const r = decodeSixel('"1;1;9;17#1;2;100;0;0!9~-!9~-!9~');
  expect(r.height).toBe(17);
  expect(r.rgba.length).toBe(9 * 17 * 4);
});
it("accepts the maximum 1024px Sixel height with clipped final-band padding",()=>{
 const bands=Array.from({length:171},()=>"#1~").join('-');expect(decodeSixel('"1;1;1;1024#1;2;100;0;0'+bands).height).toBe(1024);
});
