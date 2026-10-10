/**
 * 判定の周期と反映（architecture.md「agent/AgentMonitor」・design「判定の周期」）。
 * pane ごとに `AgentTracker` を持ち、前面ジョブ（`ProcessInspector.foregroundJob`）→ `ProcessMatcher.match` →
 * `ManifestStore.get` → `ManifestEngine.evaluate` → `AgentTracker.update` → `SessionService.updatePaneRuntime`
 * の1周期（architecture.md「5. エージェントの判定の1周期」）を回す。
 */
import type { PaneId } from "@sodashitsu/protocol";
import type { Disposable } from "../util/Disposable.js";
import type { EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";
import type { TerminalHost } from "../terminal/TerminalHost.js";
import type { TerminalManager } from "../terminal/TerminalManager.js";
import type { PaneRuntimePatch, SessionService } from "../session/SessionService.js";
import type { ForegroundJob, ProcessInspector } from "../platform/ProcessInspector.js";
import { AgentTracker, type Clock, type TrackerUpdateInput } from "./AgentTracker.js";
import { evaluate, type DetectionSnapshot } from "./ManifestEngine.js";
import type { ManifestStore } from "./ManifestStore.js";
import { agentProcessPids, agentResumeSessionId, match } from "./ProcessMatcher.js";

/** 出力があった pane の判定間隔（design「判定の周期」）。 */
const ACTIVE_INTERVAL_MS = 500;
/** 出力が無い pane の判定間隔。 */
const IDLE_INTERVAL_MS = 1000;
/** 起動直後の猶予中・working→idle の保留中は、短い間隔で再確認する（herdr の `AGENT_PENDING_IDLE_RECHECK`。D46）。 */
const FAST_RECHECK_INTERVAL_MS = 100;
/** 内部の心拍（上記のうち最も短い間隔に合わせる。各 pane は自分の間隔が来たときだけ実際に判定する）。 */
const HEARTBEAT_MS = FAST_RECHECK_INTERVAL_MS;
/** 判定に渡す画面下部の行数。claude のプロンプトの箱（水平線2本）を見つけるのに十分な余白を持たせた
 *  （herdr のルールで使う最大の bottom_non_empty_lines は12。T9 で実測はしていないが、余裕を見て60にした）。 */
const DETECTION_LINES = 60;
/** `ProcessInspector.foregroundJob` の上限。ネイティブ実装（例: Windows の `@vscode/windows-process-tree`
 *  はコールバックベースで reject 経路を持たない）がコールバックを一度も呼ばずに固まった場合の防御
 *  （review 指摘。should）。design の「状態反映2秒以内」の粒度に合わせた。 */
const PROCESS_INSPECTOR_TIMEOUT_MS = 2000;
/** 同じ pane・同じ理由の判定の失敗を、件数つきでまとめて出す間隔。 */
const JUDGMENT_FAILURE_LOG_INTERVAL_MS = 60_000;

interface PaneSchedule {
  lastJudgedAt: number;
  inFlight: boolean;
}

export interface AgentMonitorOptions {
  session: SessionService;
  terminals: TerminalManager;
  processInspector: ProcessInspector;
  manifestStore: ManifestStore;
  bus: EventBus;
  logger: Logger;
  clock?: Clock;
}

export class AgentMonitor {
  private readonly session: SessionService;
  private readonly terminals: TerminalManager;
  private readonly processInspector: ProcessInspector;
  private readonly manifestStore: ManifestStore;
  private readonly bus: EventBus;
  private readonly logger: Logger;
  private readonly clock: Clock;

  private readonly trackers = new Map<PaneId, AgentTracker>();
  private readonly schedules = new Map<PaneId, PaneSchedule>();
  private readonly failureLogs = new Map<PaneId, { error: string; lastLoggedAt: number; suppressed: number }>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busSubscription: Disposable | null = null;
  /** 実行中の判定周期（`judge()` の `.catch().finally()` まで込みのチェーン）。`stop()` が排出しきってから
   *  返るようにする（review 指摘。should。`composeServer.close()` が terminals/session を破棄する前に、
   *  実行中の周期が古い状態を参照したまま完了しないようにする）。 */
  private readonly inFlightJudgments = new Set<Promise<void>>();

  constructor(opts: AgentMonitorOptions) {
    this.session = opts.session;
    this.terminals = opts.terminals;
    this.processInspector = opts.processInspector;
    this.manifestStore = opts.manifestStore;
    this.bus = opts.bus;
    this.logger = opts.logger;
    this.clock = opts.clock ?? { now: () => Date.now() };
  }

  start(): void {
    if (this.timer) return;
    this.busSubscription = this.bus.subscribe((event) => {
      if (event.event === "session.focus_changed" && event.data.focus) this.handleFocusChanged(event.data.focus.paneId);
    });
    this.timer = setInterval(() => this.tick(), HEARTBEAT_MS);
    this.timer.unref?.();
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.busSubscription?.dispose();
    this.busSubscription = null;
    // 実行中の周期（`/proc` 走査等の await 中のもの）を全て待つ。`PROCESS_INSPECTOR_TIMEOUT_MS` があるので
    // 無限には待たない。ここで待たずに返すと、呼び出し元（`composeServer.close()`）が直後に
    // terminals/session を破棄したあとで、実行中の周期が破棄済みの pane を参照して完了することがある。
    await Promise.allSettled([...this.inFlightJudgments]);
  }

  private handleFocusChanged(paneId: PaneId): void {
    const tracker = this.trackers.get(paneId);
    if (!tracker) return;
    const updated = tracker.markSeen();
    if (updated !== null) this.session.updatePaneRuntime(paneId, { agent: updated });
  }

  private tick(): void {
    const now = this.clock.now();
    const paneIds = new Set(this.session.snapshot().panes.map((p) => p.id));
    for (const paneId of paneIds) this.maybeJudge(paneId, now);

    // 消えた pane の tracker/schedule を捨てる（design「そのエージェントが終了」）。
    for (const paneId of this.trackers.keys()) {
      if (!paneIds.has(paneId)) this.trackers.delete(paneId);
    }
    for (const paneId of this.schedules.keys()) {
      if (!paneIds.has(paneId)) this.schedules.delete(paneId);
    }
    for (const paneId of this.failureLogs.keys()) {
      if (!paneIds.has(paneId)) this.failureLogs.delete(paneId);
    }
  }

  private maybeJudge(paneId: PaneId, now: number): void {
    let schedule = this.schedules.get(paneId);
    if (!schedule) {
      // 初めて見る pane は、次の心拍ですぐ判定してよいようにしておく（`-Infinity` ならどの間隔を
      // 使っても必ず「もう間隔が経った」になる。`0` のままだと、出力がまだ無い pane は
      // IDLE_INTERVAL_MS(1秒) 待たされてから最初の判定が始まってしまう）。
      schedule = { lastJudgedAt: -Infinity, inFlight: false };
      this.schedules.set(paneId, schedule);
    }
    if (schedule.inFlight) return; // 前の周期がまだ終わっていない（architecture「5.」の直列化）。

    const host = this.terminals.get(paneId);
    if (!host) return; // まだ PTY が無い・既に破棄された。

    const tracker = this.trackerFor(paneId);
    const interval = tracker.needsFastRecheck()
      ? FAST_RECHECK_INTERVAL_MS
      : host.lastOutputAt() > schedule.lastJudgedAt
        ? ACTIVE_INTERVAL_MS
        : IDLE_INTERVAL_MS;
    if (now - schedule.lastJudgedAt < interval) return;

    schedule.inFlight = true;
    const cycle: Promise<void> = this.judge(paneId, host, tracker)
      .catch((err: unknown) => {
        this.logJudgmentFailure(paneId, String(err));
      })
      .finally(() => {
        schedule!.lastJudgedAt = this.clock.now();
        schedule!.inFlight = false;
        this.inFlightJudgments.delete(cycle);
      });
    this.inFlightJudgments.add(cycle);
  }

  /**
   * 判定の失敗のログ。同じ pane・同じ理由が続くときは、最初の 1 回だけ出し、その後は `JUDGMENT_FAILURE_LOG_INTERVAL_MS` ごとに
   * 件数つきで 1 行にまとめる（負荷が高い間に 4 千件を超えて埋まった。20261009-agent-resume-lost の AC6）。判定そのものの動きは変えない。
   */
  private logJudgmentFailure(paneId: PaneId, error: string): void {
    const now = this.clock.now();
    const prev = this.failureLogs.get(paneId);
    if (prev === undefined || prev.error !== error) {
      this.failureLogs.set(paneId, { error, lastLoggedAt: now, suppressed: 0 });
      this.logger.error("agent judgment failed", { paneId, error });
      return;
    }
    prev.suppressed++;
    if (now - prev.lastLoggedAt < JUDGMENT_FAILURE_LOG_INTERVAL_MS) return;
    this.logger.error("agent judgment failed", { paneId, error, repeated: prev.suppressed });
    prev.lastLoggedAt = now;
    prev.suppressed = 0;
  }

  private trackerFor(paneId: PaneId): AgentTracker {
    let tracker = this.trackers.get(paneId);
    if (!tracker) {
      tracker = new AgentTracker(() => this.session.allocateAgentInstanceId(), this.clock);
      this.trackers.set(paneId, tracker);
    }
    return tracker;
  }

  private async judge(paneId: PaneId, host: TerminalHost, tracker: AgentTracker): Promise<void> {
    const job = await this.foregroundJobWithTimeout(host.pid);
    const kind = job ? match(job) : null;
    // busy・cwd は前面プロセスグループから読む（design「busy」「pane の cwd」）。Windows は cwd を持たないので
    // OSC 7（mirror.cwdHint）を使う——`?? mirror.cwdHint()` の連鎖がこの分岐を自然に兼ねる。
    const leader = job?.processes.find((p) => p.pid === job.processGroupId) ?? null;
    const busy = job !== null && job.processGroupId !== host.pid;
    const cwd = leader?.cwd ?? host.mirror.cwdHint() ?? undefined;
    const title = host.mirror.title();

    let judgment: TrackerUpdateInput = "skip";
    if (kind !== null) {
      const manifest = this.manifestStore.get(kind);
      if (manifest) {
        const snapshot: DetectionSnapshot = { lines: host.mirror.bottomLines(DETECTION_LINES), oscTitle: title, oscProgress: host.mirror.progress() };
        judgment = evaluate(snapshot, manifest);
      } else {
        // ルールが読み込めていない種類（design「そのエージェントのルールが読み込めていないときはunknownにする」）。
        judgment = { state: "unknown", visibleIdle: false, visibleBlocker: false, visibleWorking: false };
      }
    }

    // 会話の参照の報告が、この pane の前面のエージェント自身のものかを確かめる材料（20261009-agent-session-attribution）。
    // 先に知らせる（検出の更新で、別のエージェントかを、プロセスで見分けるため）。
    this.session.setFrontAgent(
      paneId,
      kind !== null && job
        ? {
            kind,
            pids: new Set(agentProcessPids(job, kind)),
            verifiable: job.processes.every((p) => p.ppid !== undefined),
            ...(agentResumeSessionId(job, kind) !== undefined ? { resumeId: agentResumeSessionId(job, kind)! } : {}),
          }
        : null,
    );
    const trackerResult = tracker.update(kind, judgment);
    const patch: PaneRuntimePatch = { busy, title };
    if (cwd !== undefined) patch.cwd = cwd;
    if (trackerResult !== "unchanged") patch.agent = trackerResult;
    this.session.updatePaneRuntime(paneId, patch);
  }

  /** `ProcessInspector.foregroundJob` を上限付きで待つ。上限に達したら reject し、呼び出し側
   *  （`maybeJudge` の `.catch()`）が通常のエラーと同じようにログへ残す。本物の呼び出しが後から
   *  解決・拒否されても（結果はもう使わない）unhandled rejection にはしない。 */
  private foregroundJobWithTimeout(pid: number): Promise<ForegroundJob | null> {
    const real = this.processInspector.foregroundJob(pid);
    real.catch(() => undefined); // レースで無視されても unhandled rejection にしない
    const timeout = new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`processInspector.foregroundJob timed out after ${PROCESS_INSPECTOR_TIMEOUT_MS}ms`)),
        PROCESS_INSPECTOR_TIMEOUT_MS,
      );
      timer.unref?.();
    });
    return Promise.race([real, timeout]);
  }
}
