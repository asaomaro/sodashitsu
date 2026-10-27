import {afterEach,expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {DesktopEndpointWire,type DesktopEndpointWireOptions} from "./DesktopEndpointWire.js";
import {DESKTOP_E2E_LANES,DesktopEndpointIdentity,type DesktopE2eLane} from "./DesktopE2e.js";
const wires:DesktopEndpointWire[]=[];
afterEach(()=>{vi.restoreAllMocks();for(const wire of wires)wire.close();wires.length=0;});
const encode=(value:string)=>new TextEncoder().encode(value);
async function fixture(options:{rotateRecords?:number;rotateBytes?:number;providerRotateRecords?:number;providerCrypto?:typeof crypto;concurrentStart?:boolean;badPin?:boolean;role?:"viewer"|"agent";crypto?:typeof crypto}={}) {
 const a=await DesktopEndpointIdentity.create(crypto),b=await DesktopEndpointIdentity.create(crypto),session=randomUUID();
 const leftRaw:(string|Uint8Array)[]=[],rightRaw:(string|Uint8Array)[]=[],leftRecords:{lane:DesktopE2eLane;bytes:Uint8Array}[]=[],rightRecords:{lane:DesktopE2eLane;bytes:Uint8Array}[]=[];
 let leftActive=true,rightActive=true,now=0;
 const leftReady=vi.fn(),rightReady=vi.fn(),leftClose=vi.fn(),rightClose=vi.fn();
 const common={session,crypto:options.crypto??crypto,...(options.rotateRecords===undefined?{}:{rotateRecords:options.rotateRecords}),...(options.rotateBytes===undefined?{}:{rotateBytes:options.rotateBytes}),now:()=>now};
 const left=new DesktopEndpointWire({...common,identity:a,role:options.role??"viewer",peerRole:"provider",expectedFingerprint:options.badPin?"00".repeat(32):await b.fingerprint(),active:()=>leftActive,sendRaw:data=>leftRaw.push(typeof data==="string"?data:data.slice()),onRecord:(lane,bytes)=>leftRecords.push({lane,bytes:bytes.slice()}),onReady:leftReady,onClose:leftClose});
 const right=new DesktopEndpointWire({...common,...(options.providerRotateRecords===undefined?{}:{rotateRecords:options.providerRotateRecords}),crypto:options.providerCrypto??common.crypto,identity:b,role:"provider",peerRole:options.role??"viewer",expectedFingerprint:await a.fingerprint(),active:()=>rightActive,sendRaw:data=>rightRaw.push(typeof data==="string"?data:data.slice()),onRecord:(lane,bytes)=>rightRecords.push({lane,bytes:bytes.slice()}),onReady:rightReady,onClose:rightClose});
 wires.push(left,right);const rightStarting=right.start();if(!options.concurrentStart)await rightStarting;await left.start();
 async function pump(){for(let turns=0;turns<100;turns++){await new Promise(resolve=>setTimeout(resolve,1));if(!leftRaw.length&&!rightRaw.length){await new Promise(resolve=>setTimeout(resolve,5));if(!leftRaw.length&&!rightRaw.length)return;}
  while(leftRaw.length)await right.receive(leftRaw.shift()!);while(rightRaw.length)await left.receive(rightRaw.shift()!);
 }throw Error("Wire failed to quiesce");}
 return {left,right,rightStarting,leftRaw,rightRaw,leftRecords,rightRecords,leftReady,rightReady,leftClose,rightClose,pump,advance:(ms:number)=>{now+=ms;},revokeLeft:()=>{leftActive=false;},revokeRight:()=>{rightActive=false;}};
}
it.each(["viewer","agent"] as const)("authenticates pinned %s and carries every lane in both directions",async role=>{
 const f=await fixture({role});await f.pump();expect(f.leftReady).toHaveBeenCalledTimes(1);expect(f.rightReady).toHaveBeenCalledTimes(1);
 for(const lane of DESKTOP_E2E_LANES){await f.left.send(lane,encode("generated "+lane));await f.right.send(lane,encode("reverse "+lane));}
 expect(f.leftRaw.every(raw=>raw instanceof Uint8Array&&!Buffer.from(raw).includes(Buffer.from("generated")))).toBe(true);
 await f.pump();expect(f.rightRecords.map(row=>[row.lane,new TextDecoder().decode(row.bytes)])).toEqual(DESKTOP_E2E_LANES.map(lane=>[lane,"generated "+lane]));expect(f.leftRecords).toHaveLength(9);
});
it("does not release queued plaintext before the pinned peer proof",async()=>{
 const f=await fixture();const pending=f.left.send("control",encode("private input"));expect(f.leftRaw).toHaveLength(1);expect(typeof f.leftRaw[0]).toBe("string");await f.pump();await pending;expect(f.rightRecords[0]!.bytes).toEqual(encode("private input"));
});
it("rejects a pin mismatch without exposing queued input",async()=>{
 const f=await fixture({badPin:true}),pending=f.left.send("control",encode("do not publish")).catch(()=>{});
 await expect(f.pump()).rejects.toThrow();await pending;expect(f.leftReady).not.toHaveBeenCalled();expect(f.leftClose).toHaveBeenCalledTimes(1);expect(f.rightRecords).toEqual([]);expect(f.leftRaw.every(raw=>typeof raw==="string")).toBe(true);
});
it.each(["provider","viewer"] as const)("rotates before the record limit for %s traffic without restarting the application",async sender=>{
 const f=await fixture({rotateRecords:2});await f.pump();const wire=sender==="provider"?f.right:f.left;
 for(let n=0;n<8;n++){const sending=wire.send("video",encode("frame"+n));await f.pump();await sending;}
 expect((sender==="provider"?f.leftRecords:f.rightRecords).map(row=>new TextDecoder().decode(row.bytes))).toEqual(Array.from({length:8},(_,n)=>"frame"+n));expect(f.leftReady).toHaveBeenCalledTimes(1);expect(f.rightReady).toHaveBeenCalledTimes(1);expect(f.leftClose).not.toHaveBeenCalled();expect(f.rightClose).not.toHaveBeenCalled();
});
it("rotates a byte budget while unrelated lanes preserve their order",async()=>{
 const f=await fixture({rotateBytes:5});await f.pump();
 for(let n=0;n<4;n++){const p=f.right.send(n%2?"control":"image",encode("pixels"+n));await f.pump();await p;}
 expect(f.leftRecords.map(row=>new TextDecoder().decode(row.bytes))).toEqual(["pixels0","pixels1","pixels2","pixels3"]);
});
it("discards old-generation ciphertext after a rekey",async()=>{
 const f=await fixture({rotateRecords:2});await f.pump();await f.left.send("audio",encode("first"));const old=(f.leftRaw[0] as Uint8Array).slice();await f.pump();const p=f.left.send("audio",encode("second"));await f.pump();await p;
 await expect(f.right.receive(old)).rejects.toThrow();expect(f.rightClose).toHaveBeenCalledTimes(1);expect(f.rightRecords).toHaveLength(2);
});
it("stops on tampering before publishing application bytes",async()=>{
 const f=await fixture();await f.pump();await f.left.send("control",encode("input"));const raw=f.leftRaw.shift() as Uint8Array;raw[raw.length-1]!^=1;await expect(f.right.receive(raw)).rejects.toThrow();expect(f.rightRecords).toEqual([]);expect(f.rightClose).toHaveBeenCalledTimes(1);
});
it("does not accept a raw hello as authenticated liveness",async()=>{
 const f=await fixture();await f.pump();f.advance(60000);f.right.poll();expect(f.rightClose).toHaveBeenCalledTimes(1);
});
it("uses encrypted ping and pong without delivering them to the application",async()=>{
 const f=await fixture();await f.pump();f.advance(21000);f.left.poll();f.right.poll();await f.pump();f.advance(40000);f.left.poll();f.right.poll();expect(f.leftClose).not.toHaveBeenCalled();expect(f.rightClose).not.toHaveBeenCalled();expect(f.leftRecords).toEqual([]);expect(f.rightRecords).toEqual([]);
});
it("bounds a stalled initial handshake and an unfinished rotation",async()=>{
 const f=await fixture({rotateRecords:1});f.advance(15000);f.right.poll();expect(f.rightClose).toHaveBeenCalledTimes(1);
 const g=await fixture({rotateRecords:1});await g.pump();await g.right.send("image",encode("frame"));await new Promise(resolve=>setTimeout(resolve,10));g.advance(15000);g.right.poll();expect(g.rightClose).toHaveBeenCalledTimes(1);
});
it("fails closed when the owner permit or source epoch is revoked",async()=>{
 const f=await fixture();await f.pump();f.revokeLeft();await expect(f.left.send("microphone",encode("pcm"))).rejects.toThrow();expect(f.leftClose).toHaveBeenCalledTimes(1);expect(f.leftRaw).toEqual([]);
 f.revokeRight();f.right.poll();expect(f.rightClose).toHaveBeenCalledTimes(1);
});
it("bounds queued data before a peer authenticates",async()=>{
 const f=await fixture(),pending=Array.from({length:8},()=>f.left.send("files",encode("data")).catch(()=>{}));await expect(f.left.send("files",encode("overflow"))).rejects.toThrow();await Promise.all(pending);expect(f.left.bufferedAmount).toBe(0);expect(f.leftClose).toHaveBeenCalledTimes(1);
});
it("rejects oversized input and role confusion",async()=>{
 const f=await fixture();await expect(f.left.receive(new Uint8Array(4*1024*1024+1))).rejects.toThrow();expect(f.leftClose).toHaveBeenCalledTimes(1);
 expect(()=>new DesktopEndpointWire({role:"viewer",peerRole:"agent"} as DesktopEndpointWireOptions)).toThrow();
});
it("checks the owner again after an asynchronous encrypt completes",async()=>{
 const f=await fixture();await f.pump();
 const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);let resume!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{resume=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});
 vi.spyOn(crypto.subtle,"encrypt").mockImplementation(async(...args)=>{const result=await encrypt(...args);started();await gate;return result;});
 const pending=f.left.send("control",encode("late input"));await begun;f.revokeLeft();resume();await expect(pending).rejects.toThrow();expect(f.leftRaw).toEqual([]);expect(f.leftClose).toHaveBeenCalledTimes(1);
});
it("suppresses a completed decrypt when its source epoch changes",async()=>{
 const f=await fixture();await f.pump();await f.left.send("clipboard",encode("private clipboard"));
 const decrypt=crypto.subtle.decrypt.bind(crypto.subtle);let resume!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{resume=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});
 vi.spyOn(crypto.subtle,"decrypt").mockImplementation(async(...args)=>{const result=await decrypt(...args);started();await gate;return result;});
 const pending=f.right.receive(f.leftRaw.shift()!);await begun;f.revokeRight();resume();await expect(pending).rejects.toThrow();expect(f.rightRecords).toEqual([]);expect(f.rightClose).toHaveBeenCalledTimes(1);
});
it("bounds received ciphertext while a decrypt is stalled and clears queued plaintext on close",async()=>{
 const f=await fixture();await f.pump();await f.left.send("image",encode("generated image"));const packet=f.leftRaw.shift()!;
 const decrypt=crypto.subtle.decrypt.bind(crypto.subtle);let resume!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{resume=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});
 vi.spyOn(crypto.subtle,"decrypt").mockImplementation(async(...args)=>{started();await gate;return decrypt(...args);});
 const pending=[f.right.receive(packet).catch(()=>{})];await begun;
 for(let n=0;n<7;n++)pending.push(f.right.receive(packet).catch(()=>{}));
 await expect(f.right.receive(packet)).rejects.toThrow();expect(f.rightClose).toHaveBeenCalledTimes(1);resume();await Promise.all(pending);expect(f.rightRecords).toEqual([]);
});
it("rejects unsigned rotation control from a viewer",async()=>{
 const f=await fixture();await f.pump();await expect(f.right.receive(JSON.stringify({type:"rotate",hello:{generation:2}}))).rejects.toThrow();expect(f.rightClose).toHaveBeenCalledTimes(1);
});
it("serializes an in-flight old generation seal before the rotation reply",async()=>{
 const f=await fixture({rotateRecords:2});await f.pump();await f.right.send("video",encode("frame0"));await f.pump();
 const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);let resume!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{resume=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});
 const spy=vi.spyOn(crypto.subtle,"encrypt").mockImplementation(async(...args)=>{const result=await encrypt(...args);started();await gate;return result;});
 const pending=f.left.send("control",encode("old input"));await begun;spy.mockRestore();
 await f.right.send("video",encode("frame1"));await new Promise(resolve=>setTimeout(resolve,10));
 const frame=f.rightRaw.shift()!,rotate=f.rightRaw.shift()!;await f.left.receive(frame);
 const rotation=f.left.receive(rotate);await new Promise(resolve=>setTimeout(resolve,5));expect(f.leftRaw).toEqual([]);
 resume();await pending;await rotation;expect(f.leftRaw[0]).toBeInstanceOf(Uint8Array);expect(JSON.parse(f.leftRaw[1] as string).type).toBe("hello");
 await f.pump();expect(f.rightRecords[0]!.bytes).toEqual(encode("old input"));
 const next=f.left.send("control",encode("new input"));await f.pump();await next;expect(f.rightRecords[1]!.bytes).toEqual(encode("new input"));expect(f.leftClose).not.toHaveBeenCalled();expect(f.rightClose).not.toHaveBeenCalled();
});
it("accepts a viewer hello while the provider's initial key generation is pending",async()=>{
 let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;});
 const subtle=new Proxy(crypto.subtle,{get(target,key){if(key==="generateKey")return async(...args:Parameters<typeof target.generateKey>)=>{await gate;return target.generateKey(...args);};const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
 const delayed=new Proxy(crypto,{get(target,key){if(key==="subtle")return subtle;const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
 const f=await fixture({providerCrypto:delayed,concurrentStart:true});let received=false;
 const pending=f.right.receive(f.leftRaw.shift()!).then(()=>{received=true;});await new Promise(resolve=>setTimeout(resolve,5));expect(received).toBe(false);expect(f.rightClose).not.toHaveBeenCalled();
 resume();await f.rightStarting;await pending;await f.pump();expect(f.leftReady).toHaveBeenCalledTimes(1);expect(f.rightReady).toHaveBeenCalledTimes(1);
});
it("requests an authenticated rekey when the viewer's budget is lower than the provider's",async()=>{
 const f=await fixture({rotateRecords:2,providerRotateRecords:20});await f.pump();
 for(let n=0;n<6;n++){const pending=f.left.send("image",encode("image"+n));await f.pump();await pending;}
 expect(f.rightRecords.map(row=>new TextDecoder().decode(row.bytes))).toEqual(Array.from({length:6},(_,n)=>"image"+n));expect(f.leftClose).not.toHaveBeenCalled();expect(f.rightClose).not.toHaveBeenCalled();
});
it("expires a local rekey wait even while old-key authenticated data keeps arriving",async()=>{
 const f=await fixture({rotateRecords:1,providerRotateRecords:20});await f.pump();await f.left.send("image",encode("image"));
 await f.right.send("video",encode("old frame"));await f.left.receive(f.rightRaw.shift()!);
 f.advance(14000);await f.right.send("video",encode("old frame2"));await f.left.receive(f.rightRaw.shift()!);expect(f.leftClose).not.toHaveBeenCalled();
 f.advance(1000);f.left.poll();expect(f.leftClose).toHaveBeenCalledTimes(1);
});
it("keeps the original deadline when the provider's rotate arrives near its end",async()=>{
 const f=await fixture({rotateRecords:1,providerRotateRecords:20});await f.pump();await f.left.send("image",encode("image"));
 await new Promise(resolve=>setTimeout(resolve,5));while(f.leftRaw.length)await f.right.receive(f.leftRaw.shift()!);
 await new Promise(resolve=>setTimeout(resolve,10));expect(JSON.parse(f.rightRaw[0] as string).type).toBe("rotate");
 f.advance(14000);await f.left.receive(f.rightRaw.shift()!);expect(f.leftClose).not.toHaveBeenCalled();f.advance(1000);f.left.poll();expect(f.leftClose).toHaveBeenCalledTimes(1);
});
it("keeps a peer-initiated deadline when a delayed old seal reaches its local limit",async()=>{
 const f=await fixture({rotateRecords:1});await f.pump();
 const encrypt=crypto.subtle.encrypt.bind(crypto.subtle);let resume!:()=>void,started!:()=>void;
 const gate=new Promise<void>(resolve=>{resume=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;});
 const spy=vi.spyOn(crypto.subtle,"encrypt").mockImplementation(async(...args)=>{const result=await encrypt(...args);started();await gate;return result;});
 const pending=f.left.send("control",encode("old input"));await begun;spy.mockRestore();await f.right.send("video",encode("frame"));await new Promise(resolve=>setTimeout(resolve,10));
 await f.left.receive(f.rightRaw.shift()!);const rotating=f.left.receive(f.rightRaw.shift()!);await new Promise(resolve=>setTimeout(resolve,5));f.advance(14000);resume();await pending;await rotating;
 f.advance(1000);f.left.poll();expect(f.leftClose).toHaveBeenCalledTimes(1);
});
it("rejects a late asynchronous start even if the timer callback has not run",async()=>{
 let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;});
 const subtle=new Proxy(crypto.subtle,{get(target,key){if(key==="generateKey")return async(...args:Parameters<typeof target.generateKey>)=>{await gate;return target.generateKey(...args);};const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
 const delayed=new Proxy(crypto,{get(target,key){if(key==="subtle")return subtle;const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;}});
 const f=await fixture({providerCrypto:delayed,concurrentStart:true});f.advance(15000);resume();await expect(f.rightStarting).rejects.toThrow();expect(f.rightClose).toHaveBeenCalledTimes(1);expect(f.rightReady).not.toHaveBeenCalled();expect(f.rightRaw).toEqual([]);
});
