import { join } from "node:path";
import { z } from "zod";
import { characterActor, type CharacterActor } from "./characterActor.js";
import { assetDirectory, readAssetJson } from "./assetFiles.js";
import { readPng } from "./png.js";
const Id = z.string().regex(/^[a-f0-9]{12,64}$/);
const Patch = z.tuple([Id, z.number().int().min(0).max(1024), z.number().int().min(0).max(1024)]);
const Face = z.object({
  e: Patch.optional(),
  blink: Patch.optional(),
  open: Patch.optional(),
  half: Patch.optional(),
});
const Sprite = z.object({
  w: z.number().int().min(1).max(1024),
  h: z.number().int().min(1).max(1024),
  source: z.string().optional(),
  poses: z.record(z.string(), z.object({ base: Id, faces: z.record(z.string(), Face) })),
});
export async function yukkuriActor(
  root: string,
  id: string,
  signal: AbortSignal,
  guard: () => void,
): Promise<CharacterActor | null> {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) throw Error("立ち絵のIDが不正です。");
  const directory = join(root, "chars", id);
  let raw: Record<string, unknown>;
  try {
    raw = await readAssetJson(join(directory, "sprite.json"), signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const sprite = Sprite.parse(raw);
  await assetDirectory(join(directory, "sprite"));
  const poses: CharacterActor["poses"] = {},
    needed = new Set<string>();
  for (const key of ["", "chin", "point", "raise"] as const) {
    const pose = sprite.poses[key];
    if (!pose) continue;
    const faces: NonNullable<CharacterActor["poses"][""]>["faces"] = {};
    needed.add(pose.base);
    for (const faceKey of ["normal", "smile", "think", "surprised"] as const) {
      const face = pose.faces[faceKey];
      if (!face) continue;
      faces[faceKey] = face;
      for (const patch of Object.values(face)) if (patch) needed.add(patch[0]);
    }
    poses[key] = { base: pose.base, faces };
  }
  if (needed.size > 96) throw Error("表情素材の差分が多すぎます。");
  const images: Record<string, string> = {};
  let total = 0;
  for (const part of needed) {
    signal.throwIfAborted();
    guard();
    const bytes = await readPng(join(directory, "sprite", part + ".png"), signal);
    total += bytes.length;
    if (total > 3 * 1024 * 1024) throw Error("表情素材が大きすぎます。");
    images[part] = bytes.toString("base64");
  }
  return characterActor({
    id: `plugin:yukkuri-work/${id}`,
    w: sprite.w,
    h: sprite.h,
    poses,
    images,
    ...(sprite.source ? { source: sprite.source.slice(0, 2000) } : {}),
  });
}
