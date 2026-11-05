import {expect,it,vi} from "vitest";
import {LocalDesktopRpc} from "./LocalDesktopRpc.js";

it("exposes only desktop capabilities and start, with one source owner per viewer",async()=>{
 const provider={capabilities:vi.fn(()=>({available:false})),endpointScope:vi.fn(),clientGone:vi.fn()};
 const rpc=new LocalDesktopRpc(provider as never,async()=>"http://127.0.0.1:7780","http://127.0.0.1:7780");
 await rpc.hello();expect(await rpc.request("desktop.capabilities",{})).toEqual({available:false});
 await expect(rpc.request("desktop.settings.set",{enabled:true,allowInput:true,allowClipboard:false,allowDisplayResize:false})).rejects.toThrow("許可");
 await expect(rpc.request("desktop.start",{} as never)).rejects.toThrow();expect(provider.endpointScope).not.toHaveBeenCalled();
 rpc.close();rpc.close();expect(provider.clientGone).toHaveBeenCalledTimes(1);
 await expect(rpc.request("desktop.capabilities",{})).rejects.toThrow("終了");
});
it("revokes a pending local source when its viewer disconnects",async()=>{
 let resolve!:(value:{started:true})=>void;
 const scope={start:vi.fn((_owner:string,_params:unknown)=>new Promise<{started:true}>(r=>{resolve=r;})),close:vi.fn()};
 const provider={capabilities:vi.fn(()=>({available:true})),endpointScope:vi.fn(()=>scope),clientGone:vi.fn()};
 const rpc=new LocalDesktopRpc(provider as never,async()=>"http://127.0.0.1:7780","http://127.0.0.1:7780"),pending=rpc.request("desktop.start",{url:"ws://127.0.0.1:7780/desktop-share",ticket:"a".repeat(43),options:{width:320,fps:10,quality:65}});
 const rejection=expect(pending).rejects.toThrow("終了");await vi.waitFor(()=>expect(scope.start).toHaveBeenCalled());rpc.close();resolve({started:true});await rejection;
 expect(scope.close).toHaveBeenCalledOnce();expect(provider.clientGone).toHaveBeenCalledWith(scope.start.mock.calls[0]![0]);
});
it("rejects other destinations and required encrypted endpoints before creating a scope",async()=>{
 const provider={capabilities:vi.fn(()=>({available:true,endpointRequired:false})),endpointScope:vi.fn(),clientGone:vi.fn()};
 const rpc=new LocalDesktopRpc(provider as never,async()=>"http://127.0.0.1:7780","https://public.example");
 const input={url:"ws://127.0.0.1:7781/desktop-share",ticket:"a".repeat(43),options:{width:320,fps:10,quality:65}};
 await expect(rpc.request("desktop.start",input)).rejects.toThrow("接続先");
 provider.capabilities.mockReturnValue({available:true,endpointRequired:true});
 await expect(rpc.request("desktop.start",{...input,url:"ws://127.0.0.1:7780/desktop-share"})).rejects.toThrow("開始");
 expect(provider.endpointScope).not.toHaveBeenCalled();rpc.close();
});
