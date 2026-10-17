import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { SodaClient } from "../wsClient.js";
import { rpcPreviewTransport } from "./RpcPreviewTransport.js";

it("bounds empty WebSocket messages while upstream RPC writes are stalled", async () => {
  const controller = new AbortController();
  let finishRead!: (value: { kind: "end" }) => void;
  const request = vi.fn(async (method: string) => {
    if (method === "preview.ws.begin") return { streamId: "stream", protocol: "" };
    if (method === "preview.ws.read") return new Promise((resolve) => { finishRead = resolve; });
    if (method === "preview.ws.write") return new Promise(() => undefined);
    return {};
  });
  const transport = rpcPreviewTransport({ request } as unknown as Pick<SodaClient, "request">, "request");
  const prepared = await transport.prepareWebsocket!({ path: "/", headers: {}, protocols: [], signal: controller.signal });
  const socket = Object.assign(new EventEmitter(), { OPEN: 1, readyState: 1, pause: vi.fn(), resume: vi.fn(), close: vi.fn(), send: vi.fn() });
  const running = prepared.attach(socket as unknown as WebSocket);
  for (let i = 0; i < 300; i++) socket.emit("message", Buffer.alloc(0), false);
  expect(socket.pause).toHaveBeenCalled();
  expect(socket.close).toHaveBeenCalledWith(1009, "preview message limit");
  controller.abort(); finishRead({ kind: "end" }); await running;
});
