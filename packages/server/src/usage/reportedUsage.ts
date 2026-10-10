import { createHash } from "node:crypto";
import type { AccountUsage, UsageWindow } from "@sodashitsu/protocol";

/**
 * Claude Code のステータスラインの包みが送ってくる利用状況（20261010-agent-usage の PR2。AC4）を、受けて持つ。
 * 受け口（`AgentReportSocket` の `type: "usage"`）が形を検査した値（数字・短い文字列だけ）。**誰の報告か**は、`UsageReportIntake` が、
 * `SessionService`（#128 の pid の確かめ＋報告の会話の id が、その pane の今の参照と一致すること）に確かめてから、ここへ渡す。
 */

export interface UsageReportWindow {
  usedPct: number;
  /** Unix 秒（ステータスラインの入力のまま）。 */
  resetsAt?: number;
}

export interface UsageReport {
  paneId: string;
  sessionId: string;
  agentPid?: number;
  model?: string;
  modelName?: string;
  costUsd?: number;
  contextUsedPct?: number;
  contextWindowSize?: number;
  contextTokens?: number;
  fiveHour?: UsageReportWindow;
  sevenDay?: UsageReportWindow;
  spendLimit?: UsageReportWindow & { usedUsd?: number; limitUsd?: number; period?: string };
  /** 設定のフォルダの場所の一方向の印（場所そのものは受けない）。 */
  configKey?: string;
  /** 別の設定のフォルダを使うときの、フォルダの名前（末尾だけ）。 */
  configDirName?: string;
}

interface PaneEntry {
  report: UsageReport;
  at: number;
}

interface AccountEntry {
  key: string;
  dirName?: string;
  windows: Map<string, { window: UsageWindow; asOf: number }>;
  asOf: number;
  /** この鍵で報告した pane（上限つき）。鍵は報告が自分で持つ値なので、別の pane が同じ鍵を使い始めたことを、ログに残す（指摘 6）。 */
  panes: Set<string>;
}

const PANES_MAX = 256;
const ACCOUNTS_MAX = 16;
const KEY_PANES_MAX = 16;

export class ReportedUsage {
  private readonly panes = new Map<string, PaneEntry>();
  private readonly accounts = new Map<string, AccountEntry>();
  private last: number | undefined;

  constructor(
    private readonly now: () => number = Date.now,
    /** 別の pane が、すでに使われている鍵で報告したとき（鍵は報告が言うまま。同じアカウントの別の pane でも起きる）。 */
    private readonly onSharedKey?: (info: { accountKey: string; paneId: string; otherPanes: number }) => void,
  ) {}

  /** 最後に、受けてよい報告を受けた時刻。 */
  lastReportAt(): number | undefined {
    return this.last;
  }

  /** 検査の済んだ報告を受ける。 */
  note(report: UsageReport): void {
    const at = this.now();
    this.last = at;
    this.panes.delete(report.paneId);
    this.panes.set(report.paneId, { report, at });
    while (this.panes.size > PANES_MAX) this.panes.delete(this.panes.keys().next().value as string);
    this.noteAccount(report, at);
  }

  /** その pane の、いまの会話（`sessionId`）の最新の報告。会話が違えば（`/clear` の後など）無い。 */
  paneReport(paneId: string, sessionId: string): { report: UsageReport; at: number } | undefined {
    const e = this.panes.get(paneId);
    return e !== undefined && e.report.sessionId === sessionId ? e : undefined;
  }

  forgetPane(paneId: string): void {
    this.panes.delete(paneId);
  }

  private noteAccount(r: UsageReport, at: number): void {
    const wins: [string, UsageWindow][] = [];
    if (r.fiveHour) wins.push(["five_hour", windowOf("5 時間", r.fiveHour, 300)]);
    if (r.sevenDay) wins.push(["seven_day", windowOf("週", r.sevenDay, 10080)]);
    if (r.spendLimit) {
      const w = windowOf("組織の枠", r.spendLimit);
      if (r.spendLimit.usedUsd !== undefined) w.usedUsd = r.spendLimit.usedUsd;
      if (r.spendLimit.limitUsd !== undefined) w.limitUsd = r.spendLimit.limitUsd;
      wins.push(["spend_limit", w]);
    }
    if (wins.length === 0) return;
    const key = accountKeyOf("claude", r.configKey);
    let e = this.accounts.get(key);
    if (!e) {
      e = { key, windows: new Map(), asOf: at, panes: new Set() };
      this.accounts.set(key, e);
      while (this.accounts.size > ACCOUNTS_MAX) this.accounts.delete(this.accounts.keys().next().value as string);
    }
    if (!e.panes.has(r.paneId)) {
      if (e.panes.size > 0) this.onSharedKey?.({ accountKey: key, paneId: r.paneId, otherPanes: e.panes.size });
      if (e.panes.size >= KEY_PANES_MAX) e.panes.delete(e.panes.values().next().value as string);
      e.panes.add(r.paneId);
    }
    if (r.configDirName !== undefined) e.dirName = r.configDirName;
    e.asOf = at;
    for (const [k, w] of wins) e.windows.set(k, { window: w, asOf: at });
  }

