import type {SubagentUsage,SubagentTranscriptEntry} from "@sodashitsu/protocol";
import type {SubagentHistoryNote,SubagentHistorySource} from "./SubagentTerminalHistory.js";
import type {OpenedFile} from "./safeFile.js";
import type {VerifiedSubagentTarget} from "./VerifiedSubagentTarget.js";
export type TerminalRecord=OpenedFile&{unchanged():Promise<boolean>};
/** Private provider proof. Never serialized or constructed from client-supplied paths. */
export interface SubagentTerminalBinding {
 source:SubagentHistorySource;
 item:SubagentHistoryNote;
 eventId:string;
 key:string;
 kind:VerifiedSubagentTarget["kind"];
 recordId:string;
 /** Provider birth precision for numeric filtering; independent of public millisecond display. */
 usageStartedAt?:number;
 transcriptUnavailableReason?:string;
 transcriptOmittedBefore?:boolean;
 current():boolean;
 verify(allowed:()=>boolean):Promise<boolean>;
 /** Optional provider-owned numeric projection, still bound to this exact historical proof. */
 readUsage?(allowed:()=>boolean):Promise<SubagentUsage|undefined>;
 openRecord(purpose:"transcript"|"usage",allowed:()=>boolean):Promise<TerminalRecord|undefined>;
 entries(row:unknown):SubagentTranscriptEntry[];
}
export interface SubagentTerminalCollection {status:"ok"|"pending"|"unavailable";bindings:readonly SubagentTerminalBinding[];incomplete:boolean}
