import type {
  AgentInfo,
  AgentIntegrationKind,
  Dir,
  GitInfo,
  GroupId,
  HostInfo,
  NewCwd,
  Pane,
  PaneId,
  RightClickTarget,
  SessionSnapshot,
  SplitDirection,
  SplitId,
  Tab,
  TabId,
  Workspace,
  WorkspaceGroup,
  WorkspaceId,
} from "@wtm/protocol";
import { INVALID_AGENT_NAME_MESSAGE, isValidAgentName, RpcError } from "@wtm/protocol";
import type { SessionFileData, SessionFilePane, SessionFileTab, SessionFileWorkspace } from "../persist/SessionFile.js";
import type { PaneHistoryEntry } from "../persist/PaneHistoryFile.js";
import { historyReplayText, sanitizeHistoryAnsi } from "../terminal/historyAnsi.js";
import type { HandoffScrollbackEditor } from "../handoff/HandoffManifest.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import { removeScrollbackDir, scrollbackEditorArgv, writeScrollbackFile } from "../terminal/scrollbackEditor.js";
import type { EventBus } from "../bus/EventBus.js";
import { NotFoundError, SessionModel } from "./SessionModel.js";
import * as Layout from "./LayoutTree.js";
import { resumeCommandFor } from "../agent/resumeCommand.js";
import { resolveNewCwd, type NewCwdDeps } from "./newCwd.js";
import { buildPaneEnv } from "./paneEnv.js";
import { AUTO_LABEL_TIMEOUT_MS, autoWorkspaceLabel, defaultWorkspaceLabelDeps, folderLabelOf, type WorkspaceLabelDeps } from "./workspaceLabel.js";
import { withTimeout } from "./withTimeout.js";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { monotonicNow } from "../log/LogThrottle.js";
import type { PersistScheduler } from "./PersistScheduler.js";
import type { Logger } from "../log/Logger.js";

/** 更新時の引き継ぎ（20260926-live-handoff）で渡された、pane の PTY（design「`SessionService`」）。 */
export interface AdoptedPaneSpec {
  fd: number;
  pid: number;
  cols: number;
  rows: number;
  /** 古い版のミラーの `historyAnsi()`。 */
  screen: string;
}

/** クライアントが 1 台も無いときの既定サイズ（design「サイズ権限」。herdr の headless_cols/rows と同じ考え方）。 */
const HEADLESS_COLS = 120;
const HEADLESS_ROWS = 40;
/** D37：シェルの起動が「短い猶予の間に終了するか」で失敗を判定する。 */
const DEFAULT_SPAWN_GRACE_MS = 300;

export interface PaneRuntimePatch {
  busy?: boolean;
  cwd?: string;
  title?: string;
  agent?: AgentInfo | null;
}

/**
 * 復元で自動の名前を決めるのにかける合計の時間（20260921-workspace-auto-label の review ラウンド 2）。1 つずつ決めるので、遅いだけの fs でも
 * 数に比例して `/ws` の受け付けが遅れる——超えたら残りは根を探さずフォルダ名にする（最悪でもこれと 1 回分の上限の和）。
 */
const RESTORE_LABEL_BUDGET_MS = 1000;

/** 名前を空にして確定したとき、待つ間に最初の pane の場所が変わったら決め直す回数の上限（20260926-workspace-label-follow-cwd の design「振る舞いの詳細」）。 */
const RENAME_FOLLOW_ATTEMPTS = 3;

/** 追従の見直しで決めた自動の名前（`followedLabel` → `applyWorkspaceIdentity`）。`gen` は待つ前の名前変更の世代、`degraded` はフォルダ名で代えたかもしれないとき。 */
export interface FollowedLabel {
  label: string;
  gen: number;
  degraded: boolean;
}

export interface SessionServiceOptions {
  model: SessionModel;
  terminals: TerminalManager;
  bus: EventBus;
  persist: PersistScheduler;
  serverVersion: string;
  host: HostInfo;
  scrollbackLines: number;
  spawnGraceMs?: number;
  defaultCwd: string;
  /** `--shell`（新しい pane のシェル）。省略時は OS の既定（`ProcessInspector.defaultShell()`。T27）。 */
  shell?: string | undefined;
  logger: Logger;
  /**
   * 新しく開く場所の方針（`newCwd`）を場所に変える依存（20260921-new-terminal-cwd の design D6。`composeServer` が `makeNewCwdDeps` で作る）。
   * **任意**——無ければ `newCwd` を見ない（今までどおり）。
   */
  newCwdDeps?: NewCwdDeps | undefined;
  /**
   * workspace の自動の名前を決める依存（20260921-workspace-auto-label の design D3）。省略時は本物の fs と `os.homedir`。
   * テストは偽物を渡して、手元のファイルシステムに依存させない。
   */
  workspaceLabelDeps?: WorkspaceLabelDeps | undefined;
  /** スクロールバックを `$EDITOR` で開く（20260926-edit-scrollback）ときの一時ディレクトリの置き場・OS・環境変数。テストで差し替える。 */
  scrollbackEditor?: { tmpRoot?: string; platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } | undefined;
  /** 復元の合計の期限を測る時計（ms）。既定は単調な `monotonicNow`（壁時計は戻りうる。D103 の独立点検 #8）。テストで差し替える。 */
  clock?: { now(): number } | undefined;
  /**
   * 公式フック連携（20260923-agent-session-resume）の report を受け取るローカル socket のパス。
   * pane 起動時に `WTM_AGENT_REPORT_SOCKET` として環境変数に渡す。未設定（socket の起動に失敗した等）
   * なら渡さない——hook 側は env が無ければ無害に何もしない（design「5. hook スクリプト」）。
   */
  agentReportSocketPath?: string | undefined;
  /**
   * 自動再開の可否を都度読む（設定画面から切り替えられるため、構築時に固定値で受け取らない。
   * design D3）。省略時は既定 ON（herdr の `resume_agents_on_restore` の既定に合わせる）。
   */
  getAutoResumeEnabled?: (() => boolean) | undefined;
  /**
   * pane の中の wtmctl がこのサーバへつなげる URL（20260926-agent-skill-file）。pane を起動するたびに読み、あれば `WTM_SERVER_URL` として
   * 環境に入れる。待ち受けた後に決まる（`composeServer` の `listen()`）ので、組み立て時の値ではなく関数で受け取る。省略時は入れない。
   */
  serverUrlForPanes?: (() => string | undefined) | undefined;
  /** 名前付き session の名前（20260926-named-session-ui）。pane の環境の `WTM_SESSION` に入れる。既定の session では省く。 */
  sessionName?: string | undefined;
}

/**
 * モデルを書き換える唯一の入口（architecture.md「SessionService」・依存の規則 3）。
 * 検証 → モデルの変更 → 端末の生成・破棄 → イベント → 保存の予約、の順で行う。
 */
/** 復元で打ち込んだ会話の再開コマンドを「まだ起動中」とみなす時間（`agent start` の既定の締め切りと同じ）。 */
const RESUME_PENDING_MS = 30_000;

export class SessionService {
  private readonly model: SessionModel;
  private readonly terminals: TerminalManager;
  private readonly bus: EventBus;
  private readonly persist: PersistScheduler;
  private readonly serverVersion: string;
  private readonly host: HostInfo;
  private readonly scrollbackLines: number;
  private readonly spawnGraceMs: number;
  private readonly defaultCwd: string;
  private readonly shell: string | undefined;
  private readonly logger: Logger;
  private readonly newCwdDeps: NewCwdDeps | undefined;
  private readonly workspaceLabelDeps: WorkspaceLabelDeps;
  private readonly agentReportSocketPath: string | undefined;
  private readonly getAutoResumeEnabled: () => boolean;
  private readonly serverUrlForPanes: () => string | undefined;
  private readonly sessionName: string | undefined;
  private readonly scrollbackEditorEnv: { tmpRoot: string | undefined; platform: NodeJS.Platform; env: NodeJS.ProcessEnv };
  /** 開いているスクロールバックのエディタの pane → 開いた元の pane・開く前の拡大表示・一時ディレクトリ（20260926-edit-scrollback）。 */
  private readonly scrollbackEditors = new Map<PaneId, { sourcePaneId: PaneId; previousZoomedPaneId: PaneId | null; dir: string }>();
  /** pane を閉じたときに始めた一時ディレクトリの削除（停止時に待つ）。 */
  private readonly scrollbackCleanups = new Set<Promise<void>>();
  /**
   * 上限を超えたまままだ返っていない、根を探す問い合わせの数（review ラウンド 1・2）。0 でない間は新しく根を探さずフォルダ名にする——応答しない fs
   * （止まった NFS 等）への stat は取り消せず libuv のスレッドを塞ぐので、重ねてサーバ全体の fs を止めない。遅いだけなら返った時点で元に戻る。
   */
  private labelLookupsStuck = 0;
  /** 上限を超えた問い合わせの累計（減らさない）。待つ間に上限超えが起きたかを、待つ前と比べて知る（`autoLabelFor` の `degraded`。design D3）。 */
  private labelTimeouts = 0;
  /**
   * いまの自動の名前を決めた場所（20260926-workspace-label-follow-cwd の design D3）。最初の pane の場所がこれと同じなら、追従の見直しで名前を
   * 決め直さない（fs に問い合わせない）。フォルダ名で代えたかもしれない名前は記録しない——次の見直しで決め直す。
   */
  private readonly labelCwd = new Map<WorkspaceId, string>();
  private readonly clock: { now(): number };
  /**
   * workspace ごとの名前変更の世代（20260921-workspace-auto-label の design D9）。名前変更のたびに進め、自動の名前に戻す待ち（await）から
   * 戻ったときに世代が変わっていれば、後から来た名前変更が勝つ（古い結果を捨てる）。workspace が閉じたら消す。
   */
  private readonly labelGen = new Map<WorkspaceId, number>();
  /** `agent start` の起動中（検出前）の名前の予約（20260926-agent-start design「server `SessionService` に足すもの」）。 */
  private readonly agentLaunches = new Map<PaneId, { token: number; name: string; kind: string }>();
  private nextAgentLaunchToken = 1;
  /** 復元で会話の再開コマンドを打ち込んだ時刻（まだエージェントが検出されていない pane だけ。20260926-agent-start の cross 点検）。 */
  private readonly resumeWrittenAt = new Map<PaneId, number>();

