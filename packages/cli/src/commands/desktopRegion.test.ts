import {spawn} from "node:child_process";
import {createServer} from "node:http";
import {once} from "node:events";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {WebSocketServer} from "ws";
import {expect,it,vi} from "vitest";

it("JSON-lines CLI forwards explicit regional verification without full-image fallback",async()=>{
 const root=await mkdtemp(join(tmpdir(),"soda-region-cli-")),requests:any[]=[];
 const server=createServer((_req,res)=>{res.writeHead(204,{"set-cookie":"soda_session=generated; HttpOnly"});res.end();}),wss=new WebSocketServer({server});
 wss.on("connection",socket=>socket.on("message",raw=>{
  const request=JSON.parse(raw.toString());requests.push(request);
  const result=request.method==="desktop.agent.attach"?{leaseId:"l".repeat(43),expiresAt:Date.now()+30000}:request.method==="desktop.agent.observe"?{imageBase64:"AQID",format:"image/png",width:10,height:10,frameSeq:1,observationId:"o".repeat(43),latestFrameMaxAgeMs:2000,verification:{kind:"region",region:request.params.region,pointerOnly:true}}:request.method==="desktop.agent.release"?{released:true}:{};
  socket.send(JSON.stringify({id:request.id,result}));
 }));
 server.listen(0,"127.0.0.1");await once(server,"listening");
 const origin=`http://127.0.0.1:${(server.address() as{port:number}).port}`;
 const child=spawn(process.execPath,[fileURLToPath(new URL("../../dist/main.js",import.meta.url)),"desktop","session","--url",origin,"--token","generated"],{env:{...process.env,HOME:root,USERPROFILE:root,SODA_DESKTOP_GRANT:"t".repeat(43)},stdio:["pipe","pipe","pipe"]});
 let stdout="",stderr="";child.stdout.on("data",data=>stdout+=data);child.stderr.on("data",data=>stderr+=data);const ended=once(child,"close");
 try{
  await vi.waitFor(()=>expect(stdout,stderr).toContain('"ready":true'),{timeout:5000});
  const region={x:2,y:2,width:4,height:4};child.stdin.write(JSON.stringify({id:1,method:"observe",afterFrameSeq:4,region})+"\n");
  await vi.waitFor(()=>expect(requests.some(r=>r.method==="desktop.agent.observe")).toBe(true));
  expect(requests.find(r=>r.method==="desktop.agent.observe").params).toEqual({leaseId:"l".repeat(43),afterFrameSeq:4,region});
  child.stdin.end(JSON.stringify({id:2,method:"release"})+"\n");await ended;
  expect(child.exitCode,stderr).toBe(0);
 }finally{
  child.kill();await ended;for(const socket of wss.clients)socket.terminate();await new Promise<void>(r=>wss.close(()=>r()));await new Promise<void>(r=>server.close(()=>r()));await rm(root,{recursive:true,force:true});
 }
},15000);
