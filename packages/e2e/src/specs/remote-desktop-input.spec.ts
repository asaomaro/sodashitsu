import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.js";
import { startAppServer } from "../support/appServer.js";
import { openNativeTab } from "../support/nativeTab.js";

test("focused desktop forwards keyboard and all five mouse buttons", async ({page,appServer}) => {
  test.setTimeout(60000);
  const env={SODA_DESKTOP_COMMAND:JSON.stringify([process.execPath,fileURLToPath(new URL("../../../../scripts/remote-desktop/synthetic-helper.mjs",import.meta.url)),"--allow-input"]),SODA_DESKTOP_ALLOW_INPUT:"1"};
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
  try {
    for(const [client,server] of [[owner,provider],[operator,appServer]] as const){
      await client.request("prefs.set",{patch:{notifyHintDone:true}});
      await client.request("workspace.set_project_folder",{workspaceId:client.helloSnapshot()!.workspaces[0]!.id,path:server.stateDir});
    }
    const invite=await operator.request("machine.invite",{label:"Input test PC"});
    await owner.request("machine.delegate",{url:appServer.origin,machineId:invite.machineId,token:invite.token});
    await page.goto(`${appServer.origin}/#token=${appServer.token}`);
    const header=page.locator(`[data-machine-id="${invite.machineId}"]`);
    await expect(header.locator('[data-state="online"]')).toBeVisible({timeout:15000});
    await openNativeTab(page,"desktop",header);
    const view=page.locator("[data-remote-desktop]"),canvas=view.getByLabel("共有画面"),status=view.locator("[data-desktop-status]");
    await expect(canvas).toHaveAttribute("data-rendered-frames",/^[1-9][0-9]*$/);
    await view.getByRole("button",{name:"操作する",exact:true}).click();
    await expect(status).toHaveText("操作中");
    await canvas.focus();
    const keys=()=>sent.filter(m=>m.type==="input"&&m.input?.kind==="key").map(m=>[m.input.code,m.input.down]);
    for(const key of ["Tab","Control+a","Alt+x","NumpadEnter"]) await page.keyboard.press(key);
    await canvas.evaluate(el=>{for(const type of ["keydown","keyup"]){el.dispatchEvent(new KeyboardEvent(type,{code:"F13",key:"F13",bubbles:true,cancelable:true}));}});
    await expect(canvas).toBeFocused();
    await expect.poll(()=>keys()).toContainEqual(["Tab",true]);
    expect(keys()).toContainEqual(["F13",true]);expect(keys()).toContainEqual(["NumpadEnter",true]);
    await view.getByRole("button",{name:"情報・設定",exact:true}).click();
    const information=view.getByRole("button",{name:"情報・設定",exact:true});
    await information.focus();await page.keyboard.down("Control");
    const releases=sent.filter(m=>m.type==="release").length;
    await view.getByLabel("確定した文字を送る").focus();
    await expect.poll(()=>sent.filter(m=>m.type==="release").length).toBeGreaterThan(releases);
    await page.keyboard.up("Control");
    await information.focus();await page.keyboard.down("Shift");
    await page.evaluate(()=>{const outside=document.createElement("input");document.body.append(outside);outside.focus();});
    await page.keyboard.up("Shift");await expect(status).toHaveText("閲覧中");
    await view.getByRole("button",{name:"操作する",exact:true}).click();await expect(status).toHaveText("操作中");
    await canvas.focus();
    // Real Chromium mouse events exercise middle/back/forward and browser defaults.
    await canvas.evaluate(el=>{
      history.pushState({},"","#mouse-back");history.pushState({},"","#mouse-test");
      (window as any).mouseDefaults=[];
      el.addEventListener("auxclick",e=>(window as any).mouseDefaults.push([(e as MouseEvent).button,e.defaultPrevented]));
      el.addEventListener("contextmenu",e=>(window as any).mouseDefaults.push([(e as MouseEvent).button,e.defaultPrevented]));
    });
    const url=page.url(), cdp=await page.context().newCDPSession(page), box=(await canvas.boundingBox())!;
    const point={x:box.x+box.width/2,y:box.y+box.height/2};
    const mouse=async(type:"mousePressed"|"mouseReleased",button:"left"|"right"|"middle"|"back"|"forward",buttons:number)=>{await cdp.send("Input.dispatchMouseEvent",{type,button,buttons,...point,clickCount:1});};
    const buttons=()=>sent.filter(m=>m.type==="input"&&m.input?.kind==="pointer"&&m.input.event!=="move").map(m=>[m.input.button,m.input.event]);
    for(const [name,mask] of [["left",1],["middle",4],["right",2],["back",8],["forward",16]] as const){
      await mouse("mousePressed",name,mask);await mouse("mouseReleased",name,0);
    }
    await expect.poll(()=>buttons().length).toBe(10);
    expect(buttons()).toEqual([0,1,2,3,4].flatMap(button=>[[button,"down"],[button,"up"]]));
    expect(page.url()).toBe(url);
    expect(await page.evaluate(()=>(window as any).mouseDefaults)).toEqual(expect.arrayContaining([[1,true],[2,true],[3,true],[4,true]]));
    // Chorded mouse presses are delivered as pointermove, not pointerdown.
    await mouse("mousePressed","left",1);await mouse("mousePressed","middle",5);
    await mouse("mouseReleased","middle",1);await mouse("mouseReleased","left",0);
    await expect.poll(()=>buttons().length).toBe(14);
    expect(buttons().slice(-4)).toEqual([[0,"down"],[1,"down"],[1,"up"],[0,"up"]]);
    const last=sent.filter(m=>m.type==="input").at(-1)!;
    await expect.poll(()=>received.some(m=>m.type==="input_ack"&&m.seq===last.seq)).toBe(true);
    await view.getByRole("button",{name:"最大化",exact:true}).click();await canvas.focus();
    await expect(status).toHaveText("操作中");
    await page.keyboard.press("Escape");await page.keyboard.press("a");await page.keyboard.press("Escape");
    await expect(view).toHaveClass(/maximized/);await expect(canvas).toBeFocused();
    await expect.poll(()=>keys().filter(k=>k[0]==="Escape")).toEqual([["Escape",true],["Escape",false],["Escape",true],["Escape",false]]);
    // Auto-repeat cannot become the second physical press.
    await page.keyboard.press("b");await page.keyboard.down("Escape");await page.keyboard.down("Escape");await page.keyboard.up("Escape");
    await expect(status).toHaveText("操作中");await expect(view).toHaveClass(/maximized/);
    await page.keyboard.press("Escape");
    await expect(status).toHaveText("閲覧中");await expect(view).not.toHaveClass(/maximized/);
    await expect.poll(()=>view.evaluate(el=>el.contains(document.activeElement))).toBe(false);
  } finally {await provider.close();}
});
