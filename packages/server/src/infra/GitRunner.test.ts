import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { ChildProcessGitRunner } from "./GitRunner.js";

describe("ChildProcessGitRunner", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await makeTempDir("soda-git-");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("runs a git command and returns exit code and stdout", async () => {
    const runner = new ChildProcessGitRunner();
    await runner.run(dir, ["init", "-b", "main"], 5000);
    await runner.run(dir, ["config", "user.email", "t@example.com"], 5000);
    await runner.run(dir, ["config", "user.name", "t"], 5000);
    await writeFile(join(dir, "a.txt"), "hello");
    await runner.run(dir, ["add", "a.txt"], 5000);
    await runner.run(dir, ["commit", "-m", "init"], 5000);

    const branch = await runner.run(dir, ["rev-parse", "--abbrev-ref", "HEAD"], 5000);
    expect(branch.code).toBe(0);
    expect(branch.stdout.trim()).toBe("main");
  });

  it("returns a non-zero code for an invalid repository", async () => {
    const runner = new ChildProcessGitRunner();
    const notARepo = await mkdirTemp();
    const result = await runner.run(notARepo, ["rev-parse", "--abbrev-ref", "HEAD"], 5000);
    expect(result.code).not.toBe(0);
    await rm(notARepo, { recursive: true, force: true });
  });

  it("rejects when the command exceeds the timeout", async () => {
    const runner = new ChildProcessGitRunner();
    // git がすぐ終わらないケースの代わりに、極端に短いタイムアウトで確実にタイムアウトさせる。
    await expect(runner.run(dir, ["init"], 0)).rejects.toThrow(/timed out/);
  });
});

async function mkdirTemp(): Promise<string> {
  const dir = await makeTempDir("soda-notgit-");
  await mkdir(dir, { recursive: true });
  return dir;
}
