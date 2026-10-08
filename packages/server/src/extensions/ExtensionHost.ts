import { randomUUID } from "node:crypto";
import { stat as fsStat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  EXTENSIONS_FILE_NAME,
  EXTENSIONS_RUNNING_MAX,
  EXTENSION_BACKOFF,
  EXTENSION_CRASH_MAX,
  EXTENSION_FILE_TIMEOUT_MS,
  EXTENSION_APPROVALS_POLL_MS,
  EXTENSION_PANES_DEBOUNCE_MS,
  EXTENSION_PROJECT_ROOTS_MAX,
  EXTENSION_RETRY_AFTER_TIMEOUT,
  EXTENSION_ROOTS_RESOLVE,
  EXTENSION_SCOPE_REVIEW_MS,
  EXTENSION_STABLE_MS,
  EXTENSION_TOTAL_INPUT_BYTES_RATE,
  RpcError,
  type ExtLine,
  type ExtPane,
  type ExtensionFileProblem,
  type ExtensionInfo,
  type ExtensionListResult,
  type ExtensionLogResult,
  type ExtensionRunState,
  type ExtensionExitReason,
  type ExtensionApprovalView,
  type ExtensionScope,
  type ExtDisplayEvent,
} from "@sodashitsu/protocol";
import type { Disposable, EventBus } from "../bus/EventBus.js";
import type { DisplayService } from "../display/DisplayService.js";
import type { Logger } from "../log/Logger.js";
import { realClock, type Clock } from "../machine/MachineLink.js";
import type { SessionService } from "../session/SessionService.js";
import { entryDigest, instanceKey } from "./approval.js";
import { createExtensionApi, type ApiExtension } from "./ExtensionApi.js";
import { ExtensionProcess, DebtBucket, type ExtExit, type ExtSpawn, type KillGroup, type RunFile } from "./ExtensionProcess.js";
import { ExtensionStateStore, type ExtensionStateLoad, type StateFileDeps } from "./ExtensionStateStore.js";
import { ApprovalSet, ApprovalStore, type ApprovalEntry, type ApprovalFileDeps } from "./ApprovalStore.js";
import { buildExtensionEnv } from "./extensionLaunch.js";
import {
  loadProjectExtensionsFile,
  loadUserExtensionsFile,
  type ExtensionEntry,
  type ExtensionFileDeps,
  type ExtensionFileLoad,
  type ProjectExtensionsLoad,
  type ProjectFileDeps,
} from "./extensionConfig.js";
import { resolveProjectRoot, type ProjectRootDeps } from "./projectRoot.js";

/**
 * 拡張の持ち主（20261007-ext-host）。設定を読み、「動かすべき拡張」の集合を計算し、いま動いているものとの差を埋める。
 * **拡張のコマンドを `spawn` するのは `startOne` の 1 か所だけ**（ほかのきっかけは、`reconcile` か `startOne` を呼ぶだけで、自分では起動しない）。
 * 利用者の設定（`<stateDir>/extensions.json`）と、プロジェクトの設定（`<根>/.soda/extensions.json`。PR3）を読む。
 * **プロジェクトの拡張は、利用者が承認したもの（鍵が承認の記録と一致するもの）だけ動かす**。承認の検査は 2 重: `reconcile` が `decision` を決め、
 * `startOne` が `spawn` の直前に、設定と承認の記録を読み直して確かめる（承認していないものは、どのきっかけでも実行されない）。
 */

export interface ExtensionHostOptions {
  stateDir: string;
  sessionRoot: string;
  session: Pick<SessionService, "snapshot" | "commandContext" | "hasPane">;
  displays: DisplayService;
  bus: EventBus;
  isScreenKind(clientId: string): boolean;
  baseEnv: NodeJS.ProcessEnv;
  homeDir: string;
  logger: Logger;
  clock?: Clock;
  newId?: () => string;
  deps?: {
    spawn?: ExtSpawn;
    killGroup?: KillGroup;
    runFile?: RunFile;
    file?: Partial<ExtensionFileDeps>;
    /** プロジェクトの設定の読み込みの差し替え（テストだけ）。 */
    projectFile?: Partial<ProjectFileDeps>;
    /** プロジェクトの根を引く処理の差し替え（テストだけ）。 */
    projectRoot?: Partial<ProjectRootDeps>;
    /** 承認の記録の読み書きの差し替え（テストだけ）。 */
    approvalFile?: Partial<ApprovalFileDeps>;
    /** 根のディレクトリ・設定ファイルが残っているかの確かめの差し替え（テストだけ。無ければ `false`、読めない誤りは投げる）。 */
    pathExists?: (path: string) => Promise<boolean>;
    /** 無効の記録の読み書きの差し替え（テストだけ）。 */
    stateFile?: Partial<StateFileDeps>;
    platform?: NodeJS.Platform;
    /** テストだけが変える（実時間の待ちを短くする）。本番は定数のまま。 */
    timings?: Partial<{ backoffMinMs: number; backoffMaxMs: number; stableMs: number; approvalsPollMs: number; scopeReviewMs: number }>;
    /** テストだけが変える（少ない数で上限を確かめる）。 */
    limits?: Partial<{ runningMax: number }>;
    /** テストだけが差し替える（範囲の検査）。 */
    inScope?: (ext: ApiExtension, paneId: string) => boolean;
  };
}

/** 承認の状態（プロジェクトだけ）。 */
interface ApprovalState {
  status: "approved" | "denied" | "none";
  decidedAt?: string;
  previous?: ApprovalEntry;
  deniedBefore: boolean;
  approvedAlive: boolean;
}

interface Desired {
  entry: ExtensionEntry;
  key: string;
  digest: string;
  scope: ExtensionScope;
  root: string | null;
  configPath: string;
  decision: "eligible" | "disabled" | "pending" | "denied";
  disabledByUser: boolean;
  groupWritable: boolean;
  approval?: ApprovalState;
}

interface Run {
  proc: ExtensionProcess;
  runId: string;
  tag: string;
  digest: string;
  startedAt: number;
  ext: ApiExtension;
  /** 最後に送った pane の一覧（同じなら送らない）。 */
  lastPanes: string;
}

type StatusState = "running" | "backoff" | "failed" | "exited" | "over_limit" | "waiting";
interface Status {
  state: StatusState;
  failures: number;
  digest: string;
  nextRetryAt?: number;
  timer?: unknown;
  lastExit?: { code: number | null; signal: string | null; at: string; reason: ExtensionExitReason; runId: string };
  lastLog?: ExtensionLogResult;
}

async function defaultPathExists(path: string): Promise<boolean> {
  try {
    await fsStat(path);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return false;
    throw err;
  }
}

/** 最初のイベントから `maxMs` を超えて先送りしない、まとめ処理。 */
class Debouncer {
  private timer: unknown = null;
  private firstAt = 0;
  constructor(
    private readonly clock: Clock,
    private readonly ms: number,
    private readonly maxMs: number,
    private readonly fn: () => void,
  ) {}
  poke(): void {
    const now = this.clock.now();
    if (this.timer === null) {
      this.firstAt = now;
    } else {
      this.clock.clearTimeout(this.timer);
    }
    const wait = Math.max(0, Math.min(this.ms, this.maxMs - (now - this.firstAt)));
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      this.fn();
    }, wait);
  }
  cancel(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.timer = null;
  }
}

