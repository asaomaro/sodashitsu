import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { NoticeFeed, agentRoster } from "./noticeFeed.js";

function fixture() {
  const ids = {
    workspace: randomUUID(),
    tab: randomUUID(),
    pane: randomUUID(),
    agent: randomUUID(),
  };
  const agent = {
    instanceId: ids.agent,
    state: "working",
    completionSeq: 0,
    serverSeenSeq: 0,
    since: 10,
  };
  const pane = { id: ids.pane, tabId: ids.tab, label: "worker", title: "", agent };
  const snapshot = {
    workspaces: [{ id: ids.workspace, label: "操舵室" }],
    tabs: [{ id: ids.tab, workspaceId: ids.workspace, label: "main" }],
    panes: [pane],
  };
  const changed = vi.fn();
  const feed = new NoticeFeed("https://soda.test", changed, () => 123);
  return { ids, agent, pane, snapshot, changed, feed };
}
it("waits for authoritative shared state and announces attention in words without a model", () => {
  const { agent, pane, snapshot, changed, feed } = fixture();
  agent.state = "blocked";
  feed.snapshot(snapshot);
  expect(changed).not.toHaveBeenCalled();
  feed.shared({ notices: [] });
  expect(feed.notices).toHaveLength(1);
  expect(feed.notices[0]).toMatchObject({
    kind: "attention",
    message: expect.stringContaining("から確認の依頼です。"),
    source: { paneId: pane.id, agentInstanceId: agent.instanceId },
  });
  expect(changed).toHaveBeenLastCalledWith(feed.notices, true);
  const copy = feed.notices;
  copy[0]!.source.paneId = randomUUID();
  expect(feed.notices[0]!.source.paneId).toBe(pane.id);
});
it("suppresses resolved notices and reconnect duplicates", () => {
  const { agent, snapshot, feed } = fixture();
  agent.state = "blocked";
  feed.snapshot(snapshot);
  feed.shared({
    notices: [
      { paneId: snapshot.panes[0]!.id, key: `blocked:${agent.instanceId}:10`, status: "resolved" },
    ],
  });
  expect(feed.notices).toEqual([]);
  feed.snapshot(snapshot);
  feed.shared({ notices: [] });
  expect(feed.notices).toEqual([]);
});
it("announces unread completion once, then invalidates a replaced source instead of redirecting", () => {
  const { agent, ids, snapshot, changed, feed } = fixture();
  feed.snapshot(snapshot);
  feed.shared({ notices: [] });
  const done = { ...agent, state: "idle", completionSeq: 1 };
  feed.event({ event: "pane.agent_status_changed", data: { paneId: ids.pane, agent: done } });
  expect(feed.notices[0]!.message).toContain("作業が完了しました");
  const originalId = feed.notices[0]!.id;
  feed.event({ event: "pane.agent_status_changed", data: { paneId: ids.pane, agent: done } });
  expect(changed).toHaveBeenLastCalledWith(feed.notices, false);
  expect(feed.notices[0]!.id).toBe(originalId);
  feed.event({
    event: "pane.agent_status_changed",
    data: { paneId: ids.pane, agent: { ...agent, instanceId: randomUUID() } },
  });
  expect(feed.notices).toEqual([]);
});
it("drops attention after it resolves and completion after it is seen", () => {
  const { agent, ids, snapshot, feed } = fixture();
  agent.state = "blocked";
  feed.snapshot(snapshot);
  feed.shared({ notices: [] });
  feed.event({
    event: "pane.agent_status_changed",
    data: { paneId: ids.pane, agent: { ...agent, state: "working" } },
  });
  expect(feed.notices).toEqual([]);
  feed.event({
    event: "pane.agent_status_changed",
    data: { paneId: ids.pane, agent: { ...agent, state: "idle", completionSeq: 1 } },
  });
  expect(feed.notices).toHaveLength(1);
  feed.event({
    event: "pane.agent_status_changed",
    data: {
      paneId: ids.pane,
      agent: { ...agent, state: "idle", completionSeq: 1, serverSeenSeq: 1 },
    },
  });
  expect(feed.notices).toEqual([]);
});
it("drops notices when their pane or parent closes", () => {
  for (const parent of ["pane", "tab", "workspace"]) {
    const { agent, ids, snapshot, feed } = fixture();
    agent.state = "blocked";
    feed.snapshot(snapshot);
    feed.shared({ notices: [] });
    feed.event({
      event: `${parent}.closed`,
      data: { [`${parent}Id`]: ids[parent as "pane" | "tab" | "workspace"] },
    });
    expect(feed.notices).toEqual([]);
  }
});
it("bounds history without repeatedly reannouncing more than 512 live agents", () => {
  const { snapshot, changed, feed, agent, ids } = fixture();
  snapshot.panes = Array.from({ length: 600 }, () => ({
    id: randomUUID(),
    tabId: ids.tab,
    label: "worker",
    title: "",
    agent: { ...agent, instanceId: randomUUID(), state: "blocked" },
  }));
  feed.snapshot(snapshot);
  feed.shared({ notices: [] });
  expect(feed.notices).toHaveLength(32);
  feed.snapshot(snapshot);
  feed.shared({ notices: [] });
  expect(changed).toHaveBeenLastCalledWith(feed.notices, false);
  expect(feed.notices).toHaveLength(32);
});

