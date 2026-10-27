import { mount } from "@vue/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import RemoteDesktopWindow from "./RemoteDesktopWindow.vue";
import { loadSettings, saveSettings, presets, loadViewerPreferences, normalizeViewerPreferences, saveViewerPreferences } from "../desktop/settings.js";
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();});
it("closing an unedited viewer does not overwrite newer preferences saved by another viewer",()=>{
 vi.stubGlobal("WebSocket",class {static OPEN=1;readyState=0;close(){this.readyState=3;}send(){} });
 saveSettings("remote",presets.low);saveViewerPreferences("remote",normalizeViewerPreferences({bitrate:1000}));
 const viewer=mount(RemoteDesktopWindow,{props:{machineId:"remote",label:"Generated B",embedded:true}});
 // The other viewer has since saved a newer preference revision.
 saveSettings("remote",presets.quality);const newer=normalizeViewerPreferences({transport:"native",bitrate:6789,codec:"hevc",fps:30,fit:false});saveViewerPreferences("remote",newer);
 viewer.unmount();expect(loadSettings("remote")).toEqual(presets.quality);expect(loadViewerPreferences("remote")).toEqual(newer);
});
