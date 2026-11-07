import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { openCodexControl, type CodexChannelTarget, type CodexControlChannel } from "../agent/CodexControlSocket.js";

export const AUDIO_INSTRUCTION="添付した音声をモデルの音声入力で読み、聞こえた言葉を文字起こししてください。聞き取れない部分は推測せず示し、結果をこの会話に返してください。";
const METHODS=["initialize","thread/loaded/list","thread/read","turn/start"] as const;
type Channel=CodexControlChannel<typeof METHODS[number]>;
interface Target { threadId:string; projectDir:string; path:string; instruction?:string }
interface Options {
  open?:(target:CodexChannelTarget,allowed:typeof METHODS)=>Promise<Channel>;
  canonical?:(path:string)=>Promise<string>;
  now?:()=>number;
  owned?:Set<Promise<void>>;
}
const OWNED_AUDIO_SOCKETS=new Set<Promise<void>>();
/** Existing owned daemon only, using its formal Unix WebSocket framing. No CLI,
 * model/thread creation/resume, overrides, or retry of an uncertain turn/start. */
export async function sendCodexAudio(target:Target,signal:AbortSignal,expires:number,guard:()=>void,options:Options={}):Promise<{turnId:string}> {
  const now=options.now??(()=>performance.now());
  const check=()=>{if(signal.aborted)throw Error("音声の送信を取り消しました");if(now()>=expires)throw Error("音声の送信期限が切れました");};
  const live=()=>{check();guard();check();};live();
  if(process.platform!=="linux"&&!options.open)throw Error("このOSのCodex音声transportは未対応です。共通の文字起こし経路を利用してください");
  const canonical=options.canonical??realpath,project=await canonical(target.projectDir);live();
  const owned=options.owned??OWNED_AUDIO_SOCKETS;
  if(owned.size>=2)throw Error("前のCodex音声接続の終了を待ってください");
  let channel:Channel|undefined;
  try {
    channel=await(options.open??openCodexControl)({home:process.env.CODEX_HOME??join(homedir(),".codex"),key:"audio:"+target.threadId,signal,expires:performance.now()+Math.min(30000,expires-now()),check:live,requestMs:30000,maxRequests:4,owned},METHODS);live();
    await channel.request("initialize",{clientInfo:{name:"sodashitsu-assistant",version:"0.1.0"},capabilities:{experimentalApi:true}});live();channel.initialized();
    const loaded=z.object({data:z.array(z.string()).max(10000)}).parse(await channel.request("thread/loaded/list",{}));live();
    if(!loaded.data.includes(target.threadId))throw Error("専用Codexセッションが既存daemonに読み込まれていません");
    const current=z.object({thread:z.object({id:z.string(),cwd:z.string(),status:z.object({type:z.string()})})})
      .parse(await channel.request("thread/read",{threadId:target.threadId,includeTurns:false}));live();
    if(current.thread.id!==target.threadId||current.thread.status.type!=="idle")throw Error("専用Codexセッションが待機中ではありません");
    const actual=await canonical(current.thread.cwd);live();
    if(actual!==project)throw Error("Codexの作業先が専用セッションと一致しません");
    if(!await channel.unchanged())throw Error("Codex daemonの所有・世代を確認できません");live();
    // Last ownership/cancel/deadline guard and the sole WebSocket write are synchronous.
    const result=z.object({turn:z.object({id:z.string().min(1).max(128)})}).parse(await channel.request("turn/start",{
      threadId:target.threadId,input:[{type:"text",text:target.instruction??AUDIO_INSTRUCTION},{type:"localAudio",path:target.path}],
    }));
    return {turnId:result.turn.id};
  } catch(error) {
    if(signal.aborted)throw Error("音声の送信を取り消しました。送信済みか不明な場合は再送しません");
    if(now()>=expires)throw Error("音声の送信期限が切れました。送信済みか不明な場合は再送しません");
    throw error;
  } finally {
    if(channel&&!await channel.close())throw Error("音声socketの終了を確認できません。再送せず専用端末で確認してください");
  }
}
