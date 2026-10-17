import { EventEmitter } from "node:events";
import type { WsConnection } from "../ws/WsServer.js";

/** Minimal shared contract for a real WebSocket and an authenticated machine channel. */
export interface DesktopCdpPeer {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  ping(): void;
  on(event: string, listener: (...args: any[]) => void): unknown;
}
/** No bus broadcast: only this authenticated connection receives its renderer. */
export class RpcDesktopCdpPeer extends EventEmitter implements DesktopCdpPeer {
  readyState = 1;
  constructor(private readonly connection: WsConnection) {
    super();
    connection.onClose(() => this.closed());
  }
  get bufferedAmount(): number { return this.connection.bufferedAmount; }
  send(data: string): void {
    if (this.readyState === 1)
      this.connection.sendText(JSON.stringify({ event:"vscode.cdp", data:JSON.parse(data) }));
  }
  receive(message: unknown): void {
    if (this.readyState === 1) this.emit("message", Buffer.from(JSON.stringify(message)), false);
  }
  ping(): void { if (this.readyState === 1) this.emit("pong"); }
  close(code = 1000, reason = "VSCode channel closed"): void {
    if (this.readyState !== 1) return;
    this.closed();
    this.connection.close(code, reason);
  }
  terminate(): void { this.close(1011, "VSCode channel ended"); }
  private closed(): void {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.emit("close");
  }
}
