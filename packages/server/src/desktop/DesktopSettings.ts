import {nativePlatformFor,nativeDesktopCommand,nativeDesktopSetup} from "./DesktopNativePlatform.js";
import type {DesktopNativePlatform} from "@sodashitsu/protocol";
import {DesktopFiles} from "./DesktopFiles.js";
import { existsSync } from "node:fs";
import {createHash} from "node:crypto";
import { lstat,readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DesktopPermissions, RpcError, type DesktopSettingsResult } from "@sodashitsu/protocol";
import { writeFileAtomic } from "../persist/atomicFile.js";
import type { DesktopProvider, DesktopProviderConfig } from "./DesktopProvider.js";

const disabled: DesktopPermissions = {
  enabled: false,
  allowInput: false,
  allowClipboard: false,
  allowDisplayResize: false,
};

/** Only bundled code or an administrator's legacy environment command can execute. */
export function bundledDesktopCommand(
  os = process.platform,
  env = process.env,
): string[] | undefined {
  if(nativePlatformFor(os,env))return nativeDesktopCommand(os,env);
  const script = fileURLToPath(
    new URL("../../../../scripts/remote-desktop/windows-helper.ps1", import.meta.url),
  );
  const required = ["windows-helper.ps1","WindowsDesktopHost.cs","WindowsDesktopUnlock.cs",
    "WindowsVirtualDisplay.cs","WindowsVirtualDisplayNative.cs","WindowsVirtualDisplayChannel.cs",
    "WindowsProtectedEpoch.cs","WindowsProtectedScope.cs","WindowsProtectedScopeNative.cs","WindowsProtectedHandshake.cs","WindowsProtectedWorker.cs"];
  if (!required.every(name=>existsSync(fileURLToPath(new URL(`../../../../scripts/remote-desktop/${name}`,import.meta.url))))) return;
  let path = script;
  if (os !== "win32") {
    if (!env.WSL_DISTRO_NAME) return;
    const result = spawnSync("wslpath", ["-w", script], { encoding: "utf8", timeout: 3000 });
    if (result.status !== 0 || !result.stdout.trim()) return;
    path = result.stdout.trim();
  }
  return [
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-STA",
    "-File",
    path,
    "-MonitorIndex",
    "0",
  ];
}

