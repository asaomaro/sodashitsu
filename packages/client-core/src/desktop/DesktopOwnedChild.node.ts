import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
/** Fixed program launch only. A child remains owned until actual close, even after timeout. */
export function desktopOwnedChild(command:string,args:readonly string[],input:string,options:{timeout:number;limit:number;spawn?:typeof spawn;signal?:AbortSignal;now?:()=>number}):Promise<string>{
 return new Promise((resolve,reject)=>{
  const now=options.now??(()=>performance.now()),born=now(),until=born+options.timeout;let observed=born;
  if(!Number.isFinite(born)||born<0||!Number.isFinite(options.timeout)||options.timeout<=0){reject(Error("選択取得の期限が不正です"));return;}
  const fence=()=>{const at=now();if(options.signal?.aborted)throw Error("ドラッグの選択取得を中止しました");if(!Number.isFinite(at)||at<observed||at>=until)throw Error("ドラッグの選択取得が時間切れです");observed=at;};
  let child:ChildProcessWithoutNullStreams;try{child=(options.spawn??spawn)(command,[...args],{stdio:["pipe","pipe","pipe"],windowsHide:true,shell:false});}catch(error){reject(error);return;}
  let failed:Error|undefined,output:Buffer[]=[],bytes=0,diagnostics=0,closed=false;
  const fail=(reason:string)=>{if(!failed)failed=Error(reason);child.stdin.destroy();child.kill();};
  const abort=()=>fail("ドラッグの選択取得を中止しました");
  const timer=setTimeout(()=>fail("ドラッグの選択取得が時間切れです"),options.timeout);timer.unref();
  options.signal?.addEventListener("abort",abort,{once:true});
  child.stdout.on("data",(data:Buffer)=>{bytes+=data.length;if(bytes>options.limit)fail("選択情報が上限を超えました");else if(!failed)output.push(Buffer.from(data));});
  child.stderr.on("data",(data:Buffer)=>{diagnostics+=data.length;if(diagnostics>8192)fail("選択取得の診断が上限を超えました");});
  child.on("error",()=>fail("選択取得プログラムを起動できません"));child.stdin.on("error",()=>{if(input.length)fail("選択取得の入力が終了しました");});
  child.on("close",(code,signal)=>{if(closed)return;closed=true;clearTimeout(timer);options.signal?.removeEventListener("abort",abort);try{if(failed)throw failed;fence();if(code!==0||signal)throw Error("選択取得プログラムが終了しました");const decoded=new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(output));fence();resolve(decoded);}catch(error){reject(error);}finally{for(const data of output)data.fill(0);output=[];}});
  if(options.signal?.aborted)abort();else if(input.length)child.stdin.end(input);else child.stdin.end();
 });
}
