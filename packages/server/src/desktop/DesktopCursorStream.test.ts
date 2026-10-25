import {expect,it,vi} from "vitest";
import {decodeDesktopCursor,type DesktopCursorInfo} from "@sodashitsu/protocol";
import {DesktopCursorStream} from "./DesktopCursorStream.js";
const info:DesktopCursorInfo={type:"cursor",seq:1,visible:true,x:.5,y:.5,shapeId:1,shape:{kind:4,width:1,height:1,pitch:4,hotspotX:0,hotspotY:0}};
it("resends the current bounded shape after either source or viewer backpressure drops a cursor update",()=>{
 let buffered=0;const packets:Uint8Array[]=[],send=vi.fn((p:Uint8Array)=>{packets.push(p);return true;}),stream=new DesktopCursorStream(send,()=>buffered);
 stream.accept({info,data:new Uint8Array([255,255,255,255])});expect(decodeDesktopCursor(packets[0]!).info.shape).toBeDefined();
 buffered=70000;stream.accept({info:{...info,seq:2,shape:undefined,x:.6},data:new Uint8Array()});expect(packets).toHaveLength(1);
 buffered=0;stream.accept({info:{...info,seq:3,shape:undefined,x:.7},data:new Uint8Array()});expect(decodeDesktopCursor(packets[1]!).info.shape).toBeDefined();
 stream.accept({info:{...info,seq:4,shape:undefined,x:.8},data:new Uint8Array()});expect(decodeDesktopCursor(packets[2]!).info.shape).toBeUndefined();
 stream.accept({info:{...info,seq:2},data:new Uint8Array(4)});expect(packets).toHaveLength(3);
});
it("ignores a pose with an unknown shape and validates bytes before caching, even during congestion",()=>{
 const send=vi.fn(()=>true),stream=new DesktopCursorStream(send,()=>70000);
 expect(()=>stream.accept({info,data:new Uint8Array(1000000)})).toThrow();
 stream.accept({info:{...info,shape:undefined},data:new Uint8Array()});expect(send).not.toHaveBeenCalled();
});

it("forwards a final hidden state even when the display socket is congested",()=>{
 const send=vi.fn((_bytes:Uint8Array)=>true),stream=new DesktopCursorStream(send,()=>100000);
 stream.accept({info:{type:"cursor",seq:1,visible:false,x:0,y:0,shapeId:0},data:new Uint8Array()});
 expect(send).toHaveBeenCalledOnce();expect(decodeDesktopCursor(send.mock.calls[0]![0] as any).info.visible).toBe(false);
});
