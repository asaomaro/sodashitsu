import { workAgentArgumentError } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { selfPaneId } from "../selfGuard.js";
import { resolvePaneRef } from "../idRef.js";
import { RpcFailure } from "../wsClient.js";
import { printJson } from "../output.js";

export async function requestWorkAgent(cmd: Extract<Command, { kind: "work-agent" }>, store: SessionStore) {
  const error = workAgentArgumentError(cmd.agentKind, cmd.args);
  if (error) throw new RpcFailure("invalid_params", error);
  if (cmd.opts.machine) throw new RpcFailure("invalid_params", "接続先のpaneでwork agentを実行してください");
  await withSession(cmd.opts, store, async c => {
    const ref = cmd.pane ?? selfPaneId(cmd.opts);
    if (!ref) throw new RpcFailure("caller_pane_unknown", "paneで実行するか--paneを指定してください");
    const snapshot = (await c.hello()).snapshot, paneId = resolvePaneRef(snapshot, ref);
    const request = await c.request("work.agent_request", { paneId, agentKind: cmd.agentKind, args: cmd.args });
    process.stderr.write(`操作元のSodashitsuで起動要求を受け付けてください。要求 ${request.id}\nCLI: sodactl work accept <このPCのmachine名> ${request.id}\n`);
    let cancelled = false;
    const cancel = () => { cancelled = true; void c.request("work.agent_reject", { id: request.id }).catch(() => {}); };
    process.once("SIGINT", cancel); process.once("SIGTERM", cancel);
    try {
      while (!cancelled && Date.now() < request.expiresAt) {
        const found = (await c.request("work.agent_requests", { paneId })).requests.find(r => r.id === request.id);
        if (!found) throw Error("起動要求は期限切れです");
        if (found.state === "launched") { printJson({ status: "launched", requestId: request.id, target: request.folder }); return; }
        if (found.state === "failed" || found.state === "rejected") throw Error(`起動要求: ${found.state}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      if (cancelled) process.exitCode = 130; else throw Error("起動要求は期限切れです");
    } finally { process.off("SIGINT", cancel); process.off("SIGTERM", cancel); }
  });
}
export async function controlWorkAgent(cmd: Extract<Command, { kind: "work-agent-control" }>, store: SessionStore) {
  const result = await withSession(cmd.opts, store, async c => {
    if (cmd.action === "requests") return c.request("work.agent_requests", {});
    if (cmd.opts.machine) throw Error("work acceptは操作元のサーバに接続して実行してください");
    const machines = (await c.request("machine.list", {})).machines;
    const matches = machines.filter(m => m.id === cmd.machine || m.label === cmd.machine || (cmd.machine!.length >= 4 && m.id.startsWith(cmd.machine!)));
    if (matches.length !== 1) throw Error("machineを一意に指定してください");
    return c.request("work.agent_launch", { machineId: matches[0]!.id, requestId: cmd.requestId! }, { timeoutMs: 60000 });
  });
  printJson(result);
}
