import {expect,test} from '../support/fixtures.js';
import {prefixKey,focusTerminal} from '../support/keys.js';
/** Generated settings responses only: never enables a real GUI, recording or model. */
test('assistant settings offer enable, preparation cancellation and narrow layout without standalone installation',async({page,appServer})=>{
 const writes:boolean[]=[];let enabled=false;
 await page.routeWebSocket(/\/ws$/,route=>{const server=route.connectToServer();server.onMessage(data=>route.send(data));route.onMessage(data=>{
  if(typeof data==='string'){const request=JSON.parse(data);if(request.method==='assistant.settings.get'||request.method==='assistant.settings.set'){
   if(request.method.endsWith('.set')){expect(Object.keys(request.params)).toEqual(['enabled']);enabled=request.params.enabled;writes.push(enabled);}
   route.send(JSON.stringify({id:request.id,ok:true,result:{enabled,canConfigure:true,phase:enabled?'preparing':'disabled',message:enabled?'共通ランタイムを準備しています':''}}));return;
  }}server.send(data);
 });});
 await page.addInitScript(()=>localStorage.setItem('soda.prefs.v1',JSON.stringify({onboarding:false,uiStyle:'modern'})));
 await page.goto(`${appServer.origin}/#token=${appServer.token}`);await expect(page.locator('.xterm-helper-textarea')).toBeVisible();
 await focusTerminal(page);await prefixKey(page,'s');const dialog=page.locator('dialog.settings-dialog');await expect(dialog).toBeVisible();
 const section=dialog.locator('section[aria-labelledby="settings-assistant"]');await dialog.getByRole('button',{name:'デスクトップアシスタント',exact:true}).click();await expect(section).toBeVisible();
 const toggle=section.getByRole('checkbox',{name:'デスクトップアシスタントを有効にする'});await expect(toggle).toBeEnabled();await toggle.check();await expect(section).toContainText('初回準備中');await expect(toggle).toBeEnabled();await toggle.uncheck();await expect(toggle).not.toBeChecked();await expect(section).toContainText('状態：無効');expect(writes).toEqual([true,false]);
 await page.screenshot({path:test.info().outputPath('assistant-settings-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();await expect(section.getByText('デスクトップアシスタント',{exact:true})).toBeVisible();await toggle.check();await expect(section).toContainText('初回準備中');await toggle.uncheck();await expect(toggle).not.toBeChecked();await page.screenshot({path:test.info().outputPath('assistant-settings-narrow.png'),fullPage:true});
});
