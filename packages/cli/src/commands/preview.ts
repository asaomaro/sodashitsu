import type { Command } from "../cliArgs.js";
import { CliUsageError } from "../cliArgs.js";
import { resolvePaneRef } from "../idRef.js";
import { printJson } from "../output.js";
import { viaPaneSocketOrSession } from "../paneSocket.js";
import { selfPaneId } from "../selfGuard.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { LoopbackGateway } from "../preview/LoopbackGateway.js";
import { rpcPreviewTransport } from "../preview/RpcPreviewTransport.js";

type Cmd = Extract<Command, { kind: "preview" }>;
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 250));
function choose<T extends { id: string }>(items: T[], ref: string | undefined, label: string): T {
  const matches = ref ? items.filter((i) => i.id === ref || ref.length >= 4 && i.id.startsWith(ref)) : items;
  if (matches.length !== 1) throw new RpcFailure("invalid_params", `${label}: ${matches.length ? "multiple candidates; specify an ID" : "not found"}`);
  return matches[0]!;
}

export async function runPreview(cmd: Cmd, store: SessionStore): Promise<void> {
  const caller = selfPaneId(cmd.opts);
  const paneRef = cmd.pane ?? (cmd.action === "helper" || cmd.action === "viewers" ? undefined : caller);
  if (cmd.action === "register" && !paneRef) throw new CliUsageError("register requires --pane outside the calling pane");
  // Only a confirmed caller may use the pane socket; helper and browser grants
  // always use authenticated /ws (including the existing --machine route).
  const useSocket = caller !== undefined && (cmd.pane === undefined || cmd.pane === caller) && !(cmd.viewer && cmd.viewer.length !== 36) && !["helper", "viewers"].includes(cmd.action);
  const authenticated = () => withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    const paneId = paneRef ? resolvePaneRef(hello.snapshot, paneRef) : undefined;
    if (cmd.action === "helper") return helper(client, cmd, paneId);
    if (cmd.action === "viewers") return client.request("preview.viewers", paneId ? { paneId } : {});
    if (cmd.action === "register") return client.request("preview.register", { paneId: paneId!, name: cmd.name!, port: cmd.port!, replace: cmd.replace });
    const { apps } = await client.request("preview.list", paneId ? { paneId } : {});
    if (cmd.action === "list") return { apps };
    const app = choose(apps, cmd.ref, "app");
    if (cmd.action === "open") {
      const viewers = (await client.request("preview.viewers", { paneId: app.paneId })).viewers;
      const selected = cmd.viewer ? choose(viewers, cmd.viewer, "viewer").id : undefined;
      return client.request("preview.open", { appId: app.id, ...(selected ? { viewerId: selected } : {}) }, { timeoutMs: 30_000 });
    }
    return client.request("preview.stop", { appId: app.id, remove: cmd.action === "remove" });
  });
  let result: unknown;
  if (!useSocket) result = await authenticated();
  else {
    const call = <T>(name: string, params: Record<string, unknown>) => viaPaneSocketOrSession<T>(cmd.opts, caller!, { name, params, timeoutMs: 30_000 }, authenticated as () => Promise<T>);
    if (cmd.action === "register") result = await call("preview.register", { name: cmd.name!, port: cmd.port!, replace: cmd.replace });
    else {
      // The fallback for list must only list, not execute the original command.
      const list = await viaPaneSocketOrSession<{ apps: { id: string }[] }>(cmd.opts, caller!, { name: "preview.list", params: {}, timeoutMs: 10_000 }, () => withSession(cmd.opts, store, async (client) => { await client.hello(); return client.request("preview.list", { paneId: caller! }); }));
      if (cmd.action === "list") result = list;
      else {
        const app = choose(list.apps, cmd.ref, "app");
        result = cmd.action === "open" ? await call("preview.open", { appId: app.id, ...(cmd.viewer ? { viewerId: cmd.viewer } : {}) }) : await call("preview.stop", { appId: app.id, remove: cmd.action === "remove" });
      }
    }
  }
  if (cmd.action !== "helper") printJson(result);
}

async function helper(client: SodaClient, cmd: Cmd, paneId?: string): Promise<void> {
  const viewers = (await client.request("preview.viewers", paneId ? { paneId } : {})).viewers;
  const viewer = choose(viewers, cmd.viewer, "viewer (enable Web preview in Sodashitsu first)");
  const scope = await client.request("preview.helper", { viewerId: viewer.id });
  printJson({ status: "helper_ready", viewerId: scope.viewerId, paneId: scope.paneId });
  const gateways = new Map<string, LoopbackGateway>();
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once("SIGINT", stop); process.once("SIGTERM", stop); client.onClose(stop);
  try {
    while (!stopped) {
      const work = await client.request("preview.work", {});
      for (const [id, gateway] of gateways) if (!work.active.includes(id)) { await gateway.close(); gateways.delete(id); }
      for (const job of work.jobs) {
        let gateway: LoopbackGateway | undefined;
        try {
          gateway = await LoopbackGateway.listen(rpcPreviewTransport(client, job.requestId), scope.origin);
          await client.request("preview.ready", { requestId: job.requestId, ...gateway.bootstrap() });
          gateways.set(job.requestId, gateway);
          printJson({ status: "preview_ready", appId: job.app.id, requestId: job.requestId });
        } catch { await gateway?.close(); printJson({ status: "preview_failed", appId: job.app.id }); }
      }
      await pause();
    }
  } finally {
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
    await Promise.all([...gateways.values()].map((g) => g.close()));
  }
}
