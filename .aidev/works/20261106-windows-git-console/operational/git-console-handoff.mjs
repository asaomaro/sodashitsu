import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {connect} from 'file:///C:/git/sodashitsu/packages/cli/dist/wsClient.js';
const root=join(process.env.LOCALAPPDATA,'sodashitsu'),stage=join(root,'signin-layout-check-20261104'),origin='http://127.0.0.1:7780';
const out=join(stage,'git-console-handoff-92fe7e1d93f94f498e9020698547985b.json');
async function snapshot(){
 const auth=JSON.parse(await readFile(join(root,'local-auth.json'),'utf8'));
 if(auth.pid!==18040)throw Error('Expected retained parent required');
 const response=await fetch(origin+'/api/local-login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({secret:auth.secret}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Local authentication unavailable');const header=response.headers.get('set-cookie');if(!header)throw Error('Local session unavailable');
 const client=await connect(origin,header.split(';')[0]);try{const h=await client.hello();return {paneIds:h.snapshot.panes.map(p=>p.id).sort(),parentPid:auth.pid};}finally{client.close();}
}
await writeFile(out+'.attempted','claimed\n',{flag:'wx',mode:0o600});
const result={before:null,after:null,handoff:null,samePaneIds:false};
try{result.before=await snapshot();}catch{result.beforeUnavailable=true;await writeFile(out,JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});process.exit(1);}
const env={...process.env};delete env.SODA_PANE_ID;delete env.SODA_SESSION;
try{
 result.handoff=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['C:\\git\\sodashitsu\\packages\\server\\dist\\main.js','handoff','--state-dir',root],{cwd:'C:\\git\\sodashitsu',env,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',b=>{stdout=(stdout+b.toString('utf8')).slice(0,8192)});child.stderr.on('data',b=>{stderr=(stderr+b.toString('utf8')).slice(0,8192)});child.on('error',()=>reject(Error('Handoff launcher unavailable')));child.on('close',(code,signal)=>resolve({code,signal,stdout,stderr}));
 });
 for(let i=0;i<10;i++){try{result.after=await snapshot();break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 result.samePaneIds=!!result.before&&!!result.after&&JSON.stringify(result.before.paneIds)===JSON.stringify(result.after.paneIds);
}catch{result.operationError=true;}
await writeFile(out,JSON.stringify(result)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(result));if(result.handoff?.code!==0||!result.after)process.exitCode=1;
