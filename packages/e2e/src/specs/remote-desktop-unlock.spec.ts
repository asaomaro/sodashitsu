import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

// A/B servers + synthetic lock state only. No actual service, capture, credentials or OS input.
test("lock screen is human-only; unlocking clears credentials and reconnects in viewing mode", async ({page,appServer})=>{
  test.setTimeout(60000);
  const dir=await mkdtemp(join(tmpdir(),"soda-lock-e2e-"));
  const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input","--secure","--unlock-marker",join(dir,"unlocked")]),SODA_DESKTOP_ALLOW_INPUT:"1",SODA_DESKTOP_ALLOW_UNLOCK:"1"};
  const before=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));
  Object.assign(process.env,env);
  const provider=await startAppServer().finally(()=>{for(const [key,value]of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const owner=await provider.openClient(), operator=await appServer.openClient();
  const messages:Record<string,unknown>[]=[];
  page.on("websocket",socket=>{if(socket.url().endsWith("/desktop-share"))socket.on("framereceived",({payload})=>{if(typeof payload==="string")messages.push(JSON.parse(payload));});});
  try {
    for(const [client,server]of [[owner,provider],[operator,appServer]]as const){
      await client.request("prefs.set",{patch:{notifyHintDone:true}});
      await client.request("workspace.set_project_folder",{workspaceId:client.helloSnapshot()!.workspaces[0]!.id,path:server.stateDir});
    }
    const invite=await operator.request("machine.invite",{label:"Locked test PC"});
    await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header=page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});
    await openNativeTab(page,"desktop",header);
    const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面");
    await expect(view.locator("[data-desktop-status]")).toContainText("ロック画面");
    await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);
    const information=view.getByRole("button",{name:"情報・設定",exact:true});
    if(await information.getAttribute("aria-expanded")!=="true")await information.click();
    await expect(view.locator("[data-desktop-locked]")).toBeVisible();
    await expect(view.locator("[data-agent-access]")).toHaveCount(0);
    await expect(view.locator("[data-desktop-clipboard]")).toHaveCount(0);
    await expect(view.locator("[data-desktop-media]")).toHaveCount(0);
    await view.getByRole("button",{name:"操作する",exact:true}).click();
    const input=view.getByLabel("確定した文字を送る");
    await expect(input).toHaveAttribute("type","password");
    await input.fill("synthetic-unsent-secret");
    await view.getByRole("button",{name:"Ctrl+Alt+Del",exact:true}).click();
    await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中",{timeout:15000});
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("type","text");
    await expect(input).toBeDisabled();
    await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);
    expect(messages.some(m=>m.type==="session_unlocked")).toBe(true);
    expect(messages.filter(m=>m.type==="ready")).toHaveLength(2);
    await view.getByRole("button",{name:"閉じる",exact:true}).click();
  } finally {await provider.close();await rm(dir,{recursive:true,force:true});}
});