it("does not announce an old completion while working or unknown, and retires it on work restart", () => {
  for (const state of ["working", "unknown"]) {
    const f = fixture();
    f.agent.state = state;
    f.agent.completionSeq = 1;
    f.feed.snapshot(f.snapshot);
    f.feed.shared({ notices: [] });
    expect(f.feed.notices).toEqual([]);
  }
  const f = fixture();
  f.agent.state = "idle";
  f.agent.completionSeq = 1;
  f.feed.snapshot(f.snapshot);
  f.feed.shared({ notices: [] });
  expect(f.feed.notices).toHaveLength(1);
  f.feed.event({
    event: "pane.agent_status_changed",
    data: { paneId: f.ids.pane, agent: { ...f.agent, state: "working" } },
  });
  expect(f.feed.notices).toEqual([]);
});
it("expires an older event when the next completion or blocked state was already resolved", () => {
  for (const attention of [false, true]) {
    const f = fixture();
    f.agent.state = attention ? "blocked" : "idle";
    f.agent.completionSeq = 1;
    f.feed.snapshot(f.snapshot);
    f.feed.shared({ notices: [] });
    expect(f.feed.notices).toHaveLength(1);
    f.agent.completionSeq = 2;
    f.agent.since = 20;
    f.feed.snapshot(f.snapshot);
    const key = attention ? `blocked:${f.ids.agent}:20` : `done:${f.ids.agent}:2`;
    f.feed.shared({ notices: [{ paneId: f.ids.pane, key, status: "resolved" }] });
    expect(f.feed.notices).toEqual([]);
  }
});

it("keeps a shared deferred notice in the inbox without automatically reopening it", () => {
  const f = fixture();
  f.agent.state = "blocked";
  const key = `blocked:${f.ids.agent}:10`;
  f.feed.snapshot(f.snapshot);
  f.feed.shared({ notices: [{ paneId: f.ids.pane, key, status: "deferred" }] });
  expect(f.feed.notices).toHaveLength(1);
  expect(f.changed).toHaveBeenLastCalledWith(f.feed.notices, false);
  f.feed.shared({ notices: [{ paneId: f.ids.pane, key, status: "resolved" }] });
  expect(f.feed.notices).toEqual([]);
});

