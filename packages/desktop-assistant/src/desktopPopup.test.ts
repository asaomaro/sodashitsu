import {expect,it} from "vitest";
import {desktopPopupNavigation} from "./security.js";
const origin="https://soda.example",launch={machineId:"remote-123",label:"接続先"};
const url=(value:unknown=launch)=>`${origin}/desktop-view#${encodeURIComponent(JSON.stringify(value))}`;
it("accepts same-server desktop and monitor windows",()=>{
 expect(desktopPopupNavigation(url(),origin)).toBe(true);
 expect(desktopPopupNavigation(url({...launch,monitor:"\\\\.\\DISPLAY1",settings:{},cursor:false,clipboard:false,deltas:false,independent:true}),origin)).toBe(true);
});
it.each([
 url().replace(origin,"https://soda.example.evil"),url().replace(origin,"http://soda.example"),
 url().replace(origin,"https://user:password@soda.example"),url().replace("/desktop-view","/settings"),
 url().replace("/desktop-view#","/desktop-view?assistantView=reply#"),`${origin}/desktop-view`,
 `${origin}/desktop-view#%`,`${origin}/desktop-view#${"a".repeat(8192)}`,url([]),url(null),
 url({...launch,machineId:"../local"}),url({...launch,label:"bad\0label"}),"file:///desktop-view#anything",
])("denies unsupported popup %s",value=>expect(desktopPopupNavigation(value,origin)).toBe(false));
