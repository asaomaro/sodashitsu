import {expect,it,vi} from "vitest";
import {DesktopProvider} from "./DesktopProvider.js";
it.each(["source","dead","ready","ceiling"])("does not resume a queued control after its %s changes",mode=>{
 const provider=new DesktopProvider({command:["unused"],allowInput:true,origins:()=>[]}),state=provider as any,source={},intent={source,id:crypto.randomUUID(),epoch:crypto.randomUUID()},share={dead:mode==="dead",ready:mode!=="ready",allowInput:mode!=="ceiling",control:false,pendingControl:intent,process:{resourceChannel:mode==="source"?{}:source}};
 const grant=vi.spyOn(state,"applyControl").mockImplementation(()=>{}),send=vi.spyOn(state,"send").mockReturnValue(true);vi.spyOn(state,"claimResource").mockReturnValue(true);state.active=share;
 try{state.resumeControls(source);expect(grant).not.toHaveBeenCalled();expect(share.pendingControl).toBeUndefined();if(mode!=="dead")expect(send).toHaveBeenCalledWith(share,{type:"control",enabled:false});}
 finally{state.active=undefined;provider.dispose();}
});
it("does not wake an intent for another physical source's idle event",()=>{
 const provider=new DesktopProvider({command:["unused"],allowInput:true,origins:()=>[]}),state=provider as any,source={},intent={source,id:crypto.randomUUID(),epoch:crypto.randomUUID()},share={pendingControl:intent};state.active=share;const grant=vi.spyOn(state,"applyControl").mockImplementation(()=>{});
 try{state.resumeControls({});expect(grant).not.toHaveBeenCalled();expect(share.pendingControl).toBe(intent);}finally{state.active=undefined;provider.dispose();}
});
