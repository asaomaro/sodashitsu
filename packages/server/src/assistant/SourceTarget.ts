import { notifyKeyOf } from "@sodashitsu/client-core";
import { RpcError, type AssistantSource } from "@sodashitsu/protocol";
import type { MethodDeps } from "../surface/methods/deps.js";
/** Pin UUIDs and project identity so a queued reply cannot follow a moved/replaced project. */
export function sourceTarget(deps: MethodDeps, source: AssistantSource, key: string) {
  const pane = deps.session.getPane(source.paneId),
    tab = pane && deps.session.getTab(pane.tabId),
    workspace = tab && deps.session.getWorkspace(tab.workspaceId),
    agent = pane?.agent;
  if (
    source.machineId !== "local" ||
    !pane ||
    !tab ||
    !workspace ||
    !agent ||
    workspace.id !== source.workspaceId ||
    agent.instanceId !== source.agentInstanceId ||
    ![
      notifyKeyOf("done", agent),
      ...(agent.state === "blocked" ? [notifyKeyOf("blocked", agent)] : []),
    ].includes(key) ||
    (key.startsWith("done:") &&
      (agent.state !== "idle" ||
        agent.completionSeq <= agent.serverSeenSeq ||
        agent.completionSeq === 0)) ||
    deps.notifications
      ?.state()
      .notices.some((notice) => notice.key === key && notice.status === "resolved")
  )
    throw new RpcError("not_found", "通知の対象が変更されたか、対応済みです");
  const project = workspace.projectDir,
    cwd = workspace.cwd;
  return {
    pane,
    tab,
    workspace,
    agent,
    guard() {
      const current = sourceTarget(deps, source, key);
      if (
        current.tab.id !== tab.id ||
        current.workspace.id !== workspace.id ||
        current.agent.instanceId !== agent.instanceId ||
        current.workspace.projectDir !== project ||
        current.workspace.cwd !== cwd
      )
        throw new RpcError("not_found", "通知の送信先が変更されました");
    },
  };
}
