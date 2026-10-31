import {expect,it} from 'vitest';
import {desktopHelperRolePlan,desktopHelperRoleEnvironment} from './DesktopHelperRolePlan.js';
const base={command:['unused'],allowInput:false,origins:()=>[]};
const all={...base,allowClipboard:true,allowNativeVideo:true,allowSystemAudio:true,allowMicrophone:true,microphoneEndpoint:'fixed-endpoint'};
const options={width:1280,fps:10,quality:65};
const off={richClipboard:false,allowMicrophone:false,allowSystemAudio:false,nativeCodecs:false};
it('loads no optional implementation for an image-only viewer even when local ceilings permit them',()=>{expect(desktopHelperRolePlan(all,options)).toEqual(off);expect(desktopHelperRoleEnvironment(off)).toEqual({SODA_DESKTOP_LOAD_AUDIO:'0',SODA_DESKTOP_LOAD_MICROPHONE:'0',SODA_DESKTOP_LOAD_RICH_CLIPBOARD:'0',SODA_DESKTOP_LOAD_CODECS:'0'});});
it.each([
 ['nativeAudio','allowSystemAudio'],['microphone','allowMicrophone'],['richClipboard','richClipboard'],['nativeCodecs','nativeCodecs'],
] as const)('selects only %s and requires its local ceiling', (option,field)=>{
 expect(desktopHelperRolePlan(all,{...options,[option]:true})).toEqual({...off,[field]:true});expect(desktopHelperRolePlan(base,{...options,[option]:true})).toEqual(off);
});
it('requires a microphone endpoint, preserves explicit audio deny over legacy media permit and requires native video for audio/codecs',()=>{
 const {microphoneEndpoint:_endpoint,...withoutEndpoint}=all;
 expect(desktopHelperRolePlan(withoutEndpoint,{...options,microphone:true})).toEqual(off);
 expect(desktopHelperRolePlan({...all,allowSystemAudio:false,allowMedia:true},{...options,nativeAudio:true})).toEqual(off);
 expect(desktopHelperRolePlan({...all,allowNativeVideo:false},{...options,nativeAudio:true,nativeCodecs:true})).toEqual(off);
});
it('prepares permitted shared-source media but never treats pooling as clipboard permission',()=>{
 expect(desktopHelperRolePlan(all,{...options,sharedDesktop:true})).toEqual({...off,allowMicrophone:true,allowSystemAudio:true,nativeCodecs:true});
 expect(desktopHelperRolePlan(all,{...options,sharedDesktop:true,sharedClipboard:true})).toEqual({...off,allowMicrophone:true,allowSystemAudio:true,nativeCodecs:true,richClipboard:true});
 expect(desktopHelperRolePlan(all,{...options,sharedDesktop:true,elevatedDesktop:true})).toEqual(off);
});
it.each(['linux-portal','macos-sck'] as const)('retains native platform audio policy without preparing Windows microphone/codecs for %s',nativePlatform=>{
 const plan=desktopHelperRolePlan({...all,nativePlatform},{...options,sharedDesktop:true});expect(plan).toEqual({...off,allowSystemAudio:nativePlatform==='linux-portal'});
});