const PANE_EVENTS = new Set(["pane.created", "pane.closed", "tab.created", "tab.closed", "layout.updated", "workspace.updated", "workspace.created", "workspace.closed", "pane.updated"]);
/** workspace の増減（プロジェクトの根・設定を読み直すきっかけ）。 */
const WORKSPACE_EVENTS = new Set(["workspace.created", "workspace.closed"]);

export class ExtensionHost {
  private readonly clock: Clock;
  private readonly newId: () => string;
  private readonly platform: NodeJS.Platform;
  private readonly timings: { backoffMinMs: number; backoffMaxMs: number; stableMs: number; scopeReviewMs: number; approvalsPollMs: number };
  private readonly runningMax: number;
  private readonly userConfigPath: string;
  private readonly stateStore: ExtensionStateStore;
  private readonly statePath: string;
  private readonly approvals: ApprovalStore;
  private readonly totalBytes = new DebtBucket(EXTENSION_TOTAL_INPUT_BYTES_RATE);
  private readonly api;
  private readonly inScopeFn: (ext: ApiExtension, paneId: string) => boolean;

  /** workspace の id → プロジェクトの根（null は git の外）。引けなかった workspace は入れない。作り終えてから差し替える。 */
  private workspaceRoots = new Map<string, string | null>();
  /** 根を、覚えを使わずに全部引き直す（`reload`）。 */
  private forceRoots = false;
  /** 最後に読んだ承認の記録。 */
  private approvalSet = new ApprovalSet([], null);
  private approvalSig: string | null = null;
  private approvalTimer: unknown = null;
  private sigInflight = false;
  private readonly workspaceDebounce: Debouncer;

  private desired = new Map<string, Desired>();
  private readonly runs = new Map<string, Run>();
  private readonly status = new Map<string, Status>();
  private problems: ExtensionFileProblem[] = [];
  private chain: Promise<void> = Promise.resolve();
  private readonly closing = new Set<ExtensionProcess>();
  private stopped = true;
  private epoch = 0;
  private disposed = false;

  private busSub: Disposable | null = null;
  private ownedSub: Disposable | null = null;
  private scopeTimer: unknown = null;
  private reconcileQueued = false;
  private retryTimer: unknown = null;
  private timeoutRetries = 0;
  private sawTimeout = false;
  private readonly inflight = new Set<string>();
  private lastEmitted: string | null = null;
  private readonly panesDebounce: Debouncer;

  constructor(private readonly opts: ExtensionHostOptions) {
    this.clock = opts.clock ?? realClock;
    this.newId = opts.newId ?? randomUUID;
    this.platform = opts.deps?.platform ?? process.platform;
    this.timings = {
      backoffMinMs: opts.deps?.timings?.backoffMinMs ?? EXTENSION_BACKOFF.minMs,
      backoffMaxMs: opts.deps?.timings?.backoffMaxMs ?? EXTENSION_BACKOFF.maxMs,
      stableMs: opts.deps?.timings?.stableMs ?? EXTENSION_STABLE_MS,
      scopeReviewMs: opts.deps?.timings?.scopeReviewMs ?? EXTENSION_SCOPE_REVIEW_MS,
      approvalsPollMs: opts.deps?.timings?.approvalsPollMs ?? EXTENSION_APPROVALS_POLL_MS,
    };
    this.runningMax = opts.deps?.limits?.runningMax ?? EXTENSIONS_RUNNING_MAX;
    this.userConfigPath = join(opts.stateDir, EXTENSIONS_FILE_NAME);
    this.stateStore = new ExtensionStateStore(opts.stateDir, opts.deps?.stateFile);
    this.statePath = join(opts.stateDir, "extension-state.json");
    this.approvals = new ApprovalStore(opts.sessionRoot, opts.deps?.approvalFile);
    // 利用者の拡張は、pane が実在すれば範囲の中。プロジェクトの拡張は、pane のある workspace の根が、拡張の根と文字列として等しいときだけ（要求のたびに引く）。
    this.inScopeFn = opts.deps?.inScope ?? ((ext, paneId) => this.defaultInScope(ext, paneId));
    this.api = createExtensionApi({
      displays: opts.displays,
      panes: (ext) => this.panesFor(ext),
      inScope: (ext, paneId) => this.inScopeFn(ext, paneId),
      logger: opts.logger,
    });
    this.panesDebounce = new Debouncer(this.clock, EXTENSION_PANES_DEBOUNCE_MS, 500, () => this.refreshPanes());
    this.workspaceDebounce = new Debouncer(this.clock, 200, 1_000, () => this.scheduleReconcile());
  }

  /** 範囲: 利用者の拡張は pane が実在すれば真。プロジェクトの拡張は、その pane の workspace の根が、拡張の根と文字列として等しいときだけ。根の無い workspace は外。 */
  private defaultInScope(ext: ApiExtension, paneId: string): boolean {
    if (!this.opts.session.hasPane(paneId)) return false;
    if (ext.scope === "user") return true;
    if (ext.root === null) return false;
    let workspaceId: string;
    try {
      workspaceId = this.opts.session.commandContext(paneId).workspaceId;
    } catch {
      return false;
    }
    const root = this.workspaceRoots.get(workspaceId);
    return root !== undefined && root !== null && root === ext.root;
  }

  // --- ログ ---------------------------------------------------------------------------------------------------------

  /** ログに書くのは、拡張の key・runId・状態・終了コード・理由・行数だけ（コマンド・標準エラーの中身・面の中身・設定の値は書かない）。 */
  private note(level: "info" | "warn", msg: string, fields: Record<string, unknown>): void {
    try {
      this.opts.logger[level](msg, fields);
    } catch {
      // ログの失敗で止めない
    }
  }

  // --- 直列化 -------------------------------------------------------------------------------------------------------

  /** 外向きの入口だけが使う。仕事を 1 つずつ実行する（途中で例外が出ても、次は走る）。 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(() => fn());
    this.chain = p.then(
      () => undefined,
      (err) => this.note("warn", "extension job failed", { kind: err instanceof Error ? err.constructor.name : typeof err }),
    );
    return p;
  }

  /** 「いまの仕事が終わった後に、差を埋める仕事を 1 つ、chain の末尾へ足す」（待たない。既に予約があれば足さない）。 */
  private scheduleReconcile(): void {
    if (this.stopped || this.reconcileQueued) return;
    this.reconcileQueued = true;
    void this.enqueue(async () => {
      this.reconcileQueued = false;
      await this.reconcile();
    }).catch(() => undefined);
  }

  // --- ファイルを読む（1 回 2 秒の上限・前の読み取りが返っていなければ出さない） ------------------------------------------------------

  private async readTimed<T>(slot: string, fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    if (this.inflight.has(slot)) {
      this.sawTimeout = true;
      return { ok: false };
    }
    this.inflight.add(slot);
    const p = fn();
    void p.then(
      () => this.inflight.delete(slot),
      () => this.inflight.delete(slot),
    );
    let timer: unknown;
    const timeout = new Promise<"timeout">((r) => {
      timer = this.clock.setTimeout(() => r("timeout"), EXTENSION_FILE_TIMEOUT_MS);
    });
    try {
      const r = await Promise.race([p, timeout]);
      if (r === "timeout") {
        this.sawTimeout = true;
        void p.catch(() => undefined);
        return { ok: false };
      }
      return { ok: true, value: r };
    } catch (err) {
      this.note("warn", "extension read failed", { kind: err instanceof Error ? err.constructor.name : typeof err, slot });
      return { ok: false };
    } finally {
      this.clock.clearTimeout(timer);
    }
  }

