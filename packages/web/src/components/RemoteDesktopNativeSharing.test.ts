import {mount,flushPromises} from "@vue/test-utils";
import {afterEach,expect,it,vi} from "vitest";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
class Socket {readyState=1;bufferedAmount=0;binaryType="";onopen?:()=>void;onmessage?:(event:{data:string})=>Promise<void>;send=vi.fn();close=vi.fn();}
const sockets:Socket[]=[];
vi.mock("../desktop/DesktopEndpointSocket.js",()=>({createDesktopSocketFactory:()=>({encrypted:false,dispose(){},open(){const socket=new Socket();sockets.push(socket);return socket;}})}));
afterEach(()=>{sockets.length=0;localStorage.clear();});
it.each(["linux-portal","macos-sck"])("lets a fresh %s viewer opt in to shared desktop and reconnect",async backend=>{
 const viewer=mount(RemoteDesktopWindow,{props:{machineId:"generated",label:"Generated",embedded:true}});
 try{
  const socket=sockets[0]!;socket.onopen?.();await socket.onmessage!({data:JSON.stringify({type:"ready",title:"Generated",width:320,height:180,allowInput:false,backend,inputCapabilities:{keys:[],text:false,pointerButtons:[],wheel:false}})});await flushPromises();
  expect(viewer.find('[data-shared-desktop-option] input').exists()).toBe(true);
  const option=viewer.get('[data-shared-desktop-option] input');expect((option.element as HTMLInputElement).checked).toBe(false);
  await option.setValue(true);await flushPromises();expect(sockets.length).toBe(2);sockets[1]!.onopen?.();
  expect(sockets[1]!.send.mock.calls.map(([value])=>JSON.parse(value)).find(m=>m.type==="start").options.sharedDesktop).toBe(true);
 }finally{viewer.unmount();}
});

it("keeps the user's shared mode when an explicitly supported virtual screen is selected",async()=>{
 const viewer=mount(RemoteDesktopWindow,{props:{machineId:"generated",label:"Generated",embedded:true}});
 try{
  await sockets[0]!.onmessage!({data:JSON.stringify({type:"shared_virtual_available",enabled:true})});
  await viewer.get('[data-shared-desktop-option] input').setValue(true);await flushPromises();
  await viewer.get('[data-virtual-desktop-option] input').setValue(true);await flushPromises();
  const socket=sockets.at(-1)!;socket.onopen?.();const message=socket.send.mock.calls.map(([value])=>JSON.parse(value)).find(m=>m.type==="start");
  expect(message.options).toMatchObject({sharedDesktop:true,virtualDisplay:true,sharedVirtual:true});expect(message.options).not.toHaveProperty("monitorDevice");expect(message.options).not.toHaveProperty("independentMonitors");
 }finally{viewer.unmount();}
});
it("requests protected ordinary-user files only after availability and accepts the separate proof after protected ready",async()=>{
 const viewer=mount(RemoteDesktopWindow,{props:{machineId:"generated",label:"Generated",embedded:true}});
 try{
  await sockets[0]!.onmessage!({data:JSON.stringify({type:"protected_files_available",enabled:true})});
  const label=viewer.findAll("label").find(l=>l.text()==="管理者権限のアプリ・UAC画面を共有")!;await label.get("input").setValue(true);await flushPromises();const socket=sockets.at(-1)!;socket.onopen?.();
  expect(socket.send.mock.calls.map(([s])=>JSON.parse(s)).find(m=>m.type==="start").options).toMatchObject({elevatedDesktop:true,protectedFiles:true});
  await socket.onmessage!({data:JSON.stringify({type:"ready",title:"Generated",width:320,height:180,allowInput:false,backend:"synthetic",secureDesktop:true,protectedDesktop:"elevated-default"})});await flushPromises();expect(viewer.find('[data-desktop-files]').exists()).toBe(false);
  await socket.onmessage!({data:JSON.stringify({type:"protected_files_ready",files:true,folders:true})});await flushPromises();expect(viewer.find('[data-desktop-protected]').exists()).toBe(true);expect(socket.close).not.toHaveBeenCalled();
 }finally{viewer.unmount();}
});
