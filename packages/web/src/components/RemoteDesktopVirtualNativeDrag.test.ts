import {mount,flushPromises} from "@vue/test-utils";
import {defineComponent} from "vue";
import {afterEach,expect,it,vi} from "vitest";
import {DESKTOP_FILES_PROTOCOL,DesktopReady,desktopFeaturesFromProtocols} from "@sodashitsu/protocol";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
class Socket {
 readyState=1;bufferedAmount=0;binaryType="";onopen?:()=>void;onmessage?:(event:{data:string})=>Promise<void>;
 send=vi.fn();close=vi.fn();constructor(readonly protocols:string|string[]){}
}
const sockets:Socket[]=[];
vi.mock("../desktop/DesktopEndpointSocket.js",()=>({createDesktopSocketFactory:()=>({encrypted:false,dispose(){},open(_url:URL,protocols:string|string[]){const socket=new Socket(protocols);sockets.push(socket);return socket;}})}));
const transfer=defineComponent({props:["files","granted","inputEnabled"],template:'<div data-native-transfer-fixture />',setup(_props,{expose}){expose({stop:vi.fn(),interrupt:vi.fn()});}});
const files=defineComponent({emits:["grant-change"],template:'<button data-grant-files-fixture @click="$emit(\'grant-change\',true)">Allow generated files</button>'});
function viewer(){return mount(RemoteDesktopWindow,{props:{machineId:"generated",label:"Generated",embedded:true},global:{stubs:{DesktopNativeTransfer:transfer,DesktopFiles:files}}});}
const ready=DesktopReady.parse({type:"ready",title:"Generated",width:320,height:180,allowInput:true,backend:"synthetic",files:true});
const virtualReady=DesktopReady.parse({...ready,virtualDisplay:true,virtualNativeDrag:true});
async function receive(socket:Socket,value:unknown){await socket.onmessage!({data:JSON.stringify(value)});await flushPromises();}
async function attach(socket:Socket){await receive(socket,{type:"files_ticket",ticket:"a".repeat(43)});const file=sockets.at(-1)!;if(file!==socket)file.onopen?.();await receive(socket,{type:"files_ready"});return file;}
async function requestVirtual(v:ReturnType<typeof viewer>,optin=true){await v.get('[data-virtual-desktop-option] input').setValue(true);await flushPromises();if(optin){await v.get('[data-virtual-native-drag-option] input').setValue(true);await flushPromises();}const socket=sockets.at(-1)!;socket.onopen?.();return socket;}
afterEach(()=>{sockets.length=0;localStorage.clear();});
it("keeps physical drag unchanged and negotiates support without implicit virtual opt-in",async()=>{
 const v=viewer();try{
  const first=sockets[0]!;first.onopen?.();expect(desktopFeaturesFromProtocols(first.protocols as string[]).has("virtualNativeDrag")).toBe(true);
  expect(JSON.parse(first.send.mock.calls.find(([s])=>JSON.parse(s).type==="start")![0]).options).not.toHaveProperty("virtualNativeDrag");
  await receive(first,ready);await attach(first);expect(v.findComponent(transfer).exists()).toBe(true);expect(v.findComponent(transfer).props("granted")).toBe(false);
  await v.get('[data-grant-files-fixture]').trigger("click");expect(v.findComponent(transfer).props("granted")).toBe(true);
  const socket=await requestVirtual(v,false);expect((v.get('[data-virtual-native-drag-option] input').element as HTMLInputElement).checked).toBe(false);
  expect(JSON.parse(socket.send.mock.calls.find(([s])=>JSON.parse(s).type==="start")![0]).options).not.toHaveProperty("virtualNativeDrag");
  await receive(socket,virtualReady);await attach(socket);expect(v.findComponent(transfer).exists()).toBe(false);
 }finally{v.unmount();}
});
it("opens owned virtual drag only after explicit request and advertised drag capability",async()=>{
 const v=viewer();try{
  const socket=await requestVirtual(v);expect(JSON.parse(socket.send.mock.calls.find(([s])=>JSON.parse(s).type==="start")![0]).options).toMatchObject({virtualDisplay:true,virtualNativeDrag:true});
  await receive(socket,virtualReady);await attach(socket);expect(v.findComponent(transfer).exists()).toBe(true);expect(v.findComponent(transfer).props("granted")).toBe(false);
  await v.get('[data-grant-files-fixture]').trigger("click");expect(v.findComponent(transfer).props("granted")).toBe(true);
  // COPY may continue after intentional native handoff releases input; capability is not control ownership.
  await receive(socket,{type:"control",enabled:false});expect(v.findComponent(transfer).exists()).toBe(true);expect(v.findComponent(transfer).props("inputEnabled")).toBe(false);
  await receive(socket,{...virtualReady,virtualNativeDrag:undefined});expect(v.findComponent(transfer).exists()).toBe(false);expect(v.get('[data-virtual-native-drag-unavailable]').text()).toContain("利用できません");
 }finally{v.unmount();}
});
it("requires advertised file support even when the physical file lane is attached",async()=>{
 const v=viewer();try{
  const socket=sockets[0]!;socket.onopen?.();await receive(socket,DesktopReady.parse({...ready,files:undefined}));
  const file=await attach(socket);expect(file).not.toBe(socket);expect(file.protocols).toBe(DESKTOP_FILES_PROTOCOL);
  expect(file.send).toHaveBeenCalledWith(JSON.stringify({type:"video_viewer",ticket:"a".repeat(43)}));
  expect(socket.close).not.toHaveBeenCalled();expect(v.findComponent(transfer).exists()).toBe(false);
 }finally{v.unmount();}
});
it.each(["missing-capability","secure","cover","multiple-monitors","no-virtual-source"])("fails closed for %s",async variant=>{
 const v=viewer();try{
  const socket=await requestVirtual(v);const state:Record<string,unknown>={...virtualReady};
  if(variant==="missing-capability")delete state.virtualNativeDrag;
  if(variant==="secure")state.secureDesktop=true;
  if(variant==="cover")state.lockScreenCover=true;
  if(variant==="multiple-monitors")state.virtualMonitors=true;
  if(variant==="no-virtual-source")delete state.virtualDisplay;
  expect(DesktopReady.safeParse(state).success).toBe(variant==="missing-capability");
  await receive(socket,state);await attach(socket);
  expect(v.findComponent(transfer).exists()).toBe(false);
 }finally{v.unmount();}
});
it("drops old stream capability on reconnect and topology changes until a fresh ready",async()=>{
 const v=viewer();try{
  const old=await requestVirtual(v);await receive(old,virtualReady);await attach(old);expect(v.findComponent(transfer).exists()).toBe(true);
  await v.get('[data-virtual-native-drag-option] input').setValue(false);await flushPromises();expect(v.findComponent(transfer).exists()).toBe(false);
  await receive(old,virtualReady);expect(v.findComponent(transfer).exists()).toBe(false);
  await v.get('[data-virtual-native-drag-option] input').setValue(true);await flushPromises();const current=sockets.at(-1)!;current.onopen?.();
  await receive(current,{...virtualReady,virtualNativeDrag:undefined});await attach(current);expect(v.findComponent(transfer).exists()).toBe(false);
  await receive(current,virtualReady);expect(v.findComponent(transfer).exists()).toBe(true);
  await receive(current,{type:"monitor_topology_changed"});expect(v.findComponent(transfer).exists()).toBe(false);
  await receive(current,virtualReady);expect(v.findComponent(transfer).exists()).toBe(false);
 }finally{v.unmount();}
});
