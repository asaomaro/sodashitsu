import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

// Synthetic A/B transport only: no desktop pixels, real credentials or OS input.
for (const startup of ["stable", "once", "always", "runtime-once", "runtime-always"] as const) test(`lock cover safely handles ${startup} startup transitions`, async ({page,appServer}) => {
  test.setTimeout(60000);
  const dir=await mkdtemp(join(tmpdir(),"soda-cover-e2e-"));
  const runtime=startup.startsWith("runtime-");
  const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input","--secure",...(!runtime?["--lock-cover"]:[]),"--cover-marker",join(dir,"dismissed"),...(startup!=="stable"?[runtime?"--ready-failure":"--startup-failure",runtime?"source_transition":"worker_input_desktop_default"]:[]),...(startup==="once"?["--startup-marker",join(dir,"started")]:[]),...(startup==="runtime-once"?["--ready-marker",join(dir,"runtime")]:[])]),SODA_DESKTOP_ALLOW_INPUT:"1",SODA_DESKTOP_ALLOW_UNLOCK:"1"};
  const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  const provider=await startAppServer().finally(()=>{for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const owner=await provider.openClient(),operator=await appServer.openClient();
  const received:Record<string,unknown>[]=[],sent:Record<string,unknown>[]=[];
  page.on("websocket",socket=>{
    if(!socket.url().endsWith("/desktop-share"))return;
    socket.on("framereceived",({payload})=>{if(typeof payload==="string")received.push(JSON.parse(payload));});
    socket.on("framesent",({payload})=>{if(typeof payload==="string")sent.push(JSON.parse(payload));});
  });
  try {
    for(const [client,server]of [[owner,provider],[operator,appServer]]as const){
      await client.request("prefs.set",{patch:{notifyHintDone:true}});
      await client.request("workspace.set_project_folder",{workspaceId:client.helloSnapshot()!.workspaces[0]!.id,path:server.stateDir});
    }
    const invite=await operator.request("machine.invite",{label:"Cover test PC"});
    await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header=page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});
    await openNativeTab(page,"desktop",header);
    const view=page.locator("[data-remote-desktop]"),cover=view.locator("[data-desktop-lock-cover]");
    if(startup==="runtime-once") {
      await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/,{timeout:15000});
      expect(received.filter(m=>m.type==="lock_screen_changed")).toHaveLength(1);
      expect(received.filter(m=>m.type==="ready")).toHaveLength(2);
      expect(sent.some(m=>m.type==="input"||m.type==="control")).toBe(false);
      await expect(view.getByRole("button",{name:"操作する",exact:true})).toBeVisible();
      await view.getByRole("button",{name:"閉じる",exact:true}).click();
      return;
    }
    if(startup==="always"||startup==="runtime-always") {
      await expect(view.getByText("共有元のロック画面が安定しないため再接続を停止しました。少し待ってから接続し直してください。",{exact:true})).toBeVisible({timeout:20000});
      expect(received.filter(m=>m.type==="lock_screen_changed")).toHaveLength(4);
      expect(sent.filter(m=>m.type==="start")).toHaveLength(4);
      expect(received.filter(m=>m.type==="ready")).toHaveLength(runtime?4:0);
      expect(sent.some(m=>m.type==="input"||m.type==="control"||m.type==="dismiss_lock_screen")).toBe(false);
      await view.getByRole("button",{name:"閉じる",exact:true}).click();
      return;
    }
    await expect(cover).toBeVisible();
    if(startup==="once") {
      expect(received[0]?.type).toBe("lock_screen_changed");
      expect(sent.filter(m=>m.type==="start")).toHaveLength(2);
    }
    await expect(view.getByLabel("共有画面")).toBeHidden();
    await expect(view.getByLabel("確定した文字を送る")).toBeHidden();
    await expect(view.locator("[data-agent-access]")).toHaveCount(0);
    expect(sent.some(m=>m.type==="input"||m.type==="dismiss_lock_screen")).toBe(false);
    expect(received.find(m=>m.type==="ready")).toMatchObject({lockScreenCover:true,secureDesktop:true,allowClipboard:false,allowMedia:false});
    await cover.getByRole("button",{name:"サインイン画面へ進む",exact:true}).click();
    await expect(cover).toHaveCount(0);
    const canvas=view.getByLabel("共有画面");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/,{timeout:15000});
    await expect(view.getByRole("button",{name:"操作する",exact:true})).toBeVisible();
    await view.getByRole("button",{name:"情報・設定",exact:true}).click();
    const input=view.getByLabel("確定した文字を送る");
    await expect(input).toHaveAttribute("type","password");
    await expect(input).toBeDisabled();
    expect(received.some(m=>m.type==="lock_screen_changed")).toBe(true);
    expect(received.filter(m=>m.type==="ready")).toHaveLength(2);
    expect(sent.filter(m=>m.type==="dismiss_lock_screen")).toHaveLength(1);
    expect(sent.some(m=>m.type==="input")).toBe(false);
    await view.getByRole("button",{name:"閉じる",exact:true}).click();
  }finally{await provider.close();await rm(dir,{recursive:true,force:true});}
});
