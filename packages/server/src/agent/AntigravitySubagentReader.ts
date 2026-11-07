import { lstat, opendir, realpath } from "node:fs/promises";
import { dirname, join } from "node:path";
import { locateExtra, type ExtraRoots } from "../conversation/ExtraAgentRecords.js";
import { openVerified, readRange } from "./safeFile.js";
import type { SubagentInfo } from "@sodashitsu/protocol";
import type { Subagents } from "./SubagentTracker.js";

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const label = (v: unknown): string | undefined => typeof v === "string" ? v.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 200) || undefined : undefined;
async function spawnProofs(transcript: string): Promise<Map<number, { id: string; at: number }> | undefined> {
  const opened = await openVerified(transcript).catch(() => null);
  if (!opened) return undefined;
  try {
    if (opened.st.size > 4 * 1024 * 1024) return undefined;
    const bytes = await readRange(opened.fd, 0, opened.st.size), after = await opened.fd.stat();
    if (after.size !== opened.st.size || after.mtimeMs !== opened.st.mtimeMs || bytes.length !== opened.st.size) return undefined;
    const lines = bytes.toString("utf8").split("\n");
    if (lines.length > 20000) return undefined;
    const rows = new Map<number, any>();
    for (const line of lines) {
      if (!line) continue;
      if (Buffer.byteLength(line) > 256 * 1024) return undefined;
      const row = JSON.parse(line);
      if (!Number.isSafeInteger(row.step_index) || rows.has(row.step_index)) return undefined;
      rows.set(row.step_index, row);
    }
    const proofs = new Map<number, { id: string; at: number }>();
    for (const [step, row] of rows) {
      const call = rows.get(step - 1);
      if (row.source !== "MODEL" || row.type !== "GENERIC" || row.status !== "DONE" || typeof row.content !== "string" || call?.source !== "MODEL" || call.type !== "PLANNER_RESPONSE" || call.status !== "DONE" || !Array.isArray(call.tool_calls) || call.tool_calls.length !== 1 || call.tool_calls[0]?.name !== "invoke_subagent") continue;
      const match = /^Created At: [^\n]+\nCompleted At: [^\n]+\nCreated the following subagent:\n([\s\S]+)\nThe subagent will send you a message when it has completed its task or requires guidance\. There is no need to poll for its response\.$/.exec(row.content);
      if (!match) continue;
      const value = JSON.parse(match[1]!); const at = Date.parse(row.created_at);
      if (UUID.test(value?.conversationId) && Number.isFinite(at) && at >= 0) proofs.set(step, { id: value.conversationId, at });
    }
    return proofs;
  } catch { return undefined; }
  finally { await opened.fd.close(); }
}
/** Provider-owned direct-child snapshots. ALIVE means membership, never proof of a working task. */
export async function readAntigravitySubagents(sessionId: string, roots: ExtraRoots): Promise<Subagents | undefined> {
  const transcript = await locateExtra("agy", sessionId, roots);
  if (!transcript) return undefined;
  const parentBefore = await lstat(transcript).catch(() => null);
  if (!parentBefore) return undefined;
  const proofs = await spawnProofs(transcript);
  if (!proofs) return undefined;
  const parent = dirname(dirname(transcript)), dir = join(parent, "subagents");
  if (await realpath(dir).catch(() => null) !== dir) return undefined;
  const before = await lstat(dir).catch(() => null);
  if (!before?.isDirectory() || before.isSymbolicLink()) return undefined;
  const handle = await opendir(dir).catch(() => null);
  if (!handle) return undefined;
  const items: SubagentInfo[] = [];
  const seenSpawns = new Set<number>();
  let entries = 0;
  const deadline = Date.now() + 1000;
  for await (const entry of handle) {
    if (++entries > 256 || Date.now() > deadline) return undefined;
    if (!entry.name.endsWith(".json")) continue;
    const id = entry.name.slice(0, -5);
    if (!UUID.test(id) || id.toLowerCase() === sessionId.toLowerCase() || !entry.isFile() || entry.isSymbolicLink()) return undefined;
    const file = join(dir, entry.name);
    if (await realpath(file).catch(() => null) !== file) return undefined;
    const opened = await openVerified(file).catch(() => null);
    if (!opened) return undefined;
    try {
      if (opened.st.size > 32 * 1024) return undefined;
      const bytes = await readRange(opened.fd, 0, opened.st.size);
      const after = await opened.fd.stat(), path = await lstat(file).catch(() => null);
      if (!path || path.dev !== opened.st.dev || path.ino !== opened.st.ino || after.size !== opened.st.size || after.mtimeMs !== opened.st.mtimeMs || await realpath(file) !== file) return undefined;
      const row = JSON.parse(bytes.toString("utf8"));
      if (!row || row.conversationId !== id || !Number.isSafeInteger(row.spawnStepIndex) || row.spawnStepIndex < 0) return undefined;
      const proof = proofs.get(row.spawnStepIndex);
      if (!proof || proof.id !== id || seenSpawns.has(row.spawnStepIndex)) return undefined;
      seenSpawns.add(row.spawnStepIndex);
      if (row.state === "SUBAGENT_STATE_KILLED") continue;
      if (row.state !== "SUBAGENT_STATE_ALIVE") return undefined;
      const description = label(row.subagentDescriptor?.role), type = label(row.subagentDescriptor?.typeName);
      items.push({ id, state: "unknown", startedAt: proof.at, depth: 1, ...(description ? { description } : {}), ...(type ? { type } : {}) });
    } catch { return undefined; }
    finally { await opened.fd.close(); }
  }
  // Missing historical descriptors are not evidence of termination. Require an explicit
  // provider descriptor for every verified spawn, including KILLED children.
  if (seenSpawns.size !== proofs.size) return undefined;
  const after = await lstat(dir).catch(() => null);
  if (!after || after.dev !== before.dev || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs || await realpath(dir).catch(() => null) !== dir) return undefined;
  // Revalidate the owned parent after the bounded scan; never return another session's snapshot.
  if (await locateExtra("agy", sessionId, roots) !== transcript) return undefined;
  const parentAfter = await lstat(transcript).catch(() => null);
  if (!parentAfter || parentAfter.dev !== parentBefore.dev || parentAfter.ino !== parentBefore.ino || parentAfter.size !== parentBefore.size || parentAfter.mtimeMs !== parentBefore.mtimeMs) return undefined;
  items.sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
  return { count: items.length, countBasis: "alive", items: items.slice(0, 64) };
}
