import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join, win32 } from "node:path";
import { tmpdir } from "node:os";
import type { Speak } from "./voice.js";
const LIMIT=12*1024*1024;
export function voicevoxOrigin(value:string):string {
 const url=new URL(value);
 if(url.protocol!=="http:"||!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw Error("このPCのVOICEVOX接続先を指定してください。");
 return url.origin;
}
async function bytes(response:Response,limit:number):Promise<Uint8Array>{
 if(!response.ok||!response.body)throw Error("VOICEVOXに接続できません。COREと話者の設定を確認してください。");
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error("音声データが大きすぎます。");chunks.push(value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const output=new Uint8Array(size);let at=0;for(const chunk of chunks){output.set(chunk,at);at+=chunk.length;}return output;
}
export async function voicevoxSpeakers(origin:string,signal?:AbortSignal):Promise<{id:number;label:string}[]>{
 const res=await fetch(voicevoxOrigin(origin)+"/speakers",{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000),redirect:"error"});
 const rows:unknown=JSON.parse(new TextDecoder().decode(await bytes(res,1024*1024)));
 return parseVoicevoxSpeakers(rows);
}
export function parseVoicevoxSpeakers(rows:unknown):{id:number;label:string}[]{
 if(!Array.isArray(rows)||rows.length>512)throw Error("話者一覧を確認してください。");
 const result:{id:number;label:string}[]=[];
 for(const row of rows){if(typeof row.name!=="string"||!Array.isArray(row.styles))continue;for(const s of row.styles){if(Number.isSafeInteger(s.id)&&s.id>=0&&s.id<=2147483647&&typeof s.name==="string"&&(!s.type||s.type==="talk"||s.type==="streaming_talk"))result.push({id:s.id,label:`${row.name.slice(0,80)}（${s.name.slice(0,80)}）`});}}
 return result.slice(0,2048);
}
export async function synthesizeVoicevox(origin:string,style:number,text:string,signal:AbortSignal):Promise<Uint8Array>{
 if(!Number.isSafeInteger(style)||style<0||style>2147483647)throw Error("音声の話者を選んでください。");
 const base=voicevoxOrigin(origin),combined=AbortSignal.any([signal,AbortSignal.timeout(120000)]);
 const query=await bytes(await fetch(`${base}/audio_query?${new URLSearchParams({text,speaker:String(style)})}`,{method:"POST",signal:combined,redirect:"error"}),1024*1024);
 const wav=await bytes(await fetch(`${base}/synthesis?speaker=${style}`,{method:"POST",headers:{"Content-Type":"application/json"},body:Buffer.from(query),signal:combined,redirect:"error"}),LIMIT);
 if(wav.length<44||Buffer.from(wav.subarray(0,4)).toString()!=="RIFF"||Buffer.from(wav.subarray(8,12)).toString()!=="WAVE")throw Error("VOICEVOXからWAVを受信できませんでした。");
 return wav;
}
export const playWavScript=String.raw`$ErrorActionPreference='Stop'
$data=ConvertFrom-Json ([Console]::In.ReadToEnd())
$stream=[System.IO.MemoryStream]::new([Convert]::FromBase64String([string]$data.wav))
$player=[System.Media.SoundPlayer]::new($stream)
try {$player.Load();$player.PlaySync()} finally {$player.Dispose();$stream.Dispose()}`;
export async function playWav(wav:Uint8Array,signal:AbortSignal,platform=process.platform,run:typeof execFile=execFile):Promise<void>{
 signal.throwIfAborted();let directory:string|undefined;
 try{
  let command:string,args:string[],input:Uint8Array|string|undefined;
  if(platform==="win32"){
   command=win32.join(process.env.SystemRoot||"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
   args=["-NoLogo","-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(playWavScript,"utf16le").toString("base64")];input=JSON.stringify({wav:Buffer.from(wav).toString("base64")});
  }else if(platform==="darwin"){
   directory=await mkdtemp(join(tmpdir(),"soda-voice-"));const file=join(directory,"voice.wav");await writeFile(file,wav,{mode:0o600});command="/usr/bin/afplay";args=[file];
  }else{command="aplay";args=["-q"];input=wav;}
  signal.throwIfAborted();
  await new Promise<void>((resolve,reject)=>{
   const child=run(command,args,{signal,windowsHide:true,timeout:130000,maxBuffer:2048},error=>{
    const done=()=>error?reject(Error("音声を再生できません。出力先を確認してください。")):resolve();
    if(signal.aborted&&child.exitCode===null&&child.signalCode===null)child.once("close",done);else done();
   });child.stdin?.on("error",()=>{});child.stdin?.end(input);
  });
 }finally{if(directory)await rm(directory,{recursive:true,force:true});}
}
export function voicevoxSpeak(settings:(signal:AbortSignal)=>{voicevoxOrigin:string;voicevoxStyleId:number}|Promise<{voicevoxOrigin:string;voicevoxStyleId:number}>,play:typeof playWav=playWav):Speak {
 return async(text,signal)=>{signal.throwIfAborted();const prefs=await settings(signal);signal.throwIfAborted();const wav=await synthesizeVoicevox(prefs.voicevoxOrigin,prefs.voicevoxStyleId,text,signal);signal.throwIfAborted();await play(wav,signal);};
}

/** Use installed speaker metadata; IDs may differ between CORE/model versions. */
export function characterVoice(rows:readonly {id:number;label:string}[],name:string,current:number):{id:number;label:string}|null {
 const normalize=(value:string)=>value.normalize("NFKC").replace(/[\s・]/g,"").toLocaleLowerCase();
 const wanted=normalize(name),matches=rows.filter(row=>normalize(row.label.split("（")[0]!)===wanted);
 return matches.find(row=>row.id===current)??matches.find(row=>row.label.endsWith("（ノーマル）"))??matches[0]??null;
}
