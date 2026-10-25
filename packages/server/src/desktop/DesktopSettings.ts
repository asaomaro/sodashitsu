import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
  const script = fileURLToPath(
    new URL("../../../../scripts/remote-desktop/windows-helper.ps1", import.meta.url),
  );
  const source = fileURLToPath(
    new URL("../../../../scripts/remote-desktop/WindowsDesktopHost.cs", import.meta.url),
  );
  if (!existsSync(script) || !existsSync(source)) return;
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
  /** Synthetic helper injection for tests; never exposed through RPC. */
  command?: string[] | undefined;
}
export class DesktopSettings {
  private permissions: DesktopPermissions;
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(
    private readonly options: Options,
    private readonly command: string[] | undefined,
    permissions: DesktopPermissions,
  ) {
    this.permissions = permissions;
    this.apply();
  }
  static async open(options: Options): Promise<DesktopSettings> {
    let permissions: DesktopPermissions = options.legacy
      ? {
          enabled: true,
          allowInput: options.legacy.allowInput,
          allowClipboard: options.legacy.allowClipboard === true,
          allowDisplayResize: options.legacy.allowDisplayResize === true,
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
        "デスクトップ共有の補助プログラムがありません。Windows版またはWSL版の配布物を確認してください。",
      );
    return new DesktopSettings(options, command, permissions);
  }
  get(canConfigure: boolean): DesktopSettingsResult {
    return { permissions: { ...this.permissions }, supported: !!this.command, canConfigure };
  }
  set(raw: DesktopPermissions): Promise<DesktopSettingsResult> {
    const permissions = DesktopPermissions.parse(raw);
    const work = this.queue.then(async () => {
      if (permissions.enabled && !this.command)
        throw new RpcError(
          "invalid_params",
          "この環境では同梱のWindows補助プログラムを使用できません。",
        );
      if (permissions.allowUnlock && this.options.legacy)
        throw new RpcError("invalid_params", "ロック解除には同梱のWindows補助プログラムを使用してください。");
      await writeFileAtomic(this.options.file, JSON.stringify(permissions) + "\n");
      this.permissions = permissions;
      this.apply();
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
      if (!legacy) {
        if (p.allowInput) command.push("-AllowInput");
        if (p.allowClipboard) command.push("-AllowClipboard");
        if (p.allowDisplayResize) command.push("-AllowDisplayResize");
        if (p.allowUnlock) command.push("-AllowUnlock");
      }
      config = {
        ...legacy,
        command,
        allowNativeVideo: !legacy || legacy.allowMedia===true,
        allowInput: p.allowInput,
        allowClipboard: p.allowClipboard,
        allowDisplayResize: p.allowDisplayResize,
        allowUnlock: p.allowUnlock === true,
        ...(p.allowUnlock && !legacy ? { unlockLeaseCommand: [...this.command, "-UnlockLease"] } : {}),
        origins: legacy?.origins ?? this.options.origins,
      };
    }
    this.options.provider.configure(config);
  }
}
