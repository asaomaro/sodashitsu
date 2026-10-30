import type { Workspace, Pane, AssistantWorkspaceBinding } from "@sodashitsu/protocol";

/** Capture a verified conversation reference atomically with its owning pane's session file. */
export function savedAssistantBinding(
  workspace: Workspace,
  panes: readonly Pane[],
  verified: (paneId: string, instanceId: string, sessionId: string) => boolean,
): AssistantWorkspaceBinding {
  const binding = structuredClone(workspace.assistant!);
  const pane = panes.find((item) => item.id === binding.paneId);
  const agent = pane?.agent;
  if (agent?.kind === binding.kind && agent.instanceId === binding.lastInstanceId) {
    binding.lastInstanceId = agent.instanceId;
    if (
      pane?.agentSession?.kind === binding.kind &&
      verified(pane.id, agent.instanceId, pane.agentSession.sessionId)
    )
      binding.sessionId = pane.agentSession.sessionId;
  }
  return binding;
}
