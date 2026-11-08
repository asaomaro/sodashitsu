/** Installed ConversationStateStructure.field5 -> ConversationTokenDetails fields1/2.
 * Standalone so the same fixed decoder can run in the private SQLite worker.
 * Both scalar fields must be physically present; protobuf defaults are not observations. */
export function cursorChildContextFromRoot(bytes:Uint8Array):{used:number;max:number}|undefined {
 if(!(bytes instanceof Uint8Array)||bytes.length>2*1024*1024)return;
 try {
  const visit=(data:Uint8Array,field:(tag:number,wire:number,value:bigint|Uint8Array|undefined)=>void)=>{
   let at=0;
   const variable=()=>{let n=0n;for(let i=0;i<10;i++){if(at>=data.length)throw Error();const b=data[at++]!;if(i===9&&b>1)throw Error();n|=BigInt(b&127)<<BigInt(i*7);if(!(b&128))return n;}throw Error();};
   while(at<data.length){const key=variable();if(key===0n||key>0xffffffffn)throw Error();const wire=Number(key&7n),tag=Number(key>>3n);if(tag===0)throw Error();let value:bigint|Uint8Array|undefined;
    if(wire===0)value=variable();
    else if(wire===2){const size=variable();if(size>BigInt(data.length-at))throw Error();const end=at+Number(size);value=data.subarray(at,end);at=end;}
    else if(wire===1||wire===5){at+=wire===1?8:4;if(at>data.length)throw Error();}
    else throw Error();
    field(tag,wire,value);
   }
  };
  let details:Uint8Array|undefined;
  visit(bytes,(tag,wire,value)=>{if(tag===5){if(wire!==2||details!==undefined||!(value instanceof Uint8Array))throw Error();details=value;}});
  if(details===undefined)return;
  let used:number|undefined,max:number|undefined;
  visit(details,(tag,wire,value)=>{if(tag!==1&&tag!==2)return;if(wire!==0||typeof value!=='bigint'||value>0xffffffffn)throw Error();if(tag===1){if(used!==undefined)throw Error();used=Number(value);}else{if(max!==undefined)throw Error();max=Number(value);}});
  if(used===undefined||max===undefined||max===0||used>max)return;
  return {used,max};
 }catch{return;}
}
export interface CursorChildContext {rootId:string;used:number;max:number}
export function cursorChildContextMetadata(value:unknown):CursorChildContext|undefined {
 if(!value||typeof value!=="object"||Array.isArray(value))return;
 const c=value as Record<string,unknown>;
 if(typeof c.rootId!=="string"||!/^[a-f0-9]{64}$/.test(c.rootId)||typeof c.used!=="number"||!Number.isSafeInteger(c.used)||c.used<0||typeof c.max!=="number"||!Number.isSafeInteger(c.max)||c.max<=0||c.used>c.max||c.max>0xffffffff)return;
 return {rootId:c.rootId,used:c.used,max:c.max};
}
