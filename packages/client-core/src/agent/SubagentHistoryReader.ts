import {
  UUID_RE,
  type AgentSubagentHistoryResult,
  type SubagentHistoryItem,
} from "@sodashitsu/protocol";
import type { ConnectionPort } from "../net/ports.js";
export interface SubagentHistoryState {
  items: readonly SubagentHistoryItem[];
  status: "idle" | "ok" | "pending" | "unavailable" | "failed" | "unsupported";
  loading: boolean;
  offset: number;
  revision?: string;
  more: boolean;
  omittedBefore: boolean;
  incomplete: boolean;
}
const empty = (): SubagentHistoryState => ({
  items: [],
  status: "idle",
  loading: false,
  offset: 0,
  more: false,
  omittedBefore: false,
  incomplete: false,
});
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const time = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 8.64e15;
/** Copies only public terminal metadata; never coerces unknown state into a completed child. */
export function safeSubagentHistoryItem(value: unknown): SubagentHistoryItem | null {
  if (
    !object(value) ||
    !text(value.id, 128) ||
    !/^[A-Za-z0-9_-]+$/.test(value.id) ||
    typeof value.entryId !== "string" ||
    !UUID_RE.test(value.entryId) ||
    !(
      value.terminalStatus === "completed" ||
      value.terminalStatus === "aborted" ||
      value.terminalStatus === "error"
    )
  )
    return null;
  const row: SubagentHistoryItem = {
    id: value.id,
    entryId: value.entryId,
    terminalStatus: value.terminalStatus,
  };
  for (const key of ["type", "description", "model", "reasoningEffort"] as const) {
    const v = value[key];
    if (text(v, key === "description" ? 2048 : key === "model" ? 512 : 128)) row[key] = v;
  }
  if (
    value.modelBasis === "turn" ||
    value.modelBasis === "creation" ||
    value.modelBasis === "session"
  )
    row.modelBasis = value.modelBasis;
  if (
    value.reasoningEffortBasis === "turn" ||
    value.reasoningEffortBasis === "creation" ||
    value.reasoningEffortBasis === "session"
  )
    row.reasoningEffortBasis = value.reasoningEffortBasis;
  row.hasTranscript = value.hasTranscript === true;
  if (time(value.startedAt)) row.startedAt = value.startedAt;
  if (time(value.endedAt)) row.endedAt = value.endedAt;
  return Object.freeze(row);
}
function pageOf(raw: unknown): AgentSubagentHistoryResult | null {
  if (
    !object(raw) ||
    typeof raw.status !== "string" ||
    !["ok", "pending", "unavailable"].includes(raw.status) ||
    !Array.isArray(raw.items) ||
    !Number.isInteger(raw.offset) ||
    (raw.offset as number) < 0 ||
    (raw.offset as number) > 256 ||
    ["reset", "more", "omittedBefore", "incomplete"].some((k) => typeof raw[k] !== "boolean") ||
    (raw.revision !== undefined &&
      (typeof raw.revision !== "string" || !UUID_RE.test(raw.revision)))
  )
    return null;
  const items: SubagentHistoryItem[] = [],
    ids = new Set<string>();
  let incomplete = raw.incomplete === true || raw.items.length > 64;
  for (const value of raw.items.slice(0, 64)) {
    const row = safeSubagentHistoryItem(value);
    if (row && !ids.has(row.entryId)) {
      items.push(row);
      ids.add(row.entryId);
    } else incomplete = true;
  }
  return {
    status: raw.status as AgentSubagentHistoryResult["status"],
    items: raw.status === "unavailable" ? [] : items,
    offset: raw.offset as number,
    ...(typeof raw.revision === "string" ? { revision: raw.revision } : {}),
    reset: raw.reset === true,
    more: raw.more === true,
    omittedBefore: raw.omittedBefore === true,
    incomplete,
  };
}
interface Chunk {
  start: number;
  page: AgentSubagentHistoryResult;
}
/** Separate history collection: no mutation of AgentInfo.subagents or its active/alive count. */
export class SubagentHistoryReader {
  private readonly openedScope: string | null;
  private dead = false;
  private inflight = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private chunks: Chunk[] = [];
  private value = empty();
  constructor(
    private readonly port: Pick<ConnectionPort, "request">,
    private readonly paneId: string,
    private readonly scope: () => string | null,
    private readonly changed: (state: SubagentHistoryState) => void,
    private readonly active: () => boolean = () => true,
  ) {
    this.openedScope = scope();
  }
  get state(): SubagentHistoryState {
    if (!this.valid()) this.dispose();
    return this.value;
  }
  private valid(): boolean {
    return !this.dead && this.openedScope !== null && this.scope() === this.openedScope;
  }
  private set(state: SubagentHistoryState): void {
    this.value = state;
    this.changed(state);
  }
  start(): void {
    if (this.dead || this.timer !== undefined) return;
    this.timer = setInterval(() => void this.refresh(), 10000);
    void this.refresh();
  }
  async refresh(manual = false): Promise<void> {
    if (this.value.status === "unsupported" && !manual) return;
    await this.read(false);
  }
  async more(): Promise<void> {
    if (!this.value.more || !this.value.revision || this.value.offset >= 256) return;
    await this.read(true);
  }
  private async read(more: boolean): Promise<void> {
    if (!this.valid()) {
      this.dispose();
      return;
    }
    if (this.inflight || !this.active()) return;
    const offset = more ? this.value.offset : 0,
      revision = this.value.revision;
    this.inflight = true;
    this.set({ ...this.value, loading: true });
    try {
      const raw = await this.port.request("agent.subagent_history", {
        paneId: this.paneId,
        offset,
        limit: 64,
        ...(revision ? { revision } : {}),
      });
      if (!this.valid()) {
        this.dispose();
        return;
      }
      if (!this.active()) return;
      const page = pageOf(raw);
      if (!page) throw Error("Invalid history page");
      const same = !!revision && revision === page.revision && !page.reset;
      if (page.status === "unavailable") {
        this.chunks = [];
        this.set({ ...empty(), status: "unavailable" });
        return;
      }
      if ((more && same && page.offset < offset) || (!page.reset && page.offset > offset + 64))
        throw Error("Invalid history offset");
      const first = this.chunks[0];
      if (more && same) {
        this.chunks.push({ start: offset, page });
      } else if (!more && same && first?.page.offset === page.offset && page.status === "ok")
        this.chunks = [{ start: 0, page }, ...this.chunks.slice(1)];
      else this.chunks = [{ start: 0, page }];
      const items: SubagentHistoryItem[] = [],
        seen = new Set<string>();
      let chars = 0,
        clipped = false;
      for (const chunk of this.chunks) {
        for (const row of chunk.page.items) {
          if (seen.has(row.entryId)) continue;
          const size = JSON.stringify(row).length;
          if (items.length >= 256 || chars + size > 1024 * 1024) {
            clipped = true;
            continue;
          }
          seen.add(row.entryId);
          items.push(row);
          chars += size;
        }
      }
      const last = this.chunks.at(-1)!.page;
      const progressed = page.offset > offset;
      this.set({
        items,
        status: page.status,
        loading: false,
        offset: last.offset,
        ...(page.revision ? { revision: page.revision } : {}),
        more:
          last.more &&
          !!page.revision &&
          last.offset < 256 &&
          !clipped &&
          (more ? progressed : true),
        omittedBefore: this.chunks.some((c) => c.page.omittedBefore),
        incomplete:
          clipped ||
          this.chunks.some((c) => c.page.incomplete) ||
          (last.more && (!page.revision || last.offset >= 256 || (more && !progressed))),
      });
    } catch (error) {
      if (!this.valid()) {
        this.dispose();
        return;
      }
      if (this.active()) {
        this.chunks = [];
        const code = (error as { code?: unknown } | null)?.code;
        this.set({
          ...empty(),
          status:
            code === "method_not_found" || code === "unknown_method" ? "unsupported" : "failed",
        });
      }
    } finally {
      this.inflight = false;
      if (!this.dead && this.value.loading) this.set({ ...this.value, loading: false });
    }
  }
  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.chunks = [];
    this.set({ ...empty(), status: "unavailable" });
  }
}
export function subagentHistoryMessage(s: SubagentHistoryState): string {
  if (s.status === "unsupported")
    return "この操舵室の接続経路は、終了した子の一覧に対応していません。";
  if (s.status === "unavailable" || s.status === "failed")
    return "終了した子の履歴を取得できません。0件を意味しません。";
  if (s.status === "pending" || s.loading) return "終了した子の履歴を確認しています…";
  if (s.incomplete) return "確認できた終了履歴だけを表示しています。一部は未取得です。";
  return s.status === "ok" && s.items.length === 0 ? "終了した子の履歴はありません。" : "";
}
export function subagentTerminalLabel(status: SubagentHistoryItem["terminalStatus"]): string {
  return status === "completed" ? "完了" : status === "aborted" ? "中断" : "エラー";
}
