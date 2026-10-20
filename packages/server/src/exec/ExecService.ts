import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { RpcError, type ExecResult } from "@sodashitsu/protocol";
import { commandArgv } from "../commands/commandLaunch.js";

const OUTPUT_LIMIT = 65536;
type Job = {
  owner: string;
  child: ChildProcessWithoutNullStreams;
  result: ExecResult;
  encoding: string;
  stdout: Buffer;
  stderr: Buffer;
  timer: ReturnType<typeof setTimeout>;
  stopTimer?: ReturnType<typeof setTimeout>;
};

/** Authenticated WS/bridge only. Jobs belong to the live connection, never pane.sock. */
export class ExecService {
  private readonly jobs = new Map<string, Job>();
  start(owner: string, p: { command: string; cwd: string; timeoutMs: number; encoding?: "utf-8" | "shift_jis" | "utf-16le" }): { id: string } {
    if (process.platform === "win32" && !/^[a-z]:[\\/]/i.test(p.cwd))
      throw new RpcError("invalid_params", "Windows exec requires a drive-qualified cwd; cmd.exe does not support UNC working directories");
    if (!isAbsolute(p.cwd)) throw new RpcError("invalid_params", "cwd must be an absolute path on the target PC");
    try {
      if (!statSync(p.cwd).isDirectory()) throw new Error();
    } catch { throw new RpcError("not_found", "Working directory not found on the target PC"); }
    if (this.jobs.size >= 32 || [...this.jobs.values()].filter(j => j.result.status === "running").length >= 4)
      throw new RpcError("server_busy", "Too many commands; close completed command connections first");
    const argv = commandArgv("shell", p.command, process.platform, process.env);
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd: p.cwd, env: process.env, detached: process.platform !== "win32", windowsHide: true,
      windowsVerbatimArguments: process.platform === "win32", stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.on("error", () => {});
    child.stdin.end();
    const id = randomUUID();
    const result: ExecResult = { id, status: "running", stdout: "", stderr: "", stdoutTruncated: false,
      stderrTruncated: false, exitCode: null, signal: null, timedOut: false, cancelled: false };
    const job: Job = { owner, child, result, encoding: p.encoding ?? "utf-8", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0),
      timer: setTimeout(() => { result.timedOut = true; this.stop(job); }, p.timeoutMs) };
    job.timer.unref();
    this.jobs.set(id, job);
    const append = (name: "stdout" | "stderr", chunk: Buffer) => {
      const room = OUTPUT_LIMIT - job[name].length;
      if (chunk.length > room) result[name === "stdout" ? "stdoutTruncated" : "stderrTruncated"] = true;
      if (room > 0) job[name] = Buffer.concat([job[name], chunk.subarray(0, room)]);
    };
    child.stdout.on("data", (b: Buffer) => append("stdout", b));
    child.stderr.on("data", (b: Buffer) => append("stderr", b));
    child.on("error", () => { append("stderr", Buffer.from("Command process could not be started\n")); });
    child.once("close", (code, signal) => {
      clearTimeout(job.timer); clearTimeout(job.stopTimer);
      result.status = "exited"; result.exitCode = code; result.signal = signal;
    });
    return { id };
  }
  private require(owner: string, id: string): Job {
    const job = this.jobs.get(id);
    if (!job || job.owner !== owner) throw new RpcError("not_found", "Command not found for this connection");
    return job;
  }
  read(owner: string, id: string): ExecResult {
    const j = this.require(owner, id);
    return { ...j.result, stdout: new TextDecoder(j.encoding).decode(j.stdout), stderr: new TextDecoder(j.encoding).decode(j.stderr) };
  }
  cancel(owner: string, id: string): void {
    const j = this.require(owner, id);
    if (j.result.status === "running") { j.result.cancelled = true; this.stop(j); }
  }
  private stop(job: Job): void {
    if (job.result.status !== "running" || job.stopTimer) return;
    // A detached descendant can retain stdio after the shell exits. Never wait forever for close.
    clearTimeout(job.timer);
    job.stopTimer = setTimeout(() => {
      job.child.stdout.destroy(); job.child.stderr.destroy(); job.child.stdin.destroy();
      job.child.unref(); job.result.status = "exited";
    }, 1000);
    job.stopTimer.unref();
    try {
      if (process.platform === "win32" && job.child.pid) {
        const killer = spawn("taskkill", ["/PID", String(job.child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.on("error", () => job.child.kill());
        killer.once("exit", code => { if (code !== 0) job.child.kill(); });
      } else if (job.child.pid) process.kill(-job.child.pid, "SIGKILL");
      else job.child.kill();
    } catch { job.child.kill(); }
  }
  clientGone(owner: string): void {
    for (const [id, j] of this.jobs) if (j.owner === owner) {
      clearTimeout(j.timer); this.stop(j); this.jobs.delete(id);
    }
  }
  dispose(): void { for (const j of [...this.jobs.values()]) this.clientGone(j.owner); }
}
