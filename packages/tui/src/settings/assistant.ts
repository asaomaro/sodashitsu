import type {AssistantSettingsResult} from '@sodashitsu/protocol';
import {onOff,type SettingsSection} from './items.js';
export function assistantSection(port:{get():Promise<AssistantSettingsResult>;set(enabled:boolean):Promise<AssistantSettingsResult>},changed:()=>void):SettingsSection{
 let state:AssistantSettingsResult|undefined,busy=true,message='読み込み中…';
 const refresh=()=>{void port.get().then(value=>{state=value;message=value.message||({disabled:'無効',preparing:'共通ランタイムを準備中',starting:'起動中',running:'起動済み',stopping:'停止中',error:'起動を確認してください'}[value.phase]);}).catch(()=>{message='設定を取得できません';}).finally(()=>{busy=false;changed();});};refresh();
 const save=(enabled:boolean)=>{if(busy||!state?.canConfigure)return;busy=true;void port.set(enabled).then(value=>{state=value;message=enabled?'有効にしました。初回は共通ランタイムを準備します。':'無効にしました。準備・起動中の処理を停止します。';}).catch(()=>{message='設定を保存できません';}).finally(()=>{busy=false;changed();});};
 return{id:'desktop-assistant',label:'デスクトップアシスタント',items:()=>[{label:message,heading:true},{label:'専用アプリの手動導入は不要です。WSLではWindowsへ表示します。',heading:true},{label:'アシスタントを有効にする',value:onOff(state?.enabled===true),toggle:true,disabled:busy||!state?.canConfigure,activate:()=>save(!state?.enabled)},{label:'準備・起動を再試行',disabled:busy||!state?.canConfigure||!state.enabled,activate:()=>save(true)},{label:'状態を更新',disabled:busy,activate:()=>{busy=true;refresh();}}]};
}