  /** 時間切れが 1 つでもあったら、5 秒後に差を埋める仕事を 1 回予約する（続けて 3 回まで）。無ければ、回数を戻す。 */
  private afterPass(): void {
    if (this.sawTimeout) {
      this.sawTimeout = false;
      if (this.stopped || this.retryTimer !== null || this.timeoutRetries >= EXTENSION_RETRY_AFTER_TIMEOUT.max) return;
      this.timeoutRetries += 1;
      this.retryTimer = this.clock.setTimeout(() => {
        this.retryTimer = null;
        this.scheduleReconcile();
      }, EXTENSION_RETRY_AFTER_TIMEOUT.delayMs);
    } else {
      this.timeoutRetries = 0;
    }
  }

  // --- 寿命 ---------------------------------------------------------------------------------------------------------

  /** 何度呼んでもよい（動いていれば、差を埋めるだけ）。ロックの後に呼ぶ。**投げない**。 */
  async start(): Promise<void> {
    try {
      this.stopped = false;
      this.disposed = false;
      if (this.busSub === null) {
        this.busSub = this.opts.bus.subscribe((e) => {
          // 例外は pane の処理へ伝わる。必ず包み、中ではタイマーを掛けるだけ。
          try {
            if (this.stopped) return;
            if (PANE_EVENTS.has(e.event)) this.panesDebounce.poke();
            if (WORKSPACE_EVENTS.has(e.event)) {
              // 消えた workspace の pane はもう無いので、根の覚えはその場で消してよい。差を埋めるのは、まとめてから。
              if (e.event === "workspace.closed") this.workspaceRoots.delete(e.data.workspaceId);
              this.workspaceDebounce.poke();
            }
          } catch {
            // 握りつぶす
          }
        });
      }
      if (this.ownedSub === null) {
        this.ownedSub = this.opts.displays.onOwnedEvent((tag, ev) => {
          try {
            this.onOwned(tag, ev);
          } catch (err) {
            this.note("warn", "extension owned event failed", { kind: err instanceof Error ? err.constructor.name : typeof err });
          }
        });
      }
      if (this.scopeTimer === null) {
        this.scopeTimer = this.clock.setInterval(() => {
          try {
            this.reviewScope();
          } catch (err) {
            this.note("warn", "extension scope review failed", { kind: err instanceof Error ? err.constructor.name : typeof err });
          }
        }, this.timings.scopeReviewMs);
      }
      if (this.approvalTimer === null) {
        this.approvalTimer = this.clock.setInterval(() => this.pollApprovals(), this.timings.approvalsPollMs);
      }
      await this.enqueue(() => this.reconcile());
    } catch (err) {
      this.note("warn", "extension start failed", { kind: err instanceof Error ? err.constructor.name : typeof err });
    }
  }

  /** `chain` を待たずに、全部を並行に止めて待つ（上限 3 秒）。返った後に、子が起動することは無い。後で `start()` できる。 */
  async stop(): Promise<void> {
    this.stopped = true;
    this.epoch += 1;
    this.panesDebounce.cancel();
    this.workspaceDebounce.cancel();
    if (this.approvalTimer !== null) this.clock.clearInterval(this.approvalTimer);
    this.approvalTimer = null;
    if (this.scopeTimer !== null) this.clock.clearInterval(this.scopeTimer);
    this.scopeTimer = null;
    if (this.retryTimer !== null) this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.timeoutRetries = 0;
    this.reconcileQueued = false;
    this.sawTimeout = false;
    // backoff の待ちを捨てる（failures は残す。次の start() の差を埋める処理が、起動し直す）。
    for (const st of this.status.values()) {
      if (st.timer !== undefined) this.clock.clearTimeout(st.timer);
      delete st.timer;
      delete st.nextRetryAt;
    }
    for (const [key, run] of [...this.runs]) this.finishRun(key, run.runId, "stopped");
    const procs = [...this.closing];
    await Promise.all(procs.map((p) => p.stop("stopped").catch(() => undefined)));
  }

  /** bus の購読・見張り・タイマーを外す。以後、`finishRun`・受け手は、台帳に触れない。 */
  dispose(): void {
    this.disposed = true;
    this.busSub?.dispose();
    this.busSub = null;
    this.ownedSub?.dispose();
    this.ownedSub = null;
    if (this.scopeTimer !== null) this.clock.clearInterval(this.scopeTimer);
    this.scopeTimer = null;
    if (this.retryTimer !== null) this.clock.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.panesDebounce.cancel();
    this.workspaceDebounce.cancel();
    if (this.approvalTimer !== null) this.clock.clearInterval(this.approvalTimer);
    this.approvalTimer = null;
    for (const st of this.status.values()) if (st.timer !== undefined) this.clock.clearTimeout(st.timer);
  }

  /** 承認の記録の見張り（`stat` の署名）。変わっていれば差を埋める（別の session のサーバでの承認・取り消しを拾う）。前の `stat` が返っていなければ出さない。 */
  private pollApprovals(): void {
    if (this.stopped || this.sigInflight) return;
    this.sigInflight = true;
    void this.approvals
      .signature()
      .then((sig) => {
        if (this.stopped) return;
        if (this.approvalSig !== null && sig !== this.approvalSig) this.scheduleReconcile();
      })
      .catch(() => undefined)
      .finally(() => {
        this.sigInflight = false;
      });
  }

  // --- 一覧 ---------------------------------------------------------------------------------------------------------

  list(): ExtensionListResult {
    const extensions: ExtensionInfo[] = [];
    for (const d of this.desired.values()) {
      const run = this.runs.get(d.key);
      const st = this.status.get(d.key);
      let state: ExtensionRunState;
      if (d.decision === "disabled") state = "disabled";
      else if (d.decision === "pending") state = "pending";
      else if (d.decision === "denied") state = "denied";
      else if (run) state = "running";
      else if (st && st.state !== "running") state = st.state;
      else state = this.stopped ? "exited" : "backoff";
      const info: ExtensionInfo = {
        key: d.key,
        id: d.entry.id,
        scope: d.scope,
        ...(d.root !== null ? { root: d.root } : {}),
        configPath: d.configPath,
        allow: [...d.entry.allow],
        onUnresponsive: d.entry.onUnresponsive,
        state,
        enabledInConfig: d.entry.enabled,
        disabledByUser: d.disabledByUser,
        failures: st?.failures ?? 0,
        displays: run ? this.opts.displays.countOwned(run.tag) : 0,
      };
      if (d.entry.description !== null) info.description = d.entry.description;
      if (d.scope === "project" && d.root !== null && d.approval) info.approval = this.approvalView(d, d.root, d.approval);
      if (run) {
        info.runId = run.runId;
        info.startedAt = new Date(run.startedAt).toISOString();
      }
      if (state === "backoff" && st?.nextRetryAt !== undefined) info.nextRetryAt = new Date(st.nextRetryAt).toISOString();
      if (st?.lastExit) info.lastExit = { code: st.lastExit.code, signal: st.lastExit.signal, at: st.lastExit.at, reason: st.lastExit.reason };
      extensions.push(info);
    }
    const active = new Set<string>();
    for (const d of this.desired.values()) if (d.root !== null) active.add(`${d.root}\0${d.entry.id}`);
    const approvals = this.approvalSet.list().map((r) => ({ ...r, active: active.has(`${r.root}\0${r.id}`) }));
    return { extensions, problems: this.problems.map((p) => ({ ...p })), userConfigPath: this.userConfigPath, approvals };
  }

