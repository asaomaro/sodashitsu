import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  DesktopMethods,
  RpcError,
  type ExtLine,
  type ExtPane,
  type ExtRequest,
} from "@sodashitsu/protocol";
import type { DesktopAgentAccess } from "../desktop/DesktopAgentAccess.js";
import type { ApiExtension } from "./ExtensionApi.js";
export const EXTENSION_DESKTOP_METHODS = [
  "desktop.agent.attach",
  "desktop.agent.observe",
  "desktop.agent.act",
  "desktop.agent.release",
] as const;
type Method = (typeof EXTENSION_DESKTOP_METHODS)[number];
type Runtime = { ext: ApiExtension; panes: ExtPane[]; send(line: ExtLine): void };
type Binding = {
  key: string;
  runId: string;
  paneId: string;
  signature: string;
  owner: string;
  closed: boolean;
  busy: boolean;
  releasing: boolean;
  expires: number;
  deadline?: number;
  leaseId?: string;
  timer?: ReturnType<typeof setTimeout>;
  unsubscribe: () => void;
  cancelPending?: () => void;
};
const failure = () =>
  new RpcError("unauthorized", "プラグインの画面・起動回・操作許可が変更されました");
/** Four existing human-granted APIs only. No capture start, local settings or grant issuance. */
export class ExtensionDesktopAgents {
  private bindings = new Set<Binding>();
  private pending = 0;
  constructor(
    private readonly agents: DesktopAgentAccess,
    private readonly runtime: (key: string) => Runtime | undefined,
  ) {}
  private pane(runtime: Runtime, paneId: string) {
    return runtime.panes.find(
      (p) =>
        p.id === paneId &&
        (p.plugin?.extensionKey === runtime.ext.key ||
          p.views?.some((v) => v.extensionKey === runtime.ext.key)),
    );
  }
  private signature(p: ExtPane) {
    return JSON.stringify([p.id, p.tabId, p.workspaceId, p.workspaceCwd, p.projectDir]);
  }
  private live(b: Binding): boolean {
    if (
      b.closed ||
      performance.now() >= b.expires ||
      (b.deadline !== undefined && performance.now() >= b.deadline)
    )
      return false;
    try {
      const r = this.runtime(b.key),
        p = r && this.pane(r, b.paneId);
      return (
        !!r &&
        r.ext.runId === b.runId &&
        r.ext.allow.includes("desktop-agent") &&
        !!p &&
        this.signature(p) === b.signature
      );
    } catch {
      return false;
    }
  }
  private close(b: Binding, cancel = true) {
    if (b.closed) return;
    b.closed = true;
    this.bindings.delete(b);
    clearTimeout(b.timer);
    b.unsubscribe();
    if (cancel) b.cancelPending?.();
    try {
      this.agents.clientGone(b.owner);
    } catch {
      /* Authority is already dead through ownerActive. */
    }
  }
  review() {
    for (const b of [...this.bindings]) if (!this.live(b)) this.close(b);
  }
  stopped(key: string, runId: string) {
    for (const b of [...this.bindings]) if (b.key === key && b.runId === runId) this.close(b);
  }
  handle(key: string, runId: string, request: ExtRequest): boolean {
    if (!(EXTENSION_DESKTOP_METHODS as readonly string[]).includes(request.method)) return false;
    const method = request.method as Method;
    let replied = false;
    const send = (ok: boolean, result: unknown) => {
      if (replied || request.id === undefined) return false;
      replied = true;
      try {
        const r = this.runtime(key);
        if (!r || r.ext.runId !== runId) return false;
        r.send(
          ok
            ? { type: "ext.result", id: request.id, ok: true, result }
            : {
                type: "ext.result",
                id: request.id,
                ok: false,
                error: {
                  code: result instanceof RpcError ? result.code : "invalid_params",
                  message:
                    result instanceof RpcError
                      ? result.message
                      : "デスクトップ操作の指定が不正です",
                },
              },
        );
        return true;
      } catch {
        return false;
      }
    };
    let b: Binding | undefined;
    try {
      this.review();
      const r = this.runtime(key);
      if (!r || r.ext.runId !== runId || !r.ext.allow.includes("desktop-agent")) throw failure();
      if (request.id === undefined)
        throw new RpcError("invalid_params", "デスクトップ操作には応答IDが必要です");
      const { paneId, ...args } = z
        .object({ paneId: z.uuid() })
        .passthrough()
        .parse(request.params);
      const p = DesktopMethods[method].parse(args);
      const pane = this.pane(r, paneId);
      if (!pane) throw failure();
      b = [...this.bindings].find((b) => b.key === key && b.runId === runId && b.paneId === paneId);
      // Revocation needs no new physical-operation slot and must preempt a pending capture/action.
      if (method === "desktop.agent.release") {
        const value = DesktopMethods["desktop.agent.release"].parse(p);
        if (!b || value.leaseId !== b.leaseId || !this.live(b)) throw failure();
        b.releasing = true;
        let result;
        try {
          result = this.agents.release(b.owner, value.leaseId);
        } finally {
          b.releasing = false;
          this.close(b);
        }
        send(true, result);
        return true;
      }
      if (this.pending >= 16)
        throw new RpcError("server_busy", "デスクトップ操作の終了を待ってください");
      if (method === "desktop.agent.attach") {
        if (b) throw new RpcError("server_busy", "この画面の操作許可を先に解放してください");
        if (this.bindings.size >= 16)
          throw new RpcError("server_busy", "プラグインの画面操作が上限です");
        b = {
          key,
          runId,
          paneId: paneId,
          signature: this.signature(pane),
          owner: randomUUID(),
          closed: false,
          busy: false,
          releasing: false,
          expires: performance.now() + 120000,
          unsubscribe: () => {},
        };
        const bound = b;
        b.unsubscribe = this.agents.onOwnerRevoked(b.owner, () => {
          if (!bound.releasing) this.close(bound);
        });
        b.timer = setTimeout(() => this.close(bound), 120000);
        b.timer.unref();
        this.bindings.add(b);
      } else if (!b || !("leaseId" in p) || p.leaseId !== b.leaseId) throw failure();
      if (b.busy) throw new RpcError("server_busy", "この画面の操作が処理中です");
      const bound = b;
      bound.busy = true;
      bound.deadline = performance.now() + 20000;
      this.pending++;
      bound.cancelPending = () => send(false, failure());
      const timer = setTimeout(() => this.close(bound), 20000);
      timer.unref();
      void (async () => {
        try {
          if (!this.live(bound)) throw failure();
          let result: unknown;
          if (method === "desktop.agent.attach") {
            const value = DesktopMethods["desktop.agent.attach"].parse(p);
            const attached = this.agents.attach(bound.owner, value.ticket, () => this.live(bound));
            bound.leaseId = attached.leaseId;
            result = attached;
          } else if (method === "desktop.agent.observe") {
            const value = DesktopMethods["desktop.agent.observe"].parse(p);
            await this.agents.refresh(bound.owner, value.leaseId, value.afterFrameSeq,value.region);
            if (!this.live(bound)) throw failure();
            // Base64 plus envelope must fit the existing four-MiB extension line budget.
            result = this.agents.observe(
              bound.owner,
              value.leaseId,
              value.afterFrameSeq,
              3 * 1024 * 1024 - 4096,
            );
          } else {
            const value = DesktopMethods["desktop.agent.act"].parse(p);
            result = await this.agents.act(
              bound.owner,
              value.leaseId,
              value.observationId,
              value.inputs,
            );
          }
          if (!this.live(bound)) throw failure();
          if (Buffer.byteLength(JSON.stringify(result)) > 4 * 1024 * 1024 - 1024)
            throw new RpcError("server_busy", "画像がプラグイン応答の上限を超えています");
          if (!send(true, result)) this.close(bound, false);
        } catch (error) {
          if (
            method !== "desktop.agent.observe" ||
            !(error instanceof RpcError) ||
            error.code !== "server_busy" ||
            !this.live(bound)
          )
            this.close(bound, false);
          send(false, error);
        } finally {
          clearTimeout(timer);
          bound.busy = false;
          delete bound.deadline;
          delete bound.cancelPending;
          this.pending--;
        }
      })();
    } catch (error) {
      send(false, error);
    }
    return true;
  }
}