interface Options {
  file: string;
  provider: DesktopProvider;
  origins(): string[];
  legacy?: DesktopProviderConfig | undefined;
  startup?: DesktopPermissions;
  nativePlatform?:DesktopNativePlatform;
  /** Synthetic helper injection for tests; never exposed through RPC. */
  command?: string[] | undefined;
}
export class DesktopSettings {
  private permissions: DesktopPermissions;
  private readonly platform:DesktopNativePlatform|undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    private readonly options: Options,
    private readonly command: string[] | undefined,
    permissions: DesktopPermissions,
  ) {
    this.platform=options.nativePlatform??options.legacy?.nativePlatform??(!options.legacy&&!options.command?nativePlatformFor():undefined);
    if(this.nativePlatform)permissions={...permissions,allowDisplayResize:false,allowUnlock:false,allowMonitors:false,allowVirtualDisplay:false,allowElevated:false,allowSystemAudio:false,allowMicrophone:false};
    this.permissions = permissions;
    this.apply();
  }
  static async open(options: Options): Promise<DesktopSettings> {
    let permissions: DesktopPermissions = options.legacy
      ? {
          enabled: true,
          allowInput: options.legacy.allowInput,
          ...(options.legacy.allowSystemAudio??options.legacy.allowMedia?{allowSystemAudio:true}:{}),
          allowClipboard: options.legacy.allowClipboard === true,
          allowDisplayResize: options.legacy.allowDisplayResize === true,
          ...(options.legacy.allowMonitors?{allowMonitors:true}:{}),
          ...(options.legacy.allowVirtualDisplay?{allowVirtualDisplay:true}:{}),
          ...(options.legacy.allowElevated?{allowElevated:true}:{}),
          ...(options.legacy.allowUnlock ? { allowUnlock: true } : {}),
        }
      : { ...disabled };
    try {
      permissions = DesktopPermissions.parse(JSON.parse(await readFile(options.file, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") permissions = { ...disabled };
    }
    permissions = options.startup ?? permissions;
    const command = options.legacy?.command ?? options.command ?? bundledDesktopCommand();
    if (options.startup?.enabled && !command)
      throw new Error(
        "デスクトップ共有の補助プログラムがありません。接続先OS向けの導入手順を確認してください。",
      );
    return new DesktopSettings(options, command, permissions);
  }
  private get nativePlatform(){return this.platform;}
  get(canConfigure: boolean): DesktopSettingsResult {
    return {...(this.nativePlatform?{nativePlatform:this.nativePlatform,setupMessage:nativeDesktopSetup(this.nativePlatform)}:{}), permissions: { ...this.permissions }, supported: !!this.command, canConfigure };
  }
  async transferScope():Promise<string>{
    let file:unknown=null;try{const st=await lstat(this.options.file,{bigint:true});file=[st.dev.toString(),st.ino.toString(),st.mtimeNs.toString(),st.ctimeNs.toString(),await readFile(this.options.file,"utf8")];}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    return createHash("sha256").update(JSON.stringify({permissions:this.permissions,command:this.command,file})).digest("hex");
  }
  set(raw: DesktopPermissions): Promise<DesktopSettingsResult> {
    const permissions = DesktopPermissions.parse(raw);
    const work = this.queue.then(async () => {
      if(this.nativePlatform&&(permissions.allowDisplayResize||permissions.allowUnlock||permissions.allowMonitors||permissions.allowVirtualDisplay||permissions.allowElevated||permissions.allowSystemAudio||permissions.allowMicrophone))throw new RpcError("invalid_params","このnative backendでは画面共有・対応する入力・クリップボードを許可できます。");
      if (permissions.enabled && !this.command)
        throw new RpcError(
          "invalid_params",
          "この環境では画面共有の補助プログラムを使用できません。接続先OS向けの導入手順を確認してください。",
        );
      if(permissions.allowElevated&&this.options.legacy)throw new RpcError("invalid_params","管理者画面には同梱のWindows補助プログラムを使用してください。");
      if (permissions.allowVirtualDisplay && this.options.legacy)throw new RpcError("invalid_params","仮想画面には同梱のWindows補助プログラムを使用してください。");
      if (permissions.allowUnlock && this.options.legacy)
        throw new RpcError("invalid_params", "ロック解除には同梱のWindows補助プログラムを使用してください。");
      if(permissions.allowMicrophone&&!permissions.microphoneEndpoint?.trim())throw new RpcError("invalid_params","マイク転送先の仮想オーディオ再生デバイスIDを指定してください。");
      if(permissions.fileRoot?.trim()){const probe=await DesktopFiles.open(permissions.fileRoot.trim(),()=>false);await probe.close();}
      await this.options.provider.invalidateSavedTransfers();
      try{await writeFileAtomic(this.options.file, JSON.stringify(permissions) + "\n");
        this.permissions = permissions;
        this.apply();
      }finally{let scope:string;try{scope=await this.transferScope();}catch(error){this.options.provider.failSavedTransferPolicy();throw error;}await this.options.provider.bindSavedTransfers(scope);}
      return this.get(true);
    });
    this.queue = work.catch(() => undefined);
    return work;
  }
  private apply() {
    const p = this.permissions,
      legacy = this.options.legacy;
    let config: DesktopProviderConfig | undefined;
    if (p.enabled && this.command) {
      const command = [...this.command];
      // Custom commands retain their launch syntax; saved local permissions supersede env defaults.
      if (!legacy && !this.nativePlatform) {
        if(p.allowMonitors)command.push("-AllowMonitors");
        if(p.allowVirtualDisplay)command.push("-AllowVirtualDisplay");
        if(p.allowElevated)command.push("-AllowElevated");
        if (p.allowInput) command.push("-AllowInput");
        if (p.allowClipboard) command.push("-AllowClipboard");
        if (p.allowDisplayResize) command.push("-AllowDisplayResize");
        if (p.allowUnlock) command.push("-AllowUnlock");
      }
      if(!legacy&&this.nativePlatform&&p.allowClipboard)command.push("--allow-clipboard");
      if(!legacy&&this.nativePlatform==="macos-sck"&&p.allowInput)command.push("--allow-input");
      config = {
        ...legacy,
        command,
        ...(this.nativePlatform?{nativePlatform:this.nativePlatform}:{}),
        allowNativeVideo: !this.nativePlatform&&(!legacy || legacy.allowMedia===true),
        ...(p.fileRoot?.trim()?{fileRoot:p.fileRoot.trim()}:{}),
        allowMonitors:p.allowMonitors===true,
        allowVirtualDisplay:p.allowVirtualDisplay===true,
        allowElevated:p.allowElevated===true,
        allowInput: p.allowInput,
        allowSystemAudio: p.allowSystemAudio === true,
        allowMicrophone: p.allowMicrophone === true,
        ...(p.microphoneEndpoint?.trim()?{microphoneEndpoint:p.microphoneEndpoint.trim()}:{}),
        allowClipboard: p.allowClipboard,
        allowDisplayResize: p.allowDisplayResize,
        allowUnlock: p.allowUnlock === true,
        ...((p.allowUnlock||p.allowVirtualDisplay||p.allowElevated) && !legacy ? { unlockLeaseCommand: [...this.command, "-UnlockLease",...(p.allowVirtualDisplay?["-AllowVirtualDisplay"]:[]),...(p.allowUnlock&&(p.allowVirtualDisplay||p.allowElevated)?["-AllowUnlock"]:[]),...(p.allowElevated?["-AllowElevated"]:[])] } : {}),
        origins: legacy?.origins ?? this.options.origins,
      };
    }
    if(config&&!p.fileRoot?.trim())delete config.fileRoot;
    this.options.provider.configure(config);
  }
}
