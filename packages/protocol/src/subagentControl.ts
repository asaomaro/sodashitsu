import { z } from "zod";

/** IDs only: clients cannot select a process, daemon, file or provider endpoint. */
export const AgentSubagentControlParams = z.object({
  paneId: z.string().uuid(),
  agentId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
}).strict();
export type AgentSubagentControlParams = z.infer<typeof AgentSubagentControlParams>;
export const AgentSubagentSendParams = AgentSubagentControlParams.extend({
  leaseId: z.string().uuid(),
  requestId: z.string().uuid(),
  text: z.string().min(1).max(16_384).refine(text => text.trim().length > 0 && !text.includes("\0")),
}).strict();
export type AgentSubagentSendParams = z.infer<typeof AgentSubagentSendParams>;

/** These describe Soda's available transport, not whether a product's own UI can address a child. */
export type SubagentControlReason =
  | "ready" | "transport-not-connected" | "transport-unavailable"
  | "target-unavailable" | "target-busy" | "scope-expired";
export type AgentSubagentControlResult =
  | { mode: "direct"; reason: "ready"; leaseId: string; expiresAt: number }
  | { mode: "parent-draft"; reason: Exclude<SubagentControlReason, "ready"> };
/** accepted acknowledges input only; it is never task completion. Unknown delivery must not be retried automatically. */
export type AgentSubagentSendResult =
  | { status: "accepted"; reason: "accepted"; turnId: string }
  | { status: "rejected"; reason: Exclude<SubagentControlReason, "ready"> | "request-conflict" }
  | { status: "delivery-unknown"; reason: "delivery-unknown" };
