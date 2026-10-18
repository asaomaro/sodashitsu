import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** Local trusted launch command only. The native broker requires these live heartbeats. */
export class DesktopUnlockLease {
  private child: ChildProcessWithoutNullStreams | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  start(command: readonly string[]): void {
    this.stop();
    const child = spawn(command[0]!, command.slice(1), {
      shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    child.stdout.resume();
    child.stderr.resume(); // Never log native paths, screen contents or input.
    const closed = () => {
      if (this.child !== child) return;
      clearInterval(this.timer);
      this.timer = undefined;
      this.child = undefined;
    };
    child.once("close", closed);
    child.once("error", closed);
    child.stdin.on("error", () => { if (this.child === child) this.stop(); });
    const heartbeat = () => {
      if (child.stdin.writableLength > 128) { this.stop(); return; }
      child.stdin.write("heartbeat\n", (error) => { if (error && this.child === child) this.stop(); });
    };
    heartbeat();
    this.timer = setInterval(heartbeat, 1000);
    this.timer.unref();
  }
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    const child = this.child;
    this.child = undefined;
    if (!child) return;
    child.stdin.end();
    const timeout = setTimeout(() => child.kill(), 1500);
    timeout.unref();
    child.once("close", () => clearTimeout(timeout));
  }
}
