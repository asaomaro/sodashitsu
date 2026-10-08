import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProjectRoot } from "./projectRoot.js";

// 20261007-ext-host T20：プロジェクトの根。git のコマンドを呼ばず、worktree ごとの根の実体のパスを返す。
describe("resolveProjectRoot", () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await realpath(await mkdtemp(join(tmpdir(), "soda-root-")));
  });
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  async function repo(dir: string): Promise<string> {
    await mkdir(join(dir, ".git"), { recursive: true });
    await writeFile(join(dir, ".git", "HEAD"), "ref: refs/heads/main\n");
    return dir;
  }

  it("ふつうのリポジトリ: 中のフォルダから、リポジトリの根を返す", async () => {
    const root = await repo(join(tmp, "repo"));
    await mkdir(join(root, "a", "b"), { recursive: true });
    expect(await resolveProjectRoot(join(root, "a", "b"))).toBe(root);
    expect(await resolveProjectRoot(root)).toBe(root);
  });

  it("linked worktree（.git がファイル）: その worktree の根", async () => {
    const main = await repo(join(tmp, "main"));
    const gitdir = join(main, ".git", "worktrees", "wt");
    await mkdir(gitdir, { recursive: true });
    await writeFile(join(gitdir, "HEAD"), "ref: refs/heads/x\n");
    const wt = join(tmp, "wt");
    await mkdir(wt);
    await writeFile(join(wt, ".git"), `gitdir: ${gitdir}\n`);
    expect(await resolveProjectRoot(wt)).toBe(wt);
  });

  it("git の外 → null", async () => {
    await mkdir(join(tmp, "plain"));
    expect(await resolveProjectRoot(join(tmp, "plain"))).toBeNull();
  });

  it("根がリンク越し → 実体のパス", async () => {
    const root = await repo(join(tmp, "real"));
    await symlink(root, join(tmp, "link"));
    expect(await resolveProjectRoot(join(tmp, "link"))).toBe(root);
  });

  it("根のパスに改行・書字方向の制御を含む → null（承認の画面で正しく見せられない）", async () => {
    for (const name of ["a\nb", "a‮b"]) {
      const root = await repo(join(tmp, name));
      expect(await resolveProjectRoot(root), JSON.stringify(name)).toBeNull();
    }
  });

  it("1024 文字を超える根 → null", async () => {
    let dir = tmp;
    while (dir.length < 1100) {
      dir = join(dir, "x".repeat(200));
    }
    const label = { stat: async () => ({ isDirectory: true, isFile: true }), readFile: async () => null, home: () => "/h" };
    expect(await resolveProjectRoot(dir, { label, realpath: async (p) => p })).toBeNull();
  });

  it("realpath が ENOENT → null、それ以外の誤りは投げる（呼ぶ側が、今回は引けなかった、として扱う）", async () => {
    const root = await repo(join(tmp, "r"));
    const err = (code: string) => Object.assign(new Error(code), { code });
    expect(await resolveProjectRoot(root, { realpath: async () => { throw err("ENOENT"); } })).toBeNull();
    await expect(resolveProjectRoot(root, { realpath: async () => { throw err("EIO"); } })).rejects.toThrow("EIO");
  });

  it("PATH の先頭に、呼ばれたら印のファイルを作る偽の git を置いても、印が出来ない（git を呼ばない）", async () => {
    const root = await repo(join(tmp, "repo2"));
    const bin = join(tmp, "bin");
    await mkdir(bin);
    const mark = join(tmp, "git-was-called");
    await writeFile(join(bin, "git"), `#!/bin/sh\ntouch '${mark}'\n`);
    await chmod(join(bin, "git"), 0o755);
    const saved = process.env["PATH"];
    process.env["PATH"] = `${bin}:${saved ?? ""}`;
    try {
      expect(await resolveProjectRoot(root)).toBe(root);
    } finally {
      process.env["PATH"] = saved;
    }
    const { access } = await import("node:fs/promises");
    await expect(access(mark)).rejects.toThrow();
  });
});
