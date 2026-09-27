import { EventEmitter } from "node:events";
import { closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import * as nodePty from "node-pty";
import { describe, expect, it } from "vitest";
import { HANDOFF_FORMAT_VERSION, HANDOFF_NONCE_ENV } from "./HandoffManifest.js";
import {
  PREFLIGHT_COMMAND,
  checkProbe,
  judgePreflight,
  runPreflight,
  runPreflightStage,
} from "./preflight.js";

describe("judgePreflight", () => {
  const ok = JSON.stringify({ ok: true, format: HANDOFF_FORMAT_VERSION });
  it("0 で終わり、形式が同じ ok なら通る", () => {
    expect(judgePreflight(0, null, `noise\n${ok}\n`, "")).toEqual({ ok: true });
  });
  it.each([
    [
      "0 以外で終わる（古い版は unknown command で 2）",
      2,
      "",
      "wtm: unknown command: __handoff-preflight",
      /cannot be loaded or does not support live handoff \(exit code 2\): wtm: unknown command/,
    ],
    ["シグナルで終わる", null, "", "", /signal SIGSEGV/],
    ["答えが無い", 0, "", "", /did not answer/],
    ["答えが JSON でない", 0, "hello\n", "", /did not answer/],
    [
      "ok: false",
      0,
      JSON.stringify({ ok: false, format: HANDOFF_FORMAT_VERSION, message: "fd lost" }),
      "",
      /^fd lost$/,
    ],
    [
      "形式の版が違う",
      0,
      JSON.stringify({ ok: true, format: HANDOFF_FORMAT_VERSION + 1 }),
      "",
      new RegExp(
        `format differs \\(new version ${HANDOFF_FORMAT_VERSION + 1}, this server ${HANDOFF_FORMAT_VERSION}\\)`,
      ),
    ],
  ])("%s なら通らない", (_why, code, out, err, message) => {
    const r = judgePreflight(
      code as number | null,
      code === null ? "SIGSEGV" : null,
      out as string,
      err as string,
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(message as RegExp);
  });
});

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed: string[] = [];
  kill(sig: string): boolean {
    this.killed.push(sig);
    return true;
  }
}

describe("runPreflight", () => {
  it("同じ Node・Node の引数・入口で __handoff-preflight を起動し、環境から引き継ぎの nonce を外す", async () => {
    const child = new FakeChild();
    let seen: { command: string; args: readonly string[]; env: NodeJS.ProcessEnv } | undefined;
    process.env[HANDOFF_NONCE_ENV] = "leak";
    try {
      const p = runPreflight({
        execPath: "/usr/bin/node",
        execArgv: ["--enable-source-maps"],
        entry: "/opt/wtm/dist/main.js",
        spawn: (command, args, env) => {
          seen = { command, args, env };
          return child as unknown as ChildProcess;
        },
      });
      child.stdout.end(`${JSON.stringify({ ok: true, format: HANDOFF_FORMAT_VERSION })}\n`);
      child.stderr.end();
      setImmediate(() => child.emit("close", 0, null));
      expect(await p).toEqual({ ok: true });
    } finally {
      delete process.env[HANDOFF_NONCE_ENV];
    }
    expect(seen?.command).toBe("/usr/bin/node");
    expect(seen?.args).toEqual([
      "--enable-source-maps",
      "/opt/wtm/dist/main.js",
      PREFLIGHT_COMMAND,
    ]);
    expect(seen?.env[HANDOFF_NONCE_ENV]).toBeUndefined();
  });

  it("時間内に終わらなければ子を止めて通さない", async () => {
    const child = new FakeChild();
    const r = await runPreflight({
      entry: "/x/main.js",
      timeoutMs: 20,
      spawn: () => child as unknown as ChildProcess,
    });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("20ms") });
    expect(child.killed).toEqual(["SIGKILL"]);
  });

  it("起動できなければ通さない", async () => {
    const r = await runPreflight({
      entry: "/x/main.js",
      spawn: () => {
        throw new Error("ENOENT");
      },
    });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("ENOENT") });
  });
});

describe("runPreflightStage", () => {
  it("execve の無い Node・Windows では ok: false を答える", () => {
    for (const deps of [
      { platform: "linux" as const, execve: undefined },
      { platform: "win32" as const, execve: () => undefined },
    ]) {
      const lines: string[] = [];
      runPreflightStage({ stage: 1 }, { ...deps, write: (l) => lines.push(l) });
      expect(JSON.parse(lines[0]!)).toMatchObject({
        ok: false,
        format: HANDOFF_FORMAT_VERSION,
        message: expect.stringContaining("execve"),
      });
    }
  });

  it("2 段目は壊れた probe に ok: false", () => {
    const lines: string[] = [];
    runPreflightStage(
      { stage: 2, probe: "x" },
      { platform: "linux", execve: undefined, write: (l) => lines.push(l) },
    );
    expect(JSON.parse(lines[0]!)).toMatchObject({ ok: false, message: "malformed probe" });
  });
});

