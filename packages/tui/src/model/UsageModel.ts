import type { AgentUsageResult, AgentUsageChangedEvent } from "@sodashitsu/protocol";
import { errorCodeOf } from "@sodashitsu/client-core";
import type { RequestPort } from "../term/PaneRegistry.js";

/** Subscribe only while a usage screen is visible. Connection generations discard late responses. */
export class UsageModel {
  data: AgentUsageResult = { panes: {}, accounts: [] };
  status: "loading" | "ready" | "failed" | "unsupported" = "loading";
  private open = false;
  private wanted = false;
  private watching = false;
  private generation = 0;
  private eventRevision = 0;
  private accountRevision = 0;
  private paneRevisions = new Map<string, number>();
  constructor(
    private readonly conn: RequestPort,
    private readonly changed: () => void,
  ) {}
  connected(): void {
    this.open = true;
    this.watching = false;
    this.generation++;
    this.sync(this.wanted);
  }
  disconnected(): void {
    this.open = false;
    this.watching = false;
    this.generation++;
    this.data = { panes: {}, accounts: [] };
    this.paneRevisions.clear();
    this.eventRevision = 0;
    this.accountRevision = 0;
    this.status = "loading";
    this.changed();
  }
  sync(wanted: boolean): void {
    this.wanted = wanted;
    if (!wanted && this.watching) {
      this.watching = false;
      this.generation++;
      if (this.open)
        void this.conn.request("agent.usage_watch", { on: false }).catch(() => undefined);
    } else if (wanted && this.open && !this.watching) void this.start();
  }
  apply(data: AgentUsageChangedEvent["data"]): void {
    if (!this.open || !this.watching) return;
    this.eventRevision++;
    const panes = { ...this.data.panes };
    for (const [id, u] of Object.entries(data.panes)) {
      this.paneRevisions.set(id, this.eventRevision);
      if (u === null) panes[id] = null;
      else if (!panes[id] || u.updatedAt >= panes[id]!.updatedAt) panes[id] = u;
    }
    if (data.accounts !== undefined) this.accountRevision = this.eventRevision;
    this.data = { panes, accounts: data.accounts ?? this.data.accounts };
    this.status = "ready";
    this.changed();
  }
  private async start(): Promise<void> {
    this.watching = true;
    this.status = "loading";
    const generation = ++this.generation;
    this.changed();
    try {
      await this.conn.request("agent.usage_watch", { on: true });
      if (generation !== this.generation) return;
      const revision = this.eventRevision;
      const snapshot = await this.conn.request("agent.usage", {});
      if (generation !== this.generation) return;
      const panes = { ...snapshot.panes };
      for (const [id, u] of Object.entries(this.data.panes)) {
        const next = panes[id];
        if (
          ((this.paneRevisions.get(id) ?? 0) > revision && (u===null || !next)) ||
          (u && next && u.updatedAt > next.updatedAt)
        )
          panes[id] = u;
      }
      this.data = {
        panes,
        accounts: this.accountRevision > revision ? this.data.accounts : snapshot.accounts,
      };
      this.status = "ready";
    } catch (error) {
      if (generation !== this.generation) return;
      this.status = errorCodeOf(error) === "not_found" ? "unsupported" : "failed";
    }
    this.changed();
  }
}
