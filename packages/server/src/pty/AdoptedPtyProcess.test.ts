import { closeSync } from "node:fs";
import { ReadStream, WriteStream } from "node:tty";
import { afterEach, describe, expect, it } from "vitest";
import {
  AdoptedPtyProcess,
  exitFromWaitStatus,
  parseProcStatExitStatus,
} from "./AdoptedPtyProcess.js";
import { NodePtyBackend } from "./NodePtyBackend.js";
import { nodePtyNative } from "./nodePtyNative.js";

describe("parseProcStatExitStatus / exitFromWaitStatus", () => {
  const zombie = (comm: string, exitCode: string) =>
    `123 (${comm}) Z 1 123 123 0 -1 4228108 ${Array.from({ length: 42 }, () => "0").join(" ")} ${exitCode}\n`;

  it("ゾンビのときだけ exit_code（52 番目）を返す。comm の空白とカッコに惑わされない", () => {
    const raw = zombie("sh (x) y", "1792");
    expect(
      raw
        .slice(raw.lastIndexOf(")") + 2)
        .trim()
        .split(" ")[49],
    ).toBe("1792"); // 並びの前提
    expect(parseProcStatExitStatus(raw)).toBe(1792);
    expect(parseProcStatExitStatus(raw.replace(") Z ", ") S "))).toBeUndefined();
    expect(parseProcStatExitStatus("garbage")).toBeUndefined();
  });

  it("waitpid の形を exitCode・signal に直す", () => {
    expect(exitFromWaitStatus(7 << 8)).toEqual({ exitCode: 7 });
    expect(exitFromWaitStatus(0)).toEqual({ exitCode: 0 });
    expect(exitFromWaitStatus(9)).toEqual({ exitCode: 0, signal: 9 });
    expect(exitFromWaitStatus(undefined)).toEqual({ exitCode: 0 });
  });
});

/**
 * 同じプロセスの中に PTY の組（master・slave）を作り（node-pty のネイティブの `openpty`）、master を `AdoptedPtyProcess` に渡して、
 * slave の側からシェルの代わりに振る舞う。execve をまたぐ通しは smoke（`handoffSmoke.ts`）で確かめる。
 */
