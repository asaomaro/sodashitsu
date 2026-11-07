import { grokHome, locateGrokSession, openGrokSessionRecord } from "../agent/grokSession.js";
import { openVerified } from "../agent/safeFile.js";
import { lstat, realpath, opendir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname, relative } from "node:path";
import type { ConversationMessage } from "@sodashitsu/protocol";
export type ExtraKind = "muse" | "agy" | "copilot" | "grok" | "cursor";
export interface ExtraRoots {
  home?: string;
  copilotHome?: string;
  dataHome?: string;
  grokHome?: string;
  cursorDataHome?: string;
}
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function extraRoot(kind: ExtraKind, opts: ExtraRoots = {}): string {
  const home = opts.home ?? homedir();
  if (kind === "grok") return join(grokHome(opts), "sessions");
  if (kind === "cursor") return join(opts.cursorDataHome || process.env.CURSOR_DATA_DIR || join(home, ".cursor"), "projects");
  return kind === "muse"
    ? join(
        opts.dataHome ?? process.env.XDG_DATA_HOME ?? join(home, ".local", "share"),
        "muse",
        "sessions",
      )
    : kind === "copilot"
      ? join(
          opts.copilotHome ?? process.env.COPILOT_HOME ?? join(home, ".copilot"),
          "session-state",
        )
      : join(home, ".gemini", "antigravity-cli", "brain");
}
/** Exact owner/id paths, never latest-file guessing. All intermediate links are rejected. */
export async function locateExtra(
  kind: ExtraKind,
  id: string,
  opts: ExtraRoots = {},
): Promise<string | null> {
  if (!UUID.test(id)) return null;
  if (kind === "grok") {
    const location = await locateGrokSession(id, opts);
    const file = location && join(location.dir, "chat_history.jsonl");
    return file && await verifiedExtra(file, dirname(file)) ? file : null;
  }
  const root = await realpath(extraRoot(kind, opts)).catch(() => null);
  if (!root) return null;
  if (kind === "cursor") {
    // Only documented project groups and exact UUID leaves. Never guess newest chat.
    const handle = await opendir(root).catch(() => null);
    if (!handle) return null;
    let found: string | null = null, entries = 0;
    const deadline = performance.now() + 1000;
    for await (const entry of handle) {
      if (++entries > 1000 || performance.now() > deadline) return null;
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const group = join(root, entry.name);
      if (await realpath(group).catch(() => null) !== group) continue;
      const base = join(group, "agent-transcripts");
      for (const file of [join(base, id, `${id}.jsonl`), join(base, `${id}.jsonl`)]) {
        if (!await verifiedExtra(file, root)) continue;
        if (found) return null; // UUID copied across workspace groups.
        found = file;
        break; // The documented current path takes precedence over its legacy path.
      }
    }
    return found;
  }
  let candidates: string[][] =
    kind === "copilot"
      ? [[id, "events.jsonl"]]
      : [[id, ".system_generated", "logs", "transcript.jsonl"]];
  if (kind === "muse") {
    if (id[14] !== "7") return null;
    const timestamp = parseInt(id.replaceAll("-", "").slice(0, 12), 16);
    candidates = [0, -1, 1].map((delta) => [
      ...new Date(timestamp + delta * 86400000).toISOString().slice(0, 10).split("-"),
      id,
      "session.jsonl",
    ]);
  }
  for (const parts of candidates) {
    const file = join(root, ...parts);
    if (await verifiedExtra(file, root)) return file;
  }
  return null;
}
async function verifiedExtra(file: string, root: string): Promise<boolean> {
  const rel = relative(root, file);
  if (rel.startsWith("..") || rel.startsWith("/")) return false;
  if ((await realpath(dirname(file)).catch(() => null)) !== dirname(file)) return false;
  if (await realpath(file).catch(() => null) !== file) return false;
  const st = await lstat(file).catch(() => null);
  return !!st && st.isFile() && !st.isSymbolicLink() && st.nlink === 1;
}
export interface ExtraFile {
  kind: ExtraKind;
  id: string;
  parent: string | null;
  file: string;
  mtime: number;
}
/** A bounded walk of documented record directories; no arbitrary client supplied path. */
export async function discoverExtra(
  kind: ExtraKind,
  opts: ExtraRoots = {},
  max = 1000,
): Promise<{ files: ExtraFile[]; limited: boolean }> {
  const root = await realpath(extraRoot(kind, opts)).catch(() => null);
  const files: ExtraFile[] = [];
  let entries = 0,
    limited = false;
  if (!root) return { files, limited };
  const deadline = Date.now() + 1000;
  const walk = async (dir: string, depth: number) => {
    const handle = await opendir(dir).catch(() => null);
    if (!handle) return;
    for await (const entry of handle) {
      if (++entries > 10000 || files.length >= max || Date.now() > deadline) {
        limited = true;
        break;
      }
      if (entry.isSymbolicLink()) continue;
      const file = join(dir, entry.name),
        rel = relative(root, file).split(/[\\/]/);
      if (entry.isDirectory() && depth > 0) {
        if (kind === "copilot" && rel.length === 1 && !UUID.test(entry.name)) continue;
        if (kind === "agy" && rel.length === 1 && !UUID.test(entry.name)) continue;
        await walk(file, depth - 1);
      } else if (entry.isFile()) {
        let id: string | undefined,
          parent: string | null = null;
        if (kind === "copilot" && rel.length === 2 && entry.name === "events.jsonl") id = rel[0];
        if (kind === "grok" && rel.length === 3 && entry.name === "chat_history.jsonl") id = rel[1];
        if (kind === "cursor" && rel[1] === "agent-transcripts") {
          if (rel.length === 3 && entry.name.endsWith(".jsonl")) id = entry.name.slice(0, -6);
          if (rel.length === 4 && entry.name === `${rel[2]}.jsonl`) id = rel[2];
          // Child transcript directories are deliberately not parent conversations.
        }
        if (
          kind === "agy" &&
          rel.length === 4 &&
          rel[1] === ".system_generated" &&
          rel[2] === "logs" &&
          entry.name === "transcript.jsonl"
        )
          id = rel[0];
        if (
          kind === "muse" &&
          entry.name === "session.jsonl" &&
          /^\d{4}\/\d{2}\/\d{2}\//.test(rel.join("/"))
        ) {
          if (rel.length === 5) id = rel[3];
          if (rel.length === 7 && rel[4] === "subagent") {
            id = rel[5];
            parent = rel[3] ?? null;
          }
        }
        if (
          id &&
          UUID.test(id) &&
          (!parent || UUID.test(parent)) &&
          (await verifiedExtra(file, root))
        ) {
          const st = await lstat(file);
          files.push({ kind, id, parent, file, mtime: st.mtimeMs });
        }
      }
    }
  };
  await walk(root, kind === "muse" ? 6 : kind === "agy" || kind === "cursor" ? 3 : kind === "grok" ? 2 : 1);
  return { files: files.sort((a, b) => b.mtime - a.mtime), limited };
}
/** Only persisted human/model text. Tool output, reasoning and subagent messages are not chat. */
export function extraRecord(
  row: Record<string, any>,
  kind: ExtraKind,
): Omit<ConversationMessage, "id"> | null {
  let role: "user" | "assistant", text: unknown;
  if (kind === "muse") {
    if (
      row.schema_version !== 1 ||
      row.payload_schema_version !== 1 ||
      row.stream?.kind !== "session"
    )
      return null;
    const payload = row.payload;
    if (
      row.payload_type === "runtime.user_intent.accepted" &&
      payload?.surface === "main" &&
      payload.semantic_kind?.kind === "chat" &&
      payload.source_session_id === row.stream.id
    ) {
      role = "user";
      text = Array.isArray(payload.model_messages)
        ? payload.model_messages
            .slice(0, 8)
            .flatMap((m: any) =>
              Array.isArray(m?.content)
                ? m.content
                    .slice(0, 16)
                    .filter((b: any) => b?.kind === "text" && typeof b.text === "string")
                    .map((b: any) => b.text)
                : [],
            )
            .join("\n")
        : null;
    } else if (
      row.payload_type === "runtime.session" &&
      payload?.kind === "run" &&
      payload.event?.kind === "assistant_message_committed"
    ) {
      role = "assistant";
      text = payload.event.text;
    } else return null;
  } else if (kind === "copilot") {
    if (
      !["user.message", "assistant.message"].includes(row.type) ||
      row.parentToolCallId ||
      row.data?.parentToolCallId
    )
      return null;
    role = row.type === "user.message" ? "user" : "assistant";
    text = row.data?.content;
  } else if (kind === "grok") {
    if (row.type === "user" && (row.synthetic_reason == null || row.synthetic_reason === "human")) {
      role = "user";
      text = Array.isArray(row.content) ? row.content.slice(0, 64).filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n") : null;
    } else if (row.type === "assistant") { role = "assistant"; text = row.content; }
    else return null;
  } else if (kind === "cursor") {
    if (!["user", "assistant"].includes(row.role)) return null;
    role = row.role;
    text = Array.isArray(row.message?.content) ? row.message.content.slice(0, 64).filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n") : null;
  } else {
    if (!["USER_INPUT", "PLANNER_RESPONSE"].includes(row.type)) return null;
    role = row.type === "USER_INPUT" ? "user" : "assistant";
    text = row.content;
  }
  if (typeof text !== "string" || !text.trim()) return null;
  const at =
    kind === "muse" &&
    typeof row.recorded_at === "number" &&
    Number.isFinite(row.recorded_at) &&
    Math.abs(row.recorded_at / 1000) < 8.64e15
      ? new Date(row.recorded_at / 1000).toISOString()
      : kind === "copilot"
        ? row.timestamp
        : row.created_at;
  return {
    role,
    text: text.slice(0, 8192),
    ...(typeof at === "string" && at.length <= 100 ? { at } : {}),
  };
}

