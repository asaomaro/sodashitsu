import { createServer, type Server, Socket } from "node:net";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../configError.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { bridgeSocketPathFor } from "./BridgeEndpoint.js";
import { BRIDGE_EXIT_NOT_RUNNING, runBridge } from "./bridgeCommand.js";
import { parseArgs } from "../cliArgs.js";

/** `wtm bridge`（20260927-multi-host-machines の T4）。本物の Unix socket へ素通しで繋ぐ。 */
describe.skipIf(process.platform === "win32")("wtm bridge（T4）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  function io() {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const out: Buffer[] = [];
    stdout.on("data", (b: Buffer) => out.push(b));
    const errs: string[] = [];
    return { stdin, stdout, out, errs, io: { stdin, stdout, err: (l: string) => errs.push(l) } };
  }

  it("名前付き session の bridge.sock に繋ぎ、両向きを素通しする。相手が閉じたら 0", async () => {
    const root = await makeTempDir("wtm-bridge-cmd-");
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const dir = join(root, "sessions", "agents");
    await mkdir(dir, { recursive: true });
    const received: Buffer[] = [];
    const server: Server = createServer((sock) => {
      sock.write("hello-from-server");
      sock.on("data", (b) => {
        received.push(b);
        if (Buffer.concat(received).toString() === "ping") sock.end();
      });
    });
    await new Promise<void>((r) => server.listen(bridgeSocketPathFor(dir), r));
    cleanups.push(() => new Promise<void>((r) => server.close(() => r())));
    const t = io();
    const done = runBridge({ stateDir: root, session: "agents" }, t.io);
    t.stdin.write("ping");
    expect(await done).toBe(0);
    expect(Buffer.concat(t.out).toString()).toBe("hello-from-server");
    expect(Buffer.concat(received).toString()).toBe("ping");
  });

  it("標準入力の EOF で socket を end し、相手が閉じて 0。標準出力の失敗（ssh の側が先に閉じた）も落ちずに 0", async () => {
    const root = await makeTempDir("wtm-bridge-cmd-");
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const received: Buffer[] = [];
    const server: Server = createServer((sock) => {
      sock.on("data", (b) => received.push(b));
      sock.on("end", () => sock.end()); // 手元が end したら閉じる
    });
    await new Promise<void>((r) => server.listen(bridgeSocketPathFor(root), r));
    cleanups.push(() => new Promise<void>((r) => server.close(() => r())));
    const t = io();
    const done = runBridge({ stateDir: root, session: undefined }, t.io);
    await new Promise((r) => setTimeout(r, 50));
    t.stdin.end("bye");
    expect(await done).toBe(0);
    expect(Buffer.concat(received).toString()).toBe("bye");

    const server2: Server = createServer((sock) => sock.write("x"));
    const dir2 = await makeTempDir("wtm-bridge-cmd-");
    cleanups.push(() => rm(dir2, { recursive: true, force: true }));
    await new Promise<void>((r) => server2.listen(bridgeSocketPathFor(dir2), r));
    cleanups.push(() => new Promise<void>((r) => server2.close(() => r())));
    const u = io();
    u.stdout.write = (() => {
      setImmediate(() =>
        u.stdout.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })),
      );
      return false;
    }) as typeof u.stdout.write;
    expect(await runBridge({ stateDir: dir2, session: undefined }, u.io)).toBe(0);
  });

  it("受け口が無ければ（動いていない）何も作らずに 3。Windows は 2。その他の失敗は 1", async () => {
    const root = await makeTempDir("wtm-bridge-cmd-");
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const t = io();
    expect(await runBridge({ stateDir: root, session: undefined }, t.io)).toBe(
      BRIDGE_EXIT_NOT_RUNNING,
    );
    expect(t.errs[0]).toMatch(/no running wtm serve for session default/);
    const w = io();
    expect(
      await runBridge({ stateDir: root, session: undefined }, w.io, {
        platform: "win32",
        connect: () => new Socket(),
      }),
    ).toBe(2);
    const e = io();
    const failing = (): Socket => {
      const s = new Socket();
      setImmediate(() =>
        s.emit("error", Object.assign(new Error("permission denied"), { code: "EACCES" })),
      );
      return s;
    };
    expect(
      await runBridge({ stateDir: root, session: undefined }, e.io, {
        platform: "linux",
        connect: failing,
      }),
    ).toBe(1);
    expect(e.errs[0]).toMatch(/cannot connect/);
  });

  it("session の名前が規則外なら ConfigError（終了コード 2）", async () => {
    const t = io();
    await expect(runBridge({ stateDir: "/nonexistent", session: "../x" }, t.io)).rejects.toThrow(
      ConfigError,
    );
  });

  it("引数: --session と --state-dir だけ。WTM_SESSION の対象外", () => {
    expect(parseArgs(["bridge"])).toMatchObject({
      command: "bridge",
      session: undefined,
      stateDir: undefined,
    });
    expect(parseArgs(["bridge", "--session", "a", "--state-dir", "/d"])).toMatchObject({
      command: "bridge",
      session: "a",
      stateDir: "/d",
    });
    expect(() => parseArgs(["bridge", "--host", "x"])).toThrow(/unknown option/);
    expect(() => parseArgs(["bridge", "extra"])).toThrow(/unexpected argument/);
    expect(() => parseArgs(["bridge", "--session"])).toThrow(/missing value/);
  });
});

describe("wtm bridge は WTM_SESSION を読まない（T4・decisions D5）", () => {
  it("applySessionEnv は bridge を変えない", async () => {
    const { applySessionEnv } = await import("../cliArgs.js");
    const parsed = parseArgs(["bridge"]);
    expect(applySessionEnv(parsed, { WTM_SESSION: "other" })).toEqual(parsed);
  });
});