describe.skipIf(process.platform === "win32")("AdoptedPtyProcess（実物の PTY の組）", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const fn of cleanups.splice(0).reverse()) {
      try {
        fn();
      } catch {
        // 既に閉じている。
      }
    }
  });

  function pair(deps: ConstructorParameters<typeof AdoptedPtyProcess>[2] = {}) {
    const { master, slave } = nodePtyNative().open(80, 24);
    const slaveIn = new ReadStream(slave);
    slaveIn.setEncoding("utf8");
    let slaveGot = "";
    slaveIn.on("data", (c: string) => (slaveGot += c));
    slaveIn.on("error", () => undefined);
    const proc = new AdoptedPtyProcess(master, 4242, {
      readExitStatus: () => undefined,
      kill: () => undefined,
      exitPollMs: 0,
      ...deps,
    });
    cleanups.push(() => proc.kill());
    cleanups.push(() => slaveIn.destroy());
    return { proc, master, slave, slaveIn, slaveOut: () => slaveGot };
  }

  async function until(cond: () => boolean, what: string): Promise<void> {
    const deadline = Date.now() + 3000;
    while (!cond()) {
      if (Date.now() > deadline) throw new Error(`timed out: ${what}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  it("slave の出力が onData に届き、write が slave に届く", async () => {
    const { proc, slave, slaveOut } = pair();
    let got = "";
    proc.onData((c) => (got += c));
    new WriteStream(slave).write("from-shell\n");
    await until(() => got.includes("from-shell"), "output");
    proc.write("to-shell\n");
    proc.write(new TextEncoder().encode("bytes\n"));
    await until(() => slaveOut().includes("to-shell") && slaveOut().includes("bytes"), "input");
    expect(proc.handoffFd()).toBeTypeOf("number");
  });

  it("resize は slave の大きさを変える", () => {
    const { proc, slave } = pair();
    proc.resize(100, 30);
    expect(new WriteStream(slave).getWindowSize()).toEqual([100, 30]);
    proc.resize(0, 0); // 下限 1 に丸める
    expect(new WriteStream(slave).getWindowSize()).toEqual([1, 1]);
  });

  it("slave が全部閉じると 1 度だけ onExit（終了の状態は readExitStatus から）", async () => {
    const { proc, slave, slaveIn } = pair({ readExitStatus: () => 7 << 8 });
    const exits: unknown[] = [];
    proc.onExit((e) => exits.push(e));
    slaveIn.destroy();
    try {
      closeSync(slave);
    } catch {
      // destroy が閉じた。
    }
    await until(() => exits.length > 0, "exit");
    await new Promise((r) => setTimeout(r, 50));
    expect(exits).toEqual([{ exitCode: 7 }]);
    expect(proc.handoffFd()).toBeUndefined();
  });

  it("slave が開いたままでも、ゾンビになったら onExit（見に行く間隔ごと）", async () => {
    let status: number | undefined;
    const { proc } = pair({ readExitStatus: () => status, exitPollMs: 10 });
    const exits: unknown[] = [];
    proc.onExit((e) => exits.push(e));
    await new Promise((r) => setTimeout(r, 40));
    expect(exits).toEqual([]);
    status = 15; // SIGTERM で終わった
    await until(() => exits.length > 0, "exit by poll");
    expect(exits).toEqual([{ exitCode: 0, signal: 15 }]);
  });

  it("kill は master を閉じ（slave に hangup）、SIGHUP を送る。その後の write・resize は何もしない", async () => {
    const killed: [number, string][] = [];
    const { proc, slaveIn } = pair({ kill: (pid, sig) => killed.push([pid, sig]) });
    let slaveClosed = false;
    slaveIn.on("close", () => (slaveClosed = true));
    slaveIn.on("end", () => (slaveClosed = true));
    proc.kill();
    expect(killed).toEqual([[4242, "SIGHUP"]]);
    expect(proc.handoffFd()).toBeUndefined();
    expect(() => proc.write("x")).not.toThrow();
    expect(() => proc.resize(10, 10)).not.toThrow();
    await until(() => slaveClosed, "slave hangup");
  });

  it("読み取りが終わった直後に終了の状態がまだ読めなくても、ゾンビになるのを待って終了コードを取る", async () => {
    let status: number | undefined;
    const { proc, slave, slaveIn } = pair({ readExitStatus: () => status, exitSettleMs: 2000 });
    const exits: unknown[] = [];
    proc.onExit((e) => exits.push(e));
    slaveIn.destroy();
    try {
      closeSync(slave);
    } catch {
      // destroy が閉じた。
    }
    await new Promise((r) => setTimeout(r, 100));
    expect(exits).toEqual([]);
    status = 3 << 8;
    await until(() => exits.length > 0, "settled exit");
    expect(exits).toEqual([{ exitCode: 3 }]);
  });

  it("ゾンビで終わった後に kill（読み取りの終わり）が来ても、onExit は 1 度だけ", async () => {
    let status: number | undefined;
    const { proc } = pair({ readExitStatus: () => status, exitPollMs: 10 });
    const exits: unknown[] = [];
    proc.onExit((e) => exits.push(e));
    status = 0;
    await until(() => exits.length > 0, "exit by poll");
    proc.kill();
    await new Promise((r) => setTimeout(r, 100));
    expect(exits).toEqual([{ exitCode: 0 }]);
  });

  it("出力の境目で割れた多バイト文字をそのまま渡す", async () => {
    const { proc, slave } = pair();
    let got = "";
    proc.onData((c) => (got += c));
    const bytes = Buffer.from("あい\n", "utf8");
    const out = new WriteStream(slave);
    out.write(bytes.subarray(0, 2));
    await new Promise((r) => setTimeout(r, 50));
    out.write(bytes.subarray(2));
    await until(() => got.includes("\n"), "multibyte output");
    expect(got).toContain("あい");
    expect(got).not.toContain("\ufffd");
  });

  it("PTY のバッファより大きい書き込みも、欠けずに順に届く（一部だけ書けた・EAGAIN の書き直し）", async () => {
    const { proc, slaveOut } = pair();
    const lines = Array.from(
      { length: 700 },
      (_, i) => `${String(i).padStart(4, "0")}${"x".repeat(94)}`,
    );
    proc.write(`${lines.join("\n")}\n`);
    await until(() => slaveOut().includes(`${lines[699]}`), "big write");
    const received = slaveOut()
      .split("\n")
      .filter((l) => /^\d{4}x+$/.test(l));
    expect(received).toEqual(lines);
  });

  it("pause の間は onData が来ず、resume で届く", async () => {
    const { proc, slave } = pair();
    let got = "";
    proc.onData((c) => (got += c));
    proc.pause();
    new WriteStream(slave).write("held\n");
    await new Promise((r) => setTimeout(r, 80));
    expect(got).toBe("");
    proc.resume();
    await until(() => got.includes("held"), "resumed output");
  });
});

describe.skipIf(process.platform === "win32")("NodePtyBackend の引き継ぎの口", () => {
  it("spawn した PTY の handoffFd は PTY の master、adopt はその fd から作る", async () => {
    const backend = new NodePtyBackend();
    const p = backend.spawn({
      shell: "/bin/sh",
      args: ["-c", "sleep 5"],
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
      cols: 80,
      rows: 24,
    });
    try {
      const fd = p.handoffFd?.();
      expect(fd).toBeTypeOf("number");
      if (process.platform === "linux") {
        const { readlinkSync } = await import("node:fs");
        expect(readlinkSync(`/proc/self/fd/${fd}`)).toMatch(/ptmx$/);
      }
      expect(typeof backend.adopt).toBe("function");
    } finally {
      p.kill();
    }
  });
});
