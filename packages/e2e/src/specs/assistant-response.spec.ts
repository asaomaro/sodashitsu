import {AssistantRpc} from "../../../desktop-assistant/dist/assistantRpc.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserContext } from "@playwright/test";
import type { AppServer } from "../support/appServer.js";
import { expect, test } from "../support/fixtures.js";
import { watchReceivedEvents, watchReceivedFrames, watchSentInput } from "../support/frames.js";
import { runAsk, watchAskSubscriptions } from "../support/ask.js";
import { focusTerminal, typeLine, prefixKey } from "../support/keys.js";

async function signedIn(context: BrowserContext, appServer: AppServer) {
  await context.addInitScript(()=>localStorage.setItem("soda.prefs.v1",JSON.stringify({onboarding:false})));
  const cookie = appServer.cookie.split(";")[0]!;
  const at = cookie.indexOf("=");
  await context.addCookies([{name:cookie.slice(0,at),value:cookie.slice(at+1),url:appServer.origin}]);
}

// A local generated agent only: real PTY, real browser connection, no model/account access.
async function source(appServer: AppServer) {
  const client = await appServer.openClient();
  const snapshot = client.helloSnapshot()!;
  const pane = snapshot.panes[0]!;
  const tab = snapshot.tabs.find(t => t.id === pane.tabId)!;
  const path = join(appServer.stateDir, "response-agent.mjs");
  await writeFile(path, "process.stdout.write('ASSISTANT_RESPONSE_READY\\r\\n');process.stdin.on('data',d=>process.stdout.write('RECEIVED:'+d.toString()));setInterval(()=>{},1000);");
  const found = client.waitForEvent("pane.agent_status_changed", e => e.data.paneId === pane.id && !!e.data.agent);
  client.sendInput(pane.id, `exec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(path)}\r`);
  const agent = (await found).data.agent!;
  const hash = new URLSearchParams({assistantPane:pane.id,assistantWorkspace:tab.workspaceId,assistantInstance:agent.instanceId,assistantMachine:"local"});
  return {client,pane,hash};
}

test("reply terminal fits its popup before any input", async ({page,context,appServer}) => {
  await signedIn(context,appServer);
  const {client,pane,hash}=await source(appServer);
  const popup=page;
  await popup.setViewportSize({width:800,height:560});
  const received=await watchReceivedFrames(popup),sent=await watchSentInput(popup);
  await popup.goto(`${appServer.origin}/?assistantView=reply#${hash}`);
  await expect(popup.locator("[data-assistant-response]")).toBeVisible();
  await expect(popup.locator(".xterm-helper-textarea")).toHaveCount(1);
  await expect.poll(()=>Array.from({length:received.connectionCount()},(_,i)=>received.snapshots(i,pane.id).join("")).join("")).toContain("ASSISTANT_RESPONSE_READY");
  // Observe the browser's size and authority before any click or key can claim it.
  const fitsWindow=()=>popup.locator(".terminal-pane").evaluate(el=>{
    const pane=el.getBoundingClientRect(),screen=el.querySelector(".xterm-screen")?.getBoundingClientRect();
    return !!screen&&screen.width<=pane.width+1&&screen.height<=pane.height+1&&pane.width-screen.width<30&&pane.height-screen.height<35;
  });
  await expect(popup.locator(".terminal-pane-scaled")).toHaveCount(0);
  await expect.poll(fitsWindow).toBe(true);
  await popup.setViewportSize({width:920,height:650});
  await expect.poll(fitsWindow).toBe(true);
  expect(sent()).toHaveLength(0);
  await popup.screenshot({path:test.info().outputPath("assistant-initial-fit.png")});
  client.close();
});

test("response popup displays only its existing terminal, sends input there, and leaves full Soda usable", async ({page,context,appServer}) => {
  await signedIn(context,appServer);
  const {client,pane,hash} = await source(appServer);
  await client.request("pane.split", {paneId:pane.id,direction:"right"});
  await page.goto(appServer.origin);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
  const popup = await context.newPage();
  await popup.setViewportSize({width:800,height:560});
  const received = await watchReceivedFrames(popup), sent = await watchSentInput(popup);
  await popup.goto(`${appServer.origin}/?assistantView=reply#${hash}`);
  await expect(popup.locator("[data-assistant-response]")).toBeVisible();
  await expect(popup.locator("#assistant-target-guard")).toHaveCount(0);
  await expect(popup.locator(".xterm-helper-textarea")).toHaveCount(1);
  await expect(popup.locator(".sidebar")).toHaveCount(0);
  await expect.poll(() => Array.from({length:received.connectionCount()},(_,i)=>received.snapshots(i,pane.id).join("")).join("")).toContain("ASSISTANT_RESPONSE_READY");
  const box = await popup.locator(".terminal-pane").boundingBox();
  expect(box!.width).toBeGreaterThan(600); expect(box!.height).toBeGreaterThan(300);
  await popup.locator(".terminal-pane").click({position:{x:40,y:50}}); await typeLine(popup,"REPLY_FROM_POPUP");
  await expect.poll(() => sent().map(frame=>frame.text).join("")).toContain("REPLY_FROM_POPUP");
  expect(sent().every(frame => frame.paneId === pane.id)).toBe(true);
  // xterm renders on canvas: observe its browser-received output plus visible measurable terminal.
  await expect.poll(() => Array.from({length:received.connectionCount()},(_,i)=>received.output(i,pane.id)).join("")).toContain("RECEIVED:REPLY_FROM_POPUP");
  await popup.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await popup.screenshot({path:test.info().outputPath("assistant-response-terminal.png")});
  await popup.close();
  await page.goto(`${appServer.origin}/?assistantView=main#${hash}`);
  await expect(page.locator("#assistant-target-guard")).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(2);
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  await focusTerminal(page); await prefixKey(page,"s");
  await expect(page.locator("dialog.settings-dialog")).toBeVisible();
});

