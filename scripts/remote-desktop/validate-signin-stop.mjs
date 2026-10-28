// Generated ordinary Node children only. No privileged/service/desktop entry.
import {spawn} from 'node:child_process';
import {strict as assert} from 'node:assert';
const source=new URL('../../packages/server/src/desktop/DesktopSigninStopSignal.ts',import.meta.url).href;
const program=`import {desktopSigninStopSignal} from ${JSON.stringify(source)};let monitor,finishing=false;monitor=desktopSigninStopSignal(process.stdin,()=>{if(finishing)return;finishing=true;queueMicrotask(()=>{const failed=monitor.failed();monitor.close();process.stdout.write(JSON.stringify({stopped:true,failed})+'\\n');process.exitCode=failed?1:0;});});`;
const env={};for(const name of ['PATH','SystemRoot','windir','TEMP','TMP'])if(process.env[name])env[name]=process.env[name];
for(const fixture of [{chunks:['signin_','stop\n'],code:0},{chunks:['other\n'],code:1},{chunks:['signin_'],code:1},{chunks:['signin_stop\nextra'],code:1}]){
 const child=spawn(process.execPath,['--no-addons','--input-type=module','-e',program],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',error='';child.stdout.on('data',bytes=>{output+=bytes;});child.stderr.on('data',bytes=>{error+=bytes;});
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}),timer=setTimeout(()=>child.kill(),5000);
 try{for(const chunk of fixture.chunks)child.stdin.write(chunk);child.stdin.end();const code=await done;assert.equal(code,fixture.code,'Generated stop child exit code');assert.equal(error,'','Generated stop child stderr');assert.deepEqual(JSON.parse(output),{stopped:true,failed:fixture.code!==0});}finally{clearTimeout(timer);child.kill();}
}
process.stdout.write('signin_stop_generated_node_pipe_cleanup_and_exit_passed\n');
