import {afterEach,expect,it,vi} from "vitest";
import {mount,flushPromises} from "@vue/test-utils";
const state=vi.hoisted(()=>({start:vi.fn(),stop:vi.fn(),close:vi.fn(),connect:vi.fn(),send:vi.fn(),bridgeStop:vi.fn(),options:undefined as any}));
vi.mock("../desktop/nativeHelperRpc.js",()=>({DesktopNativeHelperRpc:class{start=(id:string)=>state.start(id);stop=(id:string)=>state.stop(id);close=()=>state.close();}}));
vi.mock("@sodashitsu/client-core/desktop/DesktopNativeBridge",()=>({DesktopNativeBridge:{connect:(descriptor:unknown,options:unknown)=>{state.options=options;return state.connect(descriptor,options);}}}));
import DesktopNativeTransfer from "./DesktopNativeTransfer.vue";
import type {DesktopFileClient} from "../desktop/fileClient.js";
const clean:Array<()=>void>=[];afterEach(()=>{for(const fn of clean.splice(0).reverse())fn();vi.resetAllMocks();});
const point={x:0.4,y:0.4,clientX:100,clientY:100},move={...point,clientX:110};
async function fixture(connect=true){
 const id=crypto.randomUUID(),origin="http://n00000000000000000000000000000000.localhost:1234",descriptor={id,origin,url:`${origin}/bridge?id=${id}`},offer={lease:crypto.randomUUID(),generation:crypto.randomUUID(),entries:[{name:"generated.txt",directory:false,bytes:1,sha256:"a".repeat(64)}]};
 state.start.mockResolvedValue(descriptor);state.stop.mockResolvedValue({});state.connect.mockResolvedValue({send:state.send,stop:state.bridgeStop});
 const request=vi.fn(async(value:any)=>value.action==="native_prepare"?{native:offer}:value.action==="native_activate"?{id:offer.lease}:{}),wrapper=mount(DesktopNativeTransfer,{props:{files:{request} as unknown as DesktopFileClient,granted:true,inputEnabled:true}});clean.push(()=>wrapper.unmount());
 if(connect){await wrapper.findAll("button")[0]!.trigger("click");await flushPromises();}
 const begin=async()=>{expect(wrapper.vm.begin(point)).toBe(true);const gesture=state.send.mock.calls.at(-1)![0].gesture;wrapper.vm.sent(7);state.options.event({type:"armed",gesture});wrapper.vm.ack(7);wrapper.vm.pointer(move,"move",1);await flushPromises();return gesture;};
 return {wrapper,descriptor,request,offer,begin};
}
it("connects only after explicit preparation and reports native copy completion",async()=>{
 const f=await fixture();expect(state.start).toHaveBeenCalledOnce();expect(f.wrapper.find('output').text()).toContain("有効");const gesture=await f.begin();expect(f.wrapper.emitted("handoff")).toHaveLength(1);expect(state.send.mock.calls.some(([value])=>value.type==="start")).toBe(true);state.options.event({type:"done",gesture,ok:true});await flushPromises();expect(f.wrapper.find('output').text()).toContain("コピーが完了");
});
it("revokes transfer immediately while retaining the prepared helper for a fresh grant",async()=>{
 const f=await fixture(),gesture=await f.begin();await f.wrapper.setProps({granted:false});expect(f.wrapper.emitted("release")).toHaveLength(1);expect(state.send.mock.calls.some(([value])=>value.type==="cancel"&&value.gesture===gesture)).toBe(true);expect(f.wrapper.vm.begin(point)).toBe(false);await f.wrapper.setProps({granted:true});expect(f.wrapper.vm.begin(point)).toBe(false);state.options.event({type:"done",gesture,ok:false});expect(f.wrapper.vm.begin(point)).toBe(true);expect(state.start).toHaveBeenCalledOnce();
});
it("discards a helper locator returned after the component was closed",async()=>{
 const f=await fixture(false);let complete!:(value:unknown)=>void;state.start.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));await f.wrapper.findAll("button")[0]!.trigger("click");f.wrapper.unmount();complete(f.descriptor);await flushPromises();expect(state.connect).not.toHaveBeenCalled();expect(state.close).toHaveBeenCalled();
});
it("closes a late local bridge even when it ignores Abort during initialization",async()=>{
 const f=await fixture(false);let complete!:(value:unknown)=>void;state.connect.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));await f.wrapper.findAll("button")[0]!.trigger("click");await flushPromises();f.wrapper.unmount();expect(state.options.signal.aborted).toBe(true);complete({send:state.send,stop:state.bridgeStop});await flushPromises();expect(state.bridgeStop).toHaveBeenCalledOnce();expect(f.request).not.toHaveBeenCalled();
});
