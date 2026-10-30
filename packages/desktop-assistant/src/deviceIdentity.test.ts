import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { deviceIdentity } from "./deviceIdentity.js";

it("creates one stable installation UUID even for concurrent readers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-assistant-id-"));
  try {
    const path = join(dir, "identity");
    const ids = await Promise.all(Array.from({ length: 8 }, () => deviceIdentity(path)));
    expect(new Set(ids).size).toBe(1);
    expect(await deviceIdentity(path)).toBe(ids[0]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it("does not replace corrupted identity with a different device/session", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-assistant-id-"));
  try {
    const path = join(dir, "identity");
    await writeFile(path, "broken");
    await expect(deviceIdentity(path)).rejects.toThrow();
    expect(await readFile(path, "utf8")).toBe("broken");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
