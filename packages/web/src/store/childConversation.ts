import { defineStore } from "pinia";
import { ref } from "vue";
import { useSessionStore } from "./session.js";
import { useMachinesStore } from "./machines.js";
import { useViewStore } from "./view.js";
/** A child belongs to its exact parent session, never to a standalone terminal pane. */
export const useChildConversationStore = defineStore("childConversation", () => {
  const target = ref<{
    paneId: string;
    agentId: string;
    scope: string;
    parentName: string;
    childName: string;
    readable: boolean;
  } | null>(null);
  const session = useSessionStore(),
    machines = useMachinesStore(),
    view = useViewStore();
  function scope(paneId: string): string | null {
    const p = session.panes.get(paneId),
      a = p?.agent,
      r = p?.agentSession;
    if (
      view.connectionState !== "open" ||
      !a ||
      !r ||
      r.kind !== a.kind ||
      !r.sessionId ||
      !session.clientId
    )
      return null;
    return JSON.stringify([
      machines.selectedId,
      session.clientId,
      view.connectionState,
      paneId,
      a.instanceId,
      a.kind,
      a.verified,
      r.kind,
      r.sessionId,
    ]);
  }
  function open(paneId: string, agentId: string): void {
    const p = session.panes.get(paneId),
      s = scope(paneId),
      child = p?.agent?.subagents?.items.slice(0, 64).find((c) => c.id === agentId);
    if (s === null || !p?.agent || !child) return;
    target.value = {
      paneId,
      agentId,
      scope: s,
      parentName: p.agent.name || p.label || p.agent.label,
      readable: child.hasTranscript === true,
      childName: child.description?.trim() || child.type?.trim() || "サブエージェント",
    };
  }
  function close(): void {
    target.value = null;
  }
  return { target, scope, open, close };
});
