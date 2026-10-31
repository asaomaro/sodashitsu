import {expect,it} from 'vitest';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it.each([0,75])('keeps a native pipe lease until the generated GUI peer closes (%s)',async(code)=>{
 const dir=await mkdtemp(join(process.platform==='darwin'?'/private/tmp':tmpdir(),'soda-relay-'));await mkdir(join(dir,'dist'));
 let source=await readFile(new URL('../scripts/managed-relay.cjs',import.meta.url),'utf8');
 // Only the platform gate and OS pipe namespace differ on POSIX; relay ownership/auth code is unchanged.
 if(process.platform!=='win32')source=source.replace("process.platform !== 'win32'","false").replace("'\\\\\\\\.\\\\pipe\\\\soda-assistant-'","process.env.SODA_TEST_PIPE_PREFIX");
 await writeFile(join(dir,'dist','managed-relay.cjs'),source);await writeFile(join(dir,'package.json'),'{"main":"main.cjs"}');
 await writeFile(join(dir,'main.cjs'),`
 const net=require('node:net'),crypto=require('node:crypto'),fs=require('node:fs');
 const id=process.argv.find(x=>x.startsWith('--soda-managed-channel=')).split('=')[1],key=process.env.SODA_ASSISTANT_CHANNEL_TOKEN;
 if(process.env.ELECTRON_RUN_AS_NODE)process.exit(90);
 const path=process.platform==='win32'?'\\\\\\\\.\\\\pipe\\\\soda-assistant-'+id:process.env.SODA_TEST_PIPE_PREFIX+id;
 const socket=net.connect(path);let step=0,challenge='c'.repeat(64),buffer='';
 socket.setEncoding('utf8');socket.on('connect',()=>socket.write(challenge+'\\n'));
 socket.on('data',data=>{buffer+=data;if(!buffer.includes('\\n'))return;
 const line=buffer.trim();buffer='';if(step++===0){const nonce=line.split('.')[0];socket.write(crypto.createHmac('sha256',key).update('client:'+id+':'+challenge+':'+nonce).digest('hex')+'\\n');}
 else{const boot=JSON.parse(line);if(boot.version!==1)process.exit(91);fs.writeFileSync(__dirname+'/ready','ready');socket.write(JSON.stringify({type:'attached',deviceId:'00000000-0000-4000-8000-000000000001'})+'\\n');${code===75?'socket.end();process.exit(75);':''}}
 });socket.on('end',()=>{fs.writeFileSync(__dirname+'/retired','retired');process.exit(0)});socket.on('error',()=>process.exit(92));
 `);
 const child=spawn(process.execPath,[join(dir,'dist','managed-relay.cjs'),'--soda-managed'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',SODA_TEST_PIPE_PREFIX:join(dir,'p-')},stdio:['pipe','pipe','pipe']});
 let output='',errors='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>errors+=data);
 const closed=new Promise<number|null>(resolve=>child.on('close',resolve));
 try{child.stdin.write('{"version":1,"serverOrigin":"http://127.0.0.1:7780"}\n');
  if(code===0){await expect.poll(()=>output,{timeout:5000}).toContain('attached');expect(child.exitCode).toBeNull();child.stdin.end();}
  expect(await closed,errors).toBe(code);expect(output).toContain('{"type":"retired"}');
  if(code===0)expect(await readFile(join(dir,'retired'),'utf8')).toBe('retired');
 }finally{if(child.exitCode===null){child.kill();await closed;}await rm(dir,{recursive:true,force:true});}
},15000);
