import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { realRootsOf, underRoot } from "../agent/safeFile.js";
import { openVerified, readRange } from "../agent/safeFile.js";
import type { AgentTodo, AgentTodos } from "@sodashitsu/protocol";
import type { ConversationService } from "./ConversationService.js";

function normalized(rows: unknown): AgentTodo[] | null {
  if (!Array.isArray(rows)) return null;
  return rows.slice(0, 500).flatMap((r, i) => {
    if (!r || typeof r !== "object") return [];
    const text = r.content ?? r.step ?? r.subject;
    if (typeof text !== "string" || !["pending", "in_progress", "completed"].includes(r.status))
      return [];
    return [
      {
        id: String(r.id ?? i).slice(0, 100),
        text: text.slice(0, 4000),
        status: r.status as AgentTodo["status"],
      },
    ];
  });
}
export function todoSnapshot(row: any): AgentTodo[] | null {
  const blocks = row?.message?.content;
  if (Array.isArray(blocks)) {
    let found: AgentTodo[] | null = null;
    for (const block of blocks)
      if (block?.type === "tool_use" && block.name === "TodoWrite")
        found = normalized(block.input?.todos) ?? found;
    if (found) return found;
  }
  const p = row?.type === "response_item" ? row.payload : null;
  if (p?.type === "function_call" && /(^|\.)update_plan$/.test(p.name)) {
    try {
      return normalized(JSON.parse(p.arguments).plan);
    } catch {}
  }
  return null;
}
/** Read-only, bounded streaming of tool records. Incomplete final records are ignored. */
export async function readAgentTodos(
  service: ConversationService,
  paneId: string,
): Promise<AgentTodos> {
  const ref = service.source(paneId);
  const opened = await openVerified(await service.locate(ref.kind, ref.sessionId));
  if (!opened) throw new Error("会話記録を読めません");
  const items = new Map<string, AgentTodo>();
  let partial = false,
    pending = Buffer.alloc(0),
    oversized = false;
  try {
    const limit = Math.min(opened.st.size, 50 * 1024 * 1024);
    partial = limit < opened.st.size;
    for (let offset = 0; offset < limit; offset += 64 * 1024) {
      const chunk = await readRange(opened.fd, offset, Math.min(64 * 1024, limit - offset));
      const bytes = Buffer.concat([pending, chunk]);
      let start = 0,
        end: number;
      while ((end = bytes.indexOf(10, start)) >= 0) {
        if (!oversized && end - start <= 1024 * 1024) {
          try {
            const snapshot = todoSnapshot(JSON.parse(bytes.subarray(start, end).toString("utf8")));
            if (snapshot !== null) {
              items.clear();
              for (const item of snapshot) items.set(item.id, item);
            }
          } catch {
            partial = true;
          }
        } else partial = true;
        oversized = false;
        start = end + 1;
      }
      pending = bytes.subarray(start);
      if (pending.length > 1024 * 1024) {
        pending = Buffer.alloc(0);
        oversized = true;
        partial = true;
      }
    }
    // Claude's newer TaskCreate/TaskUpdate tool stores the current task state here.
    if (ref.kind === "claude") {
      for (const root of await realRootsOf(service.taskRoots())) {
        const dir = await realpath(join(root, ref.sessionId)).catch(() => null);
        if (!dir || underRoot(dir, [root]) === null || dir !== join(root, ref.sessionId)) continue;
        const files = (await readdir(dir).catch(() => [])).filter((n) =>
          /^[a-zA-Z0-9_-]+\.json$/.test(n),
        );
        if (files.length > 500) partial = true;
        const tasks: AgentTodo[] = [];
        for (const name of files.slice(0, 500)) {
          const task = await openVerified(join(dir, name)).catch(() => null);
          if (!task) {
            partial = true;
            continue;
          }
          try {
            if (task.st.size > 64 * 1024) {
              partial = true;
              continue;
            }
            const raw = JSON.parse((await readRange(task.fd, 0, task.st.size)).toString("utf8"));
            const parsed = normalized([raw]);
            if (parsed?.[0])
              tasks.push({
                ...parsed[0],
                id: String(raw.id ?? name.slice(0, -5)),
                ...(typeof raw.description === "string"
                  ? { description: raw.description.slice(0, 4000) }
                  : {}),
              });
          } catch {
            partial = true;
          } finally {
            await task.fd.close();
          }
        }
        if (files.length) {
          items.clear();
          for (const task of tasks) items.set(task.id, task);
        }
      }
    }
    const now = service.source(paneId);
    if (now.kind !== ref.kind || now.sessionId !== ref.sessionId)
      throw new Error("セッションが切り替わりました");
    return { kind: ref.kind, sessionId: ref.sessionId, items: [...items.values()], partial };
  } finally {
    await opened.fd.close();
  }
}
