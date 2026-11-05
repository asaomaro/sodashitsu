// The fixed task calls this as a normal interactive user. The isolated test
// invokes the same function with a fixed private state/port, never arbitrary paths.
import {writeFile,readFile,open} from 'node:fs/promises';import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';
export async function recoverUserServer(test=false){
 const state=join(process.env.LOCALAPPDATA,'sodashitsu',...(test?['interactive-recovery-test-20261106']:[]));
 const receipt=async(data)=>writeFile(join(process.env.LOCALAPPDATA,'sodashitsu',test?'user-recovery-test-status.json':'user-recovery-status.json'),JSON.stringify({at:new Date().toISOString(),launcherPid:process.pid,...data})+'\n',{mode:0o600});
 let spawnedPid;
 try{
  const session=Number(process.env.SODA_RECOVERY_SESSION_ID);if(!Number.isSafeInteger(session)||session<=0)throw Error('Interactive parent required');
  const env={...process.env};delete env.SODA_SESSION;delete env.SODA_PANE_ID;delete env.SODA_RECOVERY_SESSION_ID;if(test)env.SODA_ASSISTANT_ENABLED='0';
  await receipt({status:'starting'});const {findOrStart}=await import('file:///C:/git/sodashitsu/packages/server/dist/launch/findOrStart.js');
  await findOrStart({serve:{stateDir:state,session:'default',...(test?{host:'127.0.0.1',port:'17883'}:{})},allowNested:false,env,cwd:'C:\\git\\sodashitsu',platform:'win32',execPath:process.execPath,execArgv:[],mainPath:'C:\\git\\sodashitsu\\packages\\server\\dist\\main.js'},{timeoutMs:45000,maxStartAttempts:1,spawnServe:async req=>{
   const out=await open(req.outPath,'a',0o600);let child;
   try{child=spawn(req.execPath,[...req.args,...(test?['--host','127.0.0.1','--port','17883']:[])],{cwd:req.cwd,env:req.env,windowsHide:true,detached:true,stdio:['ignore',out.fd,out.fd]});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}finally{await out.close();}
   spawnedPid=child.pid;child.unref();return {method:'detached',pid:child.pid,hasExited:()=>child.exitCode!==null||child.signalCode!==null};
  }});
  const auth=JSON.parse(await readFile(join(state,'local-auth.json'),'utf8'));
  const {stdout}=await promisify(execFile)('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./probe-user-server.ps1',import.meta.url)),'-InspectPid',String(auth.pid)],{windowsHide:true,timeout:15000,maxBuffer:65536});
  const actual=JSON.parse(stdout);if(actual.pid!==auth.pid||actual.sessionId!==session||actual.token.admin||actual.token.integrity!==8192||actual.token.uiAccess!==0||actual.token.owner!=='S-1-5-21-2255109513-3773794534-3440117263-1001'||spawnedPid&&spawnedPid!==auth.pid)throw Error('Actual server authority differs');
  await receipt({status:'ready',newServer:!!spawnedPid,actual});
 }catch{await receipt({status:'failed',...(spawnedPid?{spawnedPid}:{} )}).catch(()=>{});process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await recoverUserServer();