it("announces exact forms while working, removes closed forms and avoids reconnect announcements", () => {
  const f = fixture(),
    askId = randomUUID();
  f.feed.snapshot(f.snapshot);
  f.feed.shared({ notices: [] });
  f.feed.event({ event: "ask.opened", data: { askId, paneId: f.ids.pane } });
  expect(f.feed.notices[0]).toMatchObject({
    kind: "question",
    key: `ask:${askId}`,
    source: { paneId: f.ids.pane },
  });
  expect(f.changed).toHaveBeenLastCalledWith(f.feed.notices, true);
  f.feed.snapshot(f.snapshot);
  f.feed.shared({ notices: [] });
  f.feed.questions({ asks: [{ askId, paneId: f.ids.pane }] });
  expect(f.changed).toHaveBeenLastCalledWith(f.feed.notices, false);
  f.feed.event({ event: "ask.closed", data: { askId, paneId: f.ids.pane } });
  f.feed.questions({ asks: [{ askId, paneId: f.ids.pane }] });
  expect(f.feed.notices).toEqual([]);
});

it("preserves a pushed new form against an older subscribe snapshot", () => {
  const f = fixture(),
    askId = "a".repeat(32);
  f.feed.snapshot(f.snapshot);
  f.feed.shared({ notices: [] });
  f.feed.event({ event: "ask.opened", data: { askId, paneId: f.ids.pane } });
  f.feed.questions({ asks: [] });
  expect(f.feed.notices).toEqual([
    expect.objectContaining({ key: `ask:${askId}`, kind: "question" }),
  ]);
});

it("does not rebind a pending form to a replacement agent", () => {
  const f = fixture(),
    askId = "a".repeat(32);
  f.feed.snapshot(f.snapshot);
  f.feed.shared({ notices: [] });
  f.feed.event({ event: "ask.opened", data: { askId, paneId: f.ids.pane } });
  f.feed.event({
    event: "pane.agent_status_changed",
    data: { paneId: f.ids.pane, agent: { ...f.agent, instanceId: randomUUID() } },
  });
  expect(f.feed.notices).toEqual([]);
});

it("keeps UUID workspace form notifications when legacy entities share the snapshot and event stream", () => {
  const f = fixture(),
    askId = randomUUID();
  const legacyTab = { id: randomUUID(), workspaceId: "w3", label: "legacy" };
  const legacyPane = { ...f.pane, id: randomUUID(), tabId: legacyTab.id };
  f.feed.snapshot({
    workspaces: [{ id: "w3", label: "legacy" }, ...f.snapshot.workspaces],
    tabs: [legacyTab, ...f.snapshot.tabs],
    panes: [legacyPane, ...f.snapshot.panes],
  });
  f.feed.shared({ notices: [] });
  f.feed.questions({
    asks: [
      { askId, paneId: f.ids.pane },
      { askId: randomUUID(), paneId: legacyPane.id },
    ],
  });
  expect(f.feed.notices).toEqual([
    expect.objectContaining({
      kind: "question",
      key: `ask:${askId}`,
      source: expect.objectContaining({ workspaceId: f.ids.workspace, paneId: f.ids.pane }),
    }),
  ]);
  const original = f.feed.notices[0]!.id;
  f.feed.event({
    event: "workspace.updated",
    data: { workspace: { id: "w3", label: "old changed" } },
  });
  f.feed.event({ event: "tab.updated", data: { tab: legacyTab } });
  f.feed.event({ event: "workspace.closed", data: { workspaceId: "w3" } });
  expect(f.feed.notices[0]!.id).toBe(original);
});

it("retires an actionable source when an updated entity is no longer valid", () => {
  for (const entity of ["pane", "tab", "workspace"] as const) {
    const f = fixture();
    f.agent.state = "blocked";
    f.feed.snapshot(f.snapshot);
    f.feed.shared({ notices: [] });
    expect(f.feed.notices).toHaveLength(1);
    const current =
      entity === "pane" ? f.pane : entity === "tab" ? f.snapshot.tabs[0] : f.snapshot.workspaces[0];
    f.feed.event({
      event: `${entity}.updated`,
      data: { [entity]: { ...current, label: "x".repeat(5000) } },
    });
    expect(f.feed.notices).toEqual([]);
  }
});

