#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile), pending = new Map(), rendered = new Map(), active = new Map();
let sequence=0, key='user:commit-graph', panes=[], queue=Promise.resolve();
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function call(method,params){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Sodashitsuの応答がありません'));},15000);pending.set(id,{resolve,reject,timer});process.stdout.write(JSON.stringify({id,method,params})+'\n');});}
function content(root,history){return `<style>body{margin:0;font:13px/1.6 system-ui;background:var(--soda-bg);color:var(--soda-fg)}main{padding:12px}h1{font-size:16px;margin:0 0 8px}pre{font:12px/1.7 monospace;white-space:pre;overflow:auto}small{overflow-wrap:anywhere;opacity:.7}button{font:inherit}</style><main><h1>コミットグラフ</h1><small>${esc(root)}</small><p><button data-soda-action="refresh">更新</button></p><pre>${esc(history)}</pre></main>`;}
async function reconcile(force=false){
 const wanted=new Map();
 for(const pane of panes){
  if(!pane.projectDir)continue;
  const requests=[...(pane.plugin?.extensionKey===key&&pane.plugin.display==='commit-graph'?[{display:'commit-graph',placement:'right'}]:[]),...(pane.views??[]).filter(v=>v.extensionKey===key&&v.viewId==='history')];
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
  const html=content(v.root,histories.get(v.root));
  if(force||rendered.get(id)!==html){await call('display.set',{paneId:v.paneId,name:v.display,title:'コミットグラフ',kind:'panel',format:'html',content:html,dock:v.placement,size:360,collapsed:false});rendered.set(id,html);}
 }
 active.clear();for(const [id,v]of wanted)active.set(id,v);
}
function schedule(force=false){queue=queue.then(()=>reconcile(force)).catch(e=>process.stderr.write(String(e.message).slice(0,1000)+'\n'));}
const input=createInterface({input:process.stdin});
input.on('line',line=>{let msg;try{msg=JSON.parse(line);}catch{return;}
 if(msg.type==='ext.result'){const p=pending.get(msg.id);if(p){pending.delete(msg.id);clearTimeout(p.timer);msg.ok?p.resolve(msg.result):p.reject(new Error(msg.error?.message??'表示を更新できません'));}return;}
 if(msg.type==='ext.hello'){key=msg.extension.scope==='user'?`user:${msg.extension.id}`:`project:${createHash('sha256').update(msg.extension.root).digest('hex')}:${msg.extension.id}`;return;}
 if(msg.type==='ext.panes'){panes=msg.panes??[];schedule();}
 if(msg.type==='display.action'&&msg.action==='refresh')schedule(true);
});
const poll=setInterval(()=>schedule(),5000);
function stop(){clearInterval(poll);for(const pofpending of pending.values())clearTimeout(pofpending.timer);input.close();process.exit(0);}
input.on('close',stop);process.on('SIGTERM',stop);process.on('SIGINT',stop);
