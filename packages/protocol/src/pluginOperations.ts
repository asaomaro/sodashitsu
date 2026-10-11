import { z } from "zod";
import { COMMAND_ID_RE } from "./commands.js";

/** Plugins advertise semantic operations; their handler validates params against inputSchema. */
export const PluginOperationSchema = z.strictObject({
  name: z.string().regex(COMMAND_ID_RE),
  description: z.string().min(1).max(500),
  inputSchema: z.record(z.string(), z.unknown()).refine((v) => BufferlessBytes(v) <= 16_384),
});
function BufferlessBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
export const PluginRegisterSchema = z.strictObject({
  operations: z
    .array(PluginOperationSchema)
    .max(32)
    .refine((v) => new Set(v.map((x) => x.name)).size === v.length),
});
export type PluginOperation = z.output<typeof PluginOperationSchema>;
const Target = {
  key: z.string().min(1).max(2048),
  paneId: z.string().min(1).max(128).optional(),
  tabId: z.string().min(1).max(128).optional(),
  workspaceId: z.string().min(1).max(128).optional(),
};
const singleTarget = (v: {
  paneId?: string | undefined;
  tabId?: string | undefined;
  workspaceId?: string | undefined;
}) => [v.paneId, v.tabId, v.workspaceId].filter(Boolean).length === 1;
export const PluginOperationsParams = z
  .strictObject(Target)
  .refine(singleTarget, "Specify one target");
export const PluginCallParams = z
  .strictObject({
    ...Target,
    operation: z.string().regex(COMMAND_ID_RE),
    params: z.record(z.string(), z.unknown()).refine((v) => BufferlessBytes(v) <= 65_536),
  })
  .refine(singleTarget, "Specify one target");
export type PluginTarget = z.output<typeof PluginOperationsParams>;
export type PluginCall = z.output<typeof PluginCallParams>;
export interface PluginOperationsResult {
  key: string;
  paneId: string;
  tabId: string;
  workspaceId: string;
  operations: PluginOperation[];
}
export const PluginResultSchema = z
  .strictObject({
    callId: z.string().uuid(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().max(500).optional(),
  })
  .refine((v) => BufferlessBytes(v) <= 262_144);
