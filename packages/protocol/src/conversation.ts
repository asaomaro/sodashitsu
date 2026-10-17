import { z } from "zod";
export const ConversationKind = z.enum(["claude", "codex"]);
export type ConversationKind = z.infer<typeof ConversationKind>;
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  at?: string;
}
export interface ConversationPage {
  kind: ConversationKind;
  sessionId: string;
  messages: ConversationMessage[];
  nextOffset: number | null;
  partial: boolean;
  /** Byte position after the last complete record. */
  endOffset?: number;
}
export interface PastAgentSession {
  kind: ConversationKind;
  sessionId: string;
  title: string;
  cwd: string | null;
  updatedAt: number;
}
export const AgentConversationParams = z.object({
  paneId: z.string().min(1),
  offset: z
    .number()
    .int()
    .min(0)
    .max(1024 * 1024 * 1024)
    .default(0),
});
export const AgentSessionsParams = z.object({
  kind: ConversationKind.optional(),
  query: z.string().max(200).default(""),
  limit: z.number().int().min(1).max(200).default(100),
});
export const AgentResumeParams = z.object({
  kind: ConversationKind,
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
  paneId: z.string().min(1),
});
export const AGENT_HEADER_ACTIONS = [
  "messages",
  "summary",
  "notes",
  "todos",
  "compact",
  "clear",
  "usage",
  "permissions",
  "fork",
] as const;
export type AgentHeaderAction = (typeof AGENT_HEADER_ACTIONS)[number];
export const AgentCommandParams = z.object({
  paneId: z.string().min(1),
  action: z.enum(["compact", "clear", "usage", "permissions"]),
});
export interface SummarySettings {
  kind: ConversationKind;
  model: string;
  sessionId: string;
  autoUpdate?: boolean | undefined;
}
export const SummarySettingsSchema = z.object({
  autoUpdate: z.boolean().optional(),
  kind: ConversationKind,
  model: z
    .string()
    .max(100)
    .regex(/^[a-zA-Z0-9_.:/-]*$/),
  sessionId: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z0-9_-]*$/),
});
export const AgentSummaryParams = z.object({
  mode: z.enum(["update", "rebuild"]).default("update"),
  paneId: z.string().min(1),
  settings: SummarySettingsSchema,
});
export interface ConversationSummary {
  updatedAt?: number;
  stale?: boolean;
  sourceSessionId?: string;
  text: string;
  sessionId: string | null;
  model: string;
  kind: ConversationKind;
  partial: boolean;
}
export const AGENT_COMMANDS: Readonly<Record<string, Partial<Record<AgentHeaderAction, string>>>> =
  {
    agy: { usage: "/usage", permissions: "/permissions" },
    claude: { compact: "/compact", clear: "/clear", usage: "/usage", permissions: "shift+tab" },
    copilot: { compact: "/compact", clear: "/clear", usage: "/usage", permissions: "/permissions" },
    codex: { compact: "/compact", clear: "/clear", usage: "/status", permissions: "/permissions" },
  };
export const HEADER_ACTION_LABELS: Record<AgentHeaderAction, string> = {
  messages: "送信メッセージ",
  summary: "会話の要約",
  notes: "セッションのメモ",
  todos: "エージェントのToDo",
  compact: "文脈を圧縮",
  clear: "新しい会話",
  usage: "利用状況",
  permissions: "承認モード",
  fork: "別ペインで相談（fork）",
};
export function headerActionsFor(
  kind: string,
  hasSession: boolean,
  enabled: readonly AgentHeaderAction[],
): AgentHeaderAction[] {
  return enabled.filter((action) =>
    action === "notes"
      ? hasSession && !!kind
      : action === "todos"
        ? hasSession && ["claude", "codex"].includes(kind)
        : action === "messages" || action === "summary"
          ? hasSession && ["claude", "codex"].includes(kind)
          : action === "fork"
            ? hasSession && ["claude", "codex", "copilot"].includes(kind)
            : !!AGENT_COMMANDS[kind]?.[action],
  );
}
export const DEFAULT_AGENT_HEADER_ACTIONS: AgentHeaderAction[] = [
  "messages",
  "summary",
  "notes",
  "todos",
  "compact",
  "usage",
  "permissions",
  "fork",
];
export function loadAgentHeaderActions(raw: unknown): AgentHeaderAction[] {
  return Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter((x): x is AgentHeaderAction =>
            AGENT_HEADER_ACTIONS.includes(x as AgentHeaderAction),
          ),
        ),
      ]
    : [...DEFAULT_AGENT_HEADER_ACTIONS];
}
export function loadSummarySettings(raw: unknown): SummarySettings {
  const r = SummarySettingsSchema.safeParse(raw);
  return r.success ? r.data : { kind: "claude", model: "", sessionId: "" };
}

export type AgentActionVisibility = "display" | "menu" | "hidden";
export type AgentActionSettings = Record<AgentHeaderAction, AgentActionVisibility>;
export function loadAgentActionSettings(raw: unknown, legacy?: unknown): AgentActionSettings {
  const shown = loadAgentHeaderActions(legacy);
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    AGENT_HEADER_ACTIONS.map((action) => {
      const value = source[action];
      return [
        action,
        value === "display" || value === "menu" || value === "hidden"
          ? value
          : shown.includes(action)
            ? "display"
            : "hidden",
      ];
    }),
  ) as AgentActionSettings;
}
export function configuredAgentActions(
  raw: unknown,
  legacy: unknown,
  menu = false,
): AgentHeaderAction[] {
  const settings = loadAgentActionSettings(raw, legacy);
  return AGENT_HEADER_ACTIONS.filter(
    (action) => settings[action] === "display" || (menu && settings[action] === "menu"),
  );
}
