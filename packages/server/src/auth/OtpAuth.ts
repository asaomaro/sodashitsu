import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { monotonicNow } from "../log/LogThrottle.js";
import { join } from "node:path";
import { z } from "zod";
import { openVerified, readRange } from "../agent/safeFile.js";
import { writeFileAtomic } from "../persist/atomicFile.js";

const TTL = 5 * 60_000;
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes: Buffer): string {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode(secret: string): Buffer {
  let bits = 0,
    value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("invalid secret");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  return Buffer.from(bytes);
}
export function totpCode(secret: string, counter: number, digits = 6): string {
  const input = Buffer.alloc(8);
  input.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decode(secret)).update(input).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, "0");
}
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const Device = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(64),
  secret: z.string().regex(/^[A-Z2-7]{32}$/),
  lastCounter: z.number().int().min(-1),
  createdAt: z.number().finite(),
});
const Stored = z.object({
  schema: z.literal(1),
  binding: z.string(),
  devices: z.array(Device).max(8),
});
type DeviceRecord = z.infer<typeof Device>;

export class OtpAuthChangedError extends Error {
  constructor() {
    super("authentication changed");
  }
}

/** Additional login methods. All mutations are serialized, and accepted TOTP counters persist before login. */
export class OtpAuth {
  private devices: DeviceRecord[] = [];
  private binding = "";
  private loaded = false;
  private tail: Promise<void> = Promise.resolve();
  private failures: number[] = [];
  private issued: { hash: string; expiresAt: number; binding: string } | null = null;
  private pending = new Map<
    string,
    { secret: string; label: string; expiresAt: number; binding: string; failures: number }
  >();
  constructor(
    private readonly stateDir: string,
    private readonly tokenVersion: () => string,
    private readonly now: () => number = Date.now,
  ) {}
  currentVersion(): string {
    return this.tokenVersion();
  }
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const version = this.tokenVersion();
    const check = () => {
      if (!version || version !== this.tokenVersion()) throw new OtpAuthChangedError();
    };
    const job = this.tail.then(async () => {
      check();
      await this.load();
      check();
      const result = await fn();
      check();
      return result;
    });
    this.tail = job.then(
      () => {},
      () => {},
    );
    return job;
  }
  private async load() {
    if (!this.loaded) {
      const file = await openVerified(join(this.stateDir, "otp-auth.json")).catch(
        (e: NodeJS.ErrnoException) => {
          if (e.code === "ENOENT") return null;
          throw e;
        },
      );
      if (file) {
        try {
          if (file.st.size > 65536) throw new Error("invalid authentication settings");
          const value = Stored.safeParse(
            JSON.parse((await readRange(file.fd, 0, file.st.size)).toString("utf8")),
          );
          if (!value.success) throw new Error("invalid authentication settings");
          this.binding = value.data.binding;
          this.devices = value.data.devices;
        } finally {
          await file.fd.close();
        }
      }
      this.loaded = true;
    }
    const binding = hash(this.tokenVersion());
    if (this.binding !== binding) {
      this.devices = [];
      this.issued = null;
      this.pending.clear();
      this.failures = [];
      this.binding = binding;
    }
    for (const [owner, value] of this.pending)
      if (value.expiresAt <= this.now()) this.pending.delete(owner);
  }
  private save() {
    return writeFileAtomic(
      join(this.stateDir, "otp-auth.json"),
      JSON.stringify({ schema: 1, binding: this.binding, devices: this.devices }),
    );
  }
  status() {
    return this.exclusive(async () => ({
      devices: this.devices.map(({ id, label, createdAt }) => ({ id, label, createdAt })),
    }));
  }
  issue() {
    return this.exclusive(async () => {
      const code =
        String(randomInt(0, 1_000_000)).padStart(6, "0") +
        String(randomInt(0, 1_000_000)).padStart(6, "0");
      const expiresAt = this.now() + TTL;
      this.issued = { hash: hash(code), expiresAt, binding: this.binding };
      return { code, expiresAt };
    });
  }
  revokeCode() {
    return this.exclusive(async () => {
      this.issued = null;
      return {};
    });
  }
  begin(owner: string, label: string) {
    return this.exclusive(async () => {
      if (
        !label.trim() ||
        label.length > 64 ||
        this.devices.length >= 8 ||
        (!this.pending.has(hash(owner)) && this.pending.size >= 16)
      )
        throw new Error("registration limit");
      const secret = base32(randomBytes(20)),
        expiresAt = this.now() + TTL;
      this.pending.set(hash(owner), {
        secret,
        label: label.trim(),
        expiresAt,
        binding: this.binding,
        failures: 0,
      });
      const uri = new URL("otpauth://totp/" + encodeURIComponent("Sodashitsu:" + label.trim()));
      uri.search = new URLSearchParams({
        secret,
        issuer: "Sodashitsu",
        algorithm: "SHA1",
        digits: "6",
        period: "30",
      }).toString();
      return { secret, uri: uri.toString(), expiresAt };
    });
  }
  cancel(owner: string) {
    return this.exclusive(async () => {
      this.pending.delete(hash(owner));
      return {};
    });
  }
  confirm(owner: string, code: string) {
    return this.exclusive(async () => {
      const key = hash(owner),
        pending = this.pending.get(key);
      if (
        !pending ||
        pending.expiresAt <= this.now() ||
        pending.binding !== this.binding ||
        ++pending.failures > 5 ||
        this.devices.length >= 8
      ) {
        this.pending.delete(key);
        return false;
      }
      const counter = this.match(pending.secret, code, -1);
      if (counter === null) return false;
      const device = {
        id: randomUUID(),
        label: pending.label,
        secret: pending.secret,
        lastCounter: counter,
        createdAt: this.now(),
      };
      this.devices.push(device);
      try {
        await this.save();
      } catch (e) {
        this.devices.pop();
        throw e;
      }
      this.pending.delete(key);
      return true;
    });
  }
  remove(id: string) {
    return this.exclusive(async () => {
      const previous = this.devices;
      this.devices = previous.filter((d) => d.id !== id);
      try {
        await this.save();
      } catch (e) {
        this.devices = previous;
        throw e;
      }
      return {};
    });
  }
  private match(secret: string, code: string, lastCounter: number): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const current = Math.floor(this.now() / 30_000);
    for (const counter of [current, current - 1, current + 1])
      if (counter >= 0 && counter > lastCounter && same(totpCode(secret, counter), code))
        return counter;
    return null;
  }
  verify(method: "otp" | "totp", code: string) {
    return this.exclusive(async () => {
      const time = monotonicNow();
      this.failures = this.failures.filter((t) => time - t < 60_000);
      if (this.failures.length >= 20) return false;
      this.failures.push(time);
      if (method === "otp") {
        if (!/^\d{12}$/.test(code)) return false;
        const issued = this.issued;
        if (
          !issued ||
          issued.expiresAt <= this.now() ||
          issued.binding !== this.binding ||
          !same(issued.hash, hash(code))
        )
          return false;
        this.issued = null;
        return true;
      }
      for (const device of this.devices) {
        const counter = this.match(device.secret, code, device.lastCounter);
        if (counter === null) continue;
        const previous = device.lastCounter;
        device.lastCounter = counter;
        try {
          await this.save();
        } catch (e) {
          device.lastCounter = previous;
          throw e;
        }
        return true;
      }
      return false;
    });
  }
}
