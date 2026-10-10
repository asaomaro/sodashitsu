import type { AgentUsage } from "@sodashitsu/protocol";
import { ClaudeSessionScan, type ScanLimits } from "./claudeScan.js";
import { claudeRoots, locateClaudeMain, locateClaudeSubagents, SESSION_ID_RE } from "./claudeSource.js";
import type { UsageAdapter, UsageSourceInfo } from "./UsageService.js";

/**
 * Claude Code のアダプタ（20261010-agent-usage の AC1・AC3）。pane ごとに、会話の記録の集計（`ClaudeSessionScan`）を持つ。
 * 呼ばれたとき: 記録の場所（無ければ探す）を確かめ、サブエージェントの記録を数え直し（`SUBAGENT_RELIST_MS` 以上あけて）、増えた分だけ読む。
 * 大きな記録の初回は、背景で数回に分けて読み、答えは `GET_DEADLINE_MS` までの分（`scanning`）。
 *
 * - 場所の探索も、読みと同じく**約束を共有する**（同じ pane への同時の呼び出しは、同じ探索を待つ。重ねない。U2）。
 * - `forget`（pane が閉じた・サーバが止まる）で `closed` の印を立てる。走っている読みは、チャンクの境目で止まる（U2）。
 * - 書き換えで数え直すとき、生涯の読む量を引き継ぐ（R5）。上限に達したら、その会話の更新を止める（`updatesStopped`）。
 */

const MIN_INTERVAL_MS = 1_000;
const SUBAGENT_RELIST_MS = 5_000;
const MISS_RETRY_MS = 3_000;
const GET_DEADLINE_MS = 1_500;

interface PaneState {
  sessionId: string;
  mainFile: string | null;
  scan: ClaudeSessionScan | null;
  lastCheckedAt: number;
  lastRelistAt: number;
  missUntil: number;
  running: Promise<void> | null;
  locating: Promise<void> | null;
  subagentsTruncated: boolean;
  /** pane が閉じた・サーバが止まる。以後、何も読まない。 */
  closed: boolean;
}

export interface ClaudeAdapterOptions {
  roots?: () => string[];
  now?: () => number;
  /** 場所の探索（試験が数える）。 */
  locate?: typeof locateClaudeMain;
  scanLimits?: Partial<ScanLimits>;
  /** 新しい集計ができたとき（試験の観察用）。 */
  onScan?: (paneId: string, scan: ClaudeSessionScan) => void;
}

export class ClaudeUsageAdapter implements UsageAdapter {
  readonly kind = "claude";
  private readonly states = new Map<string, PaneState>();
  private readonly roots: () => string[];
  private readonly now: () => number;
  private readonly locate: typeof locateClaudeMain;
  private readonly limits: Partial<ScanLimits>;
  private readonly onScan: ((paneId: string, scan: ClaudeSessionScan) => void) | undefined;

  constructor(opts: ClaudeAdapterOptions = {}) {
    this.roots = opts.roots ?? (() => claudeRoots());
    this.now = opts.now ?? Date.now;
    this.locate = opts.locate ?? locateClaudeMain;
    this.limits = opts.scanLimits ?? {};
    this.onScan = opts.onScan;
  }

  forget(paneId: string): void {
    const st = this.states.get(paneId);
    if (st) st.closed = true;
    this.states.delete(paneId);
  }

  /** サーバが止まる処理。全部の読みを止める。 */
  close(): void {
    for (const st of this.states.values()) st.closed = true;
    this.states.clear();
  }

  private newScan(paneId: string, sessionId: string, carried = 0): ClaudeSessionScan {
    const scan = new ClaudeSessionScan(sessionId, this.limits, carried);
    this.onScan?.(paneId, scan);
    return scan;
  }

  async usageFor(source: UsageSourceInfo): Promise<Omit<AgentUsage, "paneId" | "kind"> | null> {
    if (!SESSION_ID_RE.test(source.sessionId)) return null;
    const now = this.now();
    let st = this.states.get(source.paneId);
    if (!st || st.sessionId !== source.sessionId) {
      if (st) st.closed = true; // 会話が替わった: 古い読みを止める
      st = {
        sessionId: source.sessionId,
        mainFile: null,
        scan: null,
        lastCheckedAt: 0,
        lastRelistAt: 0,
        missUntil: 0,
        running: null,
        locating: null,
        subagentsTruncated: false,
        closed: false,
      };
      this.states.set(source.paneId, st);
    }
    const state = st;
    if (state.mainFile === null) {
      if (now < state.missUntil) return null;
      // 同時の呼び出しは、同じ探索を待つ（重ねない）。付ける値は探索の中で 1 回だけ（後から終わった探索が、先に付いた値を上書きしない）。
      state.locating ??= (async () => {
        const found = await this.locate(source.sessionId, source.transcriptPath, this.roots());
        if (state.closed) return;
        if (found === null) {
          state.missUntil = this.now() + MISS_RETRY_MS;
        } else if (state.mainFile === null) {
          state.mainFile = found;
          state.scan = this.newScan(source.paneId, source.sessionId);
          state.scan.addFile(found, false);
          state.lastRelistAt = 0;
        }
      })().finally(() => {
        state.locating = null;
      });
      await state.locating;
      if (state.closed || state.mainFile === null) return null;
    }
    if (state.closed) return null;
    if (state.running === null && (now - state.lastCheckedAt >= MIN_INTERVAL_MS || state.lastCheckedAt === 0)) {
      state.lastCheckedAt = now;
      state.running = this.drive(source.paneId, state, now).finally(() => {
        state.running = null;
      });
    }
    if (state.running !== null) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        state.running,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, GET_DEADLINE_MS);
          timer.unref?.();
        }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
    }
    if (state.closed || state.scan === null) return null;
    const usage: Omit<AgentUsage, "paneId" | "kind"> = { ...state.scan.result() };
    if (state.subagentsTruncated) usage.partial = true;
    if (state.scan.stopped) usage.updatesStopped = true;
    if (state.running !== null) usage.scanning = true;
    if (usage.updatedAt === 0) usage.updatedAt = now;
    return usage;
  }

  /** サブエージェントの記録を数え直し、読み終えるまで進める（背景。上限ごとに主スレッドを譲る。閉じたら止まる）。 */
  private async drive(paneId: string, st: PaneState, now: number): Promise<void> {
    if (st.closed || st.mainFile === null || st.scan === null) return;
    if (st.scan.stopped) return; // 生涯の上限に達した: この会話の更新は止めた
    if (now - st.lastRelistAt >= SUBAGENT_RELIST_MS || st.lastRelistAt === 0) {
      st.lastRelistAt = now;
      const { files, truncated } = await locateClaudeSubagents(st.mainFile, st.sessionId, this.roots());
      if (st.closed) return;
      for (const f of files) st.scan.addFile(f, true);
      st.subagentsTruncated = truncated;
    }
    for (let guard = 0; guard < 10_000; guard++) {
      if (st.closed) return;
      const scan = st.scan;
      if (scan === null) return;
      const r = await scan.advance(undefined, () => st.closed);
      if (st.closed) return;
      if (r.reset) {
        // 記録が小さくなった（書き換え）。最初から数え直す。読んだ量は引き継ぐ（繰り返しても、上限が効く）。
        const fresh = this.newScan(paneId, st.sessionId, scan.bytesRead);
        for (const f of scan.files.values()) fresh.addFile(f.path, f.sub);
        st.scan = fresh;
        if (fresh.stopped) return;
        continue;
      }
      if (!r.more) return;
    }
  }
}