  constructor(opts: SessionServiceOptions) {
    this.model = opts.model;
    this.terminals = opts.terminals;
    this.bus = opts.bus;
    this.persist = opts.persist;
    this.serverVersion = opts.serverVersion;
    this.host = opts.host;
    this.scrollbackLines = opts.scrollbackLines;
    this.spawnGraceMs = opts.spawnGraceMs ?? DEFAULT_SPAWN_GRACE_MS;
    this.defaultCwd = opts.defaultCwd;
    this.shell = opts.shell;
    this.logger = opts.logger;
    this.newCwdDeps = opts.newCwdDeps;
    this.clock = opts.clock ?? { now: monotonicNow };
    this.agentReportSocketPath = opts.agentReportSocketPath;
    this.getAutoResumeEnabled = opts.getAutoResumeEnabled ?? (() => true);
    this.serverUrlForPanes = opts.serverUrlForPanes ?? (() => undefined);
    this.sessionName = opts.sessionName;
    this.scrollbackEditorEnv = {
      tmpRoot: opts.scrollbackEditor?.tmpRoot,
      platform: opts.scrollbackEditor?.platform ?? process.platform,
      env: opts.scrollbackEditor?.env ?? process.env,
    };
    const labelDeps = opts.workspaceLabelDeps ?? defaultWorkspaceLabelDeps;
    this.workspaceLabelDeps = {
      ...labelDeps,
      onTimeout: (settled) => {
        this.labelLookupsStuck++;
        this.labelTimeouts++;
        // 数を戻す処理はログより先に付ける——warn が投げても数が戻る（review ラウンド 3）。
        void settled.then(() => {
          this.labelLookupsStuck--;
        });
        this.logger.warn("workspace label lookup timed out; using folder names until it returns", { stuck: this.labelLookupsStuck });
        labelDeps.onTimeout?.(settled);
      },
    };
  }

  /**
   * 新しい pane の場所。`newCwd` が無い・依存が無ければ `fallback`（今までどおり）を**同期で**返し、あれば `newCwd.ts` の規則で決める
   * Promise を返す（20260921-new-terminal-cwd）。呼ぶ側は **Promise のときだけ `await` する**——方針の無い要求では、以前と同じく
   * 起動（`spawnForPane`）までを同期で進め、猶予の競走の起点を変えない（`SessionService.test.ts` の分割の孤児のテストが前提にしている）。
   * **例外：workspace の作成で名前を決めるとき**は、起動の前に名前を待つ（20260921-workspace-auto-label の design D4b・decisions D1）。
   * **場所を明示する `cwd`（worktree）はここを通さない**——呼ぶ側で先に使う（design D5）。
   */
  private placeFor(
    newCwd: NewCwd | undefined,
    sourcePaneId: PaneId | undefined,
    fallback: string,
  ): { cwd: string; fellBack: boolean } | Promise<{ cwd: string; fellBack: boolean }> {
    if (!newCwd || !this.newCwdDeps) return { cwd: fallback, fellBack: false };
    return resolveNewCwd(newCwd, sourcePaneId, fallback, this.newCwdDeps);
  }

  snapshot(): SessionSnapshot {
    return this.model.buildSnapshot(this.serverVersion, this.host, { scrollbackLines: this.scrollbackLines });
  }

  // --- 読み取り専用のアクセサ（`SizeAuthority`・`AgentMonitor` 等、読むだけの相手向け） -------

  getWorkspace(id: WorkspaceId): Workspace | undefined {
    return this.model.getWorkspace(id);
  }
  getTab(id: TabId): Tab | undefined {
    return this.model.getTab(id);
  }
  getPane(id: PaneId): Pane | undefined {
    return this.model.getPane(id);
  }

  /** tab ごとのサイズ権限（`SizeAuthority`。design「サイズ権限」）。イベントは出さない内部の帳簿なので、
   *  ここだけ意図的に `SessionModel` を直接書き換える薄い通り道にする。 */
  setTabSizeOwner(tabId: TabId, clientId: string | null): void {
    this.model.setTabSizeOwner(tabId, clientId);
  }

  /** `session.json` の保存に使う（`nextId` の引き継ぎ。design「永続化の形式」）。 */
  getNextIdCounters(): ReturnType<SessionModel["getNextIdCounters"]> {
    return this.model.getNextIdCounters();
  }

  /** 検出したエージェントのインスタンス id を払い出す（`"a1"` 等。02-agent-detection の `AgentTracker` が使う。T8）。
   *  `nextId` は `session.json` に永続化されるので、再起動後も重複しない（design「done」の注記）。 */
  allocateAgentInstanceId(): string {
    const id = this.model.nextId("a");
    this.persist.touch();
    return id;
  }

  // --- workspace ------------------------------------------------------------

  async createWorkspace(
    cwd: string | undefined,
    label: string | undefined,
    newCwd?: NewCwd,
  ): Promise<{ workspace: Workspace; tab: Tab; pane: Pane; cwdFallback?: true }> {
    // **明示した `cwd`（worktree を開く）が方針に勝ち、代わりへは回さない**（design D5。使えなければ今までどおり spawn_failed）。
    const pending = cwd !== undefined ? { cwd, fellBack: false } : this.placeFor(newCwd, followSource(newCwd), this.defaultCwd);
    const place = pending instanceof Promise ? await pending : pending;
    const resolvedCwd = place.cwd;
    // 名前が無い（空白だけを含む）なら、開く場所から自動の名前を決めて**から**予約と起動へ進む（20260921-workspace-auto-label の design D4b）。
    // 起動の成功から commit までの間に await を挟むと、その間に終わったシェルの pane を `closePaneAfterExit` が見つけられず残る
    // （decisions D1）。名前を渡したとき（worktree）は待たない。
    const named = label?.trim() ? { label, autoLabel: false as const } : this.autoLabelFor(resolvedCwd);
    const naming = named instanceof Promise ? await named : named;
    // D37「成功を確認してからモデルを更新する順にする」：先に id とオブジェクトだけ用意し（reserve）、
    // spawn の成功を確認してから初めて Map へ入れる（commit）。レビュー指摘：以前は逆順で、
    // 猶予期間中に他クライアントが「存在するはずの無い」workspace を読めてしまっていた。
    const reserved = this.model.reserveWorkspace(resolvedCwd, naming.label, naming.autoLabel, {
      cwd: resolvedCwd,
      shell: this.shell ?? "",
      cols: HEADLESS_COLS,
      rows: HEADLESS_ROWS,
    });
    const spawn = await this.spawnForPane(reserved.pane.id, resolvedCwd);
    if (!spawn.ok) {
      // まだ Map に入れていないので、モデル側のロールバックは不要（イベントも出していない）。
      throw new RpcError("spawn_failed", `failed to start a shell for workspace ${reserved.workspace.id}`);
    }
    this.model.commitWorkspace(reserved);
    this.bus.publish({ event: "workspace.created", data: { workspace: reserved.workspace } });
    // `workspace.create` は最初の tab も一緒に作る（design「`workspace.create`」の応答に `tab` を含む）。
    // 応答の `tab` だけでは、この操作を出した本人以外のクライアント（複数タブ・複数ブラウザ。AC9）が
    // `session.tabs` にその tab を持てない——`tab.created` を必ず別途 publish する（05-e2e-docs T2 の
    // E2E で発見。D88）。
    this.bus.publish({ event: "tab.created", data: { tab: reserved.tab } });
    this.bus.publish({ event: "pane.created", data: { pane: reserved.pane } });
    if (naming.autoLabel && !naming.degraded) this.labelCwd.set(reserved.workspace.id, resolvedCwd); // 最初の pane の場所＝開いた場所
    this.persist.touch();
    if (spawn.alreadyExited) await this.closePaneAfterExit(reserved.pane.id, 0); // D37：猶予中に code 0 で即終了していた
    return { workspace: reserved.workspace, tab: reserved.tab, pane: reserved.pane, ...(place.fellBack ? { cwdFallback: true as const } : {}) };
  }

  /**
   * 開く場所から自動の名前を決める。`autoWorkspaceLabel` は投げないが、万一 reject しても作成を失敗させない（design のエラー処理の表）。
   * `degraded` はフォルダ名で代えたかもしれないとき（待つ前に詰まっていた・待つ間に上限超えが起きた・reject した）。**待ち終えた時点の
   * `labelLookupsStuck` では決めない**——待つ間に詰まりが解けると、代えたフォルダ名を決め直し済みと記録してしまう（20260926-workspace-label-follow-cwd の design D3）。
   */
  private async autoLabelFor(cwd: string): Promise<{ label: string; autoLabel: true; degraded: boolean }> {
    // 上限を超えた問い合わせがまだ返っていない間は、fs に問い合わせない（`labelLookupsStuck`）。
    if (this.labelLookupsStuck > 0) return { label: folderLabelOf(cwd, this.workspaceLabelDeps), autoLabel: true, degraded: true };
    const timeoutsBefore = this.labelTimeouts;
    let rejected = false;
    const label = await autoWorkspaceLabel(cwd, this.workspaceLabelDeps).catch(() => {
      rejected = true;
      return folderLabelOf(cwd, this.workspaceLabelDeps);
    });
    return { label, autoLabel: true, degraded: rejected || this.labelTimeouts !== timeoutsBefore };
  }

  /**
   * workspace のいまの場所：最初の tab の、画面の並びで先頭の pane の `cwd`（エージェントの監視が前面プロセスの cwd か OSC 7 で更新し続ける）。
   * 見つからなければ開いた場所。無い workspace は undefined（20260926-workspace-label-follow-cwd の design D1。herdr の `resolved_identity_cwd_from`）。
   */
  identityCwdOf(id: WorkspaceId): string | undefined {
    const ws = this.model.getWorkspace(id);
    if (!ws) return undefined;
    const tab = ws.tabIds[0] !== undefined ? this.model.getTab(ws.tabIds[0]) : undefined;
    const paneId = tab ? Layout.leaves(tab.layout)[0] : undefined;
    return (paneId !== undefined ? this.model.getPane(paneId)?.cwd : undefined) ?? ws.cwd;
  }

