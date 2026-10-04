import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

/**
 * 質問のフォームの画像・音・成果物の E2E 用の、実物のファイルを作る道具（20261004-ask-media-popup）。
 * 画像は**本当にデコードできる** PNG を作る（`naturalWidth` > 0 で「描かれた」を見るため。先頭バイトだけの偽物では描けない）。
 */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 単色の PNG（RGB 8 ビット）。 */
export function makePng(width: number, height: number, rgb: [number, number, number] = [200, 60, 60]): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** 先頭が WAVE の最小の音（再生は E2E で見ない。サーバの種類確認を通すだけ）。 */
export function makeWav(): Buffer {
  const data = Buffer.alloc(800);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(8000, 24);
  h.writeUInt32LE(8000, 28);
  h.writeUInt16LE(1, 32);
  h.writeUInt16LE(8, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/** スクリプトを仕込んだ SVG（`<img>` で描かれる限り動かない。動けば `window.__svgScript` が立つ）。 */
export const EVIL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30" onload="window.__svgScript=1"><script>window.__svgScript=2</script><rect width="40" height="30" fill="#36c"/></svg>`;

export interface MediaDir {
  dir: string;
  path(name: string): string;
  write(name: string, data: Buffer | string): Promise<string>;
  cleanup(): Promise<void>;
}

export async function makeMediaDir(): Promise<MediaDir> {
  const dir = await mkdtemp(join(tmpdir(), "soda-e2e-media-"));
  return {
    dir,
    path: (name) => join(dir, name),
    write: async (name, data) => {
      await writeFile(join(dir, name), data);
      return join(dir, name);
    },
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
