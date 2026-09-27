import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { commandArgv, ptyArgs, spawnDetachedCommand } from "./commandLaunch.js";

const { argsToCommandLine } = createRequire(import.meta.url)("node-pty/lib/windowsPtyAgent.js") as {
  argsToCommandLine(file: string, args: string[] | string): string;
};

describe("commandArgv（20260927-custom-command-keys の AC11）", () => {
  it("Unix：popup・pane は /bin/sh -c、shell は -lc。文字列はそのまま最後の要素", () => {
    const cmd = `lazygit; echo "$HOME" 'a b' && x`;
    expect(commandArgv("popup", cmd, "linux", {})).toEqual(["/bin/sh", "-c", cmd]);
    expect(commandArgv("pane", cmd, "darwin", {})).toEqual(["/bin/sh", "-c", cmd]);
    expect(commandArgv("shell", cmd, "linux", {})).toEqual(["/bin/sh", "-lc", cmd]);
    expect(commandArgv("shell", cmd, "darwin", {})).toEqual(["/bin/sh", "-lc", cmd]);
  });

  it('Windows：ComSpec（大文字小文字を区別しない）の /d /s /c "<command>"。無い・空なら cmd.exe', () => {
    expect(
      commandArgv("popup", "dir", "win32", { ComSpec: "C:\\Windows\\system32\\cmd.exe" }),
    ).toEqual(["C:\\Windows\\system32\\cmd.exe", "/d", "/s", "/c", '"dir"']);
    expect(
      commandArgv("shell", '"C:\\Program Files\\x.exe" "a"', "win32", { COMSPEC: "X:\\cmd.exe" }),
    ).toEqual(["X:\\cmd.exe", "/d", "/s", "/c", '""C:\\Program Files\\x.exe" "a""']);
    expect(commandArgv("pane", "dir", "win32", {})).toEqual(["cmd.exe", "/d", "/s", "/c", '"dir"']);
    expect(commandArgv("pane", "dir", "win32", { ComSpec: "  " })).toEqual([
      "cmd.exe",
      "/d",
      "/s",
      "/c",
      '"dir"',
    ]);
  });
});

describe("ptyArgs（review ラウンド 1：Windows の PTY に引用を壊させない）", () => {
  it("Unix は配列のまま、Windows は 1 本の文字列にする", () => {
    expect(ptyArgs(["/bin/sh", "-c", "a b"], "linux")).toEqual(["-c", "a b"]);
    expect(ptyArgs(["cmd.exe", "/d", "/s", "/c", '"dir"'], "win32")).toBe('/d /s /c "dir"');
  });

  it('node-pty が作る Windows のコマンドラインは cmd.exe /d /s /c "<command>" のまま（中の引用符を書き換えない）', () => {
    for (const command of [
      "lazygit",
      '"C:\\Program Files\\x.exe" "a b"',
      "echo %USERNAME% & dir",
    ]) {
      const argv = commandArgv("popup", command, "win32", {
        ComSpec: "C:\\Windows\\system32\\cmd.exe",
      });
      expect(argsToCommandLine(argv[0]!, ptyArgs(argv, "win32"))).toBe(
        `C:\\Windows\\system32\\cmd.exe /d /s /c "${command}"`,
      );
    }
    // 配列のまま渡すと壊れる（直す前の形。負の確認の対照）
    expect(argsToCommandLine("cmd.exe", ["/d", "/s", "/c", '"lazygit"'])).not.toBe(
      'cmd.exe /d /s /c "lazygit"',
    );
  });
});

/** `spawn` の偽物：渡した指定を覚え、子プロセスの代わりのイベントの出し手を返す。 */
function fakeSpawn() {
  const calls: { file: string; args: readonly string[]; opts: Record<string, unknown> }[] = [];
  const child = Object.assign(new EventEmitter(), {
    unrefCalled: 0,
    unref() {
      this.unrefCalled++;
    },
  });
  const fn = ((file: string, args: readonly string[], opts: Record<string, unknown>) => {
    calls.push({ file, args, opts });
    return child;
  }) as unknown as typeof spawn;
  return { fn, calls, child };
}

describe("spawnDetachedCommand の指定（AC7）", () => {
  it("切り離し・入出力を捨てる・窓を出さない・unref。win32 だけ verbatim", () => {
    for (const platform of ["linux", "win32"] as const) {
      const f = fakeSpawn();
      spawnDetachedCommand(
        ["/bin/sh", "-lc", "make"],
        { cwd: "/w", env: { A: "1" }, platform },
        () => undefined,
        () => undefined,
        f.fn,
      );
      expect(f.calls).toEqual([
        {
          file: "/bin/sh",
          args: ["-lc", "make"],
          opts: {
            cwd: "/w",
            env: { A: "1" },
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            windowsVerbatimArguments: platform === "win32",
          },
        },
      ]);
      expect(f.child.unrefCalled).toBe(1);
    }
  });

  it("終わりと失敗はどちらか 1 度だけ知らせ、2 度目の error でも投げない", () => {
    const f = fakeSpawn();
    const seen: string[] = [];
    spawnDetachedCommand(
      ["x"],
      { cwd: "/", env: {}, platform: "linux" },
      () => seen.push("done"),
      (e) => seen.push(`error:${e.message}`),
      f.fn,
    );
    f.child.emit("error", new Error("a"));
    expect(() => f.child.emit("error", new Error("b"))).not.toThrow();
    f.child.emit("exit", 1);
    expect(seen).toEqual(["error:a"]);
  });

  it("空の argv は投げる", () => {
    expect(() =>
      spawnDetachedCommand(
        [],
        { cwd: "/", env: {}, platform: "linux" },
        () => undefined,
        () => undefined,
        fakeSpawn().fn,
      ),
    ).toThrow();
  });
});

describe.skipIf(process.platform === "win32")("spawnDetachedCommand の実物（AC7）", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "wtm-detached-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("作業場所・環境で走り、終わると onDone を 1 度呼ぶ", async () => {
    const out = join(dir, "out.txt");
    let done = 0;
    await new Promise<void>((resolve, reject) => {
      spawnDetachedCommand(
        commandArgv("shell", 'printf "%s|%s" "$WTM_COMMAND_ID" "$(pwd -P)" > out.txt', "linux", {}),
        {
          cwd: dir,
          env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", WTM_COMMAND_ID: "build" },
          platform: "linux",
        },
        () => {
          done++;
          resolve();
        },
        reject,
      );
    });
    expect(await readFile(out, "utf8")).toBe(`build|${await realpath(dir)}`);
    expect(done).toBe(1);
  });

  it("起動できない（無い実行ファイル）なら onError", async () => {
    const err = await new Promise<Error>((resolve, reject) => {
      spawnDetachedCommand(
        [join(dir, "no-such-binary")],
        { cwd: dir, env: {}, platform: "linux" },
        () => reject(new Error("done")),
        resolve,
      );
    });
    expect((err as NodeJS.ErrnoException).code).toBe("ENOENT");
  });
});
