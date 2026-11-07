import { describe, it, expect, vi } from "vitest";
import type { AgentOptions, SDKMessage } from "@cursor/sdk";
import { runCursorSdkSummary, type CursorSummarySdk, type CursorSummaryInput } from "./cursorSdkSummaryRuntime.js";

const input: CursorSummaryInput = { model: "fixture-model", prompt: "own summary", apiKey: "fixture-key", authPath: "/private/auth", cwd: "/private/work", store: "/private/store" };
function fixture(options: { events?: unknown[]; result?: unknown; credentials?: unknown; create?: () => Promise<void> } = {}) {
  const cancel = vi.fn(async () => undefined), close = vi.fn(), load = vi.fn(async () => options.credentials);
  let captured: AgentOptions | undefined;
  const sdk = {
    Agent: { create: vi.fn(async (value: AgentOptions) => {
      captured = value; await options.create?.();
      return { close, send: vi.fn(async () => ({ cancel,
        async *stream() { for (const event of options.events ?? []) yield event; },
        wait: async () => options.result ?? { status: "finished", result: '{"headline":"fixture","text":"summary"}' },
      })) };
    }) },
    JsonlLocalAgentStore: class { constructor(readonly path: string) {} },
    FileCredentialStore: class { load = load; },
    tempFs: vi.fn(() => ({ fixture: true })),
  } as unknown as CursorSummarySdk;
  return { sdk, cancel, close, load, captured: () => captured };
}
const base = { agent_id: "fixture-agent", run_id: "fixture-run" };
describe("Cursor SDK summary public runtime", () => {
  it("offers zero tools and no ambient configuration, returning text without sends to a working agent", async () => {
    const f = fixture();
    expect(await runCursorSdkSummary(input, f.sdk, new AbortController().signal)).toContain("summary");
    expect(f.captured()).toMatchObject({ apiKey: "fixture-key", model: { id: "fixture-model" }, tools: [], disallowedTools: ["mcp", "task"], mcpServers: {}, agents: {}, local: { settingSources: [], customTools: {}, reportedWorkspacePath: "/repo", enableAgentRetries: false, fs: { fixture: true } } });
    expect(f.captured()?.cloud).toBeUndefined(); expect(f.load).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalled();
  });
  it("reads only public SDK credentials when no environment key is supplied", async () => {
    const f = fixture({ credentials: { backendUrl: "https://api2.cursor.sh", apiKey: "stored-fixture", apiKeyExpiresAtMs: Date.now() + 10000 } });
    const { apiKey: _, ...noKey } = input;
    await runCursorSdkSummary(noKey, f.sdk, new AbortController().signal);
    expect(f.captured()?.apiKey).toBe("stored-fixture"); expect(f.load).toHaveBeenCalledOnce();
  });
  it.each([undefined, { backendUrl: "https://wrong.example", apiKey: "x" }, { backendUrl: "https://api2.cursor.sh", apiKey: "x", apiKeyExpiresAtMs: 1 }])("rejects unavailable, foreign-backend or expired credentials without create", async credentials => {
    const f = fixture({ credentials }); const { apiKey: _, ...noKey } = input;
    await expect(runCursorSdkSummary(noKey, f.sdk, new AbortController().signal)).rejects.toMatchObject({ reason: "unavailable" });
    expect(f.sdk.Agent.create).not.toHaveBeenCalled();
  });
  it.each([
    { ...base, type: "tool_call", name: "shell", status: "running", call_id: "x" },
    { ...base, type: "task", task_id: "x", status: "running" },
    { ...base, type: "request" },
    { ...base, type: "system", tools: ["read"] },
    { ...base, type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "x", name: "shell", input: {} }] } },
  ])("our wrapper rejects forbidden public event %j and cancels", async event => {
    const f = fixture({ events: [event] });
    await expect(runCursorSdkSummary(input, f.sdk, new AbortController().signal)).rejects.toMatchObject({ reason: "tool" });
    expect(f.cancel).toHaveBeenCalled(); expect(f.close).toHaveBeenCalled();
  });
  it("allows bounded assistant text/status/usage metadata", async () => {
    const events: SDKMessage[] = [{ ...base, type: "system", tools: [] }, { ...base, type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "fixture" }] } }];
    const f = fixture({ events });
    await expect(runCursorSdkSummary(input, f.sdk, new AbortController().signal)).resolves.toContain("summary");
  });
  it.each([{ status: "error", result: "secret" }, { status: "finished", result: "" }, { status: "finished", result: "x".repeat(128 * 1024 + 1) }])("rejects invalid/oversize terminal result", async result => {
    const f = fixture({ result }); await expect(runCursorSdkSummary(input, f.sdk, new AbortController().signal)).rejects.toThrow(); expect(f.cancel).toHaveBeenCalled();
  });
  it("bounds all streamed events, including ignored thinking", async () => {
    const f = fixture({ events: [{ type: "thinking", text: "x".repeat(512 * 1024) }] });
    await expect(runCursorSdkSummary(input, f.sdk, new AbortController().signal)).rejects.toMatchObject({ reason: "limit" });
  });
  it("rejects a result arriving after cancellation and closes a late create", async () => {
    const controller = new AbortController();
    const f = fixture({ create: async () => { controller.abort(); } });
    await expect(runCursorSdkSummary(input, f.sdk, controller.signal)).rejects.toMatchObject({ reason: "cancelled" });
    expect(f.close).toHaveBeenCalled();
  });
  it("never leaks provider diagnostics", async () => {
    const f = fixture({ create: async () => { throw Error("credential-secret fixture-input"); } });
    await expect(runCursorSdkSummary(input, f.sdk, new AbortController().signal)).rejects.toMatchObject({ message: "failed" });
  });
});
