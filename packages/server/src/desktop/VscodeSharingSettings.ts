import { readFile } from "node:fs/promises";
import {
  VscodeSharingPermissions,
  RpcError,
  type VscodeSharingSettingsResult,
} from "@sodashitsu/protocol";
import { writeFileAtomic } from "../persist/atomicFile.js";
import type { DesktopCdpLauncher } from "./DesktopCdpLauncher.js";
import { bundledVscodeCommand, bundledVscodeSupported } from "./BundledVscodeLauncher.js";
interface Options {
  file: string;
  launcher: DesktopCdpLauncher;
  origin(): string;
  changed(): void;
  supported?: () => boolean;
  command?: (p: VscodeSharingPermissions) => readonly string[] | undefined;
}
export class VscodeSharingSettings {
  private queue: Promise<unknown> = Promise.resolve();
  private permissions: VscodeSharingPermissions;
  private constructor(
    private options: Options,
    private legacy: readonly string[] | undefined,
    saved: VscodeSharingPermissions | undefined,
  ) {
    this.permissions = saved ?? { enabled: !!legacy, allowInput: false, allowFit: false };
    this.apply();
  }
  static async create(options: Options): Promise<VscodeSharingSettings> {
    let saved: VscodeSharingPermissions | undefined;
    try {
      const raw = VscodeSharingPermissions.safeParse(
        JSON.parse(await readFile(options.file, "utf8")),
      );
      saved =
        raw.success && (!raw.data.allowFit || raw.data.allowInput)
          ? raw.data
          : { enabled: false, allowInput: false, allowFit: false };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT")
        saved = { enabled: false, allowInput: false, allowFit: false };
    }
    return new VscodeSharingSettings(options, options.launcher.configuredCommand(), saved);
  }
  get(canConfigure: boolean): VscodeSharingSettingsResult {
    return {
      permissions: { ...this.permissions },
      supported: !!this.legacy || (this.options.supported?.() ?? bundledVscodeSupported()),
      canConfigure,
      customCommand: !!this.legacy,
    };
  }
  set(value: VscodeSharingPermissions): Promise<VscodeSharingSettingsResult> {
    const task = this.queue.then(async () => {
      const permissions = VscodeSharingPermissions.parse(value);
      if (permissions.allowFit && !permissions.allowInput)
        throw new RpcError("invalid_params", "サイズ追従には操作の許可も必要です");
      if (permissions.enabled && !this.get(true).supported)
        throw new RpcError(
          "invalid_params",
          "WindowsまたはWSLで、VSCodeとWindows版Node 24を用意してください",
        );
      await writeFileAtomic(this.options.file, JSON.stringify(permissions));
      this.permissions = permissions;
      this.apply();
      this.options.changed();
      return this.get(true);
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  private apply(): void {
    if (!this.permissions.enabled) {
      this.options.launcher.configure(undefined);
      return;
    }
    const legacy = this.legacy,
      permissions = { ...this.permissions };
    this.options.launcher.configure(
      () =>
        legacy ??
        this.options.command?.(permissions) ??
        bundledVscodeCommand(permissions.sodaOrigin || this.options.origin(), permissions),
    );
  }
}
