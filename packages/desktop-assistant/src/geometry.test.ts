import { expect, it } from "vitest";
import { DesktopAssistantPreferences } from "@sodashitsu/protocol";
import { WINDOW_RESIZE_HANDLES,resizeWindowBounds,bubbleBounds, noticeBounds, characterBounds, resizeBubbleBounds } from "./geometry.js";
it("keeps character and tray bubbles within the selected secondary monitor and falls back on removal", () => {
  const displays = [
    { id: "primary", workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
    { id: "secondary", workArea: { x: -640, y: 0, width: 640, height: 480 } },
  ];
  const prefs = DesktopAssistantPreferences.parse({
    position: { displayId: "secondary", x: -620, y: 430 },
  });
  const bounds = bubbleBounds(prefs, displays);
  expect(bounds).toMatchObject({ width: 400, height: 480, y: 0 });
  expect(bounds.x).toBeGreaterThanOrEqual(-640);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(0);
  const fallback = bubbleBounds(prefs, displays.slice(0, 1));
  expect(fallback.x).toBeGreaterThanOrEqual(0);
  expect(fallback.y).toBeGreaterThanOrEqual(0);
  expect(bubbleBounds({ ...prefs, mode: "tray" }, displays).y).toBe(0);
});


it("places the automatic character flush with the work-area right and bottom edges", () => {
  const prefs=DesktopAssistantPreferences.parse({characterSize:192});
  expect(characterBounds(prefs,[{id:"primary",workArea:{x:0,y:0,width:1920,height:1040}}])).toEqual({x:1728,y:848,width:192,height:192});
  expect(characterBounds(prefs,[{id:"primary",workArea:{x:-1920,y:-1080,width:1920,height:1040}}])).toEqual({x:-192,y:-232,width:192,height:192});
});

it("preserves explicit positions and clamps the standing window on small displays", () => {
  const displays=[{id:"primary",workArea:{x:0,y:0,width:1920,height:1040}},{id:"secondary",workArea:{x:-100,y:0,width:100,height:80}}];
  const prefs=DesktopAssistantPreferences.parse({characterSize:192,position:{displayId:"primary",x:120,y:300}});
  expect(characterBounds(prefs,displays)).toMatchObject({x:120,y:300});
  expect(characterBounds({...prefs,position:{displayId:"secondary",x:-20,y:20}},displays)).toEqual({x:-80,y:0,width:80,height:80});
});


it("keeps the visible tail tip six pixels above the framed captain's cap at every character size", () => {
  const displays=[{id:"primary",workArea:{x:0,y:0,width:1920,height:1440}}];
  for(const characterSize of [128,192,256]){
    const prefs=DesktopAssistantPreferences.parse({characterSize});const character=characterBounds(prefs,displays);
    const bubble=bubbleBounds(prefs,displays);const visibleBottom=bubble.y+bubble.height-8;
    expect(character.y-visibleBottom).toBeCloseTo(6,0);
  }
  const prefs=DesktopAssistantPreferences.parse({characterSize:192});
  expect(bubbleBounds(prefs,displays,{width:600,height:700})).toMatchObject({width:600,height:700});
});

it("resizes the top and left without moving the right or bottom anchors", () => {
  const area={x:-1000,y:-100,width:1000,height:1000},start={x:-800,y:100,width:400,height:600};
  expect(resizeBubbleBounds(start,"nw",-100,-50,area)).toEqual({x:-900,y:50,width:500,height:650});
  for(const handle of ["n","w","nw"] as const){
    for(const delta of [-10000,10000]){
      const r=resizeBubbleBounds(start,handle,delta,delta,area);
      expect(r.x+r.width).toBe(start.x+start.width);expect(r.y+r.height).toBe(start.y+start.height);
      expect(r.width).toBeGreaterThanOrEqual(320);expect(r.height).toBeGreaterThanOrEqual(420);
      expect(r.x).toBeGreaterThanOrEqual(area.x);expect(r.y).toBeGreaterThanOrEqual(area.y);
      expect(r.x+r.width).toBeLessThanOrEqual(area.x+area.width);expect(r.y+r.height).toBeLessThanOrEqual(area.y+area.height);
    }
  }
});

it("places compact notices to the left and below chat without leaving negative or tiny work areas",()=>{
 const prefs=DesktopAssistantPreferences.parse({characterSize:192});
 const displays=[{id:"primary",workArea:{x:0,y:0,width:1920,height:1040}}];
 const character=characterBounds(prefs,displays),chat=bubbleBounds(prefs,displays),notice=noticeBounds(prefs,displays,1,chat);
 expect(notice.x+notice.width).toBe(character.x+2);expect(notice.y).toBeGreaterThanOrEqual(chat.y+chat.height);
 expect(notice.y+notice.height).toBeLessThanOrEqual(1040);
 const tiny=noticeBounds(prefs,[{id:"secondary",workArea:{x:-240,y:-100,width:240,height:180}}]);
 expect(tiny).toEqual({x:-240,y:-96,width:240,height:176});
});

it("keeps tall and wide custom artwork flush with the taskbar and anchors bubbles to its actual top",()=>{
 const prefs=DesktopAssistantPreferences.parse({characterId:"plugin:yukkuri-work/zundamon",allowPluginCharacters:true,characterSize:192});
 const displays=[{id:"primary",workArea:{x:0,y:0,width:1920,height:1040}}];
 for(const ratio of [0.5,1.5]){
  const char=characterBounds(prefs,displays,ratio),bubble=bubbleBounds(prefs,displays,undefined,ratio),notice=noticeBounds(prefs,displays,ratio);
  expect(char.x+char.width).toBe(1920);expect(char.y+char.height).toBe(1040);expect(char.width/char.height).toBeCloseTo(ratio,1);
  expect(bubble.y+bubble.height).toBe(char.y+2);expect(notice.x+notice.width).toBe(char.x+2);expect(notice.y+notice.height).toBeLessThanOrEqual(1040);
 }
});

it("resizes every transparent card edge within current work areas and minimum sizes",()=>{
 const start={x:100,y:100,width:500,height:500},area={x:0,y:0,width:1000,height:900};
 expect(resizeWindowBounds(start,"se",50,70,area)).toEqual({x:100,y:100,width:550,height:570});
 expect(resizeWindowBounds(start,"nw",-50,-20,area)).toEqual({x:50,y:80,width:550,height:520});
 for(const h of WINDOW_RESIZE_HANDLES)for(const delta of [-10000,10000]){
  const r=resizeWindowBounds(start,h,delta,delta,area);expect(r.width).toBeGreaterThanOrEqual(360);expect(r.height).toBeGreaterThanOrEqual(360);expect(r.x).toBeGreaterThanOrEqual(area.x);expect(r.y).toBeGreaterThanOrEqual(area.y);expect(r.x+r.width).toBeLessThanOrEqual(area.width);expect(r.y+r.height).toBeLessThanOrEqual(area.height);
 }
 const small={x:-300,y:-200,width:300,height:200};expect(resizeWindowBounds({x:2000,y:0,width:1200,height:900},"e",0,0,small)).toEqual(small);
});
