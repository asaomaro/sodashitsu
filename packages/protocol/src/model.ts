import type { GroupId, PaneId, SplitId, TabId, WorkspaceId, AgentInstanceId } from "./ids.js";

/** サーバが判定する 4 状態。5 つ目の `done`（未読の完了）はブラウザが既読から導く（design.md「概要」）。 */
export type AgentState = "blocked" | "working" | "idle" | "unknown";
/** 表示用の状態。`done` は `state === 'idle' && completionSeq > seenSeq` のときにブラウザが導出する。 */
export type DisplayState = AgentState | "done";

export type SplitDirection = "right" | "down";
export type Dir = "left" | "right" | "up" | "down";
export type RightClickTarget = "herdr" | "pane";

export interface GitInfo {
  branch: string | null;
  ahead: number;
  behind: number;
  /**
   * Git 共通ディレクトリの絶対パス（正規化済み。`git rev-parse --git-common-dir`）。worktree
   * 自動グループの判定キー——同じ `repoKey` を持つ workspace が2つ以上あれば束ねる
   * （20260923-workspace-grouping）。git 管理外なら null。
   */
  repoKey: string | null;
  /**
   * linked worktree か（本体＝false）。`git rev-parse --git-dir` と `--git-common-dir` を
   * 両方解決して比較する——本体はこの2つが同じパスを指し、linked worktree は異なる
   * （`--git-dir` は `<common-dir>/worktrees/<name>` を指す。標準的な Git の仕組み）。
   * `repoKey` が null（git 管理外）のときは常に false（20260923-workspace-grouping）。
   */
  isLinkedWorktree: boolean;
  /**
   * その worktree（フォルダ）を一意に示す絶対パス（正規化済み。`git rev-parse --path-format=absolute --git-dir`。
   * 本体は共通ディレクトリと同じ、linked worktree は `<共通ディレクトリ>/worktrees/<名前>`）。同じ値の workspace のうち
   * その `worktreeKey` を最初に持った workspace がその worktree の代表（`Workspace.representative`。サーバが決める）で、リポジトリの項目に入るのは代表だけ（追補 01 A）。
   * git 管理外なら null。古いサーバには無い（無ければ同じ `repoKey` を全部メンバーとして扱う）。
   */
  worktreeKey?: string | null;
}

export interface Workspace {
  id: WorkspaceId;
  label: string;
  cwd: string;
  tabIds: TabId[];
  /** サーバ全体で最後に選ばれた tab（design.md「フォーカスと表示」）。 */
  activeTabId: TabId;
  /** 手動グループ（`WorkspaceGroup`）の所属先。無ければ null（20260923-workspace-grouping）。 */
  groupId: GroupId | null;
  /** サイドバーの Space パネルの 2 行目。git 管理外なら null。 */
  git: GitInfo | null;
  /**
   * true なら `label` はサーバが開いた場所から決めた**自動の名前**（リポジトリの根のフォルダ名。git の外ならその場所のフォルダ名・ホームなら `~`・
   * フォルダ名の無い根ならパスそのもの）。false なら付けた名前（利用者が付けた名前と、worktree を開く・作る操作が渡した名前——ブランチ名、
   * detached ならパスの末尾）。`label` はどちらでも表示の名前（20260921-workspace-auto-label の design D1・D2）。
   */
  autoLabel: boolean;
  /**
   * 外から報告された独自トークン（名前 → 値。20260927-sidebar-row-tokens。herdr の workspace metadata tokens）。サイドバーの spaces 行の
   * `$名前` が読む。**サーバのメモリだけ**に持ち `session.json` には保存しない。1 つも無ければ項目ごと無い。値は整え済み（制御文字なし・80 文字まで）。
   */
  tokens?: Record<string, string>;
  /**
   * その worktree（`git.worktreeKey`）の**代表**か（追補 01 A・T29）。サーバが決めて配る: 代表は「その `worktreeKey` を最初に持った
   * workspace」で、既に代表が居る `worktreeKey` では奪われない（代表が閉じる・別のフォルダへ移るまで交代しない）。`worktreeKey` が文字列の
   * workspace にだけ付く。**古いサーバには無い**——無ければ画面が並びの順から導く（`isRepresentative`）。
   */
  representative?: boolean;
}

export interface Tab {
  id: TabId;
  workspaceId: WorkspaceId;
  label: string;
  layout: LayoutNode;
  /** サーバ全体で最後にフォーカスされた pane。 */
  focusedPaneId: PaneId;
  zoomedPaneId: PaneId | null;
  /** サイズ権限を持つクライアントの id（design.md「サイズ権限」）。 */
  sizeOwnerClientId: string | null;
}

