import type { AccountUsage, AgentInfo, AgentUsage, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useUsageStore } from "../store/usage.js";
import { useViewStore } from "../store/view.js";
import DashboardView from "./DashboardView.vue";

let pinia: Pinia;
const NOW = new Date("2026-10-10T03:00:00.000Z").getTime();
beforeEach(() => {
  pinia = createPinia();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "i", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: NOW - 120_000, ...over };
}
function pane(id: string, a: AgentInfo | null): Pane {
  return { id, tabId: "t1", label: null, cwd: `/work/${id}`, shell: "bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: a, agentSession: null };
}
const usage = (paneId: string, over: Partial<AgentUsage> = {}): AgentUsage => ({
  paneId,
  kind: "claude",
  model: "claude-sonnet-5-5",
  tokens: { basis: "transcript", input: 1000, output: 2345 },
  source: "transcript",
  updatedAt: NOW - 5_000,
  ...over,
});
const account = (over: Partial<AccountUsage> = {}): AccountUsage => ({
  kind: "claude",
  accountKey: "k1",
  label: "Claude Code",
  windows: [{ label: "5 時間", usedPct: 42.4, resetsAt: NOW + 130 * 60_000 }],
  source: "statusline",
  asOf: NOW - 180_000,
  ...over,
});

function setup(panes: Pane[]) {
  const session = useSessionStore(pinia);
  session.workspaceUpserted({ id: "w1", label: "repo", cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: { branch: "main" }, autoLabel: false } as unknown as Workspace);
  session.tabUpserted({ id: "t1", workspaceId: "w1", label: "main", layout: { type: "pane", paneId: panes[0]!.id }, focusedPaneId: panes[0]!.id, zoomedPaneId: null, sizeOwnerClientId: null } as Tab);
  for (const p of panes) session.paneUpserted(p);
  const requests: [string, unknown][] = [];
  const conn: ConnectionPort = {
    request: ((m: string, p: unknown) => {
      requests.push([m, p]);
      return Promise.resolve({});
    }) as never,
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
  const wrapper = mount(DashboardView, { props: { kind: "screen", active: true }, global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: conn } }, attachTo: document.body });
  return { wrapper, requests, usage: useUsageStore(pinia), view: useViewStore(pinia) };
}
const rowIds = (w: ReturnType<typeof setup>["wrapper"]) => w.findAll("[data-dash-row]").map((r) => r.attributes("data-dash-row"));

