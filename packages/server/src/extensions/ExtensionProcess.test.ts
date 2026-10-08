import { describe, expect, it } from "vitest";
import type { ExtLine, ExtRequest } from "@sodashitsu/protocol";
import { MemoryLogger } from "../log/Logger.js";
import { flush, ManualClock } from "../machine/testing.js";
import { DebtBucket, ExtensionProcess, type RunFile } from "./ExtensionProcess.js";
import { FakeExtChild, FakeGroups } from "./testing.js";

const PID = 1000;
const SECRET_COMMAND = "node /secret/path/ext.mjs --token=CMD-SECRET";

async function spin(n = 8): Promise<void> {
  for (let i = 0; i < n; i++) await flush();
}
/** 時計を 50 ミリ秒ずつ進め、そのたびに microtask を流す。 */
async function advance(clock: ManualClock, ms: number, step = 50): Promise<void> {
  for (let t = 0; t < ms; t += step) {
    clock.advance(Math.min(step, ms - t));
    await spin(2);
  }
}

function setup(
  opts: {
    platform?: NodeJS.Platform;
    pid?: number | undefined;
    totalBytes?: DebtBucket;
    group?: "SIGTERM" | "SIGKILL" | "never" | null;
    onRequest?: (r: ExtRequest) => void;
    stdinHighWaterMark?: number;
    runFile?: RunFile;
    spawnThrows?: boolean;
  } = {},
) {
  const clock = new ManualClock();
  const groups = new FakeGroups();
  const child = new FakeExtChild("pid" in opts ? opts.pid : PID, opts.stdinHighWaterMark !== undefined ? { stdinHighWaterMark: opts.stdinHighWaterMark } : {});
  const logger = new MemoryLogger();
  const requests: ExtRequest[] = [];
  const group = opts.group === undefined ? "SIGTERM" : opts.group;
  if (group !== null && child.pid !== undefined) groups.add(child.pid, group);
  // グループが合図で消えたら、子も終わる（実際の OS の動き）。
  groups.onCall = (pid, sig) => {
    if (sig !== 0 && pid === child.pid) {
      queueMicrotask(() => {
        if (!groups.has(pid)) child.exit(null, sig);
      });
    }
  };
  const proc = new ExtensionProcess(
    { key: "user:t", id: "t", scope: "user", root: null, command: SECRET_COMMAND, cwd: "/tmp", runId: "run-1" },
    {},
    { onRequest: opts.onRequest ?? ((r) => requests.push(r)) },
    {
      spawn: () => {
        if (opts.spawnThrows) throw new Error("boom: " + SECRET_COMMAND);
        return child;
      },
      killGroup: groups.kill,
      clock,
      logger,
      ...(opts.platform ? { platform: opts.platform } : {}),
      ...(opts.totalBytes ? { totalBytes: opts.totalBytes } : {}),
      ...(opts.runFile ? { runFile: opts.runFile } : {}),
    },
  );
  proc.start();
  return { clock, groups, child, logger, requests, proc };
}

const types = (c: FakeExtChild) => c.lines().map((l) => l["type"]);

