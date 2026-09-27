import { mkdir, readdir, rm, symlink, writeFile } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../configError.js";
import { MemoryLogger } from "../log/Logger.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { StateDirLock } from "../persist/StateDirLock.js";
import type { CommandIo } from "../sessionCommands.js";
import { handoffSocketPathFor, startHandoffSocket } from "../handoff/HandoffSocket.js";
import {
  SESSION_STOP_EXIT_NOT_RUNNING,
  type SessionStopDeps,
  defaultSessionStopDeps,
  runSessionStop,
} from "./stopCommand.js";

/** `wtm session stop`（20260927-session-stop の T4）。 */
function captureIo(): CommandIo & { outs: string[]; errs: string[] } {
  const outs: string[] = [];
  const errs: string[] = [];
  return { outs, errs, out: (l) => outs.push(l), err: (l) => errs.push(l) };
}

interface Fake {
  deps: SessionStopDeps;
  asked: string[];
  /** inspect が順に返す値（尽きたら最後の値を返し続ける）。 */
  holders: ({ pid: number; otherHost?: string } | undefined)[];
  inspected: number;
}

function fake(
  answer: string | Error,
  holders: ({ pid: number; otherHost?: string } | undefined)[],
  overrides: Partial<SessionStopDeps> = {},
): Fake {
  let t = 0;
  const f: Fake = {
    asked: [],
    holders,
    inspected: 0,
    deps: {
      ...defaultSessionStopDeps(),
      platform: "linux",
      ask: async (path, line) => {
        f.asked.push(`${path} ${line}`);
        if (answer instanceof Error) throw answer;
        return answer;
      },
      inspect: async () => {
        const v = f.holders[Math.min(f.inspected, f.holders.length - 1)];
        f.inspected++;
        return v;
      },
      sleep: async (ms) => {
        t += ms;
      },
      now: () => t,
      ...overrides,
    },
  };
  return f;
}

const errno = (code: string): Error => Object.assign(new Error(code), { code });
const OK = (pid: number, alreadyStopping = false): string =>
  JSON.stringify({ ok: true, pid, alreadyStopping });

