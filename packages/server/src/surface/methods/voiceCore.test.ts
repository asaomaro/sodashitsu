import {expect,it,vi} from 'vitest';import {randomUUID} from 'node:crypto';
import {ControlSurface,type MethodContext} from '../ControlSurface.js';import {registerAssistantMethods} from './assistant.js';
it('requires the request owner for cancellation and rejects the generic-operation bypass',async()=>{
 const surface=new ControlSurface();let finish!:(value:unknown)=>void;
 const call=vi.fn((request:{operation:string})=>request.operation==='cancel'?Promise.resolve({kind:'json',value:true}):new Promise(resolve=>{finish=resolve;})),cancel=vi.fn(async()=>true);
 registerAssistantMethods(surface,{assistantVoice:{endpoint:async()=>({enabled:true,origin:null,transport:'ipc'}),call,cancel}} as never);
 const requestId=randomUUID(),owner={clientId:'owner'} as MethodContext,other={clientId:'other'} as MethodContext;
 const pending=surface.invoke(owner,'voice.call',{operation:'synthesize',requestId,text:'test',speaker:8});await vi.waitFor(()=>expect(call).toHaveBeenCalledOnce());
 expect(await surface.invoke(other,'voice.call',{operation:'cancel',params:{requestId}})).toMatchObject({ok:false,error:{code:'unauthorized'}});
 expect(await surface.invoke(other,'voice.cancel',{requestId})).toMatchObject({ok:true,result:{cancelled:false}});expect(cancel).not.toHaveBeenCalled();
 expect(await surface.invoke(owner,'voice.cancel',{requestId})).toMatchObject({ok:true,result:{cancelled:true}});expect(cancel).toHaveBeenCalledWith(requestId);
 finish({kind:'json',value:null});await pending;
});
