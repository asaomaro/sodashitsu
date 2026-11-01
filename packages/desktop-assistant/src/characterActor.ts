import { randomUUID, createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, mkdir, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { pngSize } from "./png.js";
const hashId = z.string().regex(/^[a-f0-9]{12,64}$/);
const Patch = z.tuple([
  hashId,
  z.number().int().min(0).max(1024),
  z.number().int().min(0).max(1024),
]);
const Face = z
  .object({
    e: Patch.optional(),
    blink: Patch.optional(),
    open: Patch.optional(),
    half: Patch.optional(),
  })
  .strict();
const FaceKey = z.enum(["normal", "smile", "think", "surprised"]);
const PoseKey = z.enum(["", "chin", "point", "raise"]);
const ActorData = z
  .object({
    id: z.string().regex(/^plugin:[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9][a-z0-9_-]{0,63}$/),
    w: z.number().int().min(1).max(1024),
    h: z.number().int().min(1).max(1024),
    source: z.string().max(2000).optional(),
    poses: z.partialRecord(
      PoseKey,
      z.object({ base: hashId, faces: z.partialRecord(FaceKey, Face) }).strict(),
    ),
    images: z.record(
      hashId,
      z
        .string()
        .max(700000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/),
    ),
  })
  .strict();
export type CharacterActor = z.infer<typeof ActorData>;
export function actorSignature(actor: CharacterActor): string {
  return createHash("sha256")
    .update(JSON.stringify(characterActor(actor)))
    .digest("hex");
}
export const ACTOR_LIMIT = 4 * 1024 * 1024;
export function characterActor(input: unknown): CharacterActor {
  const actor = ActorData.parse(input);
  if (!actor.poses[""] || Object.keys(actor.images).length > 96)
    throw Error("立ち絵の差分の数が不正です。");
  if (Buffer.byteLength(JSON.stringify(actor)) > ACTOR_LIMIT)
    throw Error("表情・ポーズは1キャラクター4MiB以内にしてください。");
  const sizes = new Map<string, { width: number; height: number }>();
  for (const [id, png] of Object.entries(actor.images)) {
    const bytes = Buffer.from(png, "base64");
    if (bytes.byteLength > 512 * 1024 || bytes.toString("base64") !== png)
      throw Error("差分PNGのサイズが不正です。");
    sizes.set(id, pngSize(bytes));
  }
  for (const pose of Object.values(actor.poses)) {
    const base = sizes.get(pose.base);
    if (!base || base.width !== actor.w || base.height !== actor.h)
      throw Error("ポーズの基準画像が不正です。");
    for (const face of Object.values(pose.faces))
      for (const patch of Object.values(face))
        if (patch) {
          const size = sizes.get(patch[0]);
          if (!size || patch[1] + size.width > actor.w || patch[2] + size.height > actor.h)
            throw Error("表情の差分が画像の範囲を超えています。");
        }
  }
  return actor;
}
const Meta = z
  .object({
    id: ActorData.shape.id,
    w: ActorData.shape.w,
    h: ActorData.shape.h,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().min(1).max(ACTOR_LIMIT),
  })
  .strict();
const Index = z
  .object({ version: z.literal(1), actors: z.array(Meta).max(128) })
  .strict()
  .superRefine((value, ctx) => {
    if (
      new Set(value.actors.map((a) => a.id)).size !== value.actors.length ||
      value.actors.reduce((sum, a) => sum + a.bytes, 0) > 128 * 1024 * 1024
    )
      ctx.addIssue({ code: "custom", message: "表情素材の保存上限を超えています。" });
  });
async function read(path: string, limit: number): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit)
    throw Error("通常の表情素材ファイルを確認してください。");
  const file = await open(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.ino !== before.ino ||
      stat.dev !== before.dev ||
      stat.size !== before.size
    )
      throw Error("表情素材が変更されました。");
    const data = Buffer.alloc(stat.size + 1);
    let used = 0;
    while (used < data.length) {
      const r = await file.read(data, used, data.length - used, null);
      if (!r.bytesRead) break;
      used += r.bytesRead;
    }
    const after = await file.stat();
    if (
      used !== stat.size ||
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      after.ctimeMs !== stat.ctimeMs
    )
      throw Error("表情素材が変更されました。");
    return data.subarray(0, used);
  } finally {
    await file.close();
  }
}
/** Inert local sprite data; immutable content-addressed files, one cached selected actor. */
export class CharacterActors {
  private actors = new Map<string, z.infer<typeof Meta>>();
  private blocked = false;
  private queue: Promise<unknown> = Promise.resolve();
  private cached: { hash: string; actor: CharacterActor } | null = null;
  constructor(private root: string) {}
  private async directory(create = false) {
    if (create) await mkdir(this.root, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.root);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw Error("表情素材のフォルダを確認してください。");
  }
  async load() {
    try {
      await this.directory();
      const data = Index.parse(
        JSON.parse((await read(join(this.root, "index.json"), 65536)).toString("utf8")),
      );
      this.actors = new Map(data.actors.map((a) => [a.id, a]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        this.blocked = true;
        throw Error("表情素材を読み込めません。元ファイルは保持しています。");
      }
    }
  }
  meta(id: string, signature?: string) {
    const a = this.actors.get(id);
    if (signature !== undefined && a?.hash !== signature) return null;
    return a ? { w: a.w, h: a.h } : null;
  }
  async get(id: string, signature?: string): Promise<CharacterActor | null> {
    const meta = this.actors.get(id);
    if (!meta || (signature !== undefined && signature !== meta.hash)) return null;
    if (this.cached?.hash === meta.hash) return structuredClone(this.cached.actor);
    await this.directory();
    const bytes = await read(join(this.root, meta.hash + ".json"), ACTOR_LIMIT);
    if (
      bytes.length !== meta.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== meta.hash
    )
      throw Error("表情素材が変更されています。");
    const actor = characterActor(JSON.parse(bytes.toString("utf8")));
    if (actor.id !== id || actor.w !== meta.w || actor.h !== meta.h)
      throw Error("表情素材が一致しません。");
    this.cached = { hash: meta.hash, actor };
    return structuredClone(actor);
  }
  installPack(packId: string, inputs: readonly CharacterActor[]): Promise<void> {
    const task = this.queue.then(async () => {
      if (this.blocked)
        throw Error("表情素材の保存先を修復してください。元ファイルは保持しています。");
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(packId) || inputs.length > 64)
        throw Error("表情素材のパックが不正です。");
      const entries = inputs.map((input) => {
        const actor = characterActor(input);
        if (!actor.id.startsWith(`plugin:${packId}/`))
          throw Error("表情素材のパックが一致しません。");
        const bytes = Buffer.from(JSON.stringify(actor)),
          hash = createHash("sha256").update(bytes).digest("hex");
        return {
          actor,
          bytes,
          meta: { id: actor.id, w: actor.w, h: actor.h, hash, bytes: bytes.length },
        };
      });
      const previous = [...this.actors.values()],
        next = Index.parse({
          version: 1,
          actors: [
            ...previous.filter((a) => !a.id.startsWith(`plugin:${packId}/`)),
            ...entries.map((e) => e.meta),
          ],
        });
      await this.directory(true);
      for (const e of entries) {
        const path = join(this.root, e.meta.hash + ".json");
        try {
          const old = await read(path, ACTOR_LIMIT);
          if (!old.equals(e.bytes)) throw Error("表情素材の配置先が変更されています。");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          const file = await open(path, "wx", 0o600);
          try {
            await file.writeFile(e.bytes);
            await file.sync();
          } finally {
            await file.close();
          }
        }
      }
      const temporary = join(this.root, `.index-${randomUUID()}.tmp`);
      try {
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(JSON.stringify(next));
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, join(this.root, "index.json"));
      } finally {
        await unlink(temporary).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
      }
      this.actors = new Map(next.actors.map((a) => [a.id, a]));
      this.cached = null;
      const retained = new Set(next.actors.map((a) => a.hash));
      for (const old of previous)
        if (!retained.has(old.hash))
          await unlink(join(this.root, old.hash + ".json")).catch((error) => {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          });
    });
    this.queue = task.catch(() => {});
    return task;
  }
}