describe.skipIf(process.platform === "win32")("checkProbe（実物の PTY）", () => {
  it("同じ master（dev:ino）なら true でシェルを終わらせ、違えば false", async () => {
    const pty = nodePty.spawn("/bin/sh", ["-c", "sleep 30"], { cols: 80, rows: 24 });
    const fd = (pty as unknown as { fd: number }).fd;
    const st = fstatSync(fd);
    const exited = new Promise<void>((r) => pty.onExit(() => r()));
    const closed: number[] = [];
    expect(
      checkProbe(`${fd}:${st.dev}:${Number(st.ino) + 1}:${999999999}`, process.platform, (f) =>
        closed.push(f),
      )[0],
    ).toBe(false);
    expect(
      checkProbe(`${fd}:${Number(st.dev) + 1}:${st.ino}:${999999999}`, process.platform, (f) =>
        closed.push(f),
      )[0],
    ).toBe(false);
    expect(closed).toEqual([]);
    expect(
      checkProbe(`${fd}:${st.dev}:${st.ino}:${pty.pid}`, process.platform, (f) => closed.push(f)),
    ).toEqual([true]);
    expect(closed).toEqual([fd]); // 閉じる関数は差し替え（node-pty の stream が持つ fd を実際には閉じない）
    await exited;
  });
});

describe.skipIf(process.platform === "win32")(
  "runPreflightStage の 1 段目（実物の PTY・execve は記録だけ）",
  () => {
    it("PTY の fd:dev:ino:pid を probe にして、同じ入口の --stage 2 へ execve する", () => {
      let seen: { file: string; args: string[] } | undefined;
      runPreflightStage(
        { stage: 1 },
        {
          platform: process.platform,
          write: () => undefined,
          execve: (file, args) => {
            seen = { file, args };
          },
        },
      );
      expect(seen?.file).toBe(process.execPath);
      const args = seen!.args;
      expect(args[0]).toBe(process.execPath);
      const i = args.indexOf(PREFLIGHT_COMMAND);
      expect(args.slice(i, i + 4)).toEqual([PREFLIGHT_COMMAND, "--stage", "2", "--probe"]);
      expect(args[i + 4]).toMatch(/^\d+:\d+:\d+:\d+$/);
      expect(args[i - 1]).toBe(process.argv[1] ?? "");
      const [fd, dev, ino, pid] = args[i + 4]!.split(":").map(Number) as [
        number,
        number,
        number,
        number,
      ];
      const st = fstatSync(fd);
      expect([Number(st.dev), Number(st.ino)]).toEqual([dev, ino]);
      // 実物の 2 段目と同じ判定で通る（記録しただけなので fd はこのプロセスに開いたまま）。シェルは checkProbe が終わらせる
      expect(checkProbe(`${fd}:${dev}:${ino}:${pid}`, process.platform, () => undefined)).toEqual([
        true,
      ]);
    });

    it("execve が投げたら、使い捨てのシェルを終わらせて ok: false を答える", async () => {
      const lines: string[] = [];
      let pid = 0;
      runPreflightStage(
        { stage: 1 },
        {
          platform: process.platform,
          write: (l) => lines.push(l),
          execve: (_file, args) => {
            pid = Number(args[args.length - 1]!.split(":")[3]);
            throw new Error("EPERM");
          },
        },
      );
      expect(JSON.parse(lines[0]!)).toMatchObject({
        ok: false,
        message: expect.stringContaining("EPERM"),
      });
      const deadline = Date.now() + 3000;
      let alive = true;
      while (alive && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
        try {
          alive = !/\) [ZX] /.test(readFileSync(`/proc/${pid}/stat`, "utf8"));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    });
  },
);

describe.skipIf(process.platform !== "linux")("checkProbe（PTY でない fd）", () => {
  it("同じ dev:ino でも PTY の master でなければ false", () => {
    const fd = openSync("/dev/null", "r");
    try {
      const st = fstatSync(fd);
      expect(checkProbe(`${fd}:${st.dev}:${st.ino}:999999999`, "linux", () => undefined)[0]).toBe(
        false,
      );
    } finally {
      closeSync(fd);
    }
  });
});
