import type { Readable, Writable } from "node:stream";
import { desktopWrite } from "./desktopIo.js";
import { WorkAgentClient, workAgentLines } from "./workAgentIo.js";

export const workAgentTool = {
  name: "remote_work",
  description: [
    "Operate ONLY the fixed remote PC/project. inspect returns remote instructions and available skills; skill reads SKILL.md or a relative reference. file lists/reads/searches/writes project-relative UTF-8 files (updates require read version). exec runs commands in the fixed remote project.",
    'Plugin tasks: {operation:"plugin",request:{action:"operations"}} lists operations of the originating plugin app. Then {operation:"plugin",request:{action:"call",name:"operation-name",params:{...}}} invokes an advertised operation (e.g. progress/report). The app instance and process generation are fixed by the server. No key/pane/machine override is accepted; non-plugin work agents cannot use this operation. Never blindly retry an uncertain call; check the app status first.',
    'Memory: use operation="memory", action=list|read|write and an explicit filename name, e.g. "MEMORY.md" or "decisions.md" (not a path). Omitted name defaults to MEMORY.md. First call {"operation":"memory","action":"list"} and check files for the exact name. For a missing file, create with {"operation":"memory","action":"write","name":"decisions.md","content":"notes"} and OMIT version. For an existing file, read {"operation":"memory","action":"read","name":"decisions.md"}; use the returned text and exact version in the next write with the SAME name and revised content. Never invent a version or omit it to force an overwrite. Always read the same name after saving and verify text/version; after an uncertain write, read before considering any retry.',
    "Memory is on the remote PC and scoped to this launch's source pane. Generic operation errors do NOT prove disconnection: check operation/action/name/content/version and limits, then sequentially try inspect, memory list, and read of the chosen name when present. Successful reads show transport/scope worked at that time, not that a write is permitted. Check missing files, version conflicts, permissions, limits, and changed source pane. If reads also fail, check machine connection and project/pane identity; stop on confirmed disconnect or changed target. Never replace failed calls with local tools; do not blindly repeat writes. No target/cwd/machine override is accepted.",
  ].join("\n"),
  inputSchema: {
    type: "object", properties: {
      operation: { type: "string", enum: ["inspect", "skill", "file", "exec", "memory", "plugin"] },
      request: { type:"object", properties:{action:{type:"string",enum:["operations","call"]},name:{type:"string"},params:{type:"object"}},required:["action"],additionalProperties:false },
      action: { type: "string", enum: ["list", "read", "write", "search"] },
      path: { type: "string" }, id: { type: "string" }, query: { type: "string" },
      content: { type: "string" }, version: { type: "string", description: "Exact version from the latest read of the same memory/file. Required for existing-file updates; omit for new memory creation. After a conflict, read again before merging changes." }, name: { type: "string", description: "Memory filename, e.g. MEMORY.md or decisions.md, not a path. Use the same explicit name for list checks, reads, writes and verification. Defaults to MEMORY.md." },
      command: { type: "string" }, timeoutMs: { type: "integer", minimum: 1, maximum: 300000 },
      encoding: { type: "string", enum: ["utf-8", "shift_jis", "utf-16le"] },
    }, required: ["operation"], additionalProperties: false,
  },
};
export const workAgentAskTool = {
  name: "ask_user",
  description: "Ask the user on the OPERATOR PC (A), in this agent's fixed local pane, using Sodashitsu's ask-form dialog. Returns JSON status answered/cancelled/timeout/unavailable; answered includes answers and optional comments/note. Never assume defaults after cancellation or unavailable. Pass a normal ask-form spec with questions (id,label,type,options), optionally inline view.text. To show a REMOTE Markdown artifact, read it using remote_work first and pass its BODY in documents:[{title,markdown}]. Never pass local/remote file paths, image/audio references, target pane or machine IDs. File editing, Git, tests and memory stay on remote_work (B). Maximum combined definition/documents 256KiB, eight documents/views, timeout 1-300 seconds (default 300).",
  inputSchema: {
    type: "object", properties: {
      spec: { type: "object", description: 'ask-form definition, e.g. {"title":"確認","questions":[{"id":"ok","label":"進めますか","options":["はい","いいえ"]}]}. Questions can be single/multi/text/edit/rank/table; use ordinary ask-form fields. Only inline view.text; no file/image/audio references.' },
      documents: { type: "array", maxItems: 8, items: { type: "object", properties: { title: { type: "string", maxLength: 500 }, markdown: { type: "string", maxLength: 131072 } }, required: ["title", "markdown"], additionalProperties: false } },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 300000 },
    }, required: ["spec"], additionalProperties: false,
  },
};
export async function workAgentMcp(input: Readable, output: Writable, client: Pick<WorkAgentClient, "request" | "close">) {
  let initialized = false;
  let busy: unknown, pending: Promise<void> | undefined;
  const send = (id: unknown, result: unknown) => desktopWrite(output, { jsonrpc: "2.0", id, result });
  const error = (id: unknown, code: number, message: string) => desktopWrite(output, { jsonrpc: "2.0", id, error: { code, message } });
  try {
    for await (const line of workAgentLines(input)) {
      let m: any;
      try { m = JSON.parse(line); } catch { await error(null, -32700, "Parse error"); continue; }
      if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string" || (m.id !== undefined && typeof m.id !== "string" && !Number.isSafeInteger(m.id))) { await error(null, -32600, "Invalid request"); continue; }
      if (m.id === undefined) {
        if (m.method === "notifications/cancelled" && busy !== undefined && m.params?.requestId === busy) void client.request("cancel").catch(() => {});
        continue;
      }
      if (m.method === "initialize") {
        if (initialized) { await error(m.id, -32600, "Already initialized"); continue; }
        initialized = true;
        await send(m.id, { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "sodashitsu-remote-work", version: "0.1.0" } });
      } else if (m.method === "ping") await send(m.id, {});
      else if (!initialized) await error(m.id, -32000, "Initialize first");
      else if (m.method === "tools/list") await send(m.id, { tools: [workAgentTool, workAgentAskTool] });
      else if (m.method === "tools/call") {
        if (busy !== undefined) { await error(m.id, -32000, "Remote operation in progress"); continue; }
        busy = m.id;
        pending = (async () => {
          try {
            const name = m.params?.name;
            if (name !== workAgentTool.name && name !== workAgentAskTool.name) throw Error("Unknown remote tool");
            const result = await client.request(name === workAgentAskTool.name ? "ask" : "tool", m.params.arguments ?? {});
            await send(m.id, { content: [{ type: "text", text: JSON.stringify(result) }] });
          } catch (e) { await send(m.id, { isError: true, content: [{ type: "text", text: e instanceof Error ? e.message : "remote tool failed" }] }); }
          finally { busy = undefined; }
        })();
        void pending.catch(() => {});
      } else await error(m.id, -32601, "Method not found");
    }
  } finally { client.close(); await pending?.catch(() => {}); }
}
