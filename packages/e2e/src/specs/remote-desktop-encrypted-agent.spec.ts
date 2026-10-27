import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {spawn,type ChildProcessWithoutNullStreams} from "node:child_process";
import {createInterface} from "node:readline";
import WebSocket from "ws";
import type {Page} from "@playwright/test";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {parseDesktopAgentGrant,formatDesktopAgentGrant} from "@sodashitsu/protocol";
import {DesktopRelay} from "../../../server/dist/desktop/DesktopRelay.js";
import {DesktopEncryptedAgentSession} from "../../../cli/dist/desktopEndpointSession.js";
import {expect,test} from "../support/fixtures.js";
import {startAppServer,type AppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";

// Product browser/Root/B/CLI crypto with generated keys, screenshots and helper
// input only. Observe browser pixels/state and user-facing CLI responses; Root
// inbound wire recording is additional evidence that capabilities stay opaque.
async function setup(page:Page,appServer:AppServer){
 const directory=await mkdtemp(join(tmpdir(),"soda-encrypted-agent-")),record=join(directory,"input.jsonl"),identityDir=join(directory,"identity"),saved=process.env.SODA_DESKTOP_COMMAND,savedInput=process.env.SODA_DESKTOP_ALLOW_INPUT;
 process.env.SODA_DESKTOP_COMMAND=JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input","--static","--record",record]);process.env.SODA_DESKTOP_ALLOW_INPUT="1";
 const provider=await startAppServer().finally(()=>{if(saved===undefined)delete process.env.SODA_DESKTOP_COMMAND;else process.env.SODA_DESKTOP_COMMAND=saved;if(savedInput===undefined)delete process.env.SODA_DESKTOP_ALLOW_INPUT;else process.env.SODA_DESKTOP_ALLOW_INPUT=savedInput;});
 await page.addInitScript(()=>{const dispatch=EventTarget.prototype.dispatchEvent;EventTarget.prototype.dispatchEvent=function(event){const endpoint=this as EventTarget&{wire?:unknown;root?:unknown;invite?:unknown;url?:string};if(event.type==="open"&&endpoint.wire&&endpoint.root&&!endpoint.invite&&endpoint.url?.includes("/desktop-share"))(window as unknown as{__generatedEndpoint?:unknown}).__generatedEndpoint=endpoint;return dispatch.call(this,event);};});
 const owner=await provider.openClient(),operator=await appServer.openClient(),store=new DesktopEndpointStore({stateDir:identityDir});await store.prepareDirectory();const cli=await store.initialize();store.close();await store.settled();
 const packets:Buffer[]=[],port=Number(new URL(appServer.origin).port),emit=WebSocket.prototype.emit;
 WebSocket.prototype.emit=function(this:WebSocket,event:string|symbol,...args:unknown[]){
  const state=this as unknown as{_isServer?:boolean;_socket?:{localPort?:number}};
  if(event==="message"&&state._isServer&&state._socket?.localPort===port){const raw=args[0];if(typeof raw==="string")packets.push(Buffer.from(raw));else if(Buffer.isBuffer(raw))packets.push(Buffer.from(raw));else if(raw instanceof ArrayBuffer)packets.push(Buffer.from(raw));}
  return Reflect.apply(emit,this,[event,...args]);
 };
 const sessions:{close():void}[]=[],children:ChildProcessWithoutNullStreams[]=[];
 const close=async()=>{for(const child of children)child.kill();for(const session of sessions)session.close();WebSocket.prototype.emit=emit;await page.goto("about:blank");owner.close();operator.close();await provider.close();await rm(directory,{recursive:true,force:true});};
 try{
  await operator.request("prefs.set",{patch:{notifyHintDone:true}});const invite=await operator.request("machine.invite",{label:"Encrypted agent B"});await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  const identity=await owner.request("desktop.endpoint.initialize",{});await owner.request("desktop.endpoint.required",{required:true});await owner.request("desktop.endpoint.trust",{fingerprint:cli.fingerprint,role:"agent",label:"Generated CLI"});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),pairing=view.locator("[data-desktop-endpoint]");await pairing.locator("summary").click();await pairing.getByRole("button",{name:"このブラウザの鍵を作成",exact:true}).click();const fingerprint=pairing.locator("[data-browser-fingerprint]");await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);await owner.request("desktop.endpoint.trust",{fingerprint:(await fingerprint.textContent())!,role:"viewer",label:"Generated browser"});
  await pairing.getByLabel("接続先PCで確認した指紋",{exact:true}).fill(identity.fingerprint!);await pairing.getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました",{exact:true}).check();await pairing.getByRole("button",{name:"この接続先を記憶して暗号化で接続",exact:true}).click();
  const canvas=view.getByLabel("共有画面");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect(view.locator('[data-endpoint-encrypted]')).toBeVisible();await expect(view.locator('[data-agent-access]')).toBeVisible();await view.locator('[data-agent-access] summary').click();await expect(view.getByLabel("許可するエージェント")).toHaveValue(cli.fingerprint);
  const code=view.getByLabel("エージェント接続コード"),grantButton=view.getByRole("button",{name:"エージェントへの画面提供・操作を許可",exact:true});
  async function grant(){await expect(async()=>{if(!await code.count())await grantButton.click();await expect(code).toHaveValue(/^soda-e2e-agent-v1\./);}).toPass({intervals:[250,500,1000],timeout:10000});return code.inputValue();}
  async function open(code:string){const session=await DesktopEncryptedAgentSession.open({opts:{url:appServer.origin,token:appServer.token,urlExplicit:true},sessions:{get:async()=>appServer.cookie,set:async()=>{},clear:async()=>{}},code,fingerprint:identity.fingerprint!,identityDir,signal:new AbortController().signal});sessions.push(session);return session;}
  return{directory,record,identityDir,cli,identity,machine:invite.machineId,owner,view,canvas,code,grantButton,grant,open,packets,sessions,children,close};
 }catch(error){await close();throw error;}
}

