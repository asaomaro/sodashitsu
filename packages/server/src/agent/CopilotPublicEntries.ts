import {createHash} from "node:crypto";
import type {SubagentTranscriptEntry} from "@sodashitsu/protocol";
const ID=/^[A-Za-z0-9_:.-]{1,128}$/;
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
/** Public, persisted child messages only. A tool-call identifier never becomes a file path. */
export function copilotPublicMessage(value:unknown):{child:string;fingerprint:string;entry:SubagentTranscriptEntry}|undefined {
 const row=object(value),data=object(row?.data);
 if(!row||row.type!=="assistant.message"||row.ephemeral!==undefined&&row.ephemeral!==false||row.hidden===true||!data||data.hidden===true||data.reasoning===true||data.phase!==undefined||typeof row.id!=="string"||!ID.test(row.id)||typeof row.timestamp!=="string"||!Number.isFinite(Date.parse(row.timestamp))||typeof data.parentToolCallId!=="string"||!ID.test(data.parentToolCallId)||typeof data.messageId!=="string"||!ID.test(data.messageId)||typeof data.content!=="string"||!data.content.trim()||Buffer.byteLength(data.content)>256*1024)return;
 const fingerprint=createHash("sha256").update(JSON.stringify([row.id,row.timestamp,data.messageId,data.content])).digest("hex");
 return{child:data.parentToolCallId,fingerprint,entry:{kind:"say",text:data.content.slice(0,4000),at:row.timestamp.slice(0,40),...(data.content.length>4000?{truncated:true}:{})}};
}
