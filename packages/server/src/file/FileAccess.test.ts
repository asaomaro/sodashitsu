import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FILE_CHUNK_BYTES } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { FileAccess } from "./FileAccess.js";

describe("FileAccess", () => {
  const cleanups: (() => Promise<unknown>)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0)) await fn();
  });

  async function setup() {
    const root = await makeTempDir("soda-file-access-");
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const cwd = join(root, "work");
    const home = join(root, "home");
    await mkdir(join(cwd, "src"), { recursive: true });
    await mkdir(home);
    await writeFile(join(cwd, "src", "a.ts"), "hello");
    await writeFile(join(home, "notes.txt"), "n");
    const access = new FileAccess({ cwdOf: (paneId) => (paneId === "p1" ? cwd : undefined), home });
    return { root, cwd, home, access };
  }

  it("相対パスは pane の場所から、~ はホームから解き、実在するものだけを返す（並びは入力と同じ）", async () => {
    const { cwd, home, access } = await setup();
    const files = await access.resolve("p1", ["src/a.ts", "src/none.ts", "./src", "~/notes.txt", join(cwd, "src", "a.ts"), "~"]);
    expect(files).toEqual([
      { path: join(cwd, "src", "a.ts"), kind: "file", size: 5 },
      null,
      { path: join(cwd, "src"), kind: "dir", size: 0 },
      { path: join(home, "notes.txt"), kind: "file", size: 1 },
      { path: join(cwd, "src", "a.ts"), kind: "file", size: 5 },
      { path: home, kind: "dir", size: 0 },
    ]);
  });

  it("無い pane は not_found", async () => {
    const { access } = await setup();
    await expect(access.resolve("p9", ["a"])).rejects.toMatchObject({ code: "not_found" });
  });

  it.skipIf(process.platform === "win32")("貼れない文字を含むパスは、実在しても無いものとして扱う", async () => {
    const { cwd, access } = await setup();
    await writeFile(join(cwd, "a\x1bb"), "x");
    expect(await access.resolve("p1", ["a\x1bb"])).toEqual([null]);
  });

  it("区切りが 2 つ続く始まり（Windows の UNC）は解かない", async () => {
    const { access } = await setup();
    expect(await access.resolve("p1", ["//evil/share/a.txt", "\\\\evil\\share\\a.txt", "//etc/hosts"])).toEqual([null, null, null]);
  });

  it("read は offset から 1 片ずつ返し、つなぐと元のバイト列になる", async () => {
    const { cwd, access } = await setup();
    const data = Buffer.alloc(FILE_CHUNK_BYTES + 1234);
    for (let i = 0; i < data.length; i++) data[i] = (i * 31) & 0xff;
    const path = join(cwd, "big.bin");
    await writeFile(path, data);
    const first = await access.read(path, 0);
    expect(first.size).toBe(data.length);
    const a = Buffer.from(first.data, "base64");
    expect(a.length).toBe(FILE_CHUNK_BYTES);
    const second = await access.read(path, a.length);
    expect(second.mtimeMs).toBe(first.mtimeMs);
    expect(Buffer.concat([a, Buffer.from(second.data, "base64")]).equals(data)).toBe(true);
    expect((await access.read(path, data.length)).data).toBe("");
  });

  it("read は、無い・相対・ディレクトリ・終わりより先を断る", async () => {
    const { cwd, access } = await setup();
    await expect(access.read(join(cwd, "none"), 0)).rejects.toMatchObject({ code: "file_not_found" });
    await expect(access.read("src/a.ts", 0)).rejects.toMatchObject({ code: "invalid_params" });
    await expect(access.read(join(cwd, "src"), 0)).rejects.toMatchObject({ code: "file_unreadable" });
    await expect(access.read(join(cwd, "src", "a.ts"), 6)).rejects.toMatchObject({ code: "invalid_params" });
  });

  it.skipIf(process.platform === "win32")("シンボリックリンクは辿る（シェルで読めるものは読める）", async () => {
    const { cwd, access } = await setup();
    await symlink(join(cwd, "src", "a.ts"), join(cwd, "link.ts"));
    expect(await access.resolve("p1", ["link.ts"])).toEqual([{ path: join(cwd, "link.ts"), kind: "file", size: 5 }]);
    expect(Buffer.from((await access.read(join(cwd, "link.ts"), 0)).data, "base64").toString()).toBe("hello");
  });
});
