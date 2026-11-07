import type { AgentOptions, SDKAgent, SDKMessage, Run } from "@cursor/sdk";

export const CURSOR_SDK_OUTPUT_LIMIT = 512 * 1024;
export const CURSOR_SDK_TEXT_LIMIT = 128 * 1024;
export interface CursorSummarySdk {
  Agent: { create(options: AgentOptions): Promise<SDKAgent> };
  JsonlLocalAgentStore: typeof import("@cursor/sdk").JsonlLocalAgentStore;
  tempFs: typeof import("@cursor/sdk").tempFs;
  FileCredentialStore: typeof import("@cursor/sdk").FileCredentialStore;
}
export interface CursorSummaryInput {
  model: string;
  prompt: string;
  apiKey?: string;
  authPath: string;
  cwd: string;
  store: string;
}
export class CursorSummaryFailure extends Error {
  constructor(readonly reason: "unavailable" | "failed" | "cancelled" | "limit" | "tool") {
    super(reason);
  }
}
/** Public API seam: test doubles exercise our policy/response handling, not a fabricated backend protocol. */
export async function runCursorSdkSummary(
  input: CursorSummaryInput,
  sdk: CursorSummarySdk,
  signal: AbortSignal,
): Promise<string> {
  let agent: SDKAgent | undefined, run: Run | undefined;
  let aborting = false;
  const cancel = () => {
    aborting = true;
    // Cancellation must not wait indefinitely on a provider. The supervisor owns the hard deadline.
    try { void run?.cancel().catch(() => undefined); } catch {}
    try { agent?.close(); } catch {}
  };
  signal.addEventListener("abort", cancel, { once: true });
  const check = () => { if (signal.aborted || aborting) throw new CursorSummaryFailure("cancelled"); };
  try {
    check();
    let key = input.apiKey;
    if (!key) {
      const saved = await new sdk.FileCredentialStore(input.authPath).load();
      check();
      if (saved && saved.backendUrl === "https://api2.cursor.sh" &&
          (saved.apiKeyExpiresAtMs === undefined || saved.apiKeyExpiresAtMs > Date.now())) key = saved.apiKey;
    }
    if (typeof key !== "string" || !key.trim() || key.length > 16384 || /[\r\n\0]/.test(key))
      throw new CursorSummaryFailure("unavailable");
    check();
    agent = await sdk.Agent.create({
      apiKey: key,
      model: { id: input.model },
      tools: [],
      disallowedTools: ["mcp", "task"],
      mcpServers: {},
      agents: {},
      local: {
        cwd: input.cwd, settingSources: [], customTools: {},
        store: new sdk.JsonlLocalAgentStore(input.store),
        fs: sdk.tempFs(), reportedWorkspacePath: "/repo", enableAgentRetries: false,
      },
    });
    check();
    run = await agent.send(input.prompt);
    check();
    let bytes = 0;
    for await (const event of run.stream()) {
      check();
      bytes += Buffer.byteLength(JSON.stringify(event));
      if (bytes > CURSOR_SDK_OUTPUT_LIMIT) throw new CursorSummaryFailure("limit");
      inspectCursorSummaryEvent(event);
    }
    const result = await run.wait();
    check();
    const resultBytes = Buffer.byteLength(JSON.stringify(result));
    if (bytes + resultBytes > CURSOR_SDK_OUTPUT_LIMIT) throw new CursorSummaryFailure("limit");
    if (result.status !== "finished" || typeof result.result !== "string" || !result.result.trim())
      throw new CursorSummaryFailure("failed");
    if (Buffer.byteLength(result.result) > CURSOR_SDK_TEXT_LIMIT) throw new CursorSummaryFailure("limit");
    return result.result;
  } catch (error) {
    cancel();
    if (error instanceof CursorSummaryFailure) throw error;
    // SDK/provider errors may quote prompts or credentials. Never expose their text.
    throw new CursorSummaryFailure("failed");
  } finally {
    signal.removeEventListener("abort", cancel);
    try { agent?.close(); } catch {}
  }
}
export function inspectCursorSummaryEvent(event: SDKMessage): void {
  if (event.type === "tool_call" || event.type === "task" || event.type === "request" ||
      (event.type === "system" && event.tools && event.tools.length > 0) ||
      (event.type === "assistant" && event.message.content.some(block => block.type === "tool_use")))
    throw new CursorSummaryFailure("tool");
}