  private approvalView(d: Desired, root: string, a: ApprovalState): ExtensionApprovalView {
    const view: ExtensionApprovalView = {
      digest: d.digest,
      status: a.status,
      command: d.entry.command,
      cwd: root,
      groupWritable: d.groupWritable,
      deniedBefore: a.deniedBefore,
      approvedAlive: a.approvedAlive,
    };
    if (a.decidedAt !== undefined) view.decidedAt = a.decidedAt;
    if (a.previous) {
      view.previous = { command: a.previous.command, description: a.previous.description, enabled: a.previous.enabled, allow: [...a.previous.allow], onUnresponsive: a.previous.onUnresponsive };
    }
    return view;
  }

  /** 一覧が変わっていれば、bus に `extension.changed`（中身なし）を出す。`displays`（面の数）は比べない。 */
  private emitChanged(): void {
    try {
      const l = this.list();
      const json = JSON.stringify({
        ...l,
        extensions: l.extensions.map((e) => {
          const copy: Partial<ExtensionInfo> = { ...e };
          delete copy.displays;
          return copy;
        }),
      });
      if (json === this.lastEmitted) return;
      this.lastEmitted = json;
      this.opts.bus.publish({ event: "extension.changed", data: {} });
    } catch {
      // bus の購読者の例外で止めない
    }
  }

  // --- 入口（外向き）-----------------------------------------------------------------------------------------------------

  /** 根を引き直し（PR3）、failed・exited を戻して、差を埋める。 */
  async reload(): Promise<ExtensionListResult> {
    if (this.stopped) return this.list();
    await this.enqueue(async () => {
      for (const [key, st] of [...this.status]) {
        if (st.state === "failed" || st.state === "exited") this.status.delete(key);
      }
      // 根を引き直す印。覚えは、ここでは捨てない（`reconcile` が、作り終えてから差し替える）。
      this.forceRoots = true;
      await this.reconcile();
    });
    return this.list();
  }

  /** 止めて、回数を 0 にして、`startOne`。 */
  async restart(key: string): Promise<void> {
    if (this.stopped) return;
    await this.enqueue(async () => {
      if (!this.desired.has(key) && !this.runs.has(key)) throw new RpcError("not_found", `extension not found: ${key.slice(0, 80)}`);
      if (this.runs.has(key)) await this.stopRun(key);
      const d = this.desired.get(key);
      const old = this.status.get(key);
      if (old?.timer !== undefined) this.clock.clearTimeout(old.timer);
      if (d) this.resetStatus(key, d);
      else this.status.delete(key);
      await this.startOne(key);
      this.afterPass();
      this.emitChanged();
    });
  }

  /** 動いていなければ、最後の起動の記録（1 回ぶんだけ持つ）。 */
  log(key: string): ExtensionLogResult {
    const run = this.runs.get(key);
    if (run) return run.proc.log();
    const st = this.status.get(key);
    if (st?.lastLog) return st.lastLog;
    if (!this.desired.has(key)) throw new RpcError("not_found", `extension not found: ${key.slice(0, 80)}`);
    return { lines: [], dropped: 0 };
  }

  /** 画面だけ。 */
  async setEnabled(clientId: string, key: string, enabled: boolean): Promise<void> {
    if (!this.opts.isScreenKind(clientId)) throw new RpcError("invalid_params", "only a screen can change an extension");
    await this.enqueue(async () => {
      if (!this.desired.has(key)) throw new RpcError("not_found", `extension not found: ${key.slice(0, 80)}`);
      await this.stateStore.setDisabled(key, !enabled, new Set(this.desired.keys()));
      if (!enabled) {
        // 無効にしたことは、このサーバが書いたので分かっている。設定の読み込みの結果（時間切れかもしれない）を待たずに、必ず止める。
        const d = this.desired.get(key);
        if (d) {
          d.decision = "disabled";
          d.disabledByUser = true;
        }
        await this.stopRun(key);
        if (d) this.resetStatus(key, d);
        this.emitChanged();
      }
      await this.reconcile();
    });
  }

  // --- 差を埋める -------------------------------------------------------------------------------------------------------

  /**
   * workspace の根を引く（覚えが無いものだけ。`force` なら全部）。**新しい対応表を作り終えてから返す**（呼び手が差し替える。引いている途中の、空の表を、範囲の検査に見せない）。
   * 2 つずつ並行・1 つ 2 秒・合わせて 5 秒。**時間切れ・引けなかった workspace は「根なし」として覚えない**（`force` のときは、前の値のまま）。
   */
  private async resolveRoots(force: boolean): Promise<Map<string, string | null>> {
    const workspaces = this.opts.session.snapshot().workspaces;
    const prev = this.workspaceRoots;
    const map = new Map<string, string | null>();
    const todo: { id: string; cwd: string }[] = [];
    for (const ws of workspaces) {
      if (!force && prev.has(ws.id)) map.set(ws.id, prev.get(ws.id) ?? null);
      else todo.push({ id: ws.id, cwd: ws.cwd });
    }
    if (todo.length === 0) return map;
    const results = new Map<string, string | null>();
    let cut = false;
    const queue = [...todo];
    const worker = async (): Promise<void> => {
      for (;;) {
        if (cut) return;
        const ws = queue.shift();
        if (!ws) return;
        const r = await this.readTimed(`root:${ws.id}`, () => resolveProjectRoot(ws.cwd, this.opts.deps?.projectRoot));
        if (r.ok && !cut) results.set(ws.id, r.value);
      }
    };
    const pool = Promise.all(Array.from({ length: EXTENSION_ROOTS_RESOLVE.parallel }, () => worker()));
    let timer: unknown;
    const total = new Promise<"timeout">((r) => {
      timer = this.clock.setTimeout(() => r("timeout"), EXTENSION_ROOTS_RESOLVE.totalMs);
    });
    const done = await Promise.race([pool.then(() => "done" as const), total]);
    this.clock.clearTimeout(timer);
    if (done === "timeout") {
      cut = true;
      this.sawTimeout = true;
    }
    for (const ws of todo) {
      if (results.has(ws.id)) map.set(ws.id, results.get(ws.id) ?? null);
      else {
        // 引けなかった（時間切れ・読めない）: 根なしとして覚えない。前の値があれば、そのまま。
        if (prev.has(ws.id)) map.set(ws.id, prev.get(ws.id) ?? null);
        this.sawTimeout = true;
      }
    }
    return map;
  }

