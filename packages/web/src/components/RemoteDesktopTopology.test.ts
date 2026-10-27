import {mount,flushPromises} from "@vue/test-utils";
import {afterEach,expect,it,vi} from "vitest";
import {encodeDesktopFrame} from "@sodashitsu/protocol";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";

class Socket {
  readyState=1;bufferedAmount=0;binaryType="";
  onopen?:()=>void;
  onmessage?: (event:{data:string|ArrayBuffer})=>Promise<void>;
  send=vi.fn();close=vi.fn();
}
const sockets:Socket[]=[];
vi.mock("../desktop/DesktopEndpointSocket.js",()=>({createDesktopSocketFactory:()=>({encrypted:false,dispose(){},open(){const socket=new Socket();sockets.push(socket);return socket;}})}));
afterEach(()=>{sockets.length=0;vi.unstubAllGlobals();localStorage.clear();});

it.each(["resolve","reject"])("invalidates pending decode %s and queued frames when monitor topology changes",async(outcome)=>{
  let resolve!:(value:ImageBitmap)=>void,reject!:(reason:Error)=>void;
  const bitmap={width:320,height:180,close:vi.fn()} as unknown as ImageBitmap;
  const decode=vi.fn(()=>new Promise<ImageBitmap>((r,j)=>{resolve=r;reject=j;}));
  vi.stubGlobal("createImageBitmap",decode);
  const viewer=mount(RemoteDesktopWindow,{props:{machineId:"generated",label:"Generated B",embedded:true}});
  try{
    const socket=sockets[0]!;
    socket.onopen?.();
    await socket.onmessage!({data:JSON.stringify({type:"ready",title:"Generated",width:320,height:180,allowInput:false,backend:"synthetic"})});
    await flushPromises();expect(viewer.get("[data-desktop-status]").text()).toBe("閲覧中");
    const png=new Uint8Array(24),header=new DataView(png.buffer);
    for(const [offset,value]of[[0,0x89504e47],[4,0x0d0a1a0a],[12,0x49484452],[16,320],[20,180]])header.setUint32(offset!,value!);
    const packet=encodeDesktopFrame({seq:1,width:320,height:180,format:"image/png",captureMs:0,encodeMs:0},png).slice().buffer as ArrayBuffer;
    const pending=socket.onmessage!({data:packet});
    await flushPromises();expect(viewer.find('[role="alert"]').exists()).toBe(false);
    expect(decode).toHaveBeenCalledOnce();
    await socket.onmessage!({data:JSON.stringify({type:"monitor_topology_changed"})});
    // A frame already queued by the browser must not overwrite the topology reason.
    await socket.onmessage!({data:packet});
    if(outcome==="resolve")resolve(bitmap);else reject(new Error("generated delayed decoder failure"));await pending;await flushPromises();
    expect(viewer.get('[role="alert"]').text()).toContain("モニター構成が変更");
    expect(viewer.get("[data-desktop-status]").text()).toBe("停止");
    expect(viewer.get('[aria-label="共有画面"]').attributes("data-rendered-frames")).toBe("0");
    expect(bitmap.close).toHaveBeenCalledTimes(outcome==="resolve"?1:0);
    expect(socket.close).toHaveBeenCalled();
    expect(socket.send.mock.calls.map(([v])=>JSON.parse(v)).filter(v=>v.type==="ack")).toHaveLength(0);
  }finally{viewer.unmount();}
});