export type LayoutNode =
  | { type: "pane"; paneId: PaneId }
  | { type: "split"; id: SplitId; dir: SplitDirection; ratio: number; a: LayoutNode; b: LayoutNode };

export type PaneStatus = "running" | "failed";

export interface Pane {
  id: PaneId;
  tabId: TabId;
  label: string | null;
  cwd: string;
  shell: string;
  cols: number;
  rows: number;
  /** `failed` は再起動後の復元でシェルを起動できなかったことを表す（D18 の例外）。 */
  status: PaneStatus;
  failure: string | null;
  /** 前面プロセスがシェル以外か（閉じる前の確認・herdr の busy 相当）。 */
  busy: boolean;
  /** 最新の OSC 0/2（安全化済み）。 */
  title: string;
  rightClick: RightClickTarget;
  agent: AgentInfo | null;
  /**
   * 公式フック連携（20260923-agent-session-resume）が報告した、この pane で直近に検出した
   * エージェントの会話/セッション参照。サーバ再起動時の復元で `claude --resume <id>` 等の
   * 投入に使う。画面判定で `agent` が非 null→null になったら一緒に null にする（design D9）。
   */
  agentSession: AgentSessionRef | null;
  /** 外から報告された独自トークン（`Workspace.tokens` と同じ扱い。サイドバーの agents 行の `$名前` が読む。20260927-sidebar-row-tokens）。 */
  tokens?: Record<string, string>;
}

/**
 * herdr との対応は無く、本製品独自の公式フック連携専用（20260923-agent-session-resume。
 * 20260923-other-agents-session-resume で6つ追加——Cursor Agent CLI・GitHub Copilot CLI・
 * Devin CLI・Droid・Grok CLI・Qwen Code）。
 * 20261007-agent-hook-drift で Qoder CLI（`qodercli`）を追加。
 */
export type AgentIntegrationKind = "claude" | "codex" | "cursor" | "copilot" | "devin" | "droid" | "grok" | "qwen" | "qodercli";

export interface AgentSessionRef {
  kind: AgentIntegrationKind;
  sessionId: string;
  /** 報告を受けた時刻（epoch ms）。診断用。 */
  reportedAt: number;
}

/** エージェントが中で動かしているサブエージェント 1 件（pane は持たない。20261004-subagent-display）。 */
export interface SubagentInfo {
  id: string;
  /** サブエージェントの種類。分からなければ項目なし。 */
  type?: string;
  description?: string;
  /** バックグラウンドの実行か。分からなければ項目なし。 */
  background?: boolean;
  /** サーバが起動（または突き合わせ）の報告を受けた時刻（epoch ms）。 */
  startedAt: number;
}

export interface AgentInfo {
  /** 検出のたびに振る id（再起動後も重複しない）。既読の記録のキーに使う。 */
  instanceId: AgentInstanceId;
  /** herdr の agent id（'claude' | 'codex' | …）。 */
  kind: string;
  label: string;
  state: AgentState;
  /** working → idle になるたびに 1 増やす（done の判定に使う）。 */
  completionSeq: number;
  /** サーバ側の既読。pane.focus を受けたら completionSeq に揃える。再起動をまたがない（メモリのみ）。 */
  serverSeenSeq: number;
  /** MVP で検証済み（Claude Code・Codex）かどうか。 */
  verified: boolean;
  /** 状態が変わった時刻（epoch ms）。 */
  since: number;
  /**
   * 利用者が付けた名前（20260926-agent-start-rename。herdr の agent name）。書式は `isValidAgentName`、live なエージェント間で一意。
   * この検出（`instanceId`）にだけ付き、終了・入れ替わりで消える。無ければ項目自体を持たない。
   */
  name?: string;
  /**
   * 実行中のサブエージェント（20261004-subagent-display）。フックの報告を一度も受けていない検出では項目なし（＝分からない）。
   * 受けたことがあれば持つ（0 件なら `count: 0`）。`items` は起動した順で最大 64 件、`count` は実際の数。この検出（`instanceId`）にだけ付く。
   */
  subagents?: { count: number; items: SubagentInfo[] };
}

export interface HostInfo {
  os: "linux" | "windows";
  windowsBuild: number | null;
  hostname: string;
  /** 名前付き session のときだけ、その名前（`soda serve --session <名前>`・`SODA_SESSION`。既定の session では項目ごと無い。20260926-named-session-ui）。 */
  sessionName?: string;
}

/** session の一覧の 1 項目の、開くための情報（20260926-named-session-ui）。URL はブラウザが決める（いまのページのホスト名はブラウザしか知らない）。 */
export interface ServerSessionEndpoint {
  /** 待ち受けているポート。 */
  port: number;
  /** TLS で待ち受けているか（`https:` で開く）。 */
  https: boolean;
  /** 待ち受けのホスト（`--host`。角括弧なし。`0.0.0.0`・`::` は全インタフェース）。 */
  host: string;
}