export async function openExtra(kind: ExtraKind, id: string, opts: ExtraRoots = {}) {
  if (kind === "grok") return openGrokSessionRecord(id, "chat_history.jsonl", opts);
  const file = await locateExtra(kind, id, opts);
  if (!file) return null;
  const opened = await openVerified(file);
  if (!opened) return null;
  try {
    if ((await locateExtra(kind, id, opts)) !== file) throw Error("Record path changed");
    const st = await lstat(file);
    if (st.dev !== opened.st.dev || st.ino !== opened.st.ino)
      throw Error("Record identity changed");
    return opened;
  } catch {
    await opened.fd.close();
    return null;
  }
}

export async function openExtraFile(f: ExtraFile, opts: ExtraRoots = {}) {
  const root = await realpath(extraRoot(f.kind, opts)).catch(() => null);
  if (!root || !(await verifiedExtra(f.file, root))) return null;
  const opened = await openVerified(f.file);
  if (!opened) return null;
  try {
    if (!(await verifiedExtra(f.file, root))) throw Error("Changed parent");
    const st = await lstat(f.file);
    if (st.dev !== opened.st.dev || st.ino !== opened.st.ino) throw Error("Changed identity");
    return opened;
  } catch {
    await opened.fd.close();
    return null;
  }
}