it("keeps snapshot bounds while excluding invalid identities", () => {
  const f = fixture();
  expect(() =>
    f.feed.snapshot({
      ...f.snapshot,
      workspaces: Array.from({ length: 4097 }, () => ({ id: "w3", label: "old" })),
    }),
  ).toThrow();
  expect(() => f.feed.snapshot({ ...f.snapshot, tabs: null })).toThrow();
});

it("identifies the named agent and previews form questions and the latest response", () => {
  const { feed, snapshot, agent, pane } = fixture();
  Object.assign(agent, { kind: "codex", label: "Codex", name: "実装担当" });
  agent.state = "blocked";
  feed.snapshot(snapshot);
  feed.shared({ notices: [] });
  const notice = feed.notices[0]!;
  expect(notice.title).toContain(`実装担当 (${agent.instanceId.slice(0, 8)})`);
  feed.details(notice.id, {
    nextOffset: null,
    messages: [{ role: "assistant", text: "変更を適用しますか？" }],
  });
  expect(feed.notices[0]!.message).toContain("直近の応答：変更を適用しますか？");
  feed.questions({
    asks: [
      {
        askId: "content-form",
        paneId: pane.id,
        spec: { title: "公開先の選択", questions: [{ label: "どの環境に公開しますか？" }] },
      },
    ],
  });
  expect(feed.notices.find((n) => n.kind === "question")!.message).toContain(
    "質問内容：公開先の選択 / どの環境に公開しますか？",
  );
  feed.event({
    event: "pane.agent_status_changed",
    data: { paneId: pane.id, agent: { ...agent, instanceId: randomUUID() } },
  });
  feed.details(notice.id, {
    nextOffset: null,
    messages: [{ role: "assistant", text: "別の作業" }],
  });
  expect(feed.notices.every((n) => n.id !== notice.id && !n.message.includes("別の作業"))).toBe(
    true,
  );
});

it("lists active agents without waiting for notifications and follows state and lifecycle events", () => {
  const { feed, snapshot, agent, pane, ids, changed } = fixture();
  Object.assign(agent, { kind: "codex", name: "実装担当" });
  feed.snapshot(snapshot);
  expect(feed.agents).toEqual([]);
  feed.shared({ notices: [] });
  expect(feed.notices).toEqual([]);
  expect(feed.agents).toEqual([
    expect.objectContaining({
      title: expect.stringContaining("実装担当"),
      state: "working",
      source: expect.objectContaining({ paneId: pane.id, agentInstanceId: agent.instanceId }),
    }),
  ]);
  const rows = feed.agents;
  rows[0]!.source.paneId = "changed";
  expect(feed.agents[0]!.source.paneId).toBe(pane.id);
  feed.event({
    event: "pane.agent_status_changed",
    data: { paneId: pane.id, agent: { ...agent, state: "idle" } },
  });
  expect(feed.agents[0]!.state).toBe("idle");
  expect(changed).toHaveBeenLastCalledWith([], false);
  feed.event({ event: "workspace.closed", data: { workspaceId: ids.workspace } });
  expect(feed.agents).toEqual([]);
});
it("orders active work first and bounds the renderer roster while keeping totals", () => {
  const { feed, snapshot, agent } = fixture();
  agent.state = "idle";
  feed.snapshot(snapshot);
  feed.shared({ notices: [] });
  const row = feed.agents[0]!;
  const rows = Array.from({ length: 300 }, (_, i) => ({
    ...row,
    state: i === 299 ? ("working" as const) : ("idle" as const),
    title: String(i),
  }));
  const roster = agentRoster(rows);
  expect(roster.total).toBe(300);
  expect(roster.working).toBe(1);
  expect(roster.agents).toHaveLength(256);
  expect(roster.agents[0]!.state).toBe("working");
  expect(rows[0]!.state).toBe("idle");
});
