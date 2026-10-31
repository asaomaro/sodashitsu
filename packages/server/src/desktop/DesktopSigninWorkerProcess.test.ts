import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import {afterEach,expect,it,vi} from "vitest";
import {decodeDesktopFrame} from "@sodashitsu/protocol";
import {DesktopSigninWorkerProcess,type DesktopSigninWorkerDependencies} from "./DesktopSigninWorkerProcess.js";
const ready={type:"ready",title:"generated",allowInput:true,width:1,height:1,backend:"windows-gdi",secureDesktop:true,imeKeys:true,extendedInput:true};
const png="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHfoAAAAASUVORK5CYII=";
const image=(seq=1)=>({type:"frame",info:{seq,width:1,height:1,format:"image/png",captureMs:1,encodeMs:1},data:png});
class Child extends EventEmitter {stdin=new PassThrough();stdout=new PassThrough();stderr=new PassThrough();kill=vi.fn(()=>true);}
const processes:DesktopSigninWorkerProcess[]=[];
afterEach(()=>{for(const process of processes)process.close();processes.length=0;vi.useRealTimers();});
function fixture(control=true){
  let now=0,active=true,onActive:(()=>void)|undefined;
  const child=new Child(),abort=new AbortController(),records:{bytes:Uint8Array;binary:boolean}[]=[],closed=vi.fn(),unsafeStop=vi.fn();
  const spawn=vi.fn<DesktopSigninWorkerDependencies["spawn"]>(()=>child as unknown as ReturnType<DesktopSigninWorkerDependencies["spawn"]>);
  const process=new DesktopSigninWorkerProcess({control,settings:{width:1280,fps:10,quality:65},active:()=>{onActive?.();return active;},signal:abort.signal,record:(bytes,binary)=>records.push({bytes:new Uint8Array(bytes),binary}),closed},{platform:"win32",now:()=>now,spawn,unsafeStop});processes.push(process);
  return {process,child,abort,spawn,records,closed,unsafeStop,onCheck:(callback:()=>void)=>{onActive=callback;},clock:(value:number)=>{now=value;},lose:()=>{active=false;},output:(message:unknown)=>child.stdout.write(Buffer.from(JSON.stringify(message)+"\n")),finish:()=>{child.stdout.write(Buffer.from('{"type":"signin_stopped"}\n'));child.emit("close",0);}};
}
it("spawns only the fixed installed broker with pipes and a bounded explicit configuration",()=>{
  const f=fixture();const [command,args,options]=f.spawn.mock.calls[0]!;
  expect(command).toMatch(/DesktopSigninNative\.exe$/);expect(args).toEqual(["--broker","input"]);expect(options.stdio).toEqual(["pipe","pipe","pipe"]);expect(options.shell).toBeUndefined();
  expect(Object.keys(options.env??{}).every(key=>["SystemRoot","windir","PATH","TEMP","TMP"].includes(key))).toBe(true);
  expect(f.child.stdin.read().toString()).toBe('{"type":"configure","width":1280,"fps":10,"quality":65}\n');f.finish();expect(f.unsafeStop).not.toHaveBeenCalled();
});
it("validates real encoded pixels and permits only a displayed frame and monotonic input",async()=>{
  const f=fixture();f.output(ready);f.output(image());expect(f.records).toHaveLength(2);expect(decodeDesktopFrame(f.records[1]!.bytes).info.seq).toBe(1);
  f.process.send({type:"ack",seq:1});f.process.send({type:"control",enabled:true});f.process.send({type:"input",seq:1,frameSeq:1,input:{kind:"key",code:"Space",down:true}});expect(f.closed).not.toHaveBeenCalled();
  f.output({type:"input_ack",seq:1});expect(f.records).toHaveLength(3);f.process.close();expect(f.child.stdin.destroyed).toBe(true);f.finish();await expect(f.process.settled()).resolves.toBeUndefined();expect(f.unsafeStop).not.toHaveBeenCalled();
});
it.each(["input-before-frame","future-ack","replay","unsupported-command","wrong-ready","second-frame","bad-pixels","extra-ready-field"])("rejects %s without arbitrary native instructions",mode=>{
  const f=fixture();
  if(mode==="wrong-ready")f.output({...ready,allowInput:false});else if(mode==="extra-ready-field")f.output({...ready,files:true});else{
    f.output(ready);
    if(mode==="input-before-frame")f.process.send({type:"input",seq:1,frameSeq:1,input:{kind:"key",code:"Space",down:true}});
    if(mode==="future-ack")f.process.send({type:"ack",seq:2});
    if(mode==="unsupported-command")f.process.send({type:"sas"});
    if(mode==="bad-pixels")f.output({...image(),data:"aGVsbG8="});
    if(mode==="second-frame"){f.output(image());f.output(image(2));}
    if(mode==="replay"){f.output(image());f.process.send({type:"ack",seq:1});f.process.send({type:"input",seq:1,frameSeq:1,input:{kind:"key",code:"Space",down:true}});f.process.send({type:"input",seq:1,frameSeq:1,input:{kind:"key",code:"Space",down:true}});}
  }
  expect(f.closed).toHaveBeenCalledOnce();f.finish();
});
it("never upgrades a view-only native worker to input",()=>{const f=fixture(false);expect(f.spawn.mock.calls[0]![1]).toEqual(["--broker","view"]);f.output({...ready,allowInput:false});f.process.send({type:"control",enabled:true});expect(f.closed).toHaveBeenCalledOnce();f.finish();});
it.each(["exit0-without-proof","exit1-with-proof","trailing-data"])("requires terminal proof plus exit0 on %s",async mode=>{
  const f=fixture();if(mode!=="exit0-without-proof")f.output({type:"signin_stopped"});if(mode==="trailing-data")f.output({type:"frame",private:"generated"});f.child.emit("close",mode==="exit1-with-proof"?1:0);
  await expect(f.process.settled()).rejects.toThrow("Signin worker is unavailable");expect(f.unsafeStop).toHaveBeenCalledOnce();f.child.emit("close",0);expect(f.unsafeStop).toHaveBeenCalledOnce();
});
it("terminates the dedicated owner if teardown is not confirmed within eight seconds",async()=>{
  vi.useFakeTimers();const f=fixture();f.process.close();await vi.advanceTimersByTimeAsync(8000);await expect(f.process.settled()).rejects.toThrow();expect(f.child.kill).toHaveBeenCalledOnce();expect(f.unsafeStop).toHaveBeenCalledOnce();
});
it("checks ready/lifetime deadlines before timer callbacks and rejects data after owner loss",()=>{
  vi.useFakeTimers();const f=fixture();f.clock(10000);f.output(ready);expect(f.records).toHaveLength(0);expect(f.closed).toHaveBeenCalledOnce();f.finish();
  const g=fixture();g.output(ready);g.clock(120000);g.process.send({type:"heartbeat"});expect(g.closed).toHaveBeenCalledOnce();g.finish();
  const h=fixture();h.lose();h.output(ready);expect(h.records).toHaveLength(0);h.finish();
});
it("handles fragmented unicode and rejects an oversized incomplete native record",()=>{
  const f=fixture();const bytes=Buffer.from(JSON.stringify({...ready,title:"生成"})+"\n");for(const byte of bytes)f.child.stdout.write(Buffer.from([byte]));expect(f.records).toHaveLength(1);expect(JSON.parse(Buffer.from(f.records[0]!.bytes).toString()).title).toBe("生成");
  f.child.stdout.write(Buffer.alloc(3000001,97));expect(f.closed).toHaveBeenCalledOnce();f.finish();
});
it("survives synchronous owner abort during native spawn without writing configuration",async()=>{
  const child=new Child(),abort=new AbortController(),unsafeStop=vi.fn(),closed=vi.fn();
  const process=new DesktopSigninWorkerProcess({control:false,settings:{width:1280,fps:10,quality:65},active:()=>true,signal:abort.signal,record:vi.fn(),closed},{platform:"win32",now:()=>0,spawn:()=>{abort.abort();return child as never;},unsafeStop});processes.push(process);
  expect(child.stdin.read()).toBeNull();expect(child.stdin.destroyed).toBe(true);expect(closed).toHaveBeenCalledOnce();child.stdout.write(Buffer.from('{"type":"signin_stopped"}\n'));child.emit("close",0);await expect(process.settled()).resolves.toBeUndefined();
});
it("rejects a stop marker followed by an incomplete UTF8 byte in the same chunk",async()=>{
  const f=fixture();f.child.stdout.write(Buffer.concat([Buffer.from('{"type":"signin_stopped"}\n'),Buffer.from([0xc2])]));f.child.emit("close",0);
  await expect(f.process.settled()).rejects.toThrow("Signin worker is unavailable");expect(f.unsafeStop).toHaveBeenCalledOnce();
});
it.each(["unissued","duplicate","quota"])("bounds native input acknowledgements on %s",mode=>{
  const f=fixture();f.output(ready);f.output(image());f.process.send({type:"ack",seq:1});
  const key=(seq:number)=>({type:"input",seq,frameSeq:1,input:{kind:"key",code:"Space",down:true}});
  if(mode==="quota"){for(let seq=1;seq<=33;seq++)f.process.send(key(seq));}
  else{f.process.send(key(100));if(mode==="duplicate")f.output({type:"input_ack",seq:100});f.output({type:"input_ack",seq:mode==="duplicate"?100:1});}
  expect(f.closed).toHaveBeenCalledOnce();f.finish();
});

it("ends a missing native source before ready without losing confirmed teardown",async()=>{const f=fixture();f.output({type:"signin_unavailable"});expect(f.closed).toHaveBeenCalledOnce();f.finish();await expect(f.process.settled()).resolves.toBeUndefined();expect(f.unsafeStop).not.toHaveBeenCalled();});
