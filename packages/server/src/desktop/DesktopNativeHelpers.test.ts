import {afterEach,expect,it} from "vitest";
import {EventEmitter} from "node:events";
import type {fork} from "node:child_process";
import {randomUUID} from "node:crypto";
import {DesktopNativeHelpers} from "./DesktopNativeHelpers.js";
const clean:Array<()=>Promise<void>>=[];afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn();});
function fixture(reenter?:(helpers:DesktopNativeHelpers)=>void){
 class Child extends EventEmitter{connected=true;sent:unknown[]=[];killed=false;send(value:unknown){this.sent.push(value);return true;}kill(){this.killed=true;return true;}}
 const children:Child[]=[],launches:any[]=[],helpers=new DesktopNativeHelpers(((...args:any[])=>{launches.push(args);const child=new Child();children.push(child);reenter?.(helpers);return child;})as unknown as typeof fork);
 clean.push(async()=>{const pending=helpers.dispose();await Promise.resolve();for(const child of children)child.emit("close",0,null);await pending;});
 const descriptor={id:randomUUID(),origin:"http://n00000000000000000000000000000000.localhost:1234",url:""};descriptor.url=`${descriptor.origin}/bridge?id=${descriptor.id}`;
 return {helpers,children,launches,descriptor,ready:(index=0)=>children[index]!.emit("message",{type:"ready",descriptor})};
}
it("launches only the fixed child and exposes discovery after its ready message",async()=>{
 const f=fixture(),viewer=randomUUID(),pending=f.helpers.start("owner",viewer,"https://app.example");expect(f.launches).toHaveLength(1);expect(f.launches[0][0]).toMatch(/DesktopNativeHelperChild\.node\.js$/);expect(f.launches[0][1]).toEqual(["https://app.example"]);expect(f.launches[0][2]).toMatchObject({stdio:["ignore","ignore","ignore","ipc"],execArgv:[]});f.ready();expect(await pending).toEqual(f.descriptor);expect(f.children[0]!.sent).toEqual([]);
});
it("does not stop another owner's viewer and retains its own entry until child close",async()=>{
 const f=fixture(),viewer=randomUUID(),pending=f.helpers.start("one",viewer,"https://app.example");f.ready();await pending;await f.helpers.stop("two",viewer);expect(f.children[0]!.sent).toEqual([]);const stopped=f.helpers.stop("one",viewer);await Promise.resolve();expect(f.children[0]!.sent).toEqual([{type:"stop"}]);let done=false;void stopped.then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);await expect(f.helpers.start("one",viewer,"https://app.example")).rejects.toThrow("終了待ち");f.children[0]!.emit("close",0,null);await stopped;expect(done).toBe(true);
});
it("cancels a child created after reentrant owner revocation and waits its actual close",async()=>{
 const f=fixture(helpers=>helpers.clientGone("one")),viewer=randomUUID(),pending=f.helpers.start("one",viewer,"https://app.example");await expect(pending).rejects.toThrow("停止");await Promise.resolve();expect(f.children[0]!.sent).toEqual([{type:"stop"}]);let disposed=false;const ending=f.helpers.dispose().then(()=>{disposed=true;});await Promise.resolve();expect(disposed).toBe(false);f.children[0]!.emit("close",0,null);await ending;expect(disposed).toBe(true);
});
it("rejects a descriptor released after authentication is lost",async()=>{
 const f=fixture();let active=true;const pending=f.helpers.start("one",randomUUID(),"https://app.example",()=>active);active=false;f.ready();await expect(pending).rejects.toThrow("停止");await Promise.resolve();expect(f.children[0]!.sent).toEqual([{type:"stop"}]);
});
it("bounds managed children per owner without starting a third",async()=>{
 const f=fixture(),one=f.helpers.start("one",randomUUID(),"https://app.example"),two=f.helpers.start("one",randomUUID(),"https://app.example");await expect(f.helpers.start("one",randomUUID(),"https://app.example")).rejects.toThrow("上限");expect(f.children).toHaveLength(2);f.ready(0);f.ready(1);await Promise.all([one,two]);
});
it("refuses duplicate child readiness records rather than accepting a new descriptor",async()=>{
 const f=fixture(),pending=f.helpers.start("one",randomUUID(),"https://app.example");f.ready();await pending;f.ready();await Promise.resolve();expect(f.children[0]!.sent).toEqual([{type:"stop"}]);
});

it("keeps an already forked child owned when a later authentication check throws",async()=>{
 const f=fixture(),viewer=randomUUID();let checks=0;const pending=f.helpers.start("one",viewer,"https://app.example",()=>{if(++checks===2)throw Error("generated authentication failure");return true;});await expect(pending).rejects.toThrow("authentication");await Promise.resolve();expect(f.children[0]!.sent).toEqual([{type:"stop"}]);await expect(f.helpers.start("one",viewer,"https://app.example")).rejects.toThrow("終了待ち");expect(f.children).toHaveLength(1);let ended=false;const closing=f.helpers.dispose().then(()=>{ended=true;});await Promise.resolve();expect(ended).toBe(false);f.children[0]!.emit("close",0,null);await closing;expect(ended).toBe(true);
});

it("starts and closes the real owned discovery child without any browser claim or desktop activation",async()=>{
 const helpers=new DesktopNativeHelpers();clean.push(()=>helpers.dispose());const viewer=randomUUID(),first=await helpers.start("real-owner",viewer,"https://browser.example");expect(first.origin).toMatch(/^http:\/\/n[a-f0-9]{32}\.localhost:/);await helpers.stop("real-owner",viewer);
 const second=await helpers.start("real-owner",viewer,"https://browser.example");expect(second.id).not.toBe(first.id);helpers.clientGone("real-owner");await helpers.dispose();
},10000);
it("drains a real child revoked before its discovery readiness",async()=>{
 const helpers=new DesktopNativeHelpers();clean.push(()=>helpers.dispose());const pending=helpers.start("real-owner",randomUUID(),"https://browser.example");helpers.clientGone("real-owner");await expect(pending).rejects.toThrow("停止");await helpers.dispose();
},10000);
