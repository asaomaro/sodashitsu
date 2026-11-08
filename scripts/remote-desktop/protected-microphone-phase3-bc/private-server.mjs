// Child-owned fixture process: never starts the normal serve command or prints freshToken.
import {readFile,writeFile,rename} from 'node:fs/promises';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
import {observeResourceEpochs} from './resource-observer.mjs';
let server,observer,poll;
try{
 const config=JSON.parse(await readFile(process.argv[2],'utf8'));
 if(process.platform!=='win32'||!config.approved||!['B','C'].includes(config.scenario))throw Error('fixture-not-approved');
 process.env.SODA_ASSISTANT_ENABLED='0';process.env.NODE_REPL_HISTORY='';for(const key of ['NODE_OPTIONS','NODE_PATH','NODE_REPL_EXTERNAL_MODULE','NODE_REPL_EXTERNAL_MODULE_PRELOAD'])delete process.env[key];
 process.chdir(config.cwd);
 const {DesktopResourceChannel}=await import(pathToFileURL(resolve(config.productRoot,'packages/server/dist/desktop/DesktopResourceChannel.js')).href);observer=observeResourceEpochs(DesktopResourceChannel);
 const {composeServer}=await import(pathToFileURL(resolve(config.productRoot,'packages/server/dist/composeServer.js')).href);
 server=await composeServer({host:'127.0.0.1',port:config.port,stateDir:config.stateDir,origin:[],shell:process.execPath});
 await server.listen();
 const panes=server.session.snapshot().panes;
 if(panes.length!==1||panes[0].cwd!==config.cwd||panes[0].agent!==null||panes[0].shell!==process.execPath)throw Error('own-initial-pane-proof');
 await writeFile(join(config.jobRoot,'server-ready.json'),JSON.stringify({pid:process.pid,ownInitialPaneProof:{count:1,cwdMatches:true,nodeShellMatches:true,agentAbsent:true}}),{flag:'wx',mode:0o600});
 let writing=false;poll=setInterval(()=>{if(writing)return;writing=true;void writeFile(join(config.jobRoot,'epoch.tmp'),JSON.stringify(observer.sample()),{mode:0o600}).then(()=>rename(join(config.jobRoot,'epoch.tmp'),join(config.jobRoot,'epoch.json'))).catch(()=>{}).finally(()=>{writing=false;});},10);
 const ttl=setTimeout(()=>stop(),240000);const stop=async()=>{clearTimeout(ttl);clearInterval(poll);await server.close();observer.close();await writeFile(join(config.jobRoot,'server-closed'),'',{flag:'wx'});process.exit(0);};
 process.on('message',m=>{if(m==='stop')void stop();});process.on('disconnect',()=>void stop());
}catch{if(server)await server.close().catch(()=>{});process.exit(2);}
