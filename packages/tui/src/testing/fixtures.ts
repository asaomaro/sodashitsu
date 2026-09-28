import type {
  AgentInfo,
  LayoutNode,
  Pane,
  SessionSnapshot,
  Tab,
  Workspace,
} from "@sodashitsu/protocol";

export function pane(id: string, tabId: string, extra: Partial<Pane> = {}): Pane {
  return {
    id,
    tabId,
    label: null,
    cwd: "/",
    shell: "bash",
    cols: 80,
    rows: 24,
    status: "running",
    failure: null,
    busy: false,
    title: "",
    rightClick: "herdr",
    agent: null,
    agentSession: null,
    ...extra,
  };
}

export function tab(
  id: string,
  workspaceId: string,
  layout: LayoutNode,
  extra: Partial<Tab> = {},
): Tab {
  const first = firstLeaf(layout);
  return {
    id,
    workspaceId,
    label: id,
    layout,
    focusedPaneId: first,
    zoomedPaneId: null,
    sizeOwnerClientId: null,
    ...extra,
  };
}

export function workspace(id: string, tabIds: string[], extra: Partial<Workspace> = {}): Workspace {
  return {
    id,
    label: id,
    cwd: "/",
    tabIds,
    activeTabId: tabIds[0] ?? "",
    groupId: null,
    git: null,
    autoLabel: false,
    ...extra,
  };
}

export function agent(extra: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude",
    state: "idle",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
    ...extra,
  };
}

export const leaf = (paneId: string): LayoutNode => ({ type: "pane", paneId });
export const split = (
  dir: "right" | "down",
  a: LayoutNode,
  b: LayoutNode,
  ratio = 0.5,
  id = "s1",
): LayoutNode => ({
  type: "split",
  id,
  dir,
  ratio,
  a,
  b,
});

function firstLeaf(n: LayoutNode): string {
  return n.type === "pane" ? n.paneId : firstLeaf(n.a);
}

/** w1（t1: p1 | p2）と w2（t2: p3）。焦点は p1。 */
export function snapshot(extra: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    protocol: 1,
    serverVersion: "test",
    host: { os: "linux", windowsBuild: null, hostname: "h" },
    workspaces: [workspace("w1", ["t1"]), workspace("w2", ["t2"])],
    tabs: [tab("t1", "w1", split("right", leaf("p1"), leaf("p2"))), tab("t2", "w2", leaf("p3"))],
    panes: [pane("p1", "t1"), pane("p2", "t1"), pane("p3", "t2")],
    groups: [],
    focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
    limits: { scrollbackLines: 1000 },
    ...extra,
  };
}
