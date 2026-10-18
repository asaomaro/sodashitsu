import { expect, it, vi } from "vitest";
import { ManagedPreviewHelpers } from "./ManagedPreviewHelpers.js";
import type { PreviewRpc } from "@sodashitsu/client-core/preview/RpcPreviewTransport";
function client() {
  return { close: vi.fn(), request: vi.fn(async (method: string) => method === "preview.helper" ? {origin:"http://localhost:7780",paneId:crypto.randomUUID(),viewerId:crypto.randomUUID()} : {jobs:[],active:[]}) as unknown as PreviewRpc["request"] };
}
it("starts on the controller using the selected machine and deduplicates concurrent starts", async () => {
  const rpc = client(), connect = vi.fn(async (_machine: string, _gone: () => void) => rpc), helpers = new ManagedPreviewHelpers(connect);
  try {
    await Promise.all([helpers.start("browser", "B", "viewer"), helpers.start("browser", "B", "viewer")]);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect.mock.calls[0]![0]).toBe("B");
    expect(rpc.request).toHaveBeenCalledWith("preview.helper", {viewerId:"viewer"});
    await helpers.stop("someone-else", "viewer"); expect(rpc.close).not.toHaveBeenCalled();
    await helpers.stop("browser", "viewer"); expect(rpc.close).toHaveBeenCalled();
  } finally { await helpers.dispose(); }
});
it("closes a client that finishes connecting after its browser has left", async () => {
  const rpc = client(); let finish!: (c: typeof rpc) => void;
  const helpers = new ManagedPreviewHelpers(() => new Promise(resolve => { finish = resolve; }));
  const starting = helpers.start("browser", "B", "viewer");
  const rejection = expect(starting).rejects.toThrow("cancelled");
  helpers.clientGone("browser"); finish(rpc);
  await rejection; await helpers.dispose();
  expect(rpc.close).toHaveBeenCalled(); expect(rpc.request).not.toHaveBeenCalled();
});
it("cleans up failed attachments, allows retry, and bounds helpers per browser", async () => {
  let fail = true;
  const helpers = new ManagedPreviewHelpers(async () => {
    if (fail) throw new Error("offline"); return client();
  });
  await expect(helpers.start("browser", "B", "viewer")).rejects.toThrow("offline");
  fail = false;
  try {
    for (let i=0;i<8;i++) await helpers.start("browser","B",String(i));
    await expect(helpers.start("browser","B","extra")).rejects.toThrow("limit");
  } finally { await helpers.dispose(); }
});

it("deduplicates repeated jobs across batches and closes the actual listener on stop", async () => {
  const { LoopbackGateway } = await import("@sodashitsu/client-core/preview/LoopbackGateway");
  const opened: Awaited<ReturnType<typeof LoopbackGateway.listen>>[] = [], original = LoopbackGateway.listen.bind(LoopbackGateway);
  const listen = vi.spyOn(LoopbackGateway, "listen").mockImplementation(async (...args) => {
    const gateway = await original(...args); opened.push(gateway); return gateway;
  });
  const close = vi.spyOn(LoopbackGateway.prototype,"close");
  const requestId = crypto.randomUUID(); let polls = 0;
  const rpc = { close:vi.fn(), request:vi.fn(async (method:string) => {
    if (method === "preview.helper") return {origin:"http://localhost:7780"};
    if (method === "preview.work") { polls++; return {active:[requestId],jobs:[{requestId},{requestId}]}; }
    return {};
  }) as unknown as PreviewRpc["request"] };
  const helpers = new ManagedPreviewHelpers(async () => rpc);
  try {
    await helpers.start("browser","B","viewer");
    await vi.waitFor(()=>expect(polls).toBeGreaterThanOrEqual(2));
    expect(listen).toHaveBeenCalledTimes(1);
    await helpers.stop("browser","viewer");
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    await helpers.dispose();
    // Also recover listeners if the regression is intentionally reintroduced.
    await Promise.all(opened.map(g=>g.close()));
    listen.mockRestore(); close.mockRestore();
  }
});
