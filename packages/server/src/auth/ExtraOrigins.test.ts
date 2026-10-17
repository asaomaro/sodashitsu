import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { it, expect, vi } from "vitest";
import { ExtraOrigins } from "./ExtraOrigins.js";
import { MemoryLogger } from "../log/Logger.js";
it("reloads only explicit HTTPS origins, removes revoked entries, and fails closed on malformed files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-origins-")),
    target = ["http://localhost:7780"],
    p = join(dir, "allowed-origins.json"),
    settings = new ExtraOrigins(dir, target, new MemoryLogger());
  try {
    await writeFile(p, JSON.stringify({ version: 1, origins: ["https://mobile.example.com/"] }));
    await settings.load();
    expect(target).toEqual(["http://localhost:7780", "https://mobile.example.com"]);
    expect(settings.wasPubliclyExposed).toBe(true);
    settings.watch();
    await writeFile(p, JSON.stringify({ version: 1, origins: ["https://new.example.com"] }));
    await vi.waitFor(
      () => expect(target).toEqual(["http://localhost:7780", "https://new.example.com"]),
      { timeout: 4000 },
    );
    await writeFile(
      p,
      JSON.stringify({ version: 1, origins: ["https://ok.example", "http://bad.example"] }),
    );
    await settings.load();
    expect(target).toEqual(["http://localhost:7780"]);
    expect(settings.wasPubliclyExposed).toBe(true);
    await rm(p);
    await settings.load();
    expect(target).toEqual(["http://localhost:7780"]);
    if (process.platform !== "win32") {
      const outside = join(dir, "outside.json");
      await writeFile(outside, JSON.stringify({ version: 1, origins: ["https://linked.example"] }));
      await symlink(outside, p);
      await settings.load();
      expect(target).toEqual(["http://localhost:7780"]);
    }
  } finally {
    settings.close();
    await rm(dir, { recursive: true, force: true });
  }
});
