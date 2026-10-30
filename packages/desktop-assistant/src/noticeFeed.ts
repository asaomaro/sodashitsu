import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AssistantNotice, desktopAssistantOrigin } from "@sodashitsu/protocol";

const Agent = z.object({
  instanceId: z.uuid(),
  state: z.enum(["blocked", "working", "idle", "unknown"]),
  completionSeq: z.number().int().nonnegative(),
  serverSeenSeq: z.number().int().nonnegative(),
  since: z.number().int().nonnegative(),
});
const Pane = z.object({
  id: z.uuid(),
  tabId: z.uuid(),
  label: z.string().max(1024).nullable(),
  title: z.string().max(4096),
  agent: Agent.nullable(),
});
const Tab = z.object({ id: z.uuid(), workspaceId: z.uuid(), label: z.string().max(1024) });
const Workspace = z.object({ id: z.uuid(), label: z.string().max(1024) });
const Snapshot = z.object({
  panes: z.array(Pane).max(4096),
  tabs: z.array(Tab).max(4096),
  workspaces: z.array(Workspace).max(4096),
});
const Shared = z.object({
  notices: z
    .array(
      z.object({
        paneId: z.uuid(),
        key: z.string().max(200),
        status: z.enum(["deferred", "resolved"]),
      }),
    )
    .max(512),
});
type FeedPane = z.infer<typeof Pane>;

/** Read-only projection. Formatting notices never calls a model or writes to a terminal. */
export class NoticeFeed {
  private panes = new Map<string, FeedPane>();
  private tabs = new Map<string, z.infer<typeof Tab>>();
  private workspaces = new Map<string, z.infer<typeof Workspace>>();
  private resolved = new Set<string>();
  private deferred = new Set<string>();
  private seen = new Map<
    string,
    { instanceId: string; completionSeq: number; blockedSince: number | null }
  >();
  private pending = new Map<string, AssistantNotice>();
  private ready = false;
  readonly origin: string;
  constructor(
    origin: string,
    private readonly changed: (notices: readonly AssistantNotice[], added: boolean) => void,
    private readonly now = Date.now,
    private readonly machineId = "local",
  ) {
    this.origin = desktopAssistantOrigin(origin);
  }

  get notices(): AssistantNotice[] {
    return structuredClone([...this.pending.values()]);
  }

  snapshot(input: unknown): void {
    const snapshot = Snapshot.parse(input);
    this.panes = new Map(snapshot.panes.map((pane) => [pane.id, pane]));
    this.tabs = new Map(snapshot.tabs.map((tab) => [tab.id, tab]));
    this.workspaces = new Map(snapshot.workspaces.map((workspace) => [workspace.id, workspace]));
    this.ready = false;
    this.prune();
  }

  shared(input: unknown): void {
    const state = Shared.parse(input);
    for (const entry of state.notices)
      if (entry.status === "resolved") {
        this.resolved.add(entry.key);
        this.deferred.delete(entry.key);
        this.pending.delete(entry.key);
        while (this.resolved.size > 512) this.resolved.delete(this.resolved.values().next().value!);
      } else if (!this.resolved.has(entry.key)) {
        this.deferred.add(entry.key);
        while (this.deferred.size > 512) this.deferred.delete(this.deferred.values().next().value!);
      }
    this.ready = true;
    let added = false;
    for (const pane of this.panes.values()) added = this.consider(pane) || added;
    this.changed(this.notices, added);
  }

