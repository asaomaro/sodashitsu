import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AntigravityStatusLineWrapper, antigravityStatusLinePaths } from "./antigravityStatusLineWrap.js";
import { startAgentReportSocket, type AgentReport } from "./AgentReportSocket.js";
import { MemoryLogger } from "../log/Logger.js";

let dir: string;
const asset = fileURLToPath(new URL("../../assets/soda-agy-statusline.cjs", import.meta.url));
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "soda-agy-statusline-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("Antigravity statusline wrapper", () => {
  for (const text of ["{}\n", '{"trustedWorkspaces":["/a"]}', '{\r\n "statusLine": {"type":"command","command":"printf original", "enabled":false,"padding":2,"stack_with_default":true}\r\n}\r\n']) {
    it("round trips exact settings bytes and preserves optional settings", async () => {
      const p = antigravityStatusLinePaths({}, dir);
      await mkdir(join(dir, ".gemini", "antigravity-cli"), { recursive: true });
      await writeFile(p.configFile, text);
      const w = new AntigravityStatusLineWrapper(asset, {}, dir, "linux");
      expect((await w.install()).ok).toBe(true);
      const installed = JSON.parse(await readFile(p.configFile, "utf8"));
      const original = JSON.parse(text);
      if (original.statusLine) {
        expect(installed.statusLine).toMatchObject({ enabled: false, padding: 2, stack_with_default: true });
      } else expect(installed.statusLine.stack_with_default).toBe(true);
      expect((await w.status()).state).toBe("installed");
      expect((await w.uninstall()).ok).toBe(true);
      expect(await readFile(p.configFile, "utf8")).toBe(text);
    });
  }

  it("keeps later unrelated edits and never overwrites a user replacement", async () => {
    const p = antigravityStatusLinePaths({}, dir);
    await mkdir(join(dir, ".gemini", "antigravity-cli"), { recursive: true });
    const original = { type: "command", command: "printf old", padding: 3 };
    await writeFile(p.configFile, JSON.stringify({ statusLine: original, trustedWorkspaces: ["/a"] }));
    const w = new AntigravityStatusLineWrapper(asset, {}, dir, "linux");
    await w.install();
    const edited = JSON.parse(await readFile(p.configFile, "utf8"));
    edited.userAdded = true;
    await writeFile(p.configFile, JSON.stringify(edited));
    expect((await w.uninstall()).ok).toBe(true);
    expect(JSON.parse(await readFile(p.configFile, "utf8"))).toEqual({ statusLine: original, trustedWorkspaces: ["/a"], userAdded: true });
    await w.install();
    edited.statusLine = { type: "command", command: "printf new" };
    const replacement = JSON.stringify(edited);
    await writeFile(p.configFile, replacement);
    await w.uninstall();
    expect(await readFile(p.configFile, "utf8")).toBe(replacement);
  });

  it("rejects malformed settings and marks Windows unsupported", async () => {
    const p = antigravityStatusLinePaths({}, dir);
    await mkdir(join(dir, ".gemini", "antigravity-cli"), { recursive: true });
    await writeFile(p.configFile, "broken");
    expect((await new AntigravityStatusLineWrapper(asset, {}, dir, "linux").install()).ok).toBe(false);
    expect(await readFile(p.configFile, "utf8")).toBe("broken");
    expect((await new AntigravityStatusLineWrapper(asset, {}, dir, "win32").status()).state).toBe("unsupported");
  });

  it("forwards original output/exit code and emits bounded metadata without secrets", async () => {
    const reports: AgentReport[] = [];
    const socket = await startAgentReportSocket(join(dir, "report.sock"), r => reports.push(r), new MemoryLogger());
    const sid = "12345678-abcd-ef01-2345-6789abcdef01";
    try {
      const result = await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
        const backup = Buffer.from(JSON.stringify({ soda: 1, original: { command: "printf original; exit 7" } })).toString("base64url");
        const child = spawn(process.execPath, [asset, backup], { env: { ...process.env, SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: socket.path } });
        let output = "";
        child.stdout.on("data", c => { output += String(c); });
        child.on("error", reject);
        child.on("close", code => resolve({ code, output }));
        child.stdin.end(JSON.stringify({ conversation_id: sid, email: "secret@example.test", transcript_path: "/secret",
          model: { id: "Gemini" }, context_window: { current_usage: { input_tokens: 80, output_tokens: 4, cache_read_input_tokens: 20, cache_creation_input_tokens: 0 } },
          quota: { "gemini-weekly": { remaining_fraction: 0.75, reset_time: "2026-10-20T00:00:00Z" }, bad: { remaining_fraction: -1 } },
          agent_state: "working", tool_confirmation_pending: true,
        }));
      });
      expect(result).toEqual({ code: 7, output: "original" });
      expect(reports).toHaveLength(2);
      expect(reports[0]).toMatchObject({ type: "session", kind: "agy", sessionId: sid });
      expect(reports[1]).toMatchObject({ type: "usage", kind: "agy", sessionId: sid, contextTokens: 100,
        inputTokens: 80, outputTokens: 4, cacheReadTokens: 20, agentState: "working", toolConfirmationPending: true,
        quota: [{ label: "gemini-weekly", usedPct: 25, resetsAt: 1792454400 }],
      });
      expect(JSON.stringify(reports)).not.toContain("secret");
      expect(reports[1]).not.toHaveProperty("costUsd");
    } finally { await socket.close(); }
  });
});

