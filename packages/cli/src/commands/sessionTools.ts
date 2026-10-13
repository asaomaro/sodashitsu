import type { Command } from "../cliArgs.js";
import { CliUsageError } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { callPaneOp, paneSocketFor } from "../paneSocket.js";
import { withSession } from "../withSession.js";
import { resolveAgentTarget } from "../agentTarget.js";
import { printJson } from "../output.js";
export async function runSessionTools(
  cmd: Extract<Command, { kind: "agent-session-tools" }>,
  store: SessionStore,
) {
  const method = cmd.tool === "notes" ? "agent.notes" : "agent.todos";
  const caller = cmd.opts.caller?.paneId;
  const target = cmd.paneId ?? caller;
  if (!target)
    throw new CliUsageError(
      "target required",
      "対象ペインを指定してください。ペイン内では省略できます。",
    );
  const socket = paneSocketFor(cmd.opts);
  if (socket && caller && target === caller) {
    const reply = await callPaneOp(
      socket,
      { op: method, paneId: caller },
      { timeoutMs: 30_000, maxReplyBytes: 8 * 1024 * 1024 },
    );
    if (reply.kind === "result") {
      printJson(reply.result);
      return;
    }
  }
  const result = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const paneId = resolveAgentTarget(hello.snapshot, target).paneId;
    return client.request(method, { paneId });
  });
  printJson(result);
}
