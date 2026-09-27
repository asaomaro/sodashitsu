import type {
  AgentInfo,
  MachineStatus,
  ServerEvent,
  SessionSnapshot,
  Workspace,
} from "@wtm/protocol";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { LOCAL_MACHINE_ID } from "../net/machineUrl.js";

/**
 * 保存した SSH のマシン（20260927-multi-host-machines の design「web」）。手元の `wtm serve` が配るマシンの一覧（`machine.list`・`machine.changed`）、
 * 画面の接続が向いているマシン（選択）、選んでいないマシンの**要約**（軽い接続の snapshot とイベントから作る workspace とエージェントの状態）、
 * マシンごとの折りたたみ（このブラウザのメモリだけ）を持つ。要約はマシンごとに閉じる——id（`w1`・`p1`）はマシンをまたいで衝突する。
 */
export interface MachineSummary {
  /** 軽い接続が開いていて hello を済ませたか（切れていれば最後の状態を薄く出す）。 */
  connected: boolean;
  /** 一度でも hello を済ませたか（済ませていなければ「未接続」）。 */
  everConnected: boolean;
  /** そのマシンの並び順の workspace。 */
  workspaces: Workspace[];
  /** tab → workspace。 */
  tabWorkspace: Record<string, string>;
  /** pane → tab とエージェント。 */
  panes: Record<string, { tabId: string; agent: AgentInfo | null }>;
}

export interface MachineSection {
  id: string;
  label: string;
}

function emptySummary(): MachineSummary {
  return { connected: false, everConnected: false, workspaces: [], tabWorkspace: {}, panes: {} };
}

export const useMachinesStore = defineStore("machines", () => {
  const machines = ref<MachineStatus[]>([]);
  const selectedId = ref<string>(LOCAL_MACHINE_ID);
  const summaries = ref<Record<string, MachineSummary>>({});
  const collapsed = ref<Record<string, boolean>>({});

  /** 有効なマシンが 1 台以上あるか（無ければサイドバーは今までのまま）。 */
  const hasMachines = computed(() => machines.value.length > 0);
  /** サイドバーのまとまりの順（ローカルが先頭、登録の順）。 */
  const sections = computed<MachineSection[]>(() => [
    { id: LOCAL_MACHINE_ID, label: "ローカル" },
    ...machines.value.map((m) => ({ id: m.id, label: m.label })),
  ]);

  function statusOf(id: string): MachineStatus | undefined {
    return machines.value.find((m) => m.id === id);
  }

  /**
   * 選べるか（見出し・行の disabled と切り替えの手順 2 はこれ 1 つを使う）。ローカルは（選んでいないとき）要約が繋がっている、
   * ほかは手元の `wtm serve` から見た状態が online で、かつ要約が繋がっている。選んでいるマシンは常に真（表示だけ）。
   */
  function isSelectable(id: string): boolean {
    if (id === selectedId.value) return true;
    const connected = summaries.value[id]?.connected === true;
    if (id === LOCAL_MACHINE_ID) return connected;
    return statusOf(id)?.state === "online" && connected;
  }

  function setMachines(list: MachineStatus[]): void {
    machines.value = list;
    // 一覧から消えたマシンの要約・折りたたみは捨てる（選択は呼び出し側がローカルへ戻す）。
    const alive = new Set([LOCAL_MACHINE_ID, ...list.map((m) => m.id)]);
    for (const id of Object.keys(summaries.value)) if (!alive.has(id)) delete summaries.value[id];
    for (const id of Object.keys(collapsed.value)) if (!alive.has(id)) delete collapsed.value[id];
  }

  function select(id: string): void {
    selectedId.value = id;
  }

  function toggleCollapsed(id: string): void {
    collapsed.value = { ...collapsed.value, [id]: !collapsed.value[id] };
  }

  function summary(id: string): MachineSummary {
    if (!summaries.value[id]) summaries.value[id] = emptySummary();
    return summaries.value[id]!; // 入れた後に読み直す（反応する proxy を通して変える）
  }

  function applySummarySnapshot(id: string, snap: SessionSnapshot): void {
    const tabWorkspace: Record<string, string> = {};
    for (const t of snap.tabs) tabWorkspace[t.id] = t.workspaceId;
    const panes: MachineSummary["panes"] = {};
    for (const p of snap.panes) panes[p.id] = { tabId: p.tabId, agent: p.agent };
    summaries.value[id] = {
      connected: true,
      everConnected: true,
      workspaces: [...snap.workspaces],
      tabWorkspace,
      panes,
    };
  }

  function setSummaryConnected(id: string, connected: boolean): void {
    const s = summary(id);
    s.connected = connected;
  }

  function dropSummary(id: string): void {
    delete summaries.value[id];
  }

  /** 要約に効くイベントだけを当てる（ほかは無視）。 */
  function applySummaryEvent(id: string, e: ServerEvent): void {
    const s = summaries.value[id];
    if (!s) return;
    switch (e.event) {
      case "workspace.created":
      case "workspace.updated": {
        const i = s.workspaces.findIndex((w) => w.id === e.data.workspace.id);
        if (i >= 0) s.workspaces.splice(i, 1, e.data.workspace);
        else s.workspaces.push(e.data.workspace);
        return;
      }
      case "workspace.closed":
        s.workspaces = s.workspaces.filter((w) => w.id !== e.data.workspaceId);
        return;
      case "workspace.order_changed": {
        const byId = new Map(s.workspaces.map((w) => [w.id, w] as const));
        const ordered = e.data.workspaceIds.flatMap((wid) => {
          const w = byId.get(wid);
          return w ? [w] : [];
        });
        const rest = s.workspaces.filter((w) => !e.data.workspaceIds.includes(w.id));
        s.workspaces = [...ordered, ...rest];
        return;
      }
      case "tab.created":
      case "tab.updated":
        s.tabWorkspace[e.data.tab.id] = e.data.tab.workspaceId;
        return;
      case "tab.closed":
        delete s.tabWorkspace[e.data.tabId];
        return;
      case "pane.created":
      case "pane.updated":
        s.panes[e.data.pane.id] = { tabId: e.data.pane.tabId, agent: e.data.pane.agent };
        return;
      case "pane.closed":
        delete s.panes[e.data.paneId];
        return;
      case "pane.agent_status_changed": {
        const p = s.panes[e.data.paneId];
        if (p) p.agent = e.data.agent;
        return;
      }
      default:
        return;
    }
  }

  /** 要約の workspace の中のエージェント（状態の印の材料）。 */
  function agentsInWorkspace(id: string, workspaceId: string): AgentInfo[] {
    const s = summaries.value[id];
    if (!s) return [];
    const out: AgentInfo[] = [];
    for (const p of Object.values(s.panes))
      if (p.agent && s.tabWorkspace[p.tabId] === workspaceId) out.push(p.agent);
    return out;
  }

  return {
    machines,
    selectedId,
    summaries,
    collapsed,
    hasMachines,
    sections,
    statusOf,
    isSelectable,
    setMachines,
    select,
    toggleCollapsed,
    applySummarySnapshot,
    applySummaryEvent,
    setSummaryConnected,
    dropSummary,
    agentsInWorkspace,
  };
});