  /**
   * 追従の見直しで、`cwd` の自動の名前を決める（`GitInfoPoller` が git と並べて呼ぶ。design D2・D3・D5）。無い・付けた名前・`cwd` で決め済みなら
   * fs に問い合わせず null。名前変更の世代は進めない（待つ前の世代を持ち帰り、`applyWorkspaceIdentity` が同じときだけ入れる——名前変更が勝つ）。
   */
  async followedLabel(id: WorkspaceId, cwd: string): Promise<FollowedLabel | null> {
    const ws = this.model.getWorkspace(id);
    const decided = this.labelCwd.get(id);
    if (!ws || !ws.autoLabel || decided === cwd) return null;
    const gen = this.labelGen.get(id) ?? 0;
    // 同じディレクトリの別の書き方（リンクを含む論理パスと、監視が入れる実パス）なら決め直さず、いまの名前のまま場所だけ記録する
    // （review ラウンド 1。`cd` していないのに名前が実パスのフォルダ名に変わらない）。
    if (decided !== undefined && (await this.sameDir(decided, cwd))) return { label: ws.label, gen, degraded: false };
    const { label, degraded } = await this.autoLabelFor(cwd);
    return { label, gen, degraded };
  }

  /**
   * 追従の見直しの結果を、**同じ場所の結果として**まとめて入れる（design D2。herdr の `apply_workspace_git_statuses`）。いまの場所が `cwd` と違えば
   * 名前も git も捨てる（新しい場所の見直しが別に走る）。名前は自動のままで世代が同じときだけ入れる。変わったら `workspace.updated` を 1 回。
   */
  applyWorkspaceIdentity(id: WorkspaceId, cwd: string, git: GitInfo | null, label: FollowedLabel | null): void {
    const ws = this.model.getWorkspace(id);
    if (!ws || this.identityCwdOf(id) !== cwd) return;
    let updated: Workspace | null = null;
    if (label && ws.autoLabel && (this.labelGen.get(id) ?? 0) === label.gen) {
      if (label.degraded) this.labelCwd.delete(id);
      else this.labelCwd.set(id, cwd);
      if (label.label !== ws.label) {
        updated = this.model.renameWorkspace(id, label.label, true);
        this.persist.touch();
      }
    }
    if (!sameGit(ws.git, git)) updated = this.model.updateWorkspaceGit(id, git);
    if (updated) this.bus.publish({ event: "workspace.updated", data: { workspace: updated } });
  }

  /**
   * リンクを解決して同じディレクトリか。解決できない・上限を超えた・fs が詰まっている間は false（決め直す側に倒す）。上限を超えたら名前を決める
   * 問い合わせと同じく数える（`onTimeout`——返るまで fs に問い合わせない。T7 の点検）。
   */
  private async sameDir(a: string, b: string): Promise<boolean> {
    const deps = this.workspaceLabelDeps;
    const resolve = deps.realpath;
    if (!resolve || this.labelLookupsStuck > 0) return false;
    const [ra, rb] = await Promise.all([a, b].map((p) => withTimeout(() => resolve(p), deps.timeoutMs ?? AUTO_LABEL_TIMEOUT_MS, deps.onTimeout)));
    return ra != null && ra === rb;
  }

  /** 閉じた workspace の名前の帳簿を消す。 */
  private forgetWorkspace(id: WorkspaceId): void {
    this.labelGen.delete(id);
    this.labelCwd.delete(id);
  }

  /**
   * 名前を付ける（文字列）か、自動の名前に戻す（null・空白だけ。20260921-workspace-auto-label の design D5・D10）。**要求の時点で workspace が
   * 無ければ `RpcError("not_found")` で拒否する**（待つ前に確かめる）。自動の名前は最初の pane のいまの場所（`identityCwdOf`）から決め直し、待っている間に別の名前変更が来たら
   * そちらが勝つ（design D9）。待っている間に workspace が閉じられたら何もしない（保存も予約しない）。
   */
  async renameWorkspace(id: WorkspaceId, label: string | null): Promise<void> {
    this.requireWorkspace(id);
    const gen = (this.labelGen.get(id) ?? 0) + 1;
    this.labelGen.set(id, gen);
    if (label?.trim()) {
      this.labelCwd.delete(id);
      this.commitRename(id, label, false);
      return;
    }
    // 自動の名前は最初の pane のいまの場所から決める（20260926-workspace-label-follow-cwd の AC7）。待つ間に場所が変わったら新しい場所で決め直す
    // ——古い場所の名前で、追従の見直しが入れた新しい場所の名前を上書きしない（AC6）。決まらなければ名前は入れず、自動の印だけ立てて見直しに任せる。
    for (let attempt = 0; attempt < RENAME_FOLLOW_ATTEMPTS; attempt++) {
      const cwd = this.identityCwdOf(id);
      if (cwd === undefined) return;
      const named = await this.autoLabelFor(cwd);
      if (this.labelGen.get(id) !== gen || !this.model.getWorkspace(id)) return;
      if (this.identityCwdOf(id) !== cwd) continue;
      if (named.degraded) this.labelCwd.delete(id);
      else this.labelCwd.set(id, cwd);
      this.commitRename(id, named.label, true);
      return;
    }
    this.labelCwd.delete(id);
    this.commitRename(id, this.requireWorkspace(id).label, true);
  }

  private commitRename(id: WorkspaceId, label: string, autoLabel: boolean): void {
    const updated = this.model.renameWorkspace(id, label, autoLabel);
    this.bus.publish({ event: "workspace.updated", data: { workspace: updated } });
    this.persist.touch();
  }

  focusWorkspace(id: WorkspaceId): void {
    this.model.focusWorkspace(id);
    this.bus.publish({ event: "session.focus_changed", data: { focus: this.model.getFocus() } });
    this.persist.touch(); // focus は session.json に永続化される（レビュー指摘：抜けていた）
  }

  /**
   * `closeLinkedWorktrees`（20260923-workspace-grouping。herdr の `close_group` 相当）：true かつ
   * `id` が worktree 自動グループの本体なら、束ねられた worktree も連鎖して閉じる。対象を
   * **モデルを書き換える前に**問い合わせる（`linkedWorktreeGroupMembers` は副作用なし）——
   * 本体を先に閉じてから子を探すと git 情報の手掛かりが失われる。それぞれの workspace は
   * 既存の1件ずつのクローズ処理をそのまま繰り返す（design には無いエッジケース。
   * 複数 workspace の確認は client 側の `confirmClose` が既に同じ形でループしている）。
   */
  async closeWorkspace(id: WorkspaceId, closeLinkedWorktrees = false): Promise<void> {
    const targets = closeLinkedWorktrees ? [id, ...this.model.linkedWorktreeGroupMembers(id)] : [id];
    for (const targetId of targets) await this.closeWorkspaceOne(targetId);
    await this.recreateIfEmpty(); // D24
  }

  /**
   * `pane.closed` を発行する（20260925-pane-replace-focus-hint）。`successorPaneId` が
   * `undefined` のときはキー自体を含めない——`exactOptionalPropertyTypes` の下で
   * `{ successorPaneId: undefined }` は型エラーになり、かつ「キーが無い」と「値が
   * undefined」は `toEqual` 等では区別できないため、実際に省く形にしておく必要がある。
   */
  private publishPaneClosed(paneId: PaneId, successorPaneId: PaneId | undefined): void {
    this.resumeWrittenAt.delete(paneId); // 20260926-agent-start の review ラウンド 1（閉じた pane の記録を残さない）
    const editor = this.scrollbackEditors.get(paneId);
    if (editor) {
      this.scrollbackEditors.delete(paneId);
      const cleanup = this.removeScrollbackDirQuietly(editor.dir).finally(() => this.scrollbackCleanups.delete(cleanup));
      this.scrollbackCleanups.add(cleanup);
    }
    this.bus.publish({ event: "pane.closed", data: successorPaneId === undefined ? { paneId } : { paneId, successorPaneId } });
  }

  private async closeWorkspaceOne(id: WorkspaceId): Promise<void> {
    const result = this.model.closeWorkspace(id);
    for (const paneId of result.removedPaneIds) this.terminals.dispose(paneId);
    // design「連鎖して閉じるときは pane.closed → tab.closed → workspace.closed の順」（D42 で漏れを修正）。
    // successorPaneId（20260925-pane-replace-focus-hint）: closeWorkspace 由来では常に undefined
    // （RemovalResult に設定されない）ので、既存どおりフィールドが現れないまま発行される。
    for (const paneId of result.removedPaneIds) this.publishPaneClosed(paneId, result.successorPaneId);
    for (const tabId of result.removedTabIds) this.bus.publish({ event: "tab.closed", data: { tabId } });
    this.bus.publish({ event: "workspace.closed", data: { workspaceId: id } });
    this.forgetWorkspace(id);
    this.persist.touch();
  }

  // --- workspace の並べ替えとグループ（20260923-workspace-grouping） ----------------------

  /** `workspace.move`。無変化（`model.moveWorkspace` が null）なら何も配布しない
   *  （`moveTab` と同じ形。design「エラー処理 / 異常系」）。動いた全順序を
   *  `workspace.order_changed` で配る（decisions.md D5：個々の Workspace は変わらないため）。 */
  moveWorkspace(id: WorkspaceId, direction: "previous" | "next"): void {
    const updated = this.model.moveWorkspace(id, direction);
    if (updated) {
      this.bus.publish({ event: "workspace.order_changed", data: { workspaceIds: updated.map((w) => w.id) } });
      this.persist.touch();
    }
  }

  /** `workspace.move_to`（D&D。単一・グループ一括の両方を同じ経路で扱う）。 */
  moveWorkspacesTo(workspaceIds: WorkspaceId[], beforeWorkspaceId: WorkspaceId | null): void {
    const updated = this.model.moveWorkspacesTo(workspaceIds, beforeWorkspaceId);
    if (updated) {
      this.bus.publish({ event: "workspace.order_changed", data: { workspaceIds: updated.map((w) => w.id) } });
      this.persist.touch();
    }
  }

