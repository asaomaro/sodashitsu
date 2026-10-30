#!/usr/bin/env node
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
const methods=['attach','observe','act','release'];
const pending=new Map(),shown=new Set();let sequence=0,panes=[],key="",closing=false;
function send(value){if(!closing)process.stdout.write(JSON.stringify(value)+'\n');}
function call(method,params){
 if(pending.size>=16)return Promise.reject(Error('処理中の操作の終了を待ってください'));
 return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('応答待ちを終了しました。操作を自動再送しないでください'));},21000);pending.set(id,{resolve,reject,timer});send({id,method,params});});
}
const secret={type:'string',pattern:'^[A-Za-z0-9_-]{43}$'};
const properties={attach:{ticket:secret},observe:{leaseId:secret,afterFrameSeq:{type:'integer',minimum:1},region:{type:'object',properties:{x:{type:'integer',minimum:0},y:{type:'integer',minimum:0},width:{type:'integer',minimum:1},height:{type:'integer',minimum:1}},required:['x','y','width','height'],additionalProperties:false}},act:{leaseId:secret,observationId:secret,inputs:{type:'array',minItems:1,maxItems:32,items:{type:'object'}}},release:{leaseId:secret}};
const descriptions={attach:'人が共有窓で発行したコードを一度だけ使用する',observe:'許可済み画面の最新画像を取得する',act:'確認済み画像に対する操作を送る（自動再送なし）',release:'このアプリ画面の操作許可を解放する'};
const operations=methods.map(name=>({name,description:descriptions[name],inputSchema:{type:'object',properties:properties[name],required:name==='attach'?['ticket']:name==='act'?['leaseId','observationId','inputs']:['leaseId'],additionalProperties:false}}));
const input=createInterface({input:process.stdin});
input.on('line',line=>{
 let message;try{message=JSON.parse(line);}catch{return;}
 if(message.type==='ext.result'){
  const p=pending.get(message.id);if(!p)return;pending.delete(message.id);clearTimeout(p.timer);
  message.ok?p.resolve(message.result):p.reject(Error(message.error?.message??'操作できません'));return;
 }
 if(message.type==='ext.hello'){
  key=message.extension.scope==='user'?`user:${message.extension.id}`:`project:${createHash('sha256').update(message.extension.root).digest('hex')}:${message.extension.id}`;
  if(!methods.every(name=>message.methods?.includes(`desktop.agent.${name}`))){process.stderr.write('desktop-agentの許可と対応するサーバーが必要です\n');return;}
  void call('app.register',{operations}).catch(()=>process.stderr.write('操作の登録に失敗しました\n'));return;
 }
 if(message.type==='ext.panes'){
  panes=message.panes??[];for(const id of shown)if(!panes.some(p=>p.id===id))shown.delete(id);
  for(const pane of panes){
   if(pane.plugin?.extensionKey!==key||shown.has(pane.id)||shown.size>=16)continue;shown.add(pane.id);
   void call('display.set',{paneId:pane.id,name:pane.plugin.display,title:'デスクトップ操作',kind:'panel',format:'html',content:'<main><h1>デスクトップ操作</h1><p>このアプリは plugin operations / plugin call から利用します。共有窓で発行した一度限りのコードによる attach、observe、act、release に対応します。</p><p>画面提供・操作の許可は自動では取得しません。使用後は release で解放してください。</p></main>'}).catch(()=>{shown.delete(pane.id);});
  }return;
 }
 if(message.type==='app.call'){
  void (async()=>{
   try{
    const pane=panes.find(p=>p.id===message.target?.paneId&&p.tabId===message.target?.tabId&&p.workspaceId===message.target?.workspaceId);
    if(!pane||!methods.includes(message.operation))throw Error('対象のアプリ画面がありません');
    const params=message.params??{};if(!params||typeof params!=='object'||Array.isArray(params)||Object.keys(params).some(key=>!Object.hasOwn(properties[message.operation],key)))throw Error('未対応の入力項目です');
    const result=await call(`desktop.agent.${message.operation}`,{...params,paneId:pane.id});
    // Do not enlarge the existing plugin.call limit or silently persist screenshots.
    if(Buffer.byteLength(JSON.stringify(result))>256*1024-1024)throw Error('結果がplugin.callの上限を超えます。共有窓の画像の幅または品質を下げて、改めて取得してください');
    send({method:'app.result',params:{callId:message.callId,ok:true,result}});
   }catch(error){send({method:'app.result',params:{callId:message.callId,ok:false,error:String(error.message).slice(0,500)}});}
  })();
 }
});
process.stdout.on('error',()=>{closing=true;input.close();});
input.on('close',()=>{closing=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('拡張が停止しました'));}pending.clear();});
