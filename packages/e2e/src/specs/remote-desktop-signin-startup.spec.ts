import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {desktopSigninCycle,type DesktopSigninRuntimeDependencies} from "../../../server/dist/desktop/DesktopSigninRuntime.js";
import {DesktopSigninEnrollment} from "../../../server/dist/desktop/DesktopSigninEnrollment.js";
import {DesktopSigninIdentity} from "../../../server/dist/desktop/DesktopSigninIdentity.js";
import {DesktopSigninEndpoint} from "../../../server/dist/desktop/DesktopSigninEndpoint.js";
import {DesktopSigninConnector} from "../../../server/dist/desktop/DesktopSigninConnector.js";
import {encodeDesktopFrame} from "@sodashitsu/protocol";
import {expect,test} from "../support/fixtures.js";
// Actual finite service composition/Root delegation/RPC/pinned browser wire,
// generated private keys and pixels. Only native presence/vault reader/capture
// are test seams. No SYSTEM Main, desktop capture/input or real enrollment.
for(const ending of ["source","policy"] as const)test(`signin startup serves real consent UI and revokes on ${ending}`,async({page,appServer})=>{
 test.skip(process.platform!=="linux","Generated owner-file key fixture uses Linux private directory policy");test.setTimeout(90000);
 const directory=await mkdtemp(join(tmpdir(),"soda-signin-startup-")),ownerSid="S-1-5-21-1-2-3-1001",placeholder="b".repeat(64),operator=await appServer.openClient();
 const writer=new DesktopEndpointStore({stateDir:directory});await writer.prepareDirectory();const provider=await writer.initialize();await writer.setRequired(true);await writer.trust({fingerprint:placeholder,role:"viewer",label:"Generated bootstrap viewer"});writer.close();await writer.settled();
 const invite=await operator.request("machine.invite",{label:"Generated readonly signin"});await operator.request("prefs.set",{patch:{notifyHintDone:true}});
 const {syntheticFrame}=await import(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url).href),frame=syntheticFrame(64,64,1,[0,255,0]);
 let desktopPage:typeof page|undefined;let peer=placeholder,launches=0,abort:AbortController|undefined,run:Promise<"inactive"|"ended">|undefined;
 function start(){
  abort=new AbortController();const signal=abort.signal,revision=randomUUID();
  const enrollment=DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify({version:1,purpose:"desktop-signin",revision,ownerSid,origin:appServer.origin,machineId:invite.machineId,token:invite.token,provider:provider.fingerprint,allowSignin:true,allowInput:false,peers:[{fingerprint:peer,label:"Generated browser"}]})),ownerSid);
  const deps:DesktopSigninRuntimeDependencies={now:()=>performance.now(),unsafeStop:()=>{throw Error("Generated cleanup failure");},
   presence:options=>({ready:async()=>({type:"signin_context",ownerSid,packageRoot:"C:\\generated",stateDir:"C:\\generated-runtime"}),active:()=>!options.signal.aborted&&options.active(),close:()=>{},settled:async()=>{}}),enrollment:async()=>enrollment,
   store:()=>new DesktopEndpointStore({stateDir:directory}),identity:options=>new DesktopSigninIdentity(options),connector:options=>new DesktopSigninConnector(options),
   endpoint:options=>new DesktopSigninEndpoint({...options,worker:worker=>{launches++;let closed=false;queueMicrotask(()=>{if(closed||!worker.active())return;worker.record(Buffer.from(JSON.stringify({type:"ready",title:"Generated signin",width:64,height:64,backend:"windows-gdi",secureDesktop:true,allowInput:false,imeKeys:true,extendedInput:true})),false);worker.record(encodeDesktopFrame(frame.info,Buffer.from(frame.data,"base64")),true);});return {send:()=>{},close:()=>{closed=true;},settled:async()=>{}};}}),
  };
  run=desktopSigninCycle(ownerSid,signal,deps);void run.catch(()=>{});
 }
 try{
  start();await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await expect(header.getByRole("button",{name:"Generated readonly signin のデスクトップを別窓で開く",exact:true})).toBeVisible();const popup=page.context().waitForEvent("page");await header.getByRole("button",{name:"Generated readonly signin のデスクトップを別窓で開く",exact:true}).click();desktopPage=await popup;await desktopPage.waitForLoadState();
  const view=desktopPage.locator("[data-remote-desktop]"),pairing=view.locator("[data-desktop-endpoint]");if(!await pairing.locator("summary").isVisible())await view.getByRole("button",{name:"情報・設定",exact:true}).click();await pairing.locator("summary").click();await pairing.getByRole("button",{name:"このブラウザの鍵を作成",exact:true}).click();const fingerprint=pairing.locator("[data-browser-fingerprint]");await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);peer=(await fingerprint.textContent())!;
  abort!.abort();await run;await expect(header.locator('[data-state="online"]')).toHaveCount(0);
  const next=new DesktopEndpointStore({stateDir:directory});await next.trust({fingerprint:peer,role:"viewer",label:"Generated browser"});next.close();await next.settled();start();await expect(header.locator('[data-state="online"]')).toBeVisible();
  await pairing.getByLabel("接続先PCで確認した指紋",{exact:true}).fill(provider.fingerprint);await pairing.getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました",{exact:true}).check();await pairing.getByRole("button",{name:"この接続先を記憶して暗号化で接続",exact:true}).click();
  const consent=view.locator("[data-desktop-signin-consent]"),canvas=view.getByLabel("共有画面");await expect(consent).toBeVisible();expect(launches).toBe(0);await consent.getByRole("button",{name:"閲覧だけ許可",exact:true}).click();await expect(view.locator("[data-desktop-status]")).toHaveText("サインイン画面・閲覧中");await expect(canvas).toHaveAttribute("data-rendered-frames","1");expect(await canvas.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(30,30,1,1).data))).toEqual([0,255,0,255]);expect(launches).toBe(1);
  if(ending==="source"){abort!.abort();await run;}else{const admin=new DesktopEndpointStore({stateDir:directory});await admin.revoke(peer,"viewer");admin.close();await admin.settled();await expect(run!).rejects.toThrow("Signin runtime is unavailable");}
  await expect(header.locator('[data-state="online"]')).toHaveCount(0);await expect(view.locator("[data-desktop-status]")).toHaveText(/終了|停止/);expect(await canvas.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(30,30,1,1).data))).toEqual([0,0,0,0]);
 }finally{abort?.abort();await run?.catch(()=>{});operator.close();await desktopPage?.close();await page.goto("about:blank").catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
