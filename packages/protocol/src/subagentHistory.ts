import { z } from "zod";
import type { SubagentInfo } from "./model.js";
import type { AgentSubagentTranscriptResult } from "./messages.js";
import type { AgentSubagentUsageResult } from "./subagentUsage.js";

/** Completed-child history is separate from active/alive AgentInfo.subagents. */
export const AgentSubagentHistoryParams = z.object({
  paneId: z.string().uuid(),
  offset: z.number().int().min(0).max(256).optional(),
  limit: z.number().int().min(1).max(64).optional(),
  /** A different collection revision resets pagination instead of mixing pages. */
  revision: z.string().uuid().optional(),
}).strict();
export type AgentSubagentHistoryParams = z.infer<typeof AgentSubagentHistoryParams>;
export type SubagentTerminalStatus = "completed" | "aborted" | "error";
export interface SubagentHistoryItem extends Pick<SubagentInfo,"id"|"type"|"description"|"model"|"modelBasis"|"reasoningEffort"|"reasoningEffortBasis"|"hasTranscript"> {
  /** Server-issued exact history selection. Never substitute a current child with the same id. */
  entryId: string;
  terminalStatus: SubagentTerminalStatus;
  /** Formal provider timestamps only. Missing is unknown, never an arrival-time guess. */
  startedAt?: number;
  endedAt?: number;
}
export interface AgentSubagentHistoryResult {
  /** unavailable/pending never mean there were zero completed children. */
  status: "ok" | "pending" | "unavailable";
  items: SubagentHistoryItem[];
  /** Next collection index, not a transcript byte offset. */
  offset: number;
  revision?: string;
  reset: boolean;
  more: boolean;
  omittedBefore: boolean;
  /** Only formally observed records, or a partial validation/page, are available. */
  incomplete: boolean;
}

/** Separate strict methods make old peers fail closed instead of stripping a history selector. */
const historySelection = { paneId:z.string().uuid(), agentId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), entryId:z.string().uuid() };
export const AgentSubagentHistoryTranscriptParams=z.object({...historySelection,offset:z.number().int().nonnegative().optional()}).strict();
export type AgentSubagentHistoryTranscriptParams=z.infer<typeof AgentSubagentHistoryTranscriptParams>;
export type AgentSubagentHistoryTranscriptResult=AgentSubagentTranscriptResult;
export const AgentSubagentHistoryUsageParams=z.object(historySelection).strict();
export type AgentSubagentHistoryUsageParams=z.infer<typeof AgentSubagentHistoryUsageParams>;
export type AgentSubagentHistoryUsageResult=AgentSubagentUsageResult;
