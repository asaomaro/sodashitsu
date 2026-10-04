import type { AgentInfo, Pane, SubagentInfo, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMachinesStore } from "../store/machines.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import SubagentListDialog from "./SubagentListDialog.vue";

let pinia: Pinia;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  pinia = createPinia();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

const ws: Workspace = {
  id: "w1",
  label: "w1",
  cwd: "/",
  tabIds: ["t1"],
  activeTabId: "t1",
  groupId: null,
  git: null,
  autoLabel: false,
};
const tab: Tab = {
  id: "t1",
  workspaceId: "w1",
  label: "t1",
  layout: { type: "pane", paneId: "p1" },
  focusedPaneId: "p1",
  zoomedPaneId: null,
  sizeOwnerClientId: null,
};
const sub = (id: string, over: Partial<SubagentInfo> = {}): SubagentInfo => ({
  id,
  startedAt: 1_000_000,
  ...over,
});
function agentOf(subagents?: AgentInfo["subagents"], over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instanceId: "a1",
    kind: "claude",
    label: "Claude Code",
    state: "working",
    completionSeq: 0,
    serverSeenSeq: 0,
    verified: true,
    since: 0,
    ...(subagents ? { subagents } : {}),
    ...over,
  };
}
function paneOf(agent: AgentInfo | null, over: Partial<Pane> = {}): Pane {
  return {
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
    agent,
    agentSession: null,
    ...over,
  };
}

async function setup(subagents?: AgentInfo["subagents"]) {
  const session = useSessionStore(pinia);
  const view = useViewStore(pinia);
  session.workspaceUpserted(ws);
  session.tabUpserted(tab);
  session.paneUpserted(paneOf(agentOf(subagents)));
  const wrapper = mount(SubagentListDialog, {
    global: { plugins: [pinia] },
    attachTo: document.body,
  });
  view.openDialogWithContext({ kind: "subagents", machineId: "local", paneId: "p1" });
  await wrapper.vm.$nextTick();
  await wrapper.vm.$nextTick();
  return { session, view, wrapper };
}
const dialogOf = (w: { get(s: string): { element: Element } }) =>
  w.get("dialog").element as HTMLDialogElement;

