import type { AgentSubagentUsageResult } from "@sodashitsu/protocol";
import type { ConnectionPort } from "../net/ports.js";
export interface SubagentUsageState {
  result: AgentSubagentUsageResult | null;
  loading: boolean;
  failed: boolean;
}
/** A child-only read. No parent usage, transcript permission or input capability is reused. */
export class SubagentUsageReader {
  private dead = false;
  private inflight = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly openedScope: string | null;
  private value: SubagentUsageState = { result: null, loading: false, failed: false };
  constructor(
    private readonly port: Pick<ConnectionPort, "request">,
    private readonly target: Readonly<{ paneId: string; agentId: string; entryId?: string }>,
    private readonly scope: () => string | null,
    private readonly changed: (state: SubagentUsageState) => void,
    private readonly active: () => boolean = () => true,
  ) {
    this.openedScope = scope();
  }
  get state(): SubagentUsageState {
    if (!this.valid()) this.dispose();
    return this.value;
  }
  private valid(): boolean {
    return !this.dead && this.openedScope !== null && this.scope() === this.openedScope;
  }
  private set(state: SubagentUsageState): void {
    this.value = state;
    this.changed(state);
  }
  start(): void {
    if (this.dead || this.timer !== undefined) return;
    this.timer = setInterval(() => void this.refresh(), 10000);
    void this.refresh();
  }
  async refresh(): Promise<void> {
    if (!this.valid()) {
      this.dispose();
      return;
    }
    if (this.inflight || !this.active()) return;
    this.inflight = true;
    this.set({ ...this.value, loading: true, failed: false });
    try {
      const raw =
        this.target.entryId !== undefined
          ? await this.port.request("agent.subagent_history_usage", {
              paneId: this.target.paneId,
              agentId: this.target.agentId,
              entryId: this.target.entryId,
            })
          : await this.port.request("agent.subagent_usage", {
              paneId: this.target.paneId,
              agentId: this.target.agentId,
            });
      if (!this.valid()) {
        this.dispose();
        return;
      }
      if (!this.active()) return;
      // Old or malformed peers never become a zero-usage response.
      const result = raw && (raw.status === "ok" || raw.status === "unavailable") ? raw : null;
      this.set({ result, loading: false, failed: result === null });
    } catch {
      if (!this.valid()) {
        this.dispose();
        return;
      }
      if (this.active()) this.set({ result: null, loading: false, failed: true });
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
    this.set({ result: null, loading: false, failed: false });
  }
}
