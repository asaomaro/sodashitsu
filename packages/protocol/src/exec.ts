import { z } from "zod";

export const ExecStartParams = z.object({
  command: z.string().min(1).max(65536).refine(s => !s.includes("\0")),
  cwd: z.string().min(1).max(32768).refine(s => !s.includes("\0")),
  encoding: z.enum(["utf-8", "shift_jis", "utf-16le"]).default("utf-8"),
  timeoutMs: z.number().int().min(1).max(300000).default(30000),
}).strict();
export const ExecIdParams = z.object({ id: z.string().uuid() }).strict();
export interface ExecResult {
  id: string;
  status: "running" | "exited";
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
}
export const ExecMethods = {
  "exec.start": ExecStartParams,
  "exec.read": ExecIdParams,
  "exec.cancel": ExecIdParams,
} as const;
export interface ExecResults {
  "exec.start": { id: string };
  "exec.read": ExecResult;
  "exec.cancel": {};
}
