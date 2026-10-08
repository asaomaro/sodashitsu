import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { ExtChild, KillGroup } from "./ExtensionProcess.js";

/**
 * テスト用の偽の拡張の子プロセス（20261007-ext-host）。`stdin` に書かれた行を集め、`stdout`・`stderr` へ書けて、`exit` を出せる。
 * 時計は `machine/testing.ts` の `ManualClock` をそのまま使う。
 */
export class FakeExtChild extends EventEmitter implements ExtChild {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdin: Writable;
  readonly written: string[] = [];
  stdinEnded = false;
  exited = false;
  /** true の間、`stdin.write` は書き終わらない（`drain` が来ない＝読まない拡張）。 */
  stallWrites = false;
  private readonly held: (() => void)[] = [];

  constructor(
    readonly pid: number | undefined,
    opts: { stdinHighWaterMark?: number } = {},
  ) {
    super();
    this.stdin = new Writable({
      highWaterMark: opts.stdinHighWaterMark ?? 1024 * 1024,
      write: (chunk: Buffer, _enc, cb) => {
        this.written.push(chunk.toString("utf8"));
        if (this.stallWrites) this.held.push(cb);
        else cb();
      },
      final: (cb) => {
        this.stdinEnded = true;
        cb();
      },
    });
  }

  /** 書き終わらせる（`drain` が出る）。 */
  releaseWrites(): void {
    this.stallWrites = false;
    for (const cb of this.held.splice(0)) cb();
  }

  /** 書かれた行（JSON）。 */
  lines(): Record<string, unknown>[] {
    return this.written
      .join("")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  }

  /** 拡張の標準出力へ 1 行（改行つき）書く。 */
  say(obj: unknown): void {
    this.stdout.write(JSON.stringify(obj) + "\n");
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exited) return;
    this.exited = true;
    this.emit("exit", code, signal);
  }
}

/**
 * 偽の `killGroup`。グループ（pid → 合図を受けたら消えるか）を持ち、合図を記録する。グループが無ければ `ESRCH`、
 * `eperm` に入れた pid は `EPERM`（signal 0 でも）を投げる。
 */
export class FakeGroups {
  readonly calls: [number, "SIGTERM" | "SIGKILL" | 0][] = [];
  private readonly groups = new Map<number, { diesOn: "SIGTERM" | "SIGKILL" | "never" }>();
  readonly eperm = new Set<number>();
  /** 合図を送るたびに呼ばれる（`ESRCH` のときも）。 */
  onCall: ((pid: number, sig: "SIGTERM" | "SIGKILL" | 0) => void) | null = null;

  add(pid: number, diesOn: "SIGTERM" | "SIGKILL" | "never" = "SIGTERM"): void {
    this.groups.set(pid, { diesOn });
  }
  remove(pid: number): void {
    this.groups.delete(pid);
  }
  has(pid: number): boolean {
    return this.groups.has(pid);
  }
  readonly kill: KillGroup = (pid, sig) => {
    this.calls.push([pid, sig]);
    this.onCall?.(pid, sig);
    if (this.eperm.has(pid)) throw Object.assign(new Error("EPERM"), { code: "EPERM" });
    const g = this.groups.get(pid);
    if (g === undefined) throw Object.assign(new Error("ESRCH"), { code: "ESRCH" });
    if (sig === 0) return;
    if (g.diesOn === sig || (g.diesOn === "SIGTERM" && sig === "SIGKILL")) this.groups.delete(pid);
  };
  signals(pid: number): ("SIGTERM" | "SIGKILL" | 0)[] {
    return this.calls.filter(([p]) => p === pid).map(([, s]) => s);
  }
}
