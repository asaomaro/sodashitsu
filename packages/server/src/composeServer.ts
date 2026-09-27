import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hostname as osHostname, platform } from "node:os";
import type { HostInfo } from "@wtm/protocol";
import { ConfigError, type RawServeArgs, type ServeOptions, agentReportSocketPathFor, resolveServeOptions, stateDirInUseError } from "./config.js";
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
import { createPaletteSource } from "./clients/answerPalette.js";
import { DefaultClientRegistry } from "./clients/ClientRegistry.js";
import { DefaultSizeAuthority } from "./clients/SizeAuthority.js";
import { ControlSurface } from "./surface/ControlSurface.js";
import { registerAllMethods } from "./surface/methods/index.js";
import { FsIntegrationFile } from "./persist/IntegrationFile.js";
import { FsAgentIntegrationInstaller } from "./agent/AgentIntegrationInstaller.js";
import { DefaultAgentIntegrationService } from "./agent/AgentIntegrationService.js";
import { startAgentReportSocket, type AgentReportSocket } from "./agent/AgentReportSocket.js";
import { HttpServer } from "./http/HttpServer.js";
import { WsServerWs } from "./ws/WsServerWs.js";
import { WsGateway } from "./ws/WsGateway.js";
import { AgentMonitor } from "./agent/AgentMonitor.js";
import { AgentStarter } from "./agent/AgentStarter.js";
import { DefaultManifestStore, type ManifestStore } from "./agent/ManifestStore.js";
import { FsManifestSource } from "./infra/FsManifestSource.js";
import { paneServerUrl } from "./util/net.js";
import { HANDOFF_NONCE_ENV, closeOrphanPtyMasters, takeHandoff } from "./handoff/HandoffManifest.js";
import { HandoffController } from "./handoff/HandoffController.js";
import { type HandoffSocket, handoffSocketPathFor, startHandoffSocket } from "./handoff/HandoffSocket.js";
import { runPreflight } from "./handoff/preflight.js";
import { type HandoffResult, adoptedSpecsOf, discardHandedOffPanes, discardRejectedPanes, finishTakenHandoff } from "./handoff/startup.js";

