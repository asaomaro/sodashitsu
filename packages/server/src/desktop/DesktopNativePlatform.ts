import {existsSync,constants,accessSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import type {DesktopNativePlatform} from "@sodashitsu/protocol";
export function nativePlatformFor(os=process.platform,env=process.env):DesktopNativePlatform|undefined {
 if(os==="linux"&&!env.WSL_DISTRO_NAME)return "linux-portal";
 if(os==="darwin")return "macos-sck";
}
export function nativeDesktopCommand(os=process.platform,env=process.env,probe:typeof spawnSync=spawnSync,verify=true):string[]|undefined {
 const platform=nativePlatformFor(os,env);if(!platform)return;
 // Portal cadence/real compositor compatibility is not yet verified. Local
 // administrator opt-in only; normal Linux installations stay unchanged.
 if(platform==="linux-portal"&&env.SODA_DESKTOP_LINUX_PORTAL!=="1")return;
 if(platform==="macos-sck"&&env.SODA_DESKTOP_MACOS_SCK!=="1")return;
 const path=fileURLToPath(new URL(platform==="linux-portal"?"../../../../scripts/remote-desktop/linux-portal-helper.py":"../../../../scripts/remote-desktop/macos-desktop-helper",import.meta.url));
 if(!existsSync(path))return;
 const command=platform==="linux-portal"?["/usr/bin/python3","-I",path]:[path];
 if(platform==="macos-sck")try{accessSync(path,constants.X_OK);}catch{return;}
 if(!verify)return command;
 const result=probe(command[0]!,[...command.slice(1),"--probe"],{encoding:"utf8",timeout:3000,maxBuffer:8192,windowsHide:true});
 if(result.status!==0)return;
 try{const value=JSON.parse(String(result.stdout));if(value.backend===platform&&value.dependencies===true)return command;}catch{}
}
export function nativeDesktopSetup(platform:DesktopNativePlatform):string {
 return platform==="linux-portal"?"Linux実験版（SODA_DESKTOP_LINUX_PORTAL=1）: systemd-logind・静止時も継続送信するPortal・PyGObject・GStreamer/PipeWire・ScreenCast Portal v6が必要です。共有開始時に接続先OSでモニターを選択してください。操作はRemoteDesktop Portalの追加許可が必要です。システム音声は別途許可し、ローカルPulseAudio/PipeWireの出力monitorとGStreamer音声プラグインを使用します。":"macOS 14以降の実験版（SODA_DESKTOP_MACOS_SCK=1）: 補助プログラムをローカルでビルドし、画面収録を許可してください。操作にはアクセシビリティの許可も必要です。動画はH.264へ圧縮します。システム音声には別途送信許可が必要です。マイク・保護画面は未対応です。";
}
