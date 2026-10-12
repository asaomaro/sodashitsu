import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { commandArgv } from "../commands/commandLaunch.js";
import type { ExecutionResult } from "./Scheduler.js";
/** 予約コマンドを既存のOS別シェル規則で実行し、出力と終了コードを記録する。 */
export async function executeScheduledCommand(
  command: string,
  cwd: string,
  signal: AbortSignal,
): Promise<ExecutionResult> {
  if (signal.aborted) throw new Error("実行を中断しました");
  if (!(await stat(cwd)).isDirectory()) throw new Error("作業フォルダが見つかりません");
  if (signal.aborted) throw new Error("実行を中断しました");
  const argv = commandArgv("shell", command, process.platform, process.env);
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0]!, argv.slice(1), {
      cwd,
      env: process.env,
      detached: process.platform !== "win32",
      windowsHide: true,
      windowsVerbatimArguments: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < 8192) output = (output + chunk.toString("utf8")).slice(0, 8192);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const stop = () => {
      try {
        if (process.platform === "win32" && child.pid) {
          const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            stdio: "ignore",
          });
          killer.on("error", () => child.kill());
        } else if (child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill();
      } catch {
        child.kill();
      }
    };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    child.once("error", (err) => {
      signal.removeEventListener("abort", stop);
      reject(err);
    });
    child.once("close", (code) => {
      signal.removeEventListener("abort", stop);
      resolve({
        status: code === 0 ? "succeeded" : "failed",
        exitCode: code,
        output: signal.aborted ? output + "\n実行を中断しました" : output,
      });
    });
  });
}
