import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { PreviewOrigin, type PreviewHelperProbe } from "@sodashitsu/protocol";

/** Fixed local page: its secret is never included in an authenticated/public RPC response. */
export class LocalPreviewProbe {
  readonly id = randomUUID();
  private readonly secret = randomBytes(32).toString("base64url");
  private readonly sockets = new Set<Socket>();
  private host = "";
  private closed = false;
  private readonly server;
  private constructor(parent: string) {
    PreviewOrigin.parse(parent);
    const nonce = randomBytes(16).toString("base64url");
    const message = JSON.stringify({ type: "soda-preview-helper-probe", id: this.id, secret: this.secret });
    this.server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000 }, (req, res) => {
      // Host is essential: preview's upstream transport strips Host and uses 127.0.0.1.
      // That transport must never be able to obtain this proof on behalf of a remote browser.
      if (this.closed || req.method !== "GET" || req.url !== "/probe" || req.headers.host !== this.host || req.socket.remoteAddress !== "127.0.0.1") {
        res.writeHead(403).end(); return;
      }
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors ${parent}; base-uri 'none'; form-action 'none'`,
      });
      res.end(`<!doctype html><script nonce="${nonce}">parent.postMessage(${message},${JSON.stringify(parent)});</script>`);
    });
    this.server.maxConnections = 16;
    this.server.headersTimeout = 5000;
    this.server.on("connection", socket => { this.sockets.add(socket); socket.once("close", () => this.sockets.delete(socket)); });
  }
  static async listen(parent: string): Promise<LocalPreviewProbe> {
    const probe = new LocalPreviewProbe(parent);
    await new Promise<void>((resolve, reject) => { probe.server.once("error", reject); probe.server.listen(0, "127.0.0.1", resolve); });
    const address = probe.server.address() as { port: number };
    probe.host = `p${randomBytes(16).toString("hex")}.localhost:${address.port}`;
    return probe;
  }
  descriptor(): PreviewHelperProbe {
    const origin = `http://${this.host}`;
    return { id: this.id, origin, url: `${origin}/probe` };
  }
  matches(secret: string): boolean {
    const actual = Buffer.from(secret), expected = Buffer.from(this.secret);
    return !this.closed && actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  async close(): Promise<void> {
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }
}
