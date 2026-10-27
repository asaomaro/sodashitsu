import {mkdtemp,readFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
for(const {backend,encrypted} of [{backend:"linux-portal",encrypted:false},{backend:"macos-sck",encrypted:false},{backend:"macos-sck",encrypted:true}] as const)
test(`native platform ${backend} ${encrypted?"encrypted":"plain"} proof renders generated frames, preserves raw keys and blocks unsupported inputs`,async({page,appServer})=>{
 test.setTimeout(60000);const dir=await mkdtemp(join(tmpdir(),"soda-native-platform-")),record=join(dir,"input.jsonl");
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static","--allow-input","--native-platform",backend,"--record",record]),SODA_DESKTOP_NATIVE_PLATFORM:backend,SODA_DESKTOP_ALLOW_INPUT:"1",SODA_DESKTOP_ALLOW_MEDIA:"0"};
 const saved=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const provider=await startAppServer().finally(()=>{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 const sent:any[]=[];page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share"))socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});});
 try{
  const a=await appServer.openClient(),b=await provider.openClient(),invite=await a.request("machine.invite",{label:`Generated ${backend} backend`});await b.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});const identity=encrypted?await b.request("desktop.endpoint.initialize",{}):undefined;if(identity)await b.request("desktop.endpoint.required",{required:true});await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");if(identity){
   const pairing=view.locator("[data-desktop-endpoint]");await pairing.locator("summary").click();
   await pairing.getByRole("button",{name:"このブラウザの鍵を作成",exact:true}).click();
   const fingerprint=pairing.locator("[data-browser-fingerprint]");await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);
   await b.request("desktop.endpoint.trust",{fingerprint:(await fingerprint.textContent())!,role:"viewer",label:"Generated Mac native browser"});
   await pairing.getByLabel("接続先PCで確認した指紋",{exact:true}).fill(identity.fingerprint!);
   await pairing.getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました",{exact:true}).check();
   await pairing.getByRole("button",{name:"この接続先を記憶して暗号化で接続",exact:true}).click();
  }await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);await expect(view.locator("[data-native-platform]")).toContainText(backend==="linux-portal"?"Linux / Portal":"macOS / ScreenCaptureKit");await expect(view.locator("[data-desktop-metrics]")).toContainText("取得 — / encode —");expect(await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return c.width>0&&c.height>0&&c.getContext("2d")!.getImageData(0,0,1,1).data[3]===255;})).toBe(true);
  await view.getByRole("button",{name:"操作する",exact:true}).click();await canvas.focus();await canvas.press("Control+Space");if(!encrypted)await expect.poll(()=>sent.filter(m=>m.type==="input"&&m.input?.code==="Space").length).toBe(2);await canvas.dispatchEvent("keydown",{code:"F24",key:"F24",bubbles:true,cancelable:true});await expect(view).toContainText("この接続先OSでは、このキー・入力操作に対応していません");expect(sent.some(m=>m.type==="input"&&["ImeOn","ImeOff","F24"].includes(m.input?.code))).toBe(false);
  await expect.poll(async()=>{try{return (await readFile(record,"utf8")).trim().split("\n").map(s=>JSON.parse(s)).filter(m=>m.kind==="key"&&m.code==="Space").length;}catch{return 0;}}).toBe(2);
  if(encrypted)await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
 }finally{await page.goto("about:blank").catch(()=>{});await provider.close();await rm(dir,{recursive:true,force:true});}
});
