import { lstat, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { findCodexRecordFile, isCodexSessionId } from "./codexSession.js";
import { openVerified, readRange, type OpenedFile } from "./safeFile.js";
import type { SubagentTranscriptEntry } from "@sodashitsu/protocol";
import { entriesOfLine } from "./SubagentTranscript.js";

/** Child UUID and the exact provider session_meta relation are both required. No latest-file fallback. */
export async function openCodexChildRecord(home: string, parent: string, child: string): Promise<(OpenedFile & { file: string; metadataBytes: number; unchanged(): Promise<boolean> }) | undefined> {
  if (!isCodexSessionId(parent) || !isCodexSessionId(child) || parent === child) return undefined;
  const root = await realpath(join(home, "sessions")).catch(() => undefined);
  if (!root) return undefined;
  const rootStat = await lstat(root).catch(() => undefined);
  if (!rootStat?.isDirectory() || (process.geteuid && rootStat.uid !== process.geteuid())) return undefined;
  const file = await findCodexRecordFile(home, child);
  if (!file || !file.startsWith(root + sep) || await realpath(file).catch(() => null) !== file) return undefined;
  const before = await lstat(file).catch(() => undefined);
  if (!before?.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.uid !== rootStat.uid) return undefined;
  const opened = await openVerified(file);
  if (!opened) return undefined;
  try {
    const revision = await opened.fd.stat({bigint:true});
    const head = await readRange(opened.fd, 0, Math.min(opened.st.size, 256 * 1024));
    const end = head.indexOf(10);
    if (end < 0) throw Error("metadata missing");
    const row = JSON.parse(head.toString("utf8", 0, end));
    if (row?.type !== "session_meta" || row.payload?.id !== child || row.payload?.source?.subagent?.thread_spawn?.parent_thread_id !== parent) throw Error("child relation mismatch");
    const unchanged = async () => {
      const path = await lstat(file, {bigint:true}).catch(() => undefined), fd = await opened.fd.stat({bigint:true}).catch(() => undefined);
      return !!path && !path.isSymbolicLink() && path.isFile() && path.nlink === 1n && await realpath(file).catch(() => null) === file &&
        [path,fd].every(st => st !== undefined && (["dev","ino","size","mtimeNs","ctimeNs"] as const).every(k => st[k] === revision[k]));
    };
    if (before.dev !== opened.st.dev || before.ino !== opened.st.ino || !await unchanged()) throw Error("child changed");
    return {...opened, file, metadataBytes: head.length, unchanged};
  } catch { await opened.fd.close(); return undefined; }
}

/** Formal response_item text only. Reasoning, binary attachments and arbitrary tool payloads are not chat. */
export function codexChildEntries(row: unknown): SubagentTranscriptEntry[] {
  if (!row || typeof row !== "object") return [];
  const r = row as Record<string, any>, p = r.payload;
  if (r.type !== "response_item" || p?.type !== "message" || !["user","assistant"].includes(p.role) || !Array.isArray(p.content)) return [];
  const content = p.content.filter((part: any) => part && ["input_text","output_text"].includes(part.type) && typeof part.text === "string").map((part: any) => ({type:"text",text:part.text}));
  return entriesOfLine({type:p.role, timestamp:r.timestamp, message:{content}});
}
