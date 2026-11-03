import {chromium} from "@playwright/test";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {THEME_NAMES} from "@sodashitsu/protocol";
import {uiTokens} from "@sodashitsu/client-core";

// Source CSS verification in Chromium: use the components' actual rules and compare
// navigation before/after the theme sheet, including active rows. No server or PTY.
const root=new URL("../../web/src/",import.meta.url);
const components=["App","Sidebar","MachineHeader","ScreenSwitcher","SettingsDialog","NameDialog","RemoteDesktopWindow","ContextMenu","TabBar","ViewerTabBar","NotificationHistoryDialog","WorktreeOpenDialog"];
const {parse}=createRequire(new URL("../../web/package.json",import.meta.url))("vue/compiler-sfc");
async function actionProbe(file,match,id){
 const source=await readFile(new URL(file,root),"utf8"),{descriptor}=parse(source);let found;
 function walk(n){if(n.type===1&&n.tag==="button"){const attrs=Object.fromEntries(n.props.filter(p=>p.type===6).map(p=>[p.name,p.value?.content??""]));if(match(attrs,n.loc.source))found=attrs;}for(const c of n.children??[])walk(c);}
 walk(descriptor.template.ast);assert.ok(found,`${file}: action probe missing`);
 // Render static attributes from the real action, not a separately annotated test copy.
 return `<button id="${id}" ${Object.entries(found).filter(([k])=>["type","class","data-assistant-action","data-assistant-feature"].includes(k)).map(([k,v])=>`${k}="${v}"`).join(" ")}>操作</button>`;
}
const probes=await Promise.all([
 actionProbe("components/RemoteDesktopWindow.vue",(_a,s)=>s.includes('@click="toggleControl"'),"remote-control"),
 actionProbe("components/TabBar.vue",a=>a.class?.includes("tab-bar-add-view"),"work-view"),
 actionProbe("components/ViewerTabBar.vue",a=>a.class==="viewer-menu-button","connection-view"),
 actionProbe("components/AssistantSettings.vue",()=>true,"assistant-retry"),
 actionProbe("resources/ResourceMonitorView.vue",(_a,s)=>s.includes('@click="refresh(true)"'),"resource-refresh"),
 actionProbe("components/WorkspaceView.vue",(_a,s)=>s.includes('@click="save"'),"file-save"),
 actionProbe("dashboard/UsageAnalytics.vue",a=>a.class==="generate-report","report-generate"),
 actionProbe("components/SettingsDialog.vue",a=>a.class==="settings-close","close"),
 actionProbe("components/NameDialog.vue",a=>a.type==="submit","save"),
]);
const featureIds=["remote-info","sidebar-edge","pane-footer","system-footer","screen-more"];
const featureProbes=await Promise.all([
 actionProbe("components/RemoteDesktopWindow.vue",(_a,s)=>s.includes('@click="infoOpen = !infoOpen"'),"remote-info"),
 actionProbe("components/Sidebar.vue",(_a,s)=>s.includes('sidebar-edge'),"sidebar-edge"),
 actionProbe("components/PaneStatusline.vue",a=>a["data-assistant-feature"]!==undefined,"pane-footer"),
 actionProbe("components/SystemFooter.vue",a=>a["data-assistant-feature"]!==undefined,"system-footer"),
 actionProbe("components/ScreenSwitcher.vue",a=>a["data-assistant-feature"]!==undefined,"screen-more"),
]);
const dangerProbes=await Promise.all([actionProbe("components/NotificationHistoryDialog.vue",a=>a.class==="nh-confirm","danger-confirm"),actionProbe("components/WorktreeOpenDialog.vue",a=>a.class==="worktree-open-dialog-delete","danger-delete")]);
const actionIds=["remote-control","work-view","connection-view","assistant-retry","resource-refresh","file-save","report-generate","close","save"];
let componentCss="";
for(const name of components){
 const source=await readFile(new URL(name==="App"?"App.vue":`components/${name}.vue`,root),"utf8");
 for(const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g))componentCss+=match[1]+"\n";
}
const pairing=await readFile(new URL("components/DesktopEndpointPairing.vue",root),"utf8");
const fingerprintInput=/<input\s+v-model="peer"[\s\S]*?\/>/.exec(pairing)?.[0];assert.ok(fingerprintInput,"fingerprint input probe missing");
const sheet=await readFile(new URL("styles/buttonTheme.css",root),"utf8");
const browser=await chromium.launch({headless:true,...(process.env.SODA_E2E_CHROMIUM_PATH?{executablePath:process.env.SODA_E2E_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 for(const name of THEME_NAMES) for(const mode of ["none","actions","features"]){
  await page.setContent(`<style>${componentCss}</style>
   <div class="sidebar"><button id="section" class="sidebar-btn sidebar-section-toggle">spaces</button><button id="sort" class="sidebar-btn sidebar-sort-btn">開いた順</button>
   <div class="machine-header"><button id="group" class="sidebar-group-toggle">▾</button><button id="desktop" class="machine-desktop">▤</button><button id="toggle" class="machine-toggle">▾</button><button id="machine" class="machine-select" aria-current="true">ローカル</button></div></div>
   <nav class="screen-switcher"><button id="screen" class="screen-switcher-btn screen-switcher-btn-active" aria-pressed="true">グラフ</button></nav>
   <nav class="screen-extra-menu"><button id="menu">リソースモニター</button></nav>
   <nav class="settings-menu"><button id="category" class="settings-menu-item" aria-current="true">通知</button></nav>
   <button id="switch" class="settings-switch" aria-checked="true"><span class="settings-mark">入</span>通知</button>
   ${probes.join("\n")}${featureProbes.join("\n")}${dangerProbes.join("\n")}<button id="plain" class="soda-button-action soda-button-plain">plain</button>
   ${fingerprintInput.replace("<input",'<input id="fingerprint"')}<textarea id="flat-textarea"></textarea><select id="flat-select"><option>sample</option><option disabled>unavailable</option><optgroup disabled label="group"><option>disabled group item</option></optgroup></select><input id="untouched-check" type="checkbox"><input id="untouched-range" type="range">
   <ul class="context-menu" id="context-popup"><li class="context-menu-active" id="context-row">menu</li></ul>
   <section id="scroll" style="height:50px;overflow:auto"><div style="height:300px">scroll</div></section>`);
  await page.evaluate(({name,tokens,mode})=>{document.documentElement.dataset.buttonTheme=mode;document.documentElement.dataset.theme=name;for(const[k,v]of Object.entries(tokens.vars))document.documentElement.style.setProperty(k,v);}, {name,tokens:uiTokens(name),mode});
  const inspect=()=>page.evaluate(actionIds=>Object.fromEntries(["section","sort","group","desktop","toggle","machine","screen","menu","category","switch","danger-confirm","danger-delete","plain",...actionIds].map(id=>{const s=getComputedStyle(document.getElementById(id));return[id,{background:s.backgroundColor,color:s.color,radius:s.borderRadius,shadow:s.boxShadow}];})),[...actionIds,...featureIds]);
  const widgets=()=>page.evaluate(()=>["untouched-check","untouched-range"].map(id=>{const c=getComputedStyle(document.getElementById(id));return [c.appearance,c.borderTopStyle];}));
  const originalWidgets=await widgets();
  const before=await inspect();await page.addStyleTag({content:sheet});const after=await inspect();
  for(const id of ["section","sort","group","desktop","toggle","machine","screen","menu","category","switch","danger-confirm","danger-delete","plain"])assert.deepEqual(after[id],before[id],`${name}/${mode}: navigation/label ${id} changed`);
  const flat=await page.evaluate(ids=>ids.every(id=>{const s=getComputedStyle(document.getElementById(id));return s.borderTopStyle==="solid"&&s.borderTopWidth==="1px"&&s.appearance==="none";}),[...actionIds,...featureIds]);
  assert.equal(flat,true,`${name}/${mode}: native button bevel remains`);
  assert.deepEqual(await widgets(),originalWidgets,`${name}/${mode}: native check/range changed`);
  const fields=await page.evaluate(()=>["fingerprint","flat-textarea","flat-select"].every(id=>{const c=getComputedStyle(document.getElementById(id));return c.borderTopStyle==="solid"&&c.borderTopWidth==="1px"&&c.boxShadow==="none";}));
  assert.equal(fields,true,`${name}/${mode}: native field bevel remains`);
  const rounded=await page.evaluate(()=>({menu:getComputedStyle(document.querySelector(".screen-extra-menu")).borderRadius,row:getComputedStyle(document.getElementById("menu")).borderRadius,footer:getComputedStyle(document.getElementById("section")).borderRadius,context:getComputedStyle(document.getElementById("context-popup")).borderRadius,contextRow:getComputedStyle(document.getElementById("context-row")).borderRadius}));
  for(const [kind,radius] of Object.entries(rounded))assert.ok(parseFloat(radius)>=6,`${name}/${mode}: ${kind} has square corners`);
  const picker=await page.locator("#flat-select").evaluate(el=>({appearance:getComputedStyle(el).appearance,radius:getComputedStyle(el,"::picker(select)").borderRadius,option:getComputedStyle(el.options[0]).borderRadius}));
  assert.deepEqual(picker,{appearance:"base-select",radius:"10px",option:"6px"},`${name}/${mode}: native square picker remains`);
  const disabledOptions=await page.locator("#flat-select").evaluate(el=>[...el.querySelectorAll("option:disabled")].map(o=>getComputedStyle(o).opacity));
  assert.deepEqual(disabledOptions,["0.5","0.5"],`${name}/${mode}: disabled option looks enabled`);
  const accent=await page.evaluate(()=>{const e=document.createElement("span");e.style.background="var(--soda-accent)";document.body.append(e);const bg=getComputedStyle(e).backgroundColor;e.remove();return bg;});
  for(const id of actionIds){if(mode==="none")assert.deepEqual(after[id],before[id],`${name}/${mode}: ${id}`);else assert.equal(after[id].background,accent,`${name}/${mode}: ${id}`);}
  for(const id of featureIds){if(mode!=="features")assert.deepEqual(after[id],before[id],`${name}/${mode}: ${id}`);else assert.equal(after[id].background,accent,`${name}/${mode}: ${id}`);}

 }
 console.log(`PASS: ${THEME_NAMES.length} themes × 3 levels; source action/sidebar/pane-footer/system-footer controls, plain menus/tabs/navigation and danger colors`);
}finally{await browser.close();}
