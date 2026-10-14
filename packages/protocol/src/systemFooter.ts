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
}
export const SYSTEM_FOOTER_FIELDS = [
  { id: "cpu", label: "CPU使用率" },
  { id: "memory", label: "メモリ使用量" },
  { id: "serverMemory", label: "Sodashitsuのメモリ" },
  { id: "load", label: "ロードアベレージ" },
  { id: "uptime", label: "稼働時間" },
  { id: "host", label: "サーバー名" },
] as const;
export type SystemFooterField = (typeof SYSTEM_FOOTER_FIELDS)[number]["id"];
export interface SystemFooterSettings {
  enabled: boolean;
  fields: SystemFooterField[];
}
export function loadSystemFooterSettings(raw: unknown): SystemFooterSettings {
  const r = raw && typeof raw === "object" ? (raw as Partial<SystemFooterSettings>) : {};
  return {
    enabled: r.enabled === true,
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
): string[] {
  if (!data) return [];
  const total = data.memoryTotalBytes,
    used = Math.max(0, total - data.memoryAvailableBytes);
  const mins = Math.floor(data.uptimeSeconds / 60);
  const values: Record<SystemFooterField, string | undefined> = {
    cpu:
      data.cpuPercent === null
        ? undefined
        : `CPU ${data.cpuPercent.toFixed(0)}% (${data.cpuCount}核)`,
    memory:
      total > 0
        ? `メモリ ${bytes(used)}/${bytes(total)} ${Math.round((used / total) * 100)}%`
        : undefined,
    serverMemory: `Soda ${bytes(data.serverRssBytes)}`,
    load: data.loadAverage
      ? `Load ${data.loadAverage.map((n) => n.toFixed(2)).join("/")}`
      : undefined,
    uptime: `稼働 ${Math.floor(mins / 1440)}日 ${Math.floor(mins / 60) % 24}h ${mins % 60}m`,
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