describe("ExtensionProcess: 壊れた行", () => {
  it("JSON でない・形が合わない・4 MiB 超・壊れた UTF-8 ごとに ext.error が 1 行書かれ、onRequest は呼ばれない", async () => {
    const { child, requests } = setup();
    child.stdout.write("not json\n");
    child.stdout.write("[1]\n");
    child.stdout.write(Buffer.concat([Buffer.from([0x7b, 0xff, 0x7d]), Buffer.from("\n")]));
    child.stdout.write(Buffer.concat([Buffer.alloc(4 * 1024 * 1024 + 1, 0x61), Buffer.from("\n")]));
    await spin();
    expect(requests).toEqual([]);
    const errs = child.lines().filter((l) => l["type"] === "ext.error");
    expect(errs.map((e) => e["code"])).toEqual(["bad_line", "bad_request", "bad_line", "line_too_long"]);
  });

  it("続けて 20 行で自分で止まり、exited の理由が bad_lines。19 行の後に読める行が 1 つ来ると数え直す", async () => {
    const a = setup();
    for (let i = 0; i < 19; i++) a.child.stdout.write("x\n");
    a.child.stdout.write('{"method":"m"}\n');
    for (let i = 0; i < 19; i++) a.child.stdout.write("x\n");
    await spin();
    expect(a.requests).toHaveLength(1);
    expect(a.child.exited).toBe(false);
    a.child.stdout.write("x\n");
    await spin();
    // 19 + 1 = 20 続けて → 止まる
    await advance(a.clock, 100);
    expect((await a.proc.exited).reason).toBe("bad_lines");
    await a.proc.settled;
  });

  it("onRequest が例外を投げても、外へ漏れず、壊れた行に数える", async () => {
    const { child } = setup({ onRequest: () => { throw new Error("handler"); } });
    child.stdout.write('{"method":"m"}\n');
    await spin();
    expect(child.lines().some((l) => l["type"] === "ext.error" && l["code"] === "bad_request")).toBe(true);
  });
});

describe("ExtensionProcess: 頻度", () => {
  it("続けて 100 行は処理され、101 行目は桶が戻るまで pause されて、捨てられずに処理される", async () => {
    const { child, clock, requests } = setup();
    child.stdout.write(Array.from({ length: 101 }, (_, i) => JSON.stringify({ method: "m", id: i + 1 }) + "\n").join(""));
    await spin(20);
    expect(requests).toHaveLength(100);
    expect(child.stdout.isPaused()).toBe(true);
    await advance(clock, 60, 20);
    await spin(10);
    expect(requests).toHaveLength(101);
    expect(requests[100]!.id).toBe(101);
    expect(child.stdout.isPaused()).toBe(false);
  });

  it("17 行目の前に setImmediate を挟む（イベントループへ返す）", async () => {
    const { child, requests } = setup();
    let atMark = -1;
    setImmediate(() => {
      atMark = requests.length;
    });
    child.stdout.write(Array.from({ length: 20 }, (_, i) => JSON.stringify({ method: "m", id: i + 1 }) + "\n").join(""));
    // 書いた時点で、最初の 16 行は同期に処理される。残りは setImmediate で続く（この印は、その前に登録した）。
    await spin(10);
    expect(requests).toHaveLength(20);
    expect(atMark).toBe(16);
  });

  it("改行の無い出力を 9 MiB 流すと、8 MiB の辺りで stdout.pause() される", async () => {
    const { child } = setup();
    const chunk = Buffer.alloc(64 * 1024, 0x61);
    for (let i = 0; i < 120; i++) child.stdout.write(chunk); // 7.5 MiB
    await spin(4);
    expect(child.stdout.isPaused()).toBe(false);
    for (let i = 0; i < 24; i++) child.stdout.write(chunk); // 計 9 MiB
    await spin(4);
    expect(child.stdout.isPaused()).toBe(true);
  });

  it("渡された全体の桶が空なら、拡張ごとの桶に余りがあっても pause される", async () => {
    const total = new DebtBucket({ perSec: 1000, burst: 100 });
    const { child, clock } = setup({ totalBytes: total });
    child.stdout.write(Buffer.alloc(500, 0x61));
    await spin(4);
    expect(child.stdout.isPaused()).toBe(true);
    await advance(clock, 600, 100);
    await spin(4);
    expect(child.stdout.isPaused()).toBe(false);
  });
});

