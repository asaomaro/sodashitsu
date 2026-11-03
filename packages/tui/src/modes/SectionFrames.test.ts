import {expect,it,vi} from "vitest";
import {chordToKeyInput} from "@sodashitsu/client-core";
import {MonitorView} from "./MonitorView.js";
import {ConnectionsView} from "./ConnectionsView.js";
import {ScheduleView} from "./ScheduleView.js";
import {UsageDashboard} from "./UsageView.js";
import {ConversationDialog} from "./ConversationDialog.js";
import {SessionModel} from "../model/SessionModel.js";
import {UiState} from "../model/UiState.js";
import {PrefsModel} from "../model/PrefsModel.js";
import type {UsageModel} from "../model/UsageModel.js";
import type {RequestPort} from "../term/PaneRegistry.js";
import {Grid} from "../render/Screen.js";
import {DEFAULT_COLOR,ThemeColors} from "../render/color.js";
import {pageHeader} from "../render/chrome/page.js";
import {resourcesFixture,insightsFixture} from "../testing/monitorFixtures.js";
function sides(g:Grid,x:number,right:number,top:number,bottom:number){
 expect(g.cell(x,top).ch).toBe("╭");expect(g.cell(right,top).ch).toBe("╮");
 expect(g.cell(x,bottom).ch).toBe("╰");expect(g.cell(right,bottom).ch).toBe("╯");
 for(let y=top+1;y<bottom;y++){expect(["│","├"]).toContain(g.cell(x,y).ch);expect(["│","┤"]).toContain(g.cell(right,y).ch);}
}
it.each(["analytics","resources"] as const)("%s frames every group on all four sides, including scrolled content",async(mode)=>{
 const model=new SessionModel(),ui=new UiState(model),request=vi.fn(async()=>mode==="analytics"?insightsFixture():resourcesFixture());
 const v=new MonitorView(mode,ui,{request} as unknown as RequestPort,()=>{});
 const draw=(w=120,h=65)=>{const g=new Grid(w,h);v.render(g,{x:0,y:0,w,h},new ThemeColors("dracula"));return g;};
 try{v.sync(true);await vi.waitFor(()=>expect(draw().rowText(5)).not.toContain("取得しています"));await vi.waitFor(()=>expect(draw().ch).toContain("╭"));
  for(const section of mode==="analytics"?["1","2","3","4","5"]:["1"]){if(mode==="analytics")v.handleKey(chordToKeyInput(section)!);const g=draw();let count=0;
   for(let y=0;y<g.h;y++)if(g.cell(1,y).ch==="╭"){const bottom=Array.from({length:g.h-y-1},(_,i)=>y+i+1).find(row=>g.cell(1,row).ch==="╰");expect(bottom).toBeDefined();sides(g,1,g.w-3,y,bottom!);count++;}expect(count).toBeGreaterThan(0);
  }
  draw(35,18);v.handleKey(chordToKeyInput("End")!);const g=draw(35,18);for(let y=4;y<18;y++)if(g.cell(1,y).ch==="│")expect(g.cell(32,y).ch).toBe("│");
 }finally{v.dispose();}
});
it("existing usage, schedule and connection groups have complete frames",()=>{
 const m=new SessionModel(),ui=new UiState(m),rpc={request:vi.fn(async()=>({}))} as unknown as RequestPort;
 const usage={status:"ready",data:{panes:{},accounts:[]}} as unknown as UsageModel;
 const views=[new UsageDashboard(m,ui,usage,()=>{}),new ScheduleView(m,ui,rpc,()=>{}),new ConnectionsView(ui,rpc,()=>{})];
 try{for(const v of views){const g=new Grid(100,32);v.render(g,{x:0,y:0,w:100,h:32},new ThemeColors("dracula"));const top=Array.from({length:g.h},(_,i)=>i).find(y=>[g.cell(0,y).ch,g.cell(1,y).ch].includes("╭"))!;expect(top).toBeDefined();const left=g.cell(0,top).ch==="╭"?0:1;sides(g,left,98,top,30);}}
 finally{for(const v of views)if("dispose"in v)v.dispose();}
});
it("full-screen history and external connections follow transparency; history modal stays opaque",()=>{
 const m=new SessionModel(),ui=new UiState(m),rpc={request:vi.fn(async()=>({sessions:[],partial:false}))} as unknown as RequestPort;
 const history=new ConversationDialog("sessions",null,ui,rpc,new PrefsModel(),m,()=>{},()=>{},()=>{}),connections=new ConnectionsView(ui,rpc,()=>{});
 const area={x:2,y:2,w:96,h:24};
 try{for(const transparent of [false,true,false]){const theme=new ThemeColors("dracula",undefined,transparent),expected=transparent?DEFAULT_COLOR:theme.ui("--soda-menu-bg");
  for(const view of [history,connections]){const g=new Grid(100,30);if(view===history)history.render({grid:g,theme},area);else connections.render(g,area,theme);pageHeader(g,area,theme);expect(g.cell(80,20).bg).toBe(expected);expect(g.cell(50,2).bg).toBe(transparent?DEFAULT_COLOR:theme.ui("--soda-menu-active-bg"));}
  const modal=new Grid(100,30);history.render({grid:modal,theme});expect(modal.cell(50,20).bg).toBe(theme.ui("--soda-menu-bg"));
 }}finally{history.dispose();connections.dispose();}
});
it("static summary cards respect transparency while selected tabs remain highlighted",async()=>{
 const m=new SessionModel(),ui=new UiState(m),rpc={request:vi.fn(async()=>insightsFixture())} as unknown as RequestPort;
 const v=new MonitorView("analytics",ui,rpc,()=>{});try{v.sync(true);await vi.waitFor(()=>expect(rpc.request).toHaveBeenCalled());await new Promise(r=>setTimeout(r,0));
 for(const transparent of [false,true]){const t=new ThemeColors("dracula",undefined,transparent),g=new Grid(120,40);v.render(g,{x:0,y:0,w:120,h:40},t);const metric=Array.from({length:g.h},(_,y)=>y).find(y=>g.rowText(y).includes("トークン 100"))!;expect(metric).toBeDefined();expect(g.cell(80,metric).bg).toBe(transparent?DEFAULT_COLOR:t.ui("--soda-menu-active-bg"));expect(g.cell(2,1).bg).toBe(t.ui("--soda-menu-active-bg"));}
 }finally{v.dispose();}
});
