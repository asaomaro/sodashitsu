import type { ControlSurface } from "../ControlSurface.js";
import type { MethodDeps } from "./deps.js";
import { registerClientMethods } from "./client.js";
import { registerSubscribeMethods } from "./subscribe.js";
import { registerWorkspaceMethods } from "./workspace.js";
import { registerGroupMethods } from "./group.js";
import { registerTabMethods } from "./tab.js";
import { registerPaneMethods } from "./pane.js";
import { registerLayoutMethods } from "./layout.js";
import { registerWorktreeMethods } from "./worktree.js";
import { registerAgentIntegrationMethods } from "./agentIntegration.js";
import { registerAgentMethods } from "./agent.js";
import { registerAttachMethods } from "./attach.js";
import { registerServerSessionMethods } from "./serverSessions.js";
import { registerMachineMethods } from "./machines.js";
import { registerCommandMethods } from "./command.js";
import { registerImageMethods } from "./image.js";
import { registerPrefsMethods } from "./prefs.js";

export type { MethodDeps } from "./deps.js";

/** design「方式」の表＋architecture「方式の追加と変更」の全方式を登録する
 *  （worktree の 2 つ・20260923-agent-session-resume の agent_integration 4 つ・
 *  20260923-workspace-grouping の group.* 6 つ・workspace.move/move_to を含む）。 */
export function registerAllMethods(surface: ControlSurface, deps: MethodDeps): void {
  registerClientMethods(surface, deps);
  registerSubscribeMethods(surface, deps);
  registerWorkspaceMethods(surface, deps);
  registerGroupMethods(surface, deps);
  registerTabMethods(surface, deps);
  registerPaneMethods(surface, deps);
  registerLayoutMethods(surface, deps);
  registerWorktreeMethods(surface, deps);
  registerAgentIntegrationMethods(surface, deps);
  registerAgentMethods(surface, deps); // 20260926-agent-prompt-send-keys
  registerAttachMethods(surface, deps); // 20260926-pane-direct-connect
  registerServerSessionMethods(surface, deps); // 20260926-named-session-ui
  registerMachineMethods(surface, deps); // 20260927-multi-host-machines
  registerCommandMethods(surface, deps); // 20260927-custom-command-keys
  registerImageMethods(surface, deps); // 20260927-clipboard-image-paste
  registerPrefsMethods(surface, deps); // 20260927-cli-mode
}
