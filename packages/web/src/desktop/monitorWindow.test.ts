import {expect,it} from "vitest";
import {DesktopMonitorLayout,desktopMonitorAt} from "@sodashitsu/protocol";
import {desktopWindowUrl,readDesktopWindow,parseDesktopWindow,monitorPointer,monitorViewport,monitorWindowUrl,parseMonitorWindow,readMonitorWindow} from "./monitorWindow.js";
import {presets} from "./settings.js";
const layout=DesktopMonitorLayout.parse({selected:"all",bounds:{x:-640,y:-200,width:1440,height:800},allSupported:true,monitors:[{id:"left",x:-640,y:-200,width:640,height:480,primary:false,scalePercent:125},{id:"right",x:0,y:0,width:800,height:600,primary:true,scalePercent:150}]});
const launch={machineId:"abc-123",label:"Generated B",monitor:"left",settings:presets.balanced,cursor:true,clipboard:true,deltas:true,independent:false};
it("roundtrips only strict launch preferences and rejects secrets, grants and malformed URLs",()=>{
 const url=monitorWindowUrl(launch,"https://a.invalid/old");expect(url.pathname).toBe("/desktop-view");expect(readMonitorWindow(url.hash)).toEqual(launch);
 for(const extra of [{ticket:"secret"},{allowInput:true},{audio:true},{microphone:true},{key:"secret"}])expect(()=>parseMonitorWindow({...launch,...extra})).toThrow();
 for(const bad of [{monitor:"all"},{monitor:""},{monitor:"x\0y"},{machineId:"//evil"},{label:"x".repeat(257)},{cursor:"true"},{settings:{...presets.balanced,sharedDesktop:true}},{settings:{...presets.balanced,deltas:false}}])expect(()=>parseMonitorWindow({...launch,...bad})).toThrow();
 for(const hash of ["#%","#null","#[]","#"+"x".repeat(8193)])expect(()=>readMonitorWindow(hash)).toThrow();
});
it("uses physical composite fractions for negative coordinates, mixed DPI and gaps",()=>{
 expect(monitorViewport(layout,"left")).toEqual({x:0,y:0,width:640/1440,height:480/800});
 expect(monitorViewport(layout,"right")).toEqual({x:640/1440,y:200/800,width:800/1440,height:600/800});
 expect(monitorViewport(undefined,"left")).toBeUndefined();expect(monitorViewport({...layout,selected:"left"},"left")).toBeUndefined();expect(monitorViewport(layout,"missing")).toBeUndefined();
});
it("clamps captured drags and physical border pixels to the chosen monitor",()=>{
 for(const id of ["left","right"])for(const [x,y]of[[-2,-2],[0,0],[0.5,0.5],[1,1],[2,2]]){
  const p=monitorPointer(layout,id!,x!,y!)!;expect(desktopMonitorAt(layout,p.x,p.y)?.id).toBe(id);
 }
 expect(monitorPointer(layout,"right",640/1440,200/800)).toEqual({x:640/1439,y:200/799});
 expect(monitorPointer(layout,"missing",0,0)).toBeUndefined();expect(monitorPointer(layout,"left",NaN,0)).toBeUndefined();
});

it("opens a strict desktop page without a remote workspace or persisted permission",()=>{const plain={machineId:"a".repeat(32),label:"Generated signin B"};expect(readDesktopWindow(desktopWindowUrl(plain,"https://a.invalid").hash)).toEqual(plain);expect(readDesktopWindow(monitorWindowUrl(launch,"https://a.invalid").hash)).toEqual(launch);for(const bad of [{...plain,allowInput:true},{...plain,ticket:"secret"},{...plain,key:"secret"},{...plain,machineId:"//other"},{...plain,label:"x\0y"},null,[]])expect(()=>parseDesktopWindow(bad)).toThrow();});

it("keeps independent monitor launch distinct from composite clipping",()=>{const direct={...launch,independent:true};expect(readMonitorWindow(monitorWindowUrl(direct,"https://a.invalid").hash)).toEqual(direct);expect(()=>parseMonitorWindow({...launch,independent:"true"})).toThrow();});