  createGroup(label: string): WorkspaceGroup {
    const group = this.model.createGroup(label);
    this.bus.publish({ event: "group.created", data: { group } });
    this.persist.touch();
    return group;
  }

  renameGroup(id: GroupId, label: string): void {
    const group = this.model.renameGroup(id, label);
    this.bus.publish({ event: "group.updated", data: { group } });
    this.persist.touch();
  }

  toggleGroupCollapsed(id: GroupId): void {
    const group = this.model.toggleGroupCollapsed(id);
    this.bus.publish({ event: "group.updated", data: { group } });
    this.persist.touch();
  }

  /** メンバーの `groupId` が null に戻る（`SessionModel.deleteGroup`）ので、それぞれ
   *  `workspace.updated` で知らせる——**削除する前に**対象を控える（削除後は `groupId` が
   *  既に外れていて探せない）。 */
  deleteGroup(id: GroupId): void {
    const members = this.model.listWorkspaces().filter((w) => w.groupId === id);
    this.model.deleteGroup(id);
    this.bus.publish({ event: "group.deleted", data: { groupId: id } });
    for (const ws of members) {
      const updated = this.model.getWorkspace(ws.id);
      if (updated) this.bus.publish({ event: "workspace.updated", data: { workspace: updated } });
    }
    this.persist.touch();
  }

  addToGroup(workspaceId: WorkspaceId, groupId: GroupId): void {
    const updated = this.model.addToGroup(workspaceId, groupId);
    this.bus.publish({ event: "workspace.updated", data: { workspace: updated } });
    this.persist.touch();
  }

  removeFromGroup(workspaceId: WorkspaceId): void {
    const updated = this.model.removeFromGroup(workspaceId);
    this.bus.publish({ event: "workspace.updated", data: { workspace: updated } });
    this.persist.touch();
  }

  // --- tab --------------------------------------------------------------------

  async createTab(
    workspaceId: WorkspaceId | undefined,
    label: string | undefined,
    newCwd?: NewCwd,
  ): Promise<{ tab: Tab; pane: Pane; cwdFallback?: true }> {
    const wsId = workspaceId ?? this.model.getFocus()?.workspaceId;
    if (!wsId) throw new RpcError("not_found", "no workspace to create a tab in");
    const ws = this.requireWorkspace(wsId);
    // 1 段目の代わりは workspace の場所（以前と同じ）。**`Workspace.cwd` は書き換えない**（git の情報と worktree が使う）。
    const pending = this.placeFor(newCwd, followSource(newCwd), ws.cwd);
    const place = pending instanceof Promise ? await pending : pending;
    // 新しい pane の記録（`Pane.cwd`）も決めた場所にする——起動の場所と記録を食い違わせない（design「振る舞いの詳細」）。
    const reserved = this.model.reserveTab(ws.id, label, { cwd: place.cwd, shell: this.shell ?? "", cols: HEADLESS_COLS, rows: HEADLESS_ROWS });
    const spawn = await this.spawnForPane(reserved.pane.id, place.cwd);
    if (!spawn.ok) {
      throw new RpcError("spawn_failed", `failed to start a shell for tab ${reserved.tab.id}`);
    }
    try {
      this.model.commitTab(reserved); // 猶予中に workspace 自体が閉じられていたら NotFoundError
    } catch (err) {
      this.terminals.dispose(reserved.pane.id); // 孤児化した PTY を破棄してから伝える
      throw err;
    }
    this.bus.publish({ event: "tab.created", data: { tab: reserved.tab } });
    this.bus.publish({ event: "pane.created", data: { pane: reserved.pane } });
    // `commitTab` は workspace の `tabIds`/`activeTabId` も更新する（`SessionModel.commitTab`）が、
    // それを知らせる `workspace.updated` が無かった——サイドバー・tab バー等、`workspace.tabIds` を
    // 読む側（`TabBar.vue` 等）が新しい tab を認識できないまま止まっていた（同上・D88）。
    const updatedWs = this.model.getWorkspace(ws.id);
    if (updatedWs) this.bus.publish({ event: "workspace.updated", data: { workspace: updatedWs } });
    this.persist.touch();
    if (spawn.alreadyExited) await this.closePaneAfterExit(reserved.pane.id, 0);
    return { tab: reserved.tab, pane: reserved.pane, ...(place.fellBack ? { cwdFallback: true as const } : {}) };
  }

  renameTab(id: TabId, label: string): void {
    const tab = this.model.renameTab(id, label);
    this.bus.publish({ event: "tab.updated", data: { tab } });
    this.persist.touch();
  }

  focusTab(id: TabId): void {
    this.model.focusTab(id);
    this.bus.publish({ event: "session.focus_changed", data: { focus: this.model.getFocus() } });
    this.persist.touch();
  }

  /** `tab.move`（20260923-missing-keybinding-actions）。tabIds.length<=1 等で無変化なら `model.moveTab` が
   * `null` を返し、`workspace.updated` を発行しない（design「エラー処理 / 異常系」）。 */
  moveTab(id: TabId, direction: "previous" | "next"): void {
    const updated = this.model.moveTab(id, direction);
    if (updated) {
      this.bus.publish({ event: "workspace.updated", data: { workspace: updated } });
      this.persist.touch();
    }
  }

  async closeTab(id: TabId): Promise<void> {
    const workspaceId = this.requireTab(id).workspaceId; // tab が消える前に控える（下の workspace.updated 用。D88）
    const result = this.model.closeTab(id);
    for (const paneId of result.removedPaneIds) this.terminals.dispose(paneId);
    // design「連鎖して閉じるときは pane.closed → tab.closed → workspace.closed の順」（D42 で漏れを修正）。
    // successorPaneId（20260925-pane-replace-focus-hint）: closeTab 由来では常に undefined。
    for (const paneId of result.removedPaneIds) this.publishPaneClosed(paneId, result.successorPaneId);
    for (const tabId of result.removedTabIds) this.bus.publish({ event: "tab.closed", data: { tabId } });
    if (result.closedWorkspaceId) {
      this.bus.publish({ event: "workspace.closed", data: { workspaceId: result.closedWorkspaceId } });
      this.forgetWorkspace(result.closedWorkspaceId);
    } else {
      // workspace 自体は生き残った＝`model.closeTab` が `tabIds`/`activeTabId` を更新している
      // （`SessionModel.closeTabInternal`）。その変化を知らせる（D88。上の createTab と対）。
      const updatedWs = this.model.getWorkspace(workspaceId);
      if (updatedWs) this.bus.publish({ event: "workspace.updated", data: { workspace: updatedWs } });
    }
    this.persist.touch();
    await this.recreateIfEmpty(); // D24
  }

  // --- pane -------------------------------------------------------------------