export interface ComposedServer {
  httpServer: HttpServer;
  session: SessionService;
  gitPoller: DefaultGitInfoPoller;
  persist: DefaultPersistScheduler;
  /** pane の端末（結合テストで pane へ書き、ミラーを読むため。20260926-screen-history-replay）。 */
  terminals: TerminalManager;
  /** 起動時の判定ルール読み込みの結果（smoke・結合テスト用。design「起動確認」・02-agent-detection T10）。 */
  manifestStore: ManifestStore;
  logger: Logger;
  options: ServeOptions;
  /**
   * token を初めて作った場合だけ値が入る（design「起動時の表示」）。token は `listen()` が待ち受けに成功してから作るので、
   * **`listen()` が resolve するまでは常に `undefined`**（待ち受けに失敗した起動で token を作って失わないため。D102）。
   */
  readonly freshToken: string | undefined;
  /**
   * 起動する（architecture.md「6. 起動と再起動後の復元」・D102・D103）：状態ディレクトリのロック（`wtm.lock`。生きている
   * 別の wtm が持っていれば `ConfigError`）→ auth.json の読み込み（ロックの後。組み立ての時点では読まない）→ 待ち受け
   * （bind。失敗したら reject）→ token の作成 → 復元（無ければ workspace を 1 つ作る）→ poller の開始 → `/ws` の受け付けの開始。ロックと bind を最初に行うので、同じ state-dir の wtm が既に
   * 動いている起動（ポートが違っても）や待ち受けに失敗した起動は、token を作らず・シェルを起動せず・session.json と
   * auth.json に触れない。失敗したらロックを放してから reject する。
   */
  listen(): Promise<void>;
  /** 止める。最後に状態ディレクトリのロックを放す（途中で失敗しても放す）。 */
  close(): Promise<void>;
  /** 更新時の引き継ぎ（20260926-live-handoff）で起動したときの結果（`listen()` の後。引き継ぎでない起動は undefined）。 */
  readonly handoffResult: HandoffResult | undefined;
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

/** 起動オプションから、部品をすべて組み立てる（composition root）。`main.ts` と `smoke.ts` の両方から使う。 */
export async function composeServer(
  rawArgs: RawServeArgs,
  /** テスト用の差し替え（結合テストが定期保存を短い間隔で観測する。20260926-screen-history-replay）。 */
  internal: { paneHistorySaveIntervalMs?: number } = {},
): Promise<ComposedServer> {
  const options = await withRememberedPort(resolveServeOptions(rawArgs), rawArgs);
  const logger = new FileLogger(join(options.stateDir, "server.log"));

  // 同じ state-dir の wtm を 2 つ動かさない（D103）。取るのは `listen()` の最初。放すときの失敗はログに残すだけ。
  const lock = new StateDirLock(options.stateDir, { logger });
  const authFile = new FsAuthFile(options.stateDir);
  // auth.json はここでは読まない——ロックを取ってから `listen()` で読む（D103）。組み立てとロックの間に `wtm token reset`
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
  let httpServer: HttpServer;
  try {
    httpServer = new HttpServer(auth, originRejections, rateLimiter, { webDistDir: webDistDirFor(), cert, key, logger });
  } catch (err) {
    // `https.createServer` は証明書と秘密鍵をその場で解釈する（PEM でない・鍵が合わない等で投げる）。
    if (!secure) throw err;
    throw new ConfigError(
      `cannot use the TLS certificate/key: ${err instanceof Error ? err.message : String(err)}`,
      "--cert と --key に、対になる PEM 形式の証明書と秘密鍵を指定してください（docs/tls-setup.md）。",
    );
  }

  const model = new SessionModel();
  const bus = new EventBus();
  const processInspector = pickProcessInspector();
  // 色・明暗の問い合わせの答え（20260921-theme-settings の design D6・20260924-dark-mode-report）は `session`（pane・tab）と `clients` から引くが、`session` は `terminals` を受けて
  // 作る（`clients` もその下）——先に箱を渡し、`clients` を作った直後に埋める。pane を作る（復元する）のは `listen()` の中で、埋めた後になる。
  // 埋まる前に問い合わせが来ても dracula（明暗は dark）で答える（投げない）。
  const palettes = createPaletteSource();
  const terminals = new DefaultTerminalManager(new NodePtyBackend(), processInspector, options.scrollbackLines, palettes.paletteFor, palettes.appearanceFor);
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
  const integrationFile = new FsIntegrationFile(options.stateDir);
  const agentIntegrationInstaller = new FsAgentIntegrationInstaller(agentHookScriptFor());
  const agentIntegrations = await DefaultAgentIntegrationService.load(agentIntegrationInstaller, integrationFile, bus);
  /** pane の環境の `WTM_SERVER_URL`（`listen()` で待ち受けた後に決める。それまでは undefined）。`SessionService` が読むので、それより前に宣言する。 */
  let paneUrl: string | undefined;
  const session = new SessionService({
    model,
    terminals,
    bus,
    persist,
    serverVersion: "0.1.0",
    host,
    scrollbackLines: options.scrollbackLines,
    defaultCwd,
    agentReportSocketPath,
    getAutoResumeEnabled: agentIntegrations.getAutoResumeEnabled,
    // pane の中の wtmctl の接続先（20260926-agent-skill-file）。待ち受けた後（`listen()` の 1.）に決まる。pane を起動するのはその後。
    serverUrlForPanes: () => paneUrl,
    sessionName: options.sessionName, // pane の環境の WTM_SESSION（20260926-named-session-ui）
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
  const agentStarter = new AgentStarter({ session, terminals, processInspector }); // 20260926-agent-start
  registerAllMethods(surface, {
    session,
    clients,
    sizeAuthority,
    terminals,
    worktrees,
    agentIntegrations,
    gitPoller,
    agentStarter,
    serverSessions: () => listServerSessions(options.sessionRoot, options.sessionName), // 20260926-named-session-ui
  });
  const wsServer = new WsServerWs(httpServer.server, originRejections, auth.authorizeUpgrade, logger);
  // `/ws` は `listen()` の最後（復元と poller の開始の後）まで受け付けない（D102）。
  wsServer.setReady(false);
  new WsGateway(wsServer, surface, clients, sizeAuthority, terminals, bus, auth, logger);

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
      paneHistory?.stop();
      gitPoller.stop();
      await agentMonitor.stop();
    },
    resumePollers: () => {
      gitPoller.start();
      agentMonitor.start();
      paneHistory?.start(internal.paneHistorySaveIntervalMs);
    },
    flushSession: () => persist.flush(),
    closeClients: () => {
      wsServer.setReady(false);
      wsServer.closeAll(1012, "server restarting");
    },
    reopenClients: () => wsServer.setReady(true),
    flushLog: () => logger.flush(),
    preflight: () => runPreflight(),
    // 同じ Node・同じ引数（ディスク上の同じ入口）で自分を置き換える。PTY の master は close-on-exec が無いので残る（research F2.2）。
    execve: (nonce) =>
      process.execve!(process.execPath, [process.execPath, ...process.execArgv, ...process.argv.slice(1)], {
        ...process.env,
        [HANDOFF_NONCE_ENV]: nonce,
      }),
    platform: platform(),
    hasExecve: typeof process.execve === "function",
  });

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
    logger,
    options,
    get freshToken(): string | undefined {
      return freshToken;
    },
    get handoffResult(): HandoffResult | undefined {
      return handoffResult;
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
      if (taken.kind === "taken" && taken.rejected.length > 0) {
        // 確かめに通らなかった fd は、自分で PTY を開く前に手放す——後にすると、同じ番号を新しいシェルの master が使っていて、それを閉じてしまう。
        discardRejectedPanes(taken.rejected, { logger });
      }
      if (taken.kind === "taken" && taken.port !== options.port) {
        logger.warn("handoff: listening on the configured port, which differs from the previous one", { previous: taken.port, port: options.port });
      }
      let takenPending = taken.kind === "taken" ? taken : undefined;
      try {
        // 0'. auth.json を読む（ロックを取った後。上記）。token は待ち受けに成功してから作る（D102）。
        await auth.initialize();
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
        // 1'. pane の中の wtmctl の接続先（20260926-agent-skill-file）。ポートは実際に待ち受けたもの（パイプ等で数でなければ `options.port`）。
        const bound = httpServer.server.address();
        const boundPort = typeof bound === "object" && bound !== null ? bound.port : options.port;
        boundPortValue = boundPort;
        paneUrl = paneServerUrl(secure ? "https" : "http", options.host, boundPort);
        // 1''. 起動の記録（20260926-named-session-ui）。名前付き session のポートの記憶と、session の一覧の開くための情報に使う。書けなくても続ける。
        await writeServeRecord(options.stateDir, { pid: process.pid, hostname: osHostname(), port: boundPort, https: secure, host: options.host }).catch(
          (err: unknown) => logger.warn("cannot write serve.json", { error: err instanceof Error ? err.message : String(err) }),
        );
        // 2. token（初回だけ作る。表示は呼び出し側が行う——この後で失敗しても `freshToken` は読める）。
        const { created, token } = await auth.ensureToken();
        freshToken = created ? token : undefined;
        // 2.5. 公式フック連携の report 受け口（20260923-agent-session-resume）。復元（3.）で
        //      resume コマンドを投入した pane が hook を発火させうるため、それより前に立てる。
        agentReportSocket = await startAgentReportSocket(
          agentReportSocketPath,
          (paneId, kind, sessionId) => {
            if (kind === "claude" || kind === "codex") session.reportAgentSession(paneId, kind, sessionId);
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
          // 受け渡しに載らなかった master（古い版で読み取りを止めた後に作られた pane 等）も、見えないシェルとして残さない（Linux）。
          // 残すのは、いまの端末（引き継いだ PTY と新しく起動したシェル）が使っている master だけ。
          const keep = new Set<number>();
          for (const p of session.snapshot().panes) {
            const fd = terminals.get(p.id)?.handoffFd?.();
            if (fd !== undefined) keep.add(fd);
          }
          const strays = closeOrphanPtyMasters({ keep });
          if (strays > 0) logger.warn("handoff: closed terminals that were not part of the handoff", { closed: strays });
          await session.adoptScrollbackEditors(finished.scrollbackEditors, adoptedPaneIds);
          handoff.recordTaken(handoffResult);
        }
        sessionLoaded = true;
        paneHistory?.start(internal.paneHistorySaveIntervalMs);
        // 4. poller。
        gitPoller.start();
        agentMonitor.start();
        // 4.5. 更新時の引き継ぎの指示の受け口（Linux/macOS。20260926-live-handoff）。復元と poller の開始の後に置く——起動の途中の指示で、
        //      復元の途中の session.json を保存したり、まだ始めていない poller を「再開」したりしないため。置けなくても起動は続ける。
        if (platform() !== "win32") {
          handoffSocket = await startHandoffSocket(handoffSocketPathFor(options.stateDir), handoff, logger).catch((err: unknown) => {
            logger.warn("cannot start the handoff socket; live handoff is unavailable", { error: err instanceof Error ? err.message : String(err) });
            return undefined;
          });
        }
        // 5. `/ws` の受け付けを始める。復元は bus にイベントを出さないので、ここより前に hello したクライアントは
        //    作りかけのスナップショットのまま取り残される（それまでは 503。ブラウザは間隔を空けて繋ぎ直す）。
        wsServer.setReady(true);
      } catch (err) {
        // 失敗した起動はロックを放す（`main` は close() を呼ばずに終わる）。放す前に、復元を済ませていない状態の保存の
        // 予約を取り消す（ロックを放した後に session.json を書かない）。
        if (!sessionLoaded) persist.cancel();
        paneHistory?.stop();
        await agentReportSocket?.close();
        await handoffSocket?.close();
        // 引き継いだのに使う前に失敗した PTY は手放す（見えないプロセスを残さない）。
        if (takenPending !== undefined) discardHandedOffPanes(takenPending.panes, { logger }); // 復元に入る前の失敗だけ
        await lock.release();
        throw err;
      }
    },

    async close(): Promise<void> {
      try {
        // 閉じ始めたら新しい `/ws` を受け付けない（closeAll の後に届いた upgrade を通さない。D102）。
        wsServer.setReady(false);
        await agentReportSocket?.close();
        await handoffSocket?.close();
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
        // 画面履歴は端末を捨てる前に取り直して書く（design「停止」）。失敗しても投げない（AC13）。
        if (sessionLoaded) await paneHistory?.save({ force: true });
        for (const pane of session.snapshot().panes) terminals.dispose(pane.id);
        // 繋がったままの WebSocket を明示的に閉じる（レビュー指摘。無いと httpServer.server.close() が
        // 永久にコールバックを呼ばない）。
        wsServer.closeAll(1001, "server shutting down");
        await new Promise<void>((resolve) => httpServer.server.close(() => resolve()));
      } finally {
        // スクロールバックの一時ディレクトリ（20260926-edit-scrollback）。途中の処理が投げても消す。
        await session.disposeScrollbackEditors();
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

function toSessionFileData(session: SessionService): SessionFileData {
  const snapshot = session.snapshot();
  return {
    schema: 1,
    savedAt: new Date().toISOString(),
    nextId: session.getNextIdCounters(),
    groups: snapshot.groups.map((g) => ({ id: g.id, label: g.label, collapsed: g.collapsed })),
    workspaces: snapshot.workspaces.map((ws) => ({
      id: ws.id,
      label: ws.label,
      autoLabel: ws.autoLabel,
      groupId: ws.groupId,
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
