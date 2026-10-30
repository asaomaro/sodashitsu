import { z } from "zod";
import { agentStartExecutable } from "./agentStart.js";
import type { AgentInfo } from "./model.js";
/** Explicitly configured Soda endpoint only. Credentials, paths, fragments and insecure LAN are not accepted. */
export function desktopAssistantOrigin(input: string): string {
  const u = new URL(input);
  if (u.username || u.password || u.search || u.hash || u.pathname !== "/")
    throw Error("操舵室の接続先にはオリジンだけを指定してください");
  if (
    u.protocol !== "https:" &&
    !(u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
  )
    throw Error("リモート接続にはHTTPSが必要です");
  return u.origin;
}
const Origin = z
  .string()
  .min(1)
  .max(2048)
  .transform((input, ctx) => {
    try {
      return desktopAssistantOrigin(input);
    } catch {
      ctx.addIssue({ code: "custom", message: "接続先のURLを確認してください" });
      return z.NEVER;
    }
  });
export const AssistantCharacterId = z
  .string()
  .regex(
    /^(captain-(?:male|female|robot)|plugin:[a-z0-9][a-z0-9_-]{0,63}\/[a-z0-9][a-z0-9_-]{0,63})$/,
  );
/** Local whisper.cpp only. No remote audio upload is implicit in enabling this setting. */
export function desktopAssistantTranscriptionOrigin(input: string): string {
  const url = new URL(input);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("文字起こしには、このPCのローカルWhisperサーバのHTTPオリジンを指定してください。");
  return url.origin;
}
const TranscriptionOrigin = z
  .string()
  .max(2048)
  .transform((input, ctx) => {
    try {
      return desktopAssistantTranscriptionOrigin(input);
    } catch {
      ctx.addIssue({ code: "custom", message: "文字起こしのローカルURLを確認してください" });
      return z.NEVER;
    }
  });
export const DesktopAssistantPreferences = z
  .object({
    version: z.literal(1).default(1),
    enabled: z.boolean().default(false),
    mode: z.enum(["character", "tray"]).default("character"),
    characterId: AssistantCharacterId.default("captain-female"),
    serverOrigin: Origin.default("http://127.0.0.1:7780"),
    launchAtLogin: z.boolean().default(false),
    mute: z.boolean().default(false),
    ocrEnabled: z.boolean().default(false),
    ocrExecutable: z
      .string()
      .max(2048)
      .refine(
        (value) =>
          value === "" || (/^(?:\/|[A-Za-z]:[\\\\/])/.test(value) && !/[\u0000\r\n]/.test(value)),
        "OCR実行ファイルの絶対パスを指定してください",
      )
      .default(""),
    ocrLanguage: z
      .string()
      .regex(/^[a-z_]{2,16}(?:\+[a-z_]{2,16}){0,3}$/)
      .default("jpn+eng"),
    transcriptionEnabled: z.boolean().default(false),
    transcriptionOrigin: TranscriptionOrigin.default("http://127.0.0.1:8080"),
    reducedMotion: z.boolean().default(false),
    characterSize: z.number().int().min(64).max(512).default(192),
    position: z
      .object({
        displayId: z.string().min(1).max(128),
        x: z.number().int().min(-100000).max(100000),
        y: z.number().int().min(-100000).max(100000),
      })
      .strict()
      .nullable()
      .default(null),
  })
  .strict();
export type DesktopAssistantPreferences = z.infer<typeof DesktopAssistantPreferences>;
export const AssistantSource = z
  .object({
    serverOrigin: Origin,
    machineId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/),
    workspaceId: z.uuid(),
    paneId: z.uuid(),
    agentInstanceId: z.uuid(),
  })
  .strict();
export type AssistantSource = z.infer<typeof AssistantSource>;
export const AssistantNotice = z
  .object({
    id: z.uuid(),
    key: z.string().min(1).max(200),
    kind: z.enum(["attention", "done", "failed"]),
    source: AssistantSource,
    title: z.string().min(1).max(160),
    message: z.string().max(1000),
    at: z.number().int().nonnegative(),
  })
  .strict();
export type AssistantNotice = z.infer<typeof AssistantNotice>;

export const AssistantAgentKind = z
  .string()
  .max(64)
  .refine((kind) => agentStartExecutable(kind) !== null, "未対応のエージェントです");
/** Server-created workspace ownership; ordinary workspace.create does not accept this field. */
const AssistantDeviceId = z.uuid().transform((value) => value.toLowerCase());
/** Injective full-UUID encoding within the agent name's32-character limit. */
export function assistantAgentName(deviceId: string): string {
  const id = AssistantDeviceId.parse(deviceId);
  return `asst-${BigInt(`0x${id.replaceAll("-", "")}`).toString(36)}`;
}
export const AssistantWorkspaceBinding = z
  .object({
    deviceId: AssistantDeviceId,
    paneId: z.uuid(),
    kind: AssistantAgentKind,
    name: z.string().regex(/^asst-[0-9a-z]{1,25}$/),
    launchRequested: z.boolean(),
    lastInstanceId: z.uuid().optional(),
    sessionId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,128}$/)
      .optional(),
  })
  .strict()
  .refine(
    (binding) => binding.name === assistantAgentName(binding.deviceId),
    "専用セッションの所有情報と名前が一致しません",
  );
export type AssistantWorkspaceBinding = z.infer<typeof AssistantWorkspaceBinding>;
export const AssistantSessionGetParams = z.object({ deviceId: AssistantDeviceId }).strict();
export const AssistantSessionEnsureParams = AssistantSessionGetParams.extend({
  kind: AssistantAgentKind,
  retry: z.boolean().default(false),
}).strict();
export const AssistantSessionPromptParams = AssistantSessionGetParams.extend({
  instanceId: z.uuid(),
  text: z.string().min(1).max(8192),
}).strict();
export const AssistantSessionAdoptParams = AssistantSessionGetParams.extend({
  instanceId: z.uuid(),
}).strict();
export const AssistantSessionKeysParams = AssistantSessionGetParams.extend({
  instanceId: z.uuid(),
  keys: z.array(z.string().min(1).max(64)).min(1).max(256),
}).strict();
export interface AssistantSessionInfo {
  deviceId: string;
  workspaceId: string;
  tabId: string | null;
  paneId: string;
  kind: string;
  state: "shell" | "starting" | "ready" | "stopped" | "conflict";
  agent: AgentInfo | null;
  /** Visible candidate for an explicit user choice; it never grants permission to send input. */
  observedAgent: AgentInfo | null;
}

export const AssistantSourceParams = z
  .object({ source: AssistantSource, key: z.string().min(1).max(200) })
  .strict();
export const AssistantReplyParams = AssistantSourceParams.extend({
  text: z.string().trim().min(1).max(8192),
}).strict();
export const AssistantReplyKeysParams = AssistantSourceParams.extend({
  keyName: z.enum(["Enter", "Escape", "y", "n"]),
}).strict();
export interface AssistantSourceInfo {
  paneId: string;
  tabId: string;
  workspaceId: string;
  title: string;
  agent: AgentInfo;
}

export const AssistantPanelTarget = z
  .object({ assistantPane: z.uuid(), assistantWorkspace: z.uuid(), assistantInstance: z.uuid() })
  .strict();