  /** 承認の状態を、鍵と記録から作る。 */
  private approvalState(set: ApprovalSet, root: string, id: string, digest: string): ApprovalState {
    const rec = set.find(root, id);
    const lk = set.lookup(root, id, digest);
    const state: ApprovalState = { status: lk.status === "none" ? "none" : lk.status, deniedBefore: rec?.denied !== undefined, approvedAlive: rec?.approved !== undefined };
    if (lk.status === "approved" && rec?.approved) state.decidedAt = rec.approved.at;
    else if (lk.status === "denied" && rec?.denied) state.decidedAt = rec.denied.at;
    if (lk.status === "none" && lk.previous) state.previous = lk.previous;
    return state;
  }

  /**
   * 承認の側を「止める側に倒す」: 設定・無効の記録の時間切れで現状維持にする間も、承認の記録（読めない・時間切れ＝記録なし）に合わせて、
   * 承認されていないプロジェクトの拡張を止める。混ぜると、承認を取り消したのに動き続ける（decisions D11）。
   */
  private async enforceApprovals(set: ApprovalSet): Promise<void> {
    const stopKeys: string[] = [];
    for (const d of this.desired.values()) {
      if (d.scope !== "project" || d.root === null) continue;
      d.approval = this.approvalState(set, d.root, d.entry.id, d.digest);
      if (d.decision === "eligible" && d.approval.status !== "approved") {
        d.decision = d.approval.status === "denied" ? "denied" : "pending";
        stopKeys.push(d.key);
      }
    }
    await Promise.all(stopKeys.map((k) => this.stopRun(k)));
    for (const key of stopKeys) {
      const d = this.desired.get(key);
      if (d) this.resetStatus(key, d);
    }
  }

  /**
   * 承認の記録の掃除（狭い）。消すのは、**承認（`approved`）だけ**（「承認しない」は残す）で、次の 3 つがそろう根だけ:
   * (1) いまの workspace の根でなく、**どの workspace の開いた場所（`cwd`）もその根の下に無い**（根を引けなくても、候補にしない）
   * (2) **根のディレクトリそのものが無く（`ENOENT`）、その親のディレクトリは有る**（外付けディスク・ネットワークのフォルダが外れているのとは違う。
   *     `.soda/extensions.json` だけが無い——ブランチの切り替え——は、消さない）
   * (3) 確かめが時間切れ・読めない誤り（`EIO` など）でないこと。
   * 消せた分を除いた記録を返す。
   */
  private async pruneApprovals(set: ApprovalSet, openRoots: ReadonlySet<string>, cwds: readonly string[]): Promise<ApprovalSet> {
    const exists = this.opts.deps?.pathExists ?? defaultPathExists;
    const under = (root: string): boolean => cwds.some((c) => c === root || c.startsWith(root.endsWith("/") ? root : `${root}/`));
    const candidates = [...new Set(set.records.filter((r) => r.approved !== undefined).map((r) => r.root))].filter((root) => !openRoots.has(root) && !under(root));
    let removed = false;
    for (const root of candidates) {
      const gone = await this.readTimed(`gone:${root}`, async () => !(await exists(root)) && (await exists(dirname(root))));
      if (!gone.ok || !gone.value) continue;
      for (const r of set.records.filter((x) => x.root === root && x.approved !== undefined)) {
        try {
          await this.approvals.revokeApprovedOnly(r.root, r.id);
          removed = true;
        } catch (err) {
          this.note("warn", "extension approval prune failed", { kind: err instanceof Error ? err.constructor.name : typeof err });
        }
      }
    }
    if (!removed) return set;
    const reread = await this.readTimed("approvals", () => this.approvals.load());
    return reread.ok ? reread.value : set;
  }

