import { z } from "zod";
const timestamp = z.string().datetime({ offset: true });
export const ScheduleTrigger = z.discriminatedUnion("type", [
  z.object({ type: z.literal("once"), at: timestamp }),
  z.object({
    type: z.literal("interval"),
    startAt: timestamp,
    everyMinutes: z.number().int().min(1).max(525600),
  }),
]);
export const ScheduleAction = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reminder"),
    deviceId: z.uuid(),
    text: z.string().trim().min(1).max(1000),
  }),
  z.object({
    type: z.literal("agent"),
    paneId: z.string().min(1),
    text: z.string().trim().min(1).max(16384),
  }),
  z.object({
    type: z.literal("command"),
    workspaceId: z.string().min(1),
    command: z.string().trim().min(1).max(16384),
  }),
]);
export const ScheduleDraft = z.object({
  label: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(true),
  trigger: ScheduleTrigger,
  action: ScheduleAction,
  timeoutSeconds: z.number().int().min(1).max(86400).default(600),
});
export type ScheduleDraft = z.infer<typeof ScheduleDraft>;
export const ScheduledJob = ScheduleDraft.extend({
  id: z.string().uuid(),
  nextRunAt: timestamp.nullable(),
  updatedAt: timestamp,
});
export type ScheduledJob = z.infer<typeof ScheduledJob>;
export const ScheduledRun = z.object({
  id: z.string().uuid(),
  jobId: z.string().uuid(),
  label: z.string(),
  input: z.string(),
  actionType: z.enum(["agent", "command", "reminder"]),
  acknowledgedAt: timestamp.optional(),
  reminderDeviceId:z.uuid().optional(),
  startedAt: timestamp,
  finishedAt: timestamp.nullable(),
  status: z.enum(["running", "sent", "succeeded", "failed", "interrupted"]),
  output: z.string(),
  exitCode: z.number().int().nullable(),
});
export type ScheduledRun = z.infer<typeof ScheduledRun>;
export interface ScheduleListResult {
  jobs: ScheduledJob[];
  runs: ScheduledRun[];
}
export const ScheduleSaveParams = z.object({
  id: z.string().uuid().optional(),
  job: ScheduleDraft,
});
export const ScheduleIdParams = z.object({ id: z.string().uuid() });
