import { chromium, expect, test } from "@playwright/test";
import { createServer as httpsServer } from "node:https";
import { createServer, request } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { startAppServer } from "../support/appServer.js";
import { getFreePort } from "../support/freePort.js";
import { openNativeTab } from "../support/nativeTab.js";

test("HTTPS forwarded UI proves browser localhost access before automatic helper startup",async()=>{
  test.setTimeout(60_000);
  const dir=await mkdtemp(join(tmpdir(),"soda-public-preview-")),port=await getFreePort(),origin=`https://soda-preview.test:${port}`;
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=soda-preview.test","-keyout",join(dir,"key"),"-out",join(dir,"cert")],{stdio:"ignore"});
  const controller=await startAppServer({origins:[origin]}),provider=await startAppServer();
  const operator=await controller.openClient(),owner=await provider.openClient();
  const sockets=new Set<Duplex>();
  // Real TLS and real WS proxy; forwarding headers force the production remote guard.
  const proxy=httpsServer({key:await readFile(join(dir,"key")),cert:await readFile(join(dir,"cert"))},(req,res)=>{
    const upstream=request(controller.origin+req.url,{method:req.method,headers:{...req.headers,"x-forwarded-proto":"https"}},reply=>{res.writeHead(reply.statusCode!,reply.headers);reply.pipe(res);});
    upstream.on("error",()=>res.destroy());req.pipe(upstream);
  });
  proxy.on("connection",socket=>{sockets.add(socket);socket.on("close",()=>sockets.delete(socket));});
  proxy.on("upgrade",(req,socket,head)=>{
    const upstream=request(controller.origin+req.url,{headers:{...req.headers,"x-forwarded-proto":"https"}});
    upstream.on("response",reply=>{socket.write(`HTTP/1.1 ${reply.statusCode} Rejected\r\nConnection: close\r\n\r\n`);reply.pipe(socket);});
    upstream.on("upgrade",(reply,target,rest)=>{
      sockets.add(target);target.on("close",()=>sockets.delete(target));
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(reply.headers).map(([k,v])=>`${k}: ${v}`).join("\r\n")}\r\n\r\n`);
      if(rest.length)socket.write(rest);if(head.length)target.write(head);socket.pipe(target);target.pipe(socket);
    });
    upstream.on("error",()=>socket.destroy());upstream.end();
  });
  await new Promise<void>(r=>proxy.listen(port,"127.0.0.1",r));
  const web=createServer((_req,res)=>{res.setHeader("Content-Type","text/html");res.end("<!doctype html><h1>Public HTTPS preview works</h1>");});
  await new Promise<void>(r=>web.listen(0,"127.0.0.1",r));
  const browser=await chromium.launch({args:["--host-resolver-rules=MAP soda-preview.test 127.0.0.1","--no-proxy-server"]});
  try {
    const paneId=owner.helloSnapshot()!.panes[0]!.id;
    const invitation=await operator.request("machine.invite",{label:"HTTPS preview B"});
    await owner.request("machine.delegate",{url:controller.origin,machineId:invitation.machineId,token:invitation.token});
    await owner.request("preview.register",{paneId,name:"public-test",port:(web.address() as {port:number}).port});
    const context=await browser.newContext({ignoreHTTPSErrors:true});
    await context.grantPermissions(["local-network-access"],{origin});
    const page=await context.newPage(),methods:string[]=[];
    page.on("websocket",ws=>ws.on("framesent",frame=>{try{const message=JSON.parse(String(frame.payload));if(message.method)methods.push(message.method);}catch{}}));
    await page.goto(`${origin}/#token=${controller.token}`);
    expect(await page.evaluate(()=>isSecureContext)).toBe(true);
    const header=page.locator(`[data-machine-id="${invitation.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15_000});
    await header.locator(".machine-select").click();
    await openNativeTab(page,"web-preview");
    await expect(page.getByText("ブラウザPCのhelperに接続済み",{exact:true})).toBeVisible({timeout:15_000});
    expect(methods).toContain("preview.helper_probe");
    expect(methods.filter(m=>m==="preview.helper_start")).toHaveLength(2);
    await expect(page.locator("[data-preview-helper-command]")).toHaveCount(0);
    await page.getByRole("button",{name:"開く",exact:true}).click();
    await expect(page.frameLocator("[data-preview-frame]").getByRole("heading",{name:"Public HTTPS preview works"})).toBeVisible({timeout:15_000});
    await page.locator(".viewer-item.active .viewer-close").click();
    await expect(page.locator("[data-preview-helper-probe]")).toHaveCount(0);
    // Simulate a browser on another PC: localhost page cannot be reached, so no launch proof.
    await context.route("http://*.localhost:*/probe",route=>route.abort());
    await openNativeTab(page,"web-preview");
    await expect(page.locator("[data-preview-helper-command]")).toBeVisible({timeout:30_000});
    await expect(page.getByText("ブラウザPCのhelperに接続済み",{exact:true})).toHaveCount(0);
    await context.close();
  } finally {
    await browser.close();for(const socket of sockets)socket.destroy();await new Promise<void>(r=>proxy.close(()=>r()));
    web.closeAllConnections();await new Promise<void>(r=>web.close(()=>r()));
    operator.close();owner.close();await provider.close();await controller.close();await rm(dir,{recursive:true,force:true});
  }
});
