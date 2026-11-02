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
    const text = r.content ?? r.step ?? r.subject ?? r.text ?? r.title;
    const status=r.status==="inProgress"?"in_progress":r.status;
    if (typeof text !== "string" || !["pending", "in_progress", "completed"].includes(status))
      return [];
    return [
      {
        id: String(r.id ?? i).slice(0, 100),
        text: text.slice(0, 4000),
        status: status as AgentTodo["status"],
      },
    ];
  });
}
export function todoSnapshot(row: any): AgentTodo[] | null {
  if(row?.schema_version===1&&row.payload_schema_version===1){
    const event=row.payload?.event??row.payload?.record?.fact;
    if(event?.kind==="todo_snapshot_updated")return normalized(event.items);
  }
  const tools=row?.type==="tool.execution_start"?[{name:row.data?.toolName,args:row.data?.arguments}]:row?.type==="PLANNER_RESPONSE"?row.tool_calls:null;
  if(Array.isArray(tools)){
    for(const tool of tools)if(["TodoWrite","write_todos","update_todo","update_plan"].includes(tool?.name)){
      let args=tool.args;try{if(typeof args==="string")args=JSON.parse(args);}catch{continue;}
      const found=normalized(args?.todos??args?.plan??args?.items);if(found!==null)return found;
    }
  }
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
  const opened = await service.open(ref.kind,ref.sessionId);
  if (!opened) throw new Error("会話記録を読めません");
  const items = new Map<string, AgentTodo>();
  let foundSnapshot=false;
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
            const row=JSON.parse(bytes.subarray(start,end).toString("utf8"));
            const snapshot=ref.kind==="muse"&&row.stream?.id!==ref.sessionId?null:todoSnapshot(row);
            if (snapshot !== null) {
              foundSnapshot=true;
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
    return { kind: ref.kind, sessionId: ref.sessionId, items: [...items.values()], partial, ...(ref.kind!=="claude"&&ref.kind!=="codex"&&!foundSnapshot?{unavailableReason:"このCLIの記録からToDo一覧を取得できません。端末側のタスク表示を確認してください。"}:{}) };
  } finally {
    await opened.fd.close();
  }
}
