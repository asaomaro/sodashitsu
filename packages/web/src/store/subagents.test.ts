import type { AgentInfo, Pane, SessionSnapshot, Tab, Workspace } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { lookupAgent, lookupPaneName } from "./subagents.js";
import { useMachinesStore } from "./machines.js";
import { useSessionStore } from "./session.js";

// 20261004-subagent-display。一覧の対象は `{machineId, paneId}`。pane の ID はマシンをまたいで衝突するので、取り違えない。
beforeEach(() => setActivePinia(createPinia()));

const subs = (...ids: string[]) => ({ count: ids.length, items: ids.map((id) => ({ id, startedAt: 1 })) });
const agent = (over: Partial<AgentInfo> = {}): AgentInfo => ({
  instanceId: "a1",
  kind: "claude",
  label: "Claude Code",
  state: "working",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
  ...over,
});
const ws: Workspace = { id: "w1", label: "w1", cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: null, autoLabel: false };
const tab: Tab = { id: "t1", workspaceId: "w1", label: "t1", layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null };
const pane = (a: AgentInfo | null, over: Partial<Pane> = {}): Pane => ({
  id: "p1",
  tabId: "t1",
  label: null,
  cwd: "/",
  shell: "/bin/bash",
  cols: 80,
  rows: 24,
  status: "running",
  failure: null,
  busy: false,
  title: "",
  rightClick: "herdr",
  agent: a,
  agentSession: null,
  ...over,
});
const remoteSnap = (a: AgentInfo | null, over: Partial<Pane> = {}): SessionSnapshot => ({
  protocol: 1,
  serverVersion: "t",
  host: { os: "linux", windowsBuild: null, hostname: "remote" },
  workspaces: [ws],
  tabs: [tab],
  panes: [pane(a, over)],
  focus: { workspaceId: "w1", tabId: "t1", paneId: "p1" },
} as unknown as SessionSnapshot);

describe("lookupAgent / lookupPaneName", () => {
  it("選んでいるマシンの pane は session のストアから引く", () => {
    const session = useSessionStore();
    session.workspaceUpserted(ws);
    session.tabUpserted(tab);
    const a = agent({ subagents: subs("s1") });
    session.paneUpserted(pane(a, { label: "メイン" }));
    expect(lookupAgent({ machineId: "local", paneId: "p1" })).toEqual(a);
    expect(lookupPaneName({ machineId: "local", paneId: "p1" })).toBe("メイン");
  });

  it("選んでいないマシンの pane は、そのマシンの要約から引く", () => {
    const machines = useMachinesStore();
    const a = agent({ subagents: subs("r1", "r2") });
    machines.applySummarySnapshot("m2", remoteSnap(a, { label: "リモート" }));
    expect(lookupAgent({ machineId: "m2", paneId: "p1" })).toEqual(a);
    expect(lookupPaneName({ machineId: "m2", paneId: "p1" })).toBe("リモート");
  });

  it("pane の ID が衝突する 2 つのマシンで取り違えない（選んでいるのは local。m2 の p1 は m2 のもの）", () => {
    const session = useSessionStore();
    session.workspaceUpserted(ws);
    session.tabUpserted(tab);
    session.paneUpserted(pane(agent({ instanceId: "local-a", subagents: subs("L1") })));
    useMachinesStore().applySummarySnapshot("m2", remoteSnap(agent({ instanceId: "remote-a", subagents: subs("R1", "R2") })));
    expect(lookupAgent({ machineId: "local", paneId: "p1" })?.subagents?.count).toBe(1);
    expect(lookupAgent({ machineId: "m2", paneId: "p1" })?.subagents?.count).toBe(2);
    expect(lookupAgent({ machineId: "m2", paneId: "p1" })?.instanceId).toBe("remote-a");
  });

  it("選んでいるマシンが m2 に替わると、local は要約から・m2 は session から引く", () => {
    const machines = useMachinesStore();
    const session = useSessionStore();
    machines.applySummarySnapshot("local", remoteSnap(agent({ instanceId: "local-a" })));
    machines.select("m2");
    session.workspaceUpserted(ws);
    session.tabUpserted(tab);
    session.paneUpserted(pane(agent({ instanceId: "m2-a" })));
    expect(lookupAgent({ machineId: "m2", paneId: "p1" })?.instanceId).toBe("m2-a");
    expect(lookupAgent({ machineId: "local", paneId: "p1" })?.instanceId).toBe("local-a");
  });

  it("居ない pane・エージェントの居ない pane・要約の無いマシンは undefined。呼び名は pane <id>", () => {
    const session = useSessionStore();
    session.workspaceUpserted(ws);
    session.tabUpserted(tab);
    session.paneUpserted(pane(null));
    expect(lookupAgent({ machineId: "local", paneId: "p1" })).toBeUndefined();
    expect(lookupAgent({ machineId: "local", paneId: "nope" })).toBeUndefined();
    expect(lookupAgent({ machineId: "ghost", paneId: "p1" })).toBeUndefined();
    expect(lookupPaneName({ machineId: "local", paneId: "nope" })).toBe("pane nope");
    expect(lookupPaneName({ machineId: "ghost", paneId: "p1" })).toBe("pane p1");
  });

  it("subagents の無い（古いサーバの）エージェントでも引ける。subagents は undefined", () => {
    useMachinesStore().applySummarySnapshot("m2", remoteSnap(agent()));
    expect(lookupAgent({ machineId: "m2", paneId: "p1" })?.subagents).toBeUndefined();
  });

  it("別のマシンの要約は、pane.agent_status_changed で subagents が更新される", () => {
    const machines = useMachinesStore();
    machines.applySummarySnapshot("m2", remoteSnap(agent()));
    machines.applySummaryEvent("m2", { event: "pane.agent_status_changed", data: { paneId: "p1", agent: agent({ subagents: subs("x") }) } });
    expect(lookupAgent({ machineId: "m2", paneId: "p1" })?.subagents?.count).toBe(1);
  });
});
