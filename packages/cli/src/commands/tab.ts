import type { ParamsOf } from "@sodashitsu/protocol";
import type { Command } from "../cliArgs.js";
import { printJson } from "../output.js";
import type { SessionStore } from "../session.js";
import { assertNotSelfTab, callerPaneParam } from "../selfGuard.js";
import { withSession } from "../withSession.js";

/** `tab create` / `close`（design.md「`workspace create` / `tab create` / `pane split`」節・
 * 「`workspace close/rename` / `tab close` / `pane close`」節）。workspace.ts と同じ流儀。 */

type TabCreateCmd = Extract<Command, { kind: "tab-create" }>;
type TabCloseCmd = Extract<Command, { kind: "tab-close" }>;

export async function runTabCreate(cmd: TabCreateCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    await client.hello();
    const params: ParamsOf<"tab.create"> = {};
    if (cmd.workspaceId !== undefined) params.workspaceId = cmd.workspaceId;
    if (cmd.label !== undefined) params.label = cmd.label;
    Object.assign(params, callerPaneParam(cmd.opts));
    return client.request("tab.create", params);
  });
  printJson(result);
}

export async function runTabClose(cmd: TabCloseCmd, store: SessionStore): Promise<void> {
  const result = await withSession(cmd.opts, store, async (client) => {
    const hello = await client.hello();
    assertNotSelfTab(cmd.opts, hello.snapshot, cmd.tabId, "close"); // 自分の pane を含む tab は閉じない（20260926-agent-skill-file）
    return client.request("tab.close", { tabId: cmd.tabId });
  });
  printJson(result);
}
