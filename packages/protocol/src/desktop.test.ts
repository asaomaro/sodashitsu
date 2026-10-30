import { expect, it } from "vitest";
import {
  RemoteDesktopInput,
  isExtendedDesktopInput,
  DesktopOptions,
  DesktopStartParams,
  DesktopReady,
  RemoteDesktopViewerMessage,
  decodeDesktopFrame,
  encodeDesktopFrame,
} from "./desktop.js";

it("requires the human-only ceiling for a lock cover and only accepts a fixed dismissal command", () => {
  const ready={type:"ready",title:"lock",allowInput:true,width:640,height:360,backend:"windows-gdi",lockScreenCover:true};
  expect(DesktopReady.safeParse(ready).success).toBe(false);
  expect(DesktopReady.safeParse({...ready,secureDesktop:true}).success).toBe(true);
  expect(RemoteDesktopViewerMessage.safeParse({type:"dismiss_lock_screen"}).success).toBe(true);
  expect(RemoteDesktopViewerMessage.safeParse({type:"dismiss_lock_screen",text:"password"}).success).toBe(false);
});

const image = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
]);
const info = {
  seq: 1,
  width: 1,
  height: 1,
  format: "image/png" as const,
  captureMs: 1,
  encodeMs: 2,
};
it("checks encoded dimensions before decoding and bounds frame headers/images", () => {
  expect(decodeDesktopFrame(encodeDesktopFrame(info, image)).info).toEqual(info);
  expect(() => decodeDesktopFrame(encodeDesktopFrame({ ...info, width: 2 }, image))).toThrow(
    "dimensions",
  );
  expect(() => decodeDesktopFrame(Uint8Array.from([255, 255, 0]))).toThrow();
  expect(() => encodeDesktopFrame({ ...info, width: 4096, height: 2400 }, image)).toThrow();
  expect(() => encodeDesktopFrame(info, new Uint8Array(2 * 1024 * 1024 + 1))).toThrow();
});
it("admits typed mouse/key/text only and never executable or arbitrary native messages", () => {
  expect(RemoteDesktopInput.safeParse({ kind: "key", code: "KeyA", down: true }).success).toBe(true);
  expect(RemoteDesktopInput.safeParse({ kind: "text", text: "日本語😀" }).success).toBe(true);
  for (const value of [
    { kind: "key", code: "cmd.exe", down: true },
    { kind: "pointer", x: Infinity, y: 0, button: 0, event: "move" },
    { kind: "text", text: "x", command: "bad" },
  ])
    expect(RemoteDesktopInput.safeParse(value).success).toBe(false);
  expect(
    DesktopStartParams.safeParse({
      url: "https://test",
      ticket: "a".repeat(43),
      options: {},
      command: ["bad"],
    }).success,
  ).toBe(false);
});
it("bounds multiple patches and requires a complete ordered base for deltas", async () => {
  const { DesktopFrameChain } = await import("./desktop.js");
  const chain = new DesktopFrameChain(),
    base = { ...info, width: 4, height: 4, contentId: "a".repeat(64) };
  chain.accept(base);
  const patch = {
    ...base,
    seq: 2,
    contentId: "b".repeat(64),
    update: {
      kind: "patch" as const,
      baseSeq: 1,
      patches: [{ x: 1, y: 1, width: 1, height: 1, offset: 0, length: image.length }],
    },
  };
  expect(decodeDesktopFrame(encodeDesktopFrame(patch, image)).info).toEqual(patch);
  chain.accept(patch);
  const idle = {
    ...base,
    seq: 3,
    contentId: patch.contentId,
    update: { kind: "unchanged" as const, baseSeq: 2 },
  };
  expect(decodeDesktopFrame(encodeDesktopFrame(idle, new Uint8Array())).image.length).toBe(0);
  chain.accept(idle);
  for (const bad of [
    { ...idle, seq: 4, contentId: base.contentId },
    { ...idle, seq: 4, update: { ...idle.update, baseSeq: 1 } },
    { ...idle, seq: 4, width: 5 },
  ])
    expect(() => chain.accept(bad)).toThrow();
  expect(() => new DesktopFrameChain().accept(patch)).toThrow(/base/);
  for (const p of [
    { ...patch.update.patches[0]!, x: 4 },
    { ...patch.update.patches[0]!, offset: 1 },
    { ...patch.update.patches[0]!, width: 2 },
  ])
    expect(() =>
      decodeDesktopFrame(
        encodeDesktopFrame({ ...patch, update: { ...patch.update, patches: [p] } }, image),
      ),
    ).toThrow();
  expect(() =>
    decodeDesktopFrame(
      encodeDesktopFrame(
        {
          ...patch,
          update: {
            ...patch.update,
            patches: [
              patch.update.patches[0]!,
              { ...patch.update.patches[0]!, offset: image.length },
            ],
          },
        },
        new Uint8Array([...image, ...image]),
      ),
    ),
  ).toThrow(/overlapping/);
  expect(() => decodeDesktopFrame(encodeDesktopFrame(idle, image))).toThrow(/unchanged/);
});