  event(input: unknown): void {
    const envelope = z.object({ event: z.string(), data: z.unknown() }).parse(input);
    const data = envelope.data;
    switch (envelope.event) {
      case "notification.changed":
        this.shared(data);
        return;
      case "pane.created":
      case "pane.updated": {
        const { pane } = z.object({ pane: Pane }).parse(data);
        if (this.panes.has(pane.id) || this.panes.size < 4096) this.panes.set(pane.id, pane);
        break;
      }
      case "pane.agent_status_changed": {
        const update = z.object({ paneId: z.uuid(), agent: Agent.nullable() }).parse(data);
        const pane = this.panes.get(update.paneId);
        if (pane) this.panes.set(pane.id, { ...pane, agent: update.agent });
        break;
      }
      case "pane.closed":
        this.panes.delete(z.object({ paneId: z.uuid() }).parse(data).paneId);
        break;
      case "tab.created":
      case "tab.updated":
      case "layout.updated": {
        const { tab } = z.object({ tab: Tab }).parse(data);
        if (this.tabs.has(tab.id) || this.tabs.size < 4096) this.tabs.set(tab.id, tab);
        break;
      }
      case "tab.closed":
        this.tabs.delete(z.object({ tabId: z.uuid() }).parse(data).tabId);
        break;
      case "workspace.created":
      case "workspace.updated": {
        const { workspace } = z.object({ workspace: Workspace }).parse(data);
        if (this.workspaces.has(workspace.id) || this.workspaces.size < 4096)
          this.workspaces.set(workspace.id, workspace);
        break;
      }
      case "workspace.closed":
        this.workspaces.delete(z.object({ workspaceId: z.uuid() }).parse(data).workspaceId);
        break;
      default:
        return;
    }
    this.prune();
    if (!this.ready) return;
    let added = false;
    for (const pane of this.panes.values()) added = this.consider(pane) || added;
    this.changed(this.notices, added);
  }

  private prune(): void {
    for (const id of this.seen.keys()) if (!this.panes.has(id)) this.seen.delete(id);
    for (const [key, notice] of this.pending) {
      const pane = this.panes.get(notice.source.paneId);
      const tab = pane && this.tabs.get(pane.tabId);
      if (
        !pane?.agent ||
        pane.agent.instanceId !== notice.source.agentInstanceId ||
        tab?.workspaceId !== notice.source.workspaceId ||
        !this.workspaces.has(notice.source.workspaceId) ||
        notice.key !==
          (notice.kind === "attention"
            ? `blocked:${pane.agent.instanceId}:${pane.agent.since}`
            : `done:${pane.agent.instanceId}:${pane.agent.completionSeq}`) ||
        (notice.kind === "attention" && pane.agent.state !== "blocked") ||
        (notice.kind === "done" &&
          (pane.agent.state !== "idle" || pane.agent.serverSeenSeq >= pane.agent.completionSeq))
      )
        this.pending.delete(key);
    }
  }
  private consider(pane: FeedPane): boolean {
    const agent = pane.agent;
    if (!agent) return false;
    const tab = this.tabs.get(pane.tabId);
    const workspace = tab && this.workspaces.get(tab.workspaceId);
    if (!workspace) return false;
    const attention = agent.state === "blocked";
    if (!attention && agent.state !== "idle") return false;
    if (!attention && agent.completionSeq <= agent.serverSeenSeq) return false;
    const key = attention
      ? `blocked:${agent.instanceId}:${agent.since}`
      : `done:${agent.instanceId}:${agent.completionSeq}`;
    const seen = this.seen.get(pane.id);
    const same = seen?.instanceId === agent.instanceId;
    const already =
      same &&
      (attention ? seen.blockedSince === agent.since : seen.completionSeq >= agent.completionSeq);
    this.seen.set(pane.id, {
      instanceId: agent.instanceId,
      completionSeq: Math.max(same ? seen.completionSeq : 0, agent.completionSeq),
      blockedSince: attention ? agent.since : same ? seen.blockedSince : null,
    });
    if (already || this.resolved.has(key)) return false;
    for (const [oldKey, old] of this.pending)
      if (old.source.paneId === pane.id) this.pending.delete(oldKey);
    const title =
      `${workspace.label} / ${pane.label || pane.title || tab?.label || "エージェント"}`.slice(
        0,
        160,
      );
    const notice = AssistantNotice.parse({
      id: randomUUID(),
      key,
      kind: attention ? "attention" : "done",
      source: {
        serverOrigin: this.origin,
        machineId: this.machineId,
        workspaceId: workspace.id,
        paneId: pane.id,
        agentInstanceId: agent.instanceId,
      },
      title,
      message: attention
        ? `「${title}」から確認の依頼です。操舵室で内容を確認してください。`
        : `「${title}」の作業が完了しました。`,
      at: this.now(),
    });
    this.pending.set(key, notice);
    while (this.pending.size > 32) this.pending.delete(this.pending.keys().next().value!);
    // "後で" is shared with the normal Soda UI: retain the inbox entry without reopening a bubble.
    return !this.deferred.has(key);
  }
}
