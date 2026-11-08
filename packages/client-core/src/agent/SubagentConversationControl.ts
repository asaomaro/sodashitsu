import {
  UUID_RE,
  type AgentSubagentControlResult,
  type AgentSubagentSendResult,
  type SubagentControlReason,
} from "@sodashitsu/protocol";
import type { ConnectionPort } from "../net/ports.js";
export interface SubagentControlSnapshot {
  capability: AgentSubagentControlResult | null;
  checking: boolean;
  sending: boolean;
  controlFailed: boolean;
  preparationFailed: boolean;
  unsupported: boolean;
  deliveryUnknown: boolean;
  last: AgentSubagentSendResult | null;
}
const reasons: readonly SubagentControlReason[] = [
  "ready",
  "transport-not-connected",
  "transport-unavailable",
  "target-unavailable",
  "target-busy",
  "scope-expired",
];
const unavailable: AgentSubagentControlResult = {
  mode: "parent-draft",
  reason: "transport-unavailable",
};
function controlOf(raw: unknown, now: number): AgentSubagentControlResult {
  if (!raw || typeof raw !== "object") return unavailable;
  const r = raw as Record<string, unknown>;
  if (
    r.mode === "direct" &&
    r.reason === "ready" &&
    typeof r.leaseId === "string" &&
    UUID_RE.test(r.leaseId) &&
    typeof r.expiresAt === "number" &&
    Number.isFinite(r.expiresAt) &&
    r.expiresAt > now
  )
    return { mode: "direct", reason: "ready", leaseId: r.leaseId, expiresAt: r.expiresAt };
  if (
    r.mode === "parent-draft" &&
    typeof r.reason === "string" &&
    r.reason !== "ready" &&
    reasons.includes(r.reason as SubagentControlReason)
  )
    return { mode: "parent-draft", reason: r.reason as Exclude<SubagentControlReason, "ready"> };
  return unavailable;
}
function resultOf(raw: unknown): AgentSubagentSendResult {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (
      r.status === "accepted" &&
      r.reason === "accepted" &&
      typeof r.turnId === "string" &&
      r.turnId.length > 0 &&
      r.turnId.length <= 256
    )
      return { status: "accepted", reason: "accepted", turnId: r.turnId };
    if (
      r.status === "rejected" &&
      typeof r.reason === "string" &&
      (r.reason === "request-conflict" ||
        (r.reason !== "ready" && reasons.includes(r.reason as SubagentControlReason)))
    )
      return {
        status: "rejected",
        reason: r.reason as Extract<AgentSubagentSendResult, { status: "rejected" }>["reason"],
      };
  }
  return { status: "delivery-unknown", reason: "delivery-unknown" };
}
/** UI-only lease lifecycle. Never starts a transport, infers provider support, or retries input. */
export class SubagentConversationControl {
  private capability: AgentSubagentControlResult | null = null;
  private checking = false;
  private sending = false;
  private controlFailed = false;
  private preparationFailed = false;
  private unsupported = false;
  private deliveryUnknown = false;
  private last: AgentSubagentSendResult | null = null;
  private dead = false;
  private revision = 0;
  private controlRevision = 0;
  private controlTail: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly openedScope: string | null;
  constructor(
    private readonly port: Pick<ConnectionPort, "request">,
    private readonly target: Readonly<{ paneId: string; agentId: string }>,
    private readonly scope: () => string | null,
    private readonly changed: (state: SubagentControlSnapshot) => void,
    private readonly requestId: () => string,
    private readonly active: () => boolean = () => true,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.openedScope = scope();
  }
  get state(): SubagentControlSnapshot {
    return {
      capability: this.capability,
      checking: this.checking,
      sending: this.sending,
      controlFailed: this.controlFailed,
      preparationFailed: this.preparationFailed,
      unsupported: this.unsupported,
      deliveryUnknown: this.deliveryUnknown,
      last: this.last,
    };
  }
  private emit(): void {
    this.changed(this.state);
  }
  private valid(): boolean {
    return !this.dead && this.openedScope !== null && this.scope() === this.openedScope;
  }
  start(): void {
    if (this.dead || this.timer !== undefined) return;
    this.timer = setInterval(() => void this.refresh(), 5000);
    void this.refresh();
  }
  async refresh(): Promise<void> {
    if (this.sending || this.checking || this.unsupported || this.deliveryUnknown || !this.active())
      return;
    if (!this.valid()) {
      this.dispose();
      return;
    }
    await this.query();
  }
  private async query(
    stillCurrent: () => boolean = () => true,
  ): Promise<AgentSubagentControlResult | null> {
    const previous = this.controlTail;
    let release!: () => void;
    const tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Install the queue entry before callbacks can request another read.
    this.controlTail = tail;
    try {
      if (previous) await previous;
      if (!this.valid()) {
        this.dispose();
        return null;
      }
      if (!this.active() || !stillCurrent() || this.unsupported || this.deliveryUnknown)
        return null;
      return await this.queryNow();
    } finally {
      release();
      if (this.controlTail === tail) this.controlTail = null;
    }
  }
  private async queryNow(): Promise<AgentSubagentControlResult | null> {
    const revision = ++this.controlRevision;
    this.checking = true;
    this.controlFailed = false;
    this.emit();
    try {
      const raw = await this.port.request("agent.subagent_control", this.target);
      if (!this.valid()) {
        this.dispose();
        return null;
      }
      if (revision !== this.controlRevision || !this.active()) return null;
      this.capability = controlOf(raw, this.now());
      return this.capability;
    } catch (error) {
      if (!this.valid()) {
        this.dispose();
        return null;
      }
      if (revision !== this.controlRevision || !this.active()) return null;
      const code = (error as { code?: unknown } | null)?.code;
      this.unsupported = code === "method_not_found" || code === "unknown_method";
      this.controlFailed = !this.unsupported;
      this.capability = unavailable;
      return null;
    } finally {
      if (!this.dead && revision === this.controlRevision) {
        this.checking = false;
        this.emit();
      }
    }
  }
  /** A deliberate submit always gets a fresh lease; typing does not consume or depend on an old lease. */
  async send(text: string, stillCurrent: () => boolean): Promise<AgentSubagentSendResult | null> {
    if (!this.valid()) {
      this.dispose();
      return null;
    }
    if (
      !this.active() ||
      this.sending ||
      this.deliveryUnknown ||
      this.capability?.mode !== "direct" ||
      !text.trim() ||
      text.includes("\0") ||
      text.length > 16_384 ||
      !stillCurrent()
    )
      return null;
    const revision = ++this.revision;
    this.sending = true;
    this.preparationFailed = false;
    this.last = null;
    this.emit();
    try {
      const capability = await this.query(stillCurrent);
      if (!this.valid()) {
        this.dispose();
        return null;
      }
      if (
        revision !== this.revision ||
        !this.active() ||
        !stillCurrent() ||
        capability?.mode !== "direct" ||
        capability.expiresAt <= this.now()
      )
        return null;
      let requestId: string;
      try {
        requestId = this.requestId();
      } catch {
        this.preparationFailed = true;
        return null;
      }
      if (!UUID_RE.test(requestId)) {
        this.preparationFailed = true;
        return null;
      }
      let raw: unknown;
      try {
        raw = await this.port.request("agent.subagent_send", {
          ...this.target,
          leaseId: capability.leaseId,
          requestId,
          text,
        });
      } catch {
        raw = null;
      }
      if (!this.valid()) {
        this.dispose();
        return null;
      }
      if (revision !== this.revision) return null;
      const result = resultOf(raw);
      // Uncertainty belongs to this target, even when its draft was replaced while sending.
      if (result.status === "delivery-unknown") {
        this.deliveryUnknown = true;
        this.capability = null;
        this.last = result;
      }
      if (!stillCurrent()) return null;
      this.last = result;
      if (result.status === "rejected") {
        this.capability = {
          mode: "parent-draft",
          reason: result.reason === "request-conflict" ? "scope-expired" : result.reason,
        };
      }
      return result;
    } finally {
      if (!this.dead && revision === this.revision) {
        this.sending = false;
        this.emit();
      }
    }
  }
  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    this.revision++;
    this.controlRevision++;
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
    this.capability = null;
    this.last = null;
    this.checking = false;
    this.sending = false;
    this.controlFailed = false;
    this.preparationFailed = false;
    this.unsupported = false;
    this.deliveryUnknown = false;
    this.emit();
  }
}
export function subagentControlMessage(state: SubagentControlSnapshot): string {
  if (state.deliveryUnknown)
    return "子への送達を確認できません。自動再送しません。親の画面などで確認してください。";
  if (state.sending) return "子への送信を確認しています…";
  if (state.last?.status === "accepted")
    return "子への送信を受け付けました。処理の完了ではありません。";
  if (state.preparationFailed) return "送信の準備ができませんでした。まだ送信していません。";
  if (state.controlFailed) return "子の接続情報を取得できませんでした。まだ送信していません。";
  if (state.unsupported) return "この操舵室の接続経路は、子への直接送信に対応していません。";
  const reason = state.capability?.reason;
  if (reason === "ready") return "送信先: 子（送信時に接続を再確認します）";
  if (reason === "target-busy")
    return "子が入力を受け付けられる状態ではありません。親へ依頼できます。";
  if (reason === "target-unavailable" || reason === "scope-expired")
    return "子の参照を確認できません。親へ依頼できます。";
  if (reason === "transport-not-connected") return "この子への接続がありません。親へ依頼できます。";
  if (reason === "transport-unavailable")
    return "この操舵室の接続経路では、子へ直接送信できません。親へ依頼できます。";
  return "子の接続情報を確認しています…";
}
