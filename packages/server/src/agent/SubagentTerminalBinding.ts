import type {SubagentTranscriptEntry} from "@sodashitsu/protocol";
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
 current():boolean;
 verify(allowed:()=>boolean):Promise<boolean>;
 openRecord(purpose:"transcript"|"usage",allowed:()=>boolean):Promise<TerminalRecord|undefined>;
 entries(row:unknown):SubagentTranscriptEntry[];
}
export interface SubagentTerminalCollection {status:"ok"|"pending"|"unavailable";bindings:readonly SubagentTerminalBinding[];incomplete:boolean}
