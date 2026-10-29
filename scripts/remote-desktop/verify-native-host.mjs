import {spawn,spawnSync} from "node:child_process";
import {randomUUID,createHash} from "node:crypto";
import assert from "node:assert/strict";
import {DesktopNativeHost} from "../../packages/client-core/dist/desktop/DesktopNativeHost.node.js";
let executable=process.argv[2];if(!executable)throw Error("owned fixture executable required");if(process.platform!=="win32"){const value=spawnSync("/usr/bin/wslpath",["-u",executable],{encoding:"utf8",timeout:3000});assert.equal(value.status,0);executable=value.stdout.trim();}
const preflight=spawnSync(executable,["--preflight"],{encoding:"utf8",timeout:15000});assert.equal(preflight.status,0);assert.equal(preflight.stdout.trim(),"soda-native-copy-preflight-v1");
const bytes=Buffer.alloc(70000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;const gesture=randomUUID(),requests=[],events=[];let finish;const done=new Promise(resolve=>{finish=resolve;});
const trace=[];const started=performance.now();
const host=new DesktopNativeHost({spawn:(...args)=>{const child=spawn(...args);child.stdout.on("data",bytes=>trace.push({at:performance.now()-started,stdout:bytes.toString().replace(/[a-f0-9]{64}/g,"generated")}));child.stderr.on("data",bytes=>trace.push({stderr:bytes.toString()}));child.on("close",(code,signal)=>trace.push({code,signal,at:performance.now()-started}));return child;},origin:"https://generated.test",executable,emit:event=>{
 events.push(event);if(event.type==="need"){requests.push(event);host.receive({type:"bytes",gesture,request:event.request,index:event.index,offset:event.offset,data:bytes.subarray(event.offset,event.offset+event.length).toString("base64")});}if(event.type==="done")finish(event);
}});
try{
 host.receive({type:"arm",gesture});host.receive({type:"start",gesture,offer:{lease:randomUUID(),generation:randomUUID(),entries:[{name:"generated.bin",directory:false,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")} ]}});
 const result=await done;assert.equal(result.ok,true,JSON.stringify({events,requests,trace}));assert.deepEqual(requests.map(({offset,length})=>({offset,length})),[{offset:0,length:65536},{offset:65536,length:4464}]);assert.equal(new Set(requests.map(value=>value.request)).size,1);assert.equal(events.filter(value=>value.type==="done").length,1);
 console.log("native_host_real_csharp_pump_node_70000_bytes_same_request_two_chunks_exit_passed_no_real_ole");
}finally{bytes.fill(0);await host.close();}
