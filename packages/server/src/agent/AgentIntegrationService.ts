import type { AgentIntegrationKind, AgentIntegrationInstallResult, AgentIntegrationStatusResult } from "@sodashitsu/protocol";
import type { EventBus } from "../bus/EventBus.js";
import type { IntegrationFile } from "../persist/IntegrationFile.js";
import { defaultIntegrationFileData } from "../persist/IntegrationFile.js";
import { AGENT_INTEGRATION_KINDS, type AgentIntegrationInstaller } from "./AgentIntegrationInstaller.js";


/**
 * `agent_integration.*` RPC の実体（20260923-agent-session-resume）。導入・解除・自動再開設定の
 * とりまとめと、変わったときの `agent_integration.changed` の配布を担う。
 * 「導入済みか」は `AgentIntegrationInstaller` に都度問う（design D4）。ここが持つ状態は
 * `autoResumeEnabled` だけ（起動時に `IntegrationFile` から読み込む）。
 * `TerminalManager`/`WorktreeService` と同じく interface + `Default…` 実装に分ける
 * （`MethodDeps`・テストでのスタブ差し替えのため）。
 */
export interface AgentIntegrationService {
  /** `SessionService` が復元時に読む（構築時に固定値を渡さず、都度呼ぶ。design D3）。 */
  getAutoResumeEnabled(): boolean;
  status(): Promise<AgentIntegrationStatusResult>;
  install(kind: AgentIntegrationKind): Promise<AgentIntegrationInstallResult>;
  uninstall(kind: AgentIntegrationKind): Promise<AgentIntegrationInstallResult>;
  setAutoResume(enabled: boolean): Promise<void>;
}

export class DefaultAgentIntegrationService implements AgentIntegrationService {
  private autoResumeEnabled: boolean;

  private constructor(
    private readonly installer: AgentIntegrationInstaller,
    private readonly file: IntegrationFile,
    private readonly bus: EventBus,
    autoResumeEnabled: boolean,
  ) {
    this.autoResumeEnabled = autoResumeEnabled;
  }

  /** `integrations.json` を読み込んでから組み立てる（無ければ既定値。design D3）。 */
  static async load(installer: AgentIntegrationInstaller, file: IntegrationFile, bus: EventBus): Promise<DefaultAgentIntegrationService> {
    const loaded = await file.load();
    const autoResumeEnabled = loaded.kind === "ok" ? loaded.data.autoResumeEnabled : defaultIntegrationFileData().autoResumeEnabled;
    return new DefaultAgentIntegrationService(installer, file, bus, autoResumeEnabled);
  }

  getAutoResumeEnabled = (): boolean => this.autoResumeEnabled;

  async status(): Promise<AgentIntegrationStatusResult> {
    const entries = await Promise.all(AGENT_INTEGRATION_KINDS.map(async (kind) => [kind, await this.installer.status(kind)] as const));
    return {
      autoResumeEnabled: this.autoResumeEnabled,
      agents: Object.fromEntries(entries) as AgentIntegrationStatusResult["agents"],
    };
  }

  async install(kind: AgentIntegrationKind): Promise<AgentIntegrationInstallResult> {
    const result = await this.installer.install(kind);
    if (result.ok) await this.publishChanged();
    return result;
  }

  async uninstall(kind: AgentIntegrationKind): Promise<AgentIntegrationInstallResult> {
    const result = await this.installer.uninstall(kind);
    if (result.ok) await this.publishChanged();
    return result;
  }

  async setAutoResume(enabled: boolean): Promise<void> {
    this.autoResumeEnabled = enabled;
    await this.file.save({ schema: 1, autoResumeEnabled: enabled });
    await this.publishChanged();
  }

  private async publishChanged(): Promise<void> {
    this.bus.publish({ event: "agent_integration.changed", data: await this.status() });
  }
}
