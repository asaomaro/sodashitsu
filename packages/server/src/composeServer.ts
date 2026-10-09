import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir as osHomedir, hostname as osHostname, platform } from "node:os";
import { type HostInfo, type LinkRun } from "@sodashitsu/protocol";
import { ConfigError, type RawServeArgs, type ServeOptions, agentReportSocketPathFor, paneSocketPathFor, resolveServeOptions, stateDirInUseError } from "./config.js";
import { FileLogger, type Logger } from "./log/Logger.js";
import { EventBus } from "./bus/EventBus.js";
import { NodePtyBackend } from "./pty/NodePtyBackend.js";
import { LinuxProcessInspector } from "./platform/LinuxProcessInspector.js";
import { WindowsProcessInspector } from "./platform/WindowsProcessInspector.js";
import type { ProcessInspector } from "./platform/ProcessInspector.js";
import { DefaultTerminalManager, type TerminalManager } from "./terminal/TerminalManager.js";
import { SessionModel } from "./session/SessionModel.js";
import { SessionService } from "./session/SessionService.js";
import { makeNewCwdDeps } from "./session/newCwd.js";
import { DefaultPersistScheduler } from "./session/PersistScheduler.js";
import { FsSessionFile, type SessionFileData } from "./persist/SessionFile.js";
import { FsAuthFile } from "./persist/AuthFile.js";
import { FsPaneHistoryFile, type PaneHistoryEntry } from "./persist/PaneHistoryFile.js";
import { PaneHistoryRecorder } from "./session/PaneHistoryRecorder.js";
import { StateDirInUseError, StateDirLock } from "./persist/StateDirLock.js";
import { DefaultAuthService, sessionCookieName } from "./auth/AuthService.js";
import { readServeRecord, writeServeRecord } from "./persist/ServeRecordFile.js";
import { listServerSessions } from "./persist/namedSession.js";
import { DefaultOriginPolicy } from "./auth/OriginPolicy.js";
import { OriginRejectionLog } from "./auth/OriginRejectionLog.js";
import { DefaultLoginRateLimiter } from "./auth/LoginRateLimiter.js";
import { OsNetworkInfo } from "./infra/OsNetworkInfo.js";
import { ChildProcessGitRunner } from "./infra/GitRunner.js";
import { DefaultWorktreeService } from "./git/WorktreeService.js";
import { DefaultGitInfoPoller } from "./git/GitInfoPoller.js";
import { wireLayoutConfirmation } from "./layoutConfirmWiring.js";
import { createPaletteSource } from "./clients/answerPalette.js";
import { DefaultClientRegistry } from "./clients/ClientRegistry.js";
import { DefaultSizeAuthority } from "./clients/SizeAuthority.js";
import { ControlSurface } from "./surface/ControlSurface.js";
import { registerAllMethods } from "./surface/methods/index.js";
import { IMAGE_DIR_NAME, ImageStore } from "./image/ImageStore.js";
import { ImageUploads } from "./image/ImageUploads.js";
import { AskService } from "./ask/AskService.js";
import { PaneOpRegistry } from "./panesocket/PaneOpRegistry.js";
import { PaneSocket } from "./panesocket/PaneSocket.js";
import { askFeaturesOp, askOpenOp } from "./panesocket/askOp.js";
import { displayCloseOp, displayFeaturesOp, displayListOp, displaySendOp, displaySetOp, displayWaitOp } from "./panesocket/displayOps.js";
import { DisplayService } from "./display/DisplayService.js";
import { ExtensionHost, type ExtensionHostOptions } from "./extensions/ExtensionHost.js";
import { AskMedia, type ImageFetcher } from "./ask/AskMedia.js";
import { RemoteImageFetcher } from "./ask/RemoteImageFetcher.js";
import { FileAccess } from "./file/FileAccess.js";
import { FileOpener } from "./file/FileOpener.js";
import { DROP_DIR_NAME, FileStore } from "./file/FileStore.js";
import { FileUploads } from "./file/FileUploads.js";
import { FsIntegrationFile } from "./persist/IntegrationFile.js";
import { FsAgentIntegrationInstaller, isAgentIntegrationKind } from "./agent/AgentIntegrationInstaller.js";
import { DefaultAgentIntegrationService } from "./agent/AgentIntegrationService.js";
import { startAgentReportSocket, type AgentReportSocket } from "./agent/AgentReportSocket.js";
import { HttpServer } from "./http/HttpServer.js";
import { WsServerWs } from "./ws/WsServerWs.js";
import { WsGateway } from "./ws/WsGateway.js";
import type { WsConnection } from "./ws/WsServer.js";
import { BridgeEndpoint, bridgeSocketPathFor } from "./machine/BridgeEndpoint.js";
import { MachineLink, type SpawnFn } from "./machine/MachineLink.js";
import { MachineManager } from "./machine/MachineManager.js";
import { relayToMachine } from "./machine/MachineRelay.js";
import { AgentMonitor } from "./agent/AgentMonitor.js";
import { AgentStarter } from "./agent/AgentStarter.js";
import { DefaultManifestStore, type ManifestStore } from "./agent/ManifestStore.js";
import { FsManifestSource } from "./infra/FsManifestSource.js";
import { isLocalOnlyServer, paneServerUrl } from "./util/net.js";
import { HANDOFF_NONCE_ENV, closeOrphanPtyMasters, takeHandoff } from "./handoff/HandoffManifest.js";
import { HandoffController, type PreflightResult } from "./handoff/HandoffController.js";
import { type HandoffSocket, handoffSocketPathFor, startHandoffSocket } from "./handoff/HandoffSocket.js";
import { createControlRequests, type StopSource } from "./handoff/controlRequests.js";
import { runPreflight } from "./handoff/preflight.js";
import { type HandoffResult, adoptedSpecsOf, discardHandedOffPanes, discardRejectedPanes, finishTakenHandoff } from "./handoff/startup.js";
import { COMMANDS_FILE_NAME } from "./commands/commandConfig.js";
import { CommandService } from "./commands/CommandService.js";
import { MetadataService } from "./metadata/MetadataService.js";
import { PrefsStore } from "./persist/PrefsStore.js";
import { GraphStore } from "./persist/GraphStore.js";
import { GraphEngine } from "./graph/GraphEngine.js";
import { LOCAL_MACHINE, nodeKey } from "@sodashitsu/client-core";
import { AgentLineage } from "./graph/AgentLineage.js";
import { AgentForkRunner } from "./agent/AgentForkRunner.js";
import { GraphPaneCleanup } from "./graph/GraphPaneCleanup.js";
import { GraphMaintainer } from "./graph/GraphMaintainer.js";
import { SubagentTracker } from "./agent/SubagentTracker.js";
import { LocalAgentPort } from "./graph/LocalAgentPort.js";
import { RemoteLinks } from "./graph/RemoteLinks.js";
import type { ClientSink } from "./terminal/OutputFanout.js";
import { LocalLogin } from "./auth/LocalLogin.js";

export interface ComposedServer {
  httpServer: HttpServer;
  session: SessionService;
  gitPoller: DefaultGitInfoPoller;
  persist: DefaultPersistScheduler;
  /** pane の端末（結合テストで pane へ書き、ミラーを読むため。20260926-screen-history-replay）。 */
  terminals: TerminalManager;
  /** 起動時の判定ルール読み込みの結果（smoke・結合テスト用。design「起動確認」・02-agent-detection T10）。 */
  manifestStore: ManifestStore;
  /** 連携のグラフの保存（20260927-agent-graph。結合試験が終了の後に書き込めないことを確かめる）。 */
  graph: GraphStore;
  /** 連携の実行の履歴（`graph.history` と同じ。結合試験が接続を閉じた後・引き継ぎの最中の実行の有無を確かめる）。 */
  graphHistory(linkId?: string): LinkRun[];
  /** 連携の別のマシンへの接続が使えるか（04。結合試験が繋がった・切れたを待つ）。 */
  graphRemoteAvailable(machineId: string): boolean;
  logger: Logger;
  options: ServeOptions;
  /**
   * token を初めて作った場合だけ値が入る（design「起動時の表示」）。token は `listen()` が待ち受けに成功してから作るので、
   * **`listen()` が resolve するまでは常に `undefined`**（待ち受けに失敗した起動で token を作って失わないため。D102）。
   */
  readonly freshToken: string | undefined;
  /**
   * 起動する（architecture.md「6. 起動と再起動後の復元」・D102・D103）：状態ディレクトリのロック（`soda.lock`。生きている
   * 別の soda が持っていれば `ConfigError`）→ auth.json の読み込み（ロックの後。組み立ての時点では読まない）→ 待ち受け
   * （bind。失敗したら reject）→ token の作成 → 復元（無ければ workspace を 1 つ作る）→ poller の開始 → `/ws` の受け付けの開始。ロックと bind を最初に行うので、同じ state-dir の soda が既に
   * 動いている起動（ポートが違っても）や待ち受けに失敗した起動は、token を作らず・シェルを起動せず・session.json と
   * auth.json に触れない。失敗したらロックを放してから reject する。
   */
  listen(): Promise<void>;
  /** 止める。最後に状態ディレクトリのロックを放す（途中で失敗しても放す）。 */
  close(): Promise<void>;
  /** 更新時の引き継ぎ（20260926-live-handoff）で起動したときの結果（`listen()` の後。引き継ぎでない起動は undefined）。 */
  readonly handoffResult: HandoffResult | undefined;
  /**
   * 制御の socket（`handoff.sock`）の止める指示（`soda session stop`。20260927-session-stop）を受けたときに呼ぶものを登録する。`main.ts` が停止の手順を渡す。
   * 登録しなければ止める指示は `unsupported` で断る（smoke・テストで組み立てだけを使うとき）。呼ぶのは 1 回だけ（止まる途中の指示は呼ばずに答える）。
   */
  onStopRequest(fn: (source: StopSource) => void): void;
}