/**
 * `server.sessions` の 1 項目（同じ session の根の既定の session と名前付き session。20260926-named-session-ui）。
 * **token・Cookie・状態ディレクトリのパス・pid は持たない**（AC5）。
 */
export interface ServerSessionEntry {
  /** 既定の session は `"default"`。 */
  name: string;
  default: boolean;
  running: boolean;
  /** この接続のサーバの session か。 */
  current: boolean;
  /** 動いていて、起動の記録がいまのロックの持ち主のものと分かるときだけ。 */
  endpoint?: ServerSessionEndpoint;
}

/**
 * 保存した SSH のマシン（20260927-multi-host-machines。herdr の saved SSH machines）の、手元の `soda serve` から見た接続の状態。
 * `connecting` は初回の試み、`online` は中継の最初の応答（版の確かめ）を受けた後、`reconnecting` は切れて繋ぎ直している間、
 * `attention` は利用者の対応が要る失敗（認証・ホスト鍵・リモートに `soda` が無い・リモートの `soda serve` が動いていない・版が合わない）。
 */
export type MachineState = "connecting" | "online" | "reconnecting" | "attention";

/** `machine.list` の 1 項目（有効なマシンだけ。宛先・session は持たない——画面に要らない）。 */
export interface MachineStatus {
  /** 登録の不透明な id（32 桁の 16 進）。`/ws?machine=` に使う。 */
  id: string;
  label: string;
  state: MachineState;
  /** `attention`・`reconnecting` の理由（無ければ null）。 */
  message: string | null;
}

export interface SessionFocus {
  workspaceId: WorkspaceId;
  tabId: TabId;
  paneId: PaneId;
}

export interface SessionLimits {
  scrollbackLines: number;
}

/**
 * 利用者が名前を付けて作るグループ（herdr に前例が無い独自拡張。20260923-workspace-grouping）。
 * worktree グループ（同じリポジトリの workspace をまとめた行）とは別物——こちらはサーバに永続化する実体
 * （`session.json` の一部）で、中に通常の workspace と worktree グループを入れられる（入れ子は 1 段）。
 */
export interface WorkspaceGroup {
  id: GroupId; // "g1", "g2", ... （既存の id 採番の流儀に揃える）
  label: string;
  /** 折りたたみ状態（サーバ全体で共有。worktree グループの折りたたみは共有の設定 `collapsedAutoGroups` に持つ別物）。 */
  collapsed: boolean;
}

/**
 * サイドバーの項目の参照（20261004-group-worktree-items）。`g:<groupId>`（グループ）・`r:<repoKey>`（リポジトリ。
 * worktree をまとめた 1 項目）・`w:<workspaceId>`（git 管理外・判定前の workspace）。
 */
export type ItemRef = string;

/** サイドバーの項目の並び（サーバが正。`SessionSnapshot.layout`・`sidebar.layout_changed`）。 */
export interface SidebarLayout {
  /** まとまりの順。`g:<groupId>` と、グループなしを表す `"u"`（必ず 1 つ。追補 01 B）。グループの間にグループ外の項目は挟めない。 */
  top: string[];
  /** グループの中の項目の順（キーは GroupId。`g:` は入らない）。空のグループも空の配列で持つ。 */
  groups: Record<GroupId, ItemRef[]>;
  /** グループなしの中の項目の順（`r:` / `w:`）。 */
  ungrouped: ItemRef[];
}

/** 項目に対する操作の対象。workspace を指すと、その workspace の項目（リポジトリなら丸ごと）になる。 */
export type ItemTarget =
  | { kind: "group"; groupId: GroupId }
  | { kind: "workspace"; workspaceId: WorkspaceId }
  /** 「グループなし」のまとまり（`top` の `"u"`）。まとまりどうしの並べ替えの対象になる。 */
  | { kind: "ungrouped" };

export interface SessionSnapshot {
  protocol: 1;
  serverVersion: string;
  host: HostInfo;
  workspaces: Workspace[];
  tabs: Tab[];
  panes: Pane[];
  groups: WorkspaceGroup[];
  /** 項目の並び。古いサーバには無い（無ければ画面が `layoutFromLegacy` で導く）。 */
  layout?: SidebarLayout;
  focus: SessionFocus | null;
  limits: SessionLimits;
}

/**
 * `git worktree list --porcelain` の 1 エントリ（20260920-git-worktree-actions）。
 * **bare と prunable はサーバ側で落とす**ので、ここに来るのは「開ける」ものだけ。
 */
export interface WorktreeEntry {
  path: string;
  /** detached HEAD なら null。 */
  branch: string | null;
}
