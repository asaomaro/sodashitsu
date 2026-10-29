import {test,expect,type Route} from "@playwright/test";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {DesktopNativeGateway} from "../../../client-core/dist/desktop/DesktopNativeGateway.node.js";
import {DesktopNativeHost} from "../../../client-core/dist/desktop/DesktopNativeHost.node.js";
/** Actual browser DOM/frames + production iframe/bridge/host. Generated binary
 * never prepares Windows code and no test sends start, input, clipboard or OLE. */
async function demo(){
 const production=await readFile(fileURLToPath(new URL("../../../client-core/dist/desktop/DesktopNativeBridge.js",import.meta.url)),"utf8");let descriptor:ReturnType<DesktopNativeGateway["descriptor"]>;let prepares=0;
 const web=createServer((req,res)=>{
  res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self'; frame-src http://*.localhost:*; connect-src 'self'");
  if(req.url==="/bridge.js"){res.setHeader("Content-Type","text/javascript");res.end(production);}
  else if(req.url==="/demo.js"){res.setHeader("Content-Type","text/javascript");res.end(`import {DesktopNativeBridge} from '/bridge.js';const descriptor=${JSON.stringify(descriptor)};let bridge;const status=document.querySelector('#status');document.querySelector('#connect').onclick=async()=>{status.textContent='connecting';try{bridge=await DesktopNativeBridge.connect(descriptor,{signal:new AbortController().signal,event:value=>{document.querySelector('#event').textContent=value.type},closed:()=>{status.textContent='closed'}});status.textContent='ready';}catch{status.textContent='failed';}};document.querySelector('#arm').onclick=()=>bridge.send({type:'arm',gesture:crypto.randomUUID()});document.querySelector('#stop').onclick=()=>{bridge?.stop();status.textContent='stopped';};`);}
  else{res.setHeader("Content-Type","text/html");res.end('<!doctype html><button id="connect">Connect generated helper</button><button id="arm">Arm generated gesture</button><button id="stop">Stop helper</button><p id="status">off</p><p id="event"></p><script type="module" src="/demo.js"></script>');}
 });
 await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(web.address() as{port:number}).port}`;
 const gateway=await DesktopNativeGateway.listen(origin,{binary:{prepare:async()=>{prepares++;},executable:"never-started-generated-only",close:async()=>{}},nativeFactory:options=>new DesktopNativeHost(options)});descriptor=gateway.descriptor();
 return {origin,descriptor,gateway,prepares:()=>prepares,close:async()=>{await gateway.close();web.closeAllConnections();await new Promise<void>(resolve=>web.close(()=>resolve()));}};
}
test("production browser bridge reaches only its local iframe and exchanges actual gesture frames",async({page})=>{
 const f=await demo(),received:string[]=[];page.on("websocket",socket=>socket.on("framereceived",event=>received.push(String(event.payload))));
 try{await page.goto(f.origin);await page.getByRole("button",{name:"Connect generated helper"}).click();await expect(page.locator("#status")).toHaveText("ready");await expect(page.locator("[data-native-helper]")).toHaveCount(1);await page.getByRole("button",{name:"Arm generated gesture"}).click();await expect(page.locator("#event")).toHaveText("armed");expect(received.some(text=>JSON.parse(text).type==="armed")).toBe(true);await page.getByRole("button",{name:"Stop helper"}).click();await expect(page.locator("#status")).toHaveText("stopped");await expect(page.locator("[data-native-helper]")).toHaveCount(0);}finally{await f.close();}
});
test("foreign window/origin/id notices cannot consume the production iframe handshake",async({page})=>{
 const f=await demo();let held:Route|undefined;await page.route(f.descriptor.url,route=>{held=route;});
 try{await page.goto(f.origin);await page.getByRole("button",{name:"Connect generated helper"}).click();await expect.poll(()=>!!held).toBe(true);await page.evaluate(d=>{const frame=document.querySelector<HTMLIFrameElement>("[data-native-helper]")!;for(const value of [{source:window,origin:d.origin,id:d.id},{source:frame.contentWindow,origin:"https://foreign.example",id:d.id},{source:frame.contentWindow,origin:d.origin,id:"00000000-0000-0000-0000-000000000000"}])window.dispatchEvent(new MessageEvent("message",{source:value.source,origin:value.origin,data:{type:"soda-native-frame",id:value.id}}));},f.descriptor);await expect(page.locator("#status")).toHaveText("connecting");await held!.continue();await expect(page.locator("#status")).toHaveText("ready");}finally{await f.close();}
});
test("an unreachable localhost locator never becomes an authenticated helper",async({page})=>{
 const f=await demo();await page.route(f.descriptor.url,route=>route.abort());try{await page.goto(f.origin);await page.getByRole("button",{name:"Connect generated helper"}).click();await expect(page.locator("#status")).toHaveText("failed",{timeout:7000});await expect(page.locator("[data-native-helper]")).toHaveCount(0);expect(f.prepares()).toBe(0);}finally{await f.close();}
});
test("native gateway termination reaches browser DOM and removes its frame",async({page})=>{
 const f=await demo();try{await page.goto(f.origin);await page.getByRole("button",{name:"Connect generated helper"}).click();await expect(page.locator("#status")).toHaveText("ready");await f.gateway.close();await expect(page.locator("#status")).toHaveText("closed",{timeout:8000});await expect(page.locator("[data-native-helper]")).toHaveCount(0);}finally{await f.close();}
});
