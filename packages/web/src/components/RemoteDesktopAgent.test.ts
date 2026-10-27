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
