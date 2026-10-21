import { chmod, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openBrowser, dialog } from "../support/askForm.js";

test("B plugin requests A agent; user accepts, native task is passed, MCP reports to B and asks on A",async({page,appServer})=>{
  test.skip(process.platform==="win32","POSIX fixture executable");test.setTimeout(90000);
  const bin=join(appServer.stateDir,"fixture-bin"),argvFile=join(appServer.stateDir,"native-argv.json");await mkdir(bin);
  await writeFile(join(bin,"claude"),`#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(argvFile)},JSON.stringify(process.argv.slice(2)));setInterval(()=>{},1000);`);await chmod(join(bin,"claude"),0o700);
  const originalPath=process.env.PATH;process.env.PATH=bin+":"+originalPath;
  const b=await startAppServer(),bPage=await page.context().newPage();let mcp:ReturnType<typeof spawn>|undefined;
  try{
    const root=join(b.stateDir,"project");await mkdir(root);await writeFile(join(root,"task.md"),"Read remote skills; create a script; report progress using the plugin operation.");
    const script=join(b.stateDir,"plugin.mjs");
    await writeFile(script,`
import {createInterface} from 'node:readline';
let seq=0,anchor,requestId,report='',signature='';const pending=new Map();
const send=o=>process.stdout.write(JSON.stringify(o)+'\\n');
const call=(method,params)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});send({id,method,params});});
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;');
async function render(){if(!anchor)return;const state=requestId?await call('task.status',{paneId:anchor.id,requestId}):{status:'ready'};const content='<h1>Remote plugin</h1><p>'+esc(report)+'</p><pre>'+esc(JSON.stringify(state))+'</pre>';if(content===signature)return;signature=content;await call('display.set',{paneId:anchor.id,name:'app',kind:'panel',format:'html',content});}
createInterface({input:process.stdin}).on('line',async line=>{try{const m=JSON.parse(line);
 if(m.type==='ext.result'){const p=pending.get(m.id);pending.delete(m.id);m.ok?p?.resolve(m.result):p?.reject(Error(m.error?.message));}
 if(m.type==='ext.hello')await call('app.register',{operations:[{name:'start',description:'Start operator task',inputSchema:{type:'object'}},{name:'report',description:'Report progress',inputSchema:{type:'object'}}]});
 if(m.type==='ext.panes'){anchor=m.panes.find(p=>p.plugin?.extensionKey==='user:fixture');await render();}
 if(m.type==='app.call'){if(m.operation==='start'){const task=await call('task.start',{paneId:m.target.paneId,kind:'claude',taskFile:'task.md',execution:'operator'});requestId=task.requestId;}else report=String(m.params.message);await render();send({method:'app.result',params:{callId:m.callId,ok:true,result:{recorded:true}}});}
}catch(e){process.stderr.write(String(e)+'\\n');}});
setInterval(()=>void render().catch(()=>{}),1000);
`);
    await writeFile(join(b.stateDir,"extensions.json"),JSON.stringify({extensions:[{id:"fixture",command:`"${process.execPath}" "${script}"`,allow:["agent-start"],tabView:{title:"Remote plugin",display:"app"}}]}),{mode:0o600});
    const aClient=await appServer.openClient(),bClient=await b.openClient();await bClient.request("extension.reload",{});
    const ws=await bClient.request("workspace.create",{cwd:root});await bClient.request("workspace.set_project_folder",{workspaceId:ws.workspace.id,path:root});
    const app=await bClient.request("tab.create",{workspaceId:ws.workspace.id,plugin:{extensionKey:"user:fixture",display:"app"}});
    await expect.poll(async()=>{try{return(await bClient.request("plugin.operations",{key:"user:fixture",tabId:app.tab.id})).operations.length;}catch{return 0;}}).toBe(2);
    const invite=await aClient.request("machine.invite",{label:"plugin-B"});await bClient.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
    await expect.poll(async()=>(await aClient.request("machine.list",{})).machines.find(m=>m.id===invite.machineId)?.state).toBe("online");
    await openBrowser(page,appServer);await page.locator(`[data-machine-id="${invite.machineId}"] .machine-select`).click();
    await bClient.request("plugin.call",{key:"user:fixture",tabId:app.tab.id,operation:"start",params:{}});
    const notice=page.getByRole("complementary",{name:"接続先からのエージェント起動要求"});await expect(notice).toContainText("user:fixture");await expect(notice).toContainText("task.md");
    await notice.getByRole("button",{name:"起動",exact:true}).click();await expect(notice).toHaveCount(0);
    await expect.poll(async()=>{try{return JSON.parse(await readFile(argvFile,"utf8")).at(-1);}catch{return "";}}).toContain('"task.md"');
    const directory=join(appServer.stateDir,"work-agents","launches",(await readdir(join(appServer.stateDir,"work-agents","launches")))[0]!);
    mcp=spawn(process.execPath,[fileURLToPath(new URL("../../../cli/dist/main.js",import.meta.url)),"work-agent-mcp",join(directory,"capability.json")],{stdio:["pipe","pipe","pipe"]});
    const replies=new Map<number,any>();let buffer="";mcp.stdout!.on("data",bytes=>{buffer+=String(bytes);let end;while((end=buffer.indexOf("\n"))>=0){const r=JSON.parse(buffer.slice(0,end));replies.set(r.id,r);buffer=buffer.slice(end+1);}});
    const send=(id:number,method:string,params?:object)=>mcp!.stdin!.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");
    send(1,"initialize");await expect.poll(()=>replies.has(1)).toBe(true);
    send(2,"tools/call",{name:"remote_work",arguments:{operation:"plugin",request:{action:"operations"}}});await expect.poll(()=>replies.has(2)).toBe(true);expect(JSON.parse(replies.get(2).result.content[0].text).paneId).toBe(app.tab.displayPaneId??app.pane.id);
    send(3,"tools/call",{name:"remote_work",arguments:{operation:"plugin",request:{action:"call",name:"report",params:{message:"Progress from operator agent"}}}});await expect.poll(()=>replies.has(3)).toBe(true);expect(replies.get(3).result.isError).toBeUndefined();
    await bPage.goto(`${b.origin}/#token=${b.token}`);const frame=bPage.frameLocator('[data-plugin-view] iframe[data-display-frame]');await expect(frame.getByText("Progress from operator agent",{exact:true})).toBeVisible();await expect(frame.locator("pre")).toContainText('"status":"launched"');
    send(4,"tools/call",{name:"ask_user",arguments:{spec:{title:"Plugin question on A",questions:[{id:"ok",label:"Continue?",options:["yes","no"],default:"yes"}]}}});await expect(dialog(page)).toBeVisible();await expect(dialog(bPage)).toHaveCount(0);await page.locator("[data-ask-submit]").click();await expect.poll(()=>replies.has(4)).toBe(true);expect(JSON.parse(replies.get(4).result.content[0].text).status).toBe("answered");
  }finally{mcp?.kill();await bPage.close();await b.close();if(originalPath===undefined)delete process.env.PATH;else process.env.PATH=originalPath;}
});
