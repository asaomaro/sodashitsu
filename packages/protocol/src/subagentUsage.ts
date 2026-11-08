import {z} from "zod";
import type {AgentUsageTokens,UsageCredits,UsageSource} from "./usage.js";
/** Numeric child-only projection. Never a parent/account/weekly usage object. */
export interface SubagentUsage {
  source:UsageSource;
  /** Provider record time only; omitted when unavailable. */
  observedAt?:number;
  /** Consumption totals cover this child alone, or its provider-reported subtree. Context is always this child's own session. */
  consumptionScope:"self"|"subtree";
  tokens?:AgentUsageTokens;
  contextTokens?:number;
  contextWindowTokens?:number;
  contextUsedPct?:number;
  costUsd?:number;
  costBasis?:"reported"|"cost-state";
  costAsOf?:number;
  costPartial?:boolean;
  credits?:UsageCredits;
  partial?:boolean;
  scanning?:boolean;
}
export const AgentSubagentUsageParams=z.object({paneId:z.string().min(1).max(128),agentId:z.string().min(1).max(128)}).strict();
export type AgentSubagentUsageParams=z.infer<typeof AgentSubagentUsageParams>;
export interface AgentSubagentUsageResult {
  status:"ok"|"unavailable";
  usage?:SubagentUsage;
  /** Fixed reason; never a path, record body or credential. */
  reason?:string;
}
