import {loadStatuslineSettings,statuslineSegments,type AgentUsage,type Pane,type SubagentInfo} from '@sodashitsu/protocol';
const effortSettings=loadStatuslineSettings({enabled:true,fields:{effort:true}});
/** Uses provider observations only; launch preferences are deliberately not an input. */
export function observedAgentModel(pane:Pane,usage:AgentUsage|null|undefined):{text:string;title:string}|undefined {
 if(!pane.agent||usage?.kind!==pane.agent.kind||usage.paneId!==pane.id)return undefined;
 const model=usage.model?.trim(),effort=statuslineSegments(pane,usage,[],effortSettings).find(s=>s.field==='effort');
 if(!model&&!effort)return undefined;
 return {text:[model,model?effort?.text.replace(/^effort /,''):effort?.text].filter(Boolean).join(' '),title:[model,effort?.title].filter(Boolean).join(' · ')};
}
export function subagentEffortLabel(child:SubagentInfo):{text:string;title:string}|undefined {
 const value=child.reasoningEffort?.trim(),basis=child.reasoningEffortBasis;
 if(!value||!(/^[^\x00-\x1f\x7f-\x9f]{1,128}$/).test(value)||!['creation','turn'].includes(basis??''))return undefined;
 return basis==='creation'?{text:`${value}（開始時）`,title:'開始時のeffort（現在の設定は変更されている場合があります）'}:{text:`${value}（記録）`,title:'取得したターンのeffort（現在の設定は変更されている場合があります）'};
}
export function subagentModelLabel(child:SubagentInfo):string|undefined {
 const model=child.type?.trim(),effort=subagentEffortLabel(child);return model?[model,effort?.text].filter(Boolean).join(' '):effort?`effort ${effort.text}`:undefined;
}
