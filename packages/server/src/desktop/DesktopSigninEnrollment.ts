import {inspect} from "node:util";
import {z} from "zod";
import {ClientHelloParams,DesktopEndpointFingerprint,DesktopEndpointStart} from "@sodashitsu/protocol";

const unavailable=()=>new Error("Desktop signin enrollment is unavailable");
const MAX_BYTES=16*1024;
const origin=z.string().max(2048).refine(value=>{
  try {
    const url=new URL(value);
    return value===url.origin && (url.protocol==="https:" || url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname));
  }catch{return false;}
});
const owner=z.string().max(184).regex(/^S-1-[0-9]+(?:-[0-9]+){1,15}$/)
  .refine(value=>{
    const parts=value.split("-").slice(2);
    return parts.every((part,index)=>/^(?:0|[1-9][0-9]*)$/.test(part)&&Number.isSafeInteger(Number(part))&&Number(part)<=(index===0?0xffffffffffff:0xffffffff)) && !["S-1-5-18","S-1-5-19","S-1-5-20"].includes(value);
  });
const peer=z.object({fingerprint:DesktopEndpointFingerprint,label:z.string().trim().min(1).max(80)}).strict();
const record=z.object({
  version:z.literal(1),purpose:z.literal("desktop-signin"),revision:z.string().uuid(),ownerSid:owner,
  origin,machineId:z.string().regex(/^[a-f0-9]{32}$/),token:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  provider:DesktopEndpointFingerprint,allowSignin:z.literal(true),allowInput:z.boolean().default(false),
  peers:z.array(peer).min(1).max(8).refine(values=>new Set(values.map(value=>value.fingerprint)).size===values.length),
}).strict();
const id=z.string().regex(/^[A-Za-z0-9:_-]{1,128}$/);
const request=z.discriminatedUnion("method",[
  z.object({id,method:z.literal("client.hello"),params:ClientHelloParams.strict()}).strict(),
  z.object({id,method:z.literal("desktop.capabilities"),params:z.object({}).strict()}).strict(),
  z.object({id,method:z.literal("desktop.endpoint.status"),params:z.object({}).strict()}).strict(),
  z.object({id,method:z.literal("desktop.endpoint.start"),params:DesktopEndpointStart}).strict(),
]);
export type DesktopSigninRequest=z.infer<typeof request>;
function json(bytes:Uint8Array):unknown {
  if(!(bytes instanceof Uint8Array)||bytes.byteLength>MAX_BYTES)throw unavailable();
  return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));
}
/** Immutable parsed data, not proof of DPAPI/ACL ownership, peer trust or a live
 * signed-out scope. A future dedicated service must supply those boundaries.
 * Construction does not read/write files, initialize keys or contact the Root. */
export class DesktopSigninEnrollment {
  readonly #data:z.infer<typeof record>;
  private constructor(data:z.infer<typeof record>){this.#data=data;}
  static decode(bytes:Uint8Array,expectedOwnerSid:string):DesktopSigninEnrollment {
    try {
      const data=record.parse(json(bytes));
      if(data.ownerSid!==expectedOwnerSid)throw unavailable();
      return new DesktopSigninEnrollment(data);
    }catch{throw unavailable();}
  }
  /** Only an explicit network adapter should request the delegation credential. */
  delegation():{url:string;machineId:string;token:string} {
    const url=new URL(this.#data.origin);url.protocol=url.protocol==="https:"?"wss:":"ws:";url.pathname="/machine-delegation";
    return {url:url.href,machineId:this.#data.machineId,token:this.#data.token};
  }
  publicStatus():{revision:string;origin:string;machineId:string;provider:string;allowInput:boolean;peers:z.infer<typeof peer>[]} {
    const data=this.#data;
    return {revision:data.revision,origin:data.origin,machineId:data.machineId,provider:data.provider,allowInput:data.allowInput,peers:data.peers.map(value=>({...value}))};
  }
  toJSON():{version:1;purpose:"desktop-signin"}{return {version:1,purpose:"desktop-signin"};}
  [inspect.custom]():unknown{return this.toJSON();}
  /** Classify into a finite typed request. Never forward a raw method to the
   * generic server surface. This alone authenticates neither peer nor source. */
  classify(bytes:Uint8Array):DesktopSigninRequest {
    try {
      const message=request.parse(json(bytes));
      if(message.method==="desktop.endpoint.start") {
        const expected=new URL(this.#data.origin);expected.protocol=expected.protocol==="https:"?"wss:":"ws:";expected.pathname="/desktop-e2e";
        if(message.params.machineId!==this.#data.machineId || message.params.url!==expected.href || message.params.hello.role!=="viewer")throw unavailable();
      }
      return message;
    }catch{throw unavailable();}
  }
}
