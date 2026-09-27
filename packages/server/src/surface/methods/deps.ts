import type { GitInfoPoller } from "../../git/GitInfoPoller.js";
import type { WorktreeService } from "../../git/WorktreeService.js";
import type { SessionService } from "../../session/SessionService.js";
import type { ClientRegistry } from "../../clients/ClientRegistry.js";
import type { SizeAuthority } from "../../clients/SizeAuthority.js";
import type { TerminalManager } from "../../terminal/TerminalManager.js";
import type { AgentIntegrationService } from "../../agent/AgentIntegrationService.js";
import type { AgentStarter } from "../../agent/AgentStarter.js";
import type { MetadataService } from "../../metadata/MetadataService.js";
import type { MachineStatus, ServerSessionEntry } from "@sodashitsu/protocol";
import type { CommandService } from "../../commands/CommandService.js";
import type { ImageUploads } from "../../image/ImageUploads.js";
import type { PrefsStore } from "../../persist/PrefsStore.js";
import type { StopReply } from "../../handoff/HandoffSocket.js";

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
  machines?: () => MachineStatus[] | Promise<MachineStatus[]>;
  /** 独自コマンド（20260927-custom-command-keys）。無ければ一覧は空で、popup の購読も受けない。 */
  commands?: CommandService;
  /** 独自トークンの報告（20260927-sidebar-row-tokens）。無ければ `workspace.report_metadata`・`pane.report_metadata` を登録しない（`agentStarter` と同じ任意の依存）。 */
  metadata?: MetadataService;
  /** クリップボードの画像の貼り付け（20260927-clipboard-image-paste）。無ければ `pane.image.*` を登録しない。 */
  images?: ImageUploads;
  /** 共有の設定（20260927-cli-mode）。無ければ `prefs.*` を登録しない。 */
  prefs?: PrefsStore;
  /**
   * 止める指示の受け付け（`server.stop`。20260927-cli-mode）。制御の socket と同じ判断（`ControlRequests.stop`）。`reply` は 1 回だけ呼ばれ、止めるのは返事の後。
   * 無ければ `server.stop` は `server_stop_unsupported` で断る。
   */
  stopServer?: (reply: (r: StopReply) => Promise<void>) => Promise<void>;
}
