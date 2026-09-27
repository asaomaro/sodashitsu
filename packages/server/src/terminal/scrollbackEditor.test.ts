import { execFile } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  removeScrollbackDir,
  scrollbackEditorArgv,
  splitWindowsCommandLine,
  writeScrollbackFile,
} from "./scrollbackEditor.js";

/** argv をそのまま起動し、終わるまで待つ（シェルを挟まない）。作業場所は `work`（壊れて何かを作っても afterEach で消える）。 */
function run(argv: string[], env: NodeJS.ProcessEnv): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(argv[0]!, argv.slice(1), { env, cwd: work }, (err, _stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stderr });
    });
  });
}

let work: string;
beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), "soda-scrollback-test-"));
});
afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

/** 受け取った引数を 1 つずつ NUL で区切って `out` に書く偽のエディタ。 */
async function fakeEditor(name: string, out: string): Promise<string> {
  const path = join(work, name);
  await writeFile(path, `#!/bin/sh\nfor a in "$@"; do printf '%s\\0' "$a"; done > '${out}'\n`);
  await chmod(path, 0o755);
  return path;
}

async function argsWritten(out: string): Promise<string[]> {
  const raw = await readFile(out, "utf8");
  return raw.split("\0").slice(0, -1);
}

describe("scrollbackEditorArgv（Unix）", () => {
  it("固定の script をシェルに渡し、パスは $1（script の外）で渡す", () => {
    const argv = scrollbackEditorArgv("/tmp/a b/scrollback.txt", "linux", {});
    expect(argv).toEqual([
      "/bin/sh",
      "-c",
      'eval "${EDITOR:-vi} \\"\\$1\\""',
      "soda-edit-scrollback",
      "/tmp/a b/scrollback.txt",
    ]);
  });

  describe.skipIf(process.platform === "win32")("実物の /bin/sh で", () => {
    it("引数付きの EDITOR にパスが 1 つの引数として届き、パスの中のシェルの特殊文字は実行されない（AC2・AC7）", async () => {
      const out = join(work, "args");
      const editor = await fakeEditor("editor", out);
      const dir = join(
        work,
        `we ird "q" $HOME;y'z $(touch pwned1) \`touch pwned2\` ; touch pwned3`,
      );
      await mkdir(dir);
      const path = join(dir, "scrollback.txt");
      await writeFile(path, "x");
      const result = await run(scrollbackEditorArgv(path, "linux", {})!, {
        ...process.env,
        EDITOR: `'${editor}' --wait -R`,
      });
      expect(result).toEqual({ code: 0, stderr: "" });
      expect(await argsWritten(out)).toEqual(["--wait", "-R", path]);
      const created = await readdir(work);
      expect(created.filter((n) => n.startsWith("pwned"))).toEqual([]);
    });

    it("EDITOR が無い・空なら vi を使う（AC2）", async () => {
      const out = join(work, "args");
      const bin = join(work, "bin");
      await mkdir(bin);
      const vi = await fakeEditor("bin/vi", out);
      const path = join(work, "scrollback.txt");
      await writeFile(path, "x");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      };
      delete env["EDITOR"];
      expect(vi).toBe(join(bin, "vi"));

      expect((await run(scrollbackEditorArgv(path, "linux", {})!, env)).code).toBe(0);
      expect(await argsWritten(out)).toEqual([path]);

      await rm(out);
      expect(
        (await run(scrollbackEditorArgv(path, "linux", {})!, { ...env, EDITOR: "" })).code,
      ).toBe(0);
      expect(await argsWritten(out)).toEqual([path]);
    });
  });
});

