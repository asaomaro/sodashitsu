import {
  AgentIntegrationInstallParams,
  AgentIntegrationSetAutoResumeParams,
  AgentIntegrationStatusLineParams,
  AgentIntegrationStatusParams,
  AgentIntegrationUninstallParams,
} from "@sodashitsu/protocol";
import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";

/** 公式フック連携の導入・解除・状態確認・自動再開の切替（20260923-agent-session-resume）。 */
export function registerAgentIntegrationMethods(surface: ControlSurface, deps: MethodDeps): void {
  surface.register("agent_integration.status", {
    schema: AgentIntegrationStatusParams,
    handler: () => deps.agentIntegrations.status(),
  });

  surface.register("agent_integration.install", {
    schema: AgentIntegrationInstallParams,
    handler: (_ctx, params) => deps.agentIntegrations.install(params.kind),
  });

  surface.register("agent_integration.uninstall", {
    schema: AgentIntegrationUninstallParams,
    handler: (_ctx, params) => deps.agentIntegrations.uninstall(params.kind),
  });

  surface.register("agent_integration.set_auto_resume", {
    schema: AgentIntegrationSetAutoResumeParams,
    handler: async (_ctx, params) => {
      await deps.agentIntegrations.setAutoResume(params.enabled);
      return {};
    },
  });

  // Claude Code のステータスラインの包み（20261010-agent-usage の PR2）。フックの導入とは別の項目。
  surface.register("agent_integration.statusline_install", {
    schema: AgentIntegrationStatusLineParams,
    handler: () => deps.agentIntegrations.installStatusLine(),
  });
  surface.register("agent_integration.statusline_uninstall", {
    schema: AgentIntegrationStatusLineParams,
    handler: () => deps.agentIntegrations.uninstallStatusLine(),
  });
}
