import {expect,it} from "vitest";
import {DesktopInteractiveOwner} from "./DesktopInteractiveOwner.js";
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>resolve=yes);return {promise,resolve};}
it("keeps other resources available while a source completes ordinary control cleanup",async()=>{
 const completion=deferred(),owner=new DesktopInteractiveOwner<object,object>(()=>completion.promise),a={},b={},source={},other={};
 expect(owner.acquire(a,source,"control")).toBe(true);expect(owner.acquire(b,other,"control")).toBe(false);
 const release=owner.release(a,"control");expect(owner.owns(a,"control")).toBe(false);
 expect(owner.acquire(b,other,"control")).toBe(false);expect(owner.acquire(b,other,"clipboard")).toBe(true);
 completion.resolve();await release;expect(owner.acquire(b,other,"control")).toBe(true);owner.dispose();
});
it("only physical source close retires its outstanding ownership",()=>{
 const completion=deferred(),owner=new DesktopInteractiveOwner<object,object>(()=>completion.promise),a={},b={},source={},other={};
 owner.acquire(a,source,"control");owner.acquire(b,other,"clipboard");void owner.release(a,"control");
 owner.sourceGone({});expect(owner.acquire(b,other,"control")).toBe(false);
 owner.sourceGone(source);expect(owner.acquire(b,other,"control")).toBe(true);expect(owner.owns(b,"clipboard")).toBe(true);owner.dispose();
});
it("ignores a different member's release and coalesces the original release",()=>{
 const completion=deferred(),owner=new DesktopInteractiveOwner<object,object>(()=>completion.promise),a={},source={};owner.acquire(a,source,"control");
 void owner.release({},"control");expect(owner.owns(a,"control")).toBe(true);
 const first=owner.release(a,"control");expect(owner.release(a,"control")).toBe(first);owner.dispose();
});
