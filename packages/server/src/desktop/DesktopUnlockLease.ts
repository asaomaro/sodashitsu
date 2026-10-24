import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** Local trusted launch command only. The native broker requires these live heartbeats. */
export class DesktopUnlockLease {
  private child: ChildProcessWithoutNullStreams | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private command: readonly string[] | undefined;
  private failures = 0;

  start(command: readonly string[]): void {
    this.stop();
    this.command = [...command];
    this.launch();
  }
  /** An explicit new share can retry after the bounded background attempts ended. */
  ensureRunning(): void {
    if (this.command && !this.child && !this.retry) {
      this.failures = 0;
      this.launch();
    }
  }
  private scheduleRetry(): void {
    if (!this.command || this.retry || this.failures >= 5) return;
    const delay = 1000 * 2 ** this.failures++;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      this.launch();
    }, delay);
    this.retry.unref();
  }
  private launch(): void {
    const command = this.command;
    if (!command) return;
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command[0]!, command.slice(1), {
        shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      this.scheduleRetry();
      return;
    }
    this.child = child;
    const started = Date.now();
    child.stdout.resume();
    child.stderr.resume(); // Never log native paths, screen contents or input.
    const failed = (retire: boolean) => {
      if (this.child !== child) return;
      clearInterval(this.timer);
      this.timer = undefined;
      this.child = undefined;
      if (retire) this.retire(child);
      // A long-lived lease gets a fresh retry budget after a later sleep/pipe loss.
      if (Date.now() - started >= 30000) this.failures = 0;
      this.scheduleRetry();
    };
    child.once("close", () => failed(false));
    child.once("error", () => failed(true));
    child.stdin.on("error", () => failed(true));
    const heartbeat = () => {
      if (this.child !== child) return;
      if (child.stdin.writableLength > 128) { failed(true); return; }
      try {
        child.stdin.write("heartbeat\n", (error) => { if (error) failed(true); });
      } catch { failed(true); }
    };
    this.timer = setInterval(heartbeat, 1000);
    this.timer.unref();
    heartbeat();
  }
  stop(): void {
    this.command = undefined;
    this.failures = 0;
    clearTimeout(this.retry);
    this.retry = undefined;
    clearInterval(this.timer);
    this.timer = undefined;
    const child = this.child;
    this.child = undefined;
    if (child) this.retire(child);
  }
  private retire(child: ChildProcessWithoutNullStreams): void {
    child.stdin.end();
    const timeout = setTimeout(() => child.kill(), 1500);
    timeout.unref();
    child.once("close", () => clearTimeout(timeout));
  }
}