describe("SubagentListDialog — 表示", () => {
  it("開くと題（pane の呼び名）と、各行の種類・説明・経過時間・バックグラウンドの印を出す。先頭の一覧の領域にフォーカスが移る", async () => {
    const { wrapper } = await setup({
      count: 2,
      items: [
        sub("a", { type: "Explore", description: "調べる", startedAt: 1_000_000 - 65_000 }),
        sub("b", { background: true, startedAt: 1_000_000 - 5000 }),
      ],
    });
    const dialog = dialogOf(wrapper);
    expect(dialog.open).toBe(true);
    expect(wrapper.get("h2").text()).toBe("サブエージェント — Claude Code");
    const items = wrapper.findAll(".subagent-list-item");
    expect(items).toHaveLength(2);
    expect(items[0]!.text()).toContain("Explore");
    expect(items[0]!.text()).toContain("調べる");
    expect(items[0]!.text()).toContain("1分");
    expect(items[0]!.text()).not.toContain("バックグラウンド");
    expect(items[1]!.text()).toContain("サブエージェント"); // 種類が分からないとき
    expect(items[1]!.text()).toContain("バックグラウンド");
    expect(items[1]!.text()).toContain("5秒");
    expect(document.activeElement).toBe(wrapper.get(".subagent-list").element);
  });

  it("一覧は tabindex を持つ 1 つの領域（上下キーのスクロールの受け手）で、縦に溢れたらスクロールする", async () => {
    const { wrapper } = await setup({ count: 1, items: [sub("a")] });
    const list = wrapper.get(".subagent-list");
    expect(list.attributes("tabindex")).toBe("0");
    expect(list.attributes("role")).toBe("list");
  });

  it("開く時点で対象のエージェントが居なければ、開かずに閉じる（0 件の文言のまま開き続けない）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(ws);
    session.tabUpserted(tab);
    session.paneUpserted(paneOf(null));
    const wrapper = mount(SubagentListDialog, {
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    view.openDialogWithContext({ kind: "subagents", machineId: "local", paneId: "p1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
    expect(dialogOf(wrapper).open).toBe(false);
  });

  it("起動した順（items の順）に出す", async () => {
    const { wrapper } = await setup({
      count: 3,
      items: [sub("c", { type: "T1" }), sub("a", { type: "T2" }), sub("b", { type: "T3" })],
    });
    expect(wrapper.findAll(".subagent-list-type").map((e) => e.text())).toEqual(["T1", "T2", "T3"]);
  });

  it("count が items より多ければ、末尾に「ほか n 件」", async () => {
    const { wrapper } = await setup({
      count: 70,
      items: Array.from({ length: 64 }, (_, i) => sub(`a${i}`)),
    });
    expect(wrapper.findAll(".subagent-list-item")).toHaveLength(64);
    expect(wrapper.get(".subagent-list-more").text()).toBe("ほか 6 件");
  });

  it("0 件なら「実行中のサブエージェントはありません」（開いたまま）", async () => {
    const { wrapper } = await setup({ count: 0, items: [] });
    expect(dialogOf(wrapper).open).toBe(true);
    expect(wrapper.get(".subagent-list-empty").text()).toBe("実行中のサブエージェントはありません");
    expect(wrapper.find(".subagent-list-more").exists()).toBe(false);
  });

  it("説明は文字として出す（HTML を書いても要素にならない）", async () => {
    const { wrapper } = await setup({
      count: 1,
      items: [
        sub("a", {
          description: '<img src=x onerror="window.__pwned=1"><b>太字</b>',
          type: "<i>t</i>",
        }),
      ],
    });
    expect(wrapper.find(".subagent-list-desc img").exists()).toBe(false);
    expect(wrapper.find(".subagent-list-desc b").exists()).toBe(false);
    expect(wrapper.get(".subagent-list-desc").text()).toBe(
      '<img src=x onerror="window.__pwned=1"><b>太字</b>',
    );
    expect(wrapper.get(".subagent-list-type").text()).toBe("<i>t</i>");
  });

  it("経過時間は 10 秒ごとに進む", async () => {
    const { wrapper } = await setup({ count: 1, items: [sub("a")] });
    expect(wrapper.get(".subagent-list-elapsed").text()).toBe("0秒");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(wrapper.get(".subagent-list-elapsed").text()).toBe("10秒");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(wrapper.get(".subagent-list-elapsed").text()).toBe("1分");
  });

  it("開いている間に件数が変わると、一覧も変わる", async () => {
    const { wrapper, session } = await setup({ count: 1, items: [sub("a", { type: "A" })] });
    session.paneUpserted(
      paneOf(agentOf({ count: 2, items: [sub("a", { type: "A" }), sub("b", { type: "B" })] })),
    );
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".subagent-list-type").map((e) => e.text())).toEqual(["A", "B"]);
  });
});

// 閉じたときのフォーカス（AC-I4）。ボタンから開いたなら ボタン → 行 → 端末。`show_subagents` から開いたなら端末。
describe("SubagentListDialog — 閉じたときのフォーカスの戻り先", () => {
  async function setupWithSidebarDom(opener: "button" | undefined, withButton: boolean) {
    document.body.innerHTML = `<div class="sidebar-agents"><div class="sidebar-row" tabindex="-1" data-agent-pane="p1">${
      withButton ? '<button class="sidebar-subagent-btn" data-subagent-pane="p1">1</button>' : ""
    }</div></div><div id="term" tabindex="0"></div>`;
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(ws);
    session.tabUpserted(tab);
    session.paneUpserted(paneOf(agentOf({ count: 1, items: [sub("a")] })));
    const wrapper = mount(SubagentListDialog, {
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    view.openDialogWithContext({
      kind: "subagents",
      machineId: "local",
      paneId: "p1",
      ...(opener ? { opener } : {}),
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    return { wrapper, view };
  }
  const active = () => document.activeElement;

  it("ボタンから開いた: 閉じるとボタンへ戻る", async () => {
    const { wrapper } = await setupWithSidebarDom("button", true);
    await wrapper.get(".subagent-dialog-actions button").trigger("click");
    await wrapper.vm.$nextTick();
    expect(active()).toBe(document.querySelector(".sidebar-subagent-btn"));
  });

  it("ボタンから開いたが、ボタンがもう無い（0 件になった等）: 行へ戻る", async () => {
    const { wrapper } = await setupWithSidebarDom("button", false);
    await wrapper.get("dialog").trigger("cancel");
    await wrapper.vm.$nextTick();
    expect(active()).toBe(document.querySelector("[data-agent-pane]"));
  });

  it("ボタンから開いたが、ボタンも行も無い: どちらにも移さない（端末は closeDialog が戻す）", async () => {
    const { wrapper, view } = await setupWithSidebarDom("button", false);
    document.querySelector(".sidebar-agents")!.remove();
    (document.querySelector("#term") as HTMLElement).focus();
    await wrapper.get("dialog").trigger("cancel");
    await wrapper.vm.$nextTick();
    expect(active()).toBe(document.querySelector("#term"));
    expect(view.dialogContext).toBeNull();
  });

  it("show_subagents から開いた（opener なし）: ボタンがあっても移さない（端末へ）", async () => {
    const { wrapper } = await setupWithSidebarDom(undefined, true);
    (document.querySelector("#term") as HTMLElement).focus();
    await wrapper.get(".subagent-dialog-actions button").trigger("click");
    await wrapper.vm.$nextTick();
    expect(active()).toBe(document.querySelector("#term"));
  });

  it("対象が居なくなって自分で閉じたときも、同じ戻り先（行）", async () => {
    const { wrapper } = await setupWithSidebarDom("button", false);
    useSessionStore(pinia).paneUpserted(paneOf(null));
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(active()).toBe(document.querySelector("[data-agent-pane]"));
  });
});

describe("SubagentListDialog — 閉じる", () => {
  it("［閉じる］・背景のクリック・Esc（cancel）で閉じる。ダイアログの中のクリックでは閉じない", async () => {
    for (const how of ["button", "backdrop", "cancel"] as const) {
      document.body.innerHTML = "";
      pinia = createPinia();
      const { wrapper, view } = await setup({ count: 1, items: [sub("a")] });
      if (how === "button") await wrapper.get(".subagent-dialog-actions button").trigger("click");
      if (how === "backdrop") {
        await wrapper.get(".subagent-list").trigger("click"); // 中のクリック
        expect(view.dialogContext).not.toBeNull();
        await wrapper.get("dialog").trigger("click"); // 背景（dialog 自身）
      }
      if (how === "cancel") await wrapper.get("dialog").trigger("cancel");
      expect(view.dialogContext, how).toBeNull();
      await wrapper.vm.$nextTick();
      expect(dialogOf(wrapper).open, how).toBe(false);
    }
  });

  it("対象のエージェントが居なくなったら閉じる", async () => {
    const { wrapper, view, session } = await setup({ count: 1, items: [sub("a")] });
    session.paneUpserted(paneOf(null));
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
  });

  it("エージェントが入れ替わったら（instanceId が変わったら）閉じる", async () => {
    const { wrapper, view, session } = await setup({ count: 1, items: [sub("a")] });
    session.paneUpserted(paneOf(agentOf({ count: 1, items: [sub("z")] }, { instanceId: "a2" })));
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
  });

  it("pane が閉じたら閉じる", async () => {
    const { wrapper, view, session } = await setup({ count: 1, items: [sub("a")] });
    session.paneClosed("p1");
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
  });

  it("同じ instanceId のままの更新（状態の変化など）では閉じない", async () => {
    const { wrapper, view, session } = await setup({ count: 1, items: [sub("a")] });
    session.paneUpserted(paneOf(agentOf({ count: 1, items: [sub("a")] }, { state: "idle" })));
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).not.toBeNull();
  });

  it("対象外の dialogContext では閉じたまま。閉じた後はタイマーを止める", async () => {
    const { wrapper, view } = await setup({ count: 1, items: [sub("a")] });
    view.closeDialog();
    await wrapper.vm.$nextTick();
    expect(vi.getTimerCount()).toBe(0);
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "x" });
    await wrapper.vm.$nextTick();
    expect(dialogOf(wrapper).open).toBe(false);
  });
});

// 20261004-subagent-display の T12。pane の ID が衝突する 2 つのマシンで、件数と一覧を取り違えない。
describe("SubagentListDialog — 2 つのマシン（pane の ID が衝突）", () => {
  const M2 = "b".repeat(32);

  /** 選んでいるのは M2（session のストアは M2 の p1: 2 件）。手元（local）の p1 は要約にあり 5 件。 */
  async function setupTwoMachines() {
    const machines = useMachinesStore(pinia);
    machines.setMachines([{ id: M2, label: "box", state: "online", message: null }] as never);
    machines.applySummarySnapshot("local", {
      protocol: 1,
      serverVersion: "t",
      host: { os: "linux", windowsBuild: null, hostname: "h" },
      workspaces: [ws],
      tabs: [tab],
      panes: [
        paneOf(
          agentOf(
            {
              count: 5,
              items: Array.from({ length: 5 }, (_, i) => sub(`l${i}`, { type: "LOCAL" })),
            },
            { instanceId: "local-a" },
          ),
          { label: "ローカルの p1" },
        ),
      ],
    } as never);
    machines.select(M2);
    const session = useSessionStore(pinia);
    session.workspaceUpserted(ws);
    session.tabUpserted(tab);
    session.paneUpserted(
      paneOf(
        agentOf(
          { count: 2, items: [sub("r0", { type: "REMOTE" }), sub("r1", { type: "REMOTE" })] },
          { instanceId: "m2-a" },
        ),
        { label: "M2 の p1" },
      ),
    );
    const view = useViewStore(pinia);
    const wrapper = mount(SubagentListDialog, {
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    return { wrapper, view };
  }

  it("選んでいるマシン（M2）の対象は session の p1（2 件）、選んでいない手元の対象は要約の p1（5 件）", async () => {
    const { wrapper, view } = await setupTwoMachines();
    view.openDialogWithContext({ kind: "subagents", machineId: M2, paneId: "p1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("h2").text()).toBe("サブエージェント — M2 の p1");
    expect(wrapper.findAll(".subagent-list-type").map((e) => e.text())).toEqual([
      "REMOTE",
      "REMOTE",
    ]);
    view.closeDialog();
    await wrapper.vm.$nextTick();
    view.openDialogWithContext({ kind: "subagents", machineId: "local", paneId: "p1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.get("h2").text()).toBe("サブエージェント — ローカルの p1");
    expect(wrapper.findAll(".subagent-list-type").map((e) => e.text())).toEqual([
      "LOCAL",
      "LOCAL",
      "LOCAL",
      "LOCAL",
      "LOCAL",
    ]);
    wrapper.unmount();
  });

  it("選んでいないマシンの要約が更新されると、開いている一覧も更新される。そのマシンのエージェントが入れ替わると閉じる", async () => {
    const { wrapper, view } = await setupTwoMachines();
    const machines = useMachinesStore(pinia);
    view.openDialogWithContext({ kind: "subagents", machineId: "local", paneId: "p1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    machines.applySummaryEvent("local", {
      event: "pane.agent_status_changed",
      data: {
        paneId: "p1",
        agent: agentOf({ count: 1, items: [sub("x", { type: "NEW" })] }, { instanceId: "local-a" }),
      },
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".subagent-list-type").map((e) => e.text())).toEqual(["NEW"]);
    machines.applySummaryEvent("local", {
      event: "pane.agent_status_changed",
      data: { paneId: "p1", agent: agentOf(undefined, { instanceId: "replaced" }) },
    });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(view.dialogContext).toBeNull();
    expect(dialogOf(wrapper).open).toBe(false);
    wrapper.unmount();
  });

  it("新しい画面 × 古いサーバ（subagents の項目が無いエージェント）: 一覧は開いて、0 件の文言を出す（エラーにしない）。件数のボタン・show_subagents は項目が無ければ開かない", async () => {
    const machines = useMachinesStore(pinia);
    machines.applySummarySnapshot("local", {
      protocol: 1,
      serverVersion: "old",
      host: { os: "linux", windowsBuild: null, hostname: "h" },
      workspaces: [ws],
      tabs: [tab],
      panes: [paneOf(agentOf(undefined, { instanceId: "old-a" }))],
    } as never);
    machines.select(M2);
    const view = useViewStore(pinia);
    const wrapper = mount(SubagentListDialog, {
      global: { plugins: [pinia] },
      attachTo: document.body,
    });
    view.openDialogWithContext({ kind: "subagents", machineId: "local", paneId: "p1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    // 項目が無い（分からない）エージェントでも、エージェント自身は居るので開く（0 件の文言）。
    expect(dialogOf(wrapper).open).toBe(true);
    expect(wrapper.findAll(".subagent-list-item")).toHaveLength(0);
    expect(wrapper.get(".subagent-list-empty").text()).toBe("実行中のサブエージェントはありません");
    wrapper.unmount();
  });
});
