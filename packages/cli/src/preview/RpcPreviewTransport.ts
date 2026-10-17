import { PREVIEW_CHUNK_BYTES, PREVIEW_READ_BYTES, PREVIEW_WS_BYTES } from "@sodashitsu/protocol";
import type { WebSocket } from "ws";
import type { SodaClient } from "../wsClient.js";
import type { PreviewGatewayTransport } from "./LoopbackGateway.js";

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function rpcPreviewTransport(client: Pick<SodaClient, "request">, requestId: string, httpReadMaxBytes?: number): PreviewGatewayTransport {
  const cancel = async (streamId: string) => { await client.request("preview.cancel", { streamId }).catch(() => undefined); };
  const prepare: NonNullable<PreviewGatewayTransport["prepareWebsocket"]> = async (req) => {
    const begin = await client.request("preview.ws.begin", { requestId, path: req.path, headers: req.headers, protocols: req.protocols });
    if (req.signal.aborted) { await cancel(begin.streamId); throw new Error("preview cancelled"); }
    const abort = () => { void cancel(begin.streamId); };
    req.signal.addEventListener("abort", abort, { once: true });
    return {
      protocol: begin.protocol,
      close: async () => { req.signal.removeEventListener("abort", abort); await cancel(begin.streamId); },
      attach: async (socket: WebSocket) => {
        let pending = 0, messages = 0, failed = false;
        let writing = Promise.resolve();
        socket.on("message", (raw, binary) => {
          if (failed || req.signal.aborted) return;
          const b = Buffer.isBuffer(raw) ? raw : Buffer.concat(Array.isArray(raw) ? raw : [Buffer.from(raw)]);
          pending += b.length; messages++;
          if (b.length > PREVIEW_WS_BYTES || pending > 1024 * 1024 || messages > 256) { failed = true; socket.close(1009, "preview message limit"); abort(); return; }
          if (pending >= 128 * 1024 || messages >= 128) socket.pause();
          writing = writing.then(async () => {
            if (!failed && !req.signal.aborted) await client.request("preview.ws.write", { streamId: begin.streamId, data: b.toString("base64"), binary });
            pending -= b.length; messages--; if (!failed && pending < 64 * 1024 && messages < 64) socket.resume();
          }).catch(() => { failed = true; socket.close(1011, "preview upstream closed"); abort(); });
        });
        try {
          while (!req.signal.aborted && socket.readyState === socket.OPEN) {
            const result = await client.request("preview.ws.read", { streamId: begin.streamId });
            if (result.kind === "wait") await pause(50);
            else if (result.kind === "end") { socket.close(1000, "upstream closed"); break; }
            else await new Promise<void>((resolve, reject) => socket.send(Buffer.from(result.data, "base64"), { binary: result.binary }, (error) => error ? reject(error) : resolve()));
          }
        } finally { req.signal.removeEventListener("abort", abort); await cancel(begin.streamId); }
      },
    };
  };
  return {
    prepareWebsocket: prepare,
    websocket: async () => { throw new Error("WebSocket must be prepared before browser upgrade"); },
    http: async (req, res) => {
      const { streamId } = await client.request("preview.http.begin", { requestId, method: req.method as "GET", path: req.path, headers: req.headers });
      let stopped = false;
      const abort = () => { stopped = true; void cancel(streamId); };
      req.signal.addEventListener("abort", abort, { once: true });
      if (req.signal.aborted) abort();
      // Upload and response proceed independently, including early HTTP responses.
      const upload = (async () => {
        for await (const chunk of req.body) {
          const b = Buffer.from(chunk);
          for (let at = 0; at < b.length; at += PREVIEW_CHUNK_BYTES) {
            if (stopped) return;
            await client.request("preview.http.write", { streamId, data: b.subarray(at, at + PREVIEW_CHUNK_BYTES).toString("base64"), end: false });
          }
        }
        if (!stopped) await client.request("preview.http.write", { streamId, data: "", end: true });
      })().catch(() => { abort(); });
      try {
        while (!stopped) {
          const result = await client.request("preview.http.read", { streamId, ...(httpReadMaxBytes ? { maxBytes: Math.min(httpReadMaxBytes, PREVIEW_READ_BYTES) } : {}) }, { timeoutMs: 35_000 });
          if (result.kind === "wait") await pause(25);
          else if (result.kind === "head") res.head(result.status, result.headers);
          else if (result.kind === "data") await res.write(Buffer.from(result.data, "base64"));
          else { res.end(); return; }
        }
        throw new Error("preview cancelled");
      } finally { stopped = true; req.signal.removeEventListener("abort", abort); await cancel(streamId); void upload; }
    },
  };
}
