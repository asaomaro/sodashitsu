import {z} from "zod";
import {DesktopNativeFileOffer} from "./desktopNativeFiles.js";
const id=z.uuid(),integer=z.number().int().min(0).max(104857600);
export const DesktopNativeHelperOrigin=z.string().regex(/^http:\/\/n[a-f0-9]{32}\.localhost:[1-9][0-9]{0,4}$/).refine(value=>{try{return new URL(value).origin===value&&Number(new URL(value).port)<=65535;}catch{return false;}});
export const DesktopNativeHelperDescriptor=z.object({id,origin:DesktopNativeHelperOrigin,url:z.string().max(2048)}).strict().refine(v=>v.url===`${v.origin}/bridge?id=${v.id}`);
export type DesktopNativeHelperDescriptor=z.infer<typeof DesktopNativeHelperDescriptor>;
export const DesktopNativeHelperRequest=z.discriminatedUnion("type",[
 z.object({type:z.literal("beat")}).strict(),
 z.object({type:z.literal("arm"),gesture:id}).strict(),
 z.object({type:z.literal("start"),gesture:id,offer:DesktopNativeFileOffer}).strict(),
 z.object({type:z.literal("bytes"),gesture:id,request:id,index:z.number().int().min(0).max(999),offset:integer,data:z.string().min(1).max(87384).regex(/^[A-Za-z0-9+/]*={0,2}$/)}).strict(),
 z.object({type:z.literal("cancel"),gesture:id}).strict(),
]);
export type DesktopNativeHelperRequest=z.infer<typeof DesktopNativeHelperRequest>;
export const DesktopNativeHelperEvent=z.discriminatedUnion("type",[
 z.object({type:z.literal("alive")}).strict(),
 z.object({type:z.literal("ready"),id}).strict(),
 z.object({type:z.literal("armed"),gesture:id}).strict(),
 z.object({type:z.literal("running"),gesture:id}).strict(),
 z.object({type:z.literal("need"),gesture:id,request:id,index:z.number().int().min(0).max(999),offset:integer,length:z.number().int().min(1).max(65536)}).strict(),
 z.object({type:z.literal("done"),gesture:id,ok:z.boolean()}).strict(),
 z.object({type:z.literal("error"),message:z.string().max(200)}).strict(),
]);
export type DesktopNativeHelperEvent=z.infer<typeof DesktopNativeHelperEvent>;
