import { PassThrough } from "node:stream";
import { expect, it, vi } from "vitest";
import { parseArgs } from "./cliArgs.js";
import { workAgentNativeArgs, assertWorkAgentCodexPolicy } from "./workAgentRun.js";
import { workAgentMcp } from "./workAgentMcp.js";

it("treats everything after the agent name as native argv and keeps sodactl flags before it", () => {
  expect(parseArgs(["work", "agent", "--pane", "1234", "claude", "--resume", "--model", "sonnet"])).toMatchObject({ kind: "work-agent", pane: "1234", agentKind: "claude", args: ["--resume", "--model", "sonnet"] });
  expect(parseArgs(["work", "agent", "codex", "resume", "--last", "--url", "native"])).toMatchObject({ args: ["resume", "--last", "--url", "native"] });
  expect(() => parseArgs(["work", "agent", "--bad", "x", "codex"])).toThrow();
});
it("locks native tool configuration while forwarding safe resume args unchanged", () => {
  const native = ["--resume", "--model", "sonnet"];
  const args = workAgentNativeArgs("claude", native, "/private/mcp.json", "/private/prompt.md", "/stage", { command: "node", args: [] });
  expect(args.slice(-native.length)).toEqual(native);
  expect(args.slice(args.indexOf("--tools"), args.indexOf("--tools") + 2)).toEqual(["--tools", ""]);
  expect(args).toContain("--strict-mcp-config");
  const codex = workAgentNativeArgs("codex", ["resume", "--last"], "mcp", "prompt", "/stage", { command: "node", args: ["x", '日本語 "value"'] }, ["existing"]);
  expect(codex.slice(-2)).toEqual(["resume", "--last"]);
  expect(codex).toContain('mcp_servers."existing".enabled=false');
  expect(codex).toContain("features.hooks=false");
  expect(codex).toContain("features.view_image=false");
  expect(codex).toContain("read-only");
  expect(() => workAgentNativeArgs("claude", ["--mcp-config", "evil"], "a", "b", "c", { command: "n", args: [] })).toThrow();
});
it("exposes only the fixed remote tool over MCP and propagates disconnect failure", async () => {
  const input = new PassThrough(), output = new PassThrough(); let result = "";
  output.on("data", b => { result += String(b); });
  const client = { request: vi.fn(async () => { throw Error("target disconnected"); }), close: vi.fn() };
  const running = workAgentMcp(input, output, client);
  for (const m of [
    { id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
    { id: 2, method: "tools/list" },
    { id: 3, method: "tools/call", params: { name: "remote_work", arguments: { operation: "exec", command: "pwd" } } },
    { id: 4, method: "tools/call", params: { name: "local_shell", arguments: {} } },
  ]) input.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  input.end(); await running;
  const messages = result.trim().split("\n").map(l => JSON.parse(l));
  expect(messages[1].result.tools.map((t: { name: string }) => t.name)).toEqual(["remote_work"]);
  expect(messages[2].result).toMatchObject({ isError: true, content: [{ text: "target disconnected" }] });
  expect(client.request).toHaveBeenCalledTimes(1);
  expect(client.close).toHaveBeenCalled();
});

it("refuses a Codex version which ignores or overrides the fixed tool policy", () => {
  const features = ["shell_tool", "unified_exec", "view_image", "hooks", "plugins", "apps", "multi_agent", "computer_use", "browser_use"];
  const disabled = features.map(n => `${n} stable false`).join("\n") + "\ncode_mode_host stable true";
  expect(() => assertWorkAgentCodexPolicy(disabled)).not.toThrow();
  // Installed Codex keeps unified_exec=true even with an explicit false override.
  expect(() => assertWorkAgentCodexPolicy(disabled.replace("unified_exec stable false", "unified_exec stable true"))).not.toThrow();
  expect(() => assertWorkAgentCodexPolicy(disabled.replace("view_image stable false", ""))).toThrow(/Codex/);
  expect(() => assertWorkAgentCodexPolicy(disabled.replace("shell_tool stable false", "shell_tool stable true"))).toThrow(/Codex/);
});


it("forwards cancellation while a remote command is pending and remains usable", async () => {
  const input = new PassThrough(), output = new PassThrough();
  const replies: any[] = []; let buffer = "";
  output.on("data", b => { buffer += String(b); let end: number; while ((end = buffer.indexOf("\n")) >= 0) { replies.push(JSON.parse(buffer.slice(0, end))); buffer = buffer.slice(end + 1); } });
  let finish: ((result: unknown) => void) | undefined;
  const client = {
    request: vi.fn(async (operation: string): Promise<any> => {
      if (operation === "cancel") { finish?.({ status: "exited", cancelled: true }); return {}; }
      return new Promise(resolve => { finish = resolve; });
    }), close: vi.fn(),
  };
  const running = workAgentMcp(input, output, client);
  const send = (m: object) => input.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  send({ id: 1, method: "initialize" });
  send({ id: 2, method: "tools/call", params: { name: "remote_work", arguments: { operation: "exec", command: "long-command" } } });
  await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith("tool", expect.anything()));
  send({ method: "notifications/cancelled", params: { requestId: 2 } });
  await vi.waitFor(() => expect(replies.find(r => r.id === 2)?.result.content[0].text).toContain('"cancelled":true'));
  send({ id: 3, method: "ping" });
  await vi.waitFor(() => expect(replies.find(r => r.id === 3)?.result).toEqual({}));
  input.end(); await running;
  expect(client.request).toHaveBeenCalledWith("cancel");
});
