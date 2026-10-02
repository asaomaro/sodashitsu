import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { FileOpener, type FileOpenerOptions } from "./FileOpener.js";

/** 偽の子プロセス：起動された引数を覚え、テストから error・exit を起こす。 */
function fakeSpawn() {
  const calls: { command: string; args: string[]; child: EventEmitter & { unref(): void } }[] = [];
  const spawn: NonNullable<FileOpenerOptions["spawn"]> = (command, args) => {
    const child = Object.assign(new EventEmitter(), { unref: () => undefined });
    calls.push({ command, args, child });
    return child;
  };
  return { calls, spawn };
}

describe("FileOpener", () => {
  it("開くコマンドは OS で決まる（Windows: explorer.exe／macOS: open／WSL: wslview／画面のある Linux: xdg-open）", () => {
    const has = (names: string[]) => (c: string) => names.includes(c);
    const cmd = (opts: FileOpenerOptions): string | null => {
      const { calls, spawn } = fakeSpawn();
      const opener = new FileOpener({ ...opts, spawn, settleMs: 0 });
      if (!opener.available()) return null;
      void opener.open("/tmp/a.txt").catch(() => undefined);
      return calls[0]!.command;
    };
    expect(cmd({ platform: "win32", env: {} })).toBe("explorer.exe");
    expect(cmd({ platform: "darwin", env: {} })).toBe("open");
    expect(cmd({ platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" }, hasCommand: has(["wslview", "xdg-open"]) })).toBe("wslview");
    expect(cmd({ platform: "linux", env: { DISPLAY: ":0" }, hasCommand: has(["xdg-open"]) })).toBe("xdg-open");
    expect(cmd({ platform: "linux", env: { WAYLAND_DISPLAY: "wayland-0" }, hasCommand: has(["xdg-open"]) })).toBe("xdg-open");
  });

  it("画面が無い・コマンドが無い Linux では開く手段が無い（file_open_unavailable）", async () => {
    const { calls, spawn } = fakeSpawn();
    for (const opts of [
      { env: {}, hasCommand: () => true },
      { env: { DISPLAY: ":0" }, hasCommand: () => false },
      { env: { WSL_DISTRO_NAME: "Ubuntu" }, hasCommand: () => false },
    ]) {
      const opener = new FileOpener({ platform: "linux", spawn, ...opts });
      expect(opener.available()).toBe(false);
      await expect(opener.open("/tmp/a.txt")).rejects.toMatchObject({ code: "file_open_unavailable" });
    }
    expect(calls).toHaveLength(0);
  });

  it("パスは引数 1 つとして渡す（シェルを通さない）", async () => {
    const { calls, spawn } = fakeSpawn();
    const opener = new FileOpener({ platform: "darwin", env: {}, spawn });
    const done = opener.open("/tmp/my file; rm -rf $HOME.txt");
    calls[0]!.child.emit("exit", 0);
    await done;
    expect(calls[0]!.args).toEqual(["/tmp/my file; rm -rf $HOME.txt"]);
  });

  it("実行になる種類のファイルは起動せずに断る（file_open_refused）", async () => {
    const { calls, spawn } = fakeSpawn();
    const cases: [NodeJS.Platform, string][] = [
      ["win32", "C:\\dl\\setup.EXE"],
      ["win32", "C:\\dl\\run.bat"],
      ["win32", "C:\\dl\\x.lnk"],
      ["darwin", "/Applications/Evil.app"],
      ["darwin", "/tmp/run.command"],
      ["linux", "/tmp/evil.desktop"],
      ["linux", "/tmp/x.AppImage"],
    ];
    for (const [platform, path] of cases) {
      const opener = new FileOpener({ platform, env: { DISPLAY: ":0" }, hasCommand: () => true, spawn });
      await expect(opener.open(path)).rejects.toMatchObject({ code: "file_open_refused" });
    }
    expect(calls).toHaveLength(0);
  });

  it("WSL の wslview は Windows のシェルに渡すので、Windows で実行になる種類も断る。Windows は PATHEXT も見る", async () => {
    const { calls, spawn } = fakeSpawn();
    const wsl = new FileOpener({ platform: "linux", env: { WSL_DISTRO_NAME: "Ubuntu" }, hasCommand: () => true, spawn });
    for (const path of ["/mnt/c/dl/setup.bat", "/home/me/repo/run.exe", "/home/me/x.desktop"])
      await expect(wsl.open(path)).rejects.toMatchObject({ code: "file_open_refused" });
    const win = new FileOpener({ platform: "win32", env: { PATHEXT: ".COM;.EXE;.RB" }, spawn });
    await expect(win.open("C:\\dl\\tool.rb")).rejects.toMatchObject({ code: "file_open_refused" });
    expect(calls).toHaveLength(0);
  });

  it("macOS: 拡張子の無い実行できるファイルは断る（open が Terminal で走らせる）。実行できないものは開く", async () => {
    const { calls, spawn } = fakeSpawn();
    const opener = new FileOpener({ platform: "darwin", env: {}, spawn });
    await expect(opener.open("/tmp/run-me", { isFile: true, mode: 0o100755 })).rejects.toMatchObject({ code: "file_open_refused" });
    expect(calls).toHaveLength(0);
    const done = opener.open("/tmp/LICENSE", { isFile: true, mode: 0o100644 });
    calls[0]!.child.emit("exit", 0);
    await done;
    const dir = opener.open("/tmp/dir", { isFile: false, mode: 0o040755 });
    calls[1]!.child.emit("exit", 0);
    await dir;
  });

  it("コマンドが 0 以外で終わったら file_open_failed、起動できなければ file_open_unavailable", async () => {
    const { calls, spawn } = fakeSpawn();
    const opener = new FileOpener({ platform: "linux", env: { DISPLAY: ":0" }, hasCommand: () => true, spawn });
    const failed = opener.open("/tmp/a.txt");
    calls[0]!.child.emit("exit", 3);
    await expect(failed).rejects.toMatchObject({ code: "file_open_failed" });
    const missing = opener.open("/tmp/a.txt");
    calls[1]!.child.emit("error", Object.assign(new Error("spawn xdg-open ENOENT"), { code: "ENOENT" }));
    await expect(missing).rejects.toMatchObject({ code: "file_open_unavailable" });
  });

  it("explorer.exe は 1 で終わっても開けたものとして扱う", async () => {
    const { calls, spawn } = fakeSpawn();
    const opener = new FileOpener({ platform: "win32", env: {}, spawn });
    const done = opener.open("C:\\dl\\a.txt");
    calls[0]!.child.emit("exit", 1);
    await expect(done).resolves.toBeUndefined();
  });

  it("終わらないコマンド（アプリが閉じるまで戻らない開き方）は、待ち時間の後に開けたものとして扱う", async () => {
    const { spawn } = fakeSpawn();
    const opener = new FileOpener({ platform: "linux", env: { DISPLAY: ":0" }, hasCommand: () => true, spawn, settleMs: 10 });
    await expect(opener.open("/tmp/a.txt")).resolves.toBeUndefined();
  });
});
