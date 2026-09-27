import { describe, expect, it } from "vitest";
import type { PtyBackend, PtyProcess, PtySpawnOptions } from "../pty/PtyBackend.js";
import type { ProcessInspector } from "../platform/ProcessInspector.js";
import { DefaultTerminalHost } from "./TerminalHost.js";
import { DefaultTerminalManager } from "./TerminalManager.js";

/** 引き継ぎ（20260926-live-handoff）の口を持つ偽の PTY。呼ばれた順を `calls` に残す。 */
class HandoffFakePty implements PtyProcess {
  readonly calls: string[] = [];
  private readonly dataCbs = new Set<(chunk: string) => void>();
  /** `holdReading` の中で流し切る「読み取り済みの分」。 */
  buffered = "";
  holdOk = true;
  constructor(
    readonly pid = 1,
    private readonly fd: number | null = 33,
  ) {}
  onData(cb: (chunk: string) => void) {
    this.dataCbs.add(cb);
    return { dispose: () => this.dataCbs.delete(cb) };
  }
  onExit() {
    return { dispose: () => undefined };
  }
  write(): void {}
  resize(cols: number, rows: number): void {
    this.calls.push(`resize ${cols}x${rows}`);
  }
  pause(): void {
    this.calls.push("pause");
  }
  resume(): void {
    this.calls.push("resume");
  }
  kill(): void {
    this.calls.push("kill");
  }
  handoffFd(): number | undefined {
    return this.fd ?? undefined;
  }
  holdReading(): boolean {
    this.calls.push("holdReading");
    if (!this.holdOk) return false;
    if (this.buffered !== "") this.output(this.buffered);
    return true;
  }
  releaseReading(): void {
    this.calls.push("releaseReading");
  }
  output(chunk: string): void {
    for (const cb of [...this.dataCbs]) cb(chunk);
  }
}

