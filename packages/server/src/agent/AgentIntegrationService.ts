import type { AgentIntegrationKind, AgentIntegrationInstallResult, AgentIntegrationStatusResult, StatusLineWrapStatus } from "@sodashitsu/protocol";
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
  /** Claude Code のステータスラインの包み（20261010-agent-usage の PR2。フックの導入とは別。押したときだけ書き換える）。 */
  installStatusLine(): Promise<AgentIntegrationInstallResult>;
  uninstallStatusLine(): Promise<AgentIntegrationInstallResult>;
}

/** ステータスラインの包みの部品（`statusLineWrap.ts` の `StatusLineWrapper`）。 */
export interface StatusLineControl {
  status(): Promise<{ state: StatusLineWrapStatus["state"]; message?: string }>;
  install(): Promise<{ ok: boolean; message: string | null }>;
  uninstall(): Promise<{ ok: boolean; message: string | null }>;
}

/** 「報告が届いていません」の判定の材料（利用状況の受け口が持つ）。 */
export interface StatusLineHealth {
  /** 最後に、使える報告を受けた時刻（epoch ms）。無ければ undefined。 */
  lastReportAt(): number | undefined;
  /** いま動いている Claude Code が、検出され始めた時刻のうち、いちばん早いもの（無ければ undefined）。 */
  claudeRunningSince(): number | undefined;
}

/** 検出されてから、この時間のあいだ報告が無ければ、「届いていません」（ステータスラインは、応答のたびに呼ばれる）。 */
export const STATUSLINE_SILENT_AFTER_MS = 120_000;

export class DefaultAgentIntegrationService implements AgentIntegrationService {
  private autoResumeEnabled: boolean;

  private constructor(
    private readonly installer: AgentIntegrationInstaller,
    private readonly file: IntegrationFile,
    private readonly bus: EventBus,
    autoResumeEnabled: boolean,
    private readonly statusLine?: StatusLineControl,
    private readonly health?: StatusLineHealth,
    private readonly now: () => number = Date.now,
  ) {
    this.autoResumeEnabled = autoResumeEnabled;
  }

  /** `integrations.json` を読み込んでから組み立てる（無ければ既定値。design D3）。 */
  static async load(
    installer: AgentIntegrationInstaller,
    file: IntegrationFile,
    bus: EventBus,
    extras: { statusLine?: StatusLineControl; health?: StatusLineHealth; now?: () => number } = {},
  ): Promise<DefaultAgentIntegrationService> {
    const loaded = await file.load();
    const autoResumeEnabled = loaded.kind === "ok" ? loaded.data.autoResumeEnabled : defaultIntegrationFileData().autoResumeEnabled;
    return new DefaultAgentIntegrationService(installer, file, bus, autoResumeEnabled, extras.statusLine, extras.health, extras.now);
  }

  getAutoResumeEnabled = (): boolean => this.autoResumeEnabled;

  async status(): Promise<AgentIntegrationStatusResult> {
    const entries = await Promise.all(AGENT_INTEGRATION_KINDS.map(async (kind) => [kind, await this.installer.status(kind)] as const));
    const statusLine = await this.statusLineStatus();
    return {
      autoResumeEnabled: this.autoResumeEnabled,
      agents: Object.fromEntries(entries) as AgentIntegrationStatusResult["agents"],
      ...(statusLine ? { statusLine } : {}),
    };
  }

  private async statusLineStatus(): Promise<StatusLineWrapStatus | undefined> {
    if (!this.statusLine) return undefined;
    const s = await this.statusLine.status();
    const lastReportAt = this.health?.lastReportAt();
    const since = this.health?.claudeRunningSince();
    const installed = s.state === "installed" || s.state === "needs_update";
    // 導入済みで、動いている Claude Code が、検出されてから一定の時間たつのに、その後の報告が無い（信頼されていないフォルダ・プロジェクトの設定の上書き・管理された設定の可能性）。
    const silent = installed && since !== undefined && this.now() - since >= STATUSLINE_SILENT_AFTER_MS && (lastReportAt === undefined || lastReportAt < since);
    return { state: s.state, ...(s.message !== undefined ? { message: s.message } : {}), ...(silent ? { silent: true } : {}), ...(lastReportAt !== undefined ? { lastReportAt } : {}) };
  }

  async installStatusLine(): Promise<AgentIntegrationInstallResult> {
    if (!this.statusLine) return { ok: false, message: "このサーバでは、ステータスラインの包みを使えません" };
    const result = await this.statusLine.install();
    if (result.ok) await this.publishChanged();
    return result;
  }

  async uninstallStatusLine(): Promise<AgentIntegrationInstallResult> {
    if (!this.statusLine) return { ok: false, message: "このサーバでは、ステータスラインの包みを使えません" };
    const result = await this.statusLine.uninstall();
    if (result.ok) await this.publishChanged();
    return result;
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
