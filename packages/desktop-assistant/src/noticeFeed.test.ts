import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { NoticeFeed } from "./noticeFeed.js";

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
    message: "「操舵室 / worker」から確認の依頼です。操舵室で内容を確認してください。",
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
