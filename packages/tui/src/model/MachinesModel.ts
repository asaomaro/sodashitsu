import type {
  AgentInfo,
  MachineStatus,
  ServerEvent,
  SessionSnapshot,
  Workspace,
} from "@sodashitsu/protocol";
import { LOCAL_MACHINE_ID } from "@sodashitsu/client-core";

/** 選んでいないマシンの要約（web の `store/machines.ts` の `MachineSummary` と同じ）。 */
export interface MachineSummary {
  connected: boolean;
  everConnected: boolean;
  workspaces: Workspace[];
  tabWorkspace: Record<string, string>;
  panes: Record<string, { tabId: string; agent: AgentInfo | null }>;
}

export interface MachineSection {
  id: string;
  label: string;
}

function emptySummary(): MachineSummary {
  return { connected: false, everConnected: false, workspaces: [], tabWorkspace: {}, panes: {} };
}

/**
 * 保存した SSH のマシン（20260927-cli-mode の design「複数ホスト」・AC14）。web の `store/machines.ts` を pinia なしのクラスにしたもの
 * （**同じ規則**：選べるのは接続済みのマシンだけ・一覧から消えたマシンの要約と畳みは捨てる・要約はスナップショットとイベントで更新）。
 */
export class MachinesModel {
  machines: MachineStatus[] = [];
  selectedId: string = LOCAL_MACHINE_ID;
  summaries: Record<string, MachineSummary> = {};
  collapsed: Record<string, boolean> = {};
  private readonly listeners = new Set<() => void>();

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }

  get hasMachines(): boolean {
    return this.machines.length > 0;
  }

  get sections(): MachineSection[] {
    return [
      { id: LOCAL_MACHINE_ID, label: "ローカル" },
      ...this.machines.map((m) => ({ id: m.id, label: m.label })),
    ];
  }

  statusOf(id: string): MachineStatus | undefined {
    return this.machines.find((m) => m.id === id);
  }

  /** 切り替えられるか（今のマシン・接続済みの軽い接続のあるマシン。ほかのマシンはサーバから見て online のときだけ）。 */
  isSelectable(id: string): boolean {
    if (id === this.selectedId) return true;
    const connected = this.summaries[id]?.connected === true;
    if (id === LOCAL_MACHINE_ID) return connected;
    return this.statusOf(id)?.state === "online" && connected;
  }

  setMachines(list: MachineStatus[]): void {
    // 形の壊れた応答（一覧が配列でない）は空として扱う（版の違うサーバでも落ちない）。
    this.machines = Array.isArray(list) ? list : [];
    const alive = new Set([LOCAL_MACHINE_ID, ...this.machines.map((m) => m.id)]);
    for (const id of Object.keys(this.summaries)) if (!alive.has(id)) delete this.summaries[id];
    for (const id of Object.keys(this.collapsed)) if (!alive.has(id)) delete this.collapsed[id];
    this.emit();
  }

  select(id: string): void {
    this.selectedId = id;
    this.emit();
  }

  toggleCollapsed(id: string): void {
    this.collapsed = { ...this.collapsed, [id]: !this.collapsed[id] };
    this.emit();
  }

  applySummarySnapshot(id: string, snap: SessionSnapshot): void {
    const tabWorkspace: Record<string, string> = {};
    for (const t of snap.tabs) tabWorkspace[t.id] = t.workspaceId;
    const panes: MachineSummary["panes"] = {};
    for (const p of snap.panes) panes[p.id] = { tabId: p.tabId, agent: p.agent };
    this.summaries[id] = {
      connected: true,
      everConnected: true,
      workspaces: [...snap.workspaces],
      tabWorkspace,
      panes,
    };
    this.emit();
  }

  setSummaryConnected(id: string, connected: boolean): void {
    (this.summaries[id] ??= emptySummary()).connected = connected;
    this.emit();
  }

  dropSummary(id: string): void {
    delete this.summaries[id];
    this.emit();
  }

  applySummaryEvent(id: string, e: ServerEvent): void {
    const s = this.summaries[id];
    if (!s) return;
    switch (e.event) {
      case "workspace.created":
      case "workspace.updated": {
        const i = s.workspaces.findIndex((w) => w.id === e.data.workspace.id);
        if (i >= 0) s.workspaces.splice(i, 1, e.data.workspace);
        else s.workspaces.push(e.data.workspace);
        break;
      }
      case "workspace.closed":
        s.workspaces = s.workspaces.filter((w) => w.id !== e.data.workspaceId);
        break;
      case "workspace.order_changed": {
        const byId = new Map(s.workspaces.map((w) => [w.id, w] as const));
        const ordered = e.data.workspaceIds.flatMap((wid) => {
          const w = byId.get(wid);
          return w ? [w] : [];
        });
        const rest = s.workspaces.filter((w) => !e.data.workspaceIds.includes(w.id));
        s.workspaces = [...ordered, ...rest];
        break;
      }
      case "tab.created":
      case "tab.updated":
        s.tabWorkspace[e.data.tab.id] = e.data.tab.workspaceId;
        break;
      case "tab.closed":
        delete s.tabWorkspace[e.data.tabId];
        break;
      case "pane.created":
      case "pane.updated":
        s.panes[e.data.pane.id] = { tabId: e.data.pane.tabId, agent: e.data.pane.agent };
        break;
      case "pane.closed":
        delete s.panes[e.data.paneId];
        break;
      case "pane.agent_status_changed": {
        const p = s.panes[e.data.paneId];
        if (p) p.agent = e.data.agent;
        break;
      }
      default:
        return;
    }
    this.emit();
  }

  agentsInWorkspace(id: string, workspaceId: string): AgentInfo[] {
    const s = this.summaries[id];
    if (!s) return [];
    const out: AgentInfo[] = [];
    for (const p of Object.values(s.panes))
      if (p.agent && s.tabWorkspace[p.tabId] === workspaceId) out.push(p.agent);
    return out;
  }
}

/** navigate モードの選択で、別のマシンの workspace を表す鍵。 */
export function remoteKey(machineId: string, workspaceId: string): string {
  return `machine:${machineId}:${workspaceId}`;
}

export function parseRemoteKey(key: string): { machineId: string; workspaceId: string } | null {
  const m = /^machine:([^:]+):(.+)$/.exec(key);
  return m ? { machineId: m[1]!, workspaceId: m[2]! } : null;
}
