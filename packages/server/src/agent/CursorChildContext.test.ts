import {expect,it} from "vitest";
import {cursorChildContextFromRoot,cursorChildContextMetadata} from "./CursorChildContext.js";
const v=(n:bigint|number)=>{let x=BigInt(n);const b:number[]=[];do{b.push(Number(x&127n)|(x>127n?128:0));x>>=7n;}while(x);return b;};
const root=(details:number[])=>new Uint8Array([42,...v(details.length),...details]);
it("projects only explicitly encoded child context scalars and ignores other root/body fields",()=>{
 expect(cursorChildContextFromRoot(new Uint8Array([10,3,65,66,67,...root([8,25,16,100])]))).toEqual({used:25,max:100});expect(cursorChildContextFromRoot(root([8,0,16,100]))).toEqual({used:0,max:100});
});
it("does not manufacture protobuf defaults or accept ambiguous/invalid counters",()=>{
 for(const bytes of [new Uint8Array(),root([]),root([8,25]),root([16,100]),root([8,0,16,0]),root([8,101,16,100]),root([8,1,8,2,16,100]),root([8,...v(0x100000000n),16,100]),root([10,1,0,16,100]),new Uint8Array([...root([8,1,16,2]),...root([8,1,16,2])]),new Uint8Array([42,10,8]),new Uint8Array([...root([8,1,16,2]),0]),new Uint8Array(2*1024*1024+1)])expect(cursorChildContextFromRoot(bytes)).toBeUndefined();
});
it("whitelists context metadata without retaining worker extras or keys",()=>{
 expect(cursorChildContextMetadata({rootId:'a'.repeat(64),used:1,max:2,blobEncryptionKey:'not-returned'})).toEqual({rootId:'a'.repeat(64),used:1,max:2});for(const c of [{rootId:'x',used:1,max:2},{rootId:'a'.repeat(64),used:undefined,max:2},{rootId:'a'.repeat(64),used:1,max:0},{rootId:'a'.repeat(64),used:-1,max:2}])expect(cursorChildContextMetadata(c)).toBeUndefined();
});
