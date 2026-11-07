import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { expect, it } from "vitest";
import { startAgentReportSocket, type AgentReport } from "./AgentReportSocket.js";
import { MemoryLogger } from "../log/Logger.js";
it("piggybacks only parent permission-mode facts and never hook input/child overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "soda-hook-observed-")), path = join(dir, "r.sock"), reports: AgentReport[] = [];
  const server = await startAgentReportSocket(path, r => reports.push(r), new MemoryLogger());
  try {
    const run = (payload: object) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL("../../assets/agent-hook-report.cjs", import.meta.url)), "claude"], { env: { ...process.env, SODA_PANE_ID: "fixture-pane", SODA_AGENT_REPORT_SOCKET: path }, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = ""; child.stdout.on("data", b => { stdout += b }); child.stderr.resume();
      child.on("error", reject); child.on("close", code => { try { expect(code).toBe(0); expect(stdout).toBe(""); resolve() } catch(e) { reject(e) } });
      child.stdin.end(JSON.stringify({ session_id: "11111111-1111-4111-8111-111111111111", hook_event_name: "Stop", permission_mode: "plan", prompt: "SECRET", last_assistant_message: "SECRET", ...payload }));
    });
    await run({}); expect(reports.at(-1)?.executionSettings).toEqual({ permissionMode: { value: "plan", source: "hook", basis: "hook" } });
    await run({ agent_id: "child", permission_mode: "bypassPermissions" }); expect(reports.at(-1)?.executionSettings).toBeUndefined();
    await run({ permission_mode: "future-policy" }); expect(reports.at(-1)?.executionSettings).toBeUndefined();
    await run({ permission_mode: "bypassPermissions" }); expect(reports.at(-1)?.executionSettings?.permissionMode?.value).toBe("bypassPermissions");
    expect(JSON.stringify(reports)).not.toContain("SECRET");
  } finally { await server.close(); await rm(dir, { recursive: true, force: true }); }
});
