import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { yukkuriCharacters } from "./yukkuriCharacters.js";
import { alphaBounds, characterPng } from "./characterPng.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
  "base64",
);
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "yukkuri-art-"));
  dirs.push(dir);
  const root = join(dir, "skills", "video", "yukkuri-kaisetsu");
  await mkdir(join(root, "chars", "zundamon"), { recursive: true });
  await mkdir(join(root, "recipes"));
  await writeFile(
    join(root, "casts.json"),
    JSON.stringify({ zundamon: { name: "ずんだもん", voice: { engine: "voicevox" } } }),
  );
  await writeFile(join(root, "chars", "zundamon", "normal.png"), png);
  await writeFile(
    join(root, "recipes", "zundamon.json"),
    JSON.stringify({ _comment: "元の素材：作者と配布元" }),
  );
  return { dir, root };
}
it("imports existing normal PNGs and notes from the work root without executing voice or recipes", async () => {
  const f = await fixture();
  await mkdir(join(f.root, "chars", "zundamon_alt"));
  await writeFile(join(f.root, "chars", "zundamon_alt", "normal.png"), png);
  await writeFile(join(f.root, "run.js"), "throw Error('must not execute')");
  const normalize = vi.fn((bytes) => bytes);
  const result = await yukkuriCharacters(f.dir, normalize, new AbortController().signal);
  expect(result.pack.characters).toHaveLength(2);
  expect(result.pack.characters[0]).toMatchObject({
    id: "zundamon",
    name: "ずんだもん",
    credit: "元の素材：作者と配布元",
    png: png.toString("base64"),
  });
  expect(result.pack.characters[1]!.name).toContain("zundamon_alt");
  expect(normalize).toHaveBeenCalledTimes(2);
});
it("rejects linked metadata and stops reading after cancellation", async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(yukkuriCharacters(f.root, (bytes) => bytes, controller.signal)).rejects.toThrow();
  await rm(join(f.root, "casts.json"));
  await writeFile(join(f.dir, "outside.json"), "{}");
  await symlink(join(f.dir, "outside.json"), join(f.root, "casts.json"));
  await expect(
    yukkuriCharacters(f.root, (bytes) => bytes, new AbortController().signal),
  ).rejects.toThrow("一覧");
});
it("finds transparent bounds and normalizes pixels without changing the artwork aspect", () => {
  const bitmap = new Uint8Array(4 * 5 * 4);
  bitmap[(1 * 4 + 1) * 4 + 3] = 255;
  bitmap[(3 * 4 + 2) * 4 + 3] = 1;
  expect(alphaBounds(bitmap, 4, 5)).toEqual({ x: 1, y: 1, width: 2, height: 3 });
  expect(() => alphaBounds(new Uint8Array(4), 1, 1)).toThrow("透明");
  const resize = vi.fn((_options: {width:number;height:number;quality:string}) => ({ toPNG: () => png }));
  const image = {
    isEmpty: () => false,
    getSize: () => ({ width: 1, height: 1 }),
    toBitmap: () => Buffer.from([0, 0, 0, 255]),
    crop: vi.fn(() => ({ getSize: () => ({ width: 428, height: 724 }), resize })),
  };
  expect(characterPng(png, () => image as never)).toEqual(png);
  expect(resize.mock.calls[0]![0]).toMatchObject({ width: 303, height: 512 });
});

it("imports pose and facial patches as data and links them to the static portrait",async()=>{
 const f=await fixture();const sprite=join(f.root,"chars","zundamon","sprite");await mkdir(sprite);
 await writeFile(join(sprite,"aaaaaaaaaaaa.png"),png);
 await writeFile(join(f.root,"chars","zundamon","sprite.json"),JSON.stringify({w:1,h:1,poses:{"":{base:"aaaaaaaaaaaa",faces:{normal:{blink:["aaaaaaaaaaaa",0,0]}}}}}));
 const result=await yukkuriCharacters(f.root,bytes=>bytes,new AbortController().signal,()=>{},true);
 expect(result.actors).toHaveLength(1);expect(result.pack.characters[0]!.actorSignature).toMatch(/^[a-f0-9]{64}$/);
 expect(result.actors[0]!.poses[""]!.faces.normal!.blink).toEqual(["aaaaaaaaaaaa",0,0]);
});
