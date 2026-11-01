import {afterEach,expect,it,vi} from 'vitest';
import type {VoiceCoreCall} from '@sodashitsu/protocol';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createConnection,createServer,type Server} from 'node:net';
import {randomUUID} from 'node:crypto';
import {VoiceConfig} from './VoiceHost.js';
import {VoiceResidentService,requestVoiceResident,voiceSocketPath,voiceVersions,type VoiceCoreProcess} from './VoiceResident.js';
const dirs:string[]=[],services:VoiceResidentService[]=[],servers:Server[]=[];
afterEach(async()=>{await Promise.all(services.splice(0).map(s=>s.close()));await Promise.all(servers.splice(0).map(s=>new Promise<void>(r=>s.close(()=>r()))));await Promise.all(dirs.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
async function setup(){const directory=await mkdtemp(join(tmpdir(),'voice-ipc-'));dirs.push(directory);const config=VoiceConfig.parse({enabled:true,transport:'ipc',python:'/python',runtimeDir:'/runtime'});return {directory,config};}
function worker(version:string):VoiceCoreProcess{return {gpu:false,call:vi.fn(async (request:VoiceCoreCall)=>({kind:'json' as const,value:{version,text:request.text}})),cancel:vi.fn(()=>true),pid:()=>42,isStopped:()=>false,close:vi.fn(async()=>{})};}
it('reuses one resident per CORE version and routes separate versions independently',async()=>{
 const {directory,config}=await setup(),created=new Map<string,VoiceCoreProcess>();
 const service=new VoiceResidentService(directory,config,{versions:async()=>[{version:'0.17.1',profile:config,isDefault:true},{version:'0.17.0',profile:config,isDefault:false}],core:(_p,_d,version)=>{const item=worker(version);created.set(version,item);return item;}});services.push(service);await service.start();
 await Promise.all([requestVoiceResident(directory,{operation:'query',text:'最初'}),requestVoiceResident(directory,{operation:'query',coreVersion:'0.17.0',text:'別の版'})]);
 const next=await requestVoiceResident(directory,{operation:'query',text:'日本語を保つ'});
 expect(next).toEqual({kind:'json',value:{version:'0.17.1',text:'日本語を保つ'}});expect(created.size).toBe(2);
 expect(created.get('0.17.1')!.call).toHaveBeenCalledTimes(2);
 await service.close();expect(created.get('0.17.0')!.close).toHaveBeenCalledOnce();
});
it('decodes a Japanese request split inside a UTF-8 code point',async()=>{
 const {directory,config}=await setup();const service=new VoiceResidentService(directory,config,{versions:async()=>[{version:'0.17.1',profile:config,isDefault:true}],core:()=>worker('0.17.1')});services.push(service);await service.start();
 const packet=Buffer.from(JSON.stringify({id:randomUUID(),key:await readFile(join(directory,'voice-core-ipc.key'),'utf8'),request:{operation:'query',text:'あ'}})+'\n');const start=packet.indexOf(Buffer.from('あ'));
 const result=await new Promise<any>((resolve,reject)=>{const socket=createConnection(voiceSocketPath(directory));let output='';socket.setEncoding('utf8');socket.on('error',reject);socket.on('connect',()=>{socket.write(packet.subarray(0,start+1));setImmediate(()=>socket.end(packet.subarray(start+1)));});socket.on('data',data=>{output+=data;});socket.on('end',()=>resolve(JSON.parse(output)));});
 expect(result.result.value.text).toBe('あ');
});
it('decodes a response split inside a UTF-8 code point',async()=>{
 const {directory}=await setup();
 const server=createServer(socket=>{let input='';socket.setEncoding('utf8');socket.on('data',data=>{input+=data;if(!input.includes('\n'))return;socket.removeAllListeners('data');const {id}=JSON.parse(input);const packet=Buffer.from(JSON.stringify({id,ok:true,result:{kind:'json',value:'あ'}})+'\n'),start=packet.indexOf(Buffer.from('あ'));socket.write(packet.subarray(0,start+1));setImmediate(()=>socket.end(packet.subarray(start+1)));});});servers.push(server);
 await new Promise<void>(resolve=>server.listen(voiceSocketPath(directory),resolve));
 expect(await requestVoiceResident(directory,{operation:'version'})).toEqual({kind:'json',value:'あ'});
});
it('reuses a live socket owner and does not close its workers when the proxy shuts down',async()=>{
 const {directory,config}=await setup(),item=worker('0.17.1'),deps={versions:async()=>[{version:'0.17.1',profile:config,isDefault:true}],core:()=>item};
 const owner=new VoiceResidentService(directory,config,deps),proxy=new VoiceResidentService(directory,config,deps);services.push(owner,proxy);await owner.start();await proxy.start();
 await proxy.call({operation:'query',text:'共有'});await proxy.close();expect(item.close).not.toHaveBeenCalled();
 expect((await owner.call({operation:'query'})).kind).toBe('json');
});
it('waits for resident startup before dispatching a cold request',async()=>{
 const {directory,config}=await setup();let finish!:(value:any)=>void;const item=worker('0.17.1');
 const service=new VoiceResidentService(directory,config,{versions:()=>new Promise(resolve=>{finish=resolve;}),core:()=>item});services.push(service);
 const starting=service.start(),pending=service.call({operation:'query',text:'起動待ち'});expect(item.call).not.toHaveBeenCalled();
 finish([{version:'0.17.1',profile:config,isDefault:true}]);await starting;
 await expect(pending).resolves.toMatchObject({kind:'json'});
});
it('rejects mixed Windows and Linux CORE profiles before starting either process',async()=>{
 if(process.platform!=='linux')return;
 const {config}=await setup();
 await expect(voiceVersions({...config,additionalCores:[{...config,id:randomUUID(),version:'0.17.0',python:'/mnt/c/Python/python.exe'}]})).rejects.toThrow('同じOS');
});
it('passes an explicit persistent data directory to every CORE version',async()=>{
 const {directory,config}=await setup(),create=vi.fn(()=>worker('0.17.1'));
 const service=new VoiceResidentService(directory,{...config,dataDir:'/persistent/voice'},{versions:async()=>[{version:'0.17.1',profile:config,isDefault:true}],core:create});services.push(service);await service.start();await service.call({operation:'query'});
 expect(create).toHaveBeenCalledWith(config,'/persistent/voice','0.17.1');
});