describe("DashboardView（20261010-agent-usage PR3）", () => {
  it("空のとき: エージェントが居ない表示と、アカウントの枠が無い表示（まだ値がありません）", () => {
    const { wrapper } = setup([pane("p1", null)]);
    expect(wrapper.find("[data-dash-empty]").exists()).toBe(true);
    expect(wrapper.find("[data-dash-row]").exists()).toBe(false); // エージェントの居ない pane は出ない
    expect(wrapper.get("[data-dash-no-accounts]").text()).toBe("まだ値がありません");
    expect(wrapper.find("[data-dash-loading]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("値のある行: 名前・種類・場所（ブランチ）・トークン（基準の印）・コスト・コンテキスト。値の無い項目は「—」", () => {
    const { wrapper, usage: store } = setup([pane("p1", agent({ name: "alpha", state: "working", subagents: { count: 2, items: [] } })), pane("p2", agent({ name: "beta", instanceId: "i2" }))]);
    store.setSnapshot({
      panes: { p1: usage("p1", { costUsd: 1.5, costBasis: "cost-state", costAsOf: NOW - 600_000, contextUsedPct: 41.6, tokens: { basis: "cumulative", total: 12_345 } }) },
      accounts: [],
    });
    return wrapper.vm.$nextTick().then(() => {
      const p1 = wrapper.get('[data-dash-row="p1"]');
      expect(p1.text()).toContain("alpha");
      expect(p1.text()).toContain("Claude Code");
      expect(p1.text()).toContain("repo / main");
      expect(p1.text()).toContain("（main）");
      expect(p1.text()).toContain("claude-sonnet-5-5");
      expect(p1.get("[data-dash-tokens]").text()).toContain("12.3k");
      expect(p1.get("[data-dash-tokens]").text()).toContain("累計");
      expect(p1.get("[data-dash-cost]").text()).toContain("$1.50");
      expect(p1.get("[data-dash-cost]").text()).toContain("10 分前の時点");
      expect(p1.get("[data-dash-context]").text()).toContain("42%");
      expect(p1.get('[role="progressbar"]').attributes("aria-valuenow")).toBe("42");
      expect(p1.find(".dash-c-sub").text()).toContain("2");
      // 値の無い pane
      const p2 = wrapper.get('[data-dash-row="p2"]');
      expect(p2.get("[data-dash-tokens]").text()).toContain("—");
      expect(p2.get("[data-dash-cost]").text()).toContain("—");
      expect(p2.get("[data-dash-context]").text()).toContain("—");
      expect(p2.find(".dash-c-model").text()).toContain("—");
      wrapper.unmount();
    });
  });

  it("基準の印: 記録に残る分は「記録分」（累計と書かない）。読み込み中・一部の印。古い値は薄く、時刻つき", async () => {
    const { wrapper, usage: store } = setup([pane("p1", agent({ name: "alpha" }))]);
    store.setSnapshot({ panes: { p1: usage("p1", { scanning: true, partial: true, updatedAt: NOW - 5 * 60_000 }) }, accounts: [] });
    await wrapper.vm.$nextTick();
    const row = wrapper.get('[data-dash-row="p1"]');
    const tokens = row.get("[data-dash-tokens]").text();
    expect(tokens).toContain("3.35k");
    expect(tokens).toContain("記録分");
    expect(tokens).not.toContain("累計");
    expect(tokens).toContain("読み込み中");
    expect(tokens).toContain("一部");
    expect(row.classes()).toContain("dash-stale");
    expect(tokens).toContain("5 分前");
    wrapper.unmount();
  });

  it("アカウントの枠: 使用率の棒（数字を併記）・リセットまでの時間・「N 分前」。リセットを過ぎた枠は「リセット済み」で薄く", async () => {
    const { wrapper, usage: store } = setup([pane("p1", agent())]);
    store.setSnapshot({
      panes: {},
      accounts: [account({ windows: [{ label: "5 時間", usedPct: 42.4, resetsAt: NOW + 130 * 60_000 }, { label: "週", usedPct: 80, resetsAt: NOW - 1000 }], plan: "Max" })],
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-dash-no-accounts]").exists()).toBe(false);
    const acc = wrapper.get("[data-dash-account]");
    expect(acc.text()).toContain("Claude Code");
    expect(acc.text()).toContain("Max");
    expect(acc.text()).toContain("3 分前");
    const wins = acc.findAll("[data-dash-window]");
    expect(wins[0]!.text()).toContain("42%");
    expect(wins[0]!.text()).toContain("あと 2 時間 10 分でリセット");
    expect(wins[0]!.get('[role="progressbar"]').attributes("aria-valuenow")).toBe("42");
    expect(wins[1]!.text()).toContain("リセット済み");
    expect(wins[1]!.classes()).toContain("dash-stale");
    expect(wins[1]!.get('[role="progressbar"]').attributes("aria-valuenow")).toBeUndefined();
    wrapper.unmount();
  });

  it("並べ替え（状態・名前・トークン・コスト）と、種類の絞り込み", async () => {
    const { wrapper, usage: store } = setup([
      pane("p1", agent({ name: "bravo", state: "working", instanceId: "i1" })),
      pane("p2", agent({ name: "alpha", state: "blocked", instanceId: "i2", kind: "codex" })),
      pane("p3", agent({ name: "charlie", state: "idle", instanceId: "i3" })),
    ]);
    store.setSnapshot({ panes: { p1: usage("p1", { costUsd: 9, tokens: { basis: "transcript", total: 10 } }), p3: usage("p3", { costUsd: 1, tokens: { basis: "transcript", total: 99 } }) }, accounts: [] });
    await wrapper.vm.$nextTick();
    expect(rowIds(wrapper)).toEqual(["p2", "p1", "p3"]); // 状態: 入力待ちが先
    await wrapper.get("[data-dash-sort]").setValue("name");
    expect(rowIds(wrapper)).toEqual(["p2", "p1", "p3"]); // alpha, bravo, charlie
    await wrapper.get("[data-dash-sort]").setValue("cost");
    expect(rowIds(wrapper)).toEqual(["p1", "p3", "p2"]);
    await wrapper.get("[data-dash-sort]").setValue("tokens");
    expect(rowIds(wrapper)).toEqual(["p3", "p1", "p2"]);
    await wrapper.get("[data-dash-kind]").setValue("codex");
    expect(rowIds(wrapper)).toEqual(["p2"]);
    expect(wrapper.get("[data-dash-count]").text()).toBe("1");
    expect(localStorage.getItem("soda.dashboard.sort.v1")).toBe("tokens"); // 覚えている
    wrapper.unmount();
  });

  it("キーボード: ↓↑で行を移る・Enter でその pane へ（基本画面に切り替えて workspace・tab・pane を選ぶ。pane.focus を送る）", async () => {
    const { wrapper, requests, view } = setup([pane("p1", agent({ name: "alpha", instanceId: "i1" })), pane("p2", agent({ name: "beta", instanceId: "i2" }))]);
    view.setScreen("dashboard");
    await wrapper.vm.$nextTick();
    const first = wrapper.get('[data-dash-row="p1"]');
    expect(first.attributes("tabindex")).toBe("0");
    expect(wrapper.get('[data-dash-row="p2"]').attributes("tabindex")).toBe("-1");
    await first.trigger("keydown", { key: "ArrowDown" });
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(wrapper.get('[data-dash-row="p2"]').element);
    await wrapper.get('[data-dash-row="p2"]').trigger("keydown", { key: "Enter" });
    expect(view.screen).toBe("base");
    expect(view.focusedPaneId).toBe("p2");
    expect(view.tabId).toBe("t1");
    expect(requests).toContainEqual(["pane.focus", { paneId: "p2" }]);
    wrapper.unmount();
  });

  it("対応しないサーバ・取れなかったときの案内", async () => {
    const { wrapper, usage: store } = setup([pane("p1", agent())]);
    store.markUnsupported();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-dash-unsupported]").text()).toContain("対応していません");
    expect(wrapper.find("[data-dash-loading]").exists()).toBe(false);
    store.markFailed();
    store.unsupported = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-dash-failed]").exists()).toBe(true);
    wrapper.unmount();
  });
});
