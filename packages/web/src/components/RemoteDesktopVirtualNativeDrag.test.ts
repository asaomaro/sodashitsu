import {mount,flushPromises} from "@vue/test-utils";
import {defineComponent} from "vue";
import {afterEach,expect,it,vi} from "vitest";
import {desktopFeaturesFromProtocols} from "@sodashitsu/protocol";
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
const ready={type:"ready",title:"Generated",width:320,height:180,allowInput:true,backend:"synthetic",files:true,resourceFences:true};
const proof={...ready,virtualDisplay:true,virtualNativeDrag:true};
async function receive(socket:Socket,value:unknown){await socket.onmessage!({data:JSON.stringify(value)});await flushPromises();}
async function attach(socket:Socket){await receive(socket,{type:"files_ticket",ticket:"a".repeat(43)});await receive(socket,{type:"files_ready"});}
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
  await receive(socket,proof);await attach(socket);expect(v.findComponent(transfer).exists()).toBe(false);
 }finally{v.unmount();}
});
it("opens owned virtual drag only after explicit request and current public ready proof",async()=>{
 const v=viewer();try{
  const socket=await requestVirtual(v);expect(JSON.parse(socket.send.mock.calls.find(([s])=>JSON.parse(s).type==="start")![0]).options).toMatchObject({virtualDisplay:true,virtualNativeDrag:true});
  await receive(socket,proof);await attach(socket);expect(v.findComponent(transfer).exists()).toBe(true);expect(v.findComponent(transfer).props("granted")).toBe(false);
  await v.get('[data-grant-files-fixture]').trigger("click");expect(v.findComponent(transfer).props("granted")).toBe(true);
  // COPY may continue after intentional native handoff releases input; capability is not control ownership.
  await receive(socket,{type:"control",enabled:false});expect(v.findComponent(transfer).exists()).toBe(true);expect(v.findComponent(transfer).props("inputEnabled")).toBe(false);
  await receive(socket,{...proof,virtualNativeDrag:undefined});expect(v.findComponent(transfer).exists()).toBe(false);expect(v.get('[data-virtual-native-drag-unavailable]').text()).toContain("利用できません");
 }finally{v.unmount();}
});
it.each(["missing-proof","missing-fence","secure","cover","multiple-monitors","no-virtual-source"])("fails closed for %s",async variant=>{
 const v=viewer();try{
  const socket=await requestVirtual(v);const state:Record<string,unknown>={...proof};
  if(variant==="missing-proof")delete state.virtualNativeDrag;
  if(variant==="missing-fence")delete state.resourceFences;
  if(variant==="secure")state.secureDesktop=true;
  if(variant==="cover")state.lockScreenCover=true;
  if(variant==="multiple-monitors")state.virtualMonitors=true;
  if(variant==="no-virtual-source")delete state.virtualDisplay;
  await receive(socket,state);if(variant==="missing-proof")await attach(socket);
  expect(v.findComponent(transfer).exists()).toBe(false);
 }finally{v.unmount();}
});
it("drops old stream proof on reconnect and topology changes until a fresh ready",async()=>{
 const v=viewer();try{
  const old=await requestVirtual(v);await receive(old,proof);await attach(old);expect(v.findComponent(transfer).exists()).toBe(true);
  await v.get('[data-virtual-native-drag-option] input').setValue(false);await flushPromises();expect(v.findComponent(transfer).exists()).toBe(false);
  await receive(old,proof);expect(v.findComponent(transfer).exists()).toBe(false);
  await v.get('[data-virtual-native-drag-option] input').setValue(true);await flushPromises();const current=sockets.at(-1)!;current.onopen?.();
  await receive(current,{...proof,virtualNativeDrag:undefined});await attach(current);expect(v.findComponent(transfer).exists()).toBe(false);
  await receive(current,proof);expect(v.findComponent(transfer).exists()).toBe(true);
  await receive(current,{type:"monitor_topology_changed"});expect(v.findComponent(transfer).exists()).toBe(false);
  await receive(current,proof);expect(v.findComponent(transfer).exists()).toBe(false);
 }finally{v.unmount();}
});