  async splitPane(
    paneId: PaneId,
    direction: SplitDirection,
    ratio: number | undefined,
    newCwd?: NewCwd,
  ): Promise<{ pane: Pane; cwdFallback?: true }> {
    const source = this.requirePane(paneId);
    // 「引き継ぐ」の元は分割する pane そのもの。1 段目の代わりはその記録された場所（以前と同じ）。
    const pending = this.placeFor(newCwd, paneId, source.cwd);
    const place = pending instanceof Promise ? await pending : pending;
    // 場所を決める間（await の間）に分割元が閉じられていたら、シェルを起動する前に失敗する（`createTab` は `reserveTab` で確かめ直す）。
    this.requirePane(paneId);
    const newPaneId = this.model.reserveNextPaneId();
    const spawn = await this.spawnForPane(newPaneId, place.cwd);
    if (!spawn.ok) throw new RpcError("spawn_failed", `failed to start a shell for a new pane split from ${paneId}`);
    let pane: Pane;
    try {
      // 猶予中（await の間）に分割元の pane/tab が別の RPC で閉じられていたら、ここで NotFoundError
      // （`requirePane`/`requireTab`）。その場合は孤児化した PTY を破棄してから伝える
      // （`createTab` の `commitTab` 失敗時と同じ理由・同じ形。レビュー指摘・round2）。
      ({ pane } = this.model.splitPane(paneId, direction, ratio, newPaneId, { cwd: place.cwd, shell: this.shell ?? "", cols: source.cols, rows: source.rows }));
    } catch (err) {
      this.terminals.dispose(newPaneId);
      throw err;
    }
    this.bus.publish({ event: "pane.created", data: { pane } });
    this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(source.tabId) } });
    this.persist.touch();
    if (spawn.alreadyExited) await this.closePaneAfterExit(pane.id, 0);
    return { pane, ...(place.fellBack ? { cwdFallback: true as const } : {}) };
  }

  /**
   * スクロールバックを `$EDITOR` で開く（20260926-edit-scrollback。herdr の `pane.edit_scrollback`）。対象の pane を分割した新しい pane で
   * エディタを起動して拡大表示にする。閉じたときの焦点・拡大表示の復帰と一時ディレクトリの削除は `closePane`・`publishPaneClosed`。
   */
  async editScrollback(paneId: PaneId): Promise<{ pane: Pane }> {
    const source = this.requirePane(paneId);
    const host = this.terminals.get(paneId);
    if (!host) throw new RpcError("not_found", `pane has no terminal: ${paneId}`);
    const { tmpRoot, platform, env } = this.scrollbackEditorEnv;
    if (scrollbackEditorArgv("", platform, env) === null) throw new RpcError("spawn_failed", "no editor: set VISUAL or EDITOR for the server");
    const previousZoomedPaneId = this.requireTab(source.tabId).zoomedPaneId;
    const { dir, path } = await writeScrollbackFile(host.mirror.plainText(), tmpRoot);
    let committed = false;
    try {
      const current = this.requirePane(paneId); // 書いている間に閉じられていないか
      const argv = scrollbackEditorArgv(path, platform, env)!;
      const newPaneId = this.model.reserveNextPaneId();
      const spawn = await this.spawnForPane(newPaneId, current.cwd, { shell: argv[0]!, args: argv.slice(1) });
      if (!spawn.ok) throw new RpcError("spawn_failed", `failed to start an editor for the scrollback of ${paneId}`);
      let pane: Pane;
      try {
        ({ pane } = this.model.splitPane(paneId, "right", undefined, newPaneId, { cwd: current.cwd, shell: argv[0]!, cols: current.cols, rows: current.rows }));
        this.model.zoomPane(newPaneId, "on");
      } catch (err) {
        this.terminals.dispose(newPaneId);
        throw err;
      }
      this.scrollbackEditors.set(newPaneId, { sourcePaneId: paneId, previousZoomedPaneId, dir });
      committed = true;
      this.bus.publish({ event: "pane.created", data: { pane } });
      this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(pane.tabId) } });
      this.persist.touch();
      if (spawn.alreadyExited) await this.closePaneAfterExit(pane.id, 0);
      return { pane };
    } finally {
      if (!committed) await this.removeScrollbackDirQuietly(dir);
    }
  }

  /** 停止時（`composeServer.close`）: 開いたままのエディタの一時ディレクトリと、削除の途中のものを待って消す。 */
  async disposeScrollbackEditors(): Promise<void> {
    const dirs = [...this.scrollbackEditors.values()].map((e) => e.dir);
    this.scrollbackEditors.clear();
    await Promise.all([...dirs.map((d) => this.removeScrollbackDirQuietly(d)), ...this.scrollbackCleanups]);
  }

  private async removeScrollbackDirQuietly(dir: string): Promise<void> {
    try {
      await removeScrollbackDir(dir);
    } catch (err) {
      this.logger.warn("failed to remove a scrollback temp dir", { dir, error: String(err) });
    }
  }

  async closePane(paneId: PaneId): Promise<void> {
    const pane = this.model.getPane(paneId);
    const tabId = pane?.tabId;
    const workspaceId = tabId ? this.model.getTab(tabId)?.workspaceId : undefined; // tab が消える前に控える（D88）
    const editor = this.scrollbackEditors.get(paneId);
    const result = this.model.closePane(paneId, editor?.sourcePaneId);
    // エディタの pane なら、開く前の拡大表示に戻す（焦点は上の後継の希望で戻る。20260926-edit-scrollback）
    const zoomBack = editor?.previousZoomedPaneId;
    if (zoomBack && result.removedTabIds.length === 0 && this.model.getPane(zoomBack)?.tabId === tabId) this.model.zoomPane(zoomBack, "on");
    for (const pid of result.removedPaneIds) this.terminals.dispose(pid);
    // successorPaneId（20260925-pane-replace-focus-hint）: closePane 由来ではエディタの pane の元の pane だけ（20260926-edit-scrollback）。
    for (const pid of result.removedPaneIds) this.publishPaneClosed(pid, result.successorPaneId);
    for (const tid of result.removedTabIds) this.bus.publish({ event: "tab.closed", data: { tabId: tid } });
    if (result.closedWorkspaceId) {
      this.bus.publish({ event: "workspace.closed", data: { workspaceId: result.closedWorkspaceId } });
      this.forgetWorkspace(result.closedWorkspaceId);
    } else if (result.removedTabIds.length > 0 && workspaceId) {
      // pane を閉じた結果、tab ごと連鎖して閉じたが workspace は生き残った（D18 の連鎖・closeTab と同じ形。D88）。
      const updatedWs = this.model.getWorkspace(workspaceId);
      if (updatedWs) this.bus.publish({ event: "workspace.updated", data: { workspace: updatedWs } });
    }
    if (result.removedTabIds.length === 0 && tabId) {
      // tab は生きているので、レイアウトが変わったことを知らせる。
      const stillThere = this.model.getTab(tabId);
      if (stillThere) this.bus.publish({ event: "layout.updated", data: { tab: stillThere } });
    }
    this.persist.touch();
    await this.recreateIfEmpty(); // D24
  }

  focusPane(paneId: PaneId): void {
    this.model.focusPane(paneId);
    this.bus.publish({ event: "session.focus_changed", data: { focus: this.model.getFocus() } });
    this.persist.touch();
  }

  renamePane(id: PaneId, label: string | null): void {
    const pane = this.model.renamePane(id, label);
    this.bus.publish({ event: "pane.updated", data: { pane } });
    this.persist.touch();
  }

  setPaneRightClick(id: PaneId, target: RightClickTarget): void {
    this.model.setRightClick(id, target);
    this.bus.publish({ event: "pane.updated", data: { pane: this.requirePane(id) } });
  }

  focusPaneDirection(paneId: PaneId, direction: Dir): PaneId {
    const target = this.model.focusDirection(paneId, direction);
    this.bus.publish({ event: "session.focus_changed", data: { focus: this.model.getFocus() } });
    this.persist.touch();
    return target;
  }

  swapPane(paneId: PaneId, direction: Dir): PaneId {
    const other = this.model.swapPane(paneId, direction);
    if (other !== paneId) {
      const pane = this.requirePane(paneId);
      this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(pane.tabId) } });
      this.persist.touch();
    }
    return other;
  }

  /** 任意の2つの pane を入れ替える（20260923-pane-name-dnd-swap。design「3. サーバ側」）。 */
  swapPaneWith(paneId: PaneId, otherPaneId: PaneId): boolean {
    const ok = this.model.swapPaneWith(paneId, otherPaneId);
    if (ok) {
      const pane = this.requirePane(paneId);
      this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(pane.tabId) } });
      this.persist.touch();
    }
    return ok;
  }

  /**
   * 名前ラベルのドラッグを pane の縁へドロップしての分割（20260924-pane-dnd-split-move。
   * `swapPaneWith` と同じ形——レイアウトだけを書き換え、`layout.updated` を1回配布する）。
   */
  moveToEdge(paneId: PaneId, targetPaneId: PaneId, edge: "top" | "bottom" | "left" | "right"): boolean {
    const ok = this.model.moveToEdge(paneId, targetPaneId, edge);
    if (ok) {
      const pane = this.requirePane(paneId);
      this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(pane.tabId) } });
      this.persist.touch();
    }
    return ok;
  }

  /**
   * 名前ラベルのドラッグを pane の中央へドロップしての分割解除（20260924-pane-dnd-split-move。
   * design「振る舞いの詳細 > サーバ側」。`targetPaneId` のプロセスを実際に終了させる点は
   * `closePane` と同じ経路——ただし `replacePane` は要求した pane（`paneId`）自身が必ず生き残るため、
   * `closePane` のような tab/workspace の連鎖的な消滅・`recreateIfEmpty`（D24）は起こりえない。
   */
  replacePane(paneId: PaneId, targetPaneId: PaneId): boolean {
    const pane = this.requirePane(paneId);
    const result = this.model.replacePane(paneId, targetPaneId);
    if (!result) return false;
    for (const pid of result.removedPaneIds) this.terminals.dispose(pid);
    // successorPaneId（20260925-pane-replace-focus-hint）: 生存した pane（paneId）を後継の
    // ヒントとして届ける。design「振る舞いの詳細」。
    for (const pid of result.removedPaneIds) this.publishPaneClosed(pid, result.successorPaneId);
    this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(pane.tabId) } });
    this.persist.touch();
    return true;
  }

  /**
   * 名前ラベルのドラッグを tab バーの既存の tab へドロップしての移動（20260924-pane-move-cross-tab。
   * design「振る舞いの詳細 > 複数クライアントでの同期」）。移動元 tab が空になれば
   * `SessionModel.moveToTab` 内部で自動的に閉じる（`closeEmptyTabShell`。research.md R1）。
   * イベントの順序・集合は `closeTab`/`closePane`（D88）と同じ考え方——`pane.updated` だけが
   * この操作に固有（decisions.md D3。移動した pane 自身の `tabId` 変化を運ぶ）。
   */
  moveToTab(paneId: PaneId, targetTabId: TabId): boolean {
    const sourceTabId = this.requirePane(paneId).tabId;
    const sourceWorkspaceId = this.requireTab(sourceTabId).workspaceId;
    const ok = this.model.moveToTab(paneId, targetTabId);
    if (!ok) return false;
    this.bus.publish({ event: "pane.updated", data: { pane: this.requirePane(paneId) } });
    const sourceTab = this.model.getTab(sourceTabId);
    if (sourceTab) {
      this.bus.publish({ event: "layout.updated", data: { tab: sourceTab } });
    } else {
      this.bus.publish({ event: "tab.closed", data: { tabId: sourceTabId } });
      const sourceWs = this.model.getWorkspace(sourceWorkspaceId);
      if (sourceWs) {
        this.bus.publish({ event: "workspace.updated", data: { workspace: sourceWs } });
      } else {
        this.bus.publish({ event: "workspace.closed", data: { workspaceId: sourceWorkspaceId } });
        this.forgetWorkspace(sourceWorkspaceId);
      }
    }
    this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(targetTabId) } });
    this.persist.touch();
    return true;
  }

  /**
   * 名前ラベルのドラッグをサイドバーの workspace 行へドロップしての移動（20260924-pane-move-cross-tab。
   * design「振る舞いの詳細 > 複数クライアントでの同期」）。移動元側の後始末は `moveToTab` と同じ。
   */
  moveToNewTab(paneId: PaneId, targetWorkspaceId: WorkspaceId): Tab | null {
    const sourceTabId = this.requirePane(paneId).tabId;
    const sourceWorkspaceId = this.requireTab(sourceTabId).workspaceId;
    const result = this.model.moveToNewTab(paneId, targetWorkspaceId);
    if (!result) return null;
    this.bus.publish({ event: "pane.updated", data: { pane: this.requirePane(paneId) } });
    this.bus.publish({ event: "tab.created", data: { tab: result.tab } });
    this.bus.publish({ event: "workspace.updated", data: { workspace: this.requireWorkspace(targetWorkspaceId) } });
    const sourceTab = this.model.getTab(sourceTabId);
    if (sourceTab) {
      this.bus.publish({ event: "layout.updated", data: { tab: sourceTab } });
    } else {
      this.bus.publish({ event: "tab.closed", data: { tabId: sourceTabId } });
      const sourceWs = this.model.getWorkspace(sourceWorkspaceId);
      if (sourceWs) {
        // 移動元と移動先が同じ workspace なら、直前の `workspace.updated`（移動先向け）が
        // 既に最終状態（新しい tab が入り、空になった移動元 tab が除かれた後の `tabIds`）を
        // 運んでいる——二重に同じ内容を発行しない。
        if (sourceWorkspaceId !== targetWorkspaceId) {
          this.bus.publish({ event: "workspace.updated", data: { workspace: sourceWs } });
        }
      } else {
        this.bus.publish({ event: "workspace.closed", data: { workspaceId: sourceWorkspaceId } });
        this.forgetWorkspace(sourceWorkspaceId);
      }
    }
    this.persist.touch();
    return result.tab;
  }

  zoomPane(paneId: PaneId, mode: "toggle" | "on" | "off"): void {
    const pane = this.requirePane(paneId);
    this.model.zoomPane(paneId, mode);
    this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(pane.tabId) } });
    this.persist.touch();
  }

  resizePaneByDirection(paneId: PaneId, direction: Dir, amount: number): void {
    const pane = this.requirePane(paneId);
    this.model.resizeByDirection(paneId, direction, amount);
    this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(pane.tabId) } });
    this.persist.touch();
  }

  setSplitRatio(tabId: TabId, splitId: SplitId, ratio: number): void {
    this.model.setSplitRatio(tabId, splitId, ratio);
    this.bus.publish({ event: "layout.updated", data: { tab: this.requireTab(tabId) } });
    this.persist.touch();
  }

  /** サイズ権限（`SizeAuthority`。T18）が決めたサイズを、PTY・ミラー・モデルへ反映する。 */
  resizePane(paneId: PaneId, cols: number, rows: number): void {
    const pane = this.model.getPane(paneId);
    if (!pane) return;
    if (pane.cols === cols && pane.rows === rows) return;
    this.model.setPaneSize(paneId, cols, rows);
    this.terminals.resize(paneId, cols, rows);
    this.bus.publish({ event: "pane.size_changed", data: { paneId, cols, rows } });
  }

  updatePaneRuntime(paneId: PaneId, patch: PaneRuntimePatch): void {
    const pane = this.model.getPane(paneId);
    if (!pane) return;
    // 値が実際に変わったときだけ発行する（レビュー指摘：以前は busy/title が「渡されただけ」で毎回
    // 発行していたため、AgentMonitor の周期呼び出し（500ms〜1s毎）のたびに変化が無くても全クライアントへ
    // ブロードキャストしていた）。
    const busyChanged = patch.busy !== undefined && patch.busy !== pane.busy;
    const titleChanged = patch.title !== undefined && patch.title !== pane.title;
    const cwdChanged = patch.cwd !== undefined && patch.cwd !== pane.cwd;
    // agent も同様に、公開している AgentInfo の中身が実際に変わったときだけ発行する（review 指摘。should）。
    // `AgentTracker.update()` は herdr 由来のヒステリシス（D46・D50）の都合で、visibleIdle/visibleBlocker/
    // visibleWorking だけが変わって state 等は同じ、という新しい `AgentInfo` オブジェクトを返すことがある
    // （その3フラグは `AgentInfo`（`@wtm/protocol`）には含まれない、判定内部だけの情報）。busy/title と
    // 同じ「実際に変わったときだけ発行する」規約に揃える。
    // 名前は AgentTracker が知らないので、同じ検出（instanceId）の間だけ前の名前を引き継ぐ（20260926-agent-start-rename design
    // 「名前の引き継ぎ」）。別の instanceId（入れ替わり）・null（終了）には引き継がない＝名前は消える。
    // 起動中の予約のある pane に新しい検出が来たら予約を終え、種類が合えば予約の名前を付ける（20260926-agent-start）。
    // 付ける名前は予約（受け付け時に assertAgentNameAvailable を通った値）から来る。下の引き継ぎは同じ instanceId のときだけなので上書きしない。
    if (patch.agent) this.resumeWrittenAt.delete(paneId);
    const launch = this.agentLaunches.get(paneId);
    if (launch && patch.agent && patch.agent.instanceId !== pane.agent?.instanceId) {
      this.agentLaunches.delete(paneId);
      if (patch.agent.kind === launch.kind && this.agentNameHolder(launch.name, paneId) === null) {
        patch = { ...patch, agent: { ...patch.agent, name: launch.name } };
      }
    }
    if (patch.agent && patch.agent.name === undefined && pane.agent?.name !== undefined && pane.agent.instanceId === patch.agent.instanceId) {
      patch = { ...patch, agent: { ...patch.agent, name: pane.agent.name } };
    }
    const agentChanged = patch.agent !== undefined && !sameAgent(pane.agent, patch.agent);
    // 画面判定でエージェントが消えたら（非 null → null）、報告されていた会話参照も一緒に捨てる
    // （20260923-agent-session-resume design D9）。エージェントを終了して別の作業をしている pane が、
    // 次のサーバ再起動で勝手に古い会話を再開してしまう事故を防ぐ。
    const clearsAgentSession = patch.agent === null && pane.agent !== null && pane.agentSession !== null;
    const fullPatch = clearsAgentSession ? { ...patch, agentSession: null } : patch;
    const updated = this.model.updatePaneRuntime(paneId, fullPatch);
    if (agentChanged) {
      this.bus.publish({ event: "pane.agent_status_changed", data: { paneId, agent: updated.agent } });
    }
    if (busyChanged || titleChanged || cwdChanged) {
      this.bus.publish({ event: "pane.updated", data: { pane: updated } });
    }
    // 会話参照の消滅も保存契機にする（design D8）——さもないと、サーバが不意に落ちたときに
    // 「もう有効ではない」という事実が session.json に反映されないまま残ることがある。
    if (cwdChanged || clearsAgentSession) this.persist.touch();
  }

  /**
   * エージェントに名前を付ける／外す（null）（20260926-agent-start-rename。herdr の `rename_agent_target`）。失敗は何も変えない。
   * 引き継ぎの規則が `null` を打ち消さないよう、`updatePaneRuntime` を通さずモデルへ直接書く。名前は保存しない。
   */
  renameAgent(paneId: PaneId, expectedInstanceId: string | undefined, name: string | null): AgentInfo {
    const pane = this.model.getPane(paneId);
    if (!pane) throw new RpcError("agent_not_found", `pane not found: ${paneId}`);
    const agent = pane.agent;
    if (!agent) throw new RpcError("agent_not_found", `no agent detected in pane: ${paneId}`);
    if (expectedInstanceId !== undefined && agent.instanceId !== expectedInstanceId) {
      throw new RpcError("agent_not_found", `agent ${expectedInstanceId} is no longer running in pane: ${paneId}`);
    }
    if (name !== null) this.assertAgentNameAvailable(name, paneId);
    const next: AgentInfo = { ...agent };
    if (name === null) delete next.name;
    else next.name = name;
    if (sameAgent(agent, next)) return agent;
    const updated = this.model.updatePaneRuntime(paneId, { agent: next });
    this.bus.publish({ event: "pane.agent_status_changed", data: { paneId, agent: updated.agent } });
    return next;
  }

  /** 名前の書式と一意性（live なエージェントの名前・起動中の予約。`exceptPaneId` の pane は除く）。外れれば RpcError。 */
  assertAgentNameAvailable(name: string, exceptPaneId: PaneId | null): void {
    if (!isValidAgentName(name)) throw new RpcError("invalid_agent_name", INVALID_AGENT_NAME_MESSAGE);
    const holder = this.agentNameHolder(name, exceptPaneId);
    if (holder !== null) throw new RpcError("agent_name_taken", `agent name ${name} is already used by pane ${holder}`);
  }

  /** その名前を live なエージェントか起動中の予約で使っている、今も存在する他の pane（書式は見ない）。 */
  private agentNameHolder(name: string, exceptPaneId: PaneId | null): PaneId | null {
    for (const p of this.model.listPanes()) {
      if (p.id === exceptPaneId) continue;
      if (p.agent?.name === name || this.agentLaunches.get(p.id)?.name === name) return p.id;
    }
    return null;
  }

  /** `agent start` の起動中の予約を作る（20260926-agent-start）。戻り値は `endAgentLaunch` に渡す印。 */
  beginAgentLaunch(paneId: PaneId, name: string, kind: string): number {
    if (this.agentLaunches.has(paneId)) throw new RpcError("agent_pane_busy", `agent target pane ${paneId} is not an available shell`);
    this.assertAgentNameAvailable(name, null);
    const token = this.nextAgentLaunchToken++;
    this.agentLaunches.set(paneId, { token, name, kind });
    return token;
  }

  /** 印が一致するときだけ予約を解く（締め切り・書き込みの失敗）。検出で先に終わっていれば何もしない。 */
  endAgentLaunch(paneId: PaneId, token: number): void {
    if (this.agentLaunches.get(paneId)?.token === token) this.agentLaunches.delete(paneId);
  }

  hasAgentLaunch(paneId: PaneId): boolean {
    return this.agentLaunches.has(paneId);
  }

  updateWorkspaceGit(workspaceId: WorkspaceId, git: GitInfo | null): void {
    const ws = this.model.getWorkspace(workspaceId);
    if (!ws) return;
    if (sameGit(ws.git, git)) return;
    const updated = this.model.updateWorkspaceGit(workspaceId, git);
    this.bus.publish({ event: "workspace.updated", data: { workspace: updated } });
  }

  // --- lifecycle: シェルの終了（D18） ----------------------------------------

  /** `pane.exited` を出し、モデルにまだ pane があれば D18 の連鎖（closePane）を起こす。
   *  通常の（猶予後の）終了と、D37 の猶予中に code 0 で即終了した場合の両方から呼ぶ共通処理。
   *  呼び出し側が `await` できる場所（create 系）では待ってから RPC を返し、`wireExit` のような
   *  イベント駆動の呼び出し元は fire-and-forget で `.catch` する。 */
  private async closePaneAfterExit(paneId: PaneId, exitCode: number): Promise<void> {
    this.bus.publish({ event: "pane.exited", data: { paneId, exitCode } });
    const pane = this.model.getPane(paneId);
    if (!pane) return; // 既にモデルから消えている（closePane 等で先に処理済み、またはまだコミット前）
    await this.closePane(paneId);
  }

  private wireExit(paneId: PaneId): void {
    const host = this.terminals.get(paneId);
    // 起動直後の失敗（D37）は spawnForPane 側が別途処理するので、ここでは通常の終了だけを扱う。
    host?.onExit((exitCode) => {
      this.closePaneAfterExit(paneId, exitCode).catch((err: unknown) => {
        // D24 の自動作成が失敗した等、ここで例外を投げても受け取る相手がいない。
        this.logger.error("closePane after exit failed", { paneId, error: String(err) });
      });
    });
  }

  /**
   * pane 起動時に渡す環境変数（20260923-agent-session-resume design「6. フック登録の書式」）。
   * `WTM_PANE_ID`・`WTM_AGENT_REPORT_SOCKET` は、この pane の中で Claude Code/Codex が起動されたときに、
   * hook スクリプトが「どの pane の・どの会話か」を報告するために使う。socket が無い（起動に失敗した等）
   * 環境では `WTM_AGENT_REPORT_SOCKET` を渡さない——hook 側は env が無ければ無害に何もしない。
   * 全 pane に常に付ける（起動時点でその pane が Claude Code/Codex を動かすかは分からないため）。
   * `WTM_SERVER_URL`（20260926-agent-skill-file）は pane の中の wtmctl の既定の接続先で、`WTM_PANE_ID` と合わせて自分の pane への操作の歯止めにも使う。
   * サーバの環境から受け継いだ `WTMCTL_URL`・`WTMCTL_TOKEN` と古い `WTM_*` は渡さない（`buildPaneEnv`）。
   */
  private envForPane(paneId: PaneId): Record<string, string> {
    return buildPaneEnv(process.env, {
      paneId,
      serverUrl: this.serverUrlForPanes(),
      agentReportSocketPath: this.agentReportSocketPath,
      sessionName: this.sessionName,
    });
  }

  /**
   * 公式フック連携（20260923-agent-session-resume）からの報告を反映する。`paneId` が存在しなければ
   * 何もしない（report 経路は best-effort。design「振る舞いの詳細・会話IDの報告受信」）。
   */
  reportAgentSession(paneId: PaneId, kind: AgentIntegrationKind, sessionId: string): void {
    const pane = this.model.getPane(paneId);
    if (!pane) return;
    // `reportedAt` は壁時計の epoch ms（protocol の doc comment）。`this.clock` は復元の期限計測用の
    // 単調時計（`monotonicNow`）なので、ここでは使わない（`AgentInfo.since` と同じ `Date.now()` に揃える）。
    this.model.setAgentSession(paneId, { kind, sessionId, reportedAt: Date.now() });
    this.persist.touch();
  }

  /**
   * pane 用の PTY を起動し、短い猶予（D37）の間に失敗しなかったかを確かめる。
   * 成功のときだけ `onExit` の配線（D18 の連鎖）も済ませる——ただし `alreadyExited` が true
   * （猶予中に code 0 で即終了していた）ときは配線しない。`TerminalHost.onExit` は一度きり・同期発火で
   * リプレイしないため、既に一度発火した終了イベントに対して後から登録した listener は永久に呼ばれず、
   * pane が閉じられないまま残ってしまう（レビュー指摘）。この場合は呼び出し側が、pane をモデルへ
   * コミットした直後に `closePaneAfterExit` を自分で呼ぶ。
   */
  private async spawnForPane(
    paneId: PaneId,
    cwd: string,
    command?: { shell: string; args: string[] },
    seed?: string,
  ): Promise<{ ok: boolean; alreadyExited: boolean }> {
    const host = this.terminals.create(paneId, {
      cwd,
      cols: HEADLESS_COLS,
      rows: HEADLESS_ROWS,
      ...(command ? { shell: command.shell, args: command.args } : this.shell ? { shell: this.shell } : {}),
      env: this.envForPane(paneId),
    });
    // 画面履歴（20260926-screen-history-replay）：`create` と同じ同期区間でミラーへ書く——PTY の出力は非同期のイベントで届くので、
    // 新しいシェルの出力より前に並ぶ（research F6）。復元の間は `/ws` を受け付けないので、購読者は接続時の直列化でこれを受け取る。
    if (seed) host.mirror.write(seed);
    const result = await raceSpawn(host, this.spawnGraceMs);
    if (!result.ok) {
      this.terminals.dispose(paneId);
      return { ok: false, alreadyExited: false };
    }
    if (!result.alreadyExited) this.wireExit(paneId);
    return { ok: true, alreadyExited: result.alreadyExited };
  }

  // --- 起動と再起動後の復元 ----------------------------------------------------

  /** 起動時に呼ぶ：workspace が無ければ 1 つ作る（design「起動と再起動後の復元」）。 */
  async ensureNotEmpty(): Promise<void> {
    if (!this.model.isEmpty()) return;
    await this.createWorkspace(this.defaultCwd, undefined); // 名前を渡さない＝開く場所から自動の名前（20260921-workspace-auto-label）
  }

  /** D24：workspace が 0 個になったら自動で 1 つ作り直す（herdr と異なる意図的な挙動。decisions.md
   *  D24・D36）。PTY の起動を伴うので、この層（SessionService）で実物の workspace を作る。
   *  `closeWorkspace`/`closeTab`/`closePane` の3箇所から同じ形で呼ぶ（レビュー指摘：重複していた）。 */
  private async recreateIfEmpty(): Promise<void> {
    if (this.model.isEmpty()) await this.createWorkspace(this.defaultCwd, undefined); // 自動の名前（同上）
  }

  /**
   * `session.json` から復元する。失敗した pane は閉じずに `status: 'failed'` にする。`opts.paneHistory` があれば（`--pane-history`。
   * 20260926-screen-history-replay）、その pane の保存した画面を新しいシェルより前に流し、区切りの行を足す（会話を再開する pane を除く）。
   */
  async restore(
    data: SessionFileData,
    opts: {
      paneHistory?: ReadonlyMap<string, PaneHistoryEntry> | undefined;
      /** 更新時の引き継ぎ（20260926-live-handoff）で渡された PTY。ある pane は新しいシェルを起動せず、その PTY を使う。 */
      adopted?: ReadonlyMap<PaneId, AdoptedPaneSpec> | undefined;
    } = {},
  ): Promise<{ adoptedPaneIds: Set<PaneId> }> {
    const adoptedPaneIds = new Set<PaneId>();
    this.model.setNextIdCounters(data.nextId);
    for (const groupData of data.groups) this.model.restoreGroup(groupData); // 20260923-workspace-grouping
    // 名前を先に決めてから入れる（20260921-workspace-auto-label の design D6・D10）。自動の名前はその場所から決め直し（保存した後に git の状態が
    // 変わっていれば新しい名前になる）、付けた名前はそのまま。**1 つずつ決める**——一度に始めると上限のタイマーも一斉に始まって workspace が
    // 多いと全部が上限に達し（T6 の点検）、応答しないマウントの上に並んでいると止まった stat が libuv のスレッドを塞ぎ合う（review ラウンド 1）。
    // 1 つが上限を超えたら、それが返るまで残りはフォルダ名（`autoLabelFor`）。**合計の期限を過ぎたら残りもフォルダ名**（review ラウンド 2）。
    // 期限を過ぎてフォルダ名にしたときは、警告を 1 度だけ出す（review ラウンド 3）。
    const deadline = this.clock.now() + RESTORE_LABEL_BUDGET_MS;
    let warnedOverBudget = false;
    const restored: (SessionFileWorkspace & { autoLabel: boolean; labelCwd: string | null })[] = [];
    for (const [i, wsData] of data.workspaces.entries()) {
      const overBudget = (): boolean => {
        if (this.clock.now() < deadline) return false;
        if (!warnedOverBudget) {
          warnedOverBudget = true;
          this.logger.warn("workspace label lookup over restore budget; using folder names for the rest", {
            budgetMs: RESTORE_LABEL_BUDGET_MS,
            remaining: data.workspaces.slice(i).filter((ws) => isAutoLabel(ws)).length, // フォルダ名になる自動の名前の数（付けた名前は数えない）
          });
        }
        return true;
      };
      restored.push({ ...wsData, ...(await this.restoredLabel(wsData, overBudget)) });
    }
    for (const wsData of restored) {
      this.restoreWorkspace(wsData, wsData.autoLabel);
      if (wsData.labelCwd !== null) this.labelCwd.set(wsData.id, wsData.labelCwd);
    }
    for (const wsData of data.workspaces) {
      for (const tabData of wsData.tabs) {
        for (const paneData of tabData.panes) {
          const adopted = opts.adopted?.get(paneData.id);
          if (adopted !== undefined && this.adoptForPane(paneData.id, adopted)) {
            adoptedPaneIds.add(paneData.id);
            continue;
          }
          await this.restorePaneProcess(paneData.id, paneData.cwd, paneData.agentSession, opts.paneHistory?.get(paneData.id));
        }
      }
    }
    if (data.focus) {
      try {
        this.model.focusPane(data.focus.paneId);
      } catch {
        // 保存されていた focus の pane が読めなかった（未対応）。既定のフォーカスのままにする。
      }
    }
    return { adoptedPaneIds };
  }

  /**
   * 引き継いだ PTY をこの pane の端末にする（20260926-live-handoff。design「`SessionService`」）。プロセスは続いているので、会話の再開のコマンドも
   * 保存した画面履歴も流さない（AC9）。古い版の画面は、PTY の出力（非同期のイベント）より前に並ぶよう、作ったのと同じ同期区間でミラーへ書く
   * （`spawnForPane` の `seed` と同じ理由）。その後に大きさでつついて TUI に描き直させる。端末を作れなければ（fd が使えない等）false——
   * 呼び出し側が普通に新しいシェルを起動する。
   */
  private adoptForPane(paneId: PaneId, spec: AdoptedPaneSpec): boolean {
    if (this.terminals.adopt === undefined) return false;
    let host;
    try {
      host = this.terminals.adopt(paneId, { fd: spec.fd, pid: spec.pid, cols: spec.cols, rows: spec.rows });
    } catch (err) {
      this.logger.warn("cannot adopt a handed-off pty; starting a new shell instead", { paneId, error: String(err) });
      return false;
    }
    // model の pane の大きさも PTY に合わせる（復元は 120x40 で入れるので、そのままだと「同じ大きさなら何もしない」で PTY が取り残される）。
    this.model.setPaneSize(paneId, spec.cols, spec.rows);
    const screen = sanitizeHistoryAnsi(spec.screen);
    if (screen !== "") host.mirror.write(screen);
    this.wireExit(paneId);
    host.nudgeRedraw?.();
    return true;
  }

  /** 引き継ぎで渡す、スクロールバックを $EDITOR で開いた pane の対応（20260926-live-handoff の AC14）。 */
  handoffScrollbackEditors(): HandoffScrollbackEditor[] {
    return [...this.scrollbackEditors.entries()].map(([paneId, e]) => ({
      paneId,
      sourcePaneId: e.sourcePaneId,
      previousZoomedPaneId: e.previousZoomedPaneId,
      dir: e.dir,
    }));
  }

  /**
   * 引き継いだ後に、エディタの pane の対応を登録し直す（閉じたときの一時ディレクトリの削除・焦点と拡大表示の復帰が今までどおり働く）。
   * 引き継げなかった pane（新しいシェルになった・無くなった）のものは、一時ディレクトリだけ消す。
   */
  async adoptScrollbackEditors(entries: readonly HandoffScrollbackEditor[], adoptedPaneIds: ReadonlySet<PaneId>): Promise<void> {
    const root = resolve(this.scrollbackEditorEnv.tmpRoot ?? tmpdir());
    for (const e of entries) {
      // 消すことがあるので、このサーバが一時ディレクトリを作る場所（`mkdtemp(<tmpRoot>/wtm-scrollback-)`）の直下のものだけを扱う。
      if (dirname(e.dir) !== root) {
        this.logger.warn("ignoring a handed-off scrollback dir outside the temp root", { dir: e.dir, root });
        continue;
      }
      if (adoptedPaneIds.has(e.paneId) && this.model.getPane(e.paneId) !== undefined) {
        this.scrollbackEditors.set(e.paneId, { sourcePaneId: e.sourcePaneId, previousZoomedPaneId: e.previousZoomedPaneId, dir: e.dir });
      } else {
        await this.removeScrollbackDirQuietly(e.dir);
      }
    }
  }

  /**
   * 復元する名前。保存した印があればそれ、無ければ（以前の版）`"1"`（以前の既定の名前）を自動とみなす。空・空白だけの名前も自動（design D10）。
   * 利用者が自分で「1」と付けていた workspace も自動になる（以前の保存には区別が無い。requirements の割り切り）。`overBudget` は自動の名前のときだけ
   * 呼ぶ（復元の合計の期限を過ぎたか。過ぎていれば `restore` が警告を 1 度だけ出す）。
   */
  private async restoredLabel(
    wsData: SessionFileWorkspace,
    overBudget: () => boolean,
  ): Promise<{ label: string; autoLabel: boolean; labelCwd: string | null }> {
    if (!isAutoLabel(wsData)) return { label: wsData.label, autoLabel: false, labelCwd: null };
    // 保存の最初の tab の最初の pane の場所から決める（止める前にいた場所。20260926-workspace-label-follow-cwd の AC8）。
    const cwd = savedIdentityCwd(wsData);
    if (overBudget()) return { label: folderLabelOf(cwd, this.workspaceLabelDeps), autoLabel: true, labelCwd: null };
    const named = await this.autoLabelFor(cwd);
    return { label: named.label, autoLabel: true, labelCwd: named.degraded ? null : cwd };
  }

  private restoreWorkspace(wsData: SessionFileWorkspace, autoLabel: boolean): void {
    // SessionModel には「既存の id を使って作る」専用口が無いので、内部の Map へ直接組み立てる代わりに
    // 通常の作成 API は使わず、復元専用の経路で入れる（実装は SessionModel.restoreFrom に委譲）。
    this.model.restoreWorkspace(wsData, autoLabel);
  }

  private async restorePaneProcess(
    paneId: PaneId,
    cwd: string,
    agentSession?: { kind: string; sessionId: string } | undefined,
    history?: PaneHistoryEntry | undefined,
  ): Promise<void> {
    // 会話を再開する pane には保存した画面を流さない（再開が自分の画面を描く。herdr の `pane_restore_startup` と同じ。AC9）。
    const seed = history && this.resumeCommandForRestore(agentSession) === null ? historyReplayText(history.ansi, history.savedAt) : undefined;
    const spawn = await this.spawnForPane(paneId, cwd, undefined, seed);
    if (!spawn.ok) {
      this.model.markPaneFailed(paneId, "シェルの起動に失敗しました");
      return;
    }
    // 復元対象の pane は restoreWorkspace で既にモデルに入っているので、すぐ連鎖してよい。
    if (spawn.alreadyExited) {
      await this.closePaneAfterExit(paneId, 0);
      return;
    }
    this.maybeResumeAgentSession(paneId, agentSession);
  }

  /**
   * 保存されていた会話参照があれば、シェルの起動（上）に**続けて**再開コマンドを投入する
   * （20260923-agent-session-resume design D10：起動そのものの分岐は増やさず、成功した後に
   * pane へ書き込むだけにする。無効な参照はコマンド自身がエラーで終わり、普通のシェルに戻る。AC6）。
   * 同一 cwd・同一種別の pane が複数あっても、pane ごとに一意な `sessionId` を持つため
   * 重複排除はしない（design D11）。
   */
  private maybeResumeAgentSession(paneId: PaneId, agentSession: { kind: string; sessionId: string } | undefined): void {
    const command = this.resumeCommandForRestore(agentSession);
    if (command === null) return;
    this.terminals.get(paneId)?.write(`${command}\r`);
    this.resumeWrittenAt.set(paneId, this.clock.now());
  }

  /** 会話の再開コマンドを打ち込んでから `RESUME_PENDING_MS` の間で、まだエージェントが検出されていないか（`agent start` はその pane に打ち込まない）。 */
  hasPendingResume(paneId: PaneId): boolean {
    const at = this.resumeWrittenAt.get(paneId);
    if (at === undefined) return false;
    if (this.clock.now() - at <= RESUME_PENDING_MS) return true;
    this.resumeWrittenAt.delete(paneId);
    return false;
  }

  /** 復元でこの pane の会話を再開するなら、その再開のコマンド。しないなら null（保存した会話参照・自動再開の設定・対応するコマンドが揃うときだけ）。 */
  private resumeCommandForRestore(agentSession: { kind: string; sessionId: string } | undefined): string | null {
    if (!agentSession) return null;
    if (!this.getAutoResumeEnabled()) return null;
    return resumeCommandFor(agentSession.kind, agentSession.sessionId) || null;
  }

  // --- helpers ------------------------------------------------------------

  private requireWorkspace(id: WorkspaceId): Workspace {
    const ws = this.model.getWorkspace(id);
    if (!ws) throw new RpcError("not_found", `workspace not found: ${id}`);
    return ws;
  }
  private requireTab(id: TabId): Tab {
    const tab = this.model.getTab(id);
    if (!tab) throw new RpcError("not_found", `tab not found: ${id}`);
    return tab;
  }
  private requirePane(id: PaneId): Pane {
    const pane = this.model.getPane(id);
    if (!pane) throw new RpcError("not_found", `pane not found: ${id}`);
    return pane;
  }
}

