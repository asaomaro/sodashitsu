import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../config.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { PREFLIGHT_COMMAND_NAME, applySessionEnv, parseArgs } from "../cliArgs.js";
import { PREFLIGHT_COMMAND } from "./preflight.js";
import { HANDOFF_EXIT_NOT_RUNNING, type HandoffCommandDeps, runHandoff } from "./handoffCommand.js";

describe("wtm handoff の引数（cliArgs）", () => {
  it("--state-dir・--session を受け、WTM_SESSION に従う", () => {
    expect(parseArgs(["handoff"])).toMatchObject({ command: "handoff" });
    expect(parseArgs(["handoff", "--state-dir", "/s", "--session", "work"])).toMatchObject({
      command: "handoff",
      stateDir: "/s",
      session: "work",
      sessionSource: "flag",
    });
    expect(applySessionEnv(parseArgs(["handoff"]), { WTM_SESSION: "env-s" })).toMatchObject({
      session: "env-s",
      sessionSource: "env",
    });
    expect(
      applySessionEnv(parseArgs(["handoff", "--session", "flag-s"]), { WTM_SESSION: "env-s" }),
    ).toMatchObject({ session: "flag-s" });
  });

  it.each([[["handoff", "--port", "1"]], [["handoff", "now"]], [["handoff", "--json"]]])(
    "%j は指定の誤り",
    (argv) => {
      expect(() => parseArgs(argv)).toThrow(ConfigError);
    },
  );

  it("隠しコマンド __handoff-preflight（1 段目・2 段目）。名前は preflight.ts と同じ", () => {
    expect(PREFLIGHT_COMMAND_NAME).toBe(PREFLIGHT_COMMAND);
    expect(parseArgs([PREFLIGHT_COMMAND])).toMatchObject({
      command: "handoff-preflight",
      preflightStage: 1,
    });
    expect(parseArgs([PREFLIGHT_COMMAND, "--stage", "2", "--probe", "20:1:2:3"])).toMatchObject({
      command: "handoff-preflight",
      preflightStage: 2,
      preflightProbe: "20:1:2:3",
    });
    expect(() => parseArgs([PREFLIGHT_COMMAND, "--stage", "3", "--probe", "x"])).toThrow(
      ConfigError,
    );
  });
});

