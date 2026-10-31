import {expect,it,vi} from 'vitest';
import {ControlSurface,type MethodContext} from '../ControlSurface.js';
import {registerAssistantMethods} from './assistant.js';
it('allows a local settings toggle, rejects remote/arbitrary commands and aborts queued writes',async()=>{
 const surface=new ControlSurface(),setEnabled=vi.fn(async(_enabled:boolean,guard:()=>void)=>{guard();return{};});registerAssistantMethods(surface,{assistantLaunch:{setEnabled,status:vi.fn(async()=>({}))}} as never);
 const ctx={clientId:'generated'} as MethodContext;
 expect(await surface.invoke(ctx,'assistant.settings.set',{enabled:true})).toMatchObject({ok:false,error:{code:'unauthorized'}});expect(setEnabled).not.toHaveBeenCalled();
 const local={...ctx,connection:{localSettings:true}} as MethodContext;
 expect(await surface.invoke(local,'assistant.settings.set',{enabled:true,command:'bad'})).toMatchObject({ok:false,error:{code:'invalid_params'}});
 expect(await surface.invoke(local,'assistant.settings.set',{enabled:true})).toMatchObject({ok:true});
 const controller=new AbortController();controller.abort();expect(await surface.invoke({...local,signal:controller.signal},'assistant.settings.set',{enabled:true})).toMatchObject({ok:false});expect(setEnabled).toHaveBeenCalledTimes(1);
});
