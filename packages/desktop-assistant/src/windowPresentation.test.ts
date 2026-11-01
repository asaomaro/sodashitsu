import {expect,it,vi} from "vitest";
import type {BrowserWindow} from "electron";
import {presentWindow} from "./windowPresentation.js";
it("restores minimized windows before activation and repaint, and ignores closed windows",()=>{
 const calls:string[]=[],win={isDestroyed:()=>false,isMinimized:()=>true,restore:()=>calls.push("restore"),show:()=>calls.push("show"),focus:()=>calls.push("focus"),webContents:{invalidate:()=>calls.push("repaint")}};
 presentWindow(win as unknown as BrowserWindow);expect(calls).toEqual(["restore","show","focus","repaint"]);
 win.isDestroyed=()=>true;presentWindow(win as unknown as BrowserWindow);expect(calls).toHaveLength(4);
});
