import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AssistantConversationPage, ConversationMessage } from "@sodashitsu/protocol";
import { RpcError } from "@sodashitsu/protocol";
import { openVerified, readRange } from "../agent/safeFile.js";

const WINDOW = 1024 * 1024;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
type Kind = "copilot" | "agy";
/** Only persisted human/model text. Tool output, reasoning and subagent messages are not chat. */
export function assistantRecord(row: Record<string, any>, kind: Kind): Omit<ConversationMessage, "id"> | null {
  let role: "user" | "assistant", text: unknown;
  if (kind === "copilot") {
    if (!["user.message", "assistant.message"].includes(row.type) || row.parentToolCallId || row.data?.parentToolCallId) return null;
    role = row.type === "user.message" ? "user" : "assistant";
    text = row.data?.content;
  } else {
    if (!["USER_INPUT", "PLANNER_RESPONSE"].includes(row.type)) return null;
    role = row.type === "USER_INPUT" ? "user" : "assistant";
    text = row.content;
  }
  if (typeof text !== "string" || !text.trim()) return null;
  const at = kind === "copilot" ? row.timestamp : row.created_at;
  return { role, text: text.slice(0, 8192), ...(typeof at === "string" && at.length <= 100 ? { at } : {}) };
}

/** Fixed record paths only; no agent/SDK process, newest-session guessing, watch, or background scan. */
export async function readAssistantConversation(
  kind: Kind, sessionId: string,
  options: { home?: string; copilotHome?: string } = {},
): Promise<AssistantConversationPage> {
  if (!["copilot", "agy"].includes(kind) || !UUID.test(sessionId))
    throw new RpcError("invalid_params", "会話の指定が正しくありません");
  const home = options.home ?? homedir();
  const rootPath = kind === "copilot"
    ? join(options.copilotHome ?? process.env.COPILOT_HOME ?? join(home, ".copilot"), "session-state")
    : join(home, ".gemini", "antigravity-cli", "brain");
  const relative = kind === "copilot" ? [sessionId, "events.jsonl"] : [sessionId, ".system_generated", "logs", "transcript.jsonl"];
  let opened: Awaited<ReturnType<typeof openVerified>> = null;
  try {
    const root = await realpath(rootPath), file = join(root, ...relative);
    const verifyPath = async () => {
      if (await realpath(dirname(file)) !== dirname(file)) throw Error("Unverified parent");
      const current = await lstat(file);
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1 ||
          (opened && (current.dev !== opened.st.dev || current.ino !== opened.st.ino))) throw Error("Unverified file");
    };
    await verifyPath();
    opened = await openVerified(file);
    if (!opened) throw Error("Unverified handle");
    await verifyPath();
    const fd = opened.fd, size = opened.st.size;
    if (!Number.isSafeInteger(size) || size < 0) throw Error("Invalid file size");
    const start = Math.max(0, size - WINDOW);
    const bytes = await readRange(fd, start, size - start);
    const messages: ConversationMessage[] = [];
    let used = 0, partial = start > 0;
    // A tail window can begin in a large tool record or a UTF8 character. Never parse that fragment.
    if (start && (await readRange(fd, start - 1, 1))[0] !== 10) {
      const end = bytes.indexOf(10); used = end < 0 ? bytes.length : end + 1;
    }
    while (used < bytes.length) {
      const end = bytes.indexOf(10, used);
      if (end < 0) { partial = true; break; }
      try {
        const row: unknown = JSON.parse(bytes.subarray(used, end).toString("utf8"));
        if (!row || typeof row !== "object" || Array.isArray(row)) throw Error("Invalid record");
        const message = assistantRecord(row, kind);
        if (message) {
          messages.push({ id: `${kind}:${sessionId}:${start + used}`, ...message });
          if (message.text.length === 8192) partial = true;
          if (messages.length > 100) { messages.shift(); partial = true; }
        }
      } catch { partial = true; }
      used = end + 1;
    }
    // Re-read the bounded snapshot to reject concurrent rewrites/truncation. Append-only growth is harmless.
    if (!bytes.equals(await readRange(fd, start, bytes.length))) throw Error("Record changed");
    await verifyPath();
    return { kind, sessionId, messages, endOffset: 0, nextOffset: null, reset: true, partial };

  } catch {
    throw new RpcError("not_found", "会話記録を確認できません。フックと専用端末を確認してください");
  } finally { await opened?.fd.close(); }
}