async function raceSpawn(
  host: { onExit(cb: (code: number) => void): { dispose(): void } },
  graceMs: number,
): Promise<{ ok: boolean; alreadyExited: boolean }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      disposable.dispose();
      resolve({ ok: true, alreadyExited: false });
    }, graceMs);
    const disposable = host.onExit((code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // 0 での即終了は「起動には成功した」とみなす（D37）。ただし既にプロセスは終了しているので、
      // 呼び出し側は `alreadyExited` を見て D18 の連鎖を自分で起こす必要がある（レビュー指摘）。
      resolve({ ok: code === 0, alreadyExited: true });
    });
  });
}

function sameGit(a: GitInfo | null, b: GitInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // repoKey/isLinkedWorktree も比較する（20260923-workspace-grouping。タスク点検の指摘）——
  // branch/ahead/behind が変わらず repoKey/isLinkedWorktree だけ変わる場合（worktree 自動グループの
  // 判定に使う中心的なフィールド）を早期リターンで握りつぶすと、サーバの状態更新・
  // `workspace.updated` の配布ごと止まってしまう。
  return a.branch === b.branch && a.ahead === b.ahead && a.behind === b.behind && a.repoKey === b.repoKey && a.isLinkedWorktree === b.isLinkedWorktree;
}

/** `AgentInfo`（公開している側の全フィールド）が実際に変わったかを見る（`updatePaneRuntime` のレビュー指摘）。 */
function sameAgent(a: AgentInfo | null, b: AgentInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.instanceId === b.instanceId &&
    a.kind === b.kind &&
    a.label === b.label &&
    a.state === b.state &&
    a.completionSeq === b.completionSeq &&
    a.serverSeenSeq === b.serverSeenSeq &&
    a.verified === b.verified &&
    a.since === b.since &&
    a.name === b.name
  );
}