  private async reconcile(): Promise<void> {
    if (this.stopped) return;
    const epoch = this.epoch;
    this.sawTimeout = false;
    const aborted = (): boolean => this.stopped || this.epoch !== epoch;
    const problems: ExtensionFileProblem[] = [];

    // 1. 利用者の設定。
    const loaded = await this.readTimed("user-config", () => loadUserExtensionsFile(this.userConfigPath, this.opts.deps?.file));
    if (aborted()) return;
    // 「読めたが、規則の外・壊れている」（拒否）は、そのファイルの拡張を 1 つも動かさない（止める）。
    // 「時間切れ・一時の読み込みの失敗」は現状維持: 動いているものは止めず、新しく起動する・起動し直すことだけを見送る（下の `transient`）。
    let transient = false;
    let file: ExtensionFileLoad = { entries: [], problem: null };
    if (loaded.ok) {
      file = loaded.value;
      if (file.problem !== null) problems.push({ scope: "user", path: this.userConfigPath, problem: file.problem });
    } else {
      transient = true;
      problems.push({ scope: "user", path: this.userConfigPath, problem: `${EXTENSIONS_FILE_NAME}: 読み込みが時間内に終わりませんでした。設定を読めないので、前の状態のままです（動いている拡張はそのまま、新しい起動は見送ります。あとで読み直します）` });
    }

    // 2. プロジェクトの根と設定。**新しい対応表を作り終えてから差し替える**。
    const force = this.forceRoots;
    this.forceRoots = false;
    const roots = await this.resolveRoots(force);
    if (aborted()) return;
    this.workspaceRoots = roots;
    const rootList = [...new Set([...roots.values()].filter((r): r is string => r !== null))].sort();
    const readRoots = rootList.slice(0, EXTENSION_PROJECT_ROOTS_MAX);
    for (const root of rootList.slice(EXTENSION_PROJECT_ROOTS_MAX)) {
      problems.push({ scope: "project", root, path: join(root, ".soda", EXTENSIONS_FILE_NAME), problem: `${EXTENSIONS_FILE_NAME}: 設定を読むリポジトリは ${EXTENSION_PROJECT_ROOTS_MAX} 個までです。このリポジトリの設定は読みません` });
    }
    const projectReads = await Promise.all(
      readRoots.map(async (root) => ({ root, r: await this.readTimed(`project:${root}`, () => loadProjectExtensionsFile(root, this.opts.deps?.projectFile)) })),
    );
    if (aborted()) return;

    // 3. 無効の記録と、承認の記録。
    const stateRead = await this.readTimed("state", () => this.stateStore.load());
    if (aborted()) return;
    const state: ExtensionStateLoad = stateRead.ok ? stateRead.value : { ok: true, disabled: new Set() };
    if (!stateRead.ok) {
      transient = true;
      problems.push({ scope: "state", path: this.statePath, problem: "extension-state.json: 読み込みが時間内に終わりませんでした。設定を読めないので、前の状態のままです（動いている拡張はそのまま、新しい起動は見送ります。あとで読み直します）" });
    }
    // 承認の記録: **読めない・時間切れは「記録なし」（全部が承認待ち。止める側）**。設定の `transient`（現状維持）に混ぜない。
    const sigBefore = await this.approvals.signature().catch(() => "error");
    const approvalRead = await this.readTimed("approvals", () => this.approvals.load());
    if (aborted()) return;
    let approvalSet: ApprovalSet;
    if (approvalRead.ok) {
      approvalSet = approvalRead.value;
      if (approvalSet.problem !== null) problems.push({ scope: "state", path: this.approvals.filePath, problem: approvalSet.problem });
    } else {
      approvalSet = new ApprovalSet([], null);
      problems.push({ scope: "state", path: this.approvals.filePath, problem: "extension-approvals.json: 読み込みが時間内に終わりませんでした。承認の記録を読めないので、プロジェクトの拡張は承認待ちとして扱います（あとで読み直します）" });
    }
    // 承認の記録の掃除: **その根の workspace が 1 つも無く、根のディレクトリか設定ファイルが無くなっている**記録は消す（リポジトリを消して、同じ場所に別のものを
    // 置いたとき、前の承認が残って聞かれずに動くのを減らす）。根を引けなかった workspace がある間（時間切れ）は、確かめない。
    if (approvalRead.ok && approvalSet.records.length > 0) {
      const workspaces = this.opts.session.snapshot().workspaces;
      if (workspaces.every((w) => roots.has(w.id))) {
        approvalSet = await this.pruneApprovals(approvalSet, new Set([...roots.values()].filter((r): r is string => r !== null)), workspaces.map((w) => w.cwd));
        if (aborted()) return;
      }
    }
    this.approvalSet = approvalSet;
    this.approvalSig = sigBefore;
    // プロジェクトの設定の読み込みの問題。
    for (const { root, r } of projectReads) {
      const path = join(root, ".soda", EXTENSIONS_FILE_NAME);
      if (!r.ok) {
        transient = true;
        problems.push({ scope: "project", root, path, problem: `${EXTENSIONS_FILE_NAME}: 読み込みが時間内に終わりませんでした。設定を読めないので、前の状態のままです（動いている拡張はそのまま、新しい起動は見送ります。あとで読み直します）` });
      } else if (r.value.problem !== null) {
        problems.push({ scope: "project", root, path: r.value.path, problem: r.value.problem });
      } else if (r.value.warning !== undefined) {
        // 警告は出さない（グループの書き込みは `groupWritable` で別に出る）。
      }
    }

    if (transient) {
      // 現状維持: 前の desired・動いているものはそのまま。起動を待っているものは「待っている」にする。
      // ただし承認の側は、止める側に倒す（承認の記録に合わせて、承認されていないものは止める）。
      this.problems = problems;
      await this.enforceApprovals(approvalSet);
      if (aborted()) return;
      for (const d of this.desired.values()) {
        if (d.decision !== "eligible" || this.runs.has(d.key)) continue;
        const st = this.status.get(d.key);
        if (!st || (st.state === "backoff" && st.timer === undefined) || st.state === "over_limit") this.setStatus(d.key, d, { state: "waiting" });
      }
      this.afterPass();
      this.emitChanged();
      return;
    }
    if (!state.ok) {
      problems.push({ scope: "state", path: this.statePath, problem: `${state.problem}。設定画面で入切を 1 つ変えると、作り直します（ほかの拡張は、有効に戻ります）` });
    }

    // 4. desired を作り直す。
    const next = new Map<string, Desired>();
    for (const entry of file.entries) {
      const key = instanceKey("user", null, entry.id);
      const userDisabled = !state.ok || state.disabled.has(key);
      next.set(key, {
        entry,
        key,
        digest: entryDigest("", entry),
        scope: "user",
        root: null,
        configPath: this.userConfigPath,
        decision: !entry.enabled || userDisabled ? "disabled" : "eligible",
        disabledByUser: userDisabled,
        groupWritable: false,
      });
    }
    for (const { root, r } of projectReads) {
      if (!r.ok || r.value.problem !== null) continue; // 誤りのファイルの拡張は 1 つも採らない
      for (const entry of r.value.entries) {
        const key = instanceKey("project", root, entry.id);
        const userDisabled = !state.ok || state.disabled.has(key);
        const digest = entryDigest(root, entry);
        const approval = this.approvalState(approvalSet, root, entry.id, digest);
        let decision: Desired["decision"];
        if (!entry.enabled || userDisabled) decision = "disabled";
        else if (approval.status === "approved") decision = "eligible";
        else if (approval.status === "denied") decision = "denied";
        else decision = "pending";
        next.set(key, { entry, key, digest, scope: "project", root, configPath: r.value.path, decision, disabledByUser: userDisabled, groupWritable: r.value.groupWritable, approval });
      }
    }
    this.desired = next;
    this.problems = problems;

    // 5. desired に無い・eligible でない・digest が違うものを止める（並行）。状態（backoff など）も捨てる。
    const stopKeys: string[] = [];
    for (const [key, run] of this.runs) {
      const d = next.get(key);
      if (!d || d.decision !== "eligible" || d.digest !== run.digest) stopKeys.push(key);
    }
    for (const [key, st] of [...this.status]) {
      if (this.runs.has(key)) continue;
      const d = next.get(key);
      if (!d) {
        if (st.timer !== undefined) this.clock.clearTimeout(st.timer);
        this.status.delete(key);
      } else if (d.decision !== "eligible" || d.digest !== st.digest) {
        if (st.timer !== undefined) this.clock.clearTimeout(st.timer);
        this.resetStatus(key, d);
      }
    }
    await Promise.all(stopKeys.map((k) => this.stopRun(k)));
    if (aborted()) return;
    for (const key of stopKeys) {
      const d = next.get(key);
      if (d) this.resetStatus(key, d);
      else this.status.delete(key);
    }

    // 6. 上限（動いているものは、そのまま数える）。順が前のものに譲らせない。
    for (const d of next.values()) {
      if (aborted()) return;
      if (d.decision !== "eligible" || this.runs.has(d.key)) continue;
      const st = this.status.get(d.key);
      if (st && (st.state === "failed" || st.state === "exited" || (st.state === "backoff" && st.timer !== undefined))) continue;
      await this.startOne(d.key);
    }
    if (aborted()) return;

    // 7.
    this.afterPass();
    this.refreshPanes();
    this.emitChanged();
  }

