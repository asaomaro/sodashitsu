import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { DesktopCdpDevices } from "./DesktopCdpDevices.js";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "soda-desktop-devices-")); dirs.push(dir);
  const path = join(dir, "desktop-cdp-devices.json"), store = new DesktopCdpDevices(path);
  await store.load(); return { path, store };
}
it("persists only hashes with private permissions, reloads and forgets credentials", async () => {
  const { path, store } = await fixture();
  const { device, secret } = await store.register("Existing desktop");
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(await readFile(path, "utf8")).not.toContain(secret);
  expect(store.verify(device.id, "0".repeat(64))).toBeUndefined();
  const reloaded = new DesktopCdpDevices(path); await reloaded.load();
  expect(reloaded.verify(device.id, secret)?.id).toBe(device.id);
  await reloaded.forget(device.id);
  const final = new DesktopCdpDevices(path); await final.load();
  expect(final.verify(device.id, secret)).toBeUndefined(); expect(final.list()).toEqual([]);
});
it("serializes overlapping registration and forgetting without losing updates", async () => {
  const { path, store } = await fixture();
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => store.register(`Desktop ${i}`)));
  await Promise.all(results.slice(0, 6).map(({ device }) => store.forget(device.id)));
  const loaded = new DesktopCdpDevices(path); await loaded.load();
  expect(loaded.list().map(d => d.id)).toEqual(results.slice(6).map(r => r.device.id));
});
it("fails closed on malformed or oversized registry and bounds registrations", async () => {
  const { path, store } = await fixture();
  await writeFile(path, '{"version":1,"devices":[{"secret":"unsafe"}]}');
  await expect(new DesktopCdpDevices(path).load()).rejects.toThrow();
  await writeFile(path, " ".repeat(128 * 1024 + 1));
  await expect(new DesktopCdpDevices(path).load()).rejects.toThrow("too large");
  // The memory store avoids unnecessary disk I/O for the count boundary.
  const memory = new DesktopCdpDevices(); await memory.load();
  for (let i = 0; i < 64; ++i) await memory.register("desktop");
  await expect(memory.register("overflow")).rejects.toThrow("full");
  expect(store.list()).toHaveLength(0);
});
