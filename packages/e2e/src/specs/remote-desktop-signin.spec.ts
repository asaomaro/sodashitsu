import {randomUUID} from "node:crypto";
import {DesktopEndpointService} from "../../../server/dist/desktop/DesktopEndpointService.js";
import {DesktopSigninEndpoint} from "../../../server/dist/desktop/DesktopSigninEndpoint.js";
import {DesktopSigninEnrollment} from "../../../server/dist/desktop/DesktopSigninEnrollment.js";
import type {DesktopEndpointStore} from "@sodashitsu/client-core/desktop/DesktopEndpointStore.node";
import {encodeDesktopFrame} from "@sodashitsu/protocol";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
// Actual browser pairing, sealed wire and signin endpoint; generated identities
// and PNG only. The worker seam never captures a desktop or emits OS input.
// Success is observed in the consent DOM and the browser's rendered pixels.
for(const control of [false,true])test(`signin consent is fresh on reconnect, input permission=${control}`,async({page,appServer})=>{
 test.setTimeout(90000);
 await page.addInitScript(skew=>{const now=Date.now;Date.now=()=>now()+skew;},control?300000:-300000);
 const {syntheticFrame}=await import(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url).href);
 const generated=syntheticFrame(64,64,1,[0,255,0]);
 const provider=await startAppServer(),original=DesktopEndpointService.prototype.start,endpoints:DesktopSigninEndpoint[]=[],abort=new AbortController();
 let launches=0;
 try{
  const owner=await provider.openClient(),operator=await appServer.openClient();
  await operator.request("prefs.set",{patch:{notifyHintDone:true}});
  const invite=await operator.request("machine.invite",{label:"Generated signin B"});
  await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  const identity=await owner.request("desktop.endpoint.initialize",{});await owner.request("desktop.endpoint.required",{required:true});
  DesktopEndpointService.prototype.start=async function(owner,params){
   if(params.machineId!==invite.machineId)return original.call(this,owner,params);
   const store=(this as unknown as {store:DesktopEndpointStore}).store,status=await store.status();
   if(!status.initialized)throw Error("Generated identity missing");
   const revision=randomUUID(),ownerSid="S-1-5-21-1-2-3-1001";
   const enrollment=DesktopSigninEnrollment.decode(Buffer.from(JSON.stringify({version:1,purpose:"desktop-signin",revision,ownerSid,origin:appServer.origin,machineId:invite.machineId,token:invite.token,provider:status.fingerprint,allowSignin:true,allowInput:control,peers:status.peers.filter(peer=>peer.role==="viewer").map(({fingerprint,label})=>({fingerprint,label}))})),ownerSid);
   const active=()=>!abort.signal.aborted;
   const endpoint=new DesktopSigninEndpoint({enrollment,signal:abort.signal,active,identity:{endpoint:async fingerprint=>({...await store.endpoint(fingerprint,"viewer"),allowInput:control})},worker:options=>{
    launches++;let closed=false;const close=()=>{closed=true;};options.signal.addEventListener("abort",close,{once:true});
    queueMicrotask(()=>{if(closed||!options.active())return;options.record(Buffer.from(JSON.stringify({type:"ready",title:"Generated signin",width:64,height:64,backend:"windows-gdi",secureDesktop:true,allowInput:options.control,imeKeys:true,extendedInput:true})),false);
     options.record(encodeDesktopFrame(generated.info,Buffer.from(generated.data,"base64")),true);
    });
    return {close,settled:async()=>{},send:message=>{if(!closed&&(message as {type:string}).type==="control")options.record(Buffer.from(JSON.stringify({type:"control",enabled:!!(message as {enabled:boolean}).enabled})),false);}};
   }});endpoints.push(endpoint);return endpoint.start(owner,params,{active,signal:abort.signal,revision,provider:status.fingerprint,allowInput:control});
  };
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),pairing=view.locator("[data-desktop-endpoint]");
  if(!await pairing.locator("summary").isVisible())await view.getByRole("button",{name:"情報・設定",exact:true}).click();
  await view.getByLabel("複数viewerで同じ画面を共有",{exact:true}).check();
  await pairing.locator("summary").click();await pairing.getByRole("button",{name:"このブラウザの鍵を作成",exact:true}).click();
  const fingerprint=pairing.locator("[data-browser-fingerprint]");await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);await owner.request("desktop.endpoint.trust",{fingerprint:(await fingerprint.textContent())!,role:"viewer",label:"Generated browser"});
  await pairing.getByLabel("接続先PCで確認した指紋",{exact:true}).fill(identity.fingerprint!);await pairing.getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました",{exact:true}).check();await pairing.getByRole("button",{name:"この接続先を記憶して暗号化で接続",exact:true}).click();
  const consent=view.locator("[data-desktop-signin-consent]"),canvas=view.getByLabel("共有画面");
  await expect(consent).toBeVisible();expect(launches).toBe(0);await expect(canvas).toHaveAttribute("data-rendered-frames","0");
  await expect(consent.getByRole("button",{name:"キーボード・マウス操作も許可",exact:true})).toHaveCount(control?1:0);
  await consent.getByRole("button",{name:control?"キーボード・マウス操作も許可":"閲覧だけ許可",exact:true}).click();
  await expect(view.locator("[data-desktop-status]")).toHaveText("サインイン画面・閲覧中");await expect(canvas).toHaveAttribute("data-rendered-frames","1");
  expect(await canvas.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(30,30,1,1).data))).toEqual([0,255,0,255]);
  await expect(view.getByRole("button",{name:"操作する",exact:true}))[control?"toBeEnabled":"toBeDisabled"]();
  await expect(view.getByRole("button",{name:"Ctrl+Alt+Del",exact:true})).toHaveCount(0);await expect(view.locator("[data-desktop-media]")).toHaveCount(0);await expect(view.locator("[data-agent-access]")).toHaveCount(0);await expect(view.locator("[data-desktop-shared]")).toHaveCount(0);
  await view.locator("summary").filter({hasText:"画質・計測"}).click();await view.getByRole("button",{name:"適用して再接続",exact:true}).click();await expect(consent).toBeVisible();expect(launches).toBe(1);await expect(canvas).toHaveAttribute("data-rendered-frames","0");
  await consent.getByRole("button",{name:"キャンセル",exact:true}).click();await expect(view).toHaveCount(0);expect(launches).toBe(1);
 }finally{DesktopEndpointService.prototype.start=original;abort.abort();await Promise.all(endpoints.map(endpoint=>endpoint.close()));await page.goto("about:blank").catch(()=>{});await provider.close();}
});
