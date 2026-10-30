import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pngSize, readPng } from "./png.js";
const png = () =>
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPuoAAAAASUVORK5CYII=",
    "base64",
  );
it("rejects oversized dimensions and non-PNG before decoding", () => {
  expect(pngSize(png())).toEqual({ width: 1, height: 1 });
  expect(() => pngSize(Buffer.from("not image"))).toThrow("PNG");
  const bytes = png();
  bytes.writeUInt32BE(4000, 16);
  expect(() => pngSize(bytes)).toThrow("3840");
});
it("reads only a bounded regular file and honors cancellation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "assistant-png-"));
  try {
    const path = join(dir, "input.png");
    await writeFile(path, png());
    expect(await readPng(path, new AbortController().signal)).toEqual(png());
    await expect(readPng(dir, new AbortController().signal)).rejects.toThrow("通常");
    if (process.platform !== "win32") {
      await symlink(path, join(dir, "link.png"));
      await expect(readPng(join(dir, "link.png"), new AbortController().signal)).rejects.toThrow(
        "通常",
      );
    }
    const c = new AbortController();
    c.abort();
    await expect(readPng(path, c.signal)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
