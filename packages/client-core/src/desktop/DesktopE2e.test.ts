import {expect,it,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {DESKTOP_E2E_LANES,DesktopEndpointHandshake,DesktopEndpointIdentity,DesktopReplayWindow} from "./DesktopE2e.js";
const crypto=globalThis.crypto;
const data=new TextEncoder().encode("generated remote desktop pixels / 音声 / input");
async function pair(){
 const a=await DesktopEndpointIdentity.create(crypto),b=await DesktopEndpointIdentity.create(crypto),session=randomUUID();
 const ah=await DesktopEndpointHandshake.create(crypto,a,{session,role:"viewer",peerRole:"provider",generation:7,expectedFingerprint:await b.fingerprint()}),bh=await DesktopEndpointHandshake.create(crypto,b,{session,role:"provider",peerRole:"viewer",generation:7,expectedFingerprint:await a.fingerprint()});
 const ap=await ah.proof(bh.hello),bp=await bh.proof(ah.hello);
 return {a,b,ah,bh,ap,bp,left:await ah.finish(bh.hello,bp),right:await bh.finish(ah.hello,ap)};
}
it("round trips all lanes with separate directions and opaque packets",async()=>{
 const f=await pair(),ciphertexts=new Set<string>();
 try{for(const lane of DESKTOP_E2E_LANES){const packet=await f.left.seal(lane,data);expect(Buffer.from(packet).includes(Buffer.from(data))).toBe(false);ciphertexts.add(Buffer.from(packet.subarray(46,46+data.length)).toString("hex"));expect(await f.right.open(lane,packet)).toEqual(data);const reverse=await f.right.seal(lane,data);ciphertexts.add(Buffer.from(reverse.subarray(46,46+data.length)).toString("hex"));expect(Buffer.from(reverse).equals(Buffer.from(packet))).toBe(false);expect(await f.left.open(lane,reverse)).toEqual(data);}expect(ciphertexts.size).toBe(DESKTOP_E2E_LANES.length*2);}
 finally{f.left.close();f.right.close();}
});
it.each(["header","ciphertext","tag"])("rejects %s tampering without consuming the authentic counter",async kind=>{
 const f=await pair();try{const packet=await f.left.seal("image",data),damaged=packet.slice();damaged[kind==="header"?14:kind==="ciphertext"?46:damaged.length-1]!^=1;await expect(f.right.open("image",damaged)).rejects.toThrow("authentication");expect(await f.right.open("image",packet)).toEqual(data);}finally{f.left.close();f.right.close();}
});
it("rejects lane/direction confusion, duplicate delivery and concurrent replays",async()=>{
 const f=await pair();try{const packet=await f.left.seal("files",data);await expect(f.left.open("files",packet)).rejects.toThrow();await expect(f.right.open("clipboard",packet)).rejects.toThrow();const outcomes=await Promise.allSettled([f.right.open("files",packet),f.right.open("files",packet)]);expect(outcomes.filter(value=>value.status==="fulfilled")).toHaveLength(1);await expect(f.right.open("files",packet)).rejects.toThrow();}finally{f.left.close();f.right.close();}
});
it("preserves order for input/bulk/agent but accepts reordered authenticated UDP video",async()=>{
 const f=await pair();try{for(const lane of ["control","files","agent","microphone"] as const){const one=await f.left.seal(lane,data),two=await f.left.seal(lane,data);await expect(f.right.open(lane,two)).rejects.toThrow();expect(await f.right.open(lane,one)).toEqual(data);expect(await f.right.open(lane,two)).toEqual(data);}const one=await f.left.seal("video",data),two=await f.left.seal("video",data);expect(await f.right.open("video",two)).toEqual(data);expect(await f.right.open("video",one)).toEqual(data);}finally{f.left.close();f.right.close();}
});
it("forgets a replay after the bounded UDP window while accepting unseen in-window packets",()=>{
 const window=new DesktopReplayWindow();expect(window.accept(1)).toBe(true);expect(window.accept(65)).toBe(true);expect(window.accepts(1)).toBe(false);expect(window.accept(64)).toBe(true);expect(window.accept(64)).toBe(false);expect(window.accept(0)).toBe(false);expect(window.accept(1048577)).toBe(false);expect(window.accept(NaN)).toBe(false);
});
it("cannot reuse a completed handshake or a packet from another session",async()=>{
 const f=await pair(),g=await pair();try{await expect(f.ah.finish(f.bh.hello,f.bp)).rejects.toThrow();const packet=await f.left.seal("image",data);await expect(g.right.open("image",packet)).rejects.toThrow();}finally{f.left.close();f.right.close();g.left.close();g.right.close();}
});
it("requires an independently pinned fingerprint even for a valid signature",async()=>{
 const a=await DesktopEndpointIdentity.create(crypto),b=await DesktopEndpointIdentity.create(crypto),session=randomUUID(),ah=await DesktopEndpointHandshake.create(crypto,a,{session,role:"viewer",peerRole:"provider",generation:1,expectedFingerprint:"00".repeat(32)}),bh=await DesktopEndpointHandshake.create(crypto,b,{session,role:"provider",peerRole:"viewer",generation:1,expectedFingerprint:await a.fingerprint()});await expect(ah.finish(bh.hello,await bh.proof(ah.hello))).rejects.toThrow("authentication");
});
it.each(["nonce","ephemeral","identity","session","generation","role"])("binds both peers' %s to the signature transcript",async field=>{
 const a=await DesktopEndpointIdentity.create(crypto),b=await DesktopEndpointIdentity.create(crypto),session=randomUUID(),ah=await DesktopEndpointHandshake.create(crypto,a,{session,role:"viewer",peerRole:"provider",generation:1,expectedFingerprint:await b.fingerprint()}),bh=await DesktopEndpointHandshake.create(crypto,b,{session,role:"provider",peerRole:"viewer",generation:1,expectedFingerprint:await a.fingerprint()});const proof=await bh.proof(ah.hello),changed={...bh.hello};
 if(field==="nonce")changed.nonce="00".repeat(32);if(field==="ephemeral")changed.ephemeral=ah.hello.ephemeral;if(field==="identity")changed.identity=a.publicKey;if(field==="session")changed.session=randomUUID();if(field==="generation")changed.generation=2;if(field==="role")changed.role="agent";await expect(ah.finish(changed,proof)).rejects.toThrow("authentication");
});
it("restores only a matching identity pair and clears the temporary persisted secret",async()=>{
 let persisted!:Uint8Array,original!:Uint8Array;const a=await DesktopEndpointIdentity.create(crypto,async(secret)=>{persisted=secret.slice();original=secret;});expect(original.every(value=>value===0)).toBe(true);const restored=await DesktopEndpointIdentity.restore(crypto,persisted,a.publicKey);expect(await restored.fingerprint()).toBe(await a.fingerprint());const other=await DesktopEndpointIdentity.create(crypto);await expect(DesktopEndpointIdentity.restore(crypto,persisted,other.publicKey)).rejects.toThrow();expect(JSON.stringify(a)).not.toContain(Buffer.from(persisted).toString("hex"));persisted.fill(0);
});
it("drops queued crypto results and rejects every lane after close",async()=>{
 const f=await pair();const packet=await f.left.seal("image",data),pending=f.right.open("image",packet);f.right.close();await expect(pending).rejects.toThrow();for(const lane of DESKTOP_E2E_LANES)await expect(f.right.seal(lane,data)).rejects.toThrow();f.left.close();
});
it("snapshots mutable input and serializes concurrent sealing within one lane",async()=>{
 const f=await pair();try{const original=data.slice(),one=f.left.seal("control",original),two=f.left.seal("control",data);original.fill(0);const [p1,p2]=await Promise.all([one,two]);expect(new DataView(p1.buffer).getUint32(10)).toBe(1);expect(new DataView(p2.buffer).getUint32(10)).toBe(2);expect(Buffer.from(p1.subarray(46,46+data.length)).equals(Buffer.from(p2.subarray(46,46+data.length)))).toBe(false);expect(await f.right.open("control",p1)).toEqual(data);expect(await f.right.open("control",p2)).toEqual(data);}finally{f.left.close();f.right.close();}
});

it("queues concurrent ordered decrypts without losing valid later packets",async()=>{
 const f=await pair();try{const packets=[];for(let i=0;i<4;i++)packets.push(await f.left.seal("control",data));const results=await Promise.all(packets.map(packet=>f.right.open("control",packet)));expect(results).toEqual([data,data,data,data]);}finally{f.left.close();f.right.close();}
});
it("bounds receiving before payload access and reserves duplicate counters during blocked crypto",async()=>{
 const f=await pair(),packets=[];for(let i=0;i<9;i++)packets.push(await f.left.seal("control",data));
 const original=crypto.subtle.decrypt.bind(crypto.subtle);let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;}),started=vi.spyOn(crypto.subtle,"decrypt").mockImplementation(async(...args)=>{await gate;return original(...args);});
 const opening=[f.right.open("control",packets[0]!)];
 try{
  await vi.waitFor(()=>expect(started).toHaveBeenCalledTimes(1));const duplicate=f.right.open("control",packets[0]!);expect(await Promise.race([duplicate.then(()=>"accepted",()=>"rejected"),new Promise<string>(resolve=>setTimeout(()=>resolve("pending"),50))])).toBe("rejected");
  for(let i=1;i<8;i++)opening.push(f.right.open("control",packets[i]!));
  const overflow=f.right.open("control",packets[8]!);expect(await Promise.race([overflow.then(()=>"accepted",()=>"rejected"),new Promise<string>(resolve=>setTimeout(()=>resolve("pending"),50))])).toBe("rejected");
  const unreadable={length:64,get buffer(){throw Error("Payload accessed before bounded admission");}} as unknown as Uint8Array;await expect(f.right.open("control",unreadable)).rejects.toThrow("authentication");expect(started).toHaveBeenCalledTimes(1);
 }finally{resume();await Promise.allSettled(opening);started.mockRestore();f.left.close();f.right.close();}
});
it("cancels a pending handshake and closes a session already returned by that handshake",async()=>{
 const a=await DesktopEndpointIdentity.create(crypto),b=await DesktopEndpointIdentity.create(crypto),session=randomUUID(),ah=await DesktopEndpointHandshake.create(crypto,a,{session,role:"viewer",peerRole:"provider",generation:1,expectedFingerprint:await b.fingerprint()}),bh=await DesktopEndpointHandshake.create(crypto,b,{session,role:"provider",peerRole:"viewer",generation:1,expectedFingerprint:await a.fingerprint()}),bp=await bh.proof(ah.hello),finishing=ah.finish(bh.hello,bp);ah.close();await expect(finishing).rejects.toThrow("authentication");
 const f=await pair();f.ah.close();await expect(f.left.seal("image",data)).rejects.toThrow();f.bh.close();await expect(f.right.seal("image",data)).rejects.toThrow();
});