it("does not treat missing context counters as zero", async () => {
  const reports: AgentReport[] = [];
  const socket = await startAgentReportSocket(join(dir, "missing.sock"), r => reports.push(r), new MemoryLogger());
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [asset], { env: { ...process.env, SODA_PANE_ID: "p", SODA_AGENT_REPORT_SOCKET: socket.path } });
      child.on("error", reject); child.on("close", () => resolve());
      child.stdin.end(JSON.stringify({ conversation_id: "12345678-abcd-ef01-2345-6789abcdef01", context_window: { current_usage: { input_tokens: 80 } } }));
    });
    expect(reports[1]).toMatchObject({ type: "usage", inputTokens: 80 });
    expect(reports[1]).not.toHaveProperty("contextTokens");
    expect(reports[1]).not.toHaveProperty("cacheReadTokens");
  } finally { await socket.close(); }
});

it("Copilot wraps settings.json, retains command without optional type and restores exact bytes",async()=>{
 const root=join(dir,"copilot"),file=join(root,"settings.json");await mkdir(root);
 const text='{\n "statusLine": {"command":"printf old", "refreshInterval": 2}, "theme":"dark"\n}\n';await writeFile(file,text);
 const w=new AntigravityStatusLineWrapper(asset,{COPILOT_HOME:root},dir,"linux","copilot");
 expect((await w.install()).ok).toBe(true);
 const installed=JSON.parse(await readFile(file,"utf8"));expect(installed.statusLine.command).toContain("soda-copilot-statusline.cjs");expect(installed.statusLine).not.toHaveProperty("stack_with_default");
 expect((await w.status()).state).toBe("installed");await w.uninstall();expect(await readFile(file,"utf8")).toBe(text);
});
it("Copilot real payload crosses the socket with numeric metadata only and preserves original output",async()=>{
 const root=join(dir,"copilot");const w=new AntigravityStatusLineWrapper(asset,{COPILOT_HOME:root},dir,"linux","copilot");await w.install();
 const reports:AgentReport[]=[];const socket=await startAgentReportSocket(join(dir,"copilot.sock"),r=>reports.push(r),new MemoryLogger());
 try{
 const output=await new Promise<string>((resolve,reject)=>{
  const backup=Buffer.from(JSON.stringify({soda:1,original:{command:"printf original"}})).toString("base64url");
  const c=spawn(process.execPath,[join(root,"hooks","soda-copilot-statusline.cjs"),backup],{env:{...process.env,SODA_PANE_ID:"p",SODA_AGENT_REPORT_SOCKET:socket.path}});let out="";c.stdout.on("data",b=>out+=b);c.on("error",reject);c.on("close",()=>resolve(out));
  c.stdin.end(JSON.stringify({session_id:"12345678-abcd-ef01-2345-6789abcdef01",username:"SECRET",cwd:"/SECRET",transcript_path:"/SECRET",model:{id:"model"},cost:{total_premium_requests:2},ai_used:{total_nano_aiu:150000000},context_window:{total_input_tokens:300,total_output_tokens:50,total_cache_read_tokens:200,total_tokens:550,current_context_tokens:40,context_window_size:1000,used_percentage:4,remaining_tokens:960}}));
 });
 expect(output).toBe("original");expect(reports).toHaveLength(2);expect(reports[1]).toMatchObject({kind:"copilot",cumulativeTokens:{output:50,cacheRead:200,total:550},contextTokens:40,contextRemainingTokens:960,creditsAic:0.15,premiumRequests:2});expect(JSON.stringify(reports)).not.toContain("SECRET");
 }finally{await socket.close();}
});
