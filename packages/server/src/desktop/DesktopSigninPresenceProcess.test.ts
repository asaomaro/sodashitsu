import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createHash} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {desktopSigninContext,DesktopSigninPresenceProcess,type DesktopSigninPresenceDependencies} from './DesktopSigninPresenceProcess.js';
const ownerSid='S-1-5-21-1-2-3-1001',root='C:\\Program Files\\Sodashitsu\\DesktopSignin-generated',slot=createHash('sha256').update(ownerSid).digest('hex');
const context={type:'signin_context',ownerSid,packageRoot:root,stateDir:'C:\\Program Files\\Sodashitsu\\DesktopSigninData\\'+slot+'\\runtime'};
class Child extends EventEmitter{stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();kill=vi.fn(()=>true);}
const processes:DesktopSigninPresenceProcess[]=[];afterEach(()=>{for(const p of processes)p.close();processes.length=0;vi.useRealTimers();});
function fixture(){let owned=true;const child=new Child(),abort=new AbortController(),closed=vi.fn(),unsafeStop=vi.fn();
 const spawn=vi.fn<DesktopSigninPresenceDependencies['spawn']>(()=>child as never),process=new DesktopSigninPresenceProcess({ownerSid,active:()=>owned,signal:abort.signal,closed},{root:()=>root,platform:'win32',now:()=>0,spawn,unsafeStop});processes.push(process);
 const output=(value:unknown)=>child.stdout.write(Buffer.from(JSON.stringify(value)+'\n'));
 return {process,child,abort,closed,unsafeStop,spawn,output,finish:(code=0)=>child.emit('close',code),lose:()=>{owned=false;}};
}
it('binds native context to the fixed owner and data slot',()=>{expect(desktopSigninContext(context,ownerSid,root)).toEqual(context);for(const bad of [{...context,stateDir:'C:\\arbitrary'},{...context,ownerSid:'S-1-5-18'},{...context,packageRoot:'C:\\other'},{...context,extra:true}])expect(()=>desktopSigninContext(bad,ownerSid,root)).toThrow();});
it('starts only fixed readonly presence with no capture/input commands',()=>{const f=fixture();expect(f.spawn.mock.calls[0]![1]).toEqual(['--broker','presence']);expect(f.spawn.mock.calls[0]![2].shell).toBeUndefined();expect(f.child.stdin.read()).toBeNull();f.finish();});
it('requires native context and first status before readiness, then follows real ownership',async()=>{const f=fixture();f.output(context);expect(f.process.active()).toBe(false);f.output({type:'signin_presence',seq:1});expect(await f.process.ready()).toEqual(context);expect(f.process.active()).toBe(true);f.lose();expect(f.process.active()).toBe(false);f.output({type:'signin_presence',seq:2});expect(f.process.active()).toBe(false);f.finish();await f.process.settled();});
it('keeps a healthy source across hours without status-proof expiry or heartbeat renewal',async()=>{vi.useFakeTimers();const f=fixture();f.output(context);f.output({type:'signin_presence',seq:1});await f.process.ready();await vi.advanceTimersByTimeAsync(12*60*60*1000);expect(f.process.active()).toBe(true);expect(f.closed).not.toHaveBeenCalled();f.finish();await f.process.settled();});
it('returns inactive after actual native process exit without a synthetic stopped receipt',async()=>{const f=fixture();f.output(context);f.output({type:'signin_inactive'});let done=false;void f.process.ready().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);f.finish();expect(await f.process.ready()).toBeNull();await f.process.settled();expect(f.unsafeStop).not.toHaveBeenCalled();});
it.each([{type:'signin_presence',seq:1},{...context,stateDir:'C:\\other'},{type:'unknown'}])('rejects malformed native records before publishing authority: %j',async value=>{const f=fixture();f.output(value);f.finish();await expect(f.process.settled()).rejects.toThrow();expect(f.closed).toHaveBeenCalledOnce();});
it('rejects a clean exit with incomplete framing',async()=>{const f=fixture();f.child.stdout.write(Buffer.from('{"type":'));f.finish();await expect(f.process.settled()).rejects.toThrow();expect(f.unsafeStop).toHaveBeenCalledOnce();});
it.each([201,203,208,215])('preserves a fixed native failure code %s',async code=>{const f=fixture();f.finish(code);await expect(f.process.settled()).rejects.toThrow();expect(f.unsafeStop).toHaveBeenCalledExactlyOnceWith(code);});
it('closes on parent cancellation and waits for real native exit',async()=>{const f=fixture();f.output(context);f.output({type:'signin_presence',seq:1});await f.process.ready();f.abort.abort();expect(f.process.active()).toBe(false);let done=false;void f.process.settled().then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);f.finish();await f.process.settled();});
