import type { AgentUsage } from "@sodashitsu/protocol";
import { openExtra, type ExtraKind, type ExtraRoots } from "../conversation/ExtraAgentRecords.js";
import { readRange } from "../agent/safeFile.js";
import { extraUsage } from "./extraEvents.js";
import type { UsageAdapter, UsageSourceInfo } from "./UsageService.js";
type Usage = Omit<AgentUsage, "paneId" | "kind">;
interface State {
  id: string;
  offset: number;
  dev: number;
  ino: number;
  seen: Set<string>;
  value: Usage | null;
  busy: boolean;
  skipping: boolean;
  partial: boolean;
}
/** Per-pane incremental bounded numeric reader, with no retained text or tool arguments. */
export class ExtraUsageAdapter implements UsageAdapter {
  readonly kind: ExtraKind;
  private states = new Map<string, State>();
  private closed = false;
  constructor(
    kind: ExtraKind,
    private readonly roots: ExtraRoots = {},
  ) {
    this.kind = kind;
  }
  forget(paneId: string) {
    this.states.delete(paneId);
  }
  close() {
    this.closed = true;
    this.states.clear();
  }
  async usageFor(source: UsageSourceInfo): Promise<Usage | null> {
    if (this.closed) return null;
    let state = this.states.get(source.paneId);
    if (!state || state.id !== source.sessionId) {
      state = {
        id: source.sessionId,
        offset: 0,
        dev: 0,
        ino: 0,
        seen: new Set(),
        value: null,
        busy: false,
        skipping: false,
        partial: false,
      };
      this.states.set(source.paneId, state);
    }
    if (state.busy) return state.value;
    state.busy = true;
    try {
      const opened = await openExtra(this.kind, source.sessionId, this.roots).catch(() => null);
      if (!opened) return null;
      try {
        if (
          state.dev !== opened.st.dev ||
          state.ino !== opened.st.ino ||
          state.offset > opened.st.size
        ) {
          state.offset = 0;
          state.value = null;
          state.seen.clear();
          state.skipping = false;
          state.partial = false;
        }
        state.dev = opened.st.dev;
        state.ino = opened.st.ino;
        const cap = 512 * 1024 * 1024,
          bytes = await readRange(
            opened.fd,
            state.offset,
            Math.min(4 * 1024 * 1024, Math.max(0, Math.min(opened.st.size, cap) - state.offset)),
          );
        let start = 0;
        if (state.skipping) {
          const next = bytes.indexOf(10);
          if (next < 0) {
            state.offset += bytes.length;
            return state.value;
          }
          start = next + 1;
          state.skipping = false;
        }
        const end = bytes.lastIndexOf(10);
        if (end >= start) {
          for (const line of bytes.subarray(start, end).toString("utf8").split("\n")) {
            let row: any;
            try {
              row = JSON.parse(line);
            } catch {
              continue;
            }
            const u = extraUsage(row, this.kind, source.sessionId);
            if (!u || state.seen.has(u.id)) continue;
            if (state.seen.size >= 100000) break;
            state.seen.add(u.id);
            state.value ??= {
              model: null,
              tokens: {
                basis: "transcript",
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
              },
              source: this.kind === "agy" ? "agy-transcript" : "muse-events",
              updatedAt: u.at,
            };
            const v = state.value;
            for (const k of ["input", "output", "cacheRead", "cacheWrite"] as const)
              v.tokens[k] = (v.tokens[k] ?? 0) + u[k];
            v.tokens.total =
              (v.tokens.input ?? 0) +
              (v.tokens.output ?? 0) +
              (v.tokens.cacheRead ?? 0) +
              (v.tokens.cacheWrite ?? 0);
            v.model = u.model ?? v.model;
            v.updatedAt = u.at;
          }
          state.offset += end + 1;
        } else if (bytes.length === 4 * 1024 * 1024) {
          state.offset += bytes.length;
          state.skipping = true;
          state.partial = true;
        } else if (start) state.offset += start;
        if (state.value) {
          state.value.scanning = state.offset < opened.st.size;
          state.value.partial = state.partial || state.offset >= cap || state.seen.size >= 100000;
          state.value.updatesStopped = state.offset >= cap || state.seen.size >= 100000;
        }
        if (this.closed || this.states.get(source.paneId) !== state) return null;
        return state.value;
      } finally {
        await opened.fd.close();
      }
    } finally {
      state.busy = false;
    }
  }
}

export class MuseUsageAdapter extends ExtraUsageAdapter {
  constructor(roots: ExtraRoots = {}) {
    super("muse", roots);
  }
}
