export const STATUSLINE_FIELDS = [
  { id: "pane", label: "ペイン名" },
  { id: "agent", label: "エージェント種類" },
  { id: "state", label: "エージェント状態" },
  { id: "model", label: "モデル" },
  { id: "context", label: "コンテキスト" },
  { id: "tokens", label: "トークン数" },
  { id: "cost", label: "コスト" },
  { id: "fiveHour", label: "5時間制限" },
  { id: "weekly", label: "週制限" },
  { id: "otherLimits", label: "その他の利用枠" },
] as const;
export type StatuslineField = (typeof STATUSLINE_FIELDS)[number]["id"];
export const STATUSLINE_GRAPH_PATTERNS = [
  { id: "blocks", label: "斜線ブロック", filled: "▰", empty: "▱" },
  { id: "squares", label: "四角", filled: "■", empty: "□" },
  { id: "dots", label: "丸", filled: "●", empty: "○" },
  { id: "ascii", label: "ASCII", filled: "#", empty: "-" },
] as const;
export type StatuslinePattern = (typeof STATUSLINE_GRAPH_PATTERNS)[number]["id"];
export const STATUSLINE_GRAPHS = [
  { id: "context", label: "コンテキスト" },
  { id: "fiveHour", label: "5時間制限" },
  { id: "weekly", label: "週制限" },
  { id: "otherLimits", label: "その他の利用枠" },
] as const;
export type StatuslineGraph = (typeof STATUSLINE_GRAPHS)[number]["id"];
export interface StatuslineSettings {
  fields: Record<StatuslineField, boolean>;
  graphs: Record<StatuslineGraph, { visible: boolean; pattern: StatuslinePattern }>;
}
const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
export function loadStatuslineSettings(raw: unknown): StatuslineSettings {
  const input = record(raw),
    fields = record(input.fields),
    graphs = record(input.graphs);
  return {
    fields: Object.fromEntries(
      STATUSLINE_FIELDS.map(({ id }) => [id, typeof fields[id] === "boolean" ? fields[id] : true]),
    ) as StatuslineSettings["fields"],
    graphs: Object.fromEntries(
      STATUSLINE_GRAPHS.map(({ id }) => {
        const g = record(graphs[id]);
        return [
          id,
          {
            visible: typeof g.visible === "boolean" ? g.visible : true,
            pattern: STATUSLINE_GRAPH_PATTERNS.some((p) => p.id === g.pattern)
              ? g.pattern
              : "blocks",
          },
        ];
      }),
    ) as StatuslineSettings["graphs"],
  };
}
export function statuslineLimitKind(window: {
  label: string;
  windowMinutes?: number;
}): Exclude<StatuslineGraph, "context"> {
  if (
    typeof window.windowMinutes === "number" &&
    Number.isFinite(window.windowMinutes) &&
    window.windowMinutes > 0
  )
    return window.windowMinutes === 300
      ? "fiveHour"
      : window.windowMinutes === 10080
        ? "weekly"
        : "otherLimits";
  if (/(?:^|[^\d])5[\s-]*(?:hours?\b|h\b|時間)/i.test(window.label)) return "fiveHour";
  if (/週|\bweeks?\b|(?:^|[^\d])7[\s-]*(?:days?\b|d\b|日)/i.test(window.label)) return "weekly";
  return "otherLimits";
}
export function statuslineGauge(
  percent: number,
  graph: StatuslineSettings["graphs"][StatuslineGraph],
): string {
  if (!Number.isFinite(percent)) return "—";
  const p = STATUSLINE_GRAPH_PATTERNS.find((p) => p.id === graph.pattern)!;
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 10);
  return (
    (graph.visible ? p.filled.repeat(filled) + p.empty.repeat(10 - filled) + " " : "") +
    Math.round(percent) +
    "%"
  );
}
