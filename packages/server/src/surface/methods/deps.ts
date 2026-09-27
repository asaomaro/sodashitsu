import type { GitInfoPoller } from "../../git/GitInfoPoller.js";
import type { WorktreeService } from "../../git/WorktreeService.js";
import type { SessionService } from "../../session/SessionService.js";
import type { ClientRegistry } from "../../clients/ClientRegistry.js";
import type { SizeAuthority } from "../../clients/SizeAuthority.js";
import type { TerminalManager } from "../../terminal/TerminalManager.js";
import type { AgentIntegrationService } from "../../agent/AgentIntegrationService.js";
import type { AgentStarter } from "../../agent/AgentStarter.js";
import type { MachineStatus, ServerSessionEntry } from "@wtm/protocol";

/** 方式のハンドラが使う部品一式（architecture.md「surface/methods/*.ts」の依存）。 */
export interface MethodDeps {
  session: SessionService;
  clients: ClientRegistry;
  sizeAuthority: SizeAuthority;
  terminals: TerminalManager;
  /** worktree の一覧と作成（20260920-git-worktree-actions）。 */
  worktrees: WorktreeService;
  /** 公式フック連携の導入・解除・自動再開設定（20260923-agent-session-resume）。 */
  agentIntegrations: AgentIntegrationService;
  /** workspace.create 直後の即時ポーリング用（20260925-workspace-git-immediate）。 */
  gitPoller: GitInfoPoller;
  /** `agent.start`（20260926-agent-start）。無ければ `agent.start` を登録しない（decisions.md D7）。 */
  agentStarter?: AgentStarter;
  /** `server.sessions`（20260926-named-session-ui）。無ければ空の一覧を返す。 */
  serverSessions?: () => Promise<ServerSessionEntry[]>;
  /** `machine.list`（20260927-multi-host-machines）。無ければ空の一覧を返す。 */
  machines?: () => MachineStatus[];
}