test("encrypted recipient observes product pixels, forwards raw Ctrl+Space, drains release and cannot revive after retrust",async({page,appServer})=>{
 test.setTimeout(120000);const f=await setup(page,appServer);
 try{
  await expect(f.open(formatDesktopAgentGrant({version:1,machineId:f.machine,origin:appServer.origin,provider:f.identity.fingerprint!,recipient:f.cli.fingerprint,scope:"s".repeat(43),ticket:"t".repeat(43),expiresAt:Date.now()+30000}))).rejects.toThrow();await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");
  const code=await f.grant(),grant=parseDesktopAgentGrant(code);await expect(f.open(formatDesktopAgentGrant({...grant,scope:"w".repeat(43)}))).rejects.toThrow();const session=await f.open(code);await expect(f.view.locator('[data-desktop-status]')).toHaveText("エージェント操作中");await expect(f.code).toHaveCount(0);
  const frame=await session.observe();expect(await f.canvas.evaluate(async(element,frame)=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(frame.imageBase64),c=>c.charCodeAt(0))],{type:frame.format})),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=canvas.getContext("2d")!;ctx.drawImage(bitmap,0,0);bitmap.close();const visible=element as HTMLCanvasElement;return visible.width===frame.width&&visible.height===frame.height&&Array.from(ctx.getImageData(30,30,1,1).data).join()===Array.from(visible.getContext("2d")!.getImageData(30,30,1,1).data).join();},frame)).toBe(true);
  const inputs=[{kind:"key" as const,code:"ControlLeft",down:true},{kind:"key" as const,code:"Space",down:true},{kind:"key" as const,code:"Space",down:false},{kind:"key" as const,code:"ControlLeft",down:false}];expect((await session.act(frame.observationId,inputs)).acknowledged).toBe(4);expect((await readFile(f.record,"utf8")).trim().split("\n").map(line=>JSON.parse(line))).toEqual(inputs);
  expect(await session.release()).toEqual({released:true});expect(session.abort.signal.aborted).toBe(true);await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");
  const nextCode=await f.grant(),next=await f.open(nextCode);await expect(f.view.locator('[data-desktop-status]')).toHaveText("エージェント操作中");await f.owner.request("desktop.endpoint.revoke",{fingerprint:f.cli.fingerprint,role:"agent"});await expect.poll(()=>next.abort.signal.aborted).toBe(true);await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");await f.owner.request("desktop.endpoint.trust",{fingerprint:f.cli.fingerprint,role:"agent",label:"Generated CLI retrusted"});await expect(f.open(nextCode)).rejects.toThrow();
  for(const [lane,kind,message]of [["files",1,{id:"2",method:"desktop.start",params:{}}],["control",2,{type:"connect",protocols:[]}]] as const){
   const attack=await f.open(await f.grant()),payload=new TextEncoder().encode(JSON.stringify(message)),record=new Uint8Array(payload.length+1);record[0]=kind;record.set(payload,1);await (attack as unknown as{wire:{send(lane:string,record:Uint8Array):Promise<void>}}).wire.send(lane,record);await expect.poll(()=>attack.abort.signal.aborted).toBe(true);await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");
  }
  expect((await readFile(f.record,"utf8")).trim().split("\n").map(line=>JSON.parse(line))).toEqual(inputs);
  expect(f.packets.some(packet=>[grant.ticket,grant.scope,frame.observationId,"desktop.agent.attach","imageBase64","ControlLeft"].some(needle=>packet.includes(Buffer.from(needle))))).toBe(false);
 }finally{await f.close();}
});

