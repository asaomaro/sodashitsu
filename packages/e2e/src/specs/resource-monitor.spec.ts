import type {ResourceMonitorSnapshot} from "@sodashitsu/protocol";
import {resourceHostIdentity,resourceProcessIdentities} from "@sodashitsu/client-core/nodeResourceIdentity";
import { expect,test } from "../support/fixtures.js";
test("opens the resource monitor from Other, observes live processes, filters and pauses",async({page,appServer})=>{
 let received:ResourceMonitorSnapshot|undefined;
 // Observe the snapshot received by this browser, not a separate test client.
 page.on('websocket',socket=>socket.on('framereceived',frame=>{
  try{const packet=JSON.parse(frame.payload.toString());if(packet.result?.processes&&packet.result?.system)received=packet.result;}catch{}
 }));
 await page.goto(`${appServer.origin}/#token=${appServer.token}`);
 await page.locator('[data-screen-more]').click();
 await page.locator('.screen-extra-menu').getByRole('button',{name:'リソースモニター',exact:true}).click();
 const monitor=page.getByRole('region',{name:'リソースモニター',exact:true});
 await expect(monitor.getByRole('heading',{name:'リソースモニター'})).toBeVisible();
 await expect(monitor.locator('tbody tr').filter({hasText:'操舵室サーバ'})).toBeVisible();
 await expect(monitor.locator('[aria-label="操舵室関連プロセスの合計"]')).toContainText(/(?:MiB|GiB)/);
 // Observe the browser receiving a later sample and rendering CPU values.
 await expect.poll(()=>monitor.locator('tbody tr').filter({hasText:'操舵室サーバ'}).locator('td').nth(4).textContent()).toMatch(/\d+\.\d+%/);
 await monitor.getByLabel('検索',{exact:true}).fill('no-such-process-unique');
 await expect(monitor.getByText('表示するプロセスがありません。')).toBeVisible();
 await monitor.getByLabel('検索',{exact:true}).fill('');
 await monitor.getByLabel('対象',{exact:true}).selectOption('server');
 await expect(monitor.locator('tbody tr')).toHaveCount(1);
 await monitor.getByRole('button',{name:'自動更新を一時停止',exact:true}).click();
 await expect(monitor.getByText(/更新 · 一時停止中/)).toBeVisible();
 const reporter=await appServer.openClient();
 try{
  await reporter.request("server.resource_app_report",{deviceId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",hostId:await resourceHostIdentity(),platform:process.platform as "linux"|"darwin"|"win32",processes:[{pid:process.pid,startIdentity:(await resourceProcessIdentities([process.pid])).get(process.pid)??null,startedAt:Date.now(),name:"Generated app process",cpuPercent:25,rssBytes:123456789}]});
  await monitor.getByLabel('対象',{exact:true}).selectOption('all');
  await monitor.getByRole('button',{name:'更新',exact:true}).click();
  await expect(monitor.locator('tbody tr').filter({hasText:'Generated app process'})).toHaveCount(1);
  const sample=received as ResourceMonitorSnapshot|undefined;expect(sample).toBeDefined();
  const totalCpu=sample!.processes.reduce((sum,p)=>sum+(p.cpuPercent??0),0);
  const totalRss=sample!.processes.reduce((sum,p)=>sum+(p.rssBytes??0),0);
  const cpu=monitor.locator('[data-resource-total="cpu"] strong'),memory=monitor.locator('[data-resource-total="memory"] strong');
  await expect(cpu).toHaveText(`${totalCpu.toFixed(1)}%`);
  await expect(memory).toHaveText(totalRss>=1024**3?`${(totalRss/1024**3).toFixed(2)} GiB`:`${(totalRss/1024**2).toFixed(1)} MiB`);
  expect(totalCpu).toBeGreaterThanOrEqual(25);expect(totalRss).toBeGreaterThanOrEqual(123456789);
  const beforeCpu=await cpu.textContent(),beforeMemory=await memory.textContent();
  await monitor.getByLabel('検索',{exact:true}).fill('no-such-process-unique');
  await expect(monitor.getByText('表示するプロセスがありません。')).toBeVisible();
  await expect(cpu).toHaveText(beforeCpu!);await expect(memory).toHaveText(beforeMemory!);
  await monitor.getByLabel('検索',{exact:true}).fill('');
  // This app report describes the actual server PID on the same host/namespace.
  // Browser DOM must contain that PID only once after joining both sources.
  await expect(monitor.locator('tbody tr').filter({has:page.locator('td:nth-child(4)',{hasText:String(process.pid)})})).toHaveCount(1);
 }finally{reporter.close();}
 await page.screenshot({path:'/tmp/soda-resource-monitor.png'});
 await page.setViewportSize({width:390,height:700});
 const mobile=page.locator('.mobile-shell');
 await mobile.locator('details').filter({hasText:'リソースモニター'}).locator('summary').click();
 await mobile.getByRole('button',{name:'リソースモニター',exact:true}).click();
 await expect(page.locator('.mobile-schedules').getByRole('region',{name:'リソースモニター'})).toBeVisible();
 expect(await page.locator('.mobile-schedules .resource-monitor').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
