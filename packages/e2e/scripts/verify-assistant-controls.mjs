import {chromium} from "@playwright/test";
import {readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {uiTokens} from "@sodashitsu/client-core";

// Source CSS verification in Chromium: use the components' actual rules and compare
// navigation before/after the theme sheet, including active rows. No server or PTY.
const root=new URL("../../web/src/",import.meta.url);
const components=["App","Sidebar","MachineHeader","ScreenSwitcher","SettingsDialog","NameDialog","TabBar","ViewerTabBar","NotificationHistoryDialog","WorktreeOpenDialog"];
const {parse}=createRequire(new URL("../../web/package.json",import.meta.url))("vue/compiler-sfc");
async function actionProbe(file,match,id){
 const source=await readFile(new URL(file,root),"utf8"),{descriptor}=parse(source);let found;
 function walk(n){if(n.type===1&&n.tag==="button"){const attrs=Object.fromEntries(n.props.filter(p=>p.type===6).map(p=>[p.name,p.value?.content??""]));if(match(attrs,n.loc.source))found=attrs;}for(const c of n.children??[])walk(c);}
 walk(descriptor.template.ast);assert.ok(found,`${file}: action probe missing`);
 // Render static attributes from the real action, not a separately annotated test copy.
 return `<button id="${id}" ${Object.entries(found).filter(([k])=>["type","class","data-assistant-action"].includes(k)).map(([k,v])=>`${k}="${v}"`).join(" ")}>操作</button>`;
}
const probes=await Promise.all([
 actionProbe("components/TabBar.vue",a=>a.class?.includes("tab-bar-add-view"),"work-view"),
 actionProbe("components/ViewerTabBar.vue",a=>a.class==="viewer-menu-button","connection-view"),
 actionProbe("components/AssistantSettings.vue",()=>true,"assistant-retry"),
 actionProbe("resources/ResourceMonitorView.vue",(_a,s)=>s.includes('@click="refresh(true)"'),"resource-refresh"),
 actionProbe("components/WorkspaceView.vue",(_a,s)=>s.includes('@click="save"'),"file-save"),
 actionProbe("dashboard/UsageAnalytics.vue",a=>a.class==="generate-report","report-generate"),
 actionProbe("components/SettingsDialog.vue",a=>a.class==="settings-close","close"),
 actionProbe("components/NameDialog.vue",a=>a.type==="submit","save"),
]);
const dangerProbes=await Promise.all([actionProbe("components/NotificationHistoryDialog.vue",a=>a.class==="nh-confirm","danger-confirm"),actionProbe("components/WorktreeOpenDialog.vue",a=>a.class==="worktree-open-dialog-delete","danger-delete")]);
const actionIds=["work-view","connection-view","assistant-retry","resource-refresh","file-save","report-generate","close","save"];
let componentCss="";
for(const name of components){
 const source=await readFile(new URL(name==="App"?"App.vue":`components/${name}.vue`,root),"utf8");
 for(const match of source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g))componentCss+=match[1]+"\n";
}
const sheet=await readFile(new URL("styles/assistantTheme.css",root),"utf8");
const browser=await chromium.launch({headless:true,...(process.env.SODA_E2E_CHROMIUM_PATH?{executablePath:process.env.SODA_E2E_CHROMIUM_PATH}:{})});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 for(const name of ["sodashitsu-assistant","sodashitsu-assistant-dark","dracula"]){
  await page.setContent(`<style>${componentCss}</style>
   <div class="sidebar"><button id="section" class="sidebar-btn sidebar-section-toggle">spaces</button><button id="sort" class="sidebar-btn sidebar-sort-btn">開いた順</button>
   <div class="machine-header"><button id="group" class="sidebar-group-toggle">▾</button><button id="desktop" class="machine-desktop">▤</button><button id="toggle" class="machine-toggle">▾</button><button id="machine" class="machine-select" aria-current="true">ローカル</button></div></div>
   <nav class="screen-switcher"><button id="screen" class="screen-switcher-btn screen-switcher-btn-active" aria-pressed="true">グラフ</button></nav>
   <nav class="screen-extra-menu"><button id="menu">リソースモニター</button></nav>
   <nav class="settings-menu"><button id="category" class="settings-menu-item" aria-current="true">通知</button></nav>
   <button id="switch" class="settings-switch" aria-checked="true"><span class="settings-mark">入</span>通知</button>
   ${probes.join("\n")}${dangerProbes.join("\n")}
   <section id="scroll" style="height:50px;overflow:auto"><div style="height:300px">scroll</div></section>`);
  await page.evaluate(({name,tokens})=>{document.documentElement.dataset.theme=name;for(const[k,v]of Object.entries(tokens.vars))document.documentElement.style.setProperty(k,v);}, {name,tokens:uiTokens(name)});
  const inspect=()=>page.evaluate(actionIds=>Object.fromEntries(["section","sort","group","desktop","toggle","machine","screen","menu","category","switch","danger-confirm","danger-delete",...actionIds].map(id=>{const s=getComputedStyle(document.getElementById(id));return[id,{background:s.backgroundColor,color:s.color,radius:s.borderRadius,shadow:s.boxShadow}];})),actionIds);
  const before=await inspect();if(name!=="dracula")before.machine.color=before.category.color;await page.addStyleTag({content:sheet});const after=await inspect();
  for(const id of ["section","sort","group","desktop","toggle","machine","screen","menu","category","switch","danger-confirm","danger-delete"])assert.deepEqual(after[id],before[id],`${name}: navigation/label ${id} changed`);
  if(name==="dracula")assert.deepEqual(after,before,"unrelated theme changed");
  else{
   for(const id of actionIds)assert.equal(after[id].background,"rgb(201, 166, 79)",`${name}: ${id} action is not gold`);
   assert.match(await page.locator("#scroll").evaluate(el=>getComputedStyle(el).scrollbarColor),/201, 166, 79/);
  }
 }
 console.log("PASS: navigation, menus, sidebar labels and switches retain component styles; actions and scrollbars are gold only in assistant themes");
}finally{await browser.close();}
