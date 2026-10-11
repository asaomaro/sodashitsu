import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, it, expect } from "vitest";
import { forkCopilotSession } from "./copilotFork.js";
const source = "3e81f9a7-a757-461a-b21c-196db1d9196e";
const fresh = "83bdf6b3-e111-42e3-adea-10e1b241cc91";
async function cli(mode: string, run: (file:string,dir:string)=>Promise<void>): Promise<void> {
 const dir=await mkdtemp(join(tmpdir(),"copilot-fork-test-"));const file=join(dir,"copilot");
 await writeFile(file,`#!${process.execPath}\nconst mode=${JSON.stringify(mode)},source=${JSON.stringify(source)},fresh=${JSON.stringify(fresh)};
 let b=Buffer.alloc(0);process.stdin.on('data',chunk=>{b=Buffer.concat([b,chunk]);for(;;){const end=b.indexOf('\\r\\n\\r\\n');if(end<0)return;const n=Number(/Content-Length: (\\d+)/.exec(b.subarray(0,end).toString())[1]);if(b.length<end+4+n)return;const m=JSON.parse(b.subarray(end+4,end+4+n).toString());b=b.subarray(end+4+n);
 if(mode==='wait')continue;
 const result=m.id===2?{sessionId:mode==='same'?source:fresh}:{sessionId:fresh};
 const invalid=m.method==='sessions.fork'&&m.params.sessionId!==source||m.method==='session.resume'&&(m.params.sessionId!==fresh||m.params.workingDirectory!==process.cwd());
 const error=mode==='old'||invalid?{code:-32601}:undefined;
 const body=JSON.stringify({jsonrpc:'2.0',id:m.id,result,error});const frame='Content-Length: '+Buffer.byteLength(body)+'\\r\\n\\r\\n'+body;
 // フレーム分割・複数応答を同じ reader で扱う。
 process.stdout.write(frame.slice(0,9));process.stdout.write(frame.slice(9));
 }});`);
 await chmod(file,0o755);try{await run(file,dir);}finally{await rm(dir,{recursive:true,force:true});}
}
describe("Copilot sessions.fork transport",()=>{
 it("元のIDを分岐し、新IDだけに作業フォルダを設定して返す",async()=>{
  await cli("ok",async(file,dir)=>{await expect(forkCopilotSession(source,dir,new AbortController().signal,file)).resolves.toBe(fresh);});
 });
 it.each(["old","same"])("%s: API非対応や元のIDを返す版は起動させない",async(mode)=>{
  await cli(mode,async(file,dir)=>{await expect(forkCopilotSession(source,dir,new AbortController().signal,file)).rejects.toMatchObject({code:"fork_failed"});});
 });
 it("応答待ちでキャンセルすると子プロセスを停止する",async()=>{
  await cli("wait",async(file,dir)=>{const c=new AbortController();const promise=forkCopilotSession(source,dir,c.signal,file);setTimeout(()=>c.abort(),30);await expect(promise).rejects.toMatchObject({code:"fork_failed"});});
 });
});
