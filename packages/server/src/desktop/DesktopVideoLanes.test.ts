import { EventEmitter } from "node:events";
import { performance } from "node:perf_hooks";
import { afterEach, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { DesktopVideoLanes } from "./DesktopVideoLanes.js";
class Socket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: unknown[] = [];
  send(value: unknown) { this.sent.push(value); }
  ping = vi.fn();
  terminate() { if(this.readyState!==WebSocket.CLOSED){this.readyState=WebSocket.CLOSED;this.emit("close");} }
  message(value: unknown, binary=false) { this.emit("message",Buffer.from(typeof value === "string" ? value : JSON.stringify(value)),binary); }
}
const ends: (()=>void)[]=[];
afterEach(()=>{for(const end of ends.splice(0))end();vi.restoreAllMocks();});
function setup() {
  let valid=true;
  const lanes=new DesktopVideoLanes(id=>valid&&id==="session"),receive=vi.fn(),ready=vi.fn(),failed=vi.fn();
  ends.push(()=>lanes.close());
  const pair=lanes.issue("session","https://desktop.example",receive,ready,failed);
  const attach=(role:"provider"|"viewer",session=role==="viewer"?"session":"",origin:string|undefined=role==="viewer"?"https://desktop.example":undefined,ticket=role==="viewer"?pair.viewerTicket:pair.providerTicket)=>{
    const ws=new Socket();lanes.accept(ws as unknown as WebSocket,session,origin);ws.message({type:`video_${role}`,ticket});return ws;
  };
  return {lanes,pair,receive,ready,failed,attach,revoke:()=>{valid=false;lanes.tick();}};
}
it.each(["provider","viewer"] as const)("binds both sockets in either attach order (%s first)",first=>{
  const f=setup(),a=f.attach(first),b=f.attach(first==="viewer"?"provider":"viewer");
  expect(f.ready).toHaveBeenCalledTimes(1);
  const viewer=first==="viewer"?a:b,provider=first==="provider"?a:b;
  provider.message("pixels",true);expect(f.receive).toHaveBeenCalledWith(Buffer.from("pixels"),true);
  expect(f.pair.send(new Uint8Array([1,2]))).toBe(true);expect(viewer.sent).toEqual([new Uint8Array([1,2])]);
  f.lanes.tick();expect(viewer.ping).toHaveBeenCalled();expect(provider.ping).toHaveBeenCalled();
});
it("rejects wrong role, session, origin, replay and unissued tickets without consuming a valid invitation",()=>{
 const f=setup();
 for(const bad of [f.attach("provider","",undefined,f.pair.viewerTicket),f.attach("viewer","other"),f.attach("viewer","session","https://other.example"),f.attach("provider","",undefined,"x".repeat(43))])expect(bad.readyState).toBe(WebSocket.CLOSED);
 const v=f.attach("viewer"),p=f.attach("provider");expect(f.ready).toHaveBeenCalledOnce();
 expect(f.attach("viewer").readyState).toBe(WebSocket.CLOSED);expect(f.attach("provider").readyState).toBe(WebSocket.CLOSED);
 expect(v.readyState).toBe(WebSocket.OPEN);expect(p.readyState).toBe(WebSocket.OPEN);
});
it.each(["revoke","parent","timeout"])("retires unused tickets and attached video when %s ends the parent",reason=>{
 const f=setup(),v=f.attach("viewer");
 if(reason==="revoke")f.revoke();else if(reason==="parent")f.pair.close();else {const now=performance.now();vi.spyOn(performance,"now").mockReturnValue(now+11000);f.lanes.tick();}
 expect(v.readyState).toBe(WebSocket.CLOSED);expect(f.attach("provider").readyState).toBe(WebSocket.CLOSED);
 expect(f.failed).toHaveBeenCalledTimes(reason==="parent"?0:1);
});
it("rejects viewer application messages, closes the pair once, and never routes them to the provider",()=>{
 const f=setup(),v=f.attach("viewer"),p=f.attach("provider");v.message({type:"input",seq:1});
 expect(f.receive).not.toHaveBeenCalled();expect(p.readyState).toBe(WebSocket.CLOSED);expect(f.failed).toHaveBeenCalledOnce();
});
it("bounds video backpressure independently without adding queued frames",()=>{
 const f=setup(),v=f.attach("viewer");f.attach("provider");v.bufferedAmount=512*1024+1;
 expect(f.pair.send(new Uint8Array([1]))).toBe(false);expect(v.sent).toEqual([]);
 f.pair.close();expect(f.pair.send("late")).toBe(false);
});
it("bounds pending unauthenticated attachments and cancels the attach deadline on close",()=>{
 const f=setup();vi.useFakeTimers();ends.push(()=>vi.useRealTimers());
 const sockets=Array.from({length:9},()=>{const s=new Socket();f.lanes.accept(s as unknown as WebSocket,"");return s;});
 expect(f.lanes.pendingCount).toBe(8);expect(sockets[8]!.readyState).toBe(WebSocket.CLOSED);
 vi.advanceTimersByTime(5001);expect(f.lanes.pendingCount).toBe(0);
});
