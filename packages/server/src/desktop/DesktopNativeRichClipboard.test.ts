import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {randomUUID} from "node:crypto";
import {expect,it} from "vitest";
import {encodeClipboardBundle,decodeClipboardBundle,DESKTOP_CLIPBOARD_CHUNK_BYTES,type DesktopRichClipboardResult} from "@sodashitsu/protocol";
import {DesktopRichClipboard} from "./DesktopRichClipboard.js";

// Replays only a generated clipboard kernel, never Portal, a display, capture or input.
// The actual TypeScript consumer verifies every helper reply including next offsets.
const script=String.raw`
import importlib.util,json,sys,threading
spec=importlib.util.spec_from_file_location("owned_kernel",sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Parent:
 def __init__(self):
  self.helper=type("Helper",(),{"output_gate":threading.RLock()})();self.owner_version=0;self.generation=1;self.enabled=True;self.closed=False;self.bundle={"text":"generated "*3000,"html":"<b>generated</b>"}
 def mono(self):return 0
 def scope(self):return True
 def authorized(self,t):return self.enabled and t[0]==self.generation and t[2]<=0<=t[3]
 def can_write(self,t):return self.authorized(t)
 def read_rich(self,t):return self.bundle
 def write_rich(self,b,t,expected,valid):
  if expected!=self.owner_version or not valid():raise module.NativeFailure("source_changed")
  self.bundle=b;self.owner_version+=1
p=Parent();kernel=module.RichClipboardProtocol(p);results=[]
for value in json.load(sys.stdin):
 ticket=(value["generation"],value["expiresAt"],0,value["expiresAt"]-1000)
 try:
  result,valid=kernel.cancel(value,ticket) if value["operation"]=="cancel" else kernel.request(value,ticket)
  if valid and not valid():raise module.NativeFailure("source_changed")
 except Exception:
  result={"type":"clipboard_rich_result","id":value["id"],"ok":False,"stage":"done"}
 results.append(result)
print(json.dumps(results,separators=(",",":")))
`;
it.skipIf(process.platform==="win32")("uses the actual Python rich kernel with the TypeScript read/write wire consumer",()=>{
 const history:unknown[]=[],replies:DesktopRichClipboardResult[]=[];
 const path=fileURLToPath(new URL("../../../../scripts/remote-desktop/linux-portal-helper.py",import.meta.url));
 const bridge=new DesktopRichClipboard({allowed:()=>true,generation:()=>1,now:()=>1000,send:r=>{replies.push(r);return true;},write:value=>{
  history.push(value);
  const all=JSON.parse(execFileSync("python3",["-I","-c",script,path],{input:JSON.stringify(history),encoding:"utf8",maxBuffer:2*1024*1024})) as unknown[];
  bridge.fromHelper(all.at(-1));
 }});
 const read=()=>{
  const id=randomUUID();bridge.fromViewer({type:"clipboard_rich",id,operation:"read"});
  const first=replies.pop()!;expect(first).toMatchObject({ok:true,stage:"begin"});const bytes:Buffer[]=[];let offset=0;
  while(offset<first.size!) {
   bridge.fromViewer({type:"clipboard_rich",id,operation:"pull",offset});const reply=replies.pop()!;
   expect(reply).toMatchObject({ok:true,stage:"chunk"});const piece=Buffer.from(reply.data!,"base64");offset+=piece.length;
   expect(reply.offset).toBe(offset);bytes.push(piece);
  }
  return decodeClipboardBundle(Buffer.concat(bytes));
 };
 try {
  expect(read()).toEqual({text:"generated ".repeat(3000),html:"<b>generated</b>"});
  const bundle={text:"日本語😀",html:"<b>日本語</b>",rtf:Buffer.from("{\\rtf1 generated}").toString("base64")},bytes=encodeClipboardBundle(bundle),id=randomUUID();
  bridge.fromViewer({type:"clipboard_rich",id,operation:"begin",size:bytes.length});expect(replies.pop()).toMatchObject({ok:true,stage:"begin"});
  for(let offset=0;offset<bytes.length;offset+=DESKTOP_CLIPBOARD_CHUNK_BYTES) {
   const piece=bytes.subarray(offset,offset+DESKTOP_CLIPBOARD_CHUNK_BYTES);
   bridge.fromViewer({type:"clipboard_rich",id,operation:"push",offset,data:Buffer.from(piece).toString("base64")});expect(replies.pop()).toMatchObject({ok:true,stage:"chunk",offset:offset+piece.length});
  }
  bridge.fromViewer({type:"clipboard_rich",id,operation:"commit"});expect(replies.pop()).toMatchObject({ok:true,stage:"done"});expect(read()).toEqual(bundle);
 }finally{bridge.stop();}
});
