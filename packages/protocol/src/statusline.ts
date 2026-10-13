import type { Pane } from "./model.js";
import type { AgentUsage, AccountUsage } from "./usage.js";
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
  { id: "input", label: "入力トークン" },
  { id: "output", label: "出力トークン" },
  { id: "cacheRead", label: "キャッシュ読取トークン" },
  { id: "cacheWrite", label: "キャッシュ書込トークン" },
  { id: "reasoning", label: "推論トークン" },
  { id: "contextTokens", label: "コンテキスト量・上限" },
  { id: "premiumRequests", label: "プレミアムリクエスト数" },
  { id: "session", label: "セッションID" },
  { id: "cwd", label: "作業フォルダ" },
  { id: "subagents", label: "サブエージェント数" },
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
  enabled: boolean;
  /** null follows the available terminal width. */
  columns: number | null;
  tokenFormat: "exact" | "k";
  order: StatuslineField[];
  fields: Record<StatuslineField, boolean>;
  graphs: Record<StatuslineGraph, { visible: boolean; pattern: StatuslinePattern }>;
}
const record = (raw: unknown): Record<string, unknown> =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
export function loadStatuslineSettings(raw: unknown): StatuslineSettings {
  const input = record(raw),
    fields = record(input.fields),
    graphs = record(input.graphs);
  const ids = STATUSLINE_FIELDS.map((f) => f.id);
  const requested = Array.isArray(input.order)
    ? input.order.filter((id): id is StatuslineField => ids.includes(id as StatuslineField))
    : [];
  return {
    enabled: typeof input.enabled === "boolean" ? input.enabled : true,
    columns:
      typeof input.columns === "number" && Number.isFinite(input.columns)
        ? Math.max(8, Math.min(4096, Math.round(input.columns)))
        : null,
    tokenFormat: input.tokenFormat === "k" ? "k" : "exact",
    order: [...new Set([...requested, ...ids])],
    fields: Object.fromEntries(
      STATUSLINE_FIELDS.map(({ id }) => [
        id,
        typeof fields[id] === "boolean" ? fields[id] : ids.indexOf(id) < 10,
      ]),
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

export type StatuslineColor = "name" | "active" | "model" | "good" | "warning" | "danger" | "muted";
export interface StatuslineSegment {
  field: StatuslineField;
  text: string;
  color: StatuslineColor;
}
/** A single formatter for Web/TUI. Missing values never produce placeholders. */
export function statuslineSegments(
  pane: Pane,
  usage: AgentUsage | null | undefined,
  accounts: readonly AccountUsage[],
  settings: StatuslineSettings,
): StatuslineSegment[] {
  if (!pane.agent || pane.virtual || !settings.enabled) return [];
  const values = new Map<StatuslineField, StatuslineSegment[]>();
  const add = (
    field: StatuslineField,
    text: string | null | undefined,
    color: StatuslineColor = "muted",
  ) => {
    if (settings.fields[field] && text)
      values.set(field, [...(values.get(field) ?? []), { field, text, color }]);
  };
  const finite = (n: number | undefined | null): n is number =>
    typeof n === "number" && Number.isFinite(n);
  const tokens = (n: number) =>
    settings.tokenFormat === "k" && Math.abs(n) >= 1000
      ? `${Number((n / 1000).toFixed(1))}k`
      : String(n);
  const severity = (n: number): StatuslineColor =>
    n >= 90 ? "danger" : n >= 70 ? "warning" : "good";
  // The feed can briefly contain the previous agent's usage after a pane changes agents.
  const u = usage?.kind === pane.agent.kind ? usage : undefined;
  add("pane", pane.label || pane.agent.name || pane.agent.label, "name");
  add("agent", pane.agent.kind, "name");
  add("state", pane.agent.state, pane.agent.state === "working" ? "active" : "good");
  add("model", u?.model, "model");
  if (finite(u?.contextUsedPct))
    add(
      "context",
      `Context ${statuslineGauge(u.contextUsedPct, settings.graphs.context)}`,
      severity(u.contextUsedPct),
    );
  if (finite(u?.tokens.total)) add("tokens", `Tokens ${tokens(u.tokens.total)}`);
  if (finite(u?.costUsd)) add("cost", `$${u.costUsd.toFixed(3)}`);
  for (const id of ["input", "output", "cacheRead", "cacheWrite", "reasoning"] as const) {
    const n = u?.tokens[id];
    if (finite(n)) add(id, `${STATUSLINE_FIELDS.find((f) => f.id === id)!.label} ${tokens(n)}`);
  }
  if (finite(u?.contextTokens))
    add(
      "contextTokens",
      `Context ${tokens(u.contextTokens)}${finite(u.contextWindowTokens) ? `/${tokens(u.contextWindowTokens)}` : ""}`,
    );
  if (finite(u?.premiumRequests)) add("premiumRequests", `Premium ${u.premiumRequests}`);
  add(
    "session",
    pane.agentSession?.kind === pane.agent.kind ? pane.agentSession.sessionId : undefined,
  );
  add("cwd", pane.cwd);
  if (pane.agent.subagents) add("subagents", `Subagents ${pane.agent.subagents.count}`);
  for (const account of accounts)
    if (account.kind === pane.agent.kind)
      for (const w of account.windows) {
        if (!finite(w.usedPct)) continue;
        const id = statuslineLimitKind(w);
        add(
          id,
          `${account.label} ${w.label} ${statuslineGauge(w.usedPct, settings.graphs[id])}${w.stale ? " *" : ""}`,
          severity(w.usedPct),
        );
      }
  return settings.order.flatMap((id) => values.get(id) ?? []);
}
