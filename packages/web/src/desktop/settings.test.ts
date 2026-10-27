import { beforeEach, expect, it } from "vitest";
import { loadViewerPreferences, normalizeViewerPreferences, saveViewerPreferences, loadSettings, normalizeSettings, presets, saveSettings } from "./settings.js";
beforeEach(() => localStorage.clear());
it("keeps preferences per machine and accepts no permissions or credentials", () => {
  expect(loadSettings("a")).toEqual(presets.balanced);
  expect(saveSettings("a", presets.low)).toBe(true);
  expect(loadSettings("a")).toEqual(presets.low);
  expect(loadSettings("b")).toEqual(presets.balanced);
  expect(() => normalizeSettings({ ...presets.low, ticket: "secret", allowInput: true })).toThrow();
  localStorage.setItem(
    "soda:desktop:connection:v1:a",
    JSON.stringify({ ...presets.low, fps: 100 }),
  );
  expect(loadSettings("a")).toEqual(presets.balanced);
  localStorage.setItem("soda:desktop:connection:v1:a", "{");
  expect(loadSettings("a")).toEqual(presets.balanced);
});
it("rejects invalid image modes and connection bounds before reconnecting", () => {
  for (const value of [
    { fps: 0 },
    { width: 8192 },
    { quality: 100 },
    { image: { colorMode: "shell", showCursor: true } },
    { image: { colorMode: "full", showCursor: "yes" } },
  ])
    expect(() => normalizeSettings(value)).toThrow();
});

it("remembers video quality and scale per machine without storing capture or permission state",()=>{
 const defaults={transport:"auto",bitrate:2500,codec:"h264",fps:60,udp:true,fit:true};expect(loadViewerPreferences("a")).toEqual(defaults);
 const preferences=normalizeViewerPreferences({transport:"native",bitrate:6789,codec:"hevc",fps:30,udp:false,fit:false});expect(saveViewerPreferences("a",preferences)).toBe(true);expect(loadViewerPreferences("a")).toEqual(preferences);expect(loadViewerPreferences("b")).toEqual(defaults);
 for(const bad of [{fps:31},{bitrate:0},{codec:"shell"},{audio:true},{microphone:true},{control:true},{ticket:"secret"}])expect(()=>normalizeViewerPreferences(bad)).toThrow();
 for(const bad of [{allowInput:true},{elevatedDesktop:true},{sharedDesktop:true},{nativeAudio:true}])expect(()=>normalizeSettings({...presets.low,...bad})).toThrow();
 localStorage.setItem("soda:desktop:viewer:v1:a",JSON.stringify({fps:31}));expect(loadViewerPreferences("a")).toEqual(defaults);
});