it("enforces the receive byte budget before its record-count budget",async()=>{
 const f=await pair(),large=new Uint8Array(4*1024*1024-46-16),packet=await f.left.seal("video",large),original=crypto.subtle.decrypt.bind(crypto.subtle);let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;}),started=vi.spyOn(crypto.subtle,"decrypt").mockImplementation(async(...args)=>{await gate;return original(...args);}),pending:Promise<Uint8Array>[]=[];
 try{
  for(let seq=1;seq<=4;seq++){const next=packet.slice();new DataView(next.buffer).setUint32(10,seq);pending.push(f.right.open("video",next));}
  await vi.waitFor(()=>expect(started).toHaveBeenCalledTimes(4));const fifth=packet.slice();new DataView(fifth.buffer).setUint32(10,5);await expect(f.right.open("video",fifth)).rejects.toThrow("authentication");expect(started).toHaveBeenCalledTimes(4);
 }finally{resume();await Promise.allSettled(pending);started.mockRestore();f.left.close();f.right.close();}
});
it("does not publish a delayed proof after handshake cancellation",async()=>{
 const a=await DesktopEndpointIdentity.create(crypto),b=await DesktopEndpointIdentity.create(crypto),session=randomUUID(),ah=await DesktopEndpointHandshake.create(crypto,a,{session,role:"viewer",peerRole:"provider",generation:1,expectedFingerprint:await b.fingerprint()}),bh=await DesktopEndpointHandshake.create(crypto,b,{session,role:"provider",peerRole:"viewer",generation:1,expectedFingerprint:await a.fingerprint()}),original=a.sign.bind(a);let resume!:()=>void;const gate=new Promise<void>(resolve=>{resume=resolve;}),sign=vi.spyOn(a,"sign").mockImplementation(async bytes=>{await gate;return original(bytes);});
 try{const proof=ah.proof(bh.hello);ah.close();resume();await expect(proof).rejects.toThrow("authentication");}finally{resume();sign.mockRestore();ah.close();bh.close();}
});

it("zeros a completed decrypt whose publication races session close",async()=>{
 const f=await pair(),packet=await f.left.seal("image",data),original=crypto.subtle.decrypt.bind(crypto.subtle);let resume!:()=>void,started!:()=>void,result!:ArrayBuffer;const gate=new Promise<void>(resolve=>{resume=resolve;}),begun=new Promise<void>(resolve=>{started=resolve;}),spy=vi.spyOn(crypto.subtle,"decrypt").mockImplementation(async(...args)=>{result=await original(...args);started();await gate;return result;});
 try{const opening=f.right.open("image",packet);await begun;f.right.close();resume();await expect(opening).rejects.toThrow("authentication");expect(new Uint8Array(result).every(value=>value===0)).toBe(true);}finally{resume();spy.mockRestore();f.left.close();f.right.close();}
});
