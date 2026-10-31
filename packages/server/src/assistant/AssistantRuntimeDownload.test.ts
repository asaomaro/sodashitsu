import {mkdtemp,readFile,rm} from "node:fs/promises";
import {existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {createServer,request as httpsRequest,type RequestOptions} from "node:https";
import type {Socket} from "node:net";
import type {IncomingMessage} from "node:http";
import {expect,it,vi} from "vitest";
import {downloadAssistantRuntime,openRuntimeResponse,type RuntimeArchiveSpec,type RuntimeTransport,type RuntimeResponse} from "./AssistantRuntimeDownload.js";
const data=Buffer.from("generated runtime download data; never executed");
const spec:RuntimeArchiveSpec={version:"45.1.0",platform:"linux",arch:"x64",archive:"electron-v45.1.0-linux-x64.zip",bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")};
function response(chunks:Uint8Array[]=[data]):RuntimeResponse{return{status:200,headers:{"content-length":String(spec.bytes)},body:(async function*(){yield*chunks;})(),retire:vi.fn(async()=>{})};}
async function fixture(run:(path:string)=>Promise<void>){const root=await mkdtemp(join(tmpdir(),"soda-runtime-download-"));try{await run(join(root,"archive.zip"));}finally{await rm(root,{recursive:true,force:true});}}
it("writes a fixed archive through an exclusive file and retires its source",()=>fixture(async path=>{
 const source=response([data.subarray(0,10),data.subarray(10)]),transport=vi.fn<RuntimeTransport>(async()=>source);
 await downloadAssistantRuntime(spec,path,{expires:performance.now()+10000,transport});expect(await readFile(path)).toEqual(data);expect(source.retire).toHaveBeenCalledOnce();
 expect(transport.mock.calls[0]?.[0].href).toBe("https://github.com/electron/electron/releases/download/v45.1.0/"+spec.archive);
}));
it.each(["http://127.0.0.1/private","https://example.com/archive","https://github.com:444/archive","https://user:secret@github.com/archive"])("rejects a redirect before contacting %s",location=>fixture(async path=>{
 const source={...response(),status:302,headers:{location}},transport=vi.fn(async()=>source);
 await expect(downloadAssistantRuntime(spec,path,{expires:performance.now()+10000,transport})).rejects.toThrow(/destination/);expect(transport).toHaveBeenCalledOnce();expect(source.retire).toHaveBeenCalledOnce();expect(existsSync(path)).toBe(false);
}));
it("retires one redirect before opening the next allowed source",()=>fixture(async path=>{
 const first={...response(),status:302,headers:{location:"https://release-assets.githubusercontent.com/generated"}},last=response();let retired=false;
 first.retire=vi.fn(async()=>{retired=true;});const transport=vi.fn(async()=>{if(transport.mock.calls.length===1)return first;expect(retired).toBe(true);return last;});
 await downloadAssistantRuntime(spec,path,{expires:performance.now()+10000,transport});expect(transport).toHaveBeenCalledTimes(2);expect(last.retire).toHaveBeenCalledOnce();
}));
it.each(["oversized","truncated","digest","encoding","length"] as const)("rejects %s data and retires the source",mode=>fixture(async path=>{
 const source=response(mode==="oversized"?[Buffer.concat([data,Buffer.from("extra")])]:mode==="truncated"?[data.subarray(0,10)]:mode==="digest"?[Buffer.alloc(data.length)]:[data]);
 if(mode==="encoding")source.headers["content-encoding"]="gzip";if(mode==="length")source.headers["content-length"]="1";
 await expect(downloadAssistantRuntime(spec,path,{expires:performance.now()+10000,transport:async()=>source})).rejects.toThrow();expect(source.retire).toHaveBeenCalledOnce();
}));
it("rechecks cancellation after physical response retirement",()=>fixture(async path=>{
 const source=response(),controller=new AbortController();let release!:()=>void,retiring=false,settled=false;
 source.retire=()=>new Promise<void>(resolve=>{retiring=true;release=resolve;});
 const pending=downloadAssistantRuntime(spec,path,{expires:performance.now()+10000,signal:controller.signal,transport:async()=>source});
 const completion=pending.then(()=>{settled=true;return true;},()=>{settled=true;return false;});
 try{await vi.waitFor(()=>expect(retiring).toBe(true));controller.abort();expect(settled).toBe(false);release();expect(await completion).toBe(false);}
 finally{release?.();await completion;}
}));
it("does not extend the original deadline while a source is retiring",()=>fixture(async path=>{
 let now=0;const source=response();source.retire=async()=>{now=10001;};
 await expect(downloadAssistantRuntime(spec,path,{expires:10000,now:()=>now,transport:async()=>source})).rejects.toThrow(/deadline/);
}));
it("refuses loss of authority after transport initialization before creating a file",()=>fixture(async path=>{
 let permitted=true;const source=response();const transport=async()=>{permitted=false;return source;};
 await expect(downloadAssistantRuntime(spec,path,{expires:performance.now()+10000,transport,check:()=>{if(!permitted)throw Error("generated scope revoked");}})).rejects.toThrow(/revoked/);
 expect(existsSync(path)).toBe(false);expect(source.retire).toHaveBeenCalledOnce();
}));
it.each(["before headers","during body"])("actual owned HTTPS cancellation %s waits for the private client socket close",phase=>fixture(async path=>{
 const cert=await readFile(new URL("../../../tui/src/testing/tls/cert.pem",import.meta.url)),key=await readFile(new URL("../../../tui/src/testing/tls/key.pem",import.meta.url));
 let received=false;const server=createServer({cert,key},(_request,res)=>{received=true;if(phase==="during body"){res.writeHead(200,{"content-length":spec.bytes});res.write(data.subarray(0,10));}});
 await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>resolve());});
 const address=server.address();if(!address||typeof address==="string")throw Error("Private HTTPS listener unavailable");
 const clients:Socket[]=[],closed=new Set<Socket>();
 const request=((url:URL,options:RequestOptions,callback:(incoming:IncomingMessage)=>void)=>{
  const req=httpsRequest(url,{...options,ca:cert},callback);
  req.once("socket",socket=>{clients.push(socket);socket.once("close",()=>closed.add(socket));});return req;
 }) as unknown as typeof httpsRequest;
 const transport:RuntimeTransport=(_url,signal)=>openRuntimeResponse(new URL(`https://127.0.0.1:${address.port}/generated`),signal,request);
 const controller=new AbortController();const pending=downloadAssistantRuntime(spec,path,{expires:performance.now()+10000,signal:controller.signal,transport});let failure:unknown;const completion=pending.catch(error=>{failure=error;});
 try{await vi.waitFor(()=>{if(failure)throw failure;expect(received).toBe(true);expect(existsSync(path)).toBe(phase==="during body");});controller.abort();await completion;expect(failure).toBeInstanceOf(Error);expect(clients).toHaveLength(1);expect(closed.size).toBe(1);}
 finally{controller.abort();await completion;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}));
