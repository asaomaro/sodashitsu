import { z } from "zod";
import { ExecStartParams } from "./exec.js";

export const WorkKind = z.enum(["claude", "codex"]);
export type WorkKind = z.infer<typeof WorkKind>;
// New entities are UUIDs; restored pre-migration sessions still contain w3/p3.
// These IDs also become private directory names, so accept only safe components.
const entityId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).refine(s => !/^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])$/i.test(s));
export const WorkBinding = z.object({
  machineId: z.string().regex(/^[a-f0-9]{32}$/),
  workspaceId: entityId,
  folder: z.string().min(1).max(32768),
  root: z.string().min(1).max(32768),
  identity: z.string().regex(/^[a-f0-9]{64}$/),
  agentKind: WorkKind,
  sourceSession: z.string().max(128).nullable(),
}).strict();
export type WorkBinding = z.infer<typeof WorkBinding>;
const scope = { workspaceId: entityId, expectedFolder: z.string().min(1).max(32768), expectedRoot: z.string().min(1).max(32768).optional(), expectedIdentity: z.string().regex(/^[a-f0-9]{64}$/).optional(), agentKind: WorkKind };
const name = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/).refine(s => !/[.]$/.test(s) && !/^(?:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)/i.test(s));
export const WorkTransferMeta = z.object({
  kind: WorkKind, sessionId: z.string().uuid(), sourcePaneId: entityId,
  bytes: z.number().int().min(1).max(32 * 1024 * 1024), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  memories: z.array(z.object({ name: name.refine(n => !["transcript.jsonl", "sodashitsu-handoff.md"].includes(n.toLowerCase())), text: z.string().max(65536) }).strict()).max(32),
  warnings: z.array(z.string().max(500)).max(20),
}).strict();
export type WorkTransferMeta = z.infer<typeof WorkTransferMeta>;
const transferId = z.string().uuid();
export const WorkTransferMethods = {
  "work.export_start": z.object({ paneId: entityId }).strict(),
  "work.export_read": z.object({ id: transferId, offset: z.number().int().min(0).max(32 * 1024 * 1024) }).strict(),
  "work.import_start": z.object({ ...scope, meta: WorkTransferMeta }).strict(),
  "work.import_chunk": z.object({ id: transferId, offset: z.number().int().min(0).max(32 * 1024 * 1024), data: z.string().max(90000).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict(),
  "work.import_finish": z.object({ id: transferId }).strict(),
} as const;
export const WORK_FILE_MAX_BYTES = 100 * 1024 * 1024;
export const WORK_FILE_CHUNK_BYTES = 64 * 1024;
const filePath = z.string().min(1).max(4096).refine(s => !s.includes("\0"));
export const WorkFileRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check") }).strict(),
  z.object({ action: z.literal("read_start"), path: filePath }).strict(),
  z.object({ action: z.literal("write_start"), path: filePath, bytes: z.number().int().min(0).max(WORK_FILE_MAX_BYTES) }).strict(),
  z.object({ action: z.literal("read"), id: transferId, offset: z.number().int().min(0).max(WORK_FILE_MAX_BYTES) }).strict(),
  z.object({ action: z.literal("write"), id: transferId, offset: z.number().int().min(0).max(WORK_FILE_MAX_BYTES), data: z.string().max(87384).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict(),
  z.object({ action: z.literal("finish"), id: transferId, sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ action: z.literal("abort"), id: transferId }).strict(),
]);
export type WorkFileRequest = z.infer<typeof WorkFileRequest>;
export interface WorkFileResult { id?: string; bytes?: number; data?: string; offset?: number; done?: boolean; sha256?: string; destination?: string }
export const WorkMethods = {
  "work.file_transfer": z.object({ ...scope, request: WorkFileRequest }).strict(),
  "work.binding": z.discriminatedUnion("action", [
    z.object({ action: z.literal("get"), paneId: entityId }).strict(),
    z.object({ action: z.literal("clear"), paneId: entityId }).strict(),
    z.object({ action: z.literal("set"), paneId: entityId, binding: WorkBinding }).strict(),
  ]),
  "work.inspect": z.object(scope).strict(),
  "work.exec": ExecStartParams.omit({ cwd: true }).extend(scope).strict(),
  "work.skill": z.object({ ...scope, id: z.string().regex(/^[a-f0-9]{64}$/), path: z.string().min(1).max(4096).default("SKILL.md") }).strict(),
  "work.memory": z.object({ ...scope, sourcePaneId: entityId, action: z.enum(["list", "read", "write"]), name: name.default("MEMORY.md"), content: z.string().max(262144).optional(), version: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
} as const;
export interface WorkSkill { id: string; name: string; description: string; scope: string; directory: string }
export interface WorkInspection { folder: string; root: string; identity: string; platform: string; skills: WorkSkill[]; truncated: boolean; instructions: { path: string; text: string }[] }
export interface WorkMemory { directory: string; files?: string[]; text?: string; version?: string }
export interface WorkResults {
  "work.file_transfer": WorkFileResult;
  "work.binding": { binding: WorkBinding | null };
  "work.inspect": WorkInspection;
  "work.exec": { id: string };
  "work.skill": { text: string; directory: string; path: string };
  "work.memory": WorkMemory;
  "work.export_start": { id: string; meta: WorkTransferMeta };
  "work.export_read": { data: string; done: boolean };
  "work.import_start": { id: string };
  "work.import_chunk": { offset: number };
  "work.import_finish": { directory: string; nativePath: string | null; resumeArgv: string[] | null; cwd: string; warnings: string[] };
}
