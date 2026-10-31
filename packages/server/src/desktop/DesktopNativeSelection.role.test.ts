import {beforeEach,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({prepare:vi.fn(),retire:vi.fn(),close:vi.fn(),run:vi.fn(),roles:[] as string[]}));
vi.mock('@sodashitsu/client-core/desktop/DesktopNativeRoleBinary.node',()=>({DesktopNativeRoleBinary:class{constructor(role:string){f.roles.push(role);}prepare=f.prepare;retirePreparation=f.retire;close=f.close;executable='fixed-common-host';arguments=['--role','selection','--module','fixed','--sha256','digest'];}}));
vi.mock('@sodashitsu/client-core/desktop/DesktopOwnedChild.node',()=>({desktopOwnedChild:f.run}));
import {DesktopNativeSelection} from './DesktopNativeSelection.js';
beforeEach(()=>{for(const mock of [f.prepare,f.retire,f.close,f.run])mock.mockReset().mockResolvedValue(undefined);f.roles=[];});
it('executes the selected common role with the original nonce and target witness',async()=>{
 const runtime=new DesktopNativeSelection('win32',{}),point={epoch:crypto.randomUUID(),x:12,y:34,window:42,pid:123};await runtime.prepare();
 f.run.mockImplementation(async(program,args,input)=>{expect(program).toBe('fixed-common-host');expect(args).toEqual(['--role','selection','--module','fixed','--sha256','digest']);const request=JSON.parse(input);return JSON.stringify({nonce:request.Nonce,epoch:request.Epoch,window:request.Window,pid:request.Process,paths:['C:\\generated']});});
 expect(f.roles).toEqual(['selection']);await expect(runtime.capture(point,750,new AbortController().signal)).resolves.toEqual(['C:\\generated']);await runtime.close();expect(f.close).toHaveBeenCalledOnce();
});
it('retires preparation immediately and waits for actual capture retirement before module cleanup',async()=>{
 const runtime=new DesktopNativeSelection('win32',{});await runtime.prepare();let finish!:(value:string)=>void,signal:AbortSignal|undefined;
 f.run.mockImplementation((_program,_args,_input,options)=>{signal=options.signal;return new Promise<string>(r=>finish=r);});
 const capture=runtime.capture({epoch:crypto.randomUUID(),x:0,y:0,window:42,pid:1},750,new AbortController().signal);const outcome=capture.catch(e=>e),closing=runtime.close();expect(signal?.aborted).toBe(true);expect(f.retire).toHaveBeenCalledOnce();await Promise.resolve();expect(f.close).not.toHaveBeenCalled();finish('{}');expect(await outcome).toBeInstanceOf(Error);await closing;expect(f.close).toHaveBeenCalledOnce();
});
