import type { AgentInfo, SessionSnapshot, Workspace } from "@wtm/protocol";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import type { WebSocketLike } from "../net/Connection.js";
import { MachineSummaryClient } from "../net/MachineSummaryClient.js";
import { LOCAL_MACHINE_ID, wsUrlFor } from "../net/machineUrl.js";
import { useMachinesStore } from "./machines.js";

/** マシンの一覧・選択・要約（20260927-multi-host-machines の T12）。 */
let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

const ws = (id: string, label = id): Workspace => ({
  id,
  label,
  cwd: "/",
  tabIds: [`t${id}`],
  activeTabId: `t${id}`,
  groupId: null,
  git: null,
  autoLabel: false,
});
const agent = (over: Partial<AgentInfo> = {}): AgentInfo => ({
  instanceId: "a1",
  kind: "claude",
  label: "Claude",
  state: "blocked",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
  ...over,
});
const snap = (): SessionSnapshot => ({
  protocol: 1,
  serverVersion: "t",
  host: { os: "linux", windowsBuild: null, hostname: "remote" },
  workspaces: [ws("w1", "api"), ws("w2", "web")],
  tabs: [
    {
      id: "tw1",
      workspaceId: "w1",
      label: "t",
      layout: { type: "pane", paneId: "p1" },
      focusedPaneId: "p1",
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    },
    {
      id: "tw2",
      workspaceId: "w2",
      label: "t",
      layout: { type: "pane", paneId: "p2" },
      focusedPaneId: "p2",
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    },
  ],
  panes: [
    {
      id: "p1",
      tabId: "tw1",
      label: null,
      cwd: "/",
      shell: "sh",
      cols: 80,
      rows: 24,
      status: "running",
      failure: null,
      busy: false,
      title: "",
      rightClick: "herdr",
      agent: agent(),
      agentSession: null,
    },
    {
      id: "p2",
      tabId: "tw2",
      label: null,
      cwd: "/",
      shell: "sh",
      cols: 80,
      rows: 24,
      status: "running",
      failure: null,
      busy: false,
      title: "",
      rightClick: "herdr",
      agent: null,
      agentSession: null,
    },
  ],
  groups: [],
  focus: null,
  limits: { scrollbackLines: 5000 },
});

describe("wsUrlFor", () => {
  it("ローカルは /ws そのもの、ほかは ?machine=（符号化）", () => {
    expect(wsUrlFor("ws://h/ws", LOCAL_MACHINE_ID)).toBe("ws://h/ws");
    expect(wsUrlFor("ws://h/ws", "Build box")).toBe("ws://h/ws?machine=Build%20box");
  });
});

