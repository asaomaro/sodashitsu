import { spawn as nodeSpawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import { ExtensionProcess, type ExtChild, type ExtSpawn } from "./ExtensionProcess.js";

/**
 * 実際の子と孫で、プロセスのグループごと止まることを確かめる（20261007-ext-host の前提 u1）。Windows では動かさない。
 * 「生きていない」は、`process.kill(pid, 0)` が ESRCH、または Linux で /proc/<pid>/stat の状態が Z（ゾンビ）。
 */
async function isDead(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH";
  }
  try {
    const stat = await readFile(`/proc/${pid}/stat`, "utf8");
    return stat.slice(stat.lastIndexOf(")") + 2, stat.lastIndexOf(")") + 3) === "Z";
  } catch {
    return false;
  }
}
async function until(fn: () => Promise<boolean> | boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return fn();
}
async function readPid(file: string): Promise<number> {
  expect(await until(async () => (await readFile(file, "utf8").catch(() => "")).trim() !== "")).toBe(true);
  return Number((await readFile(file, "utf8")).trim());
}

describe.skipIf(process.platform === "win32")("ExtensionProcess（実際の子と孫）", () => {
  let dir: string;
  const live: number[] = [];
  const children: ExtChild[] = [];
  const spawnRecording: ExtSpawn = (file, args, opts) => {
    const c = nodeSpawn(file, args, { cwd: opts.cwd, env: opts.env, stdio: ["pipe", "pipe", "pipe"], detached: opts.detached });
    children.push(c);
    return c;
  };
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ext-proc-"));
  });
  afterEach(async () => {
    // テストが起動した子・孫を、残さない。
    for (const pid of live.splice(0)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // もう居ない
      }
    }
    for (const c of children.splice(0)) {
      if (c.pid !== undefined) {
        try {
          process.kill(-c.pid, "SIGKILL");
        } catch {
          // もう居ない
        }
      }
    }
    await rm(dir, { recursive: true, force: true });
  });
  const make = (command: string, logger = new MemoryLogger()) =>
    new ExtensionProcess(
      { key: "user:t", id: "t", scope: "user", root: null, command, cwd: dir, runId: "run-1" },
      { PATH: process.env["PATH"] ?? "" },
      { onRequest: () => undefined },
      { spawn: spawnRecording, logger },
    );

  it("(i) stop() が返った時点で、子と孫が、どちらも消えている", async () => {
    const pidFile = join(dir, "grand.pid");
    const p = make(`sleep 300 & echo $! > '${pidFile}'; exec sleep 300`);
    p.start();
    const grand = await readPid(pidFile);
    live.push(grand);
    const child = children[0]!.pid!;
    live.push(child);
    expect(await isDead(grand)).toBe(false);
    await p.stop("stopped");
    expect(await isDead(child)).toBe(true);
    expect(await isDead(grand)).toBe(true);
    expect((await p.exited).reason).toBe("stopped");
  }, 10_000);

  it("(ii) 合図を無視する孫を残して親が終了コード 0 で終わる → stop() を呼ばなくても、settled で孫が消えている", async () => {
    const pidFile = join(dir, "grand.pid");
    const inner = `trap "" TERM; echo $$ > '${pidFile}'; while :; do sleep 1; done`;
    const p = make(`sh -c '${inner}' & while [ ! -s '${pidFile}' ]; do sleep 0.05; done; exit 0`);
    p.start();
    const grand = await readPid(pidFile);
    live.push(grand);
    const exit = await p.exited;
    expect(exit.reason).toBe("exited");
    await p.settled;
    expect(await isDead(grand)).toBe(true);
  }, 10_000);

  it("(iii) (ii) と同じ拡張で、親の exit の直後（掃いている途中）に stop() を呼ぶと、返った時点で孫が消えている", async () => {
    const pidFile = join(dir, "grand.pid");
    const inner = `trap "" TERM; echo $$ > '${pidFile}'; while :; do sleep 1; done`;
    const p = make(`sh -c '${inner}' & while [ ! -s '${pidFile}' ]; do sleep 0.05; done; exit 0`);
    p.start();
    const grand = await readPid(pidFile);
    live.push(grand);
    await p.exited;
    await p.stop("stopped");
    expect(await isDead(grand)).toBe(true);
  }, 10_000);

  it("(iv) 標準エラーへ 1 行書いてすぐ終了コード 1 → その行が log() にある", async () => {
    const p = make(`echo 'last words' >&2; exit 1`);
    p.start();
    const exit = await p.exited;
    expect(exit).toMatchObject({ code: 1, reason: "crashed" });
    await p.settled;
    expect(p.log().lines).toContain("last words");
  }, 10_000);

  it("settled の後の stop() は、何もせずすぐ返る", async () => {
    const p = make(`exit 0`);
    p.start();
    await p.settled;
    await p.stop("stopped");
  });
});
