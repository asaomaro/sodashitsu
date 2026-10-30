import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { Characters, characterPack } from "./characters.js";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=";
const pack = () => ({
  id: "captains",
  name: "Captains",
  version: "1.0.0",
  characters: [{ id: "robot", name: "追加船長", png }],
});
it("persists inert PNG packs and serializes concurrent installations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "captains-"));
  try {
    const file = join(dir, "characters.json"),
      characters = new Characters(file);
    await characters.load();
    await Promise.all([characters.install(pack()), characters.install({ ...pack(), id: "more" })]);
    const restored = new Characters(file);
    await restored.load();
    expect(restored.list()).toHaveLength(2);
    expect(restored.portrait("plugin:captains/robot")?.uri).toBe(`data:image/png;base64,${png}`);
    await restored.remove("captains");
    expect(restored.list()).toHaveLength(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("preserves corrupt storage and does not commit memory on write failure", async () => {
  const dir = await mkdtemp(join(tmpdir(), "captains-"));
  try {
    const file = join(dir, "characters.json");
    await writeFile(file, "corrupt");
    const characters = new Characters(file);
    await expect(characters.load()).rejects.toThrow("変更していません");
    await expect(characters.install(pack())).rejects.toThrow("修復");
    expect(await readFile(file, "utf8")).toBe("corrupt");
    const missing = join(dir, "blocked.json"),
      blocked = new Characters(missing);
    await blocked.load();
    await mkdir(missing);
    await expect(blocked.install(pack())).rejects.toThrow();
    expect(blocked.list()).toEqual([]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects oversized and executable assets without launching an entry", () => {
  const bundle = {
    manifest: {
      id: "captains",
      name: "Captains",
      version: "1.0.0",
      entry: "never-run.mjs",
      assistantCharacters: [{ id: "robot", name: "Robot", file: "robot.png" }],
    },
    files: [{ path: "robot.png", data: png }],
  } as any;
  expect(characterPack(bundle).characters[0]?.name).toBe("Robot");
  bundle.files[0].data = Buffer.from("<svg onload=evil()>").toString("base64");
  expect(() => characterPack(bundle)).toThrow();
  const oversized = Buffer.from(png, "base64");
  oversized.writeUInt32BE(2048, 16);
  bundle.files[0].data = oversized.toString("base64");
  expect(() => characterPack(bundle)).toThrow("1024");
  const large = Buffer.concat([Buffer.from(png, "base64"), Buffer.alloc(128 * 1024)]);
  bundle.files[0].data = large.toString("base64");
  expect(() => characterPack(bundle)).toThrow("128KiB");
});
