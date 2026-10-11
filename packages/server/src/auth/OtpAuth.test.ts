import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as atomic from "../persist/atomicFile.js";
import { OtpAuth, base32, totpCode } from "./OtpAuth.js";
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "soda-otp-"));
  dirs.push(dir);
  let time = 1_700_000_000_000,
    version = "token-version";
  const service = new OtpAuth(
    dir,
    () => version,
    () => time,
  );
  return {
    dir,
    service,
    clock: () => time,
    advance: (ms: number) => (time += ms),
    rotate: () => (version = "rotated"),
    restart: () =>
      new OtpAuth(
        dir,
        () => version,
        () => time,
      ),
  };
}
it("matches RFC 6238 SHA-1 test vectors", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  for (const [seconds, expected] of [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ] as const)
    expect(totpCode(secret, Math.floor(seconds / 30), 8)).toBe(expected);
});
it("uses a code once, revokes superseded and expired codes, and drops codes on restart", async () => {
  const f = await setup(),
    first = await f.service.issue(),
    second = await f.service.issue();
  expect(await f.service.verify("otp", first.code)).toBe(false);
  const accepted = await Promise.all([
    f.service.verify("otp", second.code),
    f.service.verify("otp", second.code),
  ]);
  expect(accepted.filter(Boolean)).toHaveLength(1);
  const expired = await f.service.issue();
  f.advance(5 * 60_000);
  expect(await f.service.verify("otp", expired.code)).toBe(false);
  const restart = await f.service.issue();
  expect(await f.restart().verify("otp", restart.code)).toBe(false);
});
it("confirms enrollment only in its owner session, hides stored secrets, persists replay prevention and revokes on token reset", async () => {
  const f = await setup(),
    enrollment = await f.service.begin("owner", "phone");
  const code = () => totpCode(enrollment.secret, Math.floor(f.clock() / 30_000));
  expect(enrollment.uri).toContain("otpauth://totp/");
  expect(await f.service.confirm("other", code())).toBe(false);
  expect(await f.service.confirm("owner", code())).toBe(true);
  expect(await f.service.verify("totp", code())).toBe(false);
  f.advance(30_000);
  expect(await f.service.verify("totp", code())).toBe(true);
  const restarted = f.restart();
  expect(await restarted.verify("totp", code())).toBe(false);
  const status = await restarted.status();
  expect(status.devices[0]?.label).toBe("phone");
  expect(JSON.stringify(status)).not.toContain(enrollment.secret);
  f.advance(30_000);
  f.rotate();
  expect(await restarted.verify("totp", code())).toBe(false);
  expect((await restarted.status()).devices).toHaveLength(0);
});
it("expires enrollment and removes registered credentials", async () => {
  const f = await setup(),
    expired = await f.service.begin("owner", "expired");
  f.advance(5 * 60_000);
  expect(
    await f.service.confirm("owner", totpCode(expired.secret, Math.floor(f.clock() / 30_000))),
  ).toBe(false);
  const enrolled = await f.service.begin("owner", "active");
  expect(
    await f.service.confirm("owner", totpCode(enrolled.secret, Math.floor(f.clock() / 30_000))),
  ).toBe(true);
  const [device] = (await f.service.status()).devices;
  await f.service.remove(device!.id);
  f.advance(30_000);
  expect(
    await f.service.verify("totp", totpCode(enrolled.secret, Math.floor(f.clock() / 30_000))),
  ).toBe(false);
  expect(JSON.parse(await readFile(join(f.dir, "otp-auth.json"), "utf8")).devices).toHaveLength(0);
});

it("does not accept a TOTP or reveal a registration when token reset happens during saving", async () => {
  const f = await setup(),
    enrollment = await f.service.begin("owner", "phone");
  const code = () => totpCode(enrollment.secret, Math.floor(f.clock() / 30_000));
  await f.service.confirm("owner", code());
  f.advance(30_000);
  const real = atomic.writeFileAtomic;
  vi.spyOn(atomic, "writeFileAtomic").mockImplementationOnce(async (...args) => {
    f.rotate();
    await real(...args);
  });
  await expect(f.service.verify("totp", code())).rejects.toThrow("authentication changed");
  expect((await f.restart().status()).devices).toHaveLength(0);
});
