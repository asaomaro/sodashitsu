import {createServer} from "node:http";
import type {AddressInfo} from "node:net";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {DesktopEndpointIdentity,DesktopEndpointHandshake,DESKTOP_E2E_LANES} from "@sodashitsu/client-core/desktop/DesktopE2e";
import {expect,test} from "../support/fixtures.js";
// Local generated plaintext only. This checks the endpoint primitive in the
// browser's actual WebCrypto, not the product's still-unencrypted relay routes.
test("browser and Node authenticate, encrypt every lane and reject replay",async({page})=>{
 const code=await readFile(new URL("../../../client-core/dist/desktop/DesktopE2e.js",import.meta.url),"utf8"),server=createServer((request,response)=>{response.setHeader("Cache-Control","no-store");response.setHeader("Content-Type",request.url==="/module.js"?"text/javascript":"text/html");response.end(request.url==="/module.js"?code:'<!doctype html><body><p data-encrypted-lanes>0</p></body>');});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`,identity=await DesktopEndpointIdentity.create(crypto),session=randomUUID(),pin=await identity.fingerprint();let provider:Awaited<ReturnType<DesktopEndpointHandshake["finish"]>>|undefined;
 try{
  await page.goto(origin);const client=await page.evaluate(async({session,pin})=>{const path="/module.js",module=await import(path),identity=await module.DesktopEndpointIdentity.create(crypto),handshake=await module.DesktopEndpointHandshake.create(crypto,identity,{session,role:"viewer",peerRole:"provider",generation:7,expectedFingerprint:pin});(window as any).__cryptoTest={module,handshake};return {hello:handshake.hello,pin:await identity.fingerprint()};},{session,pin});
  const handshake=await DesktopEndpointHandshake.create(crypto,identity,{session,role:"provider",peerRole:"viewer",generation:7,expectedFingerprint:client.pin}),proof=await handshake.proof(client.hello);
  const clientProof=await page.evaluate(async({hello,proof})=>{const state=(window as any).__cryptoTest,reply=await state.handshake.proof(hello);state.session=await state.handshake.finish(hello,proof);return reply;},{hello:handshake.hello,proof});provider=await handshake.finish(client.hello,clientProof);
  const plain="generated pixels and audio only / 日本語",payload=new TextEncoder().encode(plain);let replay:number[]=[];
  for(const lane of DESKTOP_E2E_LANES){
   const packet=await provider.seal(lane,payload);expect(Buffer.from(packet).includes(Buffer.from(payload))).toBe(false);if(lane==="video")replay=Array.from(packet);
   const reverse=await page.evaluate(async({lane,packet,plain})=>{const state=(window as any).__cryptoTest,received=await state.session.open(lane,new Uint8Array(packet)),decoded=new TextDecoder().decode(received);if(decoded!==plain)throw Error("Browser plaintext mismatch");state.count=(state.count??0)+1;document.querySelector("[data-encrypted-lanes]")!.textContent=String(state.count);return Array.from(await state.session.seal(lane,new TextEncoder().encode(decoded)));},{lane,packet:Array.from(packet),plain});expect(await provider.open(lane,Uint8Array.from(reverse as number[]))).toEqual(payload);
  }
  await expect(page.locator("[data-encrypted-lanes]")).toHaveText("9");await page.evaluate(async packet=>{const state=(window as any).__cryptoTest;try{await state.session.open("video",new Uint8Array(packet));throw Error("Replay accepted");}catch(error){if(!(error instanceof Error)||!error.message.includes("authentication"))throw error;document.body.dataset.replayRejected="true";}state.handshake.close();},replay);await expect(page.locator("body")).toHaveAttribute("data-replay-rejected","true");handshake.close();
 }finally{provider?.close();await page.goto("about:blank");await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
