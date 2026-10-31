import type {DesktopProviderConfig} from './DesktopProvider.js';
import type {DesktopStartParams} from '@sodashitsu/protocol';
import type {z} from 'zod';
/** One permission plan drives both compilation and the helper's configure message. */
export function desktopHelperRolePlan(cfg:DesktopProviderConfig,options:z.infer<typeof DesktopStartParams>['options']){
 const pooled=options.sharedDesktop===true&&!options.elevatedDesktop;
 const media=pooled&&!cfg.nativePlatform,audio=pooled;
 return {
  richClipboard:(options.sharedClipboard===true||options.richClipboard===true)&&cfg.allowClipboard===true,
  allowMicrophone:(media||options.microphone===true)&&cfg.allowMicrophone===true&&!!cfg.microphoneEndpoint,
  allowSystemAudio:(audio||options.nativeAudio===true)&&(cfg.allowSystemAudio??cfg.allowMedia)===true&&cfg.allowNativeVideo===true,
  nativeCodecs:(media||options.nativeCodecs===true)&&cfg.allowNativeVideo===true,
 };
}
export function desktopHelperRoleEnvironment(plan:ReturnType<typeof desktopHelperRolePlan>){
 return {SODA_DESKTOP_LOAD_AUDIO:plan.allowSystemAudio?'1':'0',SODA_DESKTOP_LOAD_MICROPHONE:plan.allowMicrophone?'1':'0',SODA_DESKTOP_LOAD_RICH_CLIPBOARD:plan.richClipboard?'1':'0',SODA_DESKTOP_LOAD_CODECS:plan.nativeCodecs?'1':'0'};
}
