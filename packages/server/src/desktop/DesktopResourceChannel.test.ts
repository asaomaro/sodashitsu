import {EventEmitter} from "node:events";
import {PassThrough,Writable} from "node:stream";
import {expect,it,vi} from "vitest";
import {DesktopResourceChannel} from "./DesktopResourceChannel.js";
import {DesktopInteractiveOwner} from "./DesktopInteractiveOwner.js";
import type {DesktopHelper} from "./DesktopSharedCapture.js";
class Helper extends EventEmitter implements DesktopHelper {
 stdout=new PassThrough();stderr=new PassThrough();exitCode:number|null=null;signalCode=null;commands:any[]=[];
 stdin=new Writable({write:(chunk,_encoding,done)=>{this.commands.push(JSON.parse(String(chunk)));done();}});
 kill=vi.fn(()=>{this.exitCode=1;this.emit("close",1,null);return true;});
 send(value:unknown){this.stdout.write(JSON.stringify(value)+"\n");}
}
function setup(){const child=new Helper(),close=vi.fn(),channel=new DesktopResourceChannel(child,close);channel.stdout.on("data",raw=>{for(const line of String(raw).trim().split("\n"))channel.accept(JSON.parse(line));});return {child,channel,close,write:(value:unknown)=>channel.write(value)};}
it("does not confuse stale or unsolicited control replies with a later release",async()=>{
 const f=setup();f.child.send({type:"control",enabled:false});f.write({type:"control",enabled:false});const first=f.child.commands.at(-1);const old=f.channel.completed("control");f.child.send({...first});await old;
 f.write({type:"control",enabled:true});f.write({type:"control",enabled:false});const latest=f.child.commands.at(-1);let completed=false;const release=f.channel.completed("control").then(()=>{completed=true;});
 f.child.send(first);f.child.send({type:"control",enabled:false});await Promise.resolve();expect(completed).toBe(false);expect(latest.seq).toBeGreaterThan(first.seq);
 f.child.send(latest);await release;expect(completed).toBe(true);f.channel.kill();
});
it.each(["reply","physical-close"] as const)("blocks a different helper until old key cleanup finishes by %s",async mode=>{
 const a=setup(),b=setup(),owner=new DesktopInteractiveOwner<object,DesktopResourceChannel>((source,kind)=>source.completed(kind)),old={},next={};
 expect(owner.acquire(old,a.channel,"control")).toBe(true);a.write({type:"control",enabled:true});a.write({type:"control",enabled:false});const release=owner.release(old,"control");
 expect(owner.acquire(next,b.channel,"control")).toBe(false);expect(b.child.commands).toEqual([]);
 if(mode==="reply"){a.child.send(a.child.commands.at(-1));await release;}
 else{a.channel.kill();owner.sourceGone(a.channel);await release.catch(()=>{});}
 expect(owner.acquire(next,b.channel,"control")).toBe(true);b.write({type:"control",enabled:true});expect(a.child.commands.map(m=>m.type)).toEqual(["control","control"]);expect(b.child.commands).toEqual([{type:"control",enabled:true,seq:1}]);owner.dispose();a.channel.kill();b.channel.kill();
});
it.each(["clipboard","microphone"] as const)("matches the existing %s operation identity before handoff",async kind=>{
 const f=setup(),type=kind==="clipboard"?"clipboard_control":"native_microphone",field=kind==="clipboard"?"generation":"id",old=kind==="clipboard"?1:crypto.randomUUID(),next=kind==="clipboard"?2:crypto.randomUUID();
 f.write({type,enabled:false,[field]:old});const previous=f.channel.completed(kind);f.child.send({type,enabled:false,[field]:old});await previous;
 f.write({type,enabled:true,[field]:next});f.write({type,enabled:false,[field]:next});let done=false;const pending=f.channel.completed(kind).then(()=>{done=true;});
 f.child.send({type,enabled:false,[field]:old});await Promise.resolve();expect(done).toBe(false);f.child.send({type,enabled:false,[field]:next});await pending;expect(done).toBe(true);f.channel.kill();
});
it("keeps control/input commands in the same helper FIFO and coalesces repeated stop requests",async()=>{
 const f=setup();f.write({type:"control",enabled:true});f.write({type:"input",seq:1});f.write({type:"control",enabled:false});f.write({type:"control",enabled:false});
 expect(f.child.commands.map(m=>m.type)).toEqual(["control","input","control"]);const complete=f.channel.completed("control");f.child.send(f.child.commands.at(-1));await complete;f.channel.kill();
});