describe("ExtensionProcess: 書く", () => {
  const ev = (n: number): ExtLine => ({ type: "display.closed", paneId: "p", name: `n${n}`, reason: "closed", at: "t" });

  it("列が 512 行を超えると、出来事が古いものから捨てられ、空いたら ext.dropped が入る", async () => {
    const { child, proc } = setup({ stdinHighWaterMark: 1 });
    child.stallWrites = true;
    for (let i = 0; i < 600; i++) proc.send(ev(i), { droppable: true });
    child.releaseWrites();
    await spin();
    const lines = child.lines();
    const events = lines.filter((l) => l["type"] === "display.closed");
    const dropped = lines.filter((l) => l["type"] === "ext.dropped");
    expect(dropped.length).toBeGreaterThan(0);
    const droppedTotal = dropped.reduce((n, l) => n + (l["count"] as number), 0);
    expect(events.length + droppedTotal).toBe(600);
    // 新しいものが残っている
    expect(events.at(-1)!["name"]).toBe("n599");
  });

  it("ext.panes は、書かれていない前の 1 つと置き換わる", async () => {
    const { child, proc } = setup({ stdinHighWaterMark: 1 });
    child.stallWrites = true;
    proc.send({ type: "ext.hello" } as unknown as ExtLine);
    proc.send({ type: "ext.panes", panes: [] }, { coalesce: "ext.panes" });
    proc.send({ type: "ext.panes", panes: [{ id: "A" } as never] }, { coalesce: "ext.panes" });
    proc.send({ type: "ext.panes", panes: [{ id: "B" } as never] }, { coalesce: "ext.panes" });
    child.releaseWrites();
    await spin();
    const panes = child.lines().filter((l) => l["type"] === "ext.panes");
    expect(panes).toHaveLength(1);
    expect((panes[0]!["panes"] as { id: string }[])[0]!.id).toBe("B");
  });

  it("捨てられない行が入らなければ止まる（not_reading）", async () => {
    const { child, proc, clock } = setup({ stdinHighWaterMark: 1 });
    child.stallWrites = true;
    for (let i = 0; i < 520; i++) proc.send({ type: "ext.result", id: i, ok: true, result: null });
    await advance(clock, 100);
    expect((await proc.exited).reason).toBe("not_reading");
  });

  it("drain が 30 秒来なければ止まる（not_reading）。29 秒では止まらない", async () => {
    const { child, proc, clock } = setup({ stdinHighWaterMark: 1 });
    child.stallWrites = true;
    proc.send({ type: "ext.result", id: 1, ok: true, result: null });
    proc.send({ type: "ext.result", id: 2, ok: true, result: null });
    await advance(clock, 29_000, 1000);
    expect(child.exited).toBe(false);
    await advance(clock, 1_500, 500);
    expect((await proc.exited).reason).toBe("not_reading");
  });

  it("stdin の error（EPIPE）で、例外が外へ出ない", async () => {
    const { child, proc } = setup();
    expect(() => child.stdin.emit("error", new Error("EPIPE"))).not.toThrow();
    expect(() => child.stdout.emit("error", new Error("x"))).not.toThrow();
    expect(() => child.stderr.emit("error", new Error("x"))).not.toThrow();
    proc.send({ type: "ext.dropped", count: 1 });
  });
});

