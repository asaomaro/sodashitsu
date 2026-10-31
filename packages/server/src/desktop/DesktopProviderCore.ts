import {DesktopIceServers} from '@sodashitsu/protocol';
import type {DesktopStartParams,DesktopNativePlatform} from '@sodashitsu/protocol';
import type {z} from 'zod';
export interface DesktopProviderConfig {
  nativePlatform?:DesktopNativePlatform;
  command: string[];
  allowInput: boolean;
  allowMonitors?:boolean;
  allowVirtualDisplay?:boolean;
  allowElevated?:boolean;
  allowProtectedFiles?:boolean;
  fileRoot?:string;
  allowClipboard?: boolean;
  allowMedia?: boolean;
  allowSystemAudio?: boolean;
  allowMicrophone?: boolean;
  microphoneEndpoint?: string;
  allowNativeVideo?: boolean;
  allowDisplayResize?: boolean;
  allowUnlock?: boolean;
  unlockLeaseCommand?: string[];
  iceServers?: z.infer<typeof DesktopIceServers>;
  origins(): string[];
}
export function desktopProviderCapabilities(config:DesktopProviderConfig|undefined,endpointOnly=false,durable=false) {
    return {
      ...(endpointOnly?{endpointRequired:true}:{}),
      ...(config?.nativePlatform?{nativePlatform:config.nativePlatform}:{}),
      sharedMicrophone:config?.allowMicrophone===true&&!!config.microphoneEndpoint,
      sharedProtected:!config?.nativePlatform&&config?.allowElevated===true,
      protectedVideo:!config?.nativePlatform&&config?.allowElevated===true&&config?.allowNativeVideo===true,
      protectedFiles:!config?.nativePlatform&&config?.allowElevated===true&&config?.allowProtectedFiles===true&&!!config?.fileRoot,
      sharedDesktop: true,
      sharedVirtual:!config?.nativePlatform&&config?.allowVirtualDisplay===true,
      sharedDeltas:!config?.nativePlatform,
      sharedMonitors:!config?.nativePlatform&&config?.allowMonitors===true,
      independentMonitors:!config?.nativePlatform&&config?.allowMonitors===true,
      sharedCursor:!config?.nativePlatform,
      sharedClipboard:config?.allowClipboard===true,
      sharedFiles: !!config?.fileRoot,
      sharedResolution:!config?.nativePlatform&&config?.allowNativeVideo===true,
      sharedRate:!config?.nativePlatform&&config?.allowNativeVideo===true,
      sharedAudio:config?.allowNativeVideo===true,
      sharedNative: config?.allowNativeVideo === true,
      sharedDatagrams: config?.allowNativeVideo === true,
      available: !!config,
      allowInput: config?.allowInput === true,
      deltas: !config?.nativePlatform,
      imageSettings: !config?.nativePlatform,
      imeKeys: !config?.nativePlatform,
      extendedInput: true,
      monitors:config?.allowMonitors===true,
      virtualDisplay:config?.allowVirtualDisplay===true&&(!config.nativePlatform||config.nativePlatform==="linux-portal"),
      elevatedDesktop:config?.allowElevated===true,
      files:!!config?.fileRoot,
      fileCheckpoints:!!config?.fileRoot,
      durableFileCheckpoints:!!config?.fileRoot&&durable,
      durableFolderCheckpoints:!!config?.fileRoot&&durable,
      folderCheckpoints:!!config?.fileRoot,
      folders:!!config?.fileRoot,
      richClipboard:config?.allowClipboard===true,
      imageLane: true,
      videoLane: true,
      microphone:config?.allowMicrophone===true&&!!config.microphoneEndpoint,
      microphoneOpus:config?.allowMicrophone===true&&!!config.microphoneEndpoint,
      nativeVideo: !config?.nativePlatform||config?.allowNativeVideo===true,nativeDatagrams:!config?.nativePlatform||config?.allowNativeVideo===true,nativeAudio:true,
      nativeInputFreshness: !config?.nativePlatform,
      nativeCodecs: !config?.nativePlatform||config?.allowNativeVideo===true,
      ...(!config?.nativePlatform||config?.allowNativeVideo===true?{nativeAdaptive:true as const}:{}),
      ...(!config?.nativePlatform||config?.allowNativeVideo===true?{nativeCadence:true as const}:{}),
      nativeVideoWindow: 3 as const,
      nativeMaxFps: 60 as const,
      cursor: !config?.nativePlatform,
      features: true,
      displayResize: config?.allowDisplayResize === true&&(!config.nativePlatform||config.nativePlatform==="macos-sck"),
    };
  }
export function desktopConfigFromEnv(
  env: NodeJS.ProcessEnv,
  delegatedOrigins: () => string[],
): DesktopProviderConfig | undefined {
  if (!env.SODA_DESKTOP_COMMAND) return;
  try {
    const command: unknown = JSON.parse(env.SODA_DESKTOP_COMMAND);
    if (
      !Array.isArray(command) ||
      command.length === 0 ||
      command.length > 32 ||
      command.some((v) => typeof v !== "string" || !v || v.includes("\0"))
    )
      return;
    const nativePlatform=env.SODA_DESKTOP_NATIVE_PLATFORM;
    if(nativePlatform!==undefined&&nativePlatform!=="linux-portal"&&nativePlatform!=="macos-sck")return;
    return {
      ...(nativePlatform?{nativePlatform}:{}),
      command: command as string[],
      allowInput: env.SODA_DESKTOP_ALLOW_INPUT === "1",
      allowMonitors:env.SODA_DESKTOP_ALLOW_MONITORS==="1",
      allowVirtualDisplay:env.SODA_DESKTOP_ALLOW_VIRTUAL_DISPLAY==="1",
      allowElevated:env.SODA_DESKTOP_ALLOW_ELEVATED==="1",
      allowClipboard: env.SODA_DESKTOP_ALLOW_CLIPBOARD === "1",
      allowMedia: env.SODA_DESKTOP_ALLOW_MEDIA === "1",
      allowDisplayResize: env.SODA_DESKTOP_ALLOW_DISPLAY_RESIZE === "1",
      allowUnlock: env.SODA_DESKTOP_ALLOW_UNLOCK === "1",
      iceServers: DesktopIceServers.parse(
        env.SODA_DESKTOP_ICE_SERVERS ? JSON.parse(env.SODA_DESKTOP_ICE_SERVERS) : [],
      ),
      origins: desktopOriginsFromEnv(env, delegatedOrigins),
    };
  } catch {
    return;
  }
}

/** Destination policy is independent of whether a custom helper command is configured. */
export function desktopOriginsFromEnv(env: NodeJS.ProcessEnv, delegatedOrigins: () => string[]): () => string[] {
  const allowed = (env.SODA_DESKTOP_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  return () => [...allowed, ...delegatedOrigins()];
}

export interface DesktopProviderEndpointScope {
 active():boolean;
 start(owner:string,params:z.infer<typeof DesktopStartParams>):Promise<{started:true}>;
 release(owner:string):void;
 close():void;
}
