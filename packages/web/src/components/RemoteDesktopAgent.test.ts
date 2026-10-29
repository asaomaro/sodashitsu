import {mount,flushPromises} from "@vue/test-utils";
import {afterEach,expect,it,vi} from "vitest";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
class Socket{readyState=1;bufferedAmount=0;binaryType="";onopen?:()=>void;onmessage?:(event:{data:string})=>Promise<void>;send=vi.fn();close=vi.fn();}
const state={encrypted:true,sockets:[] as Socket[]};
vi.mock("../desktop/DesktopEndpointSocket.js",()=>({createDesktopSocketFactory:()=>({get encrypted(){return state.encrypted;},dispose(){},open(){const socket=new Socket();state.sockets.push(socket);return socket;}})}));
afterEach(()=>{state.encrypted=true;state.sockets=[];vi.unstubAllGlobals();localStorage.clear();document.body.innerHTML="";});
async function fixture(){const viewer=mount(RemoteDesktopWindow,{attachTo:document.body,props:{machineId:"a".repeat(32),label:"Generated B",embedded:true}}),socket=state.sockets[0]!;socket.onopen?.();await socket.onmessage!({data:JSON.stringify({type:"ready",title:"Generated B",width:320,height:180,allowInput:true,backend:"synthetic"})});await flushPromises();return{viewer,socket};}
it.each(["escape","takeover"])("hides encrypted agent controls until authenticated feature proof and cancels a pending first grant on %s",async(mode)=>{
 const {viewer,socket}=await fixture();
 try{
  expect(viewer.find('[data-agent-access]').exists()).toBe(false);await socket.onmessage!({data:JSON.stringify({type:"agent_endpoint_available",peers:[{fingerprint:"b".repeat(64),label:"Generated CLI"}]})});await flushPromises();
  const grant=viewer.findAll('[data-agent-access] button').find(button=>button.text()==="エージェントへの画面提供・操作を許可")!;await grant.trigger("click");await flushPromises();
  expect(socket.send.mock.calls.map(([raw])=>JSON.parse(raw)).some(m=>m.type==="agent_endpoint_grant"&&m.enabled)).toBe(true);expect(viewer.find('input[aria-label="エージェント接続コード"]').exists()).toBe(false);
  const window=viewer.get('[data-remote-desktop]');(window.element as HTMLElement).focus();
  if(mode==="escape"){await window.trigger("keydown",{key:"Escape",code:"Escape"});await window.trigger("keyup",{key:"Escape",code:"Escape"});await window.trigger("keydown",{key:"Escape",code:"Escape"});await window.trigger("keyup",{key:"Escape",code:"Escape"});}
  else await viewer.findAll("button").find(button=>button.text()==="操作する")!.trigger("click");await flushPromises();
  expect(socket.send.mock.calls.map(([raw])=>JSON.parse(raw))).toContainEqual({type:"agent_endpoint_grant",enabled:false});if(mode==="escape")expect(window.element.contains(document.activeElement)).toBe(false);
 }finally{viewer.unmount();}
});
it("preserves the legacy agent controls on plaintext connections",async()=>{state.encrypted=false;const{viewer}=await fixture();try{expect(viewer.find('[data-agent-access]').exists()).toBe(true);expect(viewer.find('[aria-label="許可するエージェント"]').exists()).toBe(false);}finally{viewer.unmount();}});
it.each([false,true])("cancels pending human control on focusout and rejects its late grant, backpressure=%s",async(blocked)=>{
 const {viewer,socket}=await fixture();const outside=document.createElement("input");document.body.append(outside);
 try{
  await viewer.findAll("button").find(button=>button.text()==="操作する")!.trigger("click");expect(socket.send.mock.calls.map(([raw])=>JSON.parse(raw))).toContainEqual({type:"control",enabled:true});
  if(blocked)socket.bufferedAmount=20000;
  await viewer.get('[data-remote-desktop]').trigger("focusout",{relatedTarget:outside});await flushPromises();
  if(blocked)expect(socket.close).toHaveBeenCalled();else expect(socket.send.mock.calls.map(([raw])=>JSON.parse(raw))).toContainEqual({type:"control",enabled:false});
  socket.bufferedAmount=0;await socket.onmessage!({data:JSON.stringify({type:"control",enabled:true})});await flushPromises();expect(viewer.get('[data-desktop-status]').text()).toBe("閲覧中");expect(viewer.findAll("button").some(button=>button.text()==="操作する")).toBe(true);
 }finally{viewer.unmount();outside.remove();}
});
it("accepts protocol grants before cancellation and after a fresh request, while rejecting cancelled grants",async()=>{
 const {viewer,socket}=await fixture();const reply=(enabled:boolean)=>socket.onmessage!({data:JSON.stringify({type:"control",enabled})});
 try{
  await reply(true);await flushPromises();expect(viewer.get('[data-desktop-status]').text()).toBe("操作中");
  await viewer.findAll("button").find(button=>button.text()==="閲覧に戻る")!.trigger("click");await reply(false);await reply(true);await flushPromises();expect(viewer.get('[data-desktop-status]').text()).toBe("閲覧中");
  await viewer.findAll("button").find(button=>button.text()==="操作する")!.trigger("click");await reply(true);await flushPromises();expect(viewer.get('[data-desktop-status]').text()).toBe("操作中");
 }finally{viewer.unmount();}
});
it("refuses a protocol grant after focusout even when its request bypassed UI tracking",async()=>{
 const {viewer,socket}=await fixture(),outside=document.createElement("input");document.body.append(outside);
 try{socket.send(JSON.stringify({type:"control",enabled:true}));await viewer.get('[data-remote-desktop]').trigger("focusout",{relatedTarget:outside});await socket.onmessage!({data:JSON.stringify({type:"control",enabled:true})});await flushPromises();expect(viewer.get('[data-desktop-status]').text()).toBe("閲覧中");expect(socket.send.mock.calls.map(([raw])=>JSON.parse(raw))).toContainEqual({type:"control",enabled:false});}
 finally{viewer.unmount();outside.remove();}
});