describe("ExtensionProcess: sweepGroup と止める", () => {
  it("SIGTERM は 1 回だけ。合図で消えれば SIGKILL は送らない", async () => {
    const { proc, groups, clock } = setup();
    const p = proc.stop("stopped");
    await advance(clock, 200);
    await p;
    expect(groups.signals(PID).filter((s) => s === "SIGTERM")).toHaveLength(1);
    expect(groups.signals(PID)).not.toContain("SIGKILL");
    expect((await proc.exited).reason).toBe("stopped");
    await proc.settled;
  });

  it("合図を無視するグループには、期限（2 秒）で SIGKILL を 1 回だけ。3 秒以内に返る", async () => {
    const { proc, groups, clock } = setup({ group: "SIGKILL" });
    let done = false;
    void proc.stop("stopped").then(() => (done = true));
    await advance(clock, 1_900);
    expect(done).toBe(false);
    expect(groups.signals(PID).filter((s) => s === "SIGTERM")).toHaveLength(1);
    expect(groups.signals(PID)).not.toContain("SIGKILL");
    await advance(clock, 200);
    await spin();
    expect(groups.signals(PID).filter((s) => s === "SIGKILL")).toHaveLength(1);
    expect(done).toBe(true);
  });

  it("グループが無ければ（ESRCH）、以後、何の合図も送らない", async () => {
    const { proc, groups, child } = setup({ group: null });
    child.exit(0);
    await proc.settled;
    expect(groups.calls.every(([, s]) => s === 0)).toBe(true);
    await proc.stop("stopped");
    expect(groups.signals(PID).every((s) => s === 0)).toBe(true);
  });

  it("killGroup が EPERM を投げても、例外が外へ出ず、期限で打ち切る", async () => {
    const { proc, groups, clock, logger } = setup({ group: "never" });
    groups.eperm.add(PID);
    let done = false;
    void proc.stop("stopped").then(() => (done = true));
    await advance(clock, 3_200);
    await spin();
    expect(done).toBe(true);
    expect(logger.lines.some((l) => l.level === "warn")).toBe(true);
  });

  it("同時に 2 回頼まれても、掃くのは 1 つ（SIGTERM は 1 回）", async () => {
    const { proc, groups, clock } = setup();
    const a = proc.stop("stopped");
    const b = proc.stop("stopped");
    await advance(clock, 200);
    await Promise.all([a, b]);
    expect(groups.signals(PID).filter((s) => s === "SIGTERM")).toHaveLength(1);
  });

  it("settled の後に stop() を呼んでも、killGroup は 1 度も呼ばれない（生涯で 1 回）", async () => {
    const { proc, groups, child, clock } = setup();
    child.exit(0);
    await advance(clock, 200);
    await proc.settled;
    const n = groups.calls.length;
    await proc.stop("stopped");
    await proc.stop("bad_lines");
    expect(groups.calls.length).toBe(n);
  });

  it("止めていない exit でも、裏でグループを掃く（残った孫に SIGTERM）", async () => {
    const { proc, groups, child, clock } = setup();
    child.exit(0); // グループ（孫）はまだ居る
    await advance(clock, 200);
    await proc.settled;
    expect(groups.signals(PID)).toContain("SIGTERM");
    expect((await proc.exited).reason).toBe("exited");
  });

  it("SIGKILL の後も、ESRCH になるか 3 秒の期限まで見続ける", async () => {
    const { proc, groups, clock } = setup({ group: "never" });
    let done = false;
    void proc.stop("stopped").then(() => (done = true));
    await advance(clock, 2_500);
    expect(done).toBe(false);
    expect(groups.signals(PID).filter((s) => s === "SIGKILL")).toHaveLength(1);
    await advance(clock, 700);
    await spin();
    expect(done).toBe(true);
    expect(groups.signals(PID).filter((s) => s === "SIGKILL")).toHaveLength(1);
  });

  it("子が exit すると stdin が終わり、stdout・stderr は 200 ミリ秒まで end を待ってから destroy される。その間の標準エラーは log() に入る", async () => {
    const { proc, child, clock } = setup({ group: null });
    child.exit(1);
    await spin();
    expect(child.stdinEnded).toBe(true);
    child.stderr.write("late line\n");
    await spin();
    expect(proc.log().lines).toContain("late line");
    expect(child.stderr.destroyed).toBe(false);
    await advance(clock, 250, 50);
    expect(child.stderr.destroyed).toBe(true);
    expect(child.stdout.destroyed).toBe(true);
  });

  it("stop が 3 秒で打ち切ったとき（exit が来ない）も、stdio を閉じる", async () => {
    const { proc, child, clock } = setup({ group: "never" });
    child.on("exit", () => undefined);
    // exit を出さない子: groups.onCall が exit しないよう、never なので消えない
    let done = false;
    void proc.stop("stopped").then(() => (done = true));
    await advance(clock, 3_200);
    await spin();
    expect(done).toBe(true);
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
  });

  it("stop() を 2 回呼んでも同じ。終了コード 0 は exited、ほかは crashed", async () => {
    const a = setup({ group: null });
    a.child.exit(0);
    expect((await a.proc.exited).reason).toBe("exited");
    const b = setup({ group: null });
    b.child.exit(3);
    expect(await b.proc.exited).toMatchObject({ code: 3, reason: "crashed" });
    const c = setup({ group: null });
    c.child.exit(null, "SIGSEGV");
    expect((await c.proc.exited).reason).toBe("crashed");
  });

  it("spawn が投げたら exited が spawn_failed。settled も決まり、stop() はすぐ返る。ロガーにコマンドが入らない", async () => {
    const { proc, logger } = setup({ spawnThrows: true });
    expect((await proc.exited).reason).toBe("spawn_failed");
    await proc.settled;
    await proc.stop("stopped");
    expect(JSON.stringify(logger.lines)).not.toContain("CMD-SECRET");
  });

  it("pid が無い子（spawn の失敗の知らせ）: error が来たら spawn_failed", async () => {
    const { proc, child } = setup({ pid: undefined });
    child.emit("error", Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
    expect((await proc.exited).reason).toBe("spawn_failed");
    await proc.settled;
  });
});

describe("ExtensionProcess: 標準エラー", () => {
  it("200 行の輪・あふれた数・1 行 4 KiB・制御文字は ? に", async () => {
    const { proc, child } = setup({ group: null });
    for (let i = 0; i < 250; i++) child.stderr.write(`line${i}\n`);
    child.stderr.write("a\u0007b\tc\n");
    child.stderr.write("x".repeat(5000) + "\n");
    await spin();
    const log = proc.log();
    expect(log.lines).toHaveLength(200);
    expect(log.dropped).toBe(52);
    expect(log.lines.at(-2)).toBe("a?b?c");
    expect(log.lines.at(-1)).toHaveLength(4096);
  });

  it("改行の無い出力は、4 KiB ごとに 1 行にする", async () => {
    const { proc, child } = setup({ group: null });
    child.stderr.write("y".repeat(10_000));
    await spin();
    const lines = proc.log().lines;
    expect(lines.slice(0, 2).every((l) => l.length === 4096)).toBe(true);
  });

  it("1 MiB 超を続けて書くと stderr.pause()", async () => {
    const { child, clock } = setup({ group: null });
    const chunk = Buffer.alloc(64 * 1024, 0x62);
    for (let i = 0; i < 20; i++) child.stderr.write(chunk);
    await spin(4);
    expect(child.stderr.isPaused()).toBe(true);
    await advance(clock, 6_000, 500);
    await spin(4);
    expect(child.stderr.isPaused()).toBe(false);
  });

  it("ロガーに、標準エラーの中身とコマンドが渡らない", async () => {
    const { child, logger, proc } = setup({ group: null });
    child.stderr.write("STDERR-SECRET-123\n");
    await spin();
    child.exit(1);
    await proc.settled;
    for (let i = 0; i < 25; i++) child.stdout.write("x\n");
    await spin();
    const all = JSON.stringify(logger.lines);
    expect(all).not.toContain("STDERR-SECRET");
    expect(all).not.toContain("CMD-SECRET");
    expect(all).not.toContain("secret/path");
  });
});

describe("ExtensionProcess: win32", () => {
  it("stop() は killGroup を呼ばず、2 秒後に子が exit していなければ runFile を taskkill の絶対パスで 1 回呼ぶ", async () => {
    const calls: { file: string; args: string[]; cwd: string }[] = [];
    const { proc, groups, clock } = setup({ platform: "win32", group: null, runFile: (file, args, o) => calls.push({ file, args, cwd: o.cwd }) });
    const p = proc.stop("stopped");
    await advance(clock, 1_900);
    expect(calls).toHaveLength(0);
    await advance(clock, 200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.file).toMatch(/System32\\taskkill\.exe$/);
    expect(calls[0]!.args).toEqual(["/pid", String(PID), "/T", "/F"]);
    expect(calls[0]!.cwd).toMatch(/System32$/);
    expect(groups.calls).toHaveLength(0);
    await advance(clock, 1_000);
    await spin();
    await p;
  });

  it("子が先に exit したら、runFile を呼ばない", async () => {
    const calls: string[] = [];
    const { proc, child, clock } = setup({ platform: "win32", group: null, runFile: (f) => calls.push(f) });
    const p = proc.stop("stopped");
    await advance(clock, 500);
    child.exit(null, "SIGTERM");
    await advance(clock, 2_500);
    await p;
    expect(calls).toHaveLength(0);
  });
});