describe("store/machines", () => {
  it("有効なマシンが無ければ hasMachines は偽。まとまりはローカルが先頭、登録の順", () => {
    const m = useMachinesStore(pinia);
    expect(m.hasMachines).toBe(false);
    m.setMachines([
      { id: "b", label: "GPU", state: "online", message: null },
      { id: "a", label: "Build", state: "attention", message: "x" },
    ]);
    expect(m.hasMachines).toBe(true);
    expect(m.sections.map((s) => s.label)).toEqual(["ローカル", "GPU", "Build"]);
  });

  it("要約: snapshot とイベントで workspace とエージェントを保ち、workspace ごとのエージェントを引ける", () => {
    const m = useMachinesStore(pinia);
    m.applySummarySnapshot("b", snap());
    expect(m.summaries["b"]!.workspaces.map((w) => w.label)).toEqual(["api", "web"]);
    expect(m.agentsInWorkspace("b", "w1").map((a) => a.state)).toEqual(["blocked"]);
    m.applySummaryEvent("b", {
      event: "pane.agent_status_changed",
      data: { paneId: "p1", agent: agent({ state: "working" }) },
    });
    expect(m.agentsInWorkspace("b", "w1").map((a) => a.state)).toEqual(["working"]);
    m.applySummaryEvent("b", { event: "workspace.created", data: { workspace: ws("w3", "new") } });
    m.applySummaryEvent("b", {
      event: "workspace.order_changed",
      data: { workspaceIds: ["w3", "w1", "w2"] },
    });
    expect(m.summaries["b"]!.workspaces.map((w) => w.id)).toEqual(["w3", "w1", "w2"]);
    m.applySummaryEvent("b", { event: "workspace.updated", data: { workspace: ws("w1", "api2") } });
    m.applySummaryEvent("b", { event: "workspace.closed", data: { workspaceId: "w2" } });
    expect(m.summaries["b"]!.workspaces.map((w) => w.label)).toEqual(["new", "api2"]);
    m.applySummaryEvent("b", { event: "pane.closed", data: { paneId: "p1" } });
    expect(m.agentsInWorkspace("b", "w1")).toEqual([]);
    // 知らないマシン・関係ないイベントは何もしない
    m.applySummaryEvent("zzz", { event: "workspace.closed", data: { workspaceId: "w1" } });
    m.applySummaryEvent("b", { event: "session.focus_changed", data: { focus: null } });
  });

  it("要約: tab・pane の作成・更新・削除で対応を更新し、並びの知らない id は無視して漏れた workspace は後ろに残す", () => {
    const m = useMachinesStore(pinia);
    m.applySummarySnapshot("b", snap());
    m.applySummaryEvent("b", {
      event: "tab.created",
      data: {
        tab: {
          id: "tx",
          workspaceId: "w2",
          label: "x",
          layout: { type: "pane", paneId: "px" },
          focusedPaneId: "px",
          zoomedPaneId: null,
          sizeOwnerClientId: null,
        },
      },
    });
    m.applySummaryEvent("b", {
      event: "pane.created",
      data: {
        pane: { ...snap().panes[0]!, id: "px", tabId: "tx", agent: agent({ instanceId: "a9" }) },
      },
    });
    expect(m.agentsInWorkspace("b", "w2").map((a) => a.instanceId)).toEqual(["a9"]);
    m.applySummaryEvent("b", {
      event: "pane.updated",
      data: { pane: { ...snap().panes[0]!, id: "px", tabId: "tx", agent: null } },
    });
    expect(m.agentsInWorkspace("b", "w2")).toEqual([]);
    m.applySummaryEvent("b", {
      event: "tab.updated",
      data: {
        tab: {
          id: "tw1",
          workspaceId: "w2",
          label: "t",
          layout: { type: "pane", paneId: "p1" },
          focusedPaneId: "p1",
          zoomedPaneId: null,
          sizeOwnerClientId: null,
        },
      },
    });
    expect(m.agentsInWorkspace("b", "w2").map((a) => a.instanceId)).toEqual(["a1"]); // tw1 が w2 へ（p1 のエージェント）
    m.applySummaryEvent("b", { event: "tab.closed", data: { tabId: "tw1" } });
    expect(m.agentsInWorkspace("b", "w2")).toEqual([]);
    m.applySummaryEvent("b", {
      event: "workspace.order_changed",
      data: { workspaceIds: ["zz", "w2"] },
    });
    expect(m.summaries["b"]!.workspaces.map((w) => w.id)).toEqual(["w2", "w1"]);
  });

  it("isSelectable: 選んでいるマシンは真。ローカルは要約が繋がっていれば、ほかは online かつ要約が繋がっていれば", () => {
    const m = useMachinesStore(pinia);
    m.setMachines([{ id: "b", label: "GPU", state: "online", message: null }]);
    expect(m.isSelectable(LOCAL_MACHINE_ID)).toBe(true); // 選んでいる
    expect(m.isSelectable("b")).toBe(false); // 要約がまだ
    m.applySummarySnapshot("b", snap());
    expect(m.isSelectable("b")).toBe(true);
    m.setSummaryConnected("b", false);
    expect(m.isSelectable("b")).toBe(false);
    m.setSummaryConnected("b", true);
    m.setMachines([{ id: "b", label: "GPU", state: "reconnecting", message: null }]);
    expect(m.isSelectable("b")).toBe(false);
    m.select("b");
    expect(m.isSelectable(LOCAL_MACHINE_ID)).toBe(false); // ローカルの要約がまだ
    m.applySummarySnapshot(LOCAL_MACHINE_ID, snap());
    expect(m.isSelectable(LOCAL_MACHINE_ID)).toBe(true);
  });

  it("一覧から消えたマシンの要約・折りたたみは捨てる", () => {
    const m = useMachinesStore(pinia);
    m.setMachines([{ id: "b", label: "GPU", state: "online", message: null }]);
    m.applySummarySnapshot("b", snap());
    m.toggleCollapsed("b");
    expect(m.collapsed["b"]).toBe(true);
    m.setMachines([]);
    expect(m.summaries["b"]).toBeUndefined();
    expect(m.collapsed["b"]).toBeUndefined();
  });
});

