#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile), pending = new Map(), rendered = new Map(), active = new Map();
let sequence=0, key='user:commit-graph', panes=[], queue=Promise.resolve();
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function call(method,params){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Sodashitsuの応答がありません'));},15000);pending.set(id,{resolve,reject,timer});process.stdout.write(JSON.stringify({id,method,params})+'\n');});}
function content(root,history,mobile=false){return `<style>${mobile?'body{font-size:16px!important}button{min-height:44px;padding:8px 14px}pre{white-space:pre-wrap!important;overflow-wrap:anywhere}main{padding:10px!important}':''}body{margin:0;font:13px/1.6 system-ui;background:var(--soda-bg);color:var(--soda-fg)}main{padding:12px}h1{font-size:16px;margin:0 0 8px}pre{font:12px/1.7 monospace;white-space:pre;overflow:auto}small{overflow-wrap:anywhere;opacity:.7}button{font:inherit}</style><main><h1>${mobile?'コミット履歴（モバイル）':'コミットグラフ'}</h1><small>${esc(root)}</small><p><button data-soda-action="refresh">更新</button></p><pre>${esc(history)}</pre></main>`;}
async function reconcile(force=false){
 const wanted=new Map();
 for(const pane of panes){
  if(!pane.projectDir)continue;
  const requests=[...(pane.plugin?.extensionKey===key&&pane.plugin.display==='commit-graph'?[{display:'commit-graph',placement:'right'},...(pane.plugin.mobileDisplay?[{display:pane.plugin.mobileDisplay,placement:'right',mobile:true}]:[])]:[]),...(pane.views??[]).filter(v=>v.extensionKey===key&&v.viewId==='history')];
  for(const v of requests)wanted.set(`${pane.id}|${v.display}`,{paneId:pane.id,root:pane.projectDir,...v});
 }
 for(const [id,v]of active)if(!wanted.has(id)){await call('display.close',{paneId:v.paneId,name:v.display}).catch(()=>{});rendered.delete(id);}
 const histories=new Map();
 for(const [id,v]of wanted){
  if(!histories.has(v.root)){
   let history;
   try{history=(await execute('git',['-C',v.root,'log','--graph','--oneline','--decorate','--all','-n','100'],{timeout:5000,maxBuffer:256*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}})).stdout;}
   catch{history='コミット履歴を読み込めません。GitリポジトリとGitの導入を確認してください。';}
   histories.set(v.root,history);
  }
  const html=content(v.root,histories.get(v.root),v.mobile===true);
  if(force||rendered.get(id)!==html){await call('display.set',{paneId:v.paneId,name:v.display,title:'コミットグラフ',kind:'panel',format:'html',content:html,dock:v.placement,size:360,collapsed:false});rendered.set(id,html);}
 }
 active.clear();for(const [id,v]of wanted)active.set(id,v);
}
function schedule(force=false){queue=queue.then(()=>reconcile(force)).catch(e=>process.stderr.write(String(e.message).slice(0,1000)+'\n'));}
const input=createInterface({input:process.stdin});
input.on('line',line=>{let msg;try{msg=JSON.parse(line);}catch{return;}
 if(msg.type==='ext.result'){const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.ok?p.resolve(msg.result):p.reject(new Error(msg.error?.message??'表示を更新できません'));}return;}
 if(msg.type==='ext.hello'){void call('app.register',{operations:[{name:'history',description:'指定した制作環境のコミット履歴を返す',inputSchema:{type:'object',properties:{limit:{type:'integer',minimum:1,maximum:100}},additionalProperties:false}},{name:'refresh',description:'コミットグラフを再読込する',inputSchema:{type:'object',properties:{},additionalProperties:false}}]}).catch(e=>process.stderr.write(String(e.message)+'\n'));key=msg.extension.scope==='user'?`user:${msg.extension.id}`:`project:${createHash('sha256').update(msg.extension.root).digest('hex')}:${msg.extension.id}`;return;}
 if(msg.type==='app.call'){
  const executeOperation=async()=>{
   const pane=panes.find(p=>p.id===msg.target?.paneId&&p.tabId===msg.target?.tabId&&p.workspaceId===msg.target?.workspaceId);
   if(!pane?.projectDir)throw new Error('対象のPJフォルダがありません');
   const params=msg.params??{};
   if(msg.operation==='history'){
    if(Object.keys(params).some(k=>k!=='limit')||params.limit!==undefined&&(!Number.isInteger(params.limit)||params.limit<1||params.limit>100))throw new Error('limitは1〜100の整数です');
    const r=await execute('git',['-C',pane.projectDir,'log','--graph','--oneline','--decorate','--all','-n',String(params.limit??100)],{timeout:5000,maxBuffer:256*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0'}});
    return {history:r.stdout};
   }
   if(msg.operation==='refresh'){if(Object.keys(params).length)throw new Error('パラメータは不要です');const task=queue.then(()=>reconcile(true));queue=task.catch(()=>undefined);await task;return {updated:true};}
   throw new Error('未対応の操作です');
  };
  void executeOperation().then(result=>call('app.result',{callId:msg.callId,ok:true,result})).catch(()=>call('app.result',{callId:msg.callId,ok:false,error:'操作に失敗しました。対象とパラメータを確認してください'})).catch(()=>undefined);
  return;
 }
 if(msg.type==='ext.panes'){panes=msg.panes??[];schedule();}
 if(msg.type==='display.action'&&msg.action==='refresh')schedule(true);
});
const poll=setInterval(()=>schedule(),5000);
function stop(){clearInterval(poll);for(const pofpending of pending.values())clearTimeout(pofpending.timer);input.close();process.exit(0);}
input.on('close',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
