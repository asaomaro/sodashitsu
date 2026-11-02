import { assetDirectory, readAssetJson } from "./assetFiles.js";
import { yukkuriActor } from "./yukkuriActor.js";
import { actorSignature, type CharacterActor } from "./characterActor.js";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readPng } from "./png.js";
import type { CharacterPack } from "./characters.js";

const safeId = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Only read casts.json, recipes/<id>.json notes and chars/<id>/normal.png. Never run video/voice code. */
export async function yukkuriCharacters(
  selected: string,
  normalize: (bytes: Buffer) => Buffer,
  signal: AbortSignal,
  guard: () => void = () => {},
  includeActors = false,
) {
  await assetDirectory(selected);
  signal.throwIfAborted();
  guard();
  let root: string | null = null;
  for (const candidate of [selected, join(selected, "skills", "video", "yukkuri-kaisetsu")]) {
    try {
      await assetDirectory(candidate);
      await assetDirectory(join(candidate, "chars"));
      await lstat(join(candidate, "casts.json"));
      root = candidate;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (!root) throw Error("casts.jsonとchars/を含むキャラクター素材フォルダを選んでください。");
  const casts = await readAssetJson(join(root, "casts.json"), signal);
  const entries = await readdir(join(root, "chars"), { withFileTypes: true });
  if (entries.length > 256) throw Error("素材フォルダの項目が多すぎます。");
  const characters: CharacterPack["characters"] = [],
    warnings: string[] = [];
  const actors: CharacterActor[] = [];
  let actorBytes = 0;
  let total = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    signal.throwIfAborted();
    guard();
    if (!safeId.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    if (characters.length >= 64) throw Error("一度に取り込めるキャラクターは64件までです。");
    const path = join(root, "chars", entry.name, "normal.png");
    try {
      const bytes = await readPng(path, signal);
      total += bytes.byteLength;
      if (total > 64 * 1024 * 1024) throw Error("素材の合計が64MiBを超えました。");
      const cast = casts[entry.name] ?? casts[entry.name.split("_")[0]!];
      const label =
        cast && typeof cast === "object" && typeof (cast as { name?: unknown }).name === "string"
          ? (cast as { name: string }).name
          : entry.name;
      const name = `${label}${Object.hasOwn(casts, entry.name) ? "" : ` (${entry.name})`}`.slice(
        0,
        80,
      );
      let credit: string | undefined;
      try {
        await assetDirectory(join(root, "recipes"));
        const recipe = await readAssetJson(join(root, "recipes", `${entry.name}.json`), signal);
        if (typeof recipe._comment === "string") credit = recipe._comment.slice(0, 2000);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const png = normalize(bytes).toString("base64");
      characters.push({ id: entry.name, name, png, ...(credit ? { credit } : {}) });
      if (includeActors) {
        const actor = await yukkuriActor(root, entry.name, signal, guard);
        if (actor) {
          actorBytes += Buffer.byteLength(JSON.stringify(actor));
          if (actorBytes > 64 * 1024 * 1024) throw Error("表情素材の合計が64MiBを超えました。");
          actors.push(actor);
          characters.at(-1)!.actorSignature = actorSignature(actor);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        warnings.push(`${entry.name}: normal.pngがありません。`);
      else throw error;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  signal.throwIfAborted();
  guard();
  if (!characters.length) throw Error("取り込めるnormal.pngがありません。");
  return {
    pack: {
      id: "yukkuri-work",
      name: "フォルダから取り込んだキャラクター",
      version: "1.0.0",
      characters,
    } satisfies CharacterPack,
    warnings,
    actors,
  };
}