  /** **拡張のコマンドを `spawn` する、ただ 1 つの道**。`chain` の中でだけ呼ぶ。プロジェクトの拡張は、ここで設定と承認の記録を読み直して確かめる。 */
  private async startOne(key: string): Promise<void> {
    // 1.
    if (this.stopped) return;
    const epoch = this.epoch;
    const d = this.desired.get(key);
    if (!d || d.decision !== "eligible") return;
    // 2.
    if (this.runs.has(key)) return;
    if (this.runs.size >= this.runningMax) {
      this.setStatus(key, d, { state: "over_limit" });
      this.emitChanged();
      return;
    }
    // 3. 設定を読み直し、digest を比べる。
    let entry: ExtensionEntry | undefined;
    if (d.scope === "user" || d.root === null) {
      const reread = await this.readTimed("user-config", () => loadUserExtensionsFile(this.userConfigPath, this.opts.deps?.file));
      if (this.stopped || this.epoch !== epoch) return;
      if (!reread.ok) {
        // 読めない（時間切れ・一時の失敗）: 読めなければ起動しない。「待っている」にして、読み直しを予約する。
        this.setStatus(key, d, { state: "waiting" });
        this.emitChanged();
        return;
      }
      entry = reread.value.problem === null ? reread.value.entries.find((e) => e.id === d.entry.id) : undefined;
      if (!entry || entryDigest("", entry) !== d.digest) {
        this.scheduleReconcile(); // 次の番で、停止・読み直しに落ち着く
        return;
      }
    } else {
      const root = d.root;
      const reread = await this.readTimed(`project:${root}`, () => loadProjectExtensionsFile(root, this.opts.deps?.projectFile));
      if (this.stopped || this.epoch !== epoch) return;
      if (!reread.ok) {
        this.setStatus(key, d, { state: "waiting" });
        this.emitChanged();
        return;
      }
      entry = reread.value.problem === null ? reread.value.entries.find((e) => e.id === d.entry.id) : undefined;
      if (!entry || entryDigest(root, entry) !== d.digest) {
        this.scheduleReconcile();
        return;
      }
      // 4. 承認の記録を読み直し、**いまの鍵が承認されていること**。読めない・時間切れは「承認なし」（起動しない）。
      const ap = await this.readTimed("approvals", () => this.approvals.load());
      if (this.stopped || this.epoch !== epoch) return;
      if (!ap.ok || ap.value.lookup(root, entry.id, d.digest).status !== "approved") {
        this.scheduleReconcile();
        return;
      }
    }
    // 5. 無効の記録を読み直す。
    const st = await this.readTimed("state", () => this.stateStore.load());
    if (this.stopped || this.epoch !== epoch) return;
    if (!st.ok) {
      this.setStatus(key, d, { state: "waiting" });
      this.emitChanged();
      return;
    }
    if (!st.value.ok || st.value.disabled.has(key)) {
      this.scheduleReconcile();
      return;
    }
    // 6. ここから 8 まで、await を挟まない。
    if (this.stopped || this.epoch !== epoch || this.runs.has(key)) return;
    if (this.runs.size >= this.runningMax) {
      this.setStatus(key, d, { state: "over_limit" });
      this.emitChanged();
      return;
    }
    // 7.
    const scope = d.scope;
    const root = d.root;
    const runId = this.newId();
    const tag = `ext:${key}:${runId}`;
    const ext: ApiExtension = { key, id: entry.id, scope, root, runId, tag, allow: entry.allow, onUnresponsive: entry.onUnresponsive };
    const env = buildExtensionEnv(this.opts.baseEnv, { id: entry.id, scope, root, runId }, this.platform);
    const cwd = scope === "project" && root !== null ? root : (entry.cwd ?? this.opts.homeDir);
    const proc = new ExtensionProcess(
      { key, id: entry.id, scope, root, command: entry.command, cwd, runId },
      env,
      {
        onRequest: (req) => {
          // finishRun の後に、遅れて処理された 1 行が、だれも消さない面を作らない。
          const r = this.runs.get(key);
          if (!r || r.runId !== runId) return;
          const line = this.api.handle(r.ext, req);
          if (line) r.proc.send(line);
        },
      },
      {
        ...(this.opts.deps?.spawn ? { spawn: this.opts.deps.spawn } : {}),
        ...(this.opts.deps?.killGroup ? { killGroup: this.opts.deps.killGroup } : {}),
        ...(this.opts.deps?.runFile ? { runFile: this.opts.deps.runFile } : {}),
        totalBytes: this.totalBytes,
        clock: this.clock,
        platform: this.platform,
        logger: this.opts.logger,
      },
    );
    const run: Run = { proc, runId, tag, digest: d.digest, startedAt: this.clock.now(), ext, lastPanes: "" };
    this.runs.set(key, run);
    proc.start();
    // 8.
    proc.send(this.api.helloLine(ext));
    this.sendPanes(run);
    const prev = this.status.get(key);
    if (prev?.timer !== undefined) this.clock.clearTimeout(prev.timer);
    this.status.set(key, { ...(prev ?? { failures: 0 }), state: "running", digest: d.digest, failures: prev?.failures ?? 0 });
    const st2 = this.status.get(key)!;
    delete st2.timer;
    delete st2.nextRetryAt;
    this.note("info", "extension started", { extension: key, run: runId, state: "running" });
    void proc.exited.then((exit) => this.onExit(key, runId, exit));
    this.emitChanged();
  }

  // --- 承認の操作（画面だけ）---------------------------------------------------------------------------------------------------

  /** プロジェクトの拡張を承認する。`digest` が、いま見えている登録の鍵と同じときだけ（違えば `extension_stale`）。 */
  async approve(clientId: string, key: string, digest: string): Promise<void> {
    await this.decide(clientId, key, digest, "approved");
  }

  /** 「承認しない」を記録する（前に承認した中身の記録は消さない）。 */
  async deny(clientId: string, key: string, digest: string): Promise<void> {
    await this.decide(clientId, key, digest, "denied");
  }

  private async decide(clientId: string, key: string, digest: string, kind: "approved" | "denied"): Promise<void> {
    if (!this.opts.isScreenKind(clientId)) throw new RpcError("invalid_params", `only a screen can ${kind === "approved" ? "approve" : "deny"} an extension`);
    await this.enqueue(async () => {
      const d = this.desired.get(key);
      if (!d || d.scope !== "project" || d.root === null || (d.decision !== "pending" && d.decision !== "denied")) {
        throw new RpcError("not_found", `extension not found: ${key.slice(0, 80)}`);
      }
      if (digest !== d.digest) {
        this.scheduleReconcile();
        throw new RpcError("extension_stale", "the extension registration changed");
      }
      if (kind === "approved") await this.approvals.decideApproved(d.root, d.entry.id, d.digest, d.entry);
      else await this.approvals.decideDenied(d.root, d.entry.id, d.digest);
      // 記録を書いてから、差を埋める（`startOne` が、もう一度ファイルと記録を読んで確かめる）。
      await this.reconcile();
    });
  }

  /** (根, id) の承認の記録（承認も「承認しない」も）を消す。**いま一覧に無い (根, id) でもよい**。記録が無ければ、何もせずに成功。 */
  async revoke(clientId: string, root: string, id: string): Promise<void> {
    if (!this.opts.isScreenKind(clientId)) throw new RpcError("invalid_params", "only a screen can revoke an extension approval");
    await this.enqueue(async () => {
      await this.approvals.revoke(root, id);
      // 動いていれば止まり、有効なら `pending` へ（`reconcile` が記録を読み直す）。
      await this.reconcile();
    });
  }

  private setStatus(key: string, d: Desired, patch: { state: StatusState }): void {
    const prev = this.status.get(key);
    if (prev?.timer !== undefined && patch.state !== "backoff") this.clock.clearTimeout(prev.timer);
    this.status.set(key, { failures: prev?.failures ?? 0, ...(prev?.lastExit ? { lastExit: prev.lastExit } : {}), ...(prev?.lastLog ? { lastLog: prev.lastLog } : {}), digest: d.digest, state: patch.state });
  }

  /** 動いていない状態（失敗の回数・待ち）を捨てて、起動できる状態に戻す（最後の起動の記録は残す）。 */
  private resetStatus(key: string, d: Desired): void {
    const prev = this.status.get(key);
    if (prev?.timer !== undefined) this.clock.clearTimeout(prev.timer);
    this.status.set(key, { state: "backoff", failures: 0, digest: d.digest, ...(prev?.lastExit ? { lastExit: prev.lastExit } : {}), ...(prev?.lastLog ? { lastLog: prev.lastLog } : {}) });
  }