/**
 * 保存された workspace の名前が自動の名前か（20260921-workspace-auto-label の design D6・D10）。保存した印があればそれ、無ければ（以前の版）`"1"` を
 * 自動とみなす。空・空白だけの名前も自動。
 */
function isAutoLabel(wsData: SessionFileWorkspace): boolean {
  return (wsData.autoLabel ?? wsData.label === "1") || !wsData.label.trim();
}

/** 保存された workspace の最初の tab の、画面の並びで先頭の pane の場所（`identityCwdOf` の保存版）。見つからなければ開いた場所。 */
function savedIdentityCwd(wsData: SessionFileWorkspace): string {
  const tab = wsData.tabs[0];
  const paneId = tab ? Layout.leaves(tab.layout)[0] : undefined;
  return tab?.panes.find((p) => p.id === paneId)?.cwd ?? wsData.cwd;
}

/** 「引き継ぐ」の元の pane（`newCwd.sourcePaneId`）。ほかの方針では元の pane を使わない。 */
function followSource(newCwd: NewCwd | undefined): PaneId | undefined {
  return newCwd?.policy === "follow" ? newCwd.sourcePaneId : undefined;
}

export { NotFoundError };
export type { SessionFileData, SessionFilePane, SessionFileTab, SessionFileWorkspace };