function pickProcessInspector(): ProcessInspector {
  // 対象 OS は Linux / WSL2 / Windows（requirements）。WSL2 は Linux として動く。
  // macOS 等それ以外は Linux 実装をフォールバックとして使う（/proc が無い環境では前面プロセスの検出だけ諦める）。
  return platform() === "win32" ? new WindowsProcessInspector() : new LinuxProcessInspector();
}

function webDistDirFor(): string {
  // packages/server/dist/composeServer.js から見て ../../web/dist
  return join(import.meta.dirname, "..", "..", "web", "dist");
}

function manifestDirFor(): string {
  // packages/server/dist/composeServer.js から見て ../../../third_party/herdr/agent-detection
  // （リポジトリ直下。`third_party` は成果物にも同梱する前提——移植元のライセンス表示ごと持ち歩く。D5・D34）。
  return join(import.meta.dirname, "..", "..", "..", "third_party", "herdr", "agent-detection");
}

/** 公式フック連携（20260923-agent-session-resume）の hook スクリプト本体の場所。 */
function agentHookScriptFor(): string {
  // packages/server/dist/composeServer.js から見て ../assets/agent-hook-report.cjs
  return join(import.meta.dirname, "..", "assets", "agent-hook-report.cjs");
}

/** 連携の実行（`GraphEngine`）が方式を中から呼ぶときの clientId（20260927-agent-graph。`SizeAuthority` は登録の無い clientId を無視する）。 */
const GRAPH_CLIENT_ID = "graph";

/** サーバの版（snapshot の `serverVersion` と中継の HELLO の `version`）。 */
const SERVER_VERSION = "0.1.0";

