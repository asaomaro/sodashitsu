import {z} from "zod";
const id=z.uuid(),offset=z.number().int().min(0).max(104857600);
export const DesktopNativeFileRequest=z.discriminatedUnion("action",[
 z.object({action:z.literal("native_prepare"),gesture:id,origin:z.string().max(2048).refine(v=>{try{const u=new URL(v);return ["http:","https:"].includes(u.protocol)&&u.origin===v;}catch{return false;}}),seq:z.number().int().positive().safe()}).strict(),
 z.object({action:z.literal("native_activate"),gesture:id,lease:id}).strict(),
 z.object({action:z.literal("native_read"),gesture:id,lease:id,request:id,index:z.number().int().min(0).max(999),offset,length:z.number().int().min(1).max(65536)}).strict(),
 z.object({action:z.literal("native_heartbeat"),gesture:id,lease:id}).strict(),
 z.object({action:z.literal("native_abort"),gesture:id}).strict(),
]);
export type DesktopNativeFileRequest=z.infer<typeof DesktopNativeFileRequest>;
export const DesktopNativeFileOffer=z.object({lease:id,generation:id,entries:z.array(z.object({name:z.string().min(1).max(259),directory:z.boolean(),bytes:offset,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().refine(e=>!e.directory||(e.bytes===0&&e.sha256==="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"))).min(1).max(1000)}).strict();
export type DesktopNativeFileOffer=z.infer<typeof DesktopNativeFileOffer>;
