import {afterEach,expect,it,vi} from "vitest";
import {mount} from "@vue/test-utils";
import {createPinia} from "pinia";
import {ConnectionKey,ViewSyncKey} from "../injection.js";
import {useSessionStore} from "../store/session.js";
import AssistantResponse from "./AssistantResponse.vue";
afterEach(()=>{history.replaceState(null,"","/");document.body.innerHTML="";});
const P="11111111-1111-4111-8111-111111111111",W="22222222-2222-4222-8222-222222222222",I="33333333-3333-4333-8333-333333333333";
function setup(ask=false){
 history.replaceState(null,"",`/#assistantPane=${P}&assistantWorkspace=${W}&assistantInstance=${I}`+(ask?"&assistantAsk=q1":""));
 const pinia=createPinia(),s=useSessionStore(pinia);
 s.panes.set(P,{id:P,tabId:"t1",label:"Agent",status:"running",agent:{instanceId:I}} as never);s.tabs.set("t1",{id:"t1",workspaceId:W} as never);
 const request=vi.fn().mockResolvedValue({}),remove=vi.fn();let callback:(()=>void)|undefined;
 const onViewEstablished=vi.fn((fn:()=>void)=>{callback=fn;return remove;});
 const wrapper=mount(AssistantResponse,{global:{plugins:[pinia],provide:{[ConnectionKey as symbol]:{request},[ViewSyncKey as symbol]:{onViewEstablished}},stubs:{PaneLayout:true,TerminalPane:true,AskDialog:true,Toast:true,ReconnectOverlay:true}},attachTo:document.body});
 return {wrapper,request,remove,onViewEstablished,established:()=>callback?.()};
}
it("fits the reply terminal at the first established view and on reconnect without input",()=>{
 const h=setup();expect(h.request).not.toHaveBeenCalled();expect(h.onViewEstablished).toHaveBeenCalledWith(expect.any(Function),true);
 h.established();expect(h.request).toHaveBeenCalledWith("client.fit",{enabled:true});h.established();expect(h.request).toHaveBeenCalledTimes(2);
 h.wrapper.unmount();expect(h.remove).toHaveBeenCalledOnce();expect(h.request).toHaveBeenLastCalledWith("client.fit",{enabled:false});
});
it("does not claim size for an ask-only window",()=>{
 const h=setup(true);expect(h.onViewEstablished).not.toHaveBeenCalled();expect(h.request).not.toHaveBeenCalled();h.wrapper.unmount();
});
