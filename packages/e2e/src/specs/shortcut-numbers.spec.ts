import { expect,test } from "../support/fixtures.js";
import { prefixKey } from "../support/keys.js";
import { launchFakeAgent,cleanupNotifyAgents } from "../support/notifyAgent.js";
test.afterEach(async()=>{await cleanupNotifyAgents();});
for(const style of ["classic","modern"] as const) {
 test(`${style}: prefix中だけ4対象の番号を重ね、表示した番号で移動する`,async({page,appServer})=>{
  const c=await appServer.openClient();const initial=c.helloSnapshot()!;
  const w=initial.workspaces[0]!,t=initial.tabs[0]!,p=initial.panes[0]!;
  await c.request("prefs.set",{patch:{onboarding:false,uiStyle:style}});
  await c.request("workspace.rename",{workspaceId:w.id,label:"PJ A"});
  await c.request("tab.rename",{tabId:t.id,label:"Tab A"});
  const split=await c.request("pane.split",{paneId:p.id,direction:"right"});
  await c.request("pane.rename",{paneId:p.id,label:"Pane A"});
  await c.request("pane.rename",{paneId:split.pane.id,label:"Pane B"});
  const tb=await c.request("tab.create",{workspaceId:w.id,label:"Tab B"});
  const wb=await c.request("workspace.create",{cwd:process.cwd(),label:"PJ B"});
  await c.request("pane.subscribe",{paneId:split.pane.id,scrollbackLines:4000});
  await launchFakeAgent(page,c,split.pane.id,{via:"client"});
  await c.request("workspace.focus",{workspaceId:w.id});await c.request("tab.focus",{tabId:t.id});
  await page.goto(`${appServer.origin}/#token=${appServer.token}`);
  await expect(page.locator(".terminal-pane")).toHaveCount(2);await page.locator(".xterm-helper-textarea").first().focus();
  const badges=page.locator(".shortcut-number");await expect(badges).toHaveCount(0);
  await page.keyboard.press("Control+b");
  for(const target of ["tab","pane","workspace","agent"])await expect(page.locator(`[data-number-target="${target}"]`).first()).toBeVisible();
  // 各番号は行・tab・paneの矩形の内側に重なり、レイアウトを動かさない。
  const badge=page.locator('[data-number-target="workspace"]').first();
  const place=await badge.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest(".sidebar-row")!.getBoundingClientRect();return {a:{x:a.x,y:a.y,w:a.width,h:a.height},b:{x:b.x,y:b.y,w:b.width,h:b.height}};});
  expect(place.a.x).toBeGreaterThanOrEqual(place.b.x);expect(place.a.y).toBeGreaterThanOrEqual(place.b.y);expect(place.a.y+place.a.h).toBeLessThanOrEqual(place.b.y+place.b.h);
  await page.keyboard.press("2");await expect(page.locator(`[data-tab-id="${tb.tab.id}"]`)).toHaveAttribute("aria-selected","true");await expect(badges).toHaveCount(0);
  await prefixKey(page,"1");await expect(page.locator(".terminal-pane")).toHaveCount(2);
  await prefixKey(page,"f");await expect(page.locator(".prefix-indicator")).toContainText("ペインを選択");await page.keyboard.press("2");
  await expect(page.locator(`[data-pane-id="${split.pane.id}"].pane-frame`)).toHaveAttribute("aria-current","true");await expect(badges).toHaveCount(0);
  await prefixKey(page,"u");await page.keyboard.press("2");await expect(page.locator(`.sidebar-row[data-drop-workspace-id="${wb.workspace.id}"]`)).toHaveAttribute("aria-current","true");
  await prefixKey(page,"d");await expect(page.locator('[data-number-target="agent"]')).toHaveCount(1);await page.keyboard.press("1");
  await expect(page.locator(`[data-pane-id="${split.pane.id}"].pane-frame`)).toHaveAttribute("aria-current","true");await expect(badges).toHaveCount(0);
  await page.keyboard.press("Control+b");await expect(badges.first()).toBeVisible();await page.keyboard.press("Escape");await expect(badges).toHaveCount(0);
 });
}