it("bounds reduced color and cursor settings while accepting legacy requests", () => {
  expect(DesktopOptions.parse({}).image).toBeUndefined();
  for (const colorMode of ["full", "rgb565", "rgb332", "gray16"])
    expect(DesktopOptions.parse({ image: { colorMode, showCursor: false } }).image?.colorMode).toBe(
      colorMode,
    );
  expect(
    DesktopOptions.safeParse({ image: { colorMode: "rgb111", showCursor: true } }).success,
  ).toBe(false);
  expect(
    DesktopOptions.safeParse({ image: { colorMode: "full", showCursor: "false" } }).success,
  ).toBe(false);
});

it("bounds physical display resizing separately from capture width", () => {
  expect(DesktopOptions.parse({ display: { width: 2560, height: 1440 } }).display).toEqual({
    width: 2560,
    height: 1440,
  });
  for (const display of [
    { width: 4097, height: 600 },
    { width: 640, height: 199 },
    { width: 4096, height: 2400 },
    { width: 800, height: 600, refreshRate: 144 },
  ])
    expect(() => DesktopOptions.parse({ display })).toThrow();
});

it("accepts only named IME ON/OFF keys and optional helper support", () => {
  for (const code of ["ImeOn", "ImeOff"])
    for (const down of [true, false]) expect(RemoteDesktopInput.safeParse({kind:"key",code,down}).success).toBe(true);
  expect(RemoteDesktopInput.safeParse({kind:"key",code:"VK_IME_ON",down:true}).success).toBe(false);
  const ready={type:"ready",title:"test",allowInput:true,width:640,height:360,backend:"synthetic"};
  expect(DesktopReady.parse(ready)).not.toHaveProperty("imeKeys");
  expect(DesktopReady.parse({...ready,imeKeys:true}).imeKeys).toBe(true);
});

it("bounds five-button and extended-key input while identifying legacy-safe input",()=>{
  for(const button of [0,1,2,3,4]){
    const input=RemoteDesktopInput.parse({kind:"pointer",x:0.5,y:0.5,event:"down",button});
    expect(isExtendedDesktopInput(input)).toBe(button>2);
  }
  for(const code of ["F24","NumpadEnter","ContextMenu","Convert","IntlRo","MediaPlayPause"])
    expect(isExtendedDesktopInput(RemoteDesktopInput.parse({kind:"key",code,down:true}))).toBe(true);
  expect(isExtendedDesktopInput(RemoteDesktopInput.parse({kind:"key",code:"Escape",down:true}))).toBe(false);
  expect(RemoteDesktopInput.safeParse({kind:"pointer",x:0,y:0,event:"up",button:5}).success).toBe(false);
  expect(RemoteDesktopInput.safeParse({kind:"key",code:"F25",down:true}).success).toBe(false);
});

it("bounds regional proof area, geometry, count, identity and digest",async()=>{
 const {DesktopRegionRect,DesktopRegionSpec,DesktopFrameInfo}=await import("./desktop.js");
 const region={id:crypto.randomUUID(),x:0,y:0,width:1,height:1},proof={...region,digest:"a".repeat(64)};
 expect(DesktopRegionSpec.safeParse(region).success).toBe(true);
 expect(DesktopRegionRect.safeParse({x:0,y:0,width:2048,height:1024}).success).toBe(false);
 expect(DesktopRegionSpec.safeParse({...region,id:"not-uuid"}).success).toBe(false);
 expect(DesktopFrameInfo.safeParse({...info,regions:[proof]}).success).toBe(true);
 for(const regions of [[proof,proof],[{...proof,width:2}],[{...proof,digest:"broken"}],Array.from({length:9},()=>({...proof,id:crypto.randomUUID()}))])expect(DesktopFrameInfo.safeParse({...info,regions}).success).toBe(false);
});
