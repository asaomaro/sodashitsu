import { CodexSubagentStream } from "./CodexSubagentStream.js";
import { readAntigravitySubagents } from "./AntigravitySubagentReader.js";
import { realpath, lstat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { findCodexRecordFile } from "./codexSession.js";
import { openVerified, readRange, type OpenedFile } from "./safeFile.js";
import { openExtra, type ExtraRoots } from "../conversation/ExtraAgentRecords.js";
import { NativeSubagentRecords, type NativeSubagentKind } from "./NativeSubagentRecords.js";
import type { Subagents } from "./SubagentTracker.js";

export interface NativeSubagentSource {
  paneId: string;
  instanceId: string;
  kind: NativeSubagentKind | "agy";
  sessionId: string;
}
interface State {
  key: string;
  fold: NativeSubagentRecords;
  offset: number;
  dev: number;
  ino: number;
  invalid: boolean;
  generation: number;
  pending?: boolean;
  codex?: CodexSubagentStream;
  reading?: Promise<Subagents | undefined>;
}
const CHUNK = 4 * 1024 * 1024;
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_LINE = 256 * 1024;

/** Exact owned-session files only. No CLI/model launch, directory-wide transcript scan, or latest-session fallback. */
export class NativeSubagentReader {
  private readonly states = new Map<string, State>();
  private closed = false;
  private readonly agyStates = new Map<string, { key: string; reading?: Promise<Subagents | undefined> }>();
  constructor(private readonly roots: ExtraRoots & { codexHome?: string } = {}) {}

  forget(paneId: string): void { this.states.delete(paneId); this.agyStates.delete(paneId); }
  close(): void { this.closed = true; this.states.clear(); this.agyStates.clear(); }

  /** Internal scheduling hint only; never a partial activity snapshot or public protocol value. */
  progress(source: NativeSubagentSource): { offset: number; pending: boolean; generation: number } | undefined {
    const state=this.states.get(source.paneId);
    if(this.closed||source.kind==="agy"||!state||state.invalid||state.key!==JSON.stringify([source.instanceId,source.kind,source.sessionId]))return undefined;
    return {offset:state.offset,pending:state.pending===true,generation:state.generation};
  }

  async read(source: NativeSubagentSource): Promise<Subagents | undefined> {
    if (this.closed) return undefined;
    if (source.kind === "agy") return this.readAgy(source);
    this.agyStates.delete(source.paneId);
    const key = JSON.stringify([source.instanceId, source.kind, source.sessionId]);
    let state = this.states.get(source.paneId);
    if (!state || state.key !== key) {
      state = { key, fold: new NativeSubagentRecords(source.kind, source.sessionId), offset: 0, dev: -1, ino: -1, invalid: false, generation: 0 };
      this.states.set(source.paneId, state);
    }
    const current = state;
    current.reading ??= this.refresh(source, current).catch(() => { current.pending=false; return undefined; }).finally(() => { delete current.reading; });
    const value = await current.reading;
    return !this.closed && this.states.get(source.paneId) === current ? value : undefined;
  }

  private async readAgy(source: NativeSubagentSource): Promise<Subagents | undefined> {
    const key = JSON.stringify([source.instanceId, source.kind, source.sessionId]);
    // A kind change invalidates both reader families, including in-flight results.
    this.states.delete(source.paneId);
    let state = this.agyStates.get(source.paneId);
    if (!state || state.key !== key) { state = { key }; this.agyStates.set(source.paneId, state); }
    const current = state;
    current.reading ??= readAntigravitySubagents(source.sessionId, this.roots).catch(() => undefined).finally(() => { delete current.reading; });
    const value = await current.reading;
    return !this.closed && this.agyStates.get(source.paneId) === current ? value : undefined;
  }

  private async open(source: NativeSubagentSource): Promise<OpenedFile | null> {
    if (source.kind !== "codex") return openExtra(source.kind, source.sessionId, this.roots);
    const home = await realpath(this.roots.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), ".codex")).catch(() => null);
    if (!home) return null;
    const file = await findCodexRecordFile(home, source.sessionId);
    if (!file || !file.startsWith(join(home, "sessions") + sep) || await realpath(file).catch(() => null) !== file) return null;
    const opened = await openVerified(file);
    if (!opened) return null;
    try {
      const after = await lstat(file);
      if (after.dev !== opened.st.dev || after.ino !== opened.st.ino || await realpath(file) !== file) throw Error("record changed");
      return opened;
    } catch { await opened.fd.close(); return null; }
  }

  private async refresh(source: NativeSubagentSource, state: State): Promise<Subagents | undefined> {
    state.pending=false;
    const opened = await this.open(source);
    if (!opened) return undefined;
    try {
      const { fd, st } = opened;
      if (state.dev !== st.dev || state.ino !== st.ino || st.size < state.offset) {
        state.generation++;
        state.offset = 0; state.fold = new NativeSubagentRecords(source.kind as NativeSubagentKind, source.sessionId); state.invalid = false;
        delete state.codex;
      }
      state.dev = st.dev; state.ino = st.ino;
      if (state.invalid || st.size > MAX_BYTES) return undefined;
      const bytes = await readRange(fd, state.offset, Math.min(CHUNK, st.size - state.offset));
      if (source.kind === "codex") {
        state.codex ??= new CodexSubagentStream();
        state.codex.consume(bytes, state.fold);
        state.offset += bytes.length;
        if (state.codex.invalid) state.invalid = true;
        state.pending=!state.invalid&&bytes.length>0&&state.offset<st.size;
        // A current snapshot requires all available bytes and a complete final line.
        return state.invalid || state.offset < st.size || state.codex.partial ? undefined : state.fold.snapshot();
      }
      const scanning = state.offset + bytes.length < st.size;
      const end = bytes.lastIndexOf(10);
      if (end < 0) {
        if (bytes.length > MAX_LINE) state.invalid = true;
        return state.invalid ? undefined : state.fold.snapshot();
      }
      let start = 0;
      while (start <= end) {
        const next = bytes.indexOf(10, start);
        if (next < 0 || next > end) break;
        if (next - start > MAX_LINE) state.invalid = true;
        else if (next > start) {
          try { state.fold.consume(JSON.parse(bytes.subarray(start, next).toString("utf8"))); }
          catch { state.invalid = true; }
        }
        start = next + 1;
      }
      state.offset += end + 1;
      state.pending=!state.invalid&&scanning&&end>=0;
      // Do not show a historical prefix as current activity until the full available record was folded.
      if (state.invalid || scanning) return undefined;
      return state.fold.snapshot();
    } finally { await opened.fd.close(); }
  }
}
