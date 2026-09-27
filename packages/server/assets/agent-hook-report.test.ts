import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../src/persist/atomicFile.js";
import { rm } from "node:fs/promises";

// 20260923-other-agents-session-resume（design「hook スクリプト」）。この hook スクリプトは
// `packages/server/src/agent/AgentIntegrationInstaller.ts` からコピーされて各エージェントの
// hook として実際に spawn される想定なので、`node <script> <kind>` として本当に動かし、
// stdin の `session_id`/`sessionId` の両方から拾えることを確認する（AgentIntegrationInstaller.test.ts は
// スクリプトが「コピーされること」しか見ておらず、中身の実行は見ていない）。

const SCRIPT_PATH = join(fileURLToPath(new URL(".", import.meta.url)), "agent-hook-report.cjs");

async function runHook(kind: string, stdin: string): Promise<{ paneId: string; kind: string; sessionId: string } | null> {
  const workDir = await makeTempDir("soda-agent-hook-report-test-");
  const sockPath = join(workDir, "report.sock");
  try {
    const received = await new Promise<{ paneId: string; kind: string; sessionId: string } | null>((resolve) => {
      const server = createServer((conn) => {
        let data = "";
        conn.on("data", (chunk) => (data += chunk));
        conn.on("end", () => {
          server.close();
          try {
            resolve(JSON.parse(data.trim()));
          } catch {
            resolve(null);
          }
        });
      });
      server.listen(sockPath, () => {
        const child = spawn("node", [SCRIPT_PATH, kind], {
          env: { ...process.env, SODA_PANE_ID: "p1", SODA_AGENT_REPORT_SOCKET: sockPath },
          stdio: ["pipe", "ignore", "ignore"],
        });
        child.stdin.end(stdin);
        // レポートが来ないまま終わるケース（`sessionId` が拾えない等）のため、タイムアウトで打ち切る。
        const timer = setTimeout(() => {
          server.close();
          resolve(null);
        }, 3000);
        timer.unref();
      });
    });
    return received;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

describe("agent-hook-report.cjs", () => {
  it("reports the session id from snake_case session_id (Claude Code・Codex・Cursor・Devin・Droid・Qwen Code)", async () => {
    const result = await runHook("claude", JSON.stringify({ session_id: "sess-snake" }));
    expect(result).toEqual({ paneId: "p1", kind: "claude", sessionId: "sess-snake" });
  });

  it("reports the session id from camelCase sessionId (Grok CLI・GitHub Copilot CLI)", async () => {
    const result = await runHook("grok", JSON.stringify({ sessionId: "sess-camel" }));
    expect(result).toEqual({ paneId: "p1", kind: "grok", sessionId: "sess-camel" });
  });

  it("prefers session_id when both are present", async () => {
    const result = await runHook("copilot", JSON.stringify({ session_id: "snake-wins", sessionId: "camel-loses" }));
    expect(result?.sessionId).toBe("snake-wins");
  });

  it("does nothing when neither field is present", async () => {
    const result = await runHook("qwen", JSON.stringify({ cwd: "/tmp" }));
    expect(result).toBeNull();
  });
}, 20000);
