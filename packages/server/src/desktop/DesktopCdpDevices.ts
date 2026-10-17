import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const Device = z.object({
  id: z.string().uuid(), title: z.string().max(256),
  secretHash: z.string().regex(/^[a-f0-9]{64}$/), createdAt: z.number().int().nonnegative(),
}).strict();
const File = z.object({ version: z.literal(1), devices: z.array(Device).max(64) }).strict();
export type DesktopCdpDevice = z.infer<typeof Device>;
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** Same authenticated Soda user owns this bounded registry. Only hashes reach disk. */
export class DesktopCdpDevices {
  private devices: DesktopCdpDevice[] = [];
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly path?: string) {}
  async load(): Promise<void> {
    if (!this.path) return;
    let body: string;
    try {
      if ((await stat(this.path)).size > 128 * 1024) throw new Error("Desktop device registry too large");
      body = await readFile(this.path, "utf8");
    }
    catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return; throw e; }
    if (Buffer.byteLength(body) > 128 * 1024) throw new Error("Desktop device registry too large");
    const parsed = File.parse(JSON.parse(body));
    if (new Set(parsed.devices.map(d => d.id)).size !== parsed.devices.length) throw new Error("Duplicate desktop device id");
    this.devices = parsed.devices;
  }
  list(): DesktopCdpDevice[] { return this.devices.map(d => ({ ...d })); }
  verify(id: string, secret: string): DesktopCdpDevice | undefined {
    const device = this.devices.find(d => d.id === id);
    if (!device || !/^[a-f0-9]{64}$/.test(secret)) return;
    return timingSafeEqual(Buffer.from(device.secretHash, "hex"), Buffer.from(hash(secret), "hex")) ? { ...device } : undefined;
  }
  private mutate<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result.catch(() => {});
    return result;
  }
  private async save(devices: DesktopCdpDevice[]): Promise<void> {
    if (this.path) {
      await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, devices }), { mode: 0o600, flag: "wx" });
        await rename(temporary, this.path);
      } finally { await unlink(temporary).catch(() => {}); }
    }
    this.devices = devices;
  }
  register(title: string): Promise<{ device: DesktopCdpDevice; secret: string }> {
    return this.mutate(async () => {
      if (this.devices.length >= 64) throw new Error("Desktop device registry full");
      const secret = randomBytes(32).toString("hex");
      const device = { id: randomUUID(), title, secretHash: hash(secret), createdAt: Date.now() };
      await this.save([...this.devices, device]);
      return { device, secret };
    });
  }
  forget(id: string): Promise<void> {
    return this.mutate(() => this.save(this.devices.filter(d => d.id !== id)));
  }
}
