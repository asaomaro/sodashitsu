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

it("binds a short-lived, single-use local proof to its controller, machine and viewer", async () => {
  const {request}=await import("node:http");
  const viewer=crypto.randomUUID(), rpc=client();
  rpc.request=vi.fn(async()=>({viewers:[{id:viewer,origin:"https://soda.example.test"}]})) as unknown as PreviewRpc["request"];
  const helpers=new ManagedPreviewHelpers(async()=>rpc);
  try {
    const probe=await helpers.probe("browser","B",viewer);
    expect(rpc.request).not.toHaveBeenCalledWith("preview.helper",expect.anything());
    const page=await new Promise<string>((resolve,reject)=>{
      const req=request({hostname:"127.0.0.1",port:new URL(probe.url).port,path:"/probe",headers:{host:new URL(probe.url).host}},res=>{let body="";res.on("data",b=>body+=String(b));res.on("end",()=>resolve(body));});req.on("error",reject);req.end();
    });
    const proof=JSON.parse(page.match(/parent.postMessage\((\{.*?\}),/)![1]!) as {id:string;secret:string};
    for (const [owner,machine,id] of [["other","B",viewer],["browser","C",viewer],["browser","B",crypto.randomUUID()]])
      expect(await helpers.consumeProbe(owner!,machine!,id!,proof)).toBe(false);
    expect(await helpers.consumeProbe("browser","B",viewer,{...proof,secret:"x".repeat(43)})).toBe(false);
    expect(await helpers.consumeProbe("browser","B",viewer,{...proof,id:crypto.randomUUID()})).toBe(false);
    const consumed=await Promise.all([helpers.consumeProbe("browser","B",viewer,proof),helpers.consumeProbe("browser","B",viewer,proof)]);
    expect(consumed).toEqual([true,false]);
    expect(await helpers.consumeProbe("browser","B",viewer,proof)).toBe(false);
    const second=await helpers.probe("browser","B",viewer);
    await helpers.stop("other",viewer);
    expect(await helpers.probe("browser","B",viewer)).toEqual(second);
    helpers.clientGone("browser");
    expect(await helpers.consumeProbe("browser","B",viewer,proof)).toBe(false);
  } finally {await helpers.dispose();}
});
it("cancels pending probes on browser exit and enforces per-owner quotas before connecting", async()=>{
  const rpc=client();let finish!:(c:typeof rpc)=>void;
  const helpers=new ManagedPreviewHelpers(()=>new Promise(resolve=>{finish=resolve;}));
  const pending=helpers.probe("browser","B",crypto.randomUUID());
  const rejected=expect(pending).rejects.toThrow("cancelled");
  helpers.clientGone("browser");finish(rpc);await rejected;await helpers.dispose();
  expect(rpc.close).toHaveBeenCalled();expect(rpc.request).not.toHaveBeenCalled();
  const viewer=crypto.randomUUID();rpc.request=vi.fn(async()=>({viewers:[{id:viewer,origin:"https://soda.example.test"}]})) as unknown as PreviewRpc["request"];
  const bounded=new ManagedPreviewHelpers(async()=>rpc);
  try {
    await bounded.probe("browser","B",viewer);
    const another=crypto.randomUUID();
    rpc.request=vi.fn(async()=>({viewers:[{id:another,origin:"https://soda.example.test"}]})) as unknown as PreviewRpc["request"];
    await bounded.probe("browser","B",another);
    await expect(bounded.probe("browser","B",crypto.randomUUID())).rejects.toThrow("limit");
  } finally {await bounded.dispose();}
});
it("an obsolete pending probe cannot close its replacement after stop/retry",async()=>{
  const viewer=crypto.randomUUID(),rpc=client();
  rpc.request=vi.fn(async()=>({viewers:[{id:viewer,origin:"https://soda.example.test"}]})) as unknown as PreviewRpc["request"];
  let finish!:(c:typeof rpc)=>void,attempts=0;
  const helpers=new ManagedPreviewHelpers(async()=>++attempts===1?new Promise(resolve=>{finish=resolve;}):rpc);
  try {
    const old=helpers.probe("browser","B",viewer),rejected=expect(old).rejects.toThrow("cancelled");
    await helpers.stop("browser",viewer);
    const current=await helpers.probe("browser","B",viewer);
    finish(client());await rejected;
    expect(await helpers.probe("browser","B",viewer)).toEqual(current);
    expect(attempts).toBe(2);
  } finally {await helpers.dispose();}
});
it("reserves a proof-authorized helper before asynchronous probe cleanup, so cancellation wins",async()=>{
  const {LocalPreviewProbe}=await import("./LocalPreviewProbe.js"),{request}=await import("node:http");
  const viewer=crypto.randomUUID(),rpc=client(),base=rpc.request;
  rpc.request=vi.fn(async(method:string,params:unknown)=>method==="preview.viewers"?{viewers:[{id:viewer,origin:"https://soda.example.test"}]}:base(method as never,params as never)) as unknown as PreviewRpc["request"];
  const helpers=new ManagedPreviewHelpers(async()=>rpc),probe=await helpers.probe("browser","B",viewer);
  const page=await new Promise<string>((resolve,reject)=>{const req=request({hostname:"127.0.0.1",port:new URL(probe.url).port,path:"/probe",headers:{host:new URL(probe.url).host}},res=>{let body="";res.on("data",b=>body+=String(b));res.on("end",()=>resolve(body));});req.on("error",reject);req.end();});
  const proof=JSON.parse(page.match(/parent.postMessage\((\{.*?\}),/)![1]!) as {id:string;secret:string};
  const original=LocalPreviewProbe.prototype.close;
  let release!:()=>void;
  const hold=new Promise<void>(resolve=>{release=resolve;});
  const closing=vi.spyOn(LocalPreviewProbe.prototype,"close").mockImplementation(async function(this:typeof LocalPreviewProbe.prototype){await hold;await original.call(this);});
  try {
    const now=vi.spyOn(Date,"now").mockReturnValue(Date.now()+30_001);
    expect(helpers.consumeProbe("browser","B",viewer,proof)).toBe(false);now.mockRestore();
    const pending=helpers.startWithProof("browser","B",viewer,proof),rejected=expect(pending).rejects.toThrow("cancelled");
    await helpers.stop("browser",viewer);await rejected;
    expect(rpc.request).not.toHaveBeenCalledWith("preview.helper",expect.anything());
    release();await helpers.dispose();
  } finally {release();closing.mockRestore();await helpers.dispose();}
});
it("counts cancelled but still connecting probes toward the resource limit",async()=>{
  const finishes:((c:ReturnType<typeof client>)=>void)[]=[],helpers=new ManagedPreviewHelpers(()=>new Promise(resolve=>finishes.push(resolve)));
  const first=helpers.probe("browser","B",crypto.randomUUID()),second=helpers.probe("browser","B",crypto.randomUUID());
  const rejections=[expect(first).rejects.toThrow("cancelled"),expect(second).rejects.toThrow("cancelled")];
  helpers.clientGone("browser");
  await expect(helpers.probe("browser","B",crypto.randomUUID())).rejects.toThrow("limit");
  for(const finish of finishes)finish(client());
  await Promise.all(rejections);await helpers.dispose();
});