describe("runHandoff", () => {
  let dir: string;
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  function io() {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
  }

  function deps(
    answers: (string | Error)[],
    overrides: Partial<HandoffCommandDeps> = {},
  ): HandoffCommandDeps & { asked: string[] } {
    let t = 0;
    const asked: string[] = [];
    return {
      asked,
      platform: "linux",
      ask: async (path, line) => {
        asked.push(`${path} ${line}`);
        const a = answers.shift();
        if (a === undefined) throw Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
        if (a instanceof Error) throw a;
        return a;
      },
      inspect: async () => ({ pid: 4242 }),
      sleep: async (ms) => void (t += ms),
      now: () => t,
      ...overrides,
    };
  }

  const refused = () => Object.assign(new Error("refused"), { code: "ECONNREFUSED" });

  it("受け付けられたら、入れ替わった新しいサーバが同じ id の結果を答えるまで待って 0（繋がらない間・前の結果は待つ）", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([
      JSON.stringify({ ok: true, id: "abcd", panes: 2 }),
      refused(),
      JSON.stringify({ lastHandoff: { id: "old", adopted: 1, dropped: 0, at: "t" } }),
      JSON.stringify({ lastHandoff: { id: "abcd", adopted: 2, dropped: 0, at: "t" } }),
    ]);
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, d)).toBe(0);
    expect(d.asked[0]).toBe(`${join(dir, "handoff.sock")} {"op":"handoff"}`);
    expect(d.asked.slice(1).every((a) => a.endsWith('{"op":"status"}'))).toBe(true);
    expect(o.out.join("\n")).toContain("handoff complete: 2 pane(s) kept running");
  });

  it("一部の pane を引き継げなかったら 1", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([
      JSON.stringify({ ok: true, id: "abcd", panes: 2 }),
      JSON.stringify({ lastHandoff: { id: "abcd", adopted: 1, dropped: 1, at: "t" } }),
    ]);
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, d)).toBe(1);
    expect(o.err.join("\n")).toContain("1 pane(s) could not be kept");
  });

  it("新しいサーバが時間内に答えなければ 1", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([JSON.stringify({ ok: true, id: "abcd", panes: 1 })], {
      completeTimeoutMs: 1000,
    });
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, d)).toBe(1);
    expect(o.err.join("\n")).toContain("did not report the handoff");
  });

  it("サーバが動いていなければ 3（何も送らない。AC12）", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([], { inspect: async () => undefined });
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, d)).toBe(HANDOFF_EXIT_NOT_RUNNING);
    expect(d.asked).toEqual([]);
    expect(o.err.join("\n")).toContain("no wtm serve is running");
  });

  it("別のホストで動いていれば 1", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([], { inspect: async () => ({ pid: 1, otherHost: "box" }) });
    expect(await runHandoff(dir, undefined, io().io, undefined, d)).toBe(1);
    expect(d.asked).toEqual([]);
  });

  it("拒否（preflight の失敗等）は理由を表示して 1（AC4）", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([
      JSON.stringify({
        ok: false,
        reason: "preflight_failed",
        message: "the handoff format differs",
      }),
    ]);
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, d)).toBe(1);
    expect(o.err.join("\n")).toMatch(/preflight_failed.*format differs/);
    expect(o.err.join("\n")).toContain("keeps running");
    expect(d.asked).toHaveLength(1);
  });

  it("受け付けた後に入れ替われなかった（status に error）なら、待たずに 1", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([
      JSON.stringify({ ok: true, id: "abcd", panes: 1 }),
      JSON.stringify({
        lastHandoff: { id: "abcd", adopted: 0, dropped: 1, at: "t", error: "ENOEXEC" },
      }),
    ]);
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, d)).toBe(1);
    expect(o.err.join("\n")).toContain("failed after it was accepted: ENOEXEC");
  });

  it("受け口に誰もいない（起動の途中）なら 1", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, deps([refused()]))).toBe(1);
    expect(o.err.join("\n")).toContain("does not accept a handoff");
  });

  it("WTM_SESSION から選んだ session が無ければ、その旨を案内に添える", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    await expect(runHandoff(dir, "nosuch", io().io, "env", deps([]))).rejects.toMatchObject({
      hint: expect.stringContaining("WTM_SESSION"),
    });
  });

  it("受け口が無い（古い版）なら 1", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    const d = deps([Object.assign(new Error("nope"), { code: "ENOENT" })]);
    const o = io();
    expect(await runHandoff(dir, undefined, o.io, undefined, d)).toBe(1);
    expect(o.err.join("\n")).toContain("does not accept a handoff");
  });

  it("サーバが unsupported を答えたら・Windows では ConfigError（終了コード 2）", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    await expect(
      runHandoff(
        dir,
        undefined,
        io().io,
        undefined,
        deps([JSON.stringify({ ok: false, reason: "unsupported", message: "m" })]),
      ),
    ).rejects.toThrow(ConfigError);
    const d = deps([], { platform: "win32" });
    await expect(runHandoff(dir, undefined, io().io, undefined, d)).rejects.toThrow(ConfigError);
    expect(d.asked).toEqual([]);
  });

  it("名前付き session はその状態ディレクトリの socket に送る。無い session は ConfigError（AC10）", async () => {
    dir = await makeTempDir("wtm-handoff-cmd-");
    await mkdir(join(dir, "sessions", "work"), { recursive: true });
    const d = deps([JSON.stringify({ ok: false, reason: "busy", message: "m" })]);
    expect(await runHandoff(dir, "work", io().io, "flag", d)).toBe(1);
    expect(d.asked[0]).toBe(`${join(dir, "sessions", "work", "handoff.sock")} {"op":"handoff"}`);
    await expect(runHandoff(dir, "nosuch", io().io, "flag", deps([]))).rejects.toThrow(
      /no such session/,
    );
  });
});

describe.skipIf(process.platform === "win32")("askSocket（実物の handoff.sock）", () => {
  it("1 行を送って 1 行の答えを読む・誰もいなければ ECONNREFUSED/ENOENT", async () => {
    const { askSocket } = await import("./handoffCommand.js");
    const { startHandoffSocket, handoffSocketPathFor } = await import("./HandoffSocket.js");
    const { MemoryLogger } = await import("../log/Logger.js");
    const d = await makeTempDir("wtm-handoff-ask-");
    try {
      const path = handoffSocketPathFor(d);
      await expect(askSocket(path, '{"op":"status"}', 1000)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const sock = await startHandoffSocket(
        path,
        { request: async () => undefined, status: () => ({ lastHandoff: null }) },
        new MemoryLogger(),
      );
      try {
        expect(JSON.parse(await askSocket(path, '{"op":"status"}', 1000))).toEqual({
          lastHandoff: null,
        });
      } finally {
        await sock.close();
      }
    } finally {
      await rm(d, { recursive: true, force: true });
    }
  });
});
