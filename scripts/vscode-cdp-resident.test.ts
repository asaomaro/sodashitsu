import {expect, it} from 'vitest';
import {mkdtemp, readFile, stat, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {ResidentSession,writeProfile,readProfile,defaultProfilePath,validateProfile,removeProfile} = await import(
  pathToFileURL(resolve(import.meta.dirname,'../plugins/vscode-desktop/resident-bridge.mjs')).href);
const deviceId = '11111111-1111-4111-8111-111111111111';
const share = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const profile = {version:1,origin:'http://127.0.0.1:17883',endpoint:'http://127.0.0.1:9222/',
  deviceId,secret:'a'.repeat(64),targetId:'window1',allowInput:true,allowFit:true};
function deferred() { let resolve!:()=>void; const promise = new Promise<void>(done=>{resolve=done;}); return {resolve,promise}; }
const tick = () => new Promise(resolve=>setTimeout(resolve,0));
function harness({cleanup,connect,save,allowInput=true,allowFit=true}:any={}) {
  const sent:any[]=[],calls:string[]=[],captures:any[]=[];let closed=0;
  class Capture {
    options:any;
    constructor(_cdp:any,options:any) {this.options=options;captures.push(this);}
    async start() {calls.push('start');}
    ack(seq:number) {calls.push(`ack:${seq}`);}
    async setControl(enabled:boolean) {calls.push(`control:${enabled}`);}
    async setViewport(size:any) {calls.push(`viewport:${size?.width}`);}
    async input(value:any) {calls.push(`input:${value.text}`);}
    async stop() {calls.push('cleanup-began');await cleanup?.promise;calls.push('cleanup-done');this.options.stopped();}
  }
  const session = new ResidentSession({send:(message:any)=>sent.push(message),close:()=>{++closed;},
    connectCdp:async()=>{calls.push('connect');await connect?.promise;return {close:()=>calls.push('cdp-close')};},
    saveRegistration:async(message:any)=>{calls.push('save');if(save)await save(message);},
    allowInput,allowFit,Capture});
  return {session,sent,calls,captures,closed:()=>closed};
}
it('saves a validated profile atomically with owner-only POSIX permissions outside TEMP defaults',async()=>{
  const dir = await mkdtemp(join(tmpdir(),'soda-resident-'));const path=join(dir,'nested','bridge.json');
  try {
    expect(await readProfile(path)).toBeNull();await writeProfile(path,profile);
    expect(await readProfile(path)).toEqual(profile);
    if(process.platform!=='win32')expect((await stat(path)).mode & 0o777).toBe(0o600);
    await writeProfile(path,{...profile,targetId:'window2'});
    expect(JSON.parse(await readFile(path,'utf8')).targetId).toBe('window2');
    expect(defaultProfilePath('win32',{LOCALAPPDATA:'C:/Users/example/AppData/Local'},'unused')).toContain('AppData/Local');
    expect(defaultProfilePath('linux',{},'/home/example')).toContain('/home/example/.local/state');
    expect(()=>validateProfile({...profile,origin:'http://public.example'})).toThrow();
    expect(()=>validateProfile({...profile,endpoint:'http://127.0.0.1:9222/?secret=x'})).toThrow();
    expect(()=>validateProfile({...profile,allowInput:false})).toThrow();
  }finally{await rm(dir,{recursive:true,force:true});}
});
it('waits for registration persistence before capture and scopes every input and frame to the active share',async()=>{
  const saved=deferred();const h=harness({save:()=>saved.promise});
  h.session.message({type:'registered',deviceId,secret:profile.secret});
  h.session.message({type:'ready',deviceId});h.session.message({type:'start',shareId:share});
  await tick();expect(h.calls).toEqual(['save']);saved.resolve();await tick();
  h.session.message({type:'control',shareId:other,enabled:true});
  h.session.message({type:'input',shareId:other,input:{text:'wrong'}});
  h.session.message({type:'ack',shareId:other,seq:9});
  h.session.message({type:'viewport',shareId:other,size:{width:999}});
  h.session.message({type:'stop',shareId:other});
  h.session.message({type:'control',shareId:share,enabled:true});
  h.session.message({type:'input',shareId:share,input:{text:'correct'}});
  h.session.message({type:'ack',shareId:share,seq:1});
  h.session.message({type:'viewport',shareId:share,size:{width:900}});
  h.captures[0].options.frame({type:'frame',seq:1});
  expect(h.calls).toEqual(['save','connect','start','control:true','input:correct','ack:1','viewport:900']);
  expect(h.sent).toEqual([{type:'frame',seq:1,shareId:share}]);await h.session.shutdown();
});
it('acknowledges stop only after cleanup and supports another share from idle without stale messages',async()=>{
  const cleanup=deferred();const h=harness({cleanup});
  h.session.message({type:'ready',deviceId});h.session.message({type:'start',shareId:share});await tick();
  h.session.message({type:'stop',shareId:share});await tick();expect(h.sent).toEqual([]);
  h.captures[0].options.frame({type:'frame',seq:2});
  h.session.message({type:'input',shareId:share,input:{text:'cleanup'}});
  cleanup.resolve();await tick();
  expect(h.calls.slice(-2)).toEqual(['cleanup-done','cdp-close']);
  expect(h.sent).toEqual([{type:'stopped',shareId:share}]);
  h.session.message({type:'start',shareId:other});await tick();
  h.session.message({type:'stop',shareId:share});h.session.message({type:'input',shareId:share,input:{text:'old'}});
  h.session.message({type:'input',shareId:other,input:{text:'new'}});
  expect(h.calls.at(-1)).toBe('input:new');expect(h.captures).toHaveLength(2);await h.session.shutdown();
});
it('rejects a new start during cleanup instead of creating a second capture',async()=>{
  const cleanup=deferred();const h=harness({cleanup});h.session.message({type:'ready',deviceId});
  h.session.message({type:'start',shareId:share});await tick();h.session.message({type:'stop',shareId:share});
  h.session.message({type:'start',shareId:other});expect(h.closed()).toBe(1);expect(h.captures).toHaveLength(1);
  cleanup.resolve();await h.session.shutdown();expect(h.sent).toEqual([]);
});
it('cleans up a CDP connection that completes after socket shutdown and never starts capture',async()=>{
  const connect=deferred();const h=harness({connect});h.session.message({type:'ready',deviceId});
  h.session.message({type:'start',shareId:share});await tick();const shutting=h.session.shutdown();connect.resolve();await shutting;
  expect(h.calls).toEqual(['connect','cdp-close']);expect(h.captures).toHaveLength(0);expect(h.sent).toEqual([]);
});
it('closes on persistence failure and never connects CDP or exposes a secret in output',async()=>{
  const h=harness({save:()=>Promise.reject(new Error(profile.secret))});
  h.session.message({type:'registered',deviceId,secret:profile.secret});h.session.message({type:'start',shareId:share});await tick();
  expect(h.closed()).toBeGreaterThan(0);expect(h.calls).toEqual(['save']);expect(h.sent).toEqual([]);await h.session.shutdown();
});
it('keeps local input and fit permission limits on every share',async()=>{
  const h=harness({allowInput:false,allowFit:false});h.session.message({type:'ready',deviceId});
  h.session.message({type:'start',shareId:share});await tick();
  h.session.message({type:'control',shareId:share,enabled:true});
  h.session.message({type:'input',shareId:share,input:{text:'denied'}});
  h.session.message({type:'viewport',shareId:share,size:{width:900}});
  expect(h.calls).toEqual(['connect','start','control:false']);await h.session.shutdown();
});
it('retains the latest local-approved control and viewport during CDP connection setup but drops premature input',async()=>{
  const connect=deferred();const h=harness({connect});h.session.message({type:'ready',deviceId});
  h.session.message({type:'start',shareId:share});await tick();
  h.session.message({type:'control',shareId:share,enabled:true});
  h.session.message({type:'viewport',shareId:share,size:{width:800}});
  h.session.message({type:'viewport',shareId:share,size:{width:900}});
  h.session.message({type:'input',shareId:share,input:{text:'premature'}});
  connect.resolve();await tick();
  expect(h.calls).toEqual(['connect','start','control:true','viewport:900']);await h.session.shutdown();
});
it('cancels pending control and fit on revocation during CDP connection setup',async()=>{
  const connect=deferred();const h=harness({connect});h.session.message({type:'ready',deviceId});
  h.session.message({type:'start',shareId:share});await tick();
  h.session.message({type:'control',shareId:share,enabled:true});
  h.session.message({type:'viewport',shareId:share,size:{width:900}});
  h.session.message({type:'control',shareId:share,enabled:false});
  connect.resolve();await tick();expect(h.calls).toEqual(['connect','start']);await h.session.shutdown();
});
it('returns to idle once after unexpected capture stop and ignores its stale callbacks in the next share',async()=>{
  const h=harness();h.session.message({type:'ready',deviceId});h.session.message({type:'start',shareId:share});await tick();
  const old=h.captures[0];old.options.stopped();await tick();
  expect(h.sent).toEqual([{type:'stopped',shareId:share}]);
  h.session.message({type:'start',shareId:other});await tick();old.options.stopped();old.options.frame({type:'frame',seq:99});
  expect(h.sent).toEqual([{type:'stopped',shareId:share}]);expect(h.captures).toHaveLength(2);await h.session.shutdown();
});

it('only removes the matching saved registration on a revoked-device response',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'soda-resident-remove-'));const path=join(dir,'bridge.json');
  try {
    await writeProfile(path,profile);
    await removeProfile(path,{...profile,deviceId:other});
    expect(await readProfile(path)).toEqual(profile);
    await removeProfile(path,profile);expect(await readProfile(path)).toBeNull();
  }finally{await rm(dir,{recursive:true,force:true});}
});

