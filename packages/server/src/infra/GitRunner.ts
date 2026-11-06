import { spawn } from "node:child_process";

/**
 * `git` コマンドの実行を抽象化する口（architecture.md「infra/*」）。`GitInfoPoller` と `WorktreeService` が使う。
 *
 * **`stderr` も返す**（20260920-git-worktree-actions）。`git worktree add` の失敗は日常的に起き、
 * 理由（`fatal: …`）が stderr にしか出ないため。`GitInfoPoller` は読まないので影響は無い。
 */
export interface GitRunner {
  run(cwd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }>;
}

export class ChildProcessGitRunner implements GitRunner {
  async run(cwd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // `LC_ALL=C`：失敗の種類を git の**英語の**診断で見分けるため（訳されると判別が壊れる。herdr も同じ）。
      const child = spawn("git", args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, LC_ALL: "C" } });
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error(`git ${args.join(" ")} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });
  }
}
