import type {AssistantLaunch} from './AssistantLaunchConfig.js';
import {assistantNativeRoot} from './AssistantNativeRoot.js';
import {AssistantRuntimeCache} from './AssistantRuntimeCache.js';
import {prepareAssistantHostApp} from './AssistantHostApp.js';
import {desktopAssistantOrigin} from '@sodashitsu/protocol';
interface Dependencies{root?:typeof assistantNativeRoot;runtime?:(root:import("./AssistantRuntimeCache.js").AssistantRuntimeRoot)=>Pick<AssistantRuntimeCache,"prepare"|"dispose">;app?:typeof prepareAssistantHostApp}
/** No executable/file inputs from RPC. Invoked only while one explicit enable owns its signal. */
export async function bundledAssistantLaunch(origin:string,signal:AbortSignal,check:()=>void,deps:Dependencies={}):Promise<AssistantLaunch>{
 const expires=performance.now()+240000;
 const live=()=>{signal.throwIfAborted();check();if(performance.now()>=expires)throw Error('アシスタントの準備が時間切れです');signal.throwIfAborted();};
 live();const host=await(deps.root??assistantNativeRoot)({signal,expires,check:live});live();
 let launch:AssistantLaunch;
 const cache=deps.runtime?deps.runtime(host.root):new AssistantRuntimeCache(async()=>host.root);
 try{
  const runtime=await cache.prepare(host.platform,host.arch,{signal,expires,check:live});live();
  const app=await(deps.app??prepareAssistantHostApp)(host.root,live);live();
  const appPath=await host.nativePath(app);live();
  await host.root.assert();live();launch={command:[runtime.executable,appPath],origin:desktopAssistantOrigin(origin)};
 }finally{await cache.dispose();}
 live();return launch;
}
