import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it } from "vitest";
import { windowsAgentExecutable } from "./windowsAgentLaunch.js";
let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});
it("npm shimのJSを直接起動し、任意のbatchや未許可コマンドは実行しない", async () => {
  dir = await mkdtemp(join(tmpdir(), "soda-win-launch-"));
  const script = join(dir, "entry.cjs");
  await writeFile(script, "");
  await writeFile(join(dir, "claude.cmd"), '@echo off\n"%_prog%" "%dp0%\\entry.cjs" %*');
  expect(await windowsAgentExecutable("claude", { Path: dir })).toEqual({
    file: process.execPath,
    prefix: [script],
  });
  await writeFile(join(dir, "claude.cmd"), "@echo off\nother-program %*");
  await expect(windowsAgentExecutable("claude", { PATH: dir })).rejects.toThrow(
    "unsupported Windows batch wrapper",
  );
  await expect(windowsAgentExecutable("arbitrary", { PATH: dir })).rejects.toThrow(
    "unsupported agent executable",
  );
});
it("ネイティブexeを選び、相対PATHからコマンドを探さない", async () => {
  dir = await mkdtemp(join(tmpdir(), "soda-win-exe-"));
  await writeFile(join(dir, "codex.exe"), "");
  expect(await windowsAgentExecutable("codex", { PATH: dir })).toEqual({
    file: join(dir, "codex.exe"),
    prefix: [],
  });
  await expect(windowsAgentExecutable("codex", { PATH: "." })).rejects.toThrow("not found");
});
