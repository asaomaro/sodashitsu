import {expect,it} from 'vitest';
import {managedChannel} from './managedChannel.js';
it('keeps the existing stdin transport when no native channel was requested',async()=>{
 const result=await managedChannel([], 'linux',{});expect(result.input).toBe(process.stdin);expect(result.output).toBe(process.stdout);
});
it('rejects arbitrary pipe names, absent secrets, duplicated channels and a non-Windows caller',async()=>{
 const good='--soda-managed-channel=00000000-0000-4000-8000-000000000001';
 for(const [args,platform,env] of [
  [['--soda-managed-channel=\\\\evil\\pipe\\x'],'win32',{SODA_ASSISTANT_CHANNEL_TOKEN:'a'.repeat(64)}],
  [[good],'win32',{}],[[good,good],'win32',{SODA_ASSISTANT_CHANNEL_TOKEN:'a'.repeat(64)}],
  [[good],'linux',{SODA_ASSISTANT_CHANNEL_TOKEN:'a'.repeat(64)}],
 ] as const)await expect(managedChannel(args,platform,env)).rejects.toThrow('起動経路');
});
it('authenticates the server before authorizing bootstrap and never sends the secret',async()=>{
 const {createServer,connect}=await import('node:net');const {createHmac}=await import('node:crypto');
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'soda-channel-'));const path=process.platform==='win32'?'\\\\.\\pipe\\soda-channel-'+crypto.randomUUID():join(dir,'p.sock');
 const id='00000000-0000-4000-8000-000000000001',token='a'.repeat(64),nonce='b'.repeat(64);let wire='';
 const server=createServer(socket=>{let stage=0;socket.setEncoding('utf8');socket.on('data',data=>{wire+=data;
  if(stage++===0){const challenge=String(data).trim();const proof=createHmac('sha256',token).update('server:'+id+':'+challenge+':'+nonce).digest('hex');socket.write(nonce+'.'+proof+'\n');}
 });});
 await new Promise<void>(r=>server.listen(path,r));
 try{const env={SODA_ASSISTANT_CHANNEL_TOKEN:token};const streams=await managedChannel(['--soda-managed-channel='+id],'win32',env,(()=>connect(path)) as typeof connect);expect(env.SODA_ASSISTANT_CHANNEL_TOKEN).toBeUndefined();await new Promise(r=>setTimeout(r,20));expect(wire).not.toContain(token);expect(wire.trim().split('\n')).toHaveLength(2);streams.close();}
 finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
it('refuses a substituted server before forwarding any bootstrap or identity',async()=>{
 const {createServer,connect}=await import('node:net');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'soda-channel-'));const path=process.platform==='win32'?'\\\\.\\pipe\\soda-channel-'+crypto.randomUUID():join(dir,'p.sock');let wire='';
 const server=createServer(socket=>{socket.setEncoding('utf8');socket.on('data',data=>{wire+=data;socket.write('b'.repeat(64)+'.'+'c'.repeat(64)+'\n');});});await new Promise<void>(r=>server.listen(path,r));
 try{await expect(managedChannel(['--soda-managed-channel=00000000-0000-4000-8000-000000000001'],'win32',{SODA_ASSISTANT_CHANNEL_TOKEN:'a'.repeat(64)},(()=>connect(path)) as typeof connect)).rejects.toThrow('接続認証');expect(wire.trim().split('\n')).toHaveLength(1);expect(wire).not.toContain('a'.repeat(64));}
 finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
it('rejects a normal EOF during authentication instead of leaving startup pending',async()=>{
 const {createServer,connect}=await import('node:net');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'soda-channel-'));const path=process.platform==='win32'?'\\\\.\\pipe\\soda-channel-'+crypto.randomUUID():join(dir,'p.sock');
 const server=createServer(socket=>socket.once('data',()=>socket.end()));await new Promise<void>(r=>server.listen(path,r));
 try{const result=managedChannel(['--soda-managed-channel=00000000-0000-4000-8000-000000000001'],'win32',{SODA_ASSISTANT_CHANNEL_TOKEN:'a'.repeat(64)},(()=>connect(path)) as typeof connect);
  await expect(Promise.race([result,new Promise((_,reject)=>setTimeout(()=>reject(Error('startup remained pending')),500))])).rejects.toThrow('接続が終了');
 }finally{await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
