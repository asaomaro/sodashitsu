import {expect,it} from 'vitest';
import {DesktopOptions,DesktopReady,DesktopPermissions} from './desktop.js';
import {DesktopProtectedFailure,desktopProtectedFailureMessage} from './desktopProtected.js';
const base={type:'ready',title:'generated',allowInput:true,width:640,height:480,backend:'synthetic'};
it('keeps protected sharing opt-in and its local ceiling independent',()=>{
 expect(DesktopOptions.parse({})).not.toHaveProperty('elevatedDesktop');expect(DesktopOptions.parse({elevatedDesktop:true})).toMatchObject({elevatedDesktop:true});expect(DesktopOptions.safeParse({elevatedDesktop:false}).success).toBe(false);
 const p=DesktopPermissions.parse({enabled:true,allowInput:false,allowClipboard:false,allowDisplayResize:false,allowElevated:true});expect(p).not.toHaveProperty('allowUnlock');expect(p).not.toHaveProperty('allowVirtualDisplay');
});
it.each(['elevated-default','elevated-uac'])('requires secure human-only metadata for %s',mode=>{
 const ready={...base,secureDesktop:true,protectedDesktop:mode};expect(DesktopReady.safeParse(ready).success).toBe(true);
 for(const extra of [{secureDesktop:false},{lockScreenCover:true},{virtualDisplay:true},{files:true},{nativeVideo:true},{nativeAudio:true},{nativeDatagrams:true},{richClipboard:true},{allowMedia:true},{allowClipboard:true},{display:{modes:[{width:640,height:480}]}},{protectedDesktop:'WinSta0\\Default'},{nonce:'must-stay-private'}])expect(DesktopReady.safeParse({...ready,...extra}).success).toBe(false);
});
it('accepts fixed failure codes without forwarding native strings or unknown fields',()=>{
 expect(DesktopProtectedFailure.safeParse({type:'protected_desktop_failure',code:'source_changed'}).success).toBe(true);
 expect(DesktopProtectedFailure.safeParse({type:'protected_desktop_failure',code:'source_changed',message:'private native path'}).success).toBe(false);
 expect(DesktopProtectedFailure.safeParse({type:'protected_desktop_failure',code:'native exception'}).success).toBe(false);
 expect(desktopProtectedFailureMessage('source_changed')).toContain('接続し直し');
});
it('keeps file authority out of privileged ready and parses a bounded Node-side proof',async()=>{
 const {DesktopProtectedFilesReady}=await import('./desktopProtected.js');expect(DesktopProtectedFilesReady.parse({type:'protected_files_ready',files:true,folders:true})).toMatchObject({files:true});
 expect(DesktopProtectedFilesReady.safeParse({type:'protected_files_ready',files:true,fileRoot:'/private'}).success).toBe(false);expect(DesktopReady.safeParse({...base,secureDesktop:true,protectedDesktop:'elevated-default',files:true}).success).toBe(false);
});
it.each(['elevated-default','elevated-uac'] as const)('requires a separate protected native video proof for %s',protectedDesktop=>{
 const ready={...base,secureDesktop:true,protectedDesktop,protectedVideo:true,nativeVideo:true,nativeVideoWindow:3};expect(DesktopReady.safeParse(ready).success).toBe(true);
 for(const extra of [{protectedDesktop:undefined},{nativeVideo:undefined},{secureDesktop:false},{nativeAudio:true},{nativeDatagrams:true},{nativeCodecs:true},{nativeAdaptive:true},{nativeCadence:true},{microphone:true},{allowMedia:true},{allowClipboard:true}])expect(DesktopReady.safeParse({...ready,...extra}).success).toBe(false);
});

it('requires both protected video and native audio for ordinary-user audio overlay',()=>{const ready={...base,secureDesktop:true,protectedDesktop:'elevated-uac',protectedVideo:true,nativeVideo:true,protectedAudio:true,nativeAudio:true};expect(DesktopReady.safeParse(ready).success).toBe(true);for(const key of ['protectedVideo','nativeVideo','nativeAudio','protectedDesktop']){const bad:any={...ready};delete bad[key];expect(DesktopReady.safeParse(bad).success).toBe(false);}});

it('requires both shared and protected-video proof for pooled protected video',()=>{const ready={...base,secureDesktop:true,protectedDesktop:'elevated-uac',sharedProtected:true,protectedVideo:true,nativeVideo:true,sharedProtectedVideo:true};expect(DesktopReady.safeParse(ready).success).toBe(true);for(const key of ['sharedProtected','protectedVideo','protectedDesktop']){const bad:any={...ready};delete bad[key];expect(DesktopReady.safeParse(bad).success).toBe(false);}});
