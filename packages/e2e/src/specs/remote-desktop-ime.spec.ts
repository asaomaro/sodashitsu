import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

// Synthetic source only. Observe the browser DOM and its actual WS messages;
// dispatching DOM events does not claim to exercise a physical OS IME shortcut.
for (const supported of [true, false]) test(`IME keys follow focused remote window and helper support=${supported}`, async ({page,appServer}) => {
  test.setTimeout(60000);
  const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input",...(!supported?["--no-ime-keys"]:[])]),SODA_DESKTOP_ALLOW_INPUT:"1"};
  const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  const provider=await startAppServer().finally(()=>{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const owner=await provider.openClient(),operator=await appServer.openClient();
  const sent:Record<string,any>[]=[],received:Record<string,any>[]=[];
  page.on("websocket",socket=>{
    if(!socket.url().endsWith("/desktop-share"))return;
    socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});
    socket.on("framereceived",({payload})=>{if(typeof payload==="string")received.push(JSON.parse(payload));});
  });
  const ime=()=>sent.filter(m=>m.type==="input"&&["ImeOn","ImeOff"].includes(m.input?.code));
  try {
    for(const [client,server] of [[owner,provider],[operator,appServer]] as const){
      await client.request("prefs.set",{patch:{notifyHintDone:true}});
      await client.request("workspace.set_project_folder",{workspaceId:client.helloSnapshot()!.workspaces[0]!.id,path:server.stateDir});
    }
    const invite=await operator.request("machine.invite",{label:"IME test PC"});
    await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header=page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});
    await openNativeTab(page,"desktop",header);
    const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面"),status=view.locator("[data-desktop-status]");
    await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);
    const on=view.getByRole("button",{name:"IME ON",exact:true}),off=view.getByRole("button",{name:"IME OFF",exact:true});
    await expect(on).toBeDisabled();
    await canvas.focus();
    expect(await canvas.evaluate(el=>{const event=new KeyboardEvent("keydown",{key:"Process",code:"Lang1",isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(event);return event.defaultPrevented;})).toBe(false);
    await view.getByRole("button",{name:"操作する",exact:true}).click();
    await expect(status).toHaveText("操作中");
    await canvas.focus();
    if(!supported){
      await expect(on).toBeDisabled();await expect(off).toBeDisabled();
      expect(await canvas.evaluate(el=>{const e=new KeyboardEvent("keydown",{key:"IMEOn",code:"Lang1",bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;})).toBe(false);
      await page.keyboard.press("a");
      await expect.poll(()=>received.some(m=>m.type==="input_ack")).toBe(true);
      expect(ime()).toEqual([]);
      await expect(status).toHaveText("操作中");
      return;
    }
    await expect(on).toBeEnabled();
    const prevented=await canvas.evaluate(el=>{
      const results:boolean[]=[];
      for(const [type,code,repeat] of [["keydown","Lang1",false],["keydown","Lang1",true],["keyup","Lang1",false],["keydown","Lang2",false],["keyup","Lang2",false]] as const){
        const e=new KeyboardEvent(type,{key:"Process",code,isComposing:true,repeat,bubbles:true,cancelable:true});el.dispatchEvent(e);results.push(e.defaultPrevented);
      }
      return results;
    });
    expect(prevented).toEqual([true,true,true,true,true]);
    await expect.poll(()=>ime().length).toBe(4);
    expect(ime().map(m=>[m.input.code,m.input.down])).toEqual([["ImeOn",true],["ImeOn",false],["ImeOff",true],["ImeOff",false]]);
    await expect.poll(()=>received.some(m=>m.type==="input_ack"&&m.seq===ime().at(-1)!.seq)).toBe(true);
    // Root capture also handles a focused toolbar button, without stealing local text IME.
    const information=view.getByRole("button",{name:"情報・設定",exact:true});
    await information.click();await information.focus();
    expect(await information.evaluate(el=>{const e=new KeyboardEvent("keydown",{key:"IMEOn",code:"Unidentified",isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;})).toBe(true);
    await expect.poll(()=>ime().length).toBe(6);
    const text=view.getByLabel("確定した文字を送る");await text.focus();
    expect(await text.evaluate(el=>{const e=new KeyboardEvent("keydown",{key:"IMEOff",code:"Lang2",isComposing:true,bubbles:true,cancelable:true});el.dispatchEvent(e);return e.defaultPrevented;})).toBe(false);
    await on.click();await off.click();
    await expect.poll(()=>ime().length).toBe(10);
    expect(ime().slice(-4).map(m=>[m.input.code,m.input.down])).toEqual([["ImeOn",true],["ImeOn",false],["ImeOff",true],["ImeOff",false]]);
    await expect.poll(()=>received.some(m=>m.type==="input_ack"&&m.seq===ime().at(-1)!.seq)).toBe(true);
    expect(await page.evaluate(()=>{const outside=document.createElement("input");outside.id="outside-ime-test";document.body.append(outside);outside.focus();const e=new KeyboardEvent("keydown",{key:"IMEOn",code:"Lang1",bubbles:true,cancelable:true});outside.dispatchEvent(e);return e.defaultPrevented;})).toBe(false);
    await expect(page.locator("#outside-ime-test")).toBeFocused();expect(ime()).toHaveLength(10);
    await view.getByRole("button",{name:"閲覧に戻る",exact:true}).click();
    await expect(status).toHaveText("閲覧中");await expect(on).toBeDisabled();
  } finally {await provider.close();}
});
