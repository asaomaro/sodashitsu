import {expect,it} from "vitest";
import {EventEmitter} from "node:events";
import {PassThrough} from "node:stream";
import type {spawn} from "node:child_process";
import {desktopOwnedChild} from "./DesktopOwnedChild.node.js";
for(const input of ["","required private request"]){it(`handles early stdin closure only when no bytes were submitted (${input.length})`,async()=>{
 const child=new EventEmitter() as EventEmitter&{stdin:PassThrough;stdout:PassThrough;stderr:PassThrough;kill():boolean};child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;
 child.stdin.end=((..._args:unknown[])=>{queueMicrotask(()=>{child.stdin.emit("error",Object.assign(Error("generated early pipe close"),{code:"EPIPE"}));child.stdout.write("fixed success");child.emit("close",0,null);});return child.stdin;}) as typeof child.stdin.end;
 const pending=desktopOwnedChild("fixed generated fixture",[],input,{timeout:5000,limit:128,spawn:(()=>child) as unknown as typeof spawn});
 if(input.length)await expect(pending).rejects.toThrow("入力");else await expect(pending).resolves.toBe("fixed success");
});}
