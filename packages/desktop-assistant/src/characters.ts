import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { PluginBundle } from "@sodashitsu/client-core/node/pluginPackage";
import { pngSize } from "./png.js";
const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
const Character = z
  .object({
    id,
    name: z.string().min(1).max(80),
    png: z
      .string()
      .max(180000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict()
  .superRefine((value, ctx) => {
    try {
      const bytes = Buffer.from(value.png, "base64"),
        size = pngSize(bytes);
      if (
        bytes.toString("base64") !== value.png ||
        bytes.byteLength > 128 * 1024 ||
        size.width > 1024 ||
        size.height > 1024
      )
        throw Error();
    } catch {
      ctx.addIssue({ code: "custom", message: "素材は1024×1024・128KiB以内のPNGにしてください。" });
    }
  });
const Pack = z
  .object({
    id,
    name: z.string().min(1).max(80),
    version: z.string().max(30),
    characters: z
      .array(Character)
      .min(1)
      .max(8)
      .refine((values) => new Set(values.map((value) => value.id)).size === values.length),
  })
  .strict();
const Catalog = z
  .array(Pack)
  .max(16)
  .refine(
    (packs) =>
      new Set(packs.map((pack) => pack.id)).size === packs.length &&
      packs.reduce((sum, pack) => sum + pack.characters.length, 0) <= 32,
  );
export type CharacterPack = z.infer<typeof Pack>;
const MAX = 8 * 1024 * 1024;
/** Import inert PNG assets only. Bundle entry programs are never installed or executed here. */
export function characterPack(bundle: PluginBundle): CharacterPack {
  const definitions = bundle.manifest.assistantCharacters;
  if (!definitions?.length) throw Error("このパッケージにはアシスタント素材がありません。");
  return Pack.parse({
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    version: bundle.manifest.version,
    characters: definitions.map((def) => {
      const file = bundle.files.find((file) => file.path === def.file);
      if (!file) throw Error("素材ファイルがありません。");
      return { id: def.id, name: def.name, png: file.data };
    }),
  });
}
export class Characters {
  private packs: CharacterPack[] = [];
  private unavailable = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private path: string) {}
  async load() {
    try {
      const before = await lstat(this.path);
      if (!before.isFile() || before.isSymbolicLink() || before.size > MAX)
        throw Error("invalid catalog");
      const file = await open(this.path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > MAX || stat.ino !== before.ino || stat.dev !== before.dev)
          throw Error("invalid catalog");
        const bytes = Buffer.alloc(stat.size + 1);
        let used = 0;
        while (used < bytes.length) {
          const read = await file.read(bytes, used, bytes.length - used, null);
          if (!read.bytesRead) break;
          used += read.bytesRead;
        }
        const after = await file.stat();
        if (
          used !== stat.size ||
          after.size !== stat.size ||
          after.mtimeMs !== stat.mtimeMs ||
          after.ctimeMs !== stat.ctimeMs
        )
          throw Error("changed catalog");
        this.packs = Catalog.parse(JSON.parse(bytes.subarray(0, used).toString("utf8")));
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.unavailable = true;
        throw Error("素材を読み込めません。元ファイルは変更していません。");
      }
    }
  }
  list() {
    return this.packs.flatMap((pack) =>
      pack.characters.map((character) => ({
        id: `plugin:${pack.id}/${character.id}`,
        packId: pack.id,
        name: character.name,
        uri: `data:image/png;base64,${character.png}`,
      })),
    );
  }
  portrait(id: string) {
    return this.list().find((character) => character.id === id) ?? null;
  }
  install(input: CharacterPack) {
    const pack = Pack.parse(input);
    return this.change(() => [...this.packs.filter((old) => old.id !== pack.id), pack]);
  }
  remove(id: string) {
    return this.change(() => this.packs.filter((pack) => pack.id !== id));
  }
  private change(next: () => CharacterPack[]) {
    const task = this.queue.then(async () => {
      if (this.unavailable)
        throw Error("素材ファイルを修復してから追加してください。元ファイルは変更していません。");
      const packs = Catalog.parse(next()),
        json = JSON.stringify(packs);
      if (Buffer.byteLength(json) > MAX) throw Error("素材の保存容量を超えました。");
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temp = join(dirname(this.path), `.characters-${randomUUID()}.tmp`);
      try {
        const file = await open(temp, "wx", 0o600);
        try {
          await file.writeFile(json);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temp, this.path);
        this.packs = packs;
      } finally {
        await unlink(temp).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
      return this.list();
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