test("popup uses the selected question form, shares its resolution, and never switches to the next question", async ({page,context,appServer}) => {
  await signedIn(context,appServer);
  const {client,pane,hash} = await source(appServer);
  const otherPane=(await client.request("pane.split",{paneId:pane.id,direction:"right"})).pane;
  const events = await watchReceivedEvents(page);
  const subscribed = await watchAskSubscriptions(page);
  await page.goto(appServer.origin);
  await subscribed.waitFor(1);
  const first = await runAsk(appServer,otherPane.id,{title:"最初の質問",questions:[{id:"ok",label:"進めますか",options:["はい","いいえ"],default:"はい"}]});
  await expect(page.locator("[data-ask-title]")).toHaveText("最初の質問");
  const second = await runAsk(appServer,pane.id,{title:"小窓で答える質問",questions:[{id:"ok",label:"進めますか",options:["はい","いいえ"],default:"はい"}]});
  await expect.poll(() => events().some(e=>e.event==="ask.opened" && e.data.paneId===pane.id)).toBe(true);
  const selected = events().find(e=>e.event==="ask.opened" && e.data.paneId===pane.id)!;
  if(selected.event!=="ask.opened") throw Error("missing selected form");
  // Use the same native RPC class and client kind as the dedicated-window button.
  let nativeReady=false;
  const native=new AssistantRpc(appServer.origin,{kind:"desktop",cookie:async()=>appServer.cookie.split(";")[0]!,status:connected=>{nativeReady=connected;},changed:()=>{}});
  native.start();
  try{
    await expect.poll(()=>nativeReady).toBe(true);
    const pending=await native.request("ask.subscribe",{renderer:"assistant"});
    const question=pending.asks.find(ask=>ask.paneId===pane.id);if(!question)throw Error("native client did not find the dedicated form");
    hash.set("assistantAsk",question.askId);
  }finally{native.stop();}
  const popup = await context.newPage();
  await popup.goto(`${appServer.origin}/?assistantView=reply#${hash}`);
  await expect(popup.locator("[data-assistant-response]")).toBeVisible();
  await expect(popup.locator("[data-ask-title]")).toHaveText("小窓で答える質問");
  await expect(popup.locator(".sidebar")).toHaveCount(0);
  await expect(popup.locator(".xterm-helper-textarea")).toHaveCount(0);
  await popup.screenshot({path:test.info().outputPath("assistant-response-form.png")});
  await popup.locator("[data-ask-submit]").click();
  expect((await second.done).json).toEqual({status:"answered",answers:{ok:"はい"}});
  await expect(popup.locator("#soda-ask-dialog[open]")).toHaveCount(0);
  await expect(popup.locator("[data-assistant-response]")).toContainText("対応済み");
  await expect(popup.locator(".xterm-helper-textarea")).toHaveCount(0);
  await expect(page.locator("[data-ask-title]")).toHaveText("最初の質問");
  await page.locator("[data-ask-submit]").click();
  expect((await first.done).code).toBe(0);
  await expect(popup.locator("[data-ask-title]")).toHaveCount(0);
  await popup.close();
});

test("a stale response popup can return to ordinary Soda instead of an empty compact view", async ({page,context,appServer}) => {
  await signedIn(context,appServer);
  const hash=new URLSearchParams({assistantPane:"00000000-0000-4000-8000-000000000001",assistantWorkspace:"00000000-0000-4000-8000-000000000002",assistantInstance:"00000000-0000-4000-8000-000000000003"});
  await page.goto(`${appServer.origin}/?assistantView=reply&assistantNavigation=test#${hash}`);
  await expect(page.locator("#assistant-target-guard")).toBeVisible();
  await page.getByRole("button",{name:"通常の操舵室を開く・ログイン",exact:true}).click();
  await expect(page.locator(".xterm-helper-textarea")).toBeVisible();
  await expect(page.locator("[data-assistant-response]")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("assistantView")).toBe(false);
});

test("a clipboard read completed after source closure cannot write into a terminal", async ({page,context,appServer}) => {
  await signedIn(context,appServer);
  const {client,pane,hash}=await source(appServer);
  const sent=await watchSentInput(page);
  await page.goto(`${appServer.origin}/?assistantView=reply#${hash}`);
  await expect(page.locator("#assistant-target-guard")).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea")).toBeVisible();
  await page.evaluate(()=>{
    const state=window as unknown as {clipboardRead:boolean;releaseClipboard:()=>void};
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{readText:()=>{
      state.clipboardRead=true;
      return new Promise<string>(resolve=>{state.releaseClipboard=()=>resolve("DELAYED_PRIVATE_REPLY");});
    }}});
  });
  await page.locator(".xterm-helper-textarea").focus();
  await page.keyboard.press("Control+Shift+v");
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {clipboardRead:boolean}).clipboardRead)).toBe(true);
  await client.request("pane.close",{paneId:pane.id});
  await expect(page.locator("#assistant-target-guard")).toBeVisible();
  const before=sent().length;
  await page.evaluate(()=>(window as unknown as {releaseClipboard:()=>void}).releaseClipboard());
  // Round trip after all queued JS callbacks: no keyboard action is needed for the stale write.
  await page.evaluate(()=>new Promise<void>(resolve=>setTimeout(resolve,0)));
  expect(sent().length).toBe(before);
  expect(sent().some(frame=>frame.text.includes("DELAYED_PRIVATE_REPLY"))).toBe(false);
});
