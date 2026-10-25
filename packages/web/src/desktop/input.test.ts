import { expect, it } from "vitest";
import { DesktopEscape, DesktopButtons, DesktopModifiers, DesktopInputSender } from "./input.js";
import type { RemoteDesktopInput } from "@sodashitsu/protocol";

function senderFixture() {
  let next = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const sent: RemoteDesktopInput[] = [];
  const sender = new DesktopInputSender(input => sent.push(input), callback => {
    frames.set(++next, callback); return next;
  }, frame => { frames.delete(frame); });
  return { sender, sent, frames, tick: () => { for (const callback of [...frames.values()]) callback(0); } };
}
const move = (x: number): RemoteDesktopInput => ({ kind: "pointer", event: "move", button: 0, x, y: 0.5 });

it("bounds a burst of 1000 pointer moves to one latest coordinate per browser frame", () => {
  const f = senderFixture();
  for (let i = 0; i < 1000; i++) f.sender.submit(move(i / 1000));
  expect(f.sent).toHaveLength(0);
  expect(f.frames.size).toBe(1);
  f.tick();
  expect(f.sent).toEqual([move(0.999)]);
  expect(f.frames.size).toBe(0);
  f.sender.submit(move(1)); f.tick();
  expect(f.sent).toEqual([move(0.999), move(1)]);
});
it("flushes the latest drag position before buttons, keys, wheel and text without batching them", () => {
  const f = senderFixture();
  const ordered: RemoteDesktopInput[] = [
    { kind: "pointer", event: "down", button: 0, x: 0, y: 0.5 },
    { kind: "key", code: "ControlLeft", down: true },
    { kind: "wheel", delta: 120 },
    { kind: "text", text: "test" },
    { kind: "key", code: "ControlLeft", down: false },
    ...[0, 1, 2, 3, 4].map(button => ({ kind: "pointer" as const, event: "up" as const, button, x: 1, y: 0.5 })),
  ];
  for (const input of ordered) {
    f.sender.submit(move(0.1)); f.sender.submit(move(0.9)); f.sender.submit(input);
  }
  expect(f.sent).toEqual(ordered.flatMap(input => [move(0.9), input]));
  expect(f.frames.size).toBe(0);
  f.tick();
  expect(f.sent).toHaveLength(ordered.length * 2);
});
it("discards a queued move on release and permits a fresh move after focus returns", () => {
  const f = senderFixture();
  f.sender.submit(move(0.1)); f.sender.clear(); f.tick();
  expect(f.sent).toEqual([]); expect(f.frames.size).toBe(0);
  f.sender.submit(move(0.9)); f.tick();
  expect(f.sent).toEqual([move(0.9)]);
});

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

it("recovers Ctrl before Space when its physical down was consumed, then releases it",()=>{
  const keys=new DesktopModifiers();
  const event={code:"Space",ctrlKey:true,shiftKey:false,altKey:false,metaKey:false};
  expect(keys.update(event,true)).toEqual([{kind:"key",code:"ControlLeft",down:true}]);
  expect(keys.update(event,false)).toEqual([]);
  expect(keys.update({...event,ctrlKey:false,code:"KeyA"},true)).toEqual([{kind:"key",code:"ControlLeft",down:false}]);
});
it("keeps left/right modifiers distinct without duplicating ordinary key events and resets on release",()=>{
  const keys=new DesktopModifiers();const event={code:"ControlRight",ctrlKey:true,shiftKey:false,altKey:false,metaKey:false};
  expect(keys.update(event,true)).toEqual([]);
  expect(keys.update({...event,code:"Space"},true)).toEqual([]);
  expect(keys.update({...event,ctrlKey:false},false)).toEqual([]);
  keys.update(event,true);keys.reset();
  expect(keys.update({...event,code:"Space"},true)).toEqual([{kind:"key",code:"ControlLeft",down:true}]);
});

it("releases a recovered left Ctrl when the physical right Ctrl release reports no modifier",()=>{
  const keys=new DesktopModifiers();const event={code:"Space",ctrlKey:true,shiftKey:false,altKey:false,metaKey:false};
  keys.update(event,true);
  expect(keys.update({...event,code:"ControlRight",ctrlKey:false},false)).toEqual([{kind:"key",code:"ControlLeft",down:false}]);
  expect(keys.update({...event,ctrlKey:false},true)).toEqual([]);
});
