import { parentPort } from "node:worker_threads";
import type { PtyBackend, PtyProcess, PtySpawnOptions, Disposable } from "./PtyBackend.js";

/** ConPTYは監督プロセスに置き、サーバworkerだけを更新する。通信は私的MessagePortのみ。 */
export class WorkerPtyBackend implements PtyBackend {
  private readonly processes = new Map<number, WorkerPty>();
  retained = false;
  private readonly holds = new Map<number, (ok: boolean) => void>();
  private readonly onMessage = (m: {
    type: string;
    fd: number;
    chunk?: string;
    exitCode?: number;
  }): void => {
    if (m.type === "pty-written") {
      this.processes.get(m.fd)?.written();
      return;
    }
    if (m.type === "pty-held") {
      this.holds.get(m.fd)?.(true);
      return;
    }
    const p = this.processes.get(m.fd);
    if (m.type === "pty-data") p?.data(m.chunk ?? "");
    else if (m.type === "pty-exit") p?.exit(m.exitCode ?? 0);
  };
  constructor() {
    if (!parentPort) throw new Error("PTY broker requires a worker");
    parentPort.on("message", this.onMessage);
  }
  dispose(): void {
    parentPort?.off("message", this.onMessage);
    for (const finish of this.holds.values()) finish(false);
    this.holds.clear();
    this.processes.clear();
  }
  call(op: string, args: object = {}): number[] {
    const result = new Int32Array(new SharedArrayBuffer(16));
    parentPort!.postMessage({ type: "pty", op, ...args, result: result.buffer });
    if (Atomics.wait(result, 0, 0, 10_000) === "timed-out" || result[0] !== 1)
      throw new Error(`PTY broker ${op} failed`);
    return Array.from(result);
  }
  send(op: string, fd: number, args: object = {}): void {
    parentPort!.postMessage({ type: "pty", op, fd, ...args });
  }
  spawn(opts: PtySpawnOptions): PtyProcess {
    const [, fd, pid] = this.call("spawn", { opts });
    const p = new WorkerPty(this, fd!, pid!);
    this.processes.set(fd!, p);
    return p;
  }
  adopt(opts: { fd: number; pid: number }): PtyProcess {
    const [, fd, pid] = this.call("adopt", opts);
    const p = new WorkerPty(this, fd!, pid!);
    this.processes.set(fd!, p);
    return p;
  }
  hold(fd: number): Promise<boolean> {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.holds.delete(fd);
        this.send("resume", fd);
        resolve(false);
      }, 1500);
      this.holds.set(fd, (ok) => {
        clearTimeout(t);
        this.holds.delete(fd);
        resolve(ok);
      });
      this.send("hold", fd);
    });
  }
  valid(fd: number): boolean {
    try {
      return this.call("check", { fd })[1] === 1;
    } catch {
      return false;
    }
  }
  discard(fd: number): void {
    this.send("kill", fd);
  }
}
class WorkerPty implements PtyProcess {
  private readonly queued: number[] = [];
  private bytes = 0;
  private readonly dataListeners = new Set<(chunk: string) => void>();
  private readonly exitListeners = new Set<(e: { exitCode: number }) => void>();
  constructor(
    private readonly backend: WorkerPtyBackend,
    private readonly fd: number,
    readonly pid: number,
  ) {}
  onData(cb: (chunk: string) => void): Disposable {
    this.dataListeners.add(cb);
    return { dispose: () => this.dataListeners.delete(cb) };
  }
  onExit(cb: (e: { exitCode: number }) => void): Disposable {
    this.exitListeners.add(cb);
    return { dispose: () => this.exitListeners.delete(cb) };
  }
  data(chunk: string): void {
    for (const cb of this.dataListeners) cb(chunk);
  }
  exit(exitCode: number): void {
    for (const cb of this.exitListeners) cb({ exitCode });
  }
  write(data: string | Uint8Array): void {
    const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
    this.queued.push(bytes);
    this.bytes += bytes;
    this.backend.send("write", this.fd, { data });
  }
  written(): void {
    this.bytes -= this.queued.shift() ?? 0;
  }
  pendingWriteBytes(): number {
    return this.bytes + this.backend.call("pending", { fd: this.fd })[1]!;
  }
  pendingWriteChunks(): number {
    return this.queued.length + this.backend.call("pending", { fd: this.fd })[2]!;
  }
  resize(cols: number, rows: number): void {
    this.backend.send("resize", this.fd, { cols, rows });
  }
  pause(): void {
    this.backend.send("pause", this.fd);
  }
  resume(): void {
    this.backend.send("resume", this.fd);
  }
  kill(): void {
    if (!this.backend.retained) this.backend.discard(this.fd);
  }
  handoffFd(): number {
    return this.fd;
  }
  holdReading(): Promise<boolean> {
    return this.backend.hold(this.fd);
  }
  releaseReading(): void {
    this.backend.send("resume", this.fd);
  }
}
