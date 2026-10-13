import { z } from "zod";
export const SessionToolsParams = z.object({ paneId: z.string().min(1) });
const SessionIdentity = { kind: z.string().min(1).max(100), sessionId: z.string().min(1).max(128) };
export const SessionNoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(200_000),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  group: z.string().trim().max(100),
  revision: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type SessionNote = z.infer<typeof SessionNoteSchema>;
export interface SessionNotes {
  kind: string;
  sessionId: string;
  notes: SessionNote[];
}
export const SessionNoteSaveParams = SessionToolsParams.extend({
  ...SessionIdentity,
  id: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(),
  title: SessionNoteSchema.shape.title,
  body: SessionNoteSchema.shape.body,
  tags: SessionNoteSchema.shape.tags.default([]),
  group: SessionNoteSchema.shape.group.default(""),
});
export const SessionNoteDeleteParams = SessionToolsParams.extend({
  ...SessionIdentity,
  id: z.string().uuid(),
  revision: z.number().int().positive(),
});
export interface AgentTodo {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
  description?: string;
}
export interface AgentTodos {
  kind: string;
  sessionId: string;
  items: AgentTodo[];
  partial: boolean;
}
