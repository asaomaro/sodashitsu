import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, rename, link, symlink, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DesktopNativeSources, type NativeSourceScope } from "./DesktopNativeSources.js";
import * as safeFiles from "../agent/safeFile.js";
import * as filesystem from "node:fs/promises";

vi.mock("node:fs/promises", { spy: true });

describe("native source approved-root lease", () => {
  let root: string, scope: NativeSourceScope, allowed: boolean, now: number;
  const leases: DesktopNativeSources[] = [];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "soda-native-source-"));
    scope = {
      owner: randomUUID(),
      origin: "https://example.test",
      gesture: randomUUID(),
      generation: randomUUID(),
    };
    allowed = true;
    now = 0;
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.mocked(filesystem.lstat).mockReset();
    vi.useRealTimers();
    await Promise.all(leases.splice(0).map((l) => l.close()));
    await rm(root, { recursive: true, force: true });
  });
  async function source(paths = [join(root, "file.txt")]) {
    const lease = await DesktopNativeSources.create(
      root,
      paths,
      scope,
      () => allowed,
      () => now,
    );
    leases.push(lease);
    return lease;
  }
  it("hashes a bounded selected tree, preserves empty directories and reads exact positional chunks", async () => {
    await mkdir(join(root, "folder"));
    await mkdir(join(root, "folder", "empty"));
    const data = Buffer.from("selected generated source");
    await writeFile(join(root, "folder", "text.txt"), data);
    const lease = await source([join(root, "folder")]),
      items = lease.manifest(scope),
      i = items.findIndex((e) => e.name === "folder\\text.txt");
    expect(items.find((e) => e.name === "folder\\empty")).toMatchObject({
      directory: true,
      bytes: 0,
      sha256: "",
    });
    expect(items[i]).toMatchObject({
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    });
    await expect(lease.read(scope, randomUUID(), i, 0, 1)).rejects.toThrow();
    lease.activate(scope);
    expect((await lease.read(scope, randomUUID(), i, 1, 4)).toString()).toBe("elec");
    const manifest = lease.manifest(scope) as unknown as Array<{ name: string }>;
    manifest[i]!.name = "mutated";
    expect(lease.manifest(scope)[i]!.name).toBe("folder\\text.txt");
  });
  it("refuses outside paths, the approved root itself and overlapping selections", async () => {
    await writeFile(join(root, "file.txt"), "a");
    await expect(source([root])).rejects.toThrow();
    await expect(source([join(root, "..", "outside")])).rejects.toThrow();
    await expect(source([join(root, "file.txt"), join(root, "file.txt")])).rejects.toThrow();
  });
  it("rejects an oversized sparse source before allocating it", async () => {
    await writeFile(join(root, "file.txt"), "");
    await truncate(join(root, "file.txt"), 100 * 1024 * 1024 + 1);
    await expect(source()).rejects.toThrow("容量上限");
  });
  it("keeps the initial selected manifest when unrelated directory entries are added", async () => {
    await mkdir(join(root, "folder"));
    await writeFile(join(root, "folder", "first"), "first");
    const lease = await source([join(root, "folder")]);
    lease.activate(scope);
    await writeFile(join(root, "folder", "later"), "later");
    const entries = lease.manifest(scope);
    expect(entries.map((e) => e.name)).toEqual(["folder", "folder\\first"]);
    expect((await lease.read(scope, randomUUID(), 1, 0, 5)).toString()).toBe("first");
  });
  it("publishes the hashed initial bytes even when filesystem timestamps hide a same-size rewrite", async () => {
    const path = join(root, "file.txt");
    await writeFile(path, "first");
    const lease = await source();
    lease.activate(scope);
    const { lstat: originalStat } =
      await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    const before = await originalStat(path, { bigint: true });
    await writeFile(path, "later");
    // Model a filesystem whose identity/timestamps report the same values within one tick.
    vi.spyOn(filesystem, "lstat").mockImplementation(((
      file: Parameters<typeof filesystem.lstat>[0],
      options?: unknown,
    ) =>
      file === path
        ? Promise.resolve(before)
        : originalStat(file, options as { bigint: true })) as typeof filesystem.lstat);
    expect((await lease.read(scope, randomUUID(), 0, 0, 5)).toString()).toBe("first");
  });
  it.each(["authority", "clock"])(
    "rejects final publication after reentrant close from %s",
    async (mode) => {
      await writeFile(join(root, "file.txt"), "abc");
      let calls = 0,
        armed = false,
        closing: Promise<void> | undefined,
        lease: DesktopNativeSources;
      const reenter = () => {
        if (armed && ++calls === 6) closing = lease.close();
      };
      lease = await DesktopNativeSources.create(
        root,
        [join(root, "file.txt")],
        scope,
        () => {
          if (mode === "authority") reenter();
          return true;
        },
        () => {
          if (mode === "clock") reenter();
          return 0;
        },
      );
      leases.push(lease);
      lease.activate(scope);
      armed = true;
      let copied: Buffer | undefined;
      const original = Buffer.from;
      vi.spyOn(Buffer, "from").mockImplementation(((...args: Parameters<typeof Buffer.from>) => {
        copied = original(...args);
        return copied;
      }) as typeof Buffer.from);
      await expect(lease.read(scope, randomUUID(), 0, 0, 3)).rejects.toThrow();
      expect(closing).toBeDefined();
      await closing;
      expect(copied).toEqual(Buffer.alloc(3));
      expect(() => lease.manifest(scope)).toThrow();
    },
  );
  it.each(["COM¹.txt", "LPT².bin", "NUL", "trailing.", "has:stream", "name\\other"])(
    "rejects Windows ambiguous name %s",
    async (file) => {
      if (process.platform === "win32") return;
      await writeFile(join(root, file), "a");
      await expect(source([join(root, file)])).rejects.toThrow();
    },
  );
  it("rejects normalized/case duplicate names", async () => {
    if (process.platform === "win32") return;
    await writeFile(join(root, "File"), "a");
    await writeFile(join(root, "file"), "b");
    await expect(source([join(root, "File"), join(root, "file")])).rejects.toThrow();
  });
  it("rejects hardlinks and directory symlinks", async () => {
    await writeFile(join(root, "file.txt"), "a");
    await link(join(root, "file.txt"), join(root, "linked"));
    await expect(source()).rejects.toThrow();
    if (process.platform === "win32") return;
    await mkdir(join(root, "dir"));
    await writeFile(join(root, "dir", "a"), "b");
    await symlink(join(root, "dir"), join(root, "alias"));
    await expect(source([join(root, "alias", "a")])).rejects.toThrow();
  });
  it.each(["replace", "rewrite", "parent"])(
    "invalidates source %s before publishing",
    async (change) => {
      await mkdir(join(root, "dir"));
      const path = join(root, "dir", "a");
      await writeFile(path, "original");
      const lease = await source([path]);
      lease.activate(scope);
      if (change === "replace") {
        await rename(path, path + ".old");
        await writeFile(path, "original");
      }
      if (change === "rewrite") await writeFile(path, "modified-longer");
      if (change === "parent") {
        await rename(join(root, "dir"), join(root, "old"));
        await mkdir(join(root, "dir"));
        await writeFile(path, "original");
      }
      await expect(lease.read(scope, randomUUID(), 0, 0, 1)).rejects.toThrow();
      await expect(lease.read(scope, randomUUID(), 0, 0, 1)).rejects.toThrow();
    },
  );
  it.each(["owner", "origin", "gesture", "generation"] as const)("binds %s", async (field) => {
    await writeFile(join(root, "file.txt"), "a");
    const lease = await source();
    lease.activate(scope);
    const other = { ...scope, [field]: field === "origin" ? "https://other.test" : randomUUID() };
    await expect(lease.read(other, randomUUID(), 0, 0, 1)).rejects.toThrow();
    expect((await lease.read(scope, randomUUID(), 0, 0, 1)).toString()).toBe("a");
  });
  it("refuses reused requests and out-of-bounds reads", async () => {
    await writeFile(join(root, "file.txt"), "abc");
    const lease = await source();
    lease.activate(scope);
    const id = randomUUID();
    await lease.read(scope, id, 0, 0, 1);
    await expect(lease.read(scope, id, 0, 0, 1)).rejects.toThrow();
    for (const [index, offset, length] of [
      [-1, 0, 1],
      [0, -1, 1],
      [0, 0, 65537],
      [0, 2, 2],
      [0, 0, 0],
      [0, 1.5, 1],
    ])
      await expect(lease.read(scope, randomUUID(), index!, offset!, length!)).rejects.toThrow();
  });
  it("revokes before reading and cannot be revived by heartbeat", async () => {
    await writeFile(join(root, "file.txt"), "abc");
    const lease = await source();
    lease.activate(scope);
    allowed = false;
    await expect(lease.read(scope, randomUUID(), 0, 0, 1)).rejects.toThrow();
    allowed = true;
    expect(() => lease.heartbeat(scope)).toThrow();
    await lease.close();
  });
  it.each(["offer", "idle", "absolute", "backward"])("expires %s irreversibly", async (mode) => {
    await writeFile(join(root, "file.txt"), "abc");
    const lease = await source();
    if (mode !== "offer") lease.activate(scope);
    if (mode === "absolute") for (now = 4000; now < 900000; now += 4000) lease.heartbeat(scope);
    now = mode === "offer" ? 1500 : mode === "idle" ? 5000 : mode === "absolute" ? 900000 : -1;
    expect(() => lease.heartbeat(scope)).toThrow();
    now = 0;
    expect(() => lease.manifest(scope)).toThrow();
  });
  it("automatically cancels an unused offer without another request", async () => {
    vi.useFakeTimers();
    await writeFile(join(root, "file.txt"), "abc");
    const lease = await source();
    now = 1500;
    await vi.advanceTimersByTimeAsync(1500);
    now = 0;
    expect(() => lease.activate(scope)).toThrow();
  });
  it("erases a partially built snapshot while its next filesystem read is pending", async () => {
    vi.useFakeTimers();
    const size = 70000;
    await writeFile(join(root, "file.txt"), Buffer.alloc(size, 7));
    let snapshot: Buffer | undefined, release!: () => void, waiting!: () => void;
    const blocked = new Promise<void>((done) => (release = done)),
      entered = new Promise<void>((done) => (waiting = done)),
      originalRead = safeFiles.readRange,
      originalAlloc = Buffer.alloc;
    vi.spyOn(Buffer, "alloc").mockImplementation(((...args: Parameters<typeof Buffer.alloc>) => {
      const buffer = originalAlloc(...args);
      if (args[0] === size) snapshot = buffer;
      return buffer;
    }) as typeof Buffer.alloc);
    vi.spyOn(safeFiles, "readRange").mockImplementation(async (fd, start, length) => {
      if (start === 65536) {
        waiting();
        await blocked;
      }
      return originalRead(fd, start, length);
    });
    const creating = DesktopNativeSources.create(
        root,
        [join(root, "file.txt")],
        scope,
        () => true,
        () => now,
      ),
      rejected = expect(creating).rejects.toThrow();
    try {
      await entered;
      expect(snapshot?.[0]).toBe(7);
      now = 1500;
      await vi.advanceTimersByTimeAsync(1500);
      expect(snapshot?.every((byte) => byte === 0)).toBe(true);
    } finally {
      release();
      await rejected;
    }
    expect(snapshot?.every((byte) => byte === 0)).toBe(true);
  });
});
