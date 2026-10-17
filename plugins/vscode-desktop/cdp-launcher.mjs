#!/usr/bin/env node
// Run on the Windows desktop host (directly, or through WSL interop).
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { targets, loopbackUrl, main as bridgeMain } from './cdp-bridge.mjs';
import { sodaOrigin } from './resident-bridge.mjs';

export function launcherOptions(argv) {
  const options = { allowInput:false, allowFit:false };
  for (let i=0;i<argv.length;i++) {
    const key=argv[i];
    if(key==='--allow-input') options.allowInput=true;
    else if(key==='--allow-fit') options.allowFit=true;
    else if(['--code','--user-data-dir','--cdp','--soda'].includes(key) && argv[i+1]) options[key.slice(2)]=argv[++i];
    else throw new Error('起動設定の引数が不正です');
  }
  if(!options.code || !options['user-data-dir'] || !options.soda || (options.allowFit&&!options.allowInput))
    throw new Error('--code、--user-data-dir、--sodaが必要です');
  options.soda=sodaOrigin(options.soda);
  options.cdp=loopbackUrl(options.cdp??'http://127.0.0.1:9222').href;
  return options;
}
const refusal = error => error?.cause?.cause?.code==='ECONNREFUSED' || error?.cause?.code==='ECONNREFUSED' ||
  error?.cause?.cause?.errors?.every(e=>e.code==='ECONNREFUSED');
export async function discover(options, { signal, list=targets, launch=spawn, pause=ms=>new Promise(r=>setTimeout(r,ms)) }={}) {
  signal?.throwIfAborted();
  let found;
  try { found=await list(options.cdp); }
  catch(error) {
    if(!refusal(error)) throw error;
    signal?.throwIfAborted();
    // Dedicated user-data-dir is mandatory. Never terminate/restart any existing VSCode.
    const child=launch(options.code, ['--new-window','--user-data-dir',options['user-data-dir'],
      `--remote-debugging-port=${new URL(options.cdp).port||80}`,'--remote-debugging-address=127.0.0.1'],
      {stdio:'ignore',detached:true,windowsHide:false,shell:false});
    await new Promise((resolve,reject)=>{ child.once('spawn',resolve);child.once('error',reject); });
    child.unref();
  }
  for(let attempt=0;attempt<80;attempt++) {
    signal?.throwIfAborted();
    if(found?.length) return found;
    await pause(250);
    try { found=await list(options.cdp); } catch(error) { if(!refusal(error)) throw error; }
  }
  throw new Error('VSCodeのCDP画面を確認できませんでした。通常起動済みのVSCodeは自動再起動しません');
}
function readRequest() {
  return new Promise((resolve,reject)=>{
    let text='';
    function data(chunk) {
      text+=chunk.toString();
      if(Buffer.byteLength(text)>8192){cleanup();reject(new Error('request limit'));return;}
      const newline=text.indexOf('\n');
      if(newline<0)return;
      cleanup();
      try{resolve(JSON.parse(text.slice(0,newline)));}catch{reject(new Error('invalid request'));}
    }
    function end(){cleanup();reject(new Error('cancelled'));}
    function cleanup(){process.stdin.off('data',data);process.stdin.off('end',end);process.stdin.off('error',end);}
    process.stdin.on('data',data);process.stdin.once('end',end);process.stdin.once('error',end);
  });
}
async function main() {
  const options=launcherOptions(process.argv.slice(2));
  const request=await readRequest();
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  process.stdin.once('end',cancel);process.stdin.once('error',cancel);
  for(const name of ['SIGINT','SIGTERM'])process.once(name,cancel);
  if(process.stdin.readableEnded)cancel();
  if(request?.type==='discover') {
    const found=await discover(options,{signal:controller.signal});
    console.log(JSON.stringify({type:'targets',targets:found.slice(0,32).map(t=>({id:t.id,title:String(t.title??'VSCode').slice(0,256)}))}));
    process.stdin.destroy();
    return;
  }
  if(request?.type!=='connect'||typeof request.targetId!=='string'||!/^[a-zA-Z0-9_-]{1,256}$/.test(request.targetId)||!/^[a-f0-9]{64}$/.test(request.token??''))
    throw new Error('invalid connect request');
  // connect never starts or substitutes a target; the exact selected workbench must still exist.
  const available=await targets(options.cdp);
  if(!available.some(t=>t.id===request.targetId))throw new Error('選択したVSCodeがありません');
  controller.signal.throwIfAborted();
  console.log(JSON.stringify({type:'connecting'}));
  await bridgeMain(['--cdp',options.cdp,'--soda',options.soda,'--token',request.token,'--target',request.targetId,
    ...(options.allowInput?['--allow-input']:[]),...(options.allowFit?['--allow-fit']:[])],{signal:controller.signal});
  // Bridge remains alive via its socket. Let stdin EOF cancel it, and let socket close end the helper.
  process.stdin.unref?.();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  main().catch(()=>{console.error('Windows側のVSCode起動・接続に失敗しました');process.exitCode=1;process.stdin.destroy();});
