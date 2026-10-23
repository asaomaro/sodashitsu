import { expect, it } from "vitest";
import { DesktopEscape, DesktopButtons } from "./input.js";
it("requires two released bare Escape presses within 500ms",()=>{
  const escape=new DesktopEscape();
  expect(escape.key("Escape",true,false,false,0)).toBe(false);
  expect(escape.key("Escape",true,true,false,10)).toBe(false);
  expect(escape.key("Escape",false,false,false,20)).toBe(false);
  expect(escape.key("Escape",true,false,false,500)).toBe(true);
  expect(escape.key("Escape",true,false,false,501)).toBe(false);
});
it("expires and clears the exit sequence on other keys, modifiers and focus/mouse reset",()=>{
  const escape=new DesktopEscape();
  for(const interrupt of [()=>escape.reset(),()=>escape.key("KeyA",true,false,false,200),()=>escape.key("Escape",true,false,true,200)]){
    escape.key("Escape",true,false,false,0);escape.key("Escape",false,false,false,10);interrupt();
    expect(escape.key("Escape",true,false,false,300)).toBe(false);escape.reset();
  }
  escape.key("Escape",true,false,false,0);escape.key("Escape",false,false,false,10);
  expect(escape.key("Escape",true,false,false,501)).toBe(false);
});
it("does not count a second keydown without a physical release",()=>{
  const escape=new DesktopEscape();escape.key("Escape",true,false,false,0);
  expect(escape.key("Escape",true,false,false,100)).toBe(false);
});
it("keeps all five mouse buttons distinct and emits each chord transition",()=>{
  const buttons=new DesktopButtons();
  expect(buttons.update(1)).toEqual([{button:0,event:"down"}]);
  expect(buttons.update(1|4|8|16)).toEqual([{button:1,event:"down"},{button:3,event:"down"},{button:4,event:"down"}]);
  expect(buttons.update(4|16)).toEqual([{button:0,event:"up"},{button:3,event:"up"}]);
  expect(buttons.update(0)).toEqual([{button:1,event:"up"},{button:4,event:"up"}]);
  expect(buttons.update(0)).toEqual([]);
  buttons.update(31);buttons.reset();expect(buttons.update(1)).toEqual([{button:0,event:"down"}]);
});
