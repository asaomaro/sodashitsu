import { RpcError } from "@sodashitsu/protocol";
import { spawn, type ChildProcess } from "node:child_process";
import { realpath } from "node:fs/promises";
import { z } from "zod";

const audioError=(message:string)=>new RpcError("agent_pane_busy",message);
interface Target { threadId:string; projectDir:string; path:string }
interface Options {
  launch?:typeof spawn;
  canonical?:typeof realpath;
  now?:()=>number;
  owned?:Set<ChildProcess>;
}
const OWNED_PROXIES=new Set<ChildProcess>();
/** Uses the existing local Codex daemon only. No thread creation/resume, model override,
 * key discovery, external API, shell command, or replay of an uncertain turn/start.
 * The caller owns the reviewed audio file and proves the dedicated session at each guard.
 */
export async function sendCodexAudio(target:Target,signal:AbortSignal,expires:number,guard:()=>void,options:Options={}):Promise<{turnId:string}> {
  const now=options.now??(()=>performance.now());
  const check=()=>{signal.throwIfAborted();if(now()>=expires)throw Error("音声の送信期限が切れました");};
  const live=()=>{check();guard();check();};
  live();
  const canonical=options.canonical??realpath;
  const project=await canonical(target.projectDir);live();
  const owned=options.owned??OWNED_PROXIES;
  if(owned.size>=2)throw Error("前のCodex音声接続の終了を待ってください");
  const child:ChildProcess=(options.launch??spawn)("codex",["app-server","proxy"],{
    cwd:target.projectDir,shell:false,windowsHide:true,stdio:["pipe","pipe","ignore"],
  });
  owned.add(child);child.once("close",()=>owned.delete(child));
  const pending=new Map<number,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>();
  let next=0,output="",closed=false,failure:Error|null=null;
  const fail=(error:Error)=>{failure=error;for(const item of pending.values())item.reject(error);pending.clear();};
  const aborted=()=>fail(Error("音声の送信を取り消しました"));
  signal.addEventListener("abort",aborted,{once:true});
  const timer=setTimeout(()=>fail(Error("音声の送信期限が切れました")),Math.max(1,Math.min(expires-now(),30000)));
  child.once("error",()=>fail(Error("既存のCodex app-serverに接続できません")));
  child.once("close",()=>{closed=true;fail(Error("Codexとの音声接続が終了しました。送信は再試行しません"));});
  child.stdin?.on("error",()=>fail(Error("Codexへ音声を送信できません")));
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data",(chunk:string)=>{
    if(failure)return;
    output+=chunk;
    if(Buffer.byteLength(output)>1024*1024){fail(Error("Codexの応答が大きすぎます"));return;}
    while(output.includes("\n")) {
      const index=output.indexOf("\n"),line=output.slice(0,index);output=output.slice(index+1);
      if(!line.trim())continue;
      try {
        const record=JSON.parse(line) as {id?:unknown;result?:unknown;error?:unknown};
        if(typeof record.id!=="number")continue;
        const item=pending.get(record.id);if(!item)continue;pending.delete(record.id);
        if(record.error)item.reject(Error("Codexが音声入力を受理しませんでした。対応モデル・CLIを専用端末で確認してください"));
        else item.resolve(record.result);
      } catch {fail(Error("Codexの応答形式を確認できません"));return;}
    }
  });
  const request=(method:string,params:object):Promise<unknown>=>{
    live();if(failure)throw failure;if(closed||!child.stdin)throw Error("Codexへの接続がありません");
    const id=++next;
    return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});child.stdin!.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");});
  };
  try {
    await request("initialize",{clientInfo:{name:"sodashitsu-assistant",version:"0.1.0"},capabilities:{experimentalApi:true}});live();
    child.stdin!.write(JSON.stringify({jsonrpc:"2.0",method:"initialized"})+"\n");
    const loaded=z.object({data:z.array(z.string()).max(10000)}).parse(await request("thread/loaded/list",{}));live();
    if(!loaded.data.includes(target.threadId))throw Error("専用Codexセッションが既存daemonに読み込まれていません");
    const current=z.object({thread:z.object({id:z.string(),cwd:z.string(),status:z.object({type:z.string()})})})
      .parse(await request("thread/read",{threadId:target.threadId,includeTurns:false}));live();
    if(current.thread.id!==target.threadId || current.thread.status.type!=="idle")throw Error("専用Codexセッションが待機中ではありません");
    const actual=await canonical(current.thread.cwd);live();
    if((process.platform==="win32"?actual.toLowerCase():actual)!==(process.platform==="win32"?project.toLowerCase():project))throw Error("Codexの作業先が専用セッションと一致しません");
    // Last ownership/cancel/deadline guard and pipe write share the same continuation.
    const result=z.object({turn:z.object({id:z.string().min(1).max(128)})}).parse(await request("turn/start",{
      threadId:target.threadId,
      input:[{type:"text",text:"添付した音声をモデルの音声入力で読み、聞こえた言葉を文字起こししてください。聞き取れない部分は推測せず示し、結果をこの会話に返してください。"},{type:"localAudio",path:target.path}],
    }));
    return {turnId:result.turn.id};
  } finally {
    clearTimeout(timer);signal.removeEventListener("abort",aborted);
    fail(Error("音声接続を閉じました"));child.stdin?.end();
    // Kill only this short-lived proxy, never the shared daemon or the agent terminal.
    if(!closed)await new Promise<void>(resolve=>{
      const finish=()=>{clearTimeout(force);clearTimeout(hard);clearTimeout(limit);resolve();};
      child.once("close",finish);
      const force=setTimeout(()=>{try{child.kill();}catch{/* Keep the physical quota until close. */}},250);
      const hard=setTimeout(()=>{try{child.kill("SIGKILL");}catch{/* Unconfirmed exit is reported below. */}},750);
      const limit=setTimeout(()=>{child.off("close",finish);resolve();},1250);
    });
    // Keep the child in the ownership/quota set until its actual close event, even if
    // the OS cannot confirm termination. Never report successful delivery in that case.
    if(!closed)throw Error("音声proxyの終了を確認できません。再送せず専用端末で確認してください");
  }
}