  /** 止める。**先に** `finishRun`（面を消し、`runs` から外す）、それから子を止める。 */
  private async stopRun(key: string): Promise<void> {
    const run = this.runs.get(key);
    if (!run) return;
    this.finishRun(key, run.runId, "stopped");
    await run.proc.stop("stopped");
  }

  /** 起動 1 回の後始末。同じ `runId` について 1 回だけ効く。`runs` から外しても、子と孫が居なくなるまでは `closing` にある。 */
  private finishRun(key: string, runId: string, reason: ExtExit["reason"]): void {
    const run = this.runs.get(key);
    if (!run || run.runId !== runId) return;
    this.runs.delete(key);
    this.closing.add(run.proc);
    void run.proc.settled.then(() => this.closing.delete(run.proc));
    if (!this.disposed) {
      try {
        this.opts.displays.closeOwned(run.tag);
      } catch (err) {
        this.note("warn", "extension display cleanup failed", { extension: key, kind: err instanceof Error ? err.constructor.name : typeof err });
      }
    }
    const st = this.status.get(key) ?? { state: "exited" as StatusState, failures: 0, digest: run.digest };
    st.lastLog = run.proc.log();
    st.lastExit = { code: null, signal: null, at: new Date(this.clock.now()).toISOString(), reason, runId };
    this.status.set(key, st);
  }

  /** 終わったとき。全体を `try/catch` で包む（`then` の中の例外を、捕まらない拒否にしない）。 */
  private onExit(key: string, runId: string, exit: ExtExit): void {
    try {
      const run = this.runs.get(key);
      if (!run || run.runId !== runId) {
        // 止めた後・別の起動に替わった後に、遅れて来た exit: その runId の lastExit に終了コードを足すだけ。
        const st = this.status.get(key);
        if (st?.lastExit && st.lastExit.runId === runId) {
          st.lastExit.code = exit.code;
          st.lastExit.signal = exit.signal;
        }
        return;
      }
      this.finishRun(key, runId, exit.reason);
      const st = this.status.get(key)!;
      if (st.lastExit) {
        st.lastExit.code = exit.code;
        st.lastExit.signal = exit.signal;
      }
      this.note("info", "extension exited", { extension: key, run: runId, code: exit.code, signal: exit.signal, reason: exit.reason });
      if (exit.reason === "exited") {
        st.state = "exited";
      } else {
        st.failures = exit.uptimeMs >= this.timings.stableMs ? 1 : st.failures + 1;
        if (st.failures >= EXTENSION_CRASH_MAX) {
          st.state = "failed";
          this.note("warn", "extension failed", { extension: key, state: "failed", failures: st.failures });
        } else {
          const delay = Math.min(this.timings.backoffMaxMs, this.timings.backoffMinMs * 2 ** (st.failures - 1));
          st.state = "backoff";
          st.nextRetryAt = this.clock.now() + delay;
          if (st.timer !== undefined) this.clock.clearTimeout(st.timer);
          st.timer = this.clock.setTimeout(() => {
            st.timer = undefined;
            if (this.stopped) return;
            // 起動の直前に、設定と無効の記録を確かめ直す（startOne）。
            void this.enqueue(async () => {
              await this.startOne(key);
              this.afterPass();
              this.emitChanged();
            }).catch(() => undefined);
          }, delay);
        }
      }
      this.emitChanged();
    } catch (err) {
      this.note("warn", "extension exit handling failed", { extension: key, kind: err instanceof Error ? err.constructor.name : typeof err });
    }
  }

  // --- pane の一覧と、出来事の渡し方 ---------------------------------------------------------------------------------------

  /** その拡張に見せる pane（範囲の中だけ）。 */
  private panesFor(ext: ApiExtension): ExtPane[] {
    const snap = this.opts.session.snapshot();
    const tabs = new Map(snap.tabs.map((t) => [t.id, t]));
    const workspaces = new Map(snap.workspaces.map((w) => [w.id, w]));
    const out: ExtPane[] = [];
    for (const p of snap.panes) {
      const tab = tabs.get(p.tabId);
      const ws = tab ? workspaces.get(tab.workspaceId) : undefined;
      if (!ws) continue;
      if (!this.inScopeFn(ext, p.id)) continue;
      out.push({ id: p.id, label: p.label, workspaceId: ws.id, workspaceLabel: ws.label, workspaceCwd: ws.cwd, agent: p.agent?.kind ?? null });
    }
    return out;
  }

  private sendPanes(run: Run): void {
    const panes = this.panesFor(run.ext);
    const json = JSON.stringify(panes);
    if (json === run.lastPanes) return;
    run.lastPanes = json;
    run.proc.send({ type: "ext.panes", panes }, { coalesce: "ext.panes" });
  }

  /** pane の一覧を作り直し、前と同じなら送らない。範囲の外へ出た pane の面を消す。**設定は読まない**。 */
  private refreshPanes(): void {
    if (this.stopped) return;
    try {
      for (const run of this.runs.values()) this.sendPanes(run);
      this.reviewScope();
    } catch (err) {
      this.note("warn", "extension panes refresh failed", { kind: err instanceof Error ? err.constructor.name : typeof err });
    }
  }

  /** 面を持つ pane の見直し（bus のイベントに頼らない）: 範囲の外の pane の面を消して、拡張へ `out_of_scope` を書く。 */
  private reviewScope(): void {
    if (this.stopped) return;
    for (const run of this.runs.values()) {
      for (const paneId of this.opts.displays.ownedPanes(run.tag)) {
        if (!this.inScopeFn(run.ext, paneId)) this.closeOutOfScope(run, paneId);
      }
    }
  }

  private closeOutOfScope(run: Run, paneId: string): void {
    if (this.disposed) return;
    const cur = this.runs.get(run.ext.key);
    if (!cur || cur.runId !== run.runId) return;
    const closed = this.opts.displays.closeOwned(run.tag, { paneId });
    const at = new Date(this.clock.now()).toISOString();
    for (const c of closed) run.proc.send({ type: "display.closed", paneId: c.paneId, name: c.name, reason: "out_of_scope", at }, { droppable: true });
  }

  /** 台帳の受け手。**渡す直前に範囲を確かめる**。受け手の中では台帳を呼ばない（`queueMicrotask`）。 */
  private onOwned(tag: string, ev: ExtDisplayEvent): void {
    let run: Run | undefined;
    for (const r of this.runs.values()) {
      if (r.tag === tag) {
        run = r;
        break;
      }
    }
    if (!run) return; // 札から起動を引けなければ捨てる
    const target = run;
    if (this.inScopeFn(target.ext, ev.paneId)) {
      target.proc.send(ev, { droppable: true });
      return;
    }
    if (ev.type === "display.closed") {
      // 理由が pane_closed のものは、そのまま渡す。
      target.proc.send(ev.reason === "pane_closed" ? ev : { ...ev, reason: "out_of_scope" }, { droppable: true });
    }
    // display.action は、渡さない（範囲の外へ出た pane の操作の値が、拡張へ届かない）。
    queueMicrotask(() => {
      try {
        this.closeOutOfScope(target, ev.paneId);
      } catch (err) {
        this.note("warn", "extension scope close failed", { kind: err instanceof Error ? err.constructor.name : typeof err });
      }
    });
  }
}

