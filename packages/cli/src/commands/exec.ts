import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { printJson } from "../output.js";
import type { SodaClient } from "../wsClient.js";
import type { ExecResult } from "@sodashitsu/protocol";

export async function readExec(client: SodaClient, id: string): Promise<ExecResult> {
  let cancelled = false;
  const cancel = () => { if (!cancelled) { cancelled = true; void client.request("exec.cancel", { id }).catch(() => {}); } };
  process.on("SIGINT", cancel); process.on("SIGTERM", cancel);
  try {
    for (;;) {
      const value = await client.request("exec.read", { id });
      if (value.status === "exited") return value;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
}
export function printExec(result: ExecResult): void {
  printJson(result);
  process.exitCode = result.timedOut ? 124 : result.cancelled ? 130 : result.exitCode === 0 ? 0 : 1;
}

/** One authenticated connection owns start/read/cancel, including through --machine. */
export async function runExec(cmd: Extract<Command, { kind: "exec" }>, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async client => {
    const { id } = await client.request("exec.start", { command: cmd.command, cwd: cmd.cwd, timeoutMs: cmd.timeoutMs, encoding: cmd.encoding ?? "utf-8" });
    return readExec(client, id);
  });
  printExec(result);
}