/** 起動オプションから、部品をすべて組み立てる（composition root）。`main.ts` と `smoke.ts` の両方から使う。 */
export async function composeServer(
  rawArgs: RawServeArgs,
  /** テスト用の差し替え（結合テストが定期保存を短い間隔で観測する。20260926-screen-history-replay）。 */
  internal: {
    paneHistorySaveIntervalMs?: number;
    /** 引き継ぎの前の確認の差し替え（結合テストが引き継ぎの最中の状態を作る。20260927-session-stop）。 */
    handoffPreflight?: () => Promise<PreflightResult>;
    /**
     * 引き継ぎの execve の差し替え（結合試験が引き継ぎの最中〔poller を止めた後〕の状態を作り、投げて元に戻させる。20260927-agent-graph）。
     * 差し替えなければ本物の `process.execve`（成功すればこのプロセスを置き換える）。
     */
    handoffExecve?: (nonce: string) => void;
    /** 保存した SSH のマシンへの ssh の起動の差し替え（結合テストがリモートの bridge.sock へ直接繋ぐ偽の子を渡す。20260927-multi-host-machines）。 */
    machineSpawn?: SpawnFn;
    /** ファイルを開く係の差し替え（結合テスト・E2E が実物のアプリを起動させない）。 */
    fileOpener?: FileOpener;
    /** 外部 URL の画像の取得の差し替え（結合テスト・E2E が偽の取得を渡す。20261004-ask-media-popup）。 */
    askImageFetcher?: ImageFetcher;
    /** 拡張の持ち主の差し替え（結合テスト・E2E が起動し直しの間隔などを縮める。20261007-ext-host）。本番は渡さない。 */
    extensions?: ExtensionHostOptions["deps"];
  } = {},
): Promise<ComposedServer> {
  const options = await withRememberedPort(resolveServeOptions(rawArgs), rawArgs);
  const logger = new FileLogger(join(options.stateDir, "server.log"));

  // 同じ state-dir の soda を 2 つ動かさない（D103）。取るのは `listen()` の最初。放すときの失敗はログに残すだけ。
  const lock = new StateDirLock(options.stateDir, { logger });
  const authFile = new FsAuthFile(options.stateDir);
  // auth.json はここでは読まない——ロックを取ってから `listen()` で読む（D103）。組み立てとロックの間に `soda token reset`
  // （ロックを取って作り直す）が走ると、先に読んだ古い token をメモリに持ったまま起動し、新しい token を受け付けず、次の
  // ログイン等で auth.json を古い token に書き戻していた（独立点検で dist で再現）。
  // 名前付き session の Cookie の名前は session ごと（Cookie はポートで分かれない。20260926-named-session-ui の design「Cookie」）。
  const auth = new DefaultAuthService(authFile, { cookieName: sessionCookieName(options.sessionName) });

  // 証明書の読み込み・解釈の失敗は設定の誤りとして終了コード 2 にする。token はまだ作っていないので失わない（D102）。
  const cert = options.cert ? await readPem(options.cert, "--cert") : undefined;
  const key = options.key ? await readPem(options.key, "--key") : undefined;
  const secure = Boolean(cert && key);

  const origins = new DefaultOriginPolicy(
    { host: options.host, port: options.port, secure, extraOrigins: options.extraOrigins },
    new OsNetworkInfo(),
  );
  const rateLimiter = new DefaultLoginRateLimiter();
  // Origin の検査と拒否のログは `/api/login` と `/ws` で 1 つを共有する（間引きの状態を分けない——同じブラウザが両方で
  // 拒否されても 1 回。`HttpServer`・`WsServerWs` の必須の依存。D102・D103）。
  const originRejections = new OriginRejectionLog(logger, origins, { extraOrigins: options.extraOrigins });
  // 手元からのログイン（20260927-cli-mode。decisions D2）。秘密は `listen()` の待ち受けの後に作って `local-auth.json` へ書き、`close()` で消す。
  const localLogin = new LocalLogin(options.stateDir);
  let httpServer: HttpServer;
  try {
    httpServer = new HttpServer(auth, originRejections, rateLimiter, { webDistDir: webDistDirFor(), cert, key, logger, localLogin });
  } catch (err) {
    // `https.createServer` は証明書と秘密鍵をその場で解釈する（PEM でない・鍵が合わない等で投げる）。
    if (!secure) throw err;
    throw new ConfigError(
      `cannot use the TLS certificate/key: ${err instanceof Error ? err.message : String(err)}`,
      "--cert と --key に、対になる PEM 形式の証明書と秘密鍵を指定してください（docs/tls-setup.md）。",
    );
  }

  // 証明書の SHA-256 の指紋（`serve.json` の `certSha256`。20260927-cli-mode）。端末版は指紋が一致した証明書だけを受ける（`tls.PeerCertificate.fingerprint256` と同じ書式）。
  const certSha256 = secure && cert !== undefined ? certFingerprint(cert) : undefined;

  const model = new SessionModel();
  const bus = new EventBus();
  const processInspector = pickProcessInspector();
  // 色・明暗の問い合わせの答え（20260921-theme-settings の design D6・20260924-dark-mode-report）は `session`（pane・tab）と `clients` から引くが、`session` は `terminals` を受けて
  // 作る（`clients` もその下）——先に箱を渡し、`clients` を作った直後に埋める。pane を作る（復元する）のは `listen()` の中で、埋めた後になる。
  // 埋まる前に問い合わせが来ても dracula（明暗は dark）で答える（投げない）。
  const palettes = createPaletteSource();
  // シェルの場所の知らせ（20260928-windows-pane-cwd の D-6）：pane を開くたびに共有の設定 `shellCwdTracking` の今の値を読む（boolean の false のときだけ切。
  // client-core の `loadShellCwdTracking` と同じ規則）。`prefs` は下で作る——読むのは pane を開くとき（`listen()` で読み込んだ後）。
  const terminals = new DefaultTerminalManager(new NodePtyBackend(), processInspector, options.scrollbackLines, palettes.paletteFor, palettes.appearanceFor, {
    platform: platform(),
    enabled: () => prefs.get().prefs.shellCwdTracking !== false,
  });
  const sessionFile = new FsSessionFile(options.stateDir);
  const persist = new DefaultPersistScheduler(async () => {
    await sessionFile.save(toSessionFileData(session));
  });
  const host: HostInfo = {
    os: platform() === "win32" ? "windows" : "linux",
    windowsBuild: null,
    hostname: osHostname(),
    // 名前付き session のときだけ（ブラウザの表示。20260926-named-session-ui の AC1）。既定の session では項目ごと入れない。
    ...(options.sessionName !== undefined ? { sessionName: options.sessionName } : {}),
  };
  // 「起動した場所」。新しい workspace の以前の場所と、新しく開く場所の方針「起動した場所」・代わりの 2 段目は同じ値
  // （2 か所で別々に持たない。20260921-new-terminal-cwd の design D6）。
  const defaultCwd = process.cwd();
  // 公式フック連携（20260923-agent-session-resume）：会話IDの report 経路・導入/解除・自動再開設定。
  const agentReportSocketPath = agentReportSocketPathFor(options.stateDir);
  // pane の中のプログラム向けのログイン不要の受け口（`pane.sock`。20261003-sodactl-ask-socket）のパス。Windows では undefined（受け口を立てず、pane の環境にも入れない）。
  // 受け口を立てるのは `listen()` の 4.7 だが、パスは pane の環境（`SODA_PANE_SOCKET`）に入れるので組み立て時に決める。
  const paneSocketPath = paneSocketPathFor(options.stateDir);
  const integrationFile = new FsIntegrationFile(options.stateDir);
  const agentIntegrationInstaller = new FsAgentIntegrationInstaller(agentHookScriptFor());
  const agentIntegrations = await DefaultAgentIntegrationService.load(agentIntegrationInstaller, integrationFile, bus);
  /** pane の環境の `SODA_SERVER_URL`（`listen()` で待ち受けた後に決める。それまでは undefined）。`SessionService` が読むので、それより前に宣言する。 */
  let paneUrl: string | undefined;
  const session = new SessionService({
    model,
    terminals,
    bus,
    persist,
    serverVersion: SERVER_VERSION,
    host,
    scrollbackLines: options.scrollbackLines,
    defaultCwd,
    agentReportSocketPath,
    // pane の環境へは絶対パスで渡す（`--state-dir` が相対でも、pane の cwd に依らず同じ受け口を指す。sodactl は相対の値を使わない）。
    paneSocketPath: paneSocketPath === undefined ? undefined : resolve(paneSocketPath),
    getAutoResumeEnabled: agentIntegrations.getAutoResumeEnabled,
    // pane の中の sodactl の接続先（20260926-agent-skill-file）。待ち受けた後（`listen()` の 1.）に決まる。pane を起動するのはその後。
    serverUrlForPanes: () => paneUrl,
    sessionName: options.sessionName, // pane の環境の SODA_SESSION（20260926-named-session-ui）
    // 新しく開く場所（herdr の `terminal.new_cwd`）。「引き継ぐ」は元の pane の前面プロセスの cwd をその時点で読み直す。
    newCwdDeps: makeNewCwdDeps({
      terminals,
      inspector: processInspector,
      getPane: (id) => model.getPane(id),
      currentDir: defaultCwd,
    }),
    shell: options.shell, // `--shell`（T27。以前はどこにも渡しておらず効いていなかった）
    logger,
  });

  // 画面履歴（`--pane-history`。20260926-screen-history-replay）。ファイルは有効・無効のどちらでも扱う（無効なら起動時に消す）。
  // 保存の係は有効のときだけ作る（design「起動」「停止」）。
  const paneHistoryFile = new FsPaneHistoryFile(options.stateDir);
  const paneHistory = options.paneHistory
    ? new PaneHistoryRecorder({ file: paneHistoryFile, terminals, paneIds: () => session.snapshot().panes.map((p) => p.id), logger })
    : undefined;

  const gitRunner = new ChildProcessGitRunner();
  const gitPoller = new DefaultGitInfoPoller(session, gitRunner, undefined, bus); // 最初の pane の場所の変化にすぐ気づく（20260926-workspace-label-follow-cwd）
  // worktree の一覧と作成（20260920-git-worktree-actions）。`GitInfoPoller` と同じ runner を使い回す。
  const worktrees = new DefaultWorktreeService(session, gitRunner, logger, options.worktreeDir);

  // エージェント判定（02-agent-detection T10）。判定ルール（third_party/herdr/agent-detection）を読み、
  // 結果の要約をログへ出す（個々のファイルの失敗は ManifestStore.loadAll 自身が warn で出す。D46）。
  const manifestStore = await DefaultManifestStore.load(new FsManifestSource(manifestDirFor()), logger);
  const manifestSummaries = manifestStore.summaries();
  const manifestOkCount = manifestSummaries.filter((s) => s.ok).length;
  logger.info("agent manifests loaded", { ok: manifestOkCount, total: manifestSummaries.length });
  const agentMonitor = new AgentMonitor({ session, terminals, processInspector, manifestStore, bus, logger });

  const clients = new DefaultClientRegistry();
  palettes.attach({ getPane: (id) => session.getPane(id), getTab: (id) => session.getTab(id), clients });
  const sizeAuthority = new DefaultSizeAuthority(clients, session, bus); // bus: pane.attach_changed（20260926-pane-direct-connect）
  const surface = new ControlSurface(logger);
  // 保存した SSH のマシン（20260927-multi-host-machines）。登録簿は状態ディレクトリの根（名前付き session で共有。decisions D4）。
  // 動かし始めるのは `listen()` の最後（`/ws` を受け付けてから）、止めるのは `close()` の最初。
  const machines = new MachineManager({
    root: options.sessionRoot,
    logger,
    createLink: (profile) => new MachineLink(profile, { ...(internal.machineSpawn !== undefined ? { spawn: internal.machineSpawn } : {}), logger }),
  });
  machines.onChanged((list) => bus.publish({ event: "machine.changed", data: { machines: list } }));
  const agentStarter = new AgentStarter({ session, terminals, processInspector }); // 20260926-agent-start
  const agentFork = new AgentForkRunner({
    session,
    worktrees,
    terminals,
    starter: agentStarter,
    bus,
    logger,
    // 新しい pane のノードに、fork の注記を書く（見るだけの線。20261009-agent-fork の A12）。ノードは維持（`GraphMaintainer`）が 50ms の遅れで足すので、先にそろえる。
    // 上限でノードが足せなければ、注記なしで成功する（false）。
    annotate: async (newPaneId, sourcePaneId) => {
      await graphMaintainer.reconcileNow();
      return graph.setForkedFrom(nodeKey(LOCAL_MACHINE, newPaneId), nodeKey(LOCAL_MACHINE, sourcePaneId));
    },
  }); // 20261009-agent-fork
  // 独自コマンド（20260927-custom-command-keys）。状態ディレクトリ（名前付き session ではその session のもの）の commands.json。起動時に 1 度読む
  // （まだ `/ws` を受け付けていないので `command.updated` を受け取る接続は無い）。読み直しは `command.reload`。
  const commands = new CommandService({ filePath: join(options.stateDir, COMMANDS_FILE_NAME), session, terminals, bus, clients, logger });
  await commands.reload();
  // 独自トークン（20260927-sidebar-row-tokens）。session へは MetadataTargets の口越しに書き、閉じた対象は bus で捨てる。`close()` で dispose。
  const metadata = new MetadataService({ targets: session, bus, logger });
  // クリップボードの画像（20260927-clipboard-image-paste）。状態ディレクトリの下の私的なディレクトリに置く（decisions D5）。切断では消さない。
  const imageStore = new ImageStore({ dir: join(options.stateDir, IMAGE_DIR_NAME) });
  let imageSweeper: { stop(): void } | undefined;
  const images = new ImageUploads({
    store: imageStore,
    paneExists: (paneId) => session.getPane(paneId) !== undefined,
    logger,
  });
  // 質問のフォーム（20261002-sodactl-ask）。pane のプログラムの質問を、`ask.subscribe` した画面（desktop / mobile）に出す。回答待ちはメモリだけ（再起動・引き継ぎをまたがない）。
  const paneExists = (paneId: string): boolean => session.getPane(paneId) !== undefined;
  const asks = new AskService({
    paneExists,
    isBrowserKind: (clientId) => {
      const kind = clients.get(clientId)?.kind;
      return kind === "desktop" || kind === "mobile";
    },
    bus,
    logger,
    media: new AskMedia({ fetcher: internal.askImageFetcher ?? new RemoteImageFetcher(), logger }),
    // ローカル起動: loopback だけで待ち受け、TLS・`--origin`（ポート転送・プロキシ・LAN への公開）が無い。ほかのマシンの `soda serve` の中継越しの画面は、これとは別に除く。
    localOnly: isLocalOnlyServer(options.host, secure, options.extraOrigins),
    isRemoteClient: (clientId) => clients.get(clientId)?.viaBridge === true,
  });
  // 表示の面（20261007-soda-extensions）。pane ごとのパネル・帯。メモリだけ（再起動・引き継ぎで消える）。画面の見分けは ask と同じ（desktop / mobile）。
  const displays = new DisplayService({
    // 設定 `displayScriptEnabled`（既定は無効。`true` のときだけ有効）。`prefs` は下で作る——読むのは `set`・`send` のとき（`listen()` で読み込んだ後）。
    scriptEnabled: () => prefs.get().prefs.displayScriptEnabled === true,
    bus,
    paneExists,
    isScreenKind: (clientId) => {
      const kind = clients.get(clientId)?.kind;
      return kind === "desktop" || kind === "mobile";
    },
    logger,
  });
  // 拡張の登録と起動（20261007-ext-host）。利用者の設定（`<stateDir>/extensions.json`）に登録したプログラムを起動・停止し、標準入出力の NDJSON でやり取りする。
  // 起動は `listen()` の最後（ロックの後。待たない）、止めるのは `close()`・引き継ぎの前。`pane.sock` には何も載せない。
  const extensions = new ExtensionHost({
    stateDir: options.stateDir,
    sessionRoot: options.sessionRoot,
    session,
    displays,
    bus,
    isScreenKind: (clientId) => {
      const kind = clients.get(clientId)?.kind;
      return kind === "desktop" || kind === "mobile";
    },
    baseEnv: process.env,
    homeDir: osHomedir(),
    logger,
    ...(internal.extensions ? { deps: internal.extensions } : {}),
  });
  // ログイン不要の受け口（20261003-sodactl-ask-socket）。受けるのはここに登録した操作だけ（`/ws` の RPC は通さない）。いま載せるのは `ask.open` だけ。
  // pane の実在は `AskService` と同じ判定。接続が終わったら、その接続が持ち主の質問を閉じるのは操作の中（`askOpenOp` が `ctx.signal` の abort で取り消す）。
  // 待ち受けは `listen()` の 4.7、閉じるのは `close()`。引き継ぎの間は `pause()`（`HandoffController` の `closeClients`）。
  const paneOps = new PaneOpRegistry(logger);
  paneOps.register(askOpenOp(asks));
  paneOps.register(askFeaturesOp(asks));
  // 表示の面: どの操作も対象は要求が名乗った pane だけ（`displayOps.ts`）。待ちは接続が終わると外れる（`ctx.signal`）。
  paneOps.register(displaySetOp(displays));
  paneOps.register(displayCloseOp(displays));
  paneOps.register(displayListOp(displays));
  paneOps.register(displayWaitOp(displays));
  paneOps.register(displayFeaturesOp(displays));
  paneOps.register(displaySendOp(displays));
  const paneSocket = new PaneSocket({
    registry: paneOps,
    paneExists,
    logger,
  });
  // 端末のファイルのリンクとドロップ。ドロップされたファイルは画像と同じく状態ディレクトリの下の私的なディレクトリに置く（切断では消さない）。
  const dropStore = new FileStore({ dir: join(options.stateDir, DROP_DIR_NAME) });
  let dropSweeper: { stop(): void } | undefined;
  const fileUploads = new FileUploads({ store: dropStore, paneExists: (paneId) => session.getPane(paneId) !== undefined, logger });
  const files = {
    access: new FileAccess({ cwdOf: (paneId) => session.getPane(paneId)?.cwd }),
    opener: internal.fileOpener ?? new FileOpener(),
    uploads: fileUploads,
  };
  // 共有の設定（20260927-cli-mode）。読むのは `listen()` のロックの後（auth.json と同じ）。保存できた変更は全クライアントへ配る。
  const prefs = new PrefsStore(options.stateDir, (err) =>
    logger.error("prefs.changed listener failed", { error: err instanceof Error ? (err.stack ?? err.message) : String(err) }),
  );
  let scriptWasEnabled = false; // 起動時は prefs.json の読み込み前なので、最初の変更の前に読み直す（下）
  prefs.onChange((state, byClientId) => {
    const byKind = clients.get(byClientId)?.kind;
    // スクリプトが動く表示が無効 → 有効に変わったら、サーバのログに残す（誰が変えたかの種別つき）。画面には、受け取った側が知らせを出す。
    const nowEnabled = state.prefs.displayScriptEnabled === true;
    if (nowEnabled && !scriptWasEnabled) logger.info("display script enabled", { byClientId, byKind: byKind ?? "unknown" });
    scriptWasEnabled = nowEnabled;
    bus.publish({ event: "prefs.changed", data: { prefs: state.prefs, rev: state.rev, byClientId, ...(byKind !== undefined ? { byKind } : {}) } });
  });
  // スクリプトが動く表示が設定で無効になったら、出ている面を全部閉じる（20261007-soda-extensions）。
  prefs.onChange(() => displays.onScriptSettingChanged());
  // 連携のグラフ（20260927-agent-graph）。読むのは `listen()` のロックの後（prefs と同じ）。保存できた変更は全クライアントへ配る。
  const graph = new GraphStore(options.stateDir, (err) =>
    logger.error("graph.changed listener failed", { error: err instanceof Error ? (err.stack ?? err.message) : String(err) }),
  );
  graph.onChange((g, byClientId) => bus.publish({ event: "graph.changed", data: { graph: g, byClientId } }));
  // 連携の実行（20260927-agent-graph の 02）。送信は方式の agent.prompt をサーバの中から呼ぶ（内部の clientId と何もしない sink。design D-2）。
  // 始めるのは `listen()` の復元の後・agentMonitor の前、止めるのは終了（graph.close の前）と引き継ぎの間。
  const graphSink: ClientSink = { clientId: GRAPH_CLIENT_ID, sendOutput: () => undefined, sendSnapshot: () => undefined, bufferedAmount: 0 };
  // 別のマシンの pane への接続（04）。グラフに載っているマシンだけ、中継のチャネルの上に external の接続を張る。閉じるのは実行を止めた後。
  const remoteLinks = new RemoteLinks({ machines, logger });
  const graphEngine = new GraphEngine({
    store: graph,
    local: new LocalAgentPort({
      bus,
      session,
      terminals,
      invoke: (method, params) => surface.invoke({ clientId: GRAPH_CLIENT_ID, sink: graphSink }, method, params),
    }),
    remote: remoteLinks,
    localLabel: osHostname(),
    publish: (e) => bus.publish(e),
    now: () => Date.now(),
    logger,
  });
  // エージェントが起動したエージェントの自動載せ（20261003-graph-auto-nodes）。記録はメモリだけ（引き継ぎで消える）なので、handoff の pausePollers では止めない。
  // 手元のすべての pane のノードを足し、囲いの重なりを直す（20261008-graph-first。起動の復元の後と、構造のできごとの後）。ノードを足すのはここだけで、
  // 上の自動載せは線だけを足す（線を足す前に、ここでノードをそろえてもらう）。
  const graphMaintainer = new GraphMaintainer({ bus, store: graph, session, logger });
  const lineage = new AgentLineage({ bus, store: graph, paneExists, logger, ensureNodes: () => graphMaintainer.reconcileNow() });
  // 閉じた pane のノードをグラフから外す。復元の後に `pruneMissing` で、止まっている間に閉じたものも外す。
  const paneCleanup = new GraphPaneCleanup({ bus, store: graph, paneExists, logger });
  // エージェントが中で動かしているサブエージェントの数え上げ（20261004-subagent-display）。フックの報告を受け口から受ける。
  const subagents = new SubagentTracker({
    bus,
    agentInstanceOf: (paneId) => session.getPane(paneId)?.agent?.instanceId ?? null,
    paneExists: (paneId) => session.getPane(paneId) !== undefined,
    publish: (paneId, value) => session.setAgentSubagents(paneId, value),
    now: () => Date.now(),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
    logger,
  });
  registerAllMethods(surface, {
    session,
    clients,
    sizeAuthority,
    terminals,
    worktrees,
    agentIntegrations,
    gitPoller,
    agentStarter,
    agentFork,
    serverSessions: () => listServerSessions(options.sessionRoot, options.sessionName), // 20260926-named-session-ui
    machines: () => machines.listWhenLoaded(), // 20260927-multi-host-machines（最初の読み込みを待つ）
    commands,
    metadata,
    images,
    asks,
    displays,
    extensions,
    files,
    prefs,
    graph,
    lineage,
    graphHistory: (linkId, limit) => graphEngine.getHistory(linkId, limit),
    // `server.stop`（20260927-cli-mode）。制御の socket の止める指示と同じ受け付けと停止の手順（`control` は下で作る。呼ばれるのは待ち受けの後）。
    stopServer: (reply) => control.stop(reply, "server.stop"),
  });
  // `/ws?machine=<id|名前>` は認証の後にそのマシンへの中継へ（`WsServerWs` は router の関数だけを知る。architecture の境界）。
  // 中継の接続は `WsGateway` を通らないので、手元のセッションの失効（ログアウト・token の作り直し）で閉じる印をここで持つ（`WsGateway` と同じ 4401）。
  const relayed = new Map<string, Set<WsConnection>>();
  auth.onSessionRevoked((sessionId) => {
    for (const conn of [...(relayed.get(sessionId) ?? [])]) conn.close(4401, "session revoked");
  });
  const wsServer = new WsServerWs(httpServer.server, originRejections, auth.authorizeUpgrade, logger, (selector) => {
    const route = machines.route(selector);
    if (route.kind !== "ok") return route;
    return {
      kind: "ok",
      attach: (conn, sessionId) => {
        const set = relayed.get(sessionId) ?? new Set<WsConnection>();
        relayed.set(sessionId, set);
        set.add(conn);
        conn.onClose(() => {
          set.delete(conn);
          if (set.size === 0 && relayed.get(sessionId) === set) relayed.delete(sessionId);
        });
        relayToMachine(conn, route.link);
      },
    };
  });
  // `/ws` は `listen()` の最後（復元と poller の開始の後）まで受け付けない（D102）。
  wsServer.setReady(false);
  new WsGateway(wsServer, surface, clients, sizeAuthority, terminals, bus, auth, logger, {
    onClientGone: (clientId) => {
      commands.onClientGone(clientId); // その接続の popup を止める（20260927-custom-command-keys）
      images.onClientGone(clientId); // 受け取り中の画像を捨てる（20260927-clipboard-image-paste）
      asks.onClientGone(clientId); // 質問を出した接続・質問を出せる画面の切断（20261002-sodactl-ask）
      displays.onClientGone(clientId); // 面を出せる画面の名乗り・この接続の display.wait（20261007-soda-extensions）
      fileUploads.onClientGone(clientId); // 受け取り中のファイルの書きかけを消す
    },
  });
  // 中継の受け口（20260927-multi-host-machines）。ほかのマシンの `soda serve` が SSH と `soda bridge` 越しに繋ぐ、状態ディレクトリの 0600 の socket。
  // 各チャネルは `/ws` の 1 接続と同じ（2 つ目の `WsGateway` に渡す）。待ち受けは `listen()` の最後（`/ws` と同じく復元の後）。
  const bridgeEndpoint = new BridgeEndpoint({ version: SERVER_VERSION, hostname: osHostname(), sessionName: options.sessionName ?? null }, logger);
  new WsGateway(bridgeEndpoint, surface, clients, sizeAuthority, terminals, bus, auth, logger, {
    onClientGone: (clientId) => {
      commands.onClientGone(clientId); // 中継の接続で開いた popup も止める
      images.onClientGone(clientId);
      asks.onClientGone(clientId);
      displays.onClientGone(clientId);
      fileUploads.onClientGone(clientId);
    },
  });
  let bridgeListening = false;

  let freshToken: string | undefined;
  /** 復元（または最初の workspace の作成）を済ませたか。済ませていない状態を session.json へ書かないために使う。 */
  let sessionLoaded = false;
  /** 公式フック連携の report を受け取るローカル socket（`listen()` で起動、`close()` で閉じる）。 */
  let agentReportSocket: AgentReportSocket | undefined;
  /** 更新時の引き継ぎ（20260926-live-handoff）の指示の受け口（Linux/macOS。`listen()` で起動、`close()` で閉じる）。 */
  let handoffSocket: HandoffSocket | undefined;
  let handoffResult: HandoffResult | undefined;
  /** 待ち受けたポート（`listen()` の 1'.）。 */
  let boundPortValue = options.port;
  const handoff = new HandoffController({
    stateDir: options.stateDir,
    logger,
    panes: () => session.snapshot().panes.map((p) => ({ paneId: p.id, host: terminals.get(p.id) })),
    scrollbackEditors: () => session.handoffScrollbackEditors(),
    boundPort: () => boundPortValue,
    pausePollers: async () => {
      graphEngine.stop(); // 20260927-agent-graph（待ちは取り消す。引き継いだ先が今の値を基準に始め直す）
      graphMaintainer.pause(); // 20261008-graph-first（引き継ぎの停止の間は維持を呼ばない。新しい版が起動の経路で呼ぶ）
      remoteLinks.closeAll(); // 別のマシンへの接続は実行を止めた後に閉じる（04。元に戻すときは start の ensure が開き直す）
      paneHistory?.stop();
      gitPoller.stop();
      await agentMonitor.stop();
      // マシンへの ssh を閉じ、子が終わるのを待つ（execve で置き換わった後は回収されずに残るため。引き継いだ先の起動がまた繋ぐ。20260927-multi-host-machines）。
      await machines.stop();
      // 拡張の子と孫を止める（execve で置き換わった後は回収されずに残るため。引き継いだ先の起動がまた起動する。20261007-ext-host）。
      await extensions.stop();
    },
    resumePollers: () => {
      graphEngine.start();
      graphMaintainer.resume(); // 止まっている間のできごとを拾う
      gitPoller.start();
      agentMonitor.start();
      void machines.start();
      void extensions.start(); // 止めていなくても呼べる（動いているものを二重に起動しない）
      paneHistory?.start(internal.paneHistorySaveIntervalMs);
    },
    flushSession: async () => {
      await persist.flush();
      await graph.flush(); // 20260927-agent-graph（書きかけの graph.json を残して置き換わらない）
    },
    closeClients: () => {
      wsServer.setReady(false);
      wsServer.closeAll(1012, "server restarting");
      bridgeEndpoint.setReady(false);
      bridgeEndpoint.closeAll(1012, "server restarting");
      // ログイン不要の受け口（20261003-sodactl-ask-socket）も `/ws` と揃える: 待っている接続は何も書かずに捨て（質問は取り消し）、
      // 最中の新しい接続は `pane_socket_busy` で断る。待ち受けは閉じない（execve の後、新しい版が同じパスに置き直す）。
      paneSocket.pause();
    },
    reopenClients: () => {
      wsServer.setReady(true);
      bridgeEndpoint.setReady(true);
      paneSocket.resume();
    },
    flushLog: () => logger.flush(),
    preflight: internal.handoffPreflight ?? (() => runPreflight()),
    // 同じ Node・同じ引数（ディスク上の同じ入口）で自分を置き換える。PTY の master は close-on-exec が無いので残る（research F2.2）。
    execve:
      internal.handoffExecve ??
      ((nonce) =>
        process.execve!(process.execPath, [process.execPath, ...process.execArgv, ...process.argv.slice(1)], {
        ...process.env,
        [HANDOFF_NONCE_ENV]: nonce,
      })),
    platform: platform(),
    hasExecve: typeof process.execve === "function",
  });
  /** 制御の socket に届いた指示の受け付けの判断（止める指示・止まる途中の引き継ぎの拒否。20260927-session-stop）。 */
  const control = createControlRequests({ handoff });

  /** 無効なら消して undefined。有効なら読み、使えなければ（無い・大きすぎる・壊れている・読めない）ログに残して undefined（AC4・AC7）。 */
  async function loadPaneHistory(): Promise<ReadonlyMap<string, PaneHistoryEntry> | undefined> {
    if (!options.paneHistory) {
      await clearPaneHistory("pane history disabled");
      return undefined;
    }
    try {
      const result = await paneHistoryFile.load();
      if (result.kind === "ok") return result.panes;
      if (result.kind === "too_large") logger.warn("session-history.json is too large; restoring without pane history", { bytes: result.bytes });
      if (result.kind === "corrupt") logger.warn("session-history.json was corrupt; restoring without pane history", { reason: result.reason });
    } catch (err) {
      logger.warn("cannot read session-history.json; restoring without pane history", { error: err instanceof Error ? err.message : String(err) });
    }
    return undefined;
  }

  /** `session-history.json` を消す。消せなくても起動は続ける（decisions D6）。 */
  async function clearPaneHistory(why: string): Promise<void> {
    try {
      if (await paneHistoryFile.clear()) logger.info("removed session-history.json", { reason: why });
    } catch (err) {
      logger.warn("cannot remove session-history.json", { reason: why, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    httpServer,
    session,
    gitPoller,
    persist,
    terminals,
    manifestStore,
    graph,
    graphHistory: (linkId) => graphEngine.getHistory(linkId),
    graphRemoteAvailable: (machineId) => remoteLinks.get(machineId)?.available() === true,
    logger,
    options,
    get freshToken(): string | undefined {
      return freshToken;
    },
    get handoffResult(): HandoffResult | undefined {
      return handoffResult;
    },
    onStopRequest(fn: (source: StopSource) => void): void {
      control.setStopHandler(fn);
    },

    async listen(): Promise<void> {
      // 0. 状態ディレクトリのロック（D103）。bind・token・復元より前に取る。ポートを変えれば bind は両方成功する
      //    （docs の手元用 7780 と LAN 用 8443 等）ので、bind だけでは同じ state-dir の二重起動を止められず、2 つ目が
      //    全シェルを二重に起動し、session.json・auth.json を互いに上書きし合っていた。
      try {
        await lock.acquire();
      } catch (err) {
        if (err instanceof StateDirInUseError) {
          throw stateDirInUseError(err, options.stateDir, "serve", options.sessionSource === "env" ? options.sessionName : undefined);
        }
        throw err;
      }
      // 0''. 更新時の引き継ぎ（20260926-live-handoff）の受け取り。環境変数と handoff.json は使っても使わなくても消す（AC8）。
      //      自分で PTY を開く（復元）より前に行う——壊れた受け渡しのときに、このプロセスに残った master を閉じるため。
      const taken = await takeHandoff(options.stateDir, process.env).catch((err: unknown): { kind: "broken"; reason: string } => ({
        kind: "broken",
        reason: err instanceof Error ? err.message : String(err),
      }));
      if (taken.kind === "none" && taken.removedStale) logger.info("removed a leftover handoff.json");
      if (taken.kind === "broken") {
        const closed = closeOrphanPtyMasters();
        logger.error("handoff: the handoff data was unusable; closed the handed-off terminals and starting normally", { reason: taken.reason, closed });
      }
      if (taken.kind === "taken") {
        // 確かめに通らなかった fd は、自分で PTY を開く前に手放す——後にすると、同じ番号を新しいシェルの master が使っていて、それを閉じてしまう。
        if (taken.rejected.length > 0) discardRejectedPanes(taken.rejected, { logger });
        // 受け渡しに載らなかった master（古い版で読み取りを止めた後に作られた pane 等）も、見えないシェルとして残さない（Linux）。
        // これも PTY を開く前に行う——この時点でこのプロセスにある master は古い版から残ったものだけなので、受け渡しの fd 以外を閉じればよい
        // （復元の後だと、閉じかけの端末の fd と取り違えうる。review ラウンド 1）。
        const strays = closeOrphanPtyMasters({ keep: new Set(taken.panes.map((p) => p.fd)) });
        if (strays > 0) logger.warn("handoff: closed terminals that were not part of the handoff", { closed: strays });
      }
      if (taken.kind === "taken" && taken.port !== options.port) {
        logger.warn("handoff: listening on the configured port, which differs from the previous one", { previous: taken.port, port: options.port });
      }
      let takenPending = taken.kind === "taken" ? taken : undefined;
      try {
        // 0'. auth.json を読む（ロックを取った後。上記）。token は待ち受けに成功してから作る（D102）。
        await auth.initialize();
        // 0'（続き）. 共有の設定（20260927-cli-mode）。壊れていれば退避して空から始める（起動は止めない）。
        const loadedPrefs = await prefs.load();
        if (typeof loadedPrefs === "object") logger.warn("prefs.json was corrupt; starting with empty prefs", { backupPath: loadedPrefs.corrupt });
        scriptWasEnabled = prefs.get().prefs.displayScriptEnabled === true;
        // 0'（続き）. 連携のグラフ（20260927-agent-graph）。壊れていれば退避して空から始める（起動は止めない）。
        const loadedGraph = await graph.load();
        if (typeof loadedGraph === "object") logger.warn("graph.json was corrupt; starting with an empty graph", { backupPath: loadedGraph.corrupt });
        // 1. 待ち受け（bind）を最初に行う（D102）。失敗（ポートが使用中・このマシンに無いアドレス・権限の無いポート等）は
        //    reject で返す（呼び出し側が案内を出して終わる。拾わないと未処理の 'error' でプロセスが落ちる）。以前は token の
        //    作成・復元（全 pane のシェルの起動）・poller の後に bind していたため、失敗した起動が token を作って失い、
        //    シェルを起動し、session.json を上書きしえた。
        await new Promise<void>((resolve, reject) => {
          httpServer.server.once("error", reject);
          httpServer.server.listen(options.port, options.host, () => {
            httpServer.server.off("error", reject);
            resolve();
          });
        });
        // 1'. pane の中の sodactl の接続先（20260926-agent-skill-file）。ポートは実際に待ち受けたもの（パイプ等で数でなければ `options.port`）。
        const bound = httpServer.server.address();
        const boundPort = typeof bound === "object" && bound !== null ? bound.port : options.port;
        boundPortValue = boundPort;
        paneUrl = paneServerUrl(secure ? "https" : "http", options.host, boundPort);
        // 1''. 起動の記録（20260926-named-session-ui）。名前付き session のポートの記憶と、session の一覧の開くための情報に使う。書けなくても続ける。
        await writeServeRecord(options.stateDir, {
          pid: process.pid,
          hostname: osHostname(),
          port: boundPort,
          https: secure,
          host: options.host,
          ...(certSha256 !== undefined ? { certSha256 } : {}),
        }).catch((err: unknown) => logger.warn("cannot write serve.json", { error: err instanceof Error ? err.message : String(err) }));
        // 1-2. 手元からのログインの秘密（20260927-cli-mode）。書けなくても起動は続ける（端末版が繋げないだけ。ブラウザは token で入れる）。
        await localLogin.start().catch((err: unknown) =>
          logger.warn("cannot write local-auth.json; `soda` without arguments cannot connect", { error: err instanceof Error ? err.message : String(err) }),
        );
        // 2. token（初回だけ作る。表示は呼び出し側が行う——この後で失敗しても `freshToken` は読める）。
        const { created, token } = await auth.ensureToken();
        freshToken = created ? token : undefined;
        // 2.5. 公式フック連携の report 受け口（20260923-agent-session-resume）。復元（3.）で
        //      resume コマンドを投入した pane が hook を発火させうるため、それより前に立てる。
        agentReportSocket = await startAgentReportSocket(
          agentReportSocketPath,
          (report) => {
            if (report.type === "session") {
              if (isAgentIntegrationKind(report.kind)) session.reportAgentSession(report.paneId, report.kind, report.sessionId); // 連携の kind の全部（20261007-agent-hook-drift research X1）
            } else if (report.kind === "claude") {
              subagents.report(report); // サブエージェントの報告は claude だけ
            }
          },
          logger,
        );
        // 3. 起動時の復元（design「起動と再起動後の復元」）。引き継ぎの起動なら、渡された PTY を新しいシェルの代わりに使う。
        const loaded = await sessionFile.load();
        let adoptedPaneIds: ReadonlySet<string> = new Set();
        if (loaded.kind === "ok") {
          const adopted = takenPending !== undefined ? adoptedSpecsOf(takenPending) : undefined;
          const paneHistoryEntries = await loadPaneHistory();
          // ここから先は渡された fd の持ち主が端末（AdoptedPtyProcess）になりうる。失敗しても横から閉じない（プロセスの終わりか close() が閉じる）。
          const pending = takenPending;
          takenPending = undefined;
          ({ adoptedPaneIds } = await session.restore(loaded.data, { paneHistory: paneHistoryEntries, adopted }));
          takenPending = pending;
        } else {
          if (loaded.kind === "corrupt") logger.warn("session.json was corrupt; starting fresh", { backupPath: loaded.backupPath });
          // 新しく始める起動では pane の id を採番し直すので、古い画面履歴を新しい pane に取り違えないよう消す（AC5）。
          // 無効のとき（下の `loadPaneHistory` と同じ）も消す。
          await clearPaneHistory(options.paneHistory ? "session.json was not restored" : "pane history disabled");
          await session.ensureNotEmpty();
        }
        if (takenPending !== undefined) {
          const finished = takenPending;
          takenPending = undefined; // 以後の失敗で二度閉じない
          if (loaded.kind !== "ok") logger.error("handoff: session.json could not be restored; closing the handed-off terminals");
          handoffResult = finishTakenHandoff(finished, adoptedPaneIds, { logger });
          await session.adoptScrollbackEditors(finished.scrollbackEditors, adoptedPaneIds);
          handoff.recordTaken(handoffResult);
        }
        sessionLoaded = true;
        // 止まっている間に閉じた pane のノードを外す（復元した pane に無いもの。id は再利用されないので、`session.json` が読めなかった起動の保存済みノードもここで外れる）。
        const prunedNodes = await paneCleanup.pruneMissing();
        if (prunedNodes > 0) logger.info("graph.json had nodes of closed panes; removed them", { nodes: prunedNodes });
        paneHistory?.start(internal.paneHistorySaveIntervalMs);
        // クリップボードの画像の後片付け（20260927-clipboard-image-paste）。ロックを取った後に、起動時と 1 時間ごと（貼らなくなっても 24 時間で消す）。
        imageSweeper = imageStore.startSweeping();
        dropSweeper = dropStore.startSweeping(); // ドロップされたファイルも同じ間隔で片付ける
        // 3.4. 連携のグラフの維持（20261008-graph-first）。復元と `pruneMissing` の後・`graphEngine.start()` の前に、毎回呼ぶ（強制終了で pane だけが残った場合も
        //      拾う）。ノードの無い pane にノードを足し、囲いの重なりを直す。
        //      `schema: 1` のファイルを読んだ起動（移行）では、外接が大きすぎる workspace の詰め直しも行い、終わったら `schema: 2` で保存し直す。
        //      失敗しても起動は止めない（`schema: 1` のファイルが残り、次の起動でもう一度移行する）。
        try {
          const migrating = graph.migrationPending;
          await graphMaintainer.reconcileNow({ force: true, repack: migrating });
          if (!graphMaintainer.lastRunOk) {
            // 維持が直し切れなかった（検査に落ちた・競合が続いた）。移行を終えず、`schema: 1` のまま残して、次の起動でもう一度挑戦する。
            logger.warn("graph.json migration is postponed: the startup reconcile could not finish; it will be retried at the next start");
          } else {
            await graph.completeMigration();
            if (migrating) logger.info("graph.json was migrated to schema 2 (a copy of the old file is in graph-backups/)");
          }
        } catch (err) {
          logger.warn("graph.maintain: the startup reconcile failed", { error: err instanceof Error ? (err.stack ?? err.message) : String(err) });
        }
        // 3.5. 連携の実行（20260927-agent-graph）。状態の変化を購読するので agentMonitor より前に始める（最初の判定の変化から拾う）。
        graphEngine.start();
        // 4. poller。最初の 1 周の確認が終わったら、layout の無い保存から始めた移行を確定する（一時停止中の合図は捨てる。D18）。
        wireLayoutConfirmation(gitPoller, session);
        gitPoller.start();
        agentMonitor.start();
        // 4.5. 更新時の引き継ぎの指示の受け口（Linux/macOS。20260926-live-handoff）。復元と poller の開始の後に置く——起動の途中の指示で、
        //      復元の途中の session.json を保存したり、まだ始めていない poller を「再開」したりしないため。置けなくても起動は続ける。
        if (platform() !== "win32") {
          handoffSocket = await startHandoffSocket(handoffSocketPathFor(options.stateDir), control, logger).catch((err: unknown) => {
            logger.warn("cannot start the handoff socket; live handoff is unavailable", { error: err instanceof Error ? err.message : String(err) });
            return undefined;
          });
        }
        // 4.6. 中継の受け口（Linux/macOS。20260927-multi-host-machines）。置けなくても起動は続ける（ほかのマシンから繋げないだけ）。
        if (platform() !== "win32") {
          await bridgeEndpoint.listen(bridgeSocketPathFor(options.stateDir)).then(
            () => {
              bridgeListening = true;
            },
            (err: unknown) => logger.warn("cannot start the bridge socket; other machines cannot connect to this server", { error: err instanceof Error ? err.message : String(err) }),
          );
        }
        // 4.7. ログイン不要の受け口（Linux/macOS。20261003-sodactl-ask-socket）。置けなくても起動は続ける（pane の中の `sodactl ask` が
        //      繋げずに `/ws` の経路〔ログインが要る〕へ落ちるだけ）。Windows ではパスが無いので立てない。
        if (paneSocketPath !== undefined) {
          await paneSocket.listen(paneSocketPath).catch((err: unknown) =>
            logger.warn("cannot start the pane socket; `sodactl ask` in a pane needs a login", { error: err instanceof Error ? err.message : String(err) }),
          );
        }
        // 5. `/ws` の受け付けを始める。復元は bus にイベントを出さないので、ここより前に hello したクライアントは
        //    作りかけのスナップショットのまま取り残される（それまでは 503。ブラウザは間隔を空けて繋ぎ直す）。
        wsServer.setReady(true);
        // 6. 保存した SSH のマシンへ繋ぎ始める（20260927-multi-host-machines）。登録簿が無ければ何もしない（ssh を起こさない）。待たない。
        void machines.start();
        // 7. 拡張を起動する（20261007-ext-host）。ロックの後・復元の後。待たない（設定を読む処理が遅くても、`listen()` を止めない）。投げない。
        void extensions.start();
      } catch (err) {
        // 失敗した起動はロックを放す（`main` は close() を呼ばずに終わる）。放す前に、復元を済ませていない状態の保存の
        // 予約を取り消す（ロックを放した後に session.json を書かない）。
        if (!sessionLoaded) persist.cancel();
        graphEngine.stop();
        lineage.close();
        agentFork.close(); // 20261009-agent-fork: 裏で続いている検知・知らせの待ちをやめる
        graphMaintainer.close();
        paneCleanup.close();
        subagents.close();
        remoteLinks.closeAll();
        paneHistory?.stop();
        imageSweeper?.stop();
        dropSweeper?.stop();
        await extensions.stop().catch(() => undefined);
        await agentReportSocket?.close();
        await paneSocket.close(); // 立てていなければ何もしない
        await handoffSocket?.close();
        if (bridgeListening) await bridgeEndpoint.close();
        await localLogin.stop();
        // 引き継いだのに使う前に失敗した PTY は手放す（見えないプロセスを残さない）。
        if (takenPending !== undefined) discardHandedOffPanes(takenPending.panes, { logger }); // 復元に入る前の失敗だけ
        await lock.release();
        throw err;
      }
    },

    async close(): Promise<void> {
      try {
        // 止まり始めた印（以後の止める指示は「既に止まる途中」、引き継ぎの指示は断る。20260927-session-stop）。受け付け済みの引き継ぎの
        // 最中（Ctrl+C 等のシグナル）なら、それが終わる（元に戻す）まで待つ——以前は最初に制御の socket を閉じ、その接続の終わりを待つことで同じ順序になっていた。
        // 以後、エージェントが居ないと見えても会話の参照を捨てない（20261009-agent-resume-lost）。`beginClosing` は引き継ぎの終わりを待つので、その前に（同期で）入る。
        session.beginShutdown();
        await control.beginClosing();
        // マシンへの ssh を閉じる（リモートの `soda serve` と pane は動いたまま。AC5）。中継の接続には、ssh を閉じる前に手元の停止（1001）で閉じる
        // （手元の `/ws` と同じ code にそろえる。ブラウザ・sodactl はどちらも繋ぎ直しの扱いで、今は code で分けていない）。
        for (const set of relayed.values()) for (const conn of [...set]) conn.close(1001, "server shutting down");
        // 連携の実行を止めてから別のマシンへの接続を閉じる（20260927-agent-graph の 04。先に ssh を閉じると、切れた知らせで待ちを
        // machine_unavailable として履歴に残してしまう。止める＝待ちは履歴に残さず取り消し、送っている途中の結果も書かない）。graph.close の前。
        graphEngine.stop();
        lineage.close();
        agentFork.close(); // 20261009-agent-fork: 裏で続いている検知・知らせの待ちをやめる
        graphMaintainer.close();
        paneCleanup.close();
        subagents.close();
        remoteLinks.closeAll();
        await machines.stop();
        // 拡張の子と孫を止める（`machines.stop()` の後ろ。上限 3 秒）。`finally` でも止める。
        await extensions.stop();
        // 閉じ始めたら新しい `/ws` を受け付けない（closeAll の後に届いた upgrade を通さない。D102）。
        wsServer.setReady(false);
        bridgeEndpoint.setReady(false);
        await agentReportSocket?.close();
        // ログイン不要の受け口（20261003-sodactl-ask-socket）。開いている接続は何も書かずに捨てる（待っていた質問は取り消し。呼び出し側は接続が閉じたことで知る）。
        await paneSocket.close();
        // 実行中の判定周期を待ってから terminals/session を破棄する（review 指摘。should。D51 の隣の
        // agent/AgentMonitor.ts 参照）。
        await agentMonitor.stop();
        gitPoller.stop();
        // 画面履歴の定期保存は最初に止める（この後の flush が投げても、ロックを放した後にタイマーが残って書かない。T9 の独立点検）。
        paneHistory?.stop();
        // 復元を済ませる前（待ち受けに失敗した・復元の途中で失敗した起動）の状態で session.json を上書きしない（D102）。
        // 復元の途中の保存の予約（シェルが猶予中に終わった pane を閉じた等）も取り消す。
        if (sessionLoaded) await persist.flush();
        else persist.cancel();
        // 20260927-agent-graph：並んだ書き込みを書き終え、以後（まだ開いている接続からの graph.update 等）は断る——ロックを放した後に graph.json を書かない。
        await graph.close();
        // 画面履歴は端末を捨てる前に取り直して書く（design「停止」）。失敗しても投げない（AC13）。
        if (sessionLoaded) await paneHistory?.save({ force: true });
        for (const pane of session.snapshot().panes) terminals.dispose(pane.id);
        // 繋がったままの WebSocket を明示的に閉じる（レビュー指摘。無いと httpServer.server.close() が
        // 永久にコールバックを呼ばない）。
        wsServer.closeAll(1001, "server shutting down");
        bridgeEndpoint.closeAll(1001, "server shutting down");
        await bridgeEndpoint.close();
        await new Promise<void>((resolve) => httpServer.server.close(() => resolve()));
      } finally {
        // 独自コマンドの popup（モデルに入らない端末。20260927-custom-command-keys）。途中の処理が投げても止める。
        commands.dispose();
        // 受け口は質問を閉じる前に閉じる——`try` が上の `paneSocket.close()` より前で投げた経路でも、待っていた接続へ `cancelled` の返事を
        // 書かずに捨てる（2 回目は何もしない。`pane.sock` も残さない）。
        await paneSocket.close().catch(() => undefined);
        // 拡張を止めてから、台帳への後始末を外す（`try` の途中で投げても、子を止める。`stop()` は何度呼んでもよい）。
        await extensions.stop().catch(() => undefined);
        extensions.dispose();
        displays.dispose(); // 待っている display.wait を空の結果で返し、面を捨てる
        asks.dispose(); // 待っている質問を閉じる（受け口と `/ws` の接続を閉じた後。応答は誰にも届かない）
        // 独自トークンの期限のタイマーと購読（20260927-sidebar-row-tokens）。WebSocket を閉じた後に止める——閉じる前に止めると、
        // その間に既存の接続から届いた報告がタイマーを掛け直し、止めた後まで残る（タスク点検 T4 の指摘）。途中の処理が投げても止める。
        metadata.dispose();
        imageSweeper?.stop();
        await images.dispose(); // 書いている途中の画像を書き終えてから（ロックを放す前に）
        dropSweeper?.stop();
        await fileUploads.dispose(); // 受け取り中のファイルの書きかけを消してから（ロックを放す前に）
        // スクロールバックの一時ディレクトリ（20260926-edit-scrollback）。途中の処理が投げても消す。
        await session.disposeScrollbackEditors();
        // 制御の socket はロックを放す直前まで開けておく——止まる途中に届いた 2 回目の `soda session stop` が「既に止まる途中」と答えを受けて待てる
        // （20260927-session-stop の decisions D4）。止まる途中の引き継ぎは `beginClosing` で断っている。
        // （`HandoffSocket.close()` は今は reject しないが、将来 reject してもロックを残さないよう握る）
        await handoffSocket?.close().catch(() => undefined);
        await bridgeEndpoint.close().catch(() => undefined); // 途中で投げても受け口を残さない（2 回目は何もしない）
        // 手元からのログインの秘密を消す（20260927-cli-mode。止まったサーバの秘密を残さない。書いていなければ何もしない）。
        await localLogin.stop();
        // session.json を書き終えてから放す（D103。持っていなければ——ロックで断られた起動等——何もしない）。
        await lock.release();
      }
    },
  };
}

/**
 * 名前付き session で `--port` が無ければ、起動の記録（`serve.json`）のポートを使う（20260926-named-session-ui の design「ポートの記憶」）。
 * 記録が使えなければ（無い・読めない・壊れている）今までどおり。既定の session は記録を読まない（`--port` が無ければ 7780）。
 */
async function withRememberedPort(options: ServeOptions, rawArgs: RawServeArgs): Promise<ServeOptions> {
  if (options.sessionName === undefined || rawArgs.port !== undefined) return options;
  const record = await readServeRecord(options.stateDir);
  return record === undefined ? options : { ...options, port: record.port, portSource: "remembered" };
}

/** 証明書（PEM。連なりなら先頭＝サーバの証明書）の SHA-256 の指紋（`AA:BB:…`）。解釈できなければ undefined（`https.createServer` が先に断っている）。 */
function certFingerprint(pem: string): string | undefined {
  try {
    return new X509Certificate(pem).fingerprint256;
  } catch {
    return undefined;
  }
}

/** `--cert`/`--key` の PEM を読む。読めなければ設定の誤り（終了コード 2）にする。 */
async function readPem(path: string, flag: "--cert" | "--key"): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    throw new ConfigError(
      `cannot read ${flag} ${path}: ${err instanceof Error ? err.message : String(err)}`,
      `${flag} のファイルのパスと読み取り権限を確かめてください。`,
    );
  }
}

export function toSessionFileData(session: SessionService): SessionFileData {
  const snapshot = session.snapshot();
  // 仮の状態（移行の確定前）の間は `layout`・`repoGroups` を書かない（20261004-group-worktree-items）。
  const persistedLayout = session.persistedLayout();
  return {
    schema: 1,
    savedAt: new Date().toISOString(),
    groups: snapshot.groups.map((g) => ({ id: g.id, label: g.label, collapsed: g.collapsed })),
    ...(persistedLayout ? { layout: persistedLayout.layout, repoGroups: persistedLayout.repoGroups } : {}),
    workspaces: snapshot.workspaces.map((ws) => ({
      id: ws.id,
      label: ws.label,
      autoLabel: ws.autoLabel,
      groupId: ws.groupId,
      // 直前の判定。`git` が無いとき（管理外・判定前）は null——判定前でも項目は書く（「項目が無い」は以前の版の保存だけ）。復元で `git: null` に戻り、並びは変わらない。
      repoKey: ws.git?.repoKey ?? null,
      isLinkedWorktree: ws.git?.isLinkedWorktree ?? false,
      // その worktree（フォルダ）を示す値。代表の決まり（追補 01 A）に使うので、起動直後から同じ代表になるよう保存する。
      ...(typeof ws.git?.worktreeKey === "string" ? { worktreeKey: ws.git.worktreeKey } : {}),
      ...(typeof ws.git?.worktreeKey === "string" && typeof ws.representative === "boolean" ? { representative: ws.representative } : {}),
      cwd: ws.cwd,
      activeTabId: ws.activeTabId,
      // tab は並べ替えた順（`ws.tabIds`）で保存する——復元の tab の並びと、最初の tab（名前と git を決める場所。20260926-workspace-label-follow-cwd）が保たれる。
      tabs: ws.tabIds
        .flatMap((id) => snapshot.tabs.filter((t) => t.id === id))
        .map((tab) => ({
          id: tab.id,
          label: tab.label,
          focusedPaneId: tab.focusedPaneId,
          zoomedPaneId: tab.zoomedPaneId,
          layout: tab.layout,
          panes: snapshot.panes
            .filter((p) => p.tabId === tab.id)
            .map((p) => ({
              id: p.id,
              label: p.label,
              cwd: p.cwd,
              shell: p.shell,
              status: p.status,
              agentSession: p.agentSession ?? undefined,
            })),
        })),
    })),
    focus: snapshot.focus,
  };
}