it('waits for real capture cleanup before resident stop acknowledgement or CDP close after an internal stop',async()=>{
  const {CdpCapture}=await import(pathToFileURL(resolve(import.meta.dirname,'../plugins/vscode-desktop/cdp-client.mjs')).href);
  const clearing=deferred(),gate=deferred();const events:string[]=[];let capture:any;
  const cdp={send:async(method:string)=>{
    if(method==='Emulation.clearDeviceMetricsOverride'){events.push('clear-began');clearing.resolve();await gate.promise;events.push('clear-done');}
    if(method==='Page.stopScreencast')events.push('screencast-stop');
    return method==='Page.getLayoutMetrics'?{cssVisualViewport:{clientWidth:900,clientHeight:600}}:{};
  },onEvent:()=>()=>{},close:()=>events.push('cdp-close')};
  class Capture extends CdpCapture {constructor(...args:any[]){super(...args);capture=this;}}
  const session=new ResidentSession({send:(m:any)=>{if(m.type==='stopped')events.push('stopped');},close:()=>{},
    connectCdp:async()=>cdp,saveRegistration:async()=>{},allowInput:true,allowFit:true,Capture});
  session.message({type:'ready',deviceId});session.message({type:'start',shareId:share});await tick();
  session.message({type:'control',shareId:share,enabled:true});
  await capture.setViewport({width:900,height:600});events.length=0;
  const internal=capture.stop();await clearing.promise;session.message({type:'stop',shareId:share});
  try {await tick();expect(events).toEqual(['clear-began']);}
  finally {gate.resolve();await internal;await tick();await session.shutdown();}
  expect(events).toEqual(['clear-began','clear-done','screencast-stop','cdp-close','stopped']);
});
