import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, rename, realpath, unlink, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  desktopSecretProtector,
  type DesktopSecretProtector,
} from "@sodashitsu/client-core/desktop/DesktopEndpointProtector.node";
import { checkDesktopWindowsPath } from "@sodashitsu/client-core/desktop/DesktopEndpointAcl.node";
import { directoryGuard } from "../work/files.js";
const Token = z.string().regex(/^[a-f0-9]{64}$/),
  Binding = Token;
const Key = z
  .object({
    version: z.literal(1),
    mode: z.enum(["owner-file", "dpapi-user"]),
    secret: z.string().min(4).max(4096),
  })
  .strict();
const Envelope = z
  .object({
    version: z.literal(1),
    nonce: z.string().max(24),
    tag: z.string().max(32),
    data: z.string().max(65536),
  })
  .strict();
const Policy = z.object({ version: z.literal(1), generation: z.uuid(), binding: Binding }).strict();
const Record = z
  .object({ version: z.literal(1), generation: z.uuid(), value: z.unknown() })
  .strict();
const unavailable = () => Error("転送の再開記録を安全に保存できません");
/** One server StateDirLock owns this store. Only encrypted continuation data,
 * never input/file grants or process owners, crosses a server generation. */
export class DesktopTransferStore {
  readonly directory: string;
  private queue: Promise<unknown> = Promise.resolve();
  private key: Buffer | undefined;
  private policy: z.infer<typeof Policy> | undefined;
  private checkDirectory: (() => Promise<void>) | undefined;
  private denied = false;
  private protector: DesktopSecretProtector;
  private platform: NodeJS.Platform;
  constructor(
    private options: {
      directory: string;
      binding: string;
      platform?: NodeJS.Platform;
      protector?: DesktopSecretProtector;
      checkWindowsPath?: (path: string, allowMissing?: boolean) => Promise<void>;
      folderRecords?: boolean;
    },
  ) {
    this.directory = resolve(options.directory);
    Binding.parse(options.binding);
    this.platform = options.platform ?? process.platform;
    this.protector = options.protector ?? desktopSecretProtector(this.platform);
    if (this.platform === "win32" && this.protector.mode !== "dpapi-user") throw unavailable();
  }
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }
  settled() {
    return this.queue;
  }
  private stat(st: Stats, directory = false) {
    if (
      st.isSymbolicLink() ||
      !(directory ? st.isDirectory() : st.isFile()) ||
      (!directory && st.nlink !== 1) ||
      (this.platform !== "win32" && (st.uid !== process.getuid?.() || (st.mode & 0o077) !== 0))
    )
      throw unavailable();
  }
  private async ancestors(path: string) {
    if (this.platform === "win32") {
      await (this.options.checkWindowsPath ?? checkDesktopWindowsPath)(path);
      return;
    }
    for (let current = resolve(path); ; current = dirname(current)) {
      const st = await lstat(current);
      if (
        !st.isDirectory() ||
        st.isSymbolicLink() ||
        (st.uid !== process.getuid?.() && st.uid !== 0) ||
        ((st.mode & 0o022) !== 0 && !(st.uid === 0 && (st.mode & 0o1000) !== 0))
      )
        throw unavailable();
      if (dirname(current) === current) break;
    }
  }
  private async absent() {
    try {
      await lstat(this.directory);
      return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
      throw error;
    }
  }
  private async check() {
    if (this.denied || !this.key || !this.checkDirectory) throw unavailable();
    await this.checkDirectory();
    this.stat(await lstat(this.directory), true);
  }
  private async read(name: string): Promise<string | undefined> {
    const path = join(this.directory, name);
    let before: Stats;
    try {
      before = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    this.stat(before);
    const limit = this.options.folderRecords && /^[a-f0-9]{64}\.json$/.test(name) ? 3145728 : 65536;
    if (before.size > limit) throw unavailable();
    const fd = await open(
      path,
      constants.O_RDONLY |
        (this.platform === "win32" ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK),
    );
    try {
      const st = await fd.stat();
      this.stat(st);
      if (st.dev !== before.dev || st.ino !== before.ino || st.size > limit) throw unavailable();
      const data = await fd.readFile("utf8"),
        after = await fd.stat(),
        named = await lstat(path);
      this.stat(named);
      if (
        after.size !== st.size ||
        after.mtimeMs !== st.mtimeMs ||
        after.ctimeMs !== st.ctimeMs ||
        named.ino !== st.ino ||
        named.dev !== st.dev
      )
        throw unavailable();
      return data;
    } finally {
      await fd.close();
    }
  }
  private seal(name: string, value: unknown) {
    const plain = Buffer.from(JSON.stringify(value));
    if (plain.length > (this.options.folderRecords ? 2097152 : 45000)) throw unavailable();
    const nonce = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key!, nonce);
    cipher.setAAD(Buffer.from("soda-desktop-transfer-v1:" + name));
    try {
      return JSON.stringify({
        version: 1,
        nonce: nonce.toString("base64"),
        ...(() => {
          const data = Buffer.concat([cipher.update(plain), cipher.final()]);
          return { data: data.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
        })(),
      });
    } finally {
      plain.fill(0);
    }
  }
  private unseal(name: string, text: string) {
    const e = (
        this.options.folderRecords ? Envelope.extend({ data: z.string().max(2796204) }) : Envelope
      ).parse(JSON.parse(text)),
      nonce = Buffer.from(e.nonce, "base64"),
      tag = Buffer.from(e.tag, "base64"),
      data = Buffer.from(e.data, "base64");
    if (
      nonce.length !== 12 ||
      tag.length !== 16 ||
      nonce.toString("base64") !== e.nonce ||
      tag.toString("base64") !== e.tag ||
      data.toString("base64") !== e.data
    )
      throw unavailable();
    const cipher = createDecipheriv("aes-256-gcm", this.key!, nonce);
    cipher.setAAD(Buffer.from("soda-desktop-transfer-v1:" + name));
    cipher.setAuthTag(tag);
    const plain = Buffer.concat([cipher.update(data), cipher.final()]);
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain));
    } finally {
      plain.fill(0);
    }
  }
  private async write(name: string, text: string, valid: () => boolean = () => true) {
    await this.check();
    if (!valid()) throw unavailable();
    const stage = join(this.directory, ".stage-" + randomUUID());
    let created = false;
    try {
      const fd = await open(
        stage,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      created = true;
      try {
        await fd.writeFile(text);
        await fd.sync();
      } finally {
        await fd.close();
      }
      await this.check();
      if (!valid()) throw unavailable();
      await rename(stage, join(this.directory, name));
      created = false;
      if (this.platform !== "win32") {
        const dir = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY);
        try {
          await dir.sync();
        } finally {
          await dir.close();
        }
      }
      await this.check();
      if (!valid()) throw unavailable();
    } finally {
      if (created)
        await this.check()
          .then(() => unlink(stage))
          .catch(() => {});
    }
  }
  private async initialize() {
    if (this.denied) throw unavailable();
    if (this.policy) {
      await this.check();
      return;
    }
    try {
      await this.ancestors(dirname(this.directory));
      try {
        await mkdir(this.directory, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      await this.ancestors(this.directory);
      this.stat(await lstat(this.directory), true);
      if ((await realpath(this.directory)) !== this.directory) throw unavailable();
      this.checkDirectory = await directoryGuard(this.directory);
      const names = await readdir(this.directory);
      if (names.length > 32) throw unavailable();
      const hasRecords = names.some((name) => /^[a-f0-9]{64}\.json$/.test(name));
      const saved = await this.read("key.json");
      if (saved === undefined && names.length) throw unavailable();
      if (hasRecords && !names.includes("generation.json")) throw unavailable();
      if (saved !== undefined) {
        const value = Key.parse(JSON.parse(saved));
        if (value.mode !== this.protector.mode) throw unavailable();
        if (this.platform === "win32")
          await (this.options.checkWindowsPath ?? checkDesktopWindowsPath)(
            join(this.directory, "key.json"),
          );
        const encrypted = Buffer.from(value.secret, "base64");
        if (encrypted.toString("base64") !== value.secret) throw unavailable();
        const key = await this.protector.unprotect(encrypted);
        try {
          if (key.length !== 32) throw unavailable();
          this.key = Buffer.from(key);
        } finally {
          key.fill(0);
        }
      } else {
        this.key = randomBytes(32);
        const encrypted = await this.protector.protect(this.key);
        const fd = await open(
          join(this.directory, "key.json"),
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
          0o600,
        );
        try {
          await fd.writeFile(
            JSON.stringify({
              version: 1,
              mode: this.protector.mode,
              secret: Buffer.from(encrypted).toString("base64"),
            }),
          );
          await fd.sync();
        } finally {
          encrypted.fill(0);
          await fd.close();
        }
        if (this.platform === "win32")
          await (this.options.checkWindowsPath ?? checkDesktopWindowsPath)(
            join(this.directory, "key.json"),
          );
      }
      await this.check();
      const data = await this.read("generation.json");
      this.policy =
        data === undefined
          ? { version: 1, generation: randomUUID(), binding: this.options.binding }
          : Policy.parse(this.unseal("generation.json", data));
      if (data === undefined || this.policy.binding !== this.options.binding) {
        this.policy = { version: 1, generation: randomUUID(), binding: this.options.binding };
        await this.write("generation.json", this.seal("generation.json", this.policy));
      }
    } catch (error) {
      console.error("GENERATED_STORE_INITIALIZE",error instanceof Error?error.message:"unknown");
      this.denied = true;
      this.key?.fill(0);
      this.key = undefined;
      throw unavailable();
    }
  }
  async generation(): Promise<string> {
    return this.serial(async () => {
      await this.initialize();
      return this.policy!.generation;
    });
  }
  list(
    includeRetired = false,
  ): Promise<Array<{ token: string; generation: string; value: unknown }>> {
    return this.serial(async () => {
      await this.initialize();
      const names = await readdir(this.directory);
      if (names.length > 32) throw unavailable();
      const result = [];
      for (const name of names) {
        if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
        const text = await this.read(name);
        if (text === undefined) continue;
        const record = Record.parse(this.unseal(name, text));
        if (includeRetired || record.generation === this.policy!.generation)
          result.push({
            token: name.slice(0, -5),
            generation: record.generation,
            value: record.value,
          });
      }
      if (result.filter((v) => v.generation === this.policy!.generation).length > 8)
        throw unavailable();
      await this.check();
      return result;
    });
  }
  put(token: string, generation: string, value: unknown, valid: () => boolean): Promise<void> {
    Token.parse(token);
    return this.serial(async () => {
      await this.initialize();
      if (generation !== this.policy!.generation || !valid()) throw unavailable();
      await this.write(
        token + ".json",
        this.seal(token + ".json", { version: 1, generation, value }),
        () => generation === this.policy!.generation && valid(),
      );
    });
  }
  remove(token: string): Promise<void> {
    Token.parse(token);
    return this.serial(async () => {
      await this.initialize();
      await this.check();
      const name = token + ".json";
      if ((await this.read(name)) !== undefined) {
        await unlink(join(this.directory, name));
        if (this.platform !== "win32") {
          const fd = await open(this.directory, constants.O_RDONLY | constants.O_DIRECTORY);
          try {
            await fd.sync();
          } finally {
            await fd.close();
          }
        }
      }
    });
  }
  /** Durable invalidation precedes the settings success response. A failed
   * generation write permanently denies this instance, never revives old data. */
  invalidate(): Promise<void> {
    return this.serial(async () => {
      try {
        if (!this.policy && (await this.absent())) {
          if (this.denied) throw unavailable();
          return;
        }
        await this.initialize();
        this.policy = { version: 1, generation: randomUUID(), binding: this.policy!.binding };
        await this.write("generation.json", this.seal("generation.json", this.policy));
      } catch {
        this.denied = true;
        throw unavailable();
      }
    });
  }
  bind(binding: string): Promise<void> {
    Binding.parse(binding);
    return this.serial(async () => {
      if (!this.policy && (await this.absent())) {
        if (this.denied) throw unavailable();
        this.options.binding = binding;
        return;
      }
      await this.initialize();
      try {
        this.policy = { ...this.policy!, binding };
        await this.write("generation.json", this.seal("generation.json", this.policy));
        this.options.binding = binding;
      } catch {
        this.denied = true;
        throw unavailable();
      }
    });
  }
}