describe("DefaultTerminalHost の引き継ぎの口", () => {
  it("holdForHandoff は読み取りを止め、読み取り済みの分もミラーに入れてから画面・fd・大きさを返す", async () => {
    const pty = new HandoffFakePty();
    const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
    pty.output("before\r\n");
    pty.buffered = "buffered-tail\r\n";
    host.resize(100, 30);
    const hold = await host.holdForHandoff();
    expect(hold).toBeDefined();
    expect(hold!.fd).toBe(33);
    expect([hold!.cols, hold!.rows]).toEqual([100, 30]);
    expect(hold!.screen).toContain("before");
    expect(hold!.screen).toContain("buffered-tail");
    expect(pty.calls).toContain("holdReading");
    // 2 度目は何もしない（既に止めている）
    expect(await host.holdForHandoff()).toBeUndefined();
    host.dispose();
  });

  it("fd を渡せない PTY・止められない PTY は undefined で、何も変えない", async () => {
    const noFd = new HandoffFakePty(1, null);
    const h1 = new DefaultTerminalHost("p1", noFd, 80, 24, 1000);
    expect(await h1.holdForHandoff()).toBeUndefined();
    expect(noFd.calls).toEqual([]);
    const cannot = new HandoffFakePty();
    cannot.holdOk = false;
    const h2 = new DefaultTerminalHost("p2", cannot, 80, 24, 1000);
    expect(await h2.holdForHandoff()).toBeUndefined();
    // 失敗の後はもう一度試せる（止めている印が残らない）
    cannot.holdOk = true;
    expect(await h2.holdForHandoff()).toBeDefined();
    h1.dispose();
    h2.dispose();
  });

  it("releaseHandoffHold は読み取りを戻して resume する。止めていなければ何もしない", async () => {
    const pty = new HandoffFakePty();
    const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
    host.releaseHandoffHold();
    expect(pty.calls).toEqual([]);
    await host.holdForHandoff();
    pty.calls.length = 0;
    host.releaseHandoffHold();
    expect(pty.calls).toEqual(["releaseReading", "resume"]);
    host.dispose();
  });

  it("止めている間はミラーが追いついても（流量制御の onDrained）resume しない", async () => {
    const pty = new HandoffFakePty();
    const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
    // 1MB を超える出力で流量制御の pause を起こす
    pty.output("x".repeat(1024 * 1024 + 10));
    expect(pty.calls).toContain("pause");
    await host.holdForHandoff(); // ミラーの flush を待つ＝onDrained が走る
    await host.mirror.flush();
    expect(pty.calls).not.toContain("resume");
    host.releaseHandoffHold();
    expect(pty.calls.filter((c) => c === "resume")).toHaveLength(1);
    host.dispose();
  });

  it("nudgeRedraw は 1 行減らし、間を置いて戻す（ミラーの大きさは変えない）。小さい端末は桁で、それも無理なら何もしない", async () => {
    const pty = new HandoffFakePty();
    const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
    host.nudgeRedraw(20);
    expect(pty.calls).toEqual(["resize 80x23"]);
    await new Promise((r) => setTimeout(r, 40));
    expect(pty.calls).toEqual(["resize 80x23", "resize 80x24"]);
    expect(host.mirror.serialize(0)).toMatchObject({ cols: 80, rows: 24 });
    host.resize(10, 2);
    pty.calls.length = 0;
    host.nudgeRedraw(20);
    await new Promise((r) => setTimeout(r, 40));
    expect(pty.calls).toEqual(["resize 9x2", "resize 10x2"]);
    host.resize(4, 2);
    pty.calls.length = 0;
    host.nudgeRedraw(20);
    await new Promise((r) => setTimeout(r, 40));
    expect(pty.calls).toEqual([]);
    host.dispose();
  });

  it("nudgeRedraw の間に大きさが変わったら（クライアントが繋いだ）戻さない", async () => {
    const pty = new HandoffFakePty();
    const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
    host.nudgeRedraw(20);
    host.resize(100, 30);
    await new Promise((r) => setTimeout(r, 40));
    expect(pty.calls).toEqual(["resize 80x23", "resize 100x30"]);
    host.dispose();
  });

  it("流量制御で止めている間に引き継ぎをやめても resume しない（ミラーが追いついたときに再開する）", async () => {
    const pty = new HandoffFakePty();
    const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
    // ミラーの flush を保留にして、流量制御の pause を残したまま release する
    let releaseFlush: () => void = () => undefined;
    (host.mirror as unknown as { flush: () => Promise<void> }).flush = () =>
      new Promise<void>((r) => (releaseFlush = r));
    (host.mirror as unknown as { pendingBytes: () => number }).pendingBytes = () => 2 * 1024 * 1024;
    pty.output("x");
    expect(pty.calls).toContain("pause");
    const holding = host.holdForHandoff();
    await Promise.resolve();
    host.releaseHandoffHold();
    expect(pty.calls).not.toContain("resume");
    releaseFlush();
    await holding;
    host.dispose();
  });

  it("待っている間に端末が捨てられたら、holdForHandoff は undefined（閉じた fd を渡さない）", async () => {
    const pty = new HandoffFakePty();
    const host = new DefaultTerminalHost("p1", pty, 80, 24, 1000);
    let releaseFlush: () => void = () => undefined;
    (host.mirror as unknown as { flush: () => Promise<void> }).flush = () =>
      new Promise<void>((r) => (releaseFlush = r));
    const holding = host.holdForHandoff();
    host.dispose();
    releaseFlush();
    expect(await holding).toBeUndefined();
  });
});

describe("DefaultTerminalManager.adopt", () => {
  const inspector = {
    defaultShell: () => ({ shell: "/bin/sh", args: [] }),
  } as unknown as ProcessInspector;

  it("PtyBackend.adopt で作った PTY を、渡した大きさの端末として登録する", () => {
    const adopted: { fd: number; pid: number }[] = [];
    const pty = new HandoffFakePty(77);
    const backend: PtyBackend = {
      spawn: (_opts: PtySpawnOptions) => {
        throw new Error("not used");
      },
      adopt: (opts) => {
        adopted.push(opts);
        return pty;
      },
    };
    const manager = new DefaultTerminalManager(backend, inspector, 1000);
    const host = manager.adopt("p9", { fd: 40, pid: 77, cols: 90, rows: 20 });
    expect(adopted).toEqual([{ fd: 40, pid: 77 }]);
    expect(manager.get("p9")).toBe(host);
    expect(host.pid).toBe(77);
    expect(host.mirror.serialize(0)).toMatchObject({ cols: 90, rows: 20 });
    manager.dispose("p9");
    expect(pty.calls).toContain("kill");
  });

  it("adopt の無い PtyBackend では投げる", () => {
    const backend: PtyBackend = { spawn: () => new HandoffFakePty() };
    const manager = new DefaultTerminalManager(backend, inspector, 1000);
    expect(() => manager.adopt("p1", { fd: 40, pid: 1, cols: 80, rows: 24 })).toThrow(
      /cannot adopt/,
    );
    expect(manager.get("p1")).toBeUndefined();
  });
});