  /** アカウント全体（報告があったものだけ）。リセットの時刻を過ぎた枠は、古い印。名前は、同じ種類が 2 つ以上あるときだけ、設定のフォルダ名を添える。 */
  accountList(): AccountUsage[] {
    const now = this.now();
    const list = [...this.accounts.values()];
    return list.map((e) => ({
      kind: "claude",
      accountKey: e.key,
      label: list.length > 1 ? `Claude Code (${e.dirName ?? "既定"})` : "Claude Code",
      windows: [...e.windows.values()].map(({ window }) => (window.resetsAt !== undefined && window.resetsAt <= now ? { ...window, stale: true } : { ...window })),
      source: "statusline" as const,
      asOf: e.asOf,
    }));
  }
}

function windowOf(label: string, w: UsageReportWindow, windowMinutes?: number): UsageWindow {
  return {
    label,
    usedPct: w.usedPct,
    ...(w.resetsAt !== undefined ? { resetsAt: w.resetsAt * 1000 } : {}),
    ...(windowMinutes !== undefined ? { windowMinutes } : {}),
  };
}

/** アカウントの鍵（サーバの中だけの不透明な値）。種類と、設定のフォルダの場所の一方向の印から作る。印が無ければ既定の 1 つ。 */
export function accountKeyOf(kind: string, configKey: string | undefined): string {
  return createHash("sha256").update(`${kind}\0${configKey ?? "default"}`).digest("hex").slice(0, 16);
}

// --- 受け口 → 確かめ → 受ける -------------------------------------------------------------------------------------------------

export type UsageVerdict = { verdict: "accept" } | { verdict: "hold" } | { verdict: "reject"; reason: string };

export interface UsageIntakeDeps {
  verdict(r: UsageReport): UsageVerdict;
  sink: { note(r: UsageReport): void };
  /** 保留した報告の確かめ直しの時刻（ミリ秒。既定は 1・3・8 秒後）。 */
  retryMs?: readonly number[];
  setTimer?: (fn: () => void, ms: number) => { cancel(): void };
  log?: (reason: string, r: UsageReport) => void;
}

const DEFAULT_RETRY_MS: readonly number[] = [1_000, 3_000, 8_000];

/**
 * 受け口の報告を確かめて、受ける。`SessionService` が `hold` と言うとき（前面のエージェントが未検出・会話の参照がまだ無い・
 * 参照が、報告の会話と違う〔`/clear` の直後は、報告が、フックの報告より先に届きうる〕）は、pane ごとに最新の 1 件だけを、短く保留して確かめ直す。
 * それでも合わなければ捨てる（ログは理由だけ）。
 */
export class UsageReportIntake {
  private readonly pending = new Map<string, { report: UsageReport; step: number; timer: { cancel(): void } }>();
  private readonly retry: readonly number[];
  private readonly setTimer: (fn: () => void, ms: number) => { cancel(): void };

  constructor(private readonly deps: UsageIntakeDeps) {
    this.retry = deps.retryMs ?? DEFAULT_RETRY_MS;
    this.setTimer =
      deps.setTimer ??
      ((fn, ms) => {
        const t = setTimeout(fn, ms);
        t.unref?.();
        return { cancel: () => clearTimeout(t) };
      });
  }

  /** 報告を 1 件。 */
  offer(report: UsageReport): void {
    const v = this.deps.verdict(report);
    if (v.verdict === "accept") {
      this.drop(report.paneId);
      this.deps.sink.note(report);
    } else if (v.verdict === "reject") {
      this.drop(report.paneId);
      this.deps.log?.(v.reason, report);
    } else {
      this.hold(report, 0);
    }
  }

  forgetPane(paneId: string): void {
    this.drop(paneId);
  }

  close(): void {
    for (const id of [...this.pending.keys()]) this.drop(id);
  }

  private drop(paneId: string): void {
    const p = this.pending.get(paneId);
    if (!p) return;
    p.timer.cancel();
    this.pending.delete(paneId);
  }

  private hold(report: UsageReport, step: number): void {
    this.drop(report.paneId);
    const delay = this.retry[step];
    if (delay === undefined) {
      this.deps.log?.("the report did not match the pane's front agent / current conversation in time", report);
      return;
    }
    const timer = this.setTimer(() => {
      const cur = this.pending.get(report.paneId);
      if (!cur || cur.report !== report) return;
      const v = this.deps.verdict(report);
      if (v.verdict === "accept") {
        this.drop(report.paneId);
        this.deps.sink.note(report);
      } else if (v.verdict === "reject") {
        this.drop(report.paneId);
        this.deps.log?.(v.reason, report);
      } else {
        this.hold(report, step + 1);
      }
    }, delay);
    this.pending.set(report.paneId, { report, step, timer });
  }
}
