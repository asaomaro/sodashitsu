import {recoverUserServer} from './recover-user-server.mjs';
import {readFile,writeFile,access} from 'node:fs/promises';import {join} from 'node:path';import net from 'node:net';
import {connect} from 'file:///C:/git/sodashitsu/packages/cli/dist/wsClient.js';
const home=join(process.env.LOCALAPPDATA,'sodashitsu'),state=join(home,'interactive-recovery-test-20261106'),receipt=join(home,'user-recovery-test-status.json');
try{await access(state);throw Error('Fresh isolated state required');}catch(e){if(e.code!=='ENOENT')throw e;}
let first,second,stopped=false;
try{
 await recoverUserServer(true);first=JSON.parse(await readFile(receipt,'utf8'));
 if(first.status!=='ready'||first.newServer!==true||!first.actual?.pid)throw Error('New interactive server not proved');
 await recoverUserServer(true);second=JSON.parse(await readFile(receipt,'utf8'));
 if(second.status!=='ready'||second.newServer!==false||second.actual?.pid!==first.actual.pid||second.actual.createdFiletime!==first.actual.createdFiletime)throw Error('Existing server not reused');
}finally{
 const current=JSON.parse(await readFile(receipt,'utf8'));
 const pid=first?.actual?.pid??current.spawnedPid;
 if(pid){
  const auth=JSON.parse(await readFile(join(state,'local-auth.json'),'utf8'));if(auth.pid!==pid)throw Error('Owned test server differs');
  const origin='http://127.0.0.1:17883',response=await fetch(origin+'/api/local-login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({secret:auth.secret}),redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('Owned test login failed');const client=await connect(origin,response.headers.get('set-cookie').split(';')[0]);try{await client.hello();await client.request('server.stop',{});}finally{client.close();}
  const alive=()=>{try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}};
  const open=()=>new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port:17883});s.setTimeout(1000);s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));s.once('timeout',()=>{s.destroy();resolve(true);});});
  for(let i=0;i<150;i++){if(!alive()&&!await open()){stopped=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}
  if(!stopped)throw Error('Owned test server teardown unconfirmed');
 }
 await writeFile(join(home,'user-recovery-test-result.json'),JSON.stringify({ok:first?.newServer===true&&second?.newServer===false&&stopped,newServer:first,existingServer:second,stopped})+'\n',{mode:0o600});
}
