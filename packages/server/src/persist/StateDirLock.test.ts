import { existsSync } from "node:fs";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import { makeTempDir } from "./atomicFile.js";
import { STATE_DIR_LOCK_FILE, StateDirInUseError, StateDirLock, isPidAlive } from "./StateDirLock.js";

describe("StateDirLock（状態ディレクトリの排他。D103）", () => {
  let dir: string;
  let lockPath: string;
  const locks: StateDirLock[] = [];
  beforeEach(async () => {
    dir = await makeTempDir("soda-lock-");
    lockPath = join(dir, STATE_DIR_LOCK_FILE);
  });
  afterEach(async () => {
    for (const l of locks.splice(0)) await l.release();
    vi.restoreAllMocks();
    await chmod(dir, 0o700).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  });
  /** 既定ではホスト名を "host-a" にそろえる（別のホスト・コンテナは明示して模す）。 */
  const make = (opts: ConstructorParameters<typeof StateDirLock>[1] = {}, stateDir = dir): StateDirLock => {
    const l = new StateDirLock(stateDir, { rereadDelayMs: 5, hostname: "host-a", ...opts });
    locks.push(l);
    return l;
  };
  const lines = async (path = lockPath): Promise<string[]> => (await readFile(path, "utf8")).trim().split("\n");

  it("自分の pid とホスト名を書いた soda.lock を作り、release で消す（無い状態ディレクトリも作る）", async () => {
    const nested = join(dir, "a", "b");
    const lock = make({ pid: 4242 }, nested);
    await lock.acquire();
    expect(lock.isHeld).toBe(true);
    expect(await lines(join(nested, STATE_DIR_LOCK_FILE))).toEqual(["4242", "host-a"]);
    await lock.release();
    expect(existsSync(join(nested, STATE_DIR_LOCK_FILE))).toBe(false);
  });

  it("既定のホスト名は os.hostname()", async () => {
    const lock = new StateDirLock(dir, { pid: 4242 });
    locks.push(lock);
    await lock.acquire();
    expect(await lines()).toEqual(["4242", hostname()]);
  });

  it("生きている別のプロセスが持っていれば StateDirInUseError（pid とロックのパス付き）で断り、ロックに触れない", async () => {
    const alive = new Set([111]);
    await make({ pid: 111, isAlive: (p) => alive.has(p) }).acquire();
    const second = make({ pid: 222, isAlive: (p) => alive.has(p) });
    const err = await second.acquire().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StateDirInUseError);
    expect(err).toMatchObject({ pid: 111, lockPath: second.path, otherHost: undefined });
    expect(second.isHeld).toBe(false);
    expect(await lines()).toEqual(["111", "host-a"]);
    await second.release(); // 持っていないので何もしない（持ち主のロックを消さない）
    expect(await lines()).toEqual(["111", "host-a"]);
  });

  it("持ち主が生きていなければ（落ちたプロセスの残り）取り直す", async () => {
    await writeFile(lockPath, "111\nhost-a\n");
    const lock = make({ pid: 222, isAlive: () => false });
    await lock.acquire();
    expect(await lines()).toEqual(["222", "host-a"]);
  });

  it("中身が pid でない（pid を書く前に落ちた）ロックは、読み直しても読めなければ取り直す", async () => {
    await writeFile(lockPath, "");
    const lock = make({ pid: 222, isAlive: () => true });
    await lock.acquire();
    expect(await lines()).toEqual(["222", "host-a"]);
  });

  it("同じプロセスの別の実体が持っていれば断る（自分の pid でも使用中）", async () => {
    await make().acquire();
    await expect(make().acquire()).rejects.toMatchObject({ pid: process.pid });
  });

  it("同じホストで自分と同じ pid でも、このプロセスが持っていないロックは前のプロセスの残りとして取り直す（同じコンテナの再起動で毎回 pid 1 等）", async () => {
    await writeFile(lockPath, `${process.pid}\nhost-a\n`);
    const lock = make({ isAlive: () => true });
    await lock.acquire();
    expect(lock.isHeld).toBe(true);
  });

  it("ホスト名が違えば（別のコンテナ・別のマシン）pid の生死を確かめられないので、同じ pid でも死んで見えても使用中とみなす（独立点検 #2）", async () => {
    // ボリュームを共有する 2 つのコンテナ：どちらも pid 1。こちらの pid 名前空間では相手の pid を確かめられない。
    await make({ pid: 1, hostname: "container-a", isAlive: () => false }).acquire();
    const other = make({ pid: 1, hostname: "container-b", isAlive: () => false });
    const err = await other.acquire().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StateDirInUseError);
    expect(err).toMatchObject({ pid: 1, otherHost: "container-a" });
    // 別の pid でも、こちらで死んで見えても同じ（相手の名前空間では生きているかもしれない）。
    const third = make({ pid: 57, hostname: "container-b", isAlive: () => false });
    await expect(third.acquire()).rejects.toMatchObject({ otherHost: "container-a" });
    expect(await lines()).toEqual(["1", "container-a"]);
  });

  it("pid だけの古い形のロックは同じホストのものとして扱う（後方互換）", async () => {
    await writeFile(lockPath, "111\n");
    await expect(make({ pid: 222, isAlive: (p) => p === 111 }).acquire()).rejects.toMatchObject({ pid: 111, otherHost: undefined });
    const lock = make({ pid: 222, isAlive: () => false }); // 生きていなければ取り直す
    await lock.acquire();
    expect(await lines()).toEqual(["222", "host-a"]);
    await lock.release();
    await writeFile(lockPath, `${process.pid}\n`); // 自分と同じ pid でこのプロセスが持っていない → 前のプロセスの残り
    const mine = make({ isAlive: () => true });
    await mine.acquire();
    expect(mine.isHeld).toBe(true);
  });

  it("release は、別の起動が取り直した後のロック（自分の pid・ホスト名でない）を消さない", async () => {
    const lock = make({ pid: 111 });
    await lock.acquire();
    await writeFile(lockPath, "333\nhost-a\n"); // 古いと見なした別の起動が取り直した
    await lock.release();
    expect(await lines()).toEqual(["333", "host-a"]);
    await rm(lockPath);
    const again = make({ pid: 111 });
    await again.acquire();
    await writeFile(lockPath, "111\ncontainer-b\n"); // 同じ pid でも別のホストのもの
    await again.release();
    expect(await lines()).toEqual(["111", "container-b"]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "release は消せなくても投げず、warn を書くだけ（Windows の EPERM/EBUSY 等。投げると listen() の元の失敗を隠す。独立点検 #3）",
    async () => {
      const logger = new MemoryLogger();
      const lock = make({ pid: 111, logger });
      await lock.acquire();
      await chmod(dir, 0o500); // ディレクトリに書けない → unlink が EACCES
      await expect(lock.release()).resolves.toBeUndefined();
      expect(lock.isHeld).toBe(false);
      const warn = logger.lines.find((l) => l.level === "warn");
      expect(warn?.msg).toContain("state dir lock release failed");
      expect(String(warn?.fields?.["error"])).toContain("EACCES");
      await chmod(dir, 0o700);
      expect(await lines()).toEqual(["111", "host-a"]); // 残ったロックは次の起動が pid を見て取り直す
    },
  );

  it("isPidAlive：自分は生きている・EPERM（他のユーザーのプロセス）は生きている・ESRCH は生きていない", () => {
    expect(isPidAlive(process.pid)).toBe(true);
    const kill = vi.spyOn(process, "kill");
    kill.mockImplementation(() => {
      throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    });
    expect(isPidAlive(1)).toBe(true);
    kill.mockImplementation(() => {
      throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    });
    expect(isPidAlive(999_999)).toBe(false);
  });

  describe("inspect（読み取り専用の使用中の判定。20260926-named-session）", () => {
    it("ロックが無ければ undefined で、ファイルもディレクトリも作らない", async () => {
      const nested = join(dir, "none");
      expect(await make({}, nested).inspect()).toBeUndefined();
      expect(existsSync(nested)).toBe(false);
    });

    it("生きている持ち主なら pid を返し、ロックを消さない", async () => {
      await writeFile(lockPath, "4242\nhost-a\n");
      expect(await make({ isAlive: (pid) => pid === 4242 }).inspect()).toEqual({ pid: 4242 });
      expect(await lines()).toEqual(["4242", "host-a"]);
    });

    it("持ち主が生きていなければ undefined（落ちたプロセスの残り）で、ロックを消さない", async () => {
      await writeFile(lockPath, "4242\nhost-a\n");
      expect(await make({ isAlive: () => false }).inspect()).toBeUndefined();
      expect(existsSync(lockPath)).toBe(true);
    });

    it("別のホストの持ち主は使用中とみなし、そのホスト名を返す", async () => {
      await writeFile(lockPath, "7\nhost-b\n");
      expect(await make({ isAlive: () => false }).inspect()).toEqual({ pid: 7, otherHost: "host-b" });
    });

    it("自分と同じ pid：このプロセスで持っていれば使用中、持っていなければ前に同じ pid で動いたプロセスの残り", async () => {
      const held = make({ pid: 4242 });
      await held.acquire();
      expect(await make({ pid: 4242, isAlive: () => false }).inspect()).toEqual({ pid: 4242 });
      await held.release();
      await writeFile(lockPath, "4242\nhost-a\n");
      expect(await make({ pid: 4242, isAlive: () => true }).inspect()).toBeUndefined();
    });

    it("中身が pid でなければ undefined", async () => {
      await writeFile(lockPath, "garbage\n");
      expect(await make({ isAlive: () => true }).inspect()).toBeUndefined();
    });
  });
});
