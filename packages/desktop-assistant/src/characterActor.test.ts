import { mkdtemp, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { CharacterActors, characterActor, actorSignature } from "./characterActor.js";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=";
function fixture() {
  return characterActor({
    id: "plugin:yukkuri-work/kiritan",
    w: 1,
    h: 1,
    poses: {
      "": {
        base: "aaaaaaaaaaaa",
        faces: { normal: { blink: ["aaaaaaaaaaaa", 0, 0] }, smile: { e: ["aaaaaaaaaaaa", 0, 0] } },
      },
    },
    images: { aaaaaaaaaaaa: png },
  });
}
it("persists verified sprite data separately and binds it to the imported portrait", async () => {
  const dir = await mkdtemp(join(tmpdir(), "character-actors-"));
  try {
    const store = new CharacterActors(dir);
    await store.load();
    const actor = fixture(),
      signature = actorSignature(actor);
    await store.installPack("yukkuri-work", [actor]);
    expect(store.meta(actor.id, signature)).toEqual({ w: 1, h: 1 });
    expect(store.meta(actor.id, "old")).toBeNull();
    const restored = new CharacterActors(dir);
    await restored.load();
    const value = (await restored.get(actor.id, signature))!;
    value.w = 7;
    expect((await restored.get(actor.id, signature))!.w).toBe(1);
    expect(await restored.get(actor.id, "wrong")).toBeNull();
    const oldFiles = await readdir(dir);
    await store.installPack("yukkuri-work", [{ ...actor, source: "updated" }]);
    expect((await readdir(dir)).filter((p) => p.endsWith(".json"))).toHaveLength(2);
    expect(await store.get(actor.id, signature)).toBeNull();
    expect(oldFiles.some((p) => p !== "index.json")).toBe(true);
    await store.installPack("yukkuri-work", []);
    expect(store.meta(actor.id)).toBeNull();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("rejects out-of-frame replacement patches and traversal names", () => {
  const actor = fixture();
  expect(() =>
    characterActor({
      ...actor,
      poses: { "": { ...actor.poses[""]!, faces: { normal: { e: ["aaaaaaaaaaaa", 1, 0] } } } },
    }),
  ).toThrow("範囲");
  expect(() => characterActor({ ...actor, images: { "../outside": png } })).toThrow();
});
it("preserves corrupt indexes and rejects changed content-addressed files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "character-actors-"));
  try {
    const store = new CharacterActors(dir);
    await store.load();
    const actor = fixture();
    await store.installPack("yukkuri-work", [actor]);
    const index = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
    await writeFile(join(dir, index.actors[0].hash + ".json"), "changed");
    await expect(store.get(actor.id)).rejects.toThrow("変更");
    await writeFile(join(dir, "index.json"), "broken");
    const broken = new CharacterActors(dir);
    await expect(broken.load()).rejects.toThrow("元ファイル");
    await expect(broken.installPack("yukkuri-work", [actor])).rejects.toThrow("修復");
    expect(await readFile(join(dir, "index.json"), "utf8")).toBe("broken");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
