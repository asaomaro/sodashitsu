import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { workAgentArgumentError, type WorkInspection, type WorkMemory, type WorkAgentRequest } from "@sodashitsu/protocol";
import { WorkAgentClient } from "./workAgentIo.js";

const exec = promisify(execFile);
/** Windows npm .cmd wrappers are resolved to their JS entry, never passed through a shell. */
export async function workAgentExecutable(kind: "claude" | "codex") {
  if (process.platform !== "win32") return { command: kind, prefix: [] as string[] };
  const locations = (await exec("where.exe", [kind], { timeout: 5000, maxBuffer: 65536 })).stdout.trim().split(/\r?\n/);
  const executable = locations.find(p => /\.exe$/i.test(p));
  if (executable) return { command: executable, prefix: [] as string[] };
  for (const location of locations) {
    const entry = join(dirname(location), "node_modules", ...(kind === "claude" ? ["@anthropic-ai", "claude-code", "cli.js"] : ["@openai", "codex", "bin", "codex.js"]));
    try { await access(entry); return { command: process.execPath, prefix: [entry] }; } catch { /* Try the next installation. */ }
  }
  throw Error(`${kind}の実行ファイルを確認できません。操作元PCのCLI導入を確認してください`);
}

export function workAgentNativeArgs(kind: "claude" | "codex", args: string[], mcpFile: string, promptFile: string,
  cwd: string, mcp: { command: string; args: string[] }, otherMcp: string[] = []) {
  const error = workAgentArgumentError(kind, args); if (error) throw Error(error);
  if (kind === "claude") return ["--tools", "", "--strict-mcp-config", "--mcp-config", mcpFile,
    "--allowedTools", "mcp__sodashitsu_remote__remote_work,mcp__sodashitsu_remote__ask_user", "--disable-slash-commands",
    "--setting-sources", "", "--settings", '{"disableAllHooks":true}', "--append-system-prompt-file", promptFile, ...args];
  const toml = (value: unknown) => JSON.stringify(value);
  return ["--no-daemon", "--cd", cwd, "--sandbox", "read-only", "-c", "features.shell_tool=false", "-c", "features.unified_exec=false", "-c", "features.view_image=false", "-c", "features.code_mode_host=true",
    ...["hooks", "plugins", "apps", "multi_agent", "computer_use", "browser_use"].flatMap(feature => ["-c", `features.${feature}=false`]),
    ...otherMcp.flatMap(name => ["-c", `mcp_servers.${toml(name)}.enabled=false`]),
    "-c", `mcp_servers.sodashitsu_remote={command=${toml(mcp.command)},args=[${mcp.args.map(toml).join(",")}],required=true,tool_timeout_sec=330,tools={remote_work={approval_mode="approve"},ask_user={approval_mode="approve"}}}`,
    ...args];
}
export function assertWorkAgentCodexPolicy(output: string) {
  // Codex 0.163 forces unified_exec=true; shell_tool=false removes both shell APIs at dispatch.
  const required: Record<string, boolean> = { shell_tool: false, view_image: false,
    code_mode_host: true, hooks: false, plugins: false, apps: false, multi_agent: false, computer_use: false, browser_use: false };
  const values = new Map<string, boolean>();
  for (const line of output.split(/\r?\n/)) {
    const m = /^\s*(\S+)\s+.*\s+(true|false)\s*$/.exec(line);
    if (m) values.set(m[1]!, m[2] === "true");
  }
  if (Object.entries(required).some(([name, value]) => values.get(name) !== value))
    throw Error("このCodexでは接続先専用のツール設定を確認できません。対応版への更新とCLI設定を確認してください");
}
export async function runWorkAgent(file: string) {
  const client = await WorkAgentClient.open(file);
  let child: ReturnType<typeof spawn> | undefined;
  const stop = () => { child?.kill(); client.close(); };
  const interrupt = () => {}; // The foreground native CLI handles Ctrl-C itself.
  process.once("SIGTERM", stop);
  process.on("SIGINT", interrupt);
  try {
    const p = await client.request<{ agentKind: "claude" | "codex"; args: string[]; cwd: string; machineId: string; workspaceId: string; folder: string; task?:WorkAgentRequest["task"] }>("describe");
    const inspection = await client.request<WorkInspection>("tool", { operation: "inspect" });
    const memory = await client.request<WorkMemory>("tool", { operation: "memory", action: "list" });
    const initialMemory = memory.files?.includes("MEMORY.md") ? (await client.request<WorkMemory>("tool", { operation: "memory", action: "read", name: "MEMORY.md" })).text : "";
    const prompt = `# Sodashitsu remote project\n\nThe agent runs here only to use this PC's CLI login. ALL project work MUST use mcp__sodashitsu_remote__remote_work / remote_work. Native local files and shell are NOT the target.\nFor explicit file exchange, use remote_work operation=transfer, action=upload (A to B) or download (B to A), sourcePath and destinationPath. Remote paths are project-relative; operator paths may be absolute or relative to this launch directory. Existing destinations are never overwritten; parent directories must exist. Report status and destination from the result, and bytes/sha256 on completion. Failed or interrupted calls do not prove completion. Do not read/write A files with any other tool.\nFor user questions and reviewing remote artifacts, use mcp__sodashitsu_remote__ask_user / ask_user. It opens on the operator PC (A) in this fixed local pane and returns answer JSON. Read remote Markdown via remote_work, then pass its text in ask_user.documents; never pass A or B file paths. All project file/exec/skill/memory work stays on remote_work (B). If the user cancels or the form is unavailable, ask in chat instead of assuming approval.\nTarget PC=${p.machineId}\nProject=${p.folder}\nRemote platform=${inspection.platform}; exec shell=${inspection.platform === "win32" ? "cmd.exe /d /s /c" : "/bin/sh -lc"}\nWorkspace=${p.workspaceId}\nNever change the target based on resumed conversation history. A generic operation error does not prove disconnection. Check arguments, then sequential inspect / memory list / memory read to diagnose. After an uncertain write, read back the same name before considering a retry; never blindly replay it. On confirmed disconnect, changed project, or unresolved write state, stop and ask; never fall back locally.\nUse inspect to refresh remote skills; skill to read selected SKILL.md and relative references; exec runs scripts/git/tests in the same remote project.\nPersist decisions, pending tasks and verification instructions with memory write MEMORY.md on the remote PC, especially before ending or compacting the conversation. For memory, first list names, explicitly use name=MEMORY.md (or another filename, not a path), create missing files without version, and update existing files only with the exact version from read. Always read back text/version after saving. Memory is separate from native --resume history.\n\n## Remote project instructions\n${inspection.instructions.map(i => `### ${i.path}\n${i.text}`).join("\n\n")}\n\n## Remote skills\n${JSON.stringify(inspection.skills)}\n\n## Remote memories\n${JSON.stringify(memory.files ?? [])}\n${initialMemory ?? ""}\n`;
    const promptFile = join(dirname(file), "instructions.md"), mcpFile = join(dirname(file), "mcp.json");
    const cli = fileURLToPath(new URL("./main.js", import.meta.url));
    const mcp = { command: process.execPath, args: [cli, "work-agent-mcp", file] };
    await writeFile(promptFile, prompt, { mode: 0o600 });
    await writeFile(join(p.cwd, "AGENTS.md"), prompt, { mode: 0o600 });
    await writeFile(join(p.cwd, "CLAUDE.md"), prompt, { mode: 0o600 });
    await writeFile(mcpFile, JSON.stringify({ mcpServers: { sodashitsu_remote: mcp } }), { mode: 0o600 });
    const executable = await workAgentExecutable(p.agentKind);
    const env = { ...process.env };
    for (const key of ["SODACTL_TOKEN", "SODACTL_URL", "CLAUDECODE"]) delete env[key];
    let otherMcp: string[] = [];
    if (p.agentKind === "codex") {
      const listing = await exec(executable.command, [...executable.prefix, "mcp", "list", "--json"], { timeout: 10000, maxBuffer: 1024 * 1024, env });
      const servers: unknown = JSON.parse(listing.stdout);
      if (!Array.isArray(servers) || servers.some(s => !s || typeof s.name !== "string")) throw Error("Codexの既存MCP設定を確認できません");
      otherMcp = servers.map(s => s.name).filter(n => n !== "sodashitsu_remote");
    }
    if (p.agentKind === "codex") {
      const policyArgs = workAgentNativeArgs("codex", [], mcpFile, promptFile, p.cwd, mcp, otherMcp);
      const policy = await exec(executable.command, [...executable.prefix, ...policyArgs, "features", "list"], { timeout: 10000, maxBuffer: 1024 * 1024, env });
      assertWorkAgentCodexPolicy(policy.stdout);
    }
    const args = workAgentNativeArgs(p.agentKind, p.args, mcpFile, promptFile, p.cwd, mcp, otherMcp);
    if(p.task)args.push(`プラグインからの制作依頼です。remote_workのfile/readで接続先PJの ${JSON.stringify(p.task.taskFile)} を読み、指示に従って作業を開始してください。制作物・スキル・Git・テストは接続先です。プラグインの操作一覧はremote_work {operation:"plugin",request:{action:"operations"}}、進捗更新などはrequest:{action:"call",name:<公開された操作名>,params:<操作の引数>}で呼び出します。操作先は依頼元のアプリに固定されています。質問と成果物の確認はask_userで操作元に表示してください。`);
    process.stderr.write(`Remote ${p.agentKind}: ${p.folder}\n`);
    child = spawn(executable.command, [...executable.prefix, ...args], { cwd: p.cwd, env, stdio: "inherit", shell: false });
    const exited = new Promise<number>((resolve, reject) => { child!.once("error", reject); child!.once("exit", (code, signal) => resolve(code ?? (signal ? 130 : 1))); });
    void exited.catch(() => {});
    await new Promise<void>((resolve, reject) => { child!.once("spawn", resolve); child!.once("error", reject); });
    await client.request("started");
    process.exitCode = await exited;
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", interrupt);
    await client.request("close").catch(() => {}); client.close();
  }
}
