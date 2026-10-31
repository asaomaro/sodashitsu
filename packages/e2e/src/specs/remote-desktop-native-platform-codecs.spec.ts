import {fileURLToPath} from "node:url";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
const executablePath=process.env["SODA_E2E_CHROMIUM_PATH"];
if(executablePath)test.use({launchOptions:{executablePath}});
const cases:Array<{backend:"linux-portal"|"macos-sck";codec:"hevc"|"av1"|"h264-444";mode:"normal"|"encoder-failure"|"decoder-reject";udp:boolean}>=[];
for(const backend of ["linux-portal","macos-sck"] as const)for(const mode of ["normal","encoder-failure","decoder-reject"] as const)cases.push({backend,codec:"hevc",mode,udp:true});
for(const udp of [false,true])cases.push({backend:"linux-portal",codec:"av1",mode:"normal",udp});
cases.push({backend:"linux-portal",codec:"h264-444",mode:"normal",udp:false});
for(const {backend,codec,mode,udp} of cases)test(`${backend} generated ${codec} ${mode} udp=${udp} keeps scoped pixels`,async({page,appServer})=>{
 test.setTimeout(45000);
 const helper=fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),fixtures=fileURLToPath(new URL("../../../../scripts/remote-desktop/fixtures",import.meta.url));
 const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,helper,"--static","--native-platform",backend,"--native-codecs","--native-datagrams",...(codec==="h264-444"?["--native-444"]:[]),...(mode==="encoder-failure"?["--codec-encoder-failure"]:[]),"--codec-fixtures",fixtures,"--native-fixture",`${fixtures}/h264-generated.json`]),SODA_DESKTOP_NATIVE_PLATFORM:backend,SODA_DESKTOP_ALLOW_MEDIA:"1"};
 const saved=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
 const provider=await startAppServer().finally(()=>{for(const[key,value]of Object.entries(saved)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const received:any[]=[],sent:any[]=[];
 page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share")){socket.on("framereceived",({payload})=>{if(typeof payload==="string")received.push(JSON.parse(payload));});socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});}});
 if(mode==="decoder-reject")await page.addInitScript(()=>{const Decoder=VideoDecoder;window.VideoDecoder=class extends Decoder{static override async isConfigSupported(config:VideoDecoderConfig){if(config.codec.startsWith("hev1"))return{supported:false,config};return Decoder.isConfigSupported(config);}};});
 try{
  const owner=await provider.openClient(),viewer=await appServer.openClient(),invite=await viewer.request("machine.invite",{label:`Generated ${backend} codec`});
  await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);const header=page.locator(`[data-machine-id="${invite.machineId}"]`);await expect(header.locator('[data-state="online"]')).toBeVisible();await openNativeTab(page,"desktop",header);
  const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9]/);
  await view.locator("[data-desktop-media] summary").click();await view.getByLabel("動画の経路").selectOption("native");await view.getByLabel("動画コーデック").selectOption(codec);await view.getByLabel("UDPを優先（利用できない場合はWSS）",{exact:true}).setChecked(udp);
  const supported=mode==="normal"&&codec!=="av1"?await page.evaluate(async value=>(await VideoDecoder.isConfigSupported({codec:value,codedWidth:640,codedHeight:360})).supported===true,codec==="hevc"?"hev1.1.6.L63.B0":"avc1.f4001e"):true;
  await view.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames")),{timeout:15000}).toBeGreaterThan(12);
  await expect(view.locator("[data-native-codec]")).toContainText(`要求: ${codec==="hevc"?"HEVC":codec==="h264-444"?"H.264 4:4:4":"AV1"}`);
  if(mode!=="normal")await expect(view.locator("[data-native-codec]")).toContainText("実際: H.264");
  else if(codec==="av1"){await expect(view.locator("[data-native-codec]")).toContainText("実際: AV1");expect(received.some(value=>value.type==="media_stream"&&value.mime==="video/av1")).toBe(true);}
  if(mode==="normal"&&codec!=="av1"){
   const label=codec==="hevc"?"HEVC":"H.264 4:4:4";
   await expect(view.locator("[data-native-codec]")).toContainText(`実際: ${supported?label:"H.264"}`);
   if(supported)expect(received.some(value=>value.type==="media_stream"&&value.codecName===codec&&value.mime===(codec==="hevc"?"video/hevc":"video/h264"))).toBe(true);
   console.log("NATIVE_PLATFORM_CODEC_RESULT",{backend,requested:codec,decoded:supported?codec:"h264",reason:supported?"supported":"browser-decoder-unavailable"});
  }
  if(codec==="h264-444"){expect(received.some(value=>value.type==="media_stream"&&value.codecName==="h264-444")).toBe(true);}
  if(mode==="decoder-reject"){expect(sent.filter(value=>value.type==="native_codec_fallback")).toHaveLength(1);expect(new Set(received.filter(value=>value.type==="media_stream").map(value=>value.id)).size).toBe(2);}
  const count=Number(await canvas.getAttribute("data-video-frames"));await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames"))).toBeGreaterThan(count+5);
  const pixel=await canvas.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(80,60,1,1).data));expect(pixel[0]).toBeGreaterThan(150);expect(pixel[1]).toBeLessThan(100);expect(pixel[2]).toBeLessThan(100);
  await page.screenshot({path:test.info().outputPath(`${backend}-${codec}-${mode}-${udp}.png`),fullPage:true});await view.getByRole("button",{name:"動画・音声を停止",exact:true}).click();await expect(view.locator("[data-media-state]")).toHaveText("画像配信");
 }finally{await page.goto("about:blank").catch(()=>{});await provider.close();}
});
