import type { Dirent } from "node:fs";
import { existsSync } from "node:fs";
import { chmod, mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../configError.js";
import { makeTempDir } from "./atomicFile.js";
import {
  deleteSession,
  findExactEntry,
  listServerSessions,
  listSessions,
  resolveSessionStateDir,
  SessionDeleteError,
  sessionNameProblem,
} from "./namedSession.js";
import { hostname } from "node:os";
import { writeServeRecord } from "./ServeRecordFile.js";
import { STATE_DIR_LOCK_FILE, StateDirLock } from "./StateDirLock.js";

describe("sessionNameProblem（名前の規則）", () => {
  it.each([
    "work",
    "side-project",
    "a",
    "A.b_c-1",
    "x".repeat(64),
    "default",
    "com10",
    "lpt",
    "console",
    "xcon",
    "mycom1",
    ".hidden",
  ])("%s は使える", (name) => {
    expect(sessionNameProblem(name)).toBeUndefined();
  });

  it.each([
    ["", "空"],
    [".", ". と .."],
    ["..", ". と .."],
    ["../x", "文字"],
    ["a/b", "文字"],
    ["a\\b", "文字"],
    ["a b", "文字"],
    ["a\nb", "文字"],
    ["名前", "文字"],
    ["x".repeat(65), "64"],
    ["-x", "先頭"],
    ["work.", "末尾"],
    ["con", "予約"],
    ["NUL", "予約"],
    ["Com1", "予約"],
    ["lpt9", "予約"],
    ["com0", "予約"],
    ["LPT0", "予約"],
    ["aux.txt", "予約"],
    ["prn", "予約"],
  ])("%j は使えない（%s）", (name, reason) => {
    expect(sessionNameProblem(name)).toContain(reason);
  });
});

describe("resolveSessionStateDir（状態ディレクトリの解決）", () => {
  it("名前が無い・default なら既定の状態ディレクトリそのもの（今までどおり）", () => {
    expect(resolveSessionStateDir("/s/wtm", undefined)).toBe("/s/wtm");
    expect(resolveSessionStateDir("/s/wtm", "default")).toBe("/s/wtm");
  });

  it("名前付きは <base>/sessions/<name>", () => {
    expect(resolveSessionStateDir("/s/wtm", "work")).toBe(join("/s/wtm", "sessions", "work"));
  });

  it("規則外の名前は ConfigError（規則を案内に含める）", () => {
    for (const bad of ["..", "../etc", "a/b", "", "con"]) {
      expect(() => resolveSessionStateDir("/s/wtm", bad)).toThrow(ConfigError);
    }
    expect(() => resolveSessionStateDir("/s/wtm", "../x")).toThrow(
      expect.objectContaining({
        message: 'invalid session name: "../x" (使えない文字を含みます)',
        hint: expect.stringContaining("ASCII"),
      }),
    );
  });
});

describe("listSessions・deleteSession（一覧と削除）", () => {
  let base: string;
  const held: StateDirLock[] = [];
  beforeEach(async () => {
    base = await makeTempDir("wtm-named-");
  });
  afterEach(async () => {
    for (const l of held.splice(0)) await l.release();
    await rm(base, { recursive: true, force: true });
  });
  const mkSession = async (name: string): Promise<string> => {
    const dir = join(base, "sessions", name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "session.json"), "{}");
    return dir;
  };
  /** このプロセスで持つロック（同じ pid・このプロセスで持っている＝使用中）。 */
  const run = async (dir: string): Promise<void> => {
    const lock = new StateDirLock(dir);
    await lock.acquire();
    held.push(lock);
  };

  it("sessions が無ければ既定だけ（状態ディレクトリが無くても出す）。何も作らない", async () => {
    const missing = join(base, "nope");
    expect(await listSessions(missing)).toEqual([
      { name: "default", default: true, running: false, stateDir: missing },
    ]);
    expect(existsSync(missing)).toBe(false);
  });

  it("既定を先頭に名前順。規則外の名前・default・ファイル・シンボリックリンクは出さない。動いているものは pid つき", async () => {
    await mkSession("work");
    const alpha = await mkSession("alpha");
    await mkSession("bad name");
    await mkSession("default");
    await writeFile(join(base, "sessions", "file"), "x");
    if (process.platform !== "win32") await symlink(alpha, join(base, "sessions", "link"));
    await run(alpha);
    const list = await listSessions(base);
    expect(list.map((e) => e.name)).toEqual(["default", "alpha", "work"]);
    expect(list[1]).toEqual({
      name: "alpha",
      default: false,
      running: true,
      pid: process.pid,
      stateDir: alpha,
    });
    expect(list[2]).toMatchObject({ name: "work", running: false });
    expect(list[2]!.pid).toBeUndefined();
  });

  it("delete は動いていない名前付き session の状態ディレクトリを丸ごと消す", async () => {
    const dir = await mkSession("work");
    await mkSession("keep");
    const deleted = await deleteSession(base, "work");
    expect(deleted).toEqual({ name: "work", default: false, running: false, stateDir: dir });
    expect(existsSync(dir)).toBe(false);
    expect(await readdir(join(base, "sessions"))).toEqual(["keep"]);
  });

  it("一覧は別のホストのロックを running とし、そのホスト名を添える", async () => {
    const dir = await mkSession("remote");
    await writeFile(join(dir, STATE_DIR_LOCK_FILE), "7\nsome-other-host-for-test\n");
    expect((await listSessions(base))[1]).toEqual({
      name: "remote",
      default: false,
      running: true,
      pid: 7,
      host: "some-other-host-for-test",
      stateDir: dir,
    });
  });

  it("delete は普通のファイルを消さない（not-directory）", async () => {
    await mkdir(join(base, "sessions"), { recursive: true });
    await writeFile(join(base, "sessions", "plain"), "x");
    await expect(deleteSession(base, "plain")).rejects.toMatchObject({ code: "not-directory" });
    expect(existsSync(join(base, "sessions", "plain"))).toBe(true);
  });

  it("一覧は readdir の順に依らず名前順", async () => {
    const names = ["zeta", "yak", "x-ray", "whisky", "victor", "uniform", "tango", "sierra"];
    for (const n of names) await mkSession(n);
    expect((await listSessions(base)).map((e) => e.name)).toEqual([
      "default",
      ...[...names].sort(),
    ]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "delete は先に ~deleting- の名前へ移してから消す：消す途中で失敗しても元の名前は残らず（wtm.lock の無い半端な session を残さない）、remove-failed",
    async () => {
      const dir = await mkSession("work");
      await mkdir(join(dir, "stuck"));
      await writeFile(join(dir, "stuck", "file"), "x");
      await chmod(join(dir, "stuck"), 0o500); // この下のファイルは消せない
      let doomed: string | undefined;
      try {
        await expect(deleteSession(base, "work")).rejects.toMatchObject({ code: "remove-failed" });
        const rest = await readdir(join(base, "sessions"));
        expect(rest).toHaveLength(1);
        expect(rest[0]).toMatch(/^work~deleting-/);
        doomed = join(base, "sessions", rest[0]!);
        expect(existsSync(dir)).toBe(false);
        expect(existsSync(join(doomed, STATE_DIR_LOCK_FILE))).toBe(false);
        expect((await listSessions(base)).map((e) => e.name)).toEqual(["default"]);
      } finally {
        if (doomed !== undefined) await chmod(join(doomed, "stuck"), 0o700).catch(() => undefined);
      }
    },
  );

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "delete で移せない（rename の失敗）ときは remove-failed で、ロックを残さない",
    async () => {
      const dir = await mkSession("work");
      await chmod(join(base, "sessions"), 0o500);
      try {
        await expect(deleteSession(base, "work")).rejects.toMatchObject({ code: "remove-failed" });
      } finally {
        await chmod(join(base, "sessions"), 0o700);
      }
      expect(existsSync(join(dir, "session.json"))).toBe(true);
      expect(existsSync(join(dir, STATE_DIR_LOCK_FILE))).toBe(false);
    },
  );

  it("delete は落ちて残ったかもしれないロック（別のホスト）も消さずに断り、ロックの消し方を添える", async () => {
    const dir = await mkSession("remote");
    await writeFile(join(dir, STATE_DIR_LOCK_FILE), "7\nsome-other-host-for-test\n");
    const err = await deleteSession(base, "remote").catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "running" });
    expect((err as Error).message).toContain("some-other-host-for-test");
    expect((err as Error).message).toContain(`${join(dir, STATE_DIR_LOCK_FILE)} を消してから`);
    expect(existsSync(join(dir, "session.json"))).toBe(true);
  });

  it("delete は動いている session を消さない（running）", async () => {
    const dir = await mkSession("work");
    await run(dir);
    await expect(deleteSession(base, "work")).rejects.toMatchObject({ code: "running" });
    expect(existsSync(join(dir, "session.json"))).toBe(true);
    expect(existsSync(join(dir, STATE_DIR_LOCK_FILE))).toBe(true);
  });

  it("delete は default・存在しない名前を断り、規則外の名前は ConfigError", async () => {
    await expect(deleteSession(base, "default")).rejects.toMatchObject({ code: "default" });
    await expect(deleteSession(base, "ghost")).rejects.toMatchObject({ code: "not-found" });
    expect(existsSync(join(base, "sessions", "ghost"))).toBe(false);
    await expect(deleteSession(base, "..")).rejects.toThrow(ConfigError);
    await expect(deleteSession(base, "../x")).rejects.toThrow(ConfigError);
    expect(existsSync(base)).toBe(true);
  });

  it.skipIf(process.platform === "win32")(
    "delete はシンボリックリンクを辿らず消さない（リンク先が残る）",
    async () => {
      const target = await makeTempDir("wtm-named-target-");
      try {
        await writeFile(join(target, "precious"), "x");
        await mkdir(join(base, "sessions"), { recursive: true });
        await symlink(target, join(base, "sessions", "link"));
        await expect(deleteSession(base, "link")).rejects.toMatchObject({ code: "not-directory" });
        expect(existsSync(join(target, "precious"))).toBe(true);
        expect(existsSync(join(target, STATE_DIR_LOCK_FILE))).toBe(false);
      } finally {
        await rm(target, { recursive: true, force: true });
      }
    },
  );

  it("findExactEntry：完全一致だけを返し、別の綴りが当たる（lstat が成功する）なら spelling、無ければ not-found", async () => {
    const entries = [{ name: "Work" }, { name: "other" }] as Dirent[];
    const hit = async (): Promise<void> => undefined;
    const miss = async (): Promise<void> => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    expect((await findExactEntry(entries, "Work", miss)).name).toBe("Work");
    await expect(findExactEntry(entries, "work", hit)).rejects.toMatchObject({ code: "spelling" });
    await expect(findExactEntry(entries, "work", miss)).rejects.toMatchObject({
      code: "not-found",
    });
    await expect(findExactEntry(entries, "work", hit)).rejects.toBeInstanceOf(SessionDeleteError);
  });
});

