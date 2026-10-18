import { request } from "node:http";
import { expect, it } from "vitest";
import { LocalPreviewProbe } from "./LocalPreviewProbe.js";
import { PreviewStreams } from "./PreviewStreams.js";
function get(url: string, host = new URL(url).host) {
  return new Promise<{status:number; body:string; csp:string}>((resolve,reject) => {
    const req = request({hostname:"127.0.0.1",port:new URL(url).port,path:"/probe",headers:{host}}, res => {
      let body="";res.on("data",b=>body+=String(b));res.on("end",()=>resolve({status:res.statusCode!,body,csp:String(res.headers["content-security-policy"])}));
    }); req.on("error",reject);req.end();
  });
}
it("only discloses proof to the exact random loopback Host, with a fixed parent CSP, then closes the listener", async () => {
  const probe = await LocalPreviewProbe.listen("https://soda.example.test"), descriptor = probe.descriptor();
  try {
    expect(JSON.stringify(descriptor)).not.toContain("secret");
    for(const host of ["127.0.0.1", "localhost", "wrong.localhost"].map(h=>`${h}:${new URL(descriptor.url).port}`)) {
      const denied = await get(descriptor.url, host);
      expect(denied.status).toBe(403);expect(denied.body).toBe("");
    }
    const page = await get(descriptor.url);
    expect(page.status).toBe(200);expect(page.csp).toContain("frame-ancestors https://soda.example.test;");
    const secret = JSON.parse(page.body.match(/parent.postMessage\((\{.*?\}),/)![1]!).secret;
    expect(probe.matches(secret)).toBe(true);expect(probe.matches("a".repeat(43))).toBe(false);
  } finally { await probe.close(); }
  await expect(get(descriptor.url)).rejects.toThrow();
});
it("cannot disclose the proof through an authorized application's preview upstream transport", async () => {
  const probe=await LocalPreviewProbe.listen("https://soda.example.test"), d=probe.descriptor();
  const app={id:crypto.randomUUID(),generation:crypto.randomUUID(),paneId:crypto.randomUUID(),workspaceId:crypto.randomUUID(),name:"probe-bypass",state:"registered" as const,port:Number(new URL(d.url).port)};
  const streams=new PreviewStreams(()=>({app,origin:d.origin}),async()=>{});
  try {
    const {streamId}=await streams.begin("attacker",{requestId:crypto.randomUUID(),method:"GET",path:"/probe",headers:{host:new URL(d.url).host}});
    await streams.write("attacker",{streamId,data:"",end:true});
    let head=await streams.read("attacker",streamId);
    while(head.kind==="wait") { await new Promise(r=>setImmediate(r)); head=await streams.read("attacker",streamId); }
    expect(head).toMatchObject({kind:"head",status:403});
    expect(await streams.read("attacker",streamId)).toEqual({kind:"end"});
  } finally { streams.dispose();await probe.close(); }
});
