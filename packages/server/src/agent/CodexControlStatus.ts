import { openCodexControl, type CodexControlChannel } from "./CodexControlSocket.js";

export type CodexObservedState = "working" | "idle" | "unknown";
export interface CodexControlTarget {
  home: string;
  parentId: string;
  childIds: readonly string[];
  signal: AbortSignal;
  current(): boolean;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Runtime status only. A flag is not inferred to mean work or idle. */
export function codexObservedState(value: unknown): CodexObservedState {
  const status = object(value);
  if (status?.type === "idle") return "idle";
  if (status?.type === "active" && Array.isArray(status.activeFlags) && status.activeFlags.length === 0) return "working";
  return "unknown";
}

/** Only known EOF-proven child IDs. This typed allowlist cannot send turn/start. */
const METHODS = ["initialize", "thread/loaded/list", "thread/read"] as const;
export async function readCodexControlStatus(target: CodexControlTarget): Promise<Map<string, CodexObservedState>> {
  const unknown = (): Map<string, CodexObservedState> => new Map(target.childIds.slice(0,64).map(id => [id,"unknown"]));
  if (!UUID.test(target.parentId) || target.childIds.length>64 || target.childIds.some(id=>!UUID.test(id)||id===target.parentId) || new Set(target.childIds).size!==target.childIds.length) return unknown();
  let channel: CodexControlChannel<typeof METHODS[number]> | undefined;
  try {
    const check = () => { if (!target.current()) throw Error("Control scope expired"); };
    channel = await openCodexControl({home:target.home,key:"status:"+target.parentId,signal:target.signal,expires:performance.now()+1500,check,requestMs:1000,maxRequests:66},METHODS);
    const initialized = object(await channel.request("initialize",{clientInfo:{name:"sodashitsu-subagent-status",version:"0.1.0"},capabilities:{experimentalApi:true}}));
    if (typeof initialized?.userAgent!=="string" || initialized.userAgent.length>1024) return unknown();
    channel.initialized();
    const loaded=object(await channel.request("thread/loaded/list",{}))?.data;
    if (!Array.isArray(loaded)||loaded.length>10000||loaded.some(id=>typeof id!=="string"||!UUID.test(id))||!loaded.includes(target.parentId)) return unknown();
    const states=unknown();
    for (const id of target.childIds) {
      if (!loaded.includes(id)) continue;
      const thread=object(object(await channel.request("thread/read",{threadId:id,includeTurns:false}))?.thread);
      if (thread?.id!==id) return unknown();
      states.set(id,codexObservedState(thread.status));
    }
    return await channel.unchanged()?states:unknown();
  } catch {return unknown();}
  finally {await channel?.close();}
}