test("encrypted NDJSON child CLI returns its observation and release without plaintext Root RPC",async({page,appServer})=>{
 test.setTimeout(120000);const f=await setup(page,appServer);
 try{
  const code=await f.grant(),grant=parseDesktopAgentGrant(code),child=spawn(process.execPath,[fileURLToPath(new URL("../../../cli/dist/main.js",import.meta.url)),"desktop","session","--url",appServer.origin,"--endpoint-fingerprint",f.identity.fingerprint!,"--identity-dir",f.identityDir],{env:{...process.env,HOME:f.directory,USERPROFILE:f.directory,SODACTL_TOKEN:appServer.token,SODA_DESKTOP_GRANT:code},stdio:["pipe","pipe","pipe"]});f.children.push(child);
  const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();let stderr="";child.stderr.on("data",data=>stderr+=data);const first=await lines.next();expect(first.done,stderr).toBe(false);expect(JSON.parse(first.value!).ready).toBe(true);await expect(f.view.locator('[data-desktop-status]')).toHaveText("エージェント操作中");
  child.stdin.write(JSON.stringify({id:"observe",method:"observe"})+"\n");const observed=JSON.parse((await lines.next()).value!);expect(observed.id).toBe("observe");expect(observed.result.imageBase64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  child.stdin.write(JSON.stringify({id:"release",method:"release"})+"\n");const released=JSON.parse((await lines.next()).value!);expect(released).toEqual({id:"release",result:{released:true}});await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");
  expect(f.packets.some(packet=>[grant.ticket,grant.scope,"desktop.agent.attach","desktop.agent.observe","imageBase64"].some(needle=>packet.includes(Buffer.from(needle))))).toBe(false);
 }finally{await f.close();}
});

for(const mode of ["leave","takeover","raw takeover"] as const) test(`leaving during a held first grant cancels it before credential completion: ${mode}`,async({page,appServer})=>{
 test.setTimeout(120000);const f=await setup(page,appServer),original=DesktopEndpointStore.prototype.endpoint;
 const revoke=DesktopRelay.prototype.revokeEndpointAgent;
 let release!:()=>void,begun=false,cancelled=false,finished=false;const gate=new Promise<void>(resolve=>{release=resolve;}),tasks:Promise<unknown>[]=[];
 DesktopEndpointStore.prototype.endpoint=function(this:DesktopEndpointStore,...args:Parameters<DesktopEndpointStore["endpoint"]>){if(args[1]!=="agent"||args[0]!==f.cli.fingerprint)return original.apply(this,args);begun=true;const task=(async()=>{await gate;try{return await original.apply(this,args);}finally{finished=true;}})();tasks.push(task);return task;};
 DesktopRelay.prototype.revokeEndpointAgent=function(session){const result=revoke.call(this,session);if(begun)cancelled=true;return result;};
 try{
  await f.grantButton.click();await expect(f.grantButton).toBeDisabled();await expect.poll(()=>begun).toBe(true);if(mode==="leave"){await f.view.focus();await f.view.press("Escape");await f.view.press("Escape");}
  else if(mode==="takeover")await f.view.getByRole("button",{name:"操作する",exact:true}).click();
  else await page.evaluate(()=>{const endpoint=(window as unknown as{__generatedEndpoint:{send(value:string):void}}).__generatedEndpoint;endpoint.send(JSON.stringify({type:"control",enabled:true}));});
  await expect.poll(()=>cancelled).toBe(true);if(mode==="leave")expect(await f.view.evaluate(element=>element.contains(document.activeElement))).toBe(false);
  release();await expect.poll(()=>finished).toBe(true);const refresh=f.view.getByRole("button",{name:"候補を更新",exact:true});await refresh.click();await expect(refresh).toBeEnabled();await expect(f.code).toHaveCount(0);await expect(f.view.locator('[data-desktop-status]')).toHaveText(mode==="leave"?"閲覧中":"操作中");
 }finally{release();await Promise.allSettled(tasks);DesktopEndpointStore.prototype.endpoint=original;DesktopRelay.prototype.revokeEndpointAgent=revoke;await f.close();}
});
test("encrypted MCP child preserves image/tool responses and release",async({page,appServer})=>{
 test.setTimeout(120000);const f=await setup(page,appServer);
 try{
  const code=await f.grant(),grant=parseDesktopAgentGrant(code),child=spawn(process.execPath,[fileURLToPath(new URL("../../../cli/dist/main.js",import.meta.url)),"desktop","mcp","--url",appServer.origin,"--endpoint-fingerprint",f.identity.fingerprint!,"--identity-dir",f.identityDir],{env:{...process.env,HOME:f.directory,USERPROFILE:f.directory,SODACTL_TOKEN:appServer.token,SODA_DESKTOP_GRANT:code},stdio:["pipe","pipe","pipe"]});f.children.push(child);child.stderr.resume();const lines=createInterface({input:child.stdout})[Symbol.asyncIterator]();
  async function call(id:number,method:string,params:unknown){child.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");const line=await lines.next();expect(line.done).toBe(false);const response=JSON.parse(line.value!);expect(response.id).toBe(id);expect(response.error).toBeUndefined();return response.result;}
  expect((await call(1,"initialize",{})).serverInfo.name).toBe("sodashitsu-desktop");expect((await call(2,"tools/list",{})).tools.map((tool:{name:string})=>tool.name)).toContain("desktop_observe");
  const observed=await call(3,"tools/call",{name:"desktop_observe",arguments:{}});expect(observed.isError).not.toBe(true);expect(observed.content[0].type).toBe("image");expect(observed.content[0].data).toMatch(/^[A-Za-z0-9+/]+=*$/);await expect(f.view.locator('[data-desktop-status]')).toHaveText("エージェント操作中");
  const released=await call(4,"tools/call",{name:"desktop_release",arguments:{}});expect(released.isError).not.toBe(true);expect(JSON.parse(released.content[0].text)).toEqual({released:true});await expect(f.view.locator('[data-desktop-status]')).toHaveText("閲覧中");expect(f.packets.some(packet=>[grant.ticket,grant.scope,"desktop.agent.attach","desktop.agent.observe","imageBase64"].some(needle=>packet.includes(Buffer.from(needle))))).toBe(false);
 }finally{await f.close();}
});
