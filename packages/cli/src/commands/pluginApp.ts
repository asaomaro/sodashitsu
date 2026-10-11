import type { Command } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { withSession } from "../withSession.js";
import { resolvePaneRef, resolveTabRef, resolveWorkspaceRef } from "../idRef.js";
import { resolveExtRef } from "./ext.js";
import { printJson } from "../output.js";
export async function runPluginApp(
  cmd: Extract<Command, { kind: "plugin-app" }>,
  store: SessionStore,
): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    const { snapshot } = await client.hello();
    const key = resolveExtRef(await client.request("extension.list", {}), cmd.ref);
    const target = {
      key,
      ...(cmd.pane ? { paneId: resolvePaneRef(snapshot, cmd.pane) } : {}),
      ...(cmd.tab ? { tabId: resolveTabRef(snapshot, cmd.tab) } : {}),
      ...(cmd.workspace ? { workspaceId: resolveWorkspaceRef(snapshot, cmd.workspace) } : {}),
    };
    return cmd.action === "operations"
      ? client.request("plugin.operations", target)
      : client.request(
          "plugin.call",
          { ...target, operation: cmd.operation!, params: cmd.params },
          { timeoutMs: 35_000 },
        );
  });
  printJson(result);
}