describe("scrollbackEditorArgv（Windows）", () => {
  const path = "C:\\Users\\U Ser\\AppData\\Local\\Temp\\soda-scrollback-x\\scrollback.txt";

  it("VISUAL を先に、無ければ EDITOR を、分解して末尾にパスを付ける（AC2）", () => {
    expect(
      scrollbackEditorArgv(path, "win32", {
        VISUAL: '"C:\\Program Files\\Microsoft VS Code\\Code.exe" --wait',
        EDITOR: "notepad",
      }),
    ).toEqual(["C:\\Program Files\\Microsoft VS Code\\Code.exe", "--wait", path]);
    expect(scrollbackEditorArgv(path, "win32", { EDITOR: "nvim -R" })).toEqual([
      "nvim",
      "-R",
      path,
    ]);
    expect(scrollbackEditorArgv(path, "win32", { VISUAL: "   ", EDITOR: "nvim" })).toEqual([
      "nvim",
      path,
    ]);
  });

  it("どちらも無い・空白だけなら null（AC5 の失敗。herdr の notepad.exe は使わない）", () => {
    expect(scrollbackEditorArgv(path, "win32", {})).toBeNull();
    expect(scrollbackEditorArgv(path, "win32", { VISUAL: "", EDITOR: " \t" })).toBeNull();
  });

  it("splitWindowsCommandLine は空白で区切り、引用符の中の空白は区切らない", () => {
    expect(splitWindowsCommandLine('  code  --wait\t"a b"c ')).toEqual(["code", "--wait", "a bc"]);
    expect(splitWindowsCommandLine("C:\\bin\\edit.exe")).toEqual(["C:\\bin\\edit.exe"]);
  });
});

describe("writeScrollbackFile / removeScrollbackDir", () => {
  it.skipIf(process.platform === "win32")(
    "専用のディレクトリ（0700）に 0600 のファイルとして書く。名前は呼ぶたびに違う（AC6）",
    async () => {
      const a = await writeScrollbackFile("hello\n", work);
      const b = await writeScrollbackFile("world\n", work);
      expect(a.dir).not.toBe(b.dir);
      expect(a.path).toBe(join(a.dir, "scrollback.txt"));
      expect(a.dir.startsWith(join(work, "soda-scrollback-"))).toBe(true);
      expect((await stat(a.dir)).mode & 0o777).toBe(0o700);
      expect((await stat(a.path)).mode & 0o777).toBe(0o600);
      expect(await readFile(a.path, "utf8")).toBe("hello\n");
    },
  );

  it("書く場所に既にファイルがあれば書かずに失敗し、ディレクトリを消す（AC6・AC8）", async () => {
    let dirSeen = "";
    const plantFile: typeof writeFile = async (file, data, options) => {
      dirSeen = String(file).slice(0, -"/scrollback.txt".length);
      await writeFile(String(file), "planted");
      return writeFile(file, data, options);
    };
    await expect(writeScrollbackFile("secret", work, plantFile)).rejects.toMatchObject({
      code: "EEXIST",
    });
    await expect(stat(dirSeen)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.skipIf(process.platform === "win32")(
    "書く場所に既にリンクがあれば追従して書かない（AC6）",
    async () => {
      const target = join(work, "target");
      await writeFile(target, "keep");
      let dirSeen = "";
      const plantLink: typeof writeFile = async (file, data, options) => {
        dirSeen = String(file).slice(0, -"/scrollback.txt".length);
        await symlink(target, String(file));
        return writeFile(file, data, options);
      };
      await expect(writeScrollbackFile("secret", work, plantLink)).rejects.toMatchObject({
        code: "EEXIST",
      });
      expect(await readFile(target, "utf8")).toBe("keep");
      await expect(stat(dirSeen)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("書き込みに失敗したら、作ったディレクトリを消してから投げる（AC8）", async () => {
    const failing: typeof writeFile = async () => {
      throw new Error("disk full");
    };
    await expect(writeScrollbackFile("x", work, failing)).rejects.toThrow("disk full");
    expect(await readdir(work)).toEqual([]);
  });

  it("removeScrollbackDir は中身ごと消し、無くなっていても投げない", async () => {
    const { dir } = await writeScrollbackFile("x", work);
    await removeScrollbackDir(dir);
    await expect(stat(dir)).rejects.toMatchObject({ code: "ENOENT" });
    await removeScrollbackDir(dir);
  });
});
