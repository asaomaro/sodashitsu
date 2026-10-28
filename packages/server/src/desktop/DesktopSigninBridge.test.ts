import {expect,it,vi} from "vitest";
import type {WsConnection} from "../ws/WsServer.js";
import {BRIDGE_FRAME as F,encodeBridgeFrame as frame,encodeJson,BRIDGE_MARKER,BridgeFrameDecoder} from "../machine/bridgeFrames.js";
import {DesktopSigninBridge} from "./DesktopSigninBridge.js";

function fixture(accept?:(connection:WsConnection)=>void){
  const sent:Uint8Array[]=[],connections:WsConnection[]=[],abort=new AbortController();let active=true,buffered=0;
  const end=vi.fn();
  const bridge=new DesktopSigninBridge({accept:connection=>{connections.push(connection);accept?.(connection);},send:bytes=>sent.push(bytes),bufferedAmount:()=>buffered,active:()=>active,signal:abort.signal,end});
  return {bridge,sent,connections,abort,end,lose:()=>{active=false;},buffer:(bytes:number)=>{buffered=bytes;},read:()=>new BridgeFrameDecoder({role:"link"}).push(Buffer.concat(sent)),open:(id=1)=>bridge.receive(frame(F.OPEN,id))};
}
it("interoperates with existing bridge frames and arbitrary stream boundaries",()=>{
  const messages:string[]=[],closed:number[]=[];
  const f=fixture(connection=>{connection.onText(text=>{messages.push(text);connection.sendText('{"ok":true}');});connection.onClose(code=>closed.push(code));});
  const input=Buffer.concat([frame(F.OPEN,1),frame(F.TEXT,1,new TextEncoder().encode('日本語')),frame(F.PING,0,new Uint8Array([1,2]))]);
  for(const byte of input)f.bridge.receive(new Uint8Array([byte]));
  expect(messages).toEqual(['日本語']);expect(f.end).not.toHaveBeenCalled();
  const out=f.read();expect(out.map(value=>value.type)).toEqual([F.HELLO,F.TEXT,F.PONG]);expect(new TextDecoder().decode(out[1]!.payload)).toBe('{"ok":true}');
  f.bridge.receive(frame(F.CLOSE,1,encodeJson({code:1000,reason:"generated"})));expect(closed).toEqual([1000]);
  f.bridge.close();expect(f.end).toHaveBeenCalledOnce();
});
it.each(["binary","unknown","oversize-text","oversize-close","oversize-ping","nonempty-open","zero-channel","nonzero-ping","invalid-utf8","unknown-channel","reused-id","decreasing-id"])("rejects %s and revokes existing channels",mode=>{
  const closed=vi.fn();const f=fixture(connection=>connection.onClose(closed));f.open();
  let bytes:Uint8Array;
  const header=(kind:number,id:number,size:number)=>{const b=new Uint8Array(9),v=new DataView(b.buffer);v.setUint8(0,kind);v.setUint32(1,id);v.setUint32(5,size);return b;};
  switch(mode){
    case "binary":bytes=header(F.BINARY,1,1);break;
    case "unknown":bytes=header(255,1,1);break;
    case "oversize-text":bytes=header(F.TEXT,1,16385);break;
    case "oversize-close":bytes=header(F.CLOSE,1,1025);break;
    case "oversize-ping":bytes=header(F.PING,0,65);break;
    case "nonempty-open":bytes=header(F.OPEN,2,1);break;
    case "zero-channel":bytes=header(F.TEXT,0,0);break;
    case "nonzero-ping":bytes=header(F.PING,1,0);break;
    case "invalid-utf8":bytes=frame(F.TEXT,1,new Uint8Array([255]));break;
    case "unknown-channel":bytes=frame(F.TEXT,8,new Uint8Array());break;
    case "reused-id":f.connections[0]!.close(1008,"generated");bytes=frame(F.OPEN,1);break;
    case "decreasing-id":f.open(3);bytes=frame(F.OPEN,2);break;
    default:throw new Error("fixture");
  }
  f.bridge.receive(bytes);expect(f.end).toHaveBeenCalledOnce();expect(closed).toHaveBeenCalled();
  const count=f.sent.length;f.open(100);expect(f.sent).toHaveLength(count);
});
it("bounds simultaneous channels and total channel IDs without retaining closed IDs",()=>{
  const f=fixture();for(let id=1;id<=16;id++)f.open(id);expect(f.connections).toHaveLength(16);f.open(17);expect(f.end).toHaveBeenCalledOnce();
  const g=fixture();for(let id=1;id<=1000;id++){g.open(id);g.connections.at(-1)!.close(1000,"");}expect(g.end).not.toHaveBeenCalled();g.open(1001);expect(g.end).toHaveBeenCalledOnce();
});
it("keeps partial payload bounded and rejects excess chunks before copying",()=>{
  const f=fixture();f.open();const bytes=frame(F.TEXT,1,new Uint8Array(16384));f.bridge.receive(bytes.subarray(0,12));f.bridge.receive(new Uint8Array(32769));expect(f.end).toHaveBeenCalledOnce();
});
it("combines the response frame with the entire socket send budget",()=>{
  const f=fixture();f.open();f.buffer(65536-9);expect(()=>f.connections[0]!.sendText("x")).toThrow("Signin connection is unavailable");f.bridge.close();
});
it.each(["abort","owner"])("synchronously revokes existing channels on %s",mode=>{
  const closed=vi.fn();const f=fixture(connection=>connection.onClose(closed));f.open();
  if(mode==="abort")f.abort.abort();else{f.lose();f.bridge.receive(frame(F.PING,0));}
  expect(f.end).toHaveBeenCalledOnce();expect(closed).toHaveBeenCalledOnce();f.bridge.close();expect(closed).toHaveBeenCalledOnce();
});
it("handles startup abort and synchronous abort during accept without resurrecting channels",()=>{
  const abort=new AbortController();abort.abort();const send=vi.fn(),end=vi.fn();
  const bridge=new DesktopSigninBridge({accept:vi.fn(),send,bufferedAmount:()=>0,active:()=>true,signal:abort.signal,end});expect(send).not.toHaveBeenCalled();expect(end).toHaveBeenCalledOnce();bridge.close();
  let f:ReturnType<typeof fixture>;const closed=vi.fn();f=fixture(connection=>{connection.onClose(closed);f.abort.abort();});f.open();expect(f.end).toHaveBeenCalledOnce();expect(closed).toHaveBeenCalledOnce();
});
it("uses the fixed marker rather than exposing host state",()=>{const f=fixture();expect(Buffer.from(f.sent[0]!).toString()).toBe(BRIDGE_MARKER);expect(f.read()[0]!.payload.length).toBeLessThan(512);f.bridge.close();});
it("never sends after synchronous abort inside the send-budget callback",()=>{
  const abort=new AbortController(),send=vi.fn();let revoke=false,connection!:WsConnection;
  const bridge=new DesktopSigninBridge({accept:value=>{connection=value;},send,bufferedAmount:()=>{if(revoke)abort.abort();return 0;},active:()=>true,signal:abort.signal,end:vi.fn()});
  bridge.receive(frame(F.OPEN,1));expect(send).toHaveBeenCalledTimes(2);revoke=true;
  expect(()=>connection.sendText("generated")).toThrow();expect(send).toHaveBeenCalledTimes(2);bridge.close();
});
