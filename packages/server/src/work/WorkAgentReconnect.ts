import {
  RpcError,
  type MethodName,
  type ParamsOf,
  type ResultOf,
  type WorkAgentProxyCloseReason,
} from "@sodashitsu/protocol";
import { DesktopBridgeError } from "../desktop/bridgeRpc.js";

export interface WorkAgentRemote {
  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>;
  valid(): boolean;
  close(): void;
}
export type WorkAgentConnectionCause =
  "channel_unavailable" | "rpc_timeout" | "rpc_closed" | "rpc_error" | "connect_failed";
export type WorkAgentConnectionEvent = {
  event: "disconnected" | "reconnect_failed" | "reconnected" | "closed";
  reason?: WorkAgentProxyCloseReason;
  elapsedMs?: number;
  cause?: WorkAgentConnectionCause;
};
const unavailable = () =>
  new RpcError(
    "not_found",
    "作業先との接続を再確認中です。操作は自動再送しません。復旧後に読み取りで状態を確認してください",
  );

/** Replaces only the channel. Never replays a request already submitted to B. */
export class WorkAgentReconnect implements WorkAgentRemote {
  private lostAt: number | undefined;
  private retry: Promise<void> | undefined;
  private closed = false;
  private candidate: WorkAgentRemote | undefined;
  constructor(
    private current: WorkAgentRemote,
    private readonly connect: () => Promise<WorkAgentRemote>,
    private readonly validate: (remote: WorkAgentRemote) => Promise<void>,
    private readonly event: (event: WorkAgentConnectionEvent) => void,
    private readonly fatal: (reason: WorkAgentProxyCloseReason) => void,
    private readonly graceMs = 60000,
    private readonly now = Date.now,
  ) {}
  private cause(error: unknown): WorkAgentConnectionCause {
    return error instanceof DesktopBridgeError
      ? error.reason === "timeout"
        ? "rpc_timeout"
        : error.reason === "closed"
          ? "rpc_closed"
          : "rpc_error"
      : "rpc_error";
  }
  private lost(cause: WorkAgentConnectionCause = "channel_unavailable") {
    if (this.lostAt === undefined) {
      this.lostAt = this.now();
      this.event({ event: "disconnected", cause });
    }
  }
  private expire(): boolean {
    if (this.lostAt !== undefined && this.now() - this.lostAt >= this.graceMs) {
      this.fatal("reconnect_expired");
      this.close();
      return true;
    }
    return false;
  }
  valid(): boolean {
    return !this.closed && this.lostAt === undefined && this.current.valid();
  }
  async ready(): Promise<void> {
    if (this.closed) throw unavailable();
    if (this.valid()) return;
    this.lost();
    if (this.expire()) throw unavailable();
    if (this.retry) return this.retry;
    const retry = (async () => {
      let candidate: WorkAgentRemote | undefined,
        validating = false;
      try {
        candidate = await this.connect();
        if (this.closed) {
          candidate.close();
          candidate = undefined;
          throw unavailable();
        }
        this.candidate = candidate;
        validating = true;
        await this.validate(candidate);
        if (!candidate.valid() || this.closed || this.expire()) throw unavailable();
        const previous = this.current;
        this.current = candidate;
        this.candidate = undefined;
        candidate = undefined;
        const elapsedMs = this.now() - this.lostAt!;
        this.lostAt = undefined;
        previous.close();
        this.event({ event: "reconnected", elapsedMs });
      } catch (error) {
        if (candidate && this.candidate === candidate) {
          this.candidate = undefined;
          candidate.close();
        }
        if (
          !this.closed &&
          validating &&
          error instanceof DesktopBridgeError &&
          error.reason === "rejected"
        ) {
          this.fatal("target_validation_failed");
          this.close();
        } else if (!this.closed) {
          this.event({
            event: "reconnect_failed",
            cause: validating ? this.cause(error) : "connect_failed",
          });
          this.expire();
        }
        throw unavailable();
      }
    })();
    this.retry = retry;
    try {
      await retry;
    } finally {
      if (this.retry === retry) this.retry = undefined;
    }
  }
  async request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
    if (!this.valid()) {
      if (!this.closed) this.lost();
      throw unavailable();
    }
    const remote = this.current;
    try {
      return await remote.request(method, params);
    } catch (error) {
      if (!(error instanceof DesktopBridgeError && error.reason === "rejected")) {
        if (!this.closed && this.current === remote) {
          this.lost(this.cause(error));
          remote.close();
        }
        throw new RpcError(
          "not_found",
          "作業先への操作の結果を確認できません。自動再送はしません。接続復旧後に読み取りで状態を確認してください",
        );
      }
      // A normal tool error (e.g. version conflict) is not a disconnect. Only
      // a read-only recheck that rejects the pinned authority terminates it.
      try {
        await this.validate(remote);
      } catch (validationError) {
        if (
          !this.closed &&
          validationError instanceof DesktopBridgeError &&
          validationError.reason === "rejected"
        ) {
          this.fatal("target_validation_failed");
          this.close();
        } else if (!this.closed && this.current === remote) {
          this.lost(this.cause(validationError));
          remote.close();
        }
      }
      throw error;
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.current.close();
    this.candidate?.close();
    this.candidate = undefined;
  }
}
