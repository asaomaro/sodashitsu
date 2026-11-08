import type { Pane, SubagentInfo } from "@sodashitsu/protocol";

export interface SubagentTargetSession {
  getPane(id: string): Pane | undefined;
  hasVerifiedAgentSession(pane: string, instance: string, session: string): boolean;
}
export interface VerifiedSubagentTarget {
  key: string;
  paneId: string;
  kind: "codex"|"claude"|"muse"|"agy"|"grok"|"copilot"|"cursor";
  instanceId: string;
  parentId: string;
  recordId: string;
  item: SubagentInfo;
  startedAt: number;
  current(): boolean;
}
/** Current membership only. Numeric and text readers separately prove the provider record relation.
 * No grants are manufactured from a filename, a historical label or hasTranscript. */
export function resolveVerifiedSubagentTarget(session: SubagentTargetSession, paneId: string, child: string): VerifiedSubagentTarget | undefined {
  const p=session.getPane(paneId), a=p?.agent, ref=p?.agentSession;
  if(!/^[A-Za-z0-9_-]{1,128}$/.test(child)||!a?.instanceId||!ref||ref.kind!==a.kind||child===ref.sessionId||!session.hasVerifiedAgentSession(paneId,a.instanceId,ref.sessionId))return;
  if(!["codex","claude","muse","agy","grok","copilot","cursor"].includes(a.kind))return;
  const item=a.subagents?.items?.find(item=>item.id===child);
  if(!item)return;
  const kind=a.kind as VerifiedSubagentTarget["kind"], instanceId=a.instanceId, parentId=ref.sessionId;
  return {key:JSON.stringify([paneId,kind,instanceId,parentId,child]),paneId,kind,instanceId,parentId,recordId:child,item:{...item},startedAt:item.startedAt,current:()=>{
    const now=session.getPane(paneId);
    return now?.agent?.kind===kind&&now.agent.instanceId===instanceId&&now.agentSession?.kind===kind&&now.agentSession.sessionId===parentId&&session.hasVerifiedAgentSession(paneId,instanceId,parentId)&&now.agent.subagents?.items?.some(item=>item.id===child)===true;
  }};
}