class FakeWs implements WebSocketLike {
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(readonly url: string) {}
  send(d: string | Uint8Array): void {
    this.sent.push(String(d));
  }
  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  reply(result: unknown, index = 0): void {
    const id = (JSON.parse(this.sent[index]!) as { id: string }).id;
    this.onmessage?.({ data: JSON.stringify({ id, result }) });
  }
}

describe("MachineSummaryClient（T12）", () => {
  it("external で hello し、snapshot・イベントを渡す。購読・表示・入力は送らない。閉じたら 1 秒から倍々で繋ぎ直す。stop で止まる", async () => {
    const sockets: FakeWs[] = [];
    const timers: { fn: () => void; ms: number }[] = [];
    const log: string[] = [];
    const c = new MachineSummaryClient({
      wsUrl: "ws://h/ws?machine=b",
      onSnapshot: (s) => log.push(`snapshot:${s.host.hostname}`),
      onEvent: (e) => log.push(`event:${e.event}`),
      onConnected: (v) => log.push(`connected:${v}`),
      onOpened: () => log.push("opened"),
      createWebSocket: (url) => {
        const w = new FakeWs(url);
        sockets.push(w);
        return w;
      },
      setTimeoutFn: (fn, ms) => timers.push({ fn, ms }),
      clearTimeoutFn: () => undefined,
    });
    c.start();
    const w = sockets[0]!;
    expect(w.url).toBe("ws://h/ws?machine=b");
    w.open();
    expect(JSON.parse(w.sent[0]!)).toMatchObject({
      method: "client.hello",
      params: { protocol: 1, kind: "external" },
    });
    w.reply({ clientId: "c", snapshot: snap() });
    await Promise.resolve();
    await Promise.resolve();
    w.onmessage?.({
      data: JSON.stringify({ event: "workspace.closed", data: { workspaceId: "w1" } }),
    });
    w.onmessage?.({ data: new ArrayBuffer(4) });
    expect(log).toEqual(["snapshot:remote", "connected:true", "opened", "event:workspace.closed"]);
    expect(w.sent.map((s) => (JSON.parse(s) as { method: string }).method)).toEqual([
      "client.hello",
    ]);
    w.close();
    expect(log.at(-1)).toBe("connected:false");
    expect(timers.map((t) => t.ms)).toEqual([1000]);
    timers[0]!.fn();
    sockets[1]!.close(); // 開く前に閉じた
    expect(timers.map((t) => t.ms)).toEqual([1000, 2000]);
    c.stop();
    timers[1]!.fn();
    expect(sockets).toHaveLength(2);
  });

  it("閉じたら・stop したら待っている request を reject する。hello の途中の stop は何も知らせない。start の重ねは socket を増やさない", async () => {
    const sockets: FakeWs[] = [];
    const log: string[] = [];
    const c = new MachineSummaryClient({
      wsUrl: "ws://h/ws",
      onSnapshot: () => log.push("snapshot"),
      onEvent: () => undefined,
      onConnected: (v) => log.push(`connected:${v}`),
      createWebSocket: (url) => {
        const w = new FakeWs(url);
        sockets.push(w);
        return w;
      },
      setTimeoutFn: () => 0,
      clearTimeoutFn: () => undefined,
    });
    c.start();
    c.start();
    expect(sockets).toHaveLength(1);
    sockets[0]!.open();
    c.stop(); // hello の応答の前
    sockets[0]!.reply({ clientId: "c", snapshot: snap() });
    await Promise.resolve();
    expect(log).toEqual([]);
    c.start();
    sockets[1]!.open();
    sockets[1]!.reply({ clientId: "c", snapshot: snap() });
    await Promise.resolve();
    await Promise.resolve();
    const p = c.request("machine.list", {});
    sockets[1]!.close();
    await expect(p).rejects.toThrow(/closed/);
    expect(log).toEqual(["snapshot", "connected:true", "connected:false"]);
  });

  it("request は開いていなければ reject、応答は id で対応する", async () => {
    const sockets: FakeWs[] = [];
    const c = new MachineSummaryClient({
      wsUrl: "ws://h/ws",
      onSnapshot: () => undefined,
      onEvent: () => undefined,
      onConnected: () => undefined,
      createWebSocket: (url) => {
        const w = new FakeWs(url);
        sockets.push(w);
        return w;
      },
    });
    await expect(c.request("machine.list", {})).rejects.toThrow(/not connected/);
    c.start();
    sockets[0]!.open();
    const p = c.request("machine.list", {});
    sockets[0]!.reply({ machines: [] }, 1);
    await expect(p).resolves.toEqual({ machines: [] });
    c.stop();
  });
});
