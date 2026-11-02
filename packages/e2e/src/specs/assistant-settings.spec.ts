import {expect,test} from '../support/fixtures.js';
import {prefixKey,focusTerminal} from '../support/keys.js';
/** Generated settings responses only: never enables a real GUI, recording or model. */
test('assistant settings offer enable, preparation cancellation and narrow layout without standalone installation',async({page,appServer})=>{
 const writes:boolean[]=[];let enabled=false,stage="download";const startedAt=Date.now();
 await page.routeWebSocket(/\/ws$/,route=>{const server=route.connectToServer();server.onMessage(data=>route.send(data));route.onMessage(data=>{
  if(typeof data==='string'){const request=JSON.parse(data);if(request.method==='assistant.settings.get'||request.method==='assistant.settings.set'){
   if(request.method.endsWith('.set')){expect(Object.keys(request.params)).toEqual(['enabled']);enabled=request.params.enabled;writes.push(enabled);}
   route.send(JSON.stringify({id:request.id,ok:true,result:{enabled,canConfigure:true,phase:enabled?'preparing':'disabled',message:'',...(enabled?{progress:{stage,receivedBytes:50*1024*1024,totalBytes:100*1024*1024,startedAt,updatedAt:Date.now()}}:{})}}));return;
  }}server.send(data);
 });});
 await page.addInitScript(()=>localStorage.setItem('soda.prefs.v1',JSON.stringify({onboarding:false,uiStyle:'modern'})));
 await page.goto(`${appServer.origin}/#token=${appServer.token}`);await expect(page.locator('.xterm-helper-textarea')).toBeVisible();
 await focusTerminal(page);await prefixKey(page,'s');const dialog=page.locator('dialog.settings-dialog');await expect(dialog).toBeVisible();
 const section=dialog.locator('section[aria-labelledby="settings-assistant"]');await dialog.getByRole('button',{name:'デスクトップアシスタント',exact:true}).click();await expect(section).toBeVisible();
 const toggle=section.getByRole('checkbox',{name:'デスクトップアシスタントを有効にする'});await expect(toggle).toBeEnabled();await toggle.check();await expect(section).toContainText('初回準備中');await expect(toggle).toBeEnabled();await expect(section.locator('progress')).toHaveAttribute('value','50');await expect(section).toContainText('50.0 MB / 100.0 MB');stage='extract';await expect(section).toContainText('ファイルを展開中');await expect(section.locator('progress')).not.toHaveAttribute('value');await toggle.uncheck();await expect(toggle).not.toBeChecked();await expect(section).toContainText('状態：無効');expect(writes).toEqual([true,false]);
 await page.screenshot({path:test.info().outputPath('assistant-settings-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();await expect(section.getByText('デスクトップアシスタント',{exact:true})).toBeVisible();stage='download';await toggle.check();await expect(section).toContainText('初回準備中');await expect(section.locator('progress')).toHaveAttribute('value','50');await section.locator('[data-assistant-setup-progress]').scrollIntoViewIfNeeded();expect(await section.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('assistant-setup-progress-narrow.png'),fullPage:true});await toggle.uncheck();await expect(toggle).not.toBeChecked();await page.screenshot({path:test.info().outputPath('assistant-settings-narrow.png'),fullPage:true});
});
