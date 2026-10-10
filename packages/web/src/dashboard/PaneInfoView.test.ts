import type { AccountUsage, AgentInfo, AgentUsage, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionStore } from "../store/session.js";
import { useUsageStore } from "../store/usage.js";
import { useViewStore } from "../store/view.js";
import PaneInfoView from "./PaneInfoView.vue";

/** 20261010-agent-usage PR4 の AC1・AC5: pane の利用状況の窓の中身（出し分け・無い項目・古い印・入口）。 */

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
  return { instanceId: "i", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: NOW - 125_000, ...over };
}
function pane(id: string, a: AgentInfo | null, over: Partial<Pane> = {}): Pane {
  return { id, tabId: "t1", label: null, cwd: `/work/${id}`, shell: "bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: a, agentSession: null, ...over };
}
const usage = (paneId: string, over: Partial<AgentUsage> = {}): AgentUsage => ({
  paneId,
  kind: "claude",
  model: "claude-sonnet-5-5",
  tokens: { basis: "cumulative", input: 1000, output: 2345, cacheRead: 5000, cacheWrite: 300, total: 8645 },
  source: "cost-state",
  updatedAt: NOW - 5_000,
  ...over,
});
const account = (over: Partial<AccountUsage> = {}): AccountUsage => ({
  kind: "claude",
  accountKey: "k1",
  label: "Claude Code",
  windows: [{ label: "5 時間", usedPct: 42.4, resetsAt: NOW + 130 * 60_000 }],
  source: "statusline",
  asOf: NOW - 30_000,
  ...over,
});

function setup(p: Pane) {
  const session = useSessionStore(pinia);
  session.workspaceUpserted({ id: "w1", label: "repo", cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: { branch: "feature/x" }, autoLabel: false } as unknown as Workspace);
  session.tabUpserted({ id: "t1", workspaceId: "w1", label: "main", layout: { type: "pane", paneId: p.id }, focusedPaneId: p.id, zoomedPaneId: null, sizeOwnerClientId: null } as Tab);
  session.paneUpserted(p);
  const emitted: string[] = [];
  const wrapper = mount(PaneInfoView, {
    props: { paneId: p.id, kind: "popover", active: true, onClose: () => emitted.push("close") },
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  return { wrapper, usage: useUsageStore(pinia), view: useViewStore(pinia), emitted };
}

describe("PaneInfoView", () => {
  it("エージェントが居ない pane: 居ない旨だけ（利用状況の欄を出さない）。ダッシュボードの入口は残る", () => {
    const { wrapper } = setup(pane("p1", null));
    expect(wrapper.find("[data-pane-info-noagent]").exists()).toBe(true);
    expect(wrapper.find("[data-pane-info-usage]").exists()).toBe(false);
    expect(wrapper.find("[data-pane-info-open-dashboard]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("読み込み中・取れなかった・古いサーバ・まだ値が無い、を出し分ける（0 と書かない）", async () => {
    const { wrapper, usage: store } = setup(pane("p1", agent({ name: "alpha" })));
    expect(wrapper.find("[data-pane-info-loading]").exists()).toBe(true);
    store.markFailed();
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-pane-info-failed]").exists()).toBe(true);
    store.markUnsupported();
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-pane-info-unsupported]").exists()).toBe(true);
    store.setSnapshot({ panes: {}, accounts: [] });
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-pane-info-none]").exists()).toBe(true);
    expect(wrapper.find("[data-pane-info-model]").text()).toBe("—");
    wrapper.unmount();
  });

  it("値のあるとき: 種類・名前・状態・モデル・トークンの内訳（基準の印）・コスト（時点）・コンテキスト（率）・更新", async () => {
    const { wrapper, usage: store } = setup(pane("p1", agent({ name: "alpha", state: "working" }), { agentSession: { kind: "claude", sessionId: "0123abcd-1111-4222-8333-444455556666" } as never }));
    store.setSnapshot({
      panes: { p1: usage("p1", { costUsd: 2.5, costBasis: "cost-state", costAsOf: NOW - 600_000, contextUsedPct: 41.6, contextTokens: 83_000, contextWindowTokens: 200_000 }) },
      accounts: [],
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("alpha");
    expect(wrapper.get("[data-pane-info-kind]").text()).toBe("Claude Code");
    expect(wrapper.get("[data-pane-info-model]").text()).toBe("claude-sonnet-5-5");
    const tokens = wrapper.get("[data-pane-info-usage]").text();
    for (const t of ["入力", "出力", "キャッシュ読み", "キャッシュ書き"]) expect(tokens).toContain(t);
    expect(wrapper.get("[data-pane-info-tokens]").text()).toContain("8.64k");
    expect(wrapper.get("[data-pane-info-tokens]").text()).toContain("累計");
    expect(wrapper.get("[data-pane-info-cost]").text()).toContain("$2.50");
    expect(wrapper.get("[data-pane-info-cost]").text()).toContain("10 分前の時点");
    expect(wrapper.get("[data-pane-info-context]").text()).toContain("42%");
    expect(wrapper.get("[data-pane-info-context] [role=progressbar]").attributes("aria-valuenow")).toBe("42");
    expect(wrapper.get("[data-pane-info-context]").text()).toContain("窓 200k");
    expect(wrapper.get("[data-pane-info-updated]").text()).toContain("5 秒前");
    expect(wrapper.find("[data-pane-info-updated] .dash-chip").exists()).toBe(false); // 古くない
    expect(wrapper.get("[data-pane-info-session]").text()).toBe("0123abcd"); // 先頭 8 文字
    expect(wrapper.get("[data-pane-info-cwd]").text()).toBe("/work/p1");
    expect(wrapper.get("[data-pane-info-branch]").text()).toBe("feature/x");
    expect(wrapper.get("[data-pane-info-state]").text()).toContain("2 分前から");
    wrapper.unmount();
  });

  it("無い項目は「—」: コスト・コンテキスト・内訳。トークン数だけのコンテキストは tok を添える", async () => {
    const { wrapper, usage: store } = setup(pane("p1", agent({ name: "alpha" })));
    store.setSnapshot({ panes: { p1: usage("p1", { tokens: { basis: "transcript", total: 500 }, contextTokens: 12_000 }) }, accounts: [] });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("[data-pane-info-cost]").text()).toBe("—");
    expect(wrapper.get("[data-pane-info-context]").text()).toContain("12k tok");
    expect(wrapper.get("[data-pane-info-tokens]").text()).toContain("記録分");
    expect(wrapper.find("[data-pane-info-main]").exists()).toBe(false);
    expect(wrapper.get("[data-pane-info-branch]").text()).toBe("feature/x");
    expect(wrapper.get("[data-pane-info-session]").text()).toBe("—");
    wrapper.unmount();
  });

  it("古い印（1 分より前）・読み込み中・一部・更新停止。主とサブエージェントの内訳", async () => {
    const { wrapper, usage: store } = setup(pane("p1", agent({ name: "alpha" })));
    store.setSnapshot({
      panes: {
        p1: usage("p1", {
          updatedAt: NOW - 5 * 60_000,
          scanning: true,
          partial: true,
          updatesStopped: true,
          breakdown: { main: { input: 10, output: 20, total: 30 }, subagents: { input: 100, output: 200, total: 300, files: 2 } },
        }),
      },
      accounts: [],
    });
    await wrapper.vm.$nextTick();
    const upd = wrapper.get("[data-pane-info-updated]").text();
    for (const t of ["5 分前", "古い", "読み込み中", "一部", "更新停止"]) expect(upd).toContain(t);
    expect(wrapper.get("[data-pane-info-main]").text()).toBe("30");
    expect(wrapper.get("[data-pane-info-subagent-tokens]").text()).toContain("300");
    expect(wrapper.get("[data-pane-info-subagent-tokens]").text()).toContain("2 件");
    wrapper.unmount();
  });

  it("アカウントの枠は、その種類のものだけ（ダッシュボードと同じ形）。無ければ区画ごと出さない", async () => {
    const { wrapper, usage: store } = setup(pane("p1", agent({ name: "alpha" })));
    store.setSnapshot({ panes: {}, accounts: [account(), account({ kind: "codex", accountKey: "k2", label: "codex" })] });
    await wrapper.vm.$nextTick();
    const cards = wrapper.findAll("[data-pane-info-accounts] [data-dash-account]");
    expect(cards.map((c) => c.attributes("data-dash-account"))).toEqual(["k1"]);
    expect(cards[0]!.text()).toContain("5 時間");
    expect(cards[0]!.text()).toContain("42%");
    store.setSnapshot({ panes: {}, accounts: [account({ kind: "codex", accountKey: "k2" })] });
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[data-pane-info-accounts]").exists()).toBe(false);
    wrapper.unmount();
  });

  it("入口: ダッシュボードを開く（窓を閉じ、ダッシュボードへ）。サブエージェントは 1 件以上のときだけ一覧への入口（今ある一覧を開く）", async () => {
    const { wrapper, view, emitted } = setup(pane("p1", agent({ name: "alpha", subagents: { count: 2, items: [] } })));
    expect(wrapper.get("[data-pane-info-subagents]").text()).toContain("2 件");
    await wrapper.get("[data-pane-info-open-subagents]").trigger("click");
    expect(emitted).toEqual(["close"]);
    expect(view.dialogContext).toMatchObject({ kind: "subagents", paneId: "p1" });
    view.closeDialog();
    await wrapper.get("[data-pane-info-open-dashboard]").trigger("click");
    expect(emitted).toEqual(["close", "close"]);
    expect(view.dashboardVisible).toBe(true);
    wrapper.unmount();
  });

  it("サブエージェントが 0 件・分からない: 一覧への入口を出さない（分からないは「—」）", () => {
    const a = setup(pane("p1", agent({ name: "alpha", subagents: { count: 0, items: [] } })));
    expect(a.wrapper.find("[data-pane-info-open-subagents]").exists()).toBe(false);
    expect(a.wrapper.get("[data-pane-info-subagents]").text()).toContain("0 件");
    a.wrapper.unmount();
  });

  it("数字・名前は文字として出す（HTML として解釈しない）", async () => {
    const { wrapper, usage: store } = setup(pane("p1", agent({ name: "<img src=x onerror=alert(1)>" })));
    store.setSnapshot({ panes: { p1: usage("p1", { model: "m<script>" }) }, accounts: [] });
    await wrapper.vm.$nextTick();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find("script").exists()).toBe(false);
    expect(wrapper.text()).toContain("<img src=x onerror=alert(1)>");
    wrapper.unmount();
  });
});
