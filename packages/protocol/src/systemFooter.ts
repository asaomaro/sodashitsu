import {
  STATUSLINE_GRAPH_PATTERNS,
  statuslineGauge,
  type StatuslinePattern,
  type StatuslineColor,
} from "./statusline.js";
import type { AgentState, Pane } from "./model.js";
export interface SystemAgentCounts {
  total: number;
  states: Record<AgentState, number>;
}
export function countSystemAgents(panes: Iterable<Pane>): SystemAgentCounts {
  const counts: SystemAgentCounts = {
    total: 0,
    states: { working: 0, idle: 0, blocked: 0, unknown: 0 },
  };
  for (const pane of panes)
    if (pane.agent && !pane.virtual) {
      counts.total++;
      counts.states[pane.agent.state]++;
    }
  return counts;
}
export const SYSTEM_FOOTER_GRAPHS = [
  { id: "cpu", label: "CPU使用率" },
  { id: "memory", label: "メモリ使用率" },
  { id: "serverMemory", label: "Sodashitsuのメモリ使用率" },
] as const;
export type SystemFooterGraphs = Record<
  (typeof SYSTEM_FOOTER_GRAPHS)[number]["id"],
  { visible: boolean; pattern: StatuslinePattern }
>;
/** Metrics describe the server host (the Linux VM when Soda runs in WSL). */
export interface SystemResources {
  sampledAt: number;
  cpuPercent: number | null;
  cpuCount: number;
  memoryTotalBytes: number;
  memoryAvailableBytes: number;
  serverRssBytes: number;
  uptimeSeconds: number;
  loadAverage: number[] | null;
  hostname: string;
  /** Counts cover live agent panes on the connected server, not transcript subagents. */
  agents?: SystemAgentCounts;
}
export const SYSTEM_FOOTER_FIELDS = [
  { id: "cpu", label: "CPU使用率" },
  { id: "memory", label: "メモリ使用量" },
  { id: "serverMemory", label: "Sodashitsuのメモリ" },
  { id: "load", label: "ロードアベレージ" },
  { id: "uptime", label: "稼働時間" },
  { id: "host", label: "サーバー名" },
  { id: "agents", label: "エージェント総数" },
  { id: "working", label: "エージェント: 作業中" },
  { id: "idle", label: "エージェント: 待機" },
  { id: "blocked", label: "エージェント: 応答待ち" },
  { id: "unknown", label: "エージェント: 不明" },
] as const;
export type SystemFooterField = (typeof SYSTEM_FOOTER_FIELDS)[number]["id"];
export interface SystemFooterSettings {
  enabled: boolean;
  colorMode?: "mono" | "color";
  fields: SystemFooterField[];
  graphs?: SystemFooterGraphs;
}
export function loadSystemFooterSettings(
  raw: unknown,
): SystemFooterSettings & { graphs: SystemFooterGraphs } {
  const r = raw && typeof raw === "object" ? (raw as Partial<SystemFooterSettings>) : {};
  return {
    enabled: r.enabled === true,
    colorMode: r.colorMode === "color" ? "color" : "mono",
    graphs: Object.fromEntries(
      SYSTEM_FOOTER_GRAPHS.map(({ id }) => {
        const g = r.graphs?.[id];
        return [
          id,
          {
            visible: g?.visible === true,
            pattern: STATUSLINE_GRAPH_PATTERNS.some((p) => p.id === g?.pattern)
              ? g!.pattern
              : "blocks",
          },
        ];
      }),
    ) as SystemFooterGraphs,
    fields: Array.isArray(r.fields)
      ? [...new Set(r.fields.filter((f) => SYSTEM_FOOTER_FIELDS.some((k) => k.id === f)))]
      : ["cpu", "memory"],
  };
}
function bytes(n: number) {
  return n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)}GiB` : `${Math.round(n / 1024 ** 2)}MiB`;
}
export function systemFooterSegments(
  data: SystemResources | undefined,
  fields: SystemFooterField[],
  graphs = loadSystemFooterSettings(undefined).graphs,
): string[] {
  if (!data) return [];
  const total = data.memoryTotalBytes,
    used = Math.max(0, total - data.memoryAvailableBytes);
  const mins = Math.floor(data.uptimeSeconds / 60);
  const values: Record<SystemFooterField, string | undefined> = {
    cpu:
      data.cpuPercent === null
        ? undefined
        : `CPU ${statuslineGauge(data.cpuPercent, graphs.cpu)} (${data.cpuCount}核)`,
    memory:
      total > 0
        ? `メモリ ${bytes(used)}/${bytes(total)} ${statuslineGauge((used / total) * 100, graphs.memory)}`
        : undefined,
    serverMemory: `Soda ${bytes(data.serverRssBytes)}${total > 0 ? " " + statuslineGauge((data.serverRssBytes / total) * 100, graphs.serverMemory) : ""}`,
    load: data.loadAverage
      ? `Load ${data.loadAverage.map((n) => n.toFixed(2)).join("/")}`
      : undefined,
    uptime: `稼働 ${Math.floor(mins / 1440)}日 ${Math.floor(mins / 60) % 24}h ${mins % 60}m`,
    agents: data.agents ? `エージェント ${data.agents.total}` : undefined,
    working: data.agents ? `作業中 ${data.agents.states.working}` : undefined,
    idle: data.agents ? `待機 ${data.agents.states.idle}` : undefined,
    blocked: data.agents ? `応答待ち ${data.agents.states.blocked}` : undefined,
    unknown: data.agents ? `不明 ${data.agents.states.unknown}` : undefined,
    host: data.hostname.replace(/[\x00-\x1f\x7f]/g, ""),
  };
  return fields.flatMap((f) => (values[f] ? [values[f]!] : []));
}

export function systemFooterPlaceholder(
  data: SystemResources | undefined,
  failed: boolean,
): string {
  return data
    ? "選択した情報は利用できません"
    : failed
      ? "サーバー情報を取得できません"
      : "サーバー情報を読み込み中…";
}

/** Shared semantic colors for Web and TUI; mono uses the theme's ordinary foreground. */
export function systemFooterDisplaySegments(
  data: SystemResources | undefined,
  raw: SystemFooterSettings,
): { field: SystemFooterField; text: string; color: StatuslineColor }[] {
  if (!data) return [];
  const settings = loadSystemFooterSettings(raw);
  const severity = (n: number): StatuslineColor =>
    n >= 90 ? "danger" : n >= 70 ? "warning" : "good";
  const colors: Partial<Record<SystemFooterField, StatuslineColor>> = {
    cpu: data.cpuPercent === null ? "muted" : severity(data.cpuPercent),
    memory: severity(
      data.memoryTotalBytes > 0
        ? ((data.memoryTotalBytes - data.memoryAvailableBytes) / data.memoryTotalBytes) * 100
        : 0,
    ),
    serverMemory: severity(
      data.memoryTotalBytes > 0 ? (data.serverRssBytes / data.memoryTotalBytes) * 100 : 0,
    ),
    load: "model",
    host: "model",
    agents: "name",
    working: "active",
    idle: "good",
    blocked: "danger",
  };
  return settings.fields.flatMap((field) =>
    systemFooterSegments(data, [field], settings.graphs).map((text) => ({
      field,
      text,
      color: settings.colorMode === "color" ? (colors[field] ?? "muted") : "muted",
    })),
  );
}