/** 20260926-named-session-ui（AC4・AC5）。 */
describe("listServerSessions（server.sessions の一覧）", () => {
  let base: string;
  const held: StateDirLock[] = [];
  beforeEach(async () => {
    base = await makeTempDir("wtm-named-srv-");
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
  const run = async (dir: string): Promise<void> => {
    const lock = new StateDirLock(dir);
    await lock.acquire();
    held.push(lock);
  };
  const record = (
    port: number,
    over: Partial<{ pid: number; hostname: string; https: boolean; host: string }> = {},
  ) => ({
    pid: process.pid,
    hostname: hostname(),
    port,
    https: false,
    host: "127.0.0.1",
    ...over,
  });

  it("動いていて記録の pid・ホスト名がロックの持ち主と一致する session にだけ開くための情報を付ける", async () => {
    await run(base);
    await writeServeRecord(base, record(7780));
    const work = await mkSession("work");
    await run(work);
    await writeServeRecord(work, record(7781, { https: true, host: "0.0.0.0" }));
    const stale = await mkSession("stale"); // 動いているが記録は前の起動（別の pid）
    await run(stale);
    await writeServeRecord(stale, record(7782, { pid: process.pid + 100000 }));
    const otherHostRec = await mkSession("otherrec"); // 記録のホスト名が違う
    await run(otherHostRec);
    await writeServeRecord(otherHostRec, record(7783, { hostname: "not-this-host-for-test" }));
    const norec = await mkSession("norec"); // 動いているが記録が無い（古い版・token reset の間）
    await run(norec);
    const stopped = await mkSession("stopped"); // 止まっている（記録は残っている）
    await writeServeRecord(stopped, record(7784));

    const list = await listServerSessions(base, "work");
    expect(list).toEqual([
      {
        name: "default",
        default: true,
        running: true,
        current: false,
        endpoint: { port: 7780, https: false, host: "127.0.0.1" },
      },
      { name: "norec", default: false, running: true, current: false },
      { name: "otherrec", default: false, running: true, current: false },
      { name: "stale", default: false, running: true, current: false },
      { name: "stopped", default: false, running: false, current: false },
      {
        name: "work",
        default: false,
        running: true,
        current: true,
        endpoint: { port: 7781, https: true, host: "0.0.0.0" },
      },
    ]);
  });

  it("別のホストのロック（別のコンテナ）の session には、記録があっても付けない", async () => {
    const dir = await mkSession("remote");
    await writeFile(join(dir, STATE_DIR_LOCK_FILE), "7\nsome-other-host-for-test\n");
    // 記録はこのホストのもの（pid も一致）にして、ロックが別のホストであることだけで弾かれることを確かめる
    await writeServeRecord(dir, record(7785, { pid: 7 }));
    const remote = (await listServerSessions(base, undefined)).find((e) => e.name === "remote");
    expect(remote).toEqual({ name: "remote", default: false, running: true, current: false });
  });

  it("current は既定の session なら名前が無いとき、名前付きなら名前が一致するとき", async () => {
    await mkSession("work");
    expect((await listServerSessions(base, undefined)).map((e) => [e.name, e.current])).toEqual([
      ["default", true],
      ["work", false],
    ]);
    expect((await listServerSessions(base, "work")).map((e) => [e.name, e.current])).toEqual([
      ["default", false],
      ["work", true],
    ]);
  });

  it("状態ディレクトリのパス・pid・ホスト名を返さない（項目のキーは決まった集合だけ。AC5）", async () => {
    await run(base);
    await writeServeRecord(base, record(7780));
    const w = await mkSession("w");
    await run(w);
    for (const e of await listServerSessions(base, undefined)) {
      const expected = e.endpoint
        ? ["current", "default", "endpoint", "name", "running"]
        : ["current", "default", "name", "running"];
      expect(Object.keys(e).sort()).toEqual(expected);
      if (e.endpoint) expect(Object.keys(e.endpoint).sort()).toEqual(["host", "https", "port"]);
      expect(JSON.stringify(e)).not.toContain(base);
      expect(JSON.stringify(e)).not.toContain(String(process.pid));
    }
  });
});
