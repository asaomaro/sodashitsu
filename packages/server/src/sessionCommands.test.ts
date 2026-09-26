import { existsSync } from "node:fs";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "./configError.js";
import { makeTempDir } from "./persist/atomicFile.js";
import { StateDirLock } from "./persist/StateDirLock.js";
import {
  type CommandIo,
  runSessionDelete,
  runSessionList,
  runTokenReset,
} from "./sessionCommands.js";

function captureIo(): CommandIo & { outs: string[]; errs: string[] } {
  const outs: string[] = [];
  const errs: string[] = [];
  return { outs, errs, out: (l) => outs.push(l), err: (l) => errs.push(l) };
}

describe("wtm session list / delete・wtm token reset --session（20260926-named-session）", () => {
  let base: string;
  const held: StateDirLock[] = [];
  beforeEach(async () => {
    base = await makeTempDir("wtm-sesscmd-");
  });
  afterEach(async () => {
    for (const l of held.splice(0)) await l.release();
    await rm(base, { recursive: true, force: true });
  });
  const mkSession = async (name: string): Promise<string> => {
    const dir = join(base, "sessions", name);
    await mkdir(dir, { recursive: true });
    return dir;
  };

  it("list は表（name・status・directory）で、動いているものに pid を添える。終了コード 0", async () => {
    const work = await mkSession("work");
    const lock = new StateDirLock(work);
    await lock.acquire();
    held.push(lock);
    const io = captureIo();
    expect(await runSessionList(base, false, io)).toBe(0);
    expect(io.outs).toEqual([
      `${"name".padEnd(20)} status   directory`,
      `${"default".padEnd(20)} stopped  ${base}`,
      `${"work".padEnd(20)} running  ${work} (pid ${process.pid})`,
    ]);
  });

  it("list は別のホストのロックに (pid N on host) を添える", async () => {
    const remote = await mkSession("remote");
    await writeFile(join(remote, "wtm.lock"), "7\nsome-other-host-for-test\n");
    const io = captureIo();
    await runSessionList(base, false, io);
    expect(io.outs[2]).toBe(
      `${"remote".padEnd(20)} running  ${remote} (pid 7 on some-other-host-for-test)`,
    );
  });

  it("list --json は sessions の配列を 1 行の JSON で出す", async () => {
    const work = await mkSession("work");
    const io = captureIo();
    expect(await runSessionList(base, true, io)).toBe(0);
    expect(JSON.parse(io.outs.join(""))).toEqual({
      sessions: [
        { name: "default", default: true, running: false, stateDir: base },
        { name: "work", default: false, running: false, stateDir: work },
      ],
    });
  });

  it("delete は消して終了コード 0、断ったら理由を標準エラーに出して終了コード 1（--json なら error の JSON）", async () => {
    const work = await mkSession("work");
    const ok = captureIo();
    expect(await runSessionDelete(base, "work", false, ok)).toBe(0);
    expect(ok.outs).toEqual([`wtm: deleted session work (${work})`]);
    expect(existsSync(work)).toBe(false);

    const ng = captureIo();
    expect(await runSessionDelete(base, "work", false, ng)).toBe(1);
    expect(ng.errs[0]).toMatch(/^wtm: session work はありません/);

    const json = captureIo();
    expect(await runSessionDelete(base, "default", true, json)).toBe(1);
    expect(JSON.parse(json.errs[0]!)).toMatchObject({ error: { code: "default" } });

    await mkSession("other");
    const jsonOk = captureIo();
    expect(await runSessionDelete(base, "other", true, jsonOk)).toBe(0);
    expect(JSON.parse(jsonOk.outs[0]!)).toMatchObject({
      deleted: true,
      session: { name: "other", running: false },
    });
  });

  it("delete は規則外の名前を ConfigError で投げる（main が終了コード 2）", async () => {
    await expect(runSessionDelete(base, "../x", false, captureIo())).rejects.toThrow(ConfigError);
  });

  it("token reset --session work は work の auth.json だけを作り直し、既定の auth.json を変えない", async () => {
    const first = captureIo();
    await runTokenReset(base, undefined, first);
    const defaultAuth = await readFile(join(base, "auth.json"), "utf8");
    await mkSession("work");
    const io = captureIo();
    await runTokenReset(base, "work", io);
    expect(io.outs[0]).toMatch(/^wtm: new token: /);
    expect(await readFile(join(base, "auth.json"), "utf8")).toBe(defaultAuth);
    const workAuth = await readFile(join(base, "sessions", "work", "auth.json"), "utf8");
    expect(workAuth).not.toBe(defaultAuth);
    // 終えたらロックを放す（続けて同じ session の wtm serve・token reset が動ける）
    const next = new StateDirLock(join(base, "sessions", "work"));
    await next.acquire();
    await next.release();
  });

  it("token reset --session は無い session を作らずに断る（打ち間違い）", async () => {
    await expect(runTokenReset(base, "wrok", captureIo())).rejects.toThrow(/no such session: wrok/);
    expect(existsSync(join(base, "sessions"))).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "token reset --session は wtm serve --session と同じくシンボリックリンクの session を辿る",
    async () => {
      const target = await makeTempDir("wtm-sesscmd-target-");
      try {
        await mkdir(join(base, "sessions"), { recursive: true });
        await symlink(target, join(base, "sessions", "link"));
        const io = captureIo();
        await runTokenReset(base, "link", io);
        expect(io.outs[0]).toMatch(/^wtm: new token: /);
        expect(existsSync(join(target, "auth.json"))).toBe(true);
      } finally {
        await rm(target, { recursive: true, force: true });
      }
    },
  );

  it("token reset の規則外の名前は ConfigError で、何も作らない", async () => {
    await expect(runTokenReset(base, "..", captureIo())).rejects.toThrow(ConfigError);
    await expect(runTokenReset(base, "a/b", captureIo())).rejects.toThrow(ConfigError);
    expect(existsSync(join(base, "sessions"))).toBe(false);
    expect(existsSync(join(base, "auth.json"))).toBe(false);
  });

  it("token reset は WTM_SESSION から選んだ名前でも同じく work だけを作り直す（20260926-named-session-ui の AC13）", async () => {
    await mkSession("work");
    const io = captureIo();
    await runTokenReset(base, "work", io, "env");
    expect(io.outs[0]).toMatch(/^wtm: new token: /);
    expect(existsSync(join(base, "sessions", "work", "auth.json"))).toBe(true);
    expect(existsSync(join(base, "auth.json"))).toBe(false);
  });

  it("WTM_SESSION から選んだ名前が無い・動いているときは、案内に WTM_SESSION を添える（20260926-named-session-ui の AC14）", async () => {
    await expect(runTokenReset(base, "wrok", captureIo(), "env")).rejects.toMatchObject({
      hint: expect.stringContaining("WTM_SESSION"),
    });
    await expect(runTokenReset(base, "wrok", captureIo(), "flag")).rejects.toMatchObject({
      hint: expect.not.stringContaining("WTM_SESSION"),
    });
    const lock = new StateDirLock(await mkSession("work"));
    await lock.acquire();
    held.push(lock);
    await expect(runTokenReset(base, "work", captureIo(), "env")).rejects.toMatchObject({
      hint: expect.stringContaining("WTM_SESSION"),
    });
  });

  it("WTM_SESSION=default で既定の session が動いているときは、WTM_SESSION の案内を添えない（既定の session として扱う）", async () => {
    await mkdir(base, { recursive: true });
    const lock = new StateDirLock(base);
    await lock.acquire();
    held.push(lock);
    await expect(runTokenReset(base, "default", captureIo(), "env")).rejects.toMatchObject({
      message: expect.stringContaining("cannot reset the token"),
      hint: expect.not.stringContaining("WTM_SESSION"),
    });
  });

  it("token reset --session は、その session の wtm serve が動いていれば断る（ConfigError）", async () => {
    const lock = new StateDirLock(await mkSession("work"));
    await lock.acquire();
    held.push(lock);
    await expect(runTokenReset(base, "work", captureIo())).rejects.toThrow(
      /cannot reset the token/,
    );
  });
});
