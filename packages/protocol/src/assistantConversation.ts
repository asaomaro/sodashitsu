import { z } from "zod";
import type { ConversationPage } from "./conversation.js";
export const AssistantConversationKind = z.enum(["claude", "codex", "copilot", "agy"]);
export type AssistantConversationKind = z.infer<typeof AssistantConversationKind>;
export const AssistantConversationParams = z.object({
  deviceId: z.uuid(), instanceId: z.uuid(),
  offset: z.number().int().min(0).max(1024 ** 3).default(0),
}).strict();
export interface AssistantConversationPage extends Omit<ConversationPage, "kind"> {
  kind: AssistantConversationKind;
  reset?: boolean;
}
