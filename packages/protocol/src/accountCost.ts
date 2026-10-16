import { z } from "zod";

export const AccountCostParams = z.object({ accountKey: z.string().min(1).max(128) });
export type AccountCostParams = z.infer<typeof AccountCostParams>;
export interface CostGroup {
  label: string;
  usd: number;
  sessions: number;
}
/** Recorded USD, not subscription payments. Unattributed amounts remain visible as unknown. */
export interface AccountCostResult {
  accountKey: string;
  totalUsd?: number;
  sessions: number;
  unpricedSessions: number;
  byModel: CostGroup[];
  byEffort: CostGroup[];
  partial: boolean;
  asOf: number;
}
