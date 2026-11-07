import type {SubagentInfo} from "@sodashitsu/protocol";
import {CodexChildTurnStream} from "./CodexChildTurnStream.js";
import {CodexChildObservationCache} from "./CodexChildObservationCache.js";
/** Pure complete-window helper; the live reader owns a persistent CodexChildObservationCache. */
export function codexChildTurn(bytes:Buffer,startedAt:number,partialHead=false){
 const stream=new CodexChildTurnStream(0,startedAt,partialHead);stream.consume(bytes);
 return !stream.invalid&&!stream.partial&&stream.seenTurn?{...stream.value}:{};
}
/** Compatibility helper for a single bounded read. Incremental callers retain the cache explicitly. */
export async function readCodexChildObservations(home:string,parent:string,items:readonly SubagentInfo[],current:()=>boolean){
 const cache=new CodexChildObservationCache();
 try{return await cache.read(home,parent,items,current,{paneId:"one-shot",instanceId:"one-shot",generation:0});}
 finally{cache.close();}
}
