import {createHash, randomUUID} from "node:crypto";
import type {ClientHelloResult, DesktopEndpointStart, DesktopEndpointStatus, DesktopResults} from "@sodashitsu/protocol";
import type {WsConnection} from "../ws/WsServer.js";
import {DesktopSigninEnrollment} from "./DesktopSigninEnrollment.js";

export interface DesktopSigninCallScope {
  /** Must also fence publication/side effects inside an asynchronous handler. */
  active(): boolean;
  readonly signal: AbortSignal;
  readonly revision: string;
  readonly provider: string;
  readonly allowInput: boolean;
}
/** Deliberately no generic invoke(method, params), server surface or key writer. */
export interface DesktopSigninHandlers {
  hello(owner: string, scope: DesktopSigninCallScope): ClientHelloResult | Promise<ClientHelloResult>;
  capabilities(scope: DesktopSigninCallScope): DesktopResults["desktop.capabilities"] | Promise<DesktopResults["desktop.capabilities"]>;
  status(scope: DesktopSigninCallScope): DesktopEndpointStatus | Promise<DesktopEndpointStatus>;
  start(owner: string, params: DesktopEndpointStart, scope: DesktopSigninCallScope): Promise<{started: true}>;
  clientGone(owner: string): void;
}
interface Channel {close(): void;}
const reason = "Desktop signin connection is unavailable";
const quiet = (run: () => void) => {try {run();} catch {}};

/** Finite RPC boundary for a future dedicated service, NOT an authorization
 * proof for Winlogon. The host must validate its package, load the protected
 * enrollment, enforce its revision and signed-out worker epoch, and revoke on
 * changes. Never attach this to the general WsGateway or run the repo as SYSTEM.
 * Root's supplied hello proves no peer identity; the sealed endpoint must do so.
 */
export class DesktopSigninDispatch {
  readonly #channels = new Set<Channel>();
  #closed = false;
  readonly #abort: () => void;
  constructor(private readonly options: {
    enrollment: DesktopSigninEnrollment;
    handlers: DesktopSigninHandlers;
    active(): boolean;
    signal: AbortSignal;
    now?: () => number;
  }) {
    this.#abort = () => this.close();
    options.signal.addEventListener("abort", this.#abort, {once: true});
    if (!this.live()) this.close();
  }
  private live(): boolean {
    try {return !this.#closed && !this.options.signal.aborted && this.options.active() && !this.#closed && !this.options.signal.aborted;}
    catch {return false;}
  }
  /** A logical authenticated delegation channel, never a public listener. */
  accept(connection: WsConnection): void {
    if (!this.live() || this.#channels.size >= 16) {
      quiet(() => connection.close(1008, reason));
      return;
    }
    const owner = randomUUID(), controller = new AbortController();
    const policy = this.options.enrollment.publicStatus();
    const now = this.options.now ?? (() => performance.now());
    const expires = now() + 120000;
    let closed = false, busy = false, hello = false, deadline = Infinity;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    const ids = new Set<string>();
    const active = () => {
      if (closed) return false;
      if (!this.live() || closed || controller.signal.aborted || now() >= expires || now() >= deadline) {channel.close(); return false;}
      return true;
    };
    const channel: Channel = {close: () => {
      if (closed) return;
      closed = true;
      clearTimeout(lifetimeTimer); clearTimeout(requestTimer);
      this.#channels.delete(channel);
      controller.abort();
      quiet(() => this.options.handlers.clientGone(owner));
      quiet(() => connection.close(1008, reason));
    }};
    const lifetimeTimer = setTimeout(channel.close, 120000);
    lifetimeTimer.unref();
    this.#channels.add(channel);
    const scope: DesktopSigninCallScope = Object.freeze({
      active, signal: controller.signal, revision: policy.revision,
      provider: policy.provider, allowInput: policy.allowInput,
    });
    connection.onClose(channel.close);
    connection.onBinary(channel.close);
    connection.onText(text => {
      if (!active()) return;
      if (busy || Buffer.byteLength(text, "utf8") > 16*1024 || ids.size >= 1000) {channel.close(); return;}
      busy = true;
      deadline = now() + 5000;
      requestTimer = setTimeout(channel.close, 5000); requestTimer.unref();
      void (async () => {
        const message = this.options.enrollment.classify(new TextEncoder().encode(text));
        if (ids.has(message.id) || (!hello && message.method !== "client.hello") || (hello && message.method === "client.hello")) throw new Error(reason);
        ids.add(message.id);
        if (!active()) throw new Error(reason);
        let result: unknown;
        switch (message.method) {
          case "client.hello":
            result = await this.options.handlers.hello(owner, scope);
            hello = true;
            break;
          case "desktop.capabilities":
            result = await this.options.handlers.capabilities(scope);
            break;
          case "desktop.endpoint.status":
            result = await this.options.handlers.status(scope);
            break;
          case "desktop.endpoint.start": {
            const fingerprint = createHash("sha256").update(Buffer.from(message.params.hello.identity, "hex")).digest("hex");
            if (!policy.peers.some(peer => peer.fingerprint === fingerprint)) throw new Error(reason);
            await this.options.handlers.start(owner, message.params, scope);
            result = {started: true};
            break;
          }
        }
        if (!active()) throw new Error(reason);
        const response = JSON.stringify({id: message.id, result});
        if (!active() || Buffer.byteLength(response, "utf8") + connection.bufferedAmount > 64*1024) throw new Error(reason);
        connection.sendText(response);
      })().catch(channel.close).finally(() => {
        clearTimeout(requestTimer); requestTimer = undefined;
        deadline = Infinity; busy = false;
      });
    });
    if (!active()) channel.close();
  }
  /** Revocation is terminal. A fresh enrollment requires a fresh dispatcher. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.options.signal.removeEventListener("abort", this.#abort);
    for (const channel of [...this.#channels]) channel.close();
  }
}
