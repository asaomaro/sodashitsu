import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildLike, Clock } from "./MachineLink.js";

/** テスト用の偽の子プロセス（20260927-multi-host-machines）。stdin に書かれたバイトを集め、stdout/stderr へ書けて、終わり方を選べる。 */
export class FakeChild extends EventEmitter implements ChildLike {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly written: Buffer[] = [];
  readonly kills: (NodeJS.Signals | undefined)[] = [];
  exited = false;

  constructor(
    readonly command: string,
    readonly args: string[],
  ) {
    super();
    this.stdin.on("data", (b: Buffer) => this.written.push(b));
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.kills.push(signal);
    if (!this.exited) this.exit(null, signal ?? "SIGTERM");
    return true;
  }

  /** 終わる（stdout を閉じてから close）。 */
  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exited) return;
    this.exited = true;
    this.stdout.end();
    this.stderr.end();
    setImmediate(() => this.emit("close", code, signal));
  }

  allWritten(): Uint8Array {
    return new Uint8Array(Buffer.concat(this.written));
  }
}

/** 手で進める時計。 */
export class ManualClock implements Clock {
  private t = 0;
  private seq = 0;
  private readonly timers = new Map<number, { at: number; fn: () => void; every?: number }>();

  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.timers.delete(h as number);
  }
  setInterval(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + ms, fn, every: ms });
    return id;
  }
  clearInterval(h: unknown): void {
    this.timers.delete(h as number);
  }
  /** `ms` 進め、その間に来るタイマーを時刻順に呼ぶ。 */
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void; every?: number }] | undefined;
      for (const e of this.timers) if (e[1].at <= end && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      const [id, timer] = next;
      this.t = timer.at;
      if (timer.every !== undefined) timer.at += timer.every;
      else this.timers.delete(id);
      timer.fn();
    }
    this.t = end;
  }
  pending(): number {
    return this.timers.size;
  }
}

export const flush = (): Promise<void> => new Promise((r) => setImmediate(r));
