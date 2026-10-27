import {mkdtemp,mkdir,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {unzipSync} from "fflate";
import {expect,test} from "../support/fixtures.js";
import {startAppServer} from "../support/appServer.js";
import {openNativeTab} from "../support/nativeTab.js";
// Real browser transfer, verification, DataTransfer payload and re-save only. No native OS drop.
for(const mode of["file","checkpoint","folder","folder-volatile","encrypted","allocation-failure"]as const)
test(`received desktop file drag preparation ${mode}`,async({page,appServer})=>{
 test.setTimeout(90000);page.setDefaultTimeout(10000);
 const root=await mkdtemp(join(tmpdir(),"soda-received-dragout-")),saved=process.env.SODA_DESKTOP_COMMAND;
 process.env.SODA_DESKTOP_COMMAND=JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--static"]);
 const provider=await startAppServer().finally(()=>{if(saved===undefined)delete process.env.SODA_DESKTOP_COMMAND;else process.env.SODA_DESKTOP_COMMAND=saved;});
 const data=Buffer.alloc(70000,0x6a);
 await page.addInitScript(()=>{const w=window as any;w.__receivedRevoked=[];const original=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{w.__receivedRevoked.push(url);original(url);};});
 if(mode==="allocation-failure")await page.addInitScript(()=>{
   const original=URL.createObjectURL.bind(URL);let calls=0;
   URL.createObjectURL=blob=>{if(blob instanceof Blob&&blob.size===70000&&++calls===2)throw Error("generated retention allocation failure");return original(blob);};
 });
    try {
      await writeFile(join(root, "generated.bin"), data);
      if(mode.startsWith("folder")){await mkdir(join(root,"generated-dir"));await writeFile(join(root,"generated-dir","payload.bin"),data);}
      const owner = await provider.openClient(),
        operator = await appServer.openClient();
      await operator.request("prefs.set", { patch: { notifyHintDone: true } });
      await owner.request("desktop.settings.set", {
        enabled: true,
        allowInput: false,
        allowClipboard: false,
        allowDisplayResize: false,
        fileRoot: root,
      });
      const invite = await operator.request("machine.invite", { label: "Checkpoint B" });
      await owner.request("machine.delegate", {
        url: appServer.origin,
        machineId: invite.machineId,
        token: invite.token,
      });
      const identity = mode==="encrypted"
        ? await owner.request("desktop.endpoint.initialize", {})
        : undefined;
      if (identity) await owner.request("desktop.endpoint.required", { required: true });
      await page.goto(`${appServer.origin}/#token=${appServer.token}`);
      const header = page.locator(`[data-machine-id="${invite.machineId}"]`);
      await expect(header.locator('[data-state="online"]')).toBeVisible();
      await openNativeTab(page, "desktop", header);
      const view = page.locator("[data-remote-desktop]"),
        panel = view.locator("[data-desktop-files]"),
        jobs = panel.getByRole("list", { name: "ファイル転送の一覧" });
      if (identity) {
        const pairing = view.locator("[data-desktop-endpoint]");
        await pairing.locator("summary").click();
        await pairing.getByRole("button", { name: "このブラウザの鍵を作成", exact: true }).click();
        const fingerprint = pairing.locator("[data-browser-fingerprint]");
        await expect(fingerprint).toHaveText(/^[a-f0-9]{64}$/);
        await owner.request("desktop.endpoint.trust", {
          fingerprint: (await fingerprint.textContent())!,
          role: "viewer",
          label: "Generated file resume",
        });
        await pairing
          .getByLabel("接続先PCで確認した指紋", { exact: true })
          .fill(identity.fingerprint!);
        await pairing
          .getByLabel("接続先PCのlocalhost画面に表示された指紋と一致することを確認しました", {
            exact: true,
          })
          .check();
        await pairing
          .getByRole("button", { name: "この接続先を記憶して暗号化で接続", exact: true })
          .click();
      }
      await expect(view.getByLabel("共有画面")).toHaveAttribute("data-rendered-frames", /^[1-9]/);
      await panel.locator("summary").click();
      await panel.getByRole("button", { name: "ファイル転送を許可", exact: true }).click();
      const shelf=panel.locator("[data-received-downloads]");
      await shelf.getByLabel("受信後、ドラッグ用にこの窓で一時保持",{exact:true}).check();
      if(mode==="checkpoint"||mode==="folder")await panel.getByLabel("切断後の再開用に転送データをこのブラウザへ保存",{exact:true}).check();
      const downloadPromise=page.waitForEvent("download");
      if(mode.startsWith("folder"))await panel.getByRole("button",{name:"generated-dir をZIPで受信",exact:true}).click();
      else await panel.locator("li").filter({hasText:"generated.bin"}).getByRole("button",{name:"ダウンロード",exact:true}).click();
      const download=await downloadPromise,initial=await readFile((await download.path())!);
      if(mode.startsWith("folder"))expect(Buffer.from(unzipSync(initial)["generated-dir/payload.bin"]!)).toEqual(data);
      else expect(initial).toEqual(data);
      await expect(jobs).toContainText("完了");
      if(mode==="allocation-failure"){
        await expect(shelf.getByRole("status")).toContainText("保持できません");
        await expect(shelf.locator("[data-received-download]")).toHaveCount(0);return;
      }
      const link=shelf.getByRole("link");await expect(link).toHaveCount(1);
      const exported=await link.evaluate(el=>{
        const data=new DataTransfer(),event=new DragEvent("dragstart",{dataTransfer:data,bubbles:true,cancelable:true});
        const accepted=el.dispatchEvent(event);return{accepted,value:data.getData("DownloadURL"),types:[...data.types],effect:data.effectAllowed,url:(el as HTMLAnchorElement).href,name:(el as HTMLAnchorElement).download};
      });
      expect(exported.accepted).toBe(true);expect(exported.types).toEqual(["downloadurl"]);
      expect(exported.value).toBe(`application/octet-stream:${exported.name}:${exported.url}`);
      expect(exported.url.startsWith(`blob:${appServer.origin}/`)).toBe(true);
      expect(exported.value).not.toContain(root);expect(exported.value).not.toContain(appServer.token);
      const savePromise=page.waitForEvent("download");await shelf.getByRole("button",{name:"もう一度保存",exact:true}).click();
      const repeated=await savePromise;expect(await readFile((await repeated.path())!)).toEqual(initial);
      await expect(shelf.getByRole("status")).toContainText("ブラウザのダウンロードへ渡しました");
      await panel.getByRole("button",{name:"ファイル転送を解除",exact:true}).click();
      await expect(panel.locator("[data-received-download]")).toHaveCount(0);
      await expect.poll(()=>page.evaluate(url=>(window as any).__receivedRevoked.includes(url),exported.url)).toBe(true);
      if(mode==="encrypted")await expect(view.locator("[data-endpoint-encrypted]")).toBeVisible();
 }finally{await page.goto("about:blank").catch(()=>{});await provider.close();await rm(root,{recursive:true,force:true});}
});
