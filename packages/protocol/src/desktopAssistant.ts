import { z } from "zod";
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
export const DesktopAssistantPreferences = z
  .object({
    version: z.literal(1).default(1),
    enabled: z.boolean().default(false),
    mode: z.enum(["character", "tray"]).default("character"),
    characterId: AssistantCharacterId.default("captain-female"),
    serverOrigin: Origin.default("http://127.0.0.1:7780"),
    launchAtLogin: z.boolean().default(false),
    mute: z.boolean().default(false),
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