describe("runSessionStop", () => {
  let base: string;
  beforeEach(async () => {
    base = await makeTempDir("wtm-stopcmd-");
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });
  const mkSession = async (name: string): Promise<string> => {
    const dir = join(base, "sessions", name);
    await mkdir(dir, { recursive: true });
    return dir;
  };

  it("既定の session: 止める指示を handoff.sock へ送り、持ち主が居なくなったら stopped（0）", async () => {
    const f = fake(OK(42), [{ pid: 42 }, { pid: 42 }, { pid: 42 }, undefined]);
    const io = captureIo();
    expect(await runSessionStop(base, "default", false, io, f.deps)).toBe(0);
    expect(f.asked).toEqual([`${join(base, "handoff.sock")} {"op":"stop"}`]);
    expect(io.outs).toEqual(["wtm: stopped session default"]);
    expect(io.errs).toEqual([]);
  });

  it("名前付き session の --json: {stopped:true, session:{name, default, stateDir, pid}}", async () => {
    const dir = await mkSession("work");
    const f = fake(OK(42), [{ pid: 42 }, undefined]);
    const io = captureIo();
    expect(await runSessionStop(base, "work", true, io, f.deps)).toBe(0);
    expect(f.asked[0]).toBe(`${join(dir, "handoff.sock")} {"op":"stop"}`);
    expect(JSON.parse(io.outs[0]!)).toEqual({
      stopped: true,
      session: { name: "work", default: false, stateDir: dir, pid: 42 },
    });
  });

  it("既に止まる途中（alreadyStopping）でも同じく待って 0", async () => {
    const f = fake(OK(42, true), [{ pid: 42 }, { pid: 42 }, undefined]);
    expect(await runSessionStop(base, "default", false, captureIo(), f.deps)).toBe(0);
  });

  it("持ち主が別の pid に替わった（止まった後に別の起動が取った）ら止まったとみなす", async () => {
    const f = fake(OK(42), [{ pid: 42 }, { pid: 99 }]);
    expect(await runSessionStop(base, "default", false, captureIo(), f.deps)).toBe(0);
  });

  it("動いていなければ何も送らず・何も作らずに 3（テキストと --json）", async () => {
    await mkSession("work");
    const before = await readdir(join(base, "sessions", "work"));
    const f = fake(OK(42), [undefined]);
    const io = captureIo();
    expect(await runSessionStop(base, "work", false, io, f.deps)).toBe(
      SESSION_STOP_EXIT_NOT_RUNNING,
    );
    expect(SESSION_STOP_EXIT_NOT_RUNNING).toBe(3);
    expect(io.errs).toEqual(["wtm: session work is not running"]);
    expect(f.asked).toEqual([]);
    expect(await readdir(join(base, "sessions", "work"))).toEqual(before);
    const j = captureIo();
    expect(await runSessionStop(base, "default", true, j, f.deps)).toBe(3);
    expect(JSON.parse(j.errs[0]!)).toEqual({
      error: { code: "not_running", message: "session default is not running" },
    });
    expect(await readdir(base)).toEqual(["sessions"]); // 既定の session にも何も作らない
  });

  it("無い名前付き session・規則外の名前は何も作らずに 2（テキストは ConfigError・--json は code）", async () => {
    const f = fake(OK(42), [{ pid: 42 }]);
    await expect(runSessionStop(base, "nope", false, captureIo(), f.deps)).rejects.toBeInstanceOf(
      ConfigError,
    );
    const j = captureIo();
    expect(await runSessionStop(base, "nope", true, j, f.deps)).toBe(2);
    expect(JSON.parse(j.errs[0]!).error.code).toBe("no_such_session");
    await expect(runSessionStop(base, "a/b", false, captureIo(), f.deps)).rejects.toBeInstanceOf(
      ConfigError,
    );
    const k = captureIo();
    expect(await runSessionStop(base, "a/b", true, k, f.deps)).toBe(2);
    expect(JSON.parse(k.errs[0]!).error.code).toBe("invalid_name");
    expect(f.asked).toEqual([]);
    expect(f.inspected).toBe(0);
    expect(await readdir(base)).toEqual([]);
  });

  it("綴りの違う名前（大文字小文字を区別しない FS）は 2 で断る", async () => {
    const entry = { name: "Work", isDirectory: () => true } as unknown as Dirent;
    const f = fake(OK(42), [{ pid: 42 }], {
      readSessionsDir: async () => [entry],
      lstat: async () => ({}), // 別の綴りでも当たる
    });
    const j = captureIo();
    expect(await runSessionStop(base, "work", true, j, f.deps)).toBe(2);
    expect(JSON.parse(j.errs[0]!).error.code).toBe("spelling");
    await expect(runSessionStop(base, "work", false, captureIo(), f.deps)).rejects.toBeInstanceOf(
      ConfigError,
    );
    expect(f.asked).toEqual([]);
  });

  it("ディレクトリでないもの（ファイル・シンボリックリンク）は 2（リンクを辿って別の場所を止めない）", async () => {
    await mkdir(join(base, "sessions"), { recursive: true });
    await writeFile(join(base, "sessions", "file"), "");
    const elsewhere = await makeTempDir("wtm-stopcmd-elsewhere-");
    await symlink(elsewhere, join(base, "sessions", "link"));
    try {
      const f = fake(OK(42), [{ pid: 42 }]);
      const j = captureIo();
      expect(await runSessionStop(base, "file", true, j, f.deps)).toBe(2);
      expect(JSON.parse(j.errs[0]!).error.code).toBe("not_directory");
      const k = captureIo();
      expect(await runSessionStop(base, "link", true, k, f.deps)).toBe(2);
      expect(JSON.parse(k.errs[0]!).error.code).toBe("not_directory");
      await expect(runSessionStop(base, "link", false, captureIo(), f.deps)).rejects.toBeInstanceOf(
        ConfigError,
      );
      expect(f.asked).toEqual([]);
      expect(f.inspected).toBe(0);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("Windows は非対応で 2（何も送らない）", async () => {
    const f = fake(OK(42), [{ pid: 42 }], { platform: "win32" });
    await expect(runSessionStop(base, "default", false, captureIo(), f.deps)).rejects.toThrow(
      "not supported on Windows",
    );
    const j = captureIo();
    expect(await runSessionStop(base, "default", true, j, f.deps)).toBe(2);
    expect(JSON.parse(j.errs[0]!).error.code).toBe("unsupported_platform");
    expect(f.asked).toEqual([]);
    expect(f.inspected).toBe(0);
  });

  it("持ち主が別のホストなら何も送らずに 1", async () => {
    const f = fake(OK(42), [{ pid: 42, otherHost: "box2" }]);
    const io = captureIo();
    expect(await runSessionStop(base, "default", false, io, f.deps)).toBe(1);
    expect(io.errs[0]).toContain("another host (box2, pid 42)");
    expect(f.asked).toEqual([]);
  });

  it("socket に繋げない: 持ち主が残っていれば unreachable（1）、居なくなっていれば not running（3）", async () => {
    const a = fake(errno("ECONNREFUSED"), [{ pid: 42 }, { pid: 42 }]);
    const io = captureIo();
    expect(await runSessionStop(base, "default", false, io, a.deps)).toBe(1);
    expect(io.errs[0]).toContain(
      "did not accept a stop request (an older version, still starting, or already stopping)",
    );
    expect(io.errs[0]).toContain("Ctrl+C");
    // 落ちた wtm のロックの pid が再利用された場合の次の手（wtm.lock を消す）も添える
    expect(io.errs[0]).toContain(`If pid 42 is not wtm`);
    expect(io.errs[0]).toContain(join(base, "wtm.lock"));
    const b = fake(errno("ENOENT"), [{ pid: 42 }, undefined]);
    const j = captureIo();
    expect(await runSessionStop(base, "default", true, j, b.deps)).toBe(3);
    expect(JSON.parse(j.errs[0]!).error.code).toBe("not_running");
    // 繋げない間に止まり、別の起動がロックを取った（持ち主の pid が替わった）ときは、動いていないとも止めたとも言わない（1）
    const c = fake(errno("ECONNREFUSED"), [{ pid: 42 }, { pid: 99 }]);
    const k = captureIo();
    expect(await runSessionStop(base, "default", false, k, c.deps)).toBe(1);
    expect(k.errs[0]).toContain("changed while stopping (pid 42 → 99)");
  });

  it("返事が時間内に来なければ no_reply（1。見直しはしない）", async () => {
    const f = fake(errno("ETIMEDOUT"), [{ pid: 42 }, undefined]);
    const j = captureIo();
    expect(await runSessionStop(base, "default", true, j, f.deps)).toBe(1);
    expect(JSON.parse(j.errs[0]!).error.code).toBe("no_reply");
    expect(f.inspected).toBe(1);
  });

  it.each([
    [JSON.stringify({ ok: false, reason: "bad_request", message: "x" }), "older_server"],
    [
      JSON.stringify({ ok: false, reason: "busy", message: "a handoff is in progress" }),
      "refused_busy",
    ],
    [JSON.stringify({ ok: false, reason: "unsupported", message: "no" }), "refused_unsupported"],
    [JSON.stringify({ ok: false, reason: "whatever", message: "no" }), "bad_reply"],
    ["not json", "bad_reply"],
    [JSON.stringify({ ok: true }), "bad_reply"],
  ])("断り・不正な返事 %s は %s（1）で、待たない", async (answer, code) => {
    const f = fake(answer, [{ pid: 42 }, undefined]);
    const j = captureIo();
    expect(await runSessionStop(base, "default", true, j, f.deps)).toBe(1);
    expect(JSON.parse(j.errs[0]!).error.code).toBe(code);
    expect(f.inspected).toBe(1);
  });

  it("引き継ぎの最中の断りは、終わってからもう一度と案内する", async () => {
    const f = fake(
      JSON.stringify({ ok: false, reason: "busy", message: "a handoff is in progress" }),
      [{ pid: 42 }],
    );
    const io = captureIo();
    expect(await runSessionStop(base, "default", false, io, f.deps)).toBe(1);
    expect(io.errs[0]).toContain("try again after the handoff finishes");
  });

  it("返事の pid が wtm.lock の持ち主と違えば止まったと言わない（1）", async () => {
    const f = fake(OK(7), [{ pid: 42 }, undefined]);
    const j = captureIo();
    expect(await runSessionStop(base, "default", true, j, f.deps)).toBe(1);
    expect(JSON.parse(j.errs[0]!).error.code).toBe("pid_mismatch");
  });

  it("上限時間の内に持ち主が居なくならなければ timeout（1。server.log を案内）", async () => {
    const f = fake(OK(42), [{ pid: 42 }], { waitTimeoutMs: 2_000 });
    const io = captureIo();
    expect(await runSessionStop(base, "default", false, io, f.deps)).toBe(1);
    expect(io.errs[0]).toContain("has not exited within 2s; check server.log in");
    expect(f.inspected).toBeGreaterThan(5);
  });
});

describe.skipIf(process.platform === "win32")("runSessionStop（実物の socket とロック）", () => {
  it("実物の handoff.sock と wtm.lock: 止める指示を受けた側がロックを放すと 0", async () => {
    const base = await makeTempDir("wtm-stopcmd-real-");
    const lock = new StateDirLock(base);
    await lock.acquire();
    const sock = await startHandoffSocket(
      handoffSocketPathFor(base),
      {
        request: async () => undefined,
        status: () => ({ lastHandoff: null }),
        stop: async (reply) => {
          await reply({ ok: true, pid: process.pid, alreadyStopping: false });
          setTimeout(() => void lock.release(), 300);
        },
      },
      new MemoryLogger(),
    );
    try {
      const io = captureIo();
      expect(await runSessionStop(base, "default", false, io)).toBe(0);
      expect(io.outs).toEqual(["wtm: stopped session default"]);
    } finally {
      await sock.close();
      await lock.release();
      await rm(base, { recursive: true, force: true });
    }
  });
});
