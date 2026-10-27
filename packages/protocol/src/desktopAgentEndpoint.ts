import {z} from "zod";
import {DesktopEndpointFingerprint,DesktopEndpointMachine} from "./desktopEndpoint.js";
export const DESKTOP_AGENT_GRANT_PREFIX="soda-e2e-agent-v1.";
/** Reserved family: unknown versions must never enter legacy plaintext RPC. */
export const isDesktopAgentEncryptedGrant=(value:string)=>value.startsWith("soda-e2e-agent-");
const SafeOrigin=z.string().max(2048).refine(raw=>{try{const url=new URL(raw);return url.origin===raw&&(url.protocol==="https:"||url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname));}catch{return false;}});
const Secret=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const DesktopAgentGrant=z.object({version:z.literal(1),machineId:DesktopEndpointMachine,origin:SafeOrigin,provider:DesktopEndpointFingerprint,recipient:DesktopEndpointFingerprint,scope:Secret,ticket:Secret,expiresAt:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();
export type DesktopAgentGrant=z.infer<typeof DesktopAgentGrant>;
const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"");
const failure=()=>Error("Invalid encrypted desktop agent grant");
export function formatDesktopAgentGrant(raw:DesktopAgentGrant):string{
 try{const bytes=new TextEncoder().encode(JSON.stringify(DesktopAgentGrant.parse(raw)));if(bytes.length>6000)throw failure();return DESKTOP_AGENT_GRANT_PREFIX+encode(bytes);}catch{throw failure();}
}
export function parseDesktopAgentGrant(code:string):DesktopAgentGrant{
 try{
  if(!code.startsWith(DESKTOP_AGENT_GRANT_PREFIX)||code.length>8192)throw failure();const value=code.slice(DESKTOP_AGENT_GRANT_PREFIX.length);if(!/^[A-Za-z0-9_-]+$/.test(value))throw failure();
  const bytes=Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/")),c=>c.charCodeAt(0));if(encode(bytes)!==value)throw failure();return DesktopAgentGrant.parse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
 }catch{throw failure();}
}
export const DesktopEndpointAgentPeers=z.object({type:z.literal("agent_endpoint_available"),peers:z.array(z.object({fingerprint:DesktopEndpointFingerprint,label:z.string().trim().min(1).max(80)}).strict()).max(64).refine(peers=>new Set(peers.map(peer=>peer.fingerprint)).size===peers.length)}).strict();
export const DesktopEndpointAgentRequest=z.union([
 z.object({type:z.literal("agent_endpoint_peers")}).strict(),
 z.object({type:z.literal("agent_endpoint_grant"),enabled:z.boolean(),recipient:DesktopEndpointFingerprint.optional()}).strict().refine(value=>value.enabled?value.recipient!==undefined:value.recipient===undefined),
]);
export const DesktopEndpointAgentTicket=z.object({type:z.literal("agent_endpoint_ticket"),code:z.string().min(1).max(8192),expiresAt:z.number().int().positive()}).strict();
export const DesktopEndpointAgentError=z.object({type:z.literal("agent_endpoint_error"),message:z.string().min(1).max(256)}).strict();
export const DesktopEndpointAgentAttach=z.object({id:z.string().regex(/^[1-9][0-9]{0,15}$/),method:z.literal("desktop.agent.attach"),params:z.object({ticket:Secret,scope:Secret}).strict()}).strict();

export const DesktopAgentEndpointResults={
 "desktop.agent.attach":z.object({leaseId:Secret,expiresAt:z.number().finite().positive().max(Number.MAX_SAFE_INTEGER)}).strict(),
 "desktop.agent.observe":z.object({observationId:Secret,frameSeq:z.number().int().positive(),width:z.number().int().positive().max(16384),height:z.number().int().positive().max(16384),format:z.enum(["image/png","image/jpeg"]),imageBase64:z.string().min(4).max(4*1024*1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),latestFrameMaxAgeMs:z.literal(2000)}).strict(),
 "desktop.agent.act":z.object({acknowledged:z.number().int().min(1).max(32),afterFrameSeq:z.number().int().positive()}).strict(),
 "desktop.agent.release":z.object({released:z.literal(true)}).strict(),
};

export const DesktopAgentEndpointResponse=z.object({id:z.string().regex(/^[1-9][0-9]{0,15}$/),result:z.unknown().optional(),error:z.object({code:z.literal("server_busy"),message:z.string().max(256)}).strict().optional()}).strict();
