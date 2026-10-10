import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import type { AccountUsage, AgentUsage } from "@sodashitsu/protocol";
import { findCodexRecordFile, isCodexSessionId, newestCodexRecordFiles } from "../agent/codexSession.js";
import { CodexRolloutTail, toWindows, type CodexRateLimits } from "./codexRollout.js";
import type { UsageAdapter, UsageSourceInfo } from "./UsageService.js";

/**
 * Codex のアダプタ（20261010-agent-usage の AC4）。pane の会話は `pane.agentSession`（#132 が検算して付けた参照だけ）。記録の探し方は `agent/codexSession.ts` と
 * 同じ歩き方・上限・時間切れ（`findCodexRecordFile`）。記録の末尾を、続きから読む（`CodexRolloutTail`）。
 *
 * アカウント全体の制限の枠は、`sessions` の下の**いちばん新しい記録**（新しい日付のフォルダから・上限つき・更新の新しい数件）の最後の `token_count` の `rate_limits`。
 * pane との対応が無くても出る。結果は短く覚える（`ACCOUNT_CACHE_MS`）。コストは記録に無いので、無い。
 */

const MIN_INTERVAL_MS = 1_000;
const MISS_RETRY_MS = 3_000;
const ACCOUNT_CACHE_MS = 10_000;
/** アカウントの枠を探すとき、更新の新しいものから見る記録の数。 */
const ACCOUNT_CANDIDATES = 4;
const READ_DEADLINE_MS = 2_000;

interface PaneState {
  sessionId: string;
  tail: CodexRolloutTail | null;
  lastCheckedAt: number;
  missUntil: number;
  closed: boolean;
}

export interface CodexAdapterOptions {
  home?: () => string;
  now?: () => number;
  find?: typeof findCodexRecordFile;
  newest?: typeof newestCodexRecordFiles;
}

export class CodexUsageAdapter implements UsageAdapter {
  readonly kind = "codex";
  private readonly states = new Map<string, PaneState>();
  private readonly paneLimits = new Map<string, CodexRateLimits>();
  private readonly home: () => string;
  private readonly now: () => number;
  private readonly find: typeof findCodexRecordFile;
  private readonly newest: typeof newestCodexRecordFiles;
  private account: { at: number; limits: CodexRateLimits | null } | null = null;
  private accountRunning: Promise<CodexRateLimits | null> | null = null;
  private closed = false;

  constructor(opts: CodexAdapterOptions = {}) {
    this.home = opts.home ?? (() => process.env["CODEX_HOME"] || join(homedir(), ".codex"));
    this.now = opts.now ?? Date.now;
    this.find = opts.find ?? findCodexRecordFile;
    this.newest = opts.newest ?? newestCodexRecordFiles;
  }

  forget(paneId: string): void {
    const st = this.states.get(paneId);
    if (st) st.closed = true;
    this.states.delete(paneId);
    this.paneLimits.delete(paneId);
  }

  close(): void {
    this.closed = true;
    for (const st of this.states.values()) st.closed = true;
    this.states.clear();
    this.paneLimits.clear();
  }

  async usageFor(source: UsageSourceInfo): Promise<Omit<AgentUsage, "paneId" | "kind"> | null> {
    if (this.closed || !isCodexSessionId(source.sessionId)) return null;
    const now = this.now();
    let st = this.states.get(source.paneId);
    if (!st || st.sessionId !== source.sessionId) {
      if (st) st.closed = true;
      st = { sessionId: source.sessionId, tail: null, lastCheckedAt: 0, missUntil: 0, closed: false };
      this.states.set(source.paneId, st);
    }
    const state = st;
    if (state.tail === null) {
      if (now < state.missUntil) return null;
      const file = await this.find(this.home(), source.sessionId);
      if (state.closed) return null;
      if (typeof file !== "string") {
        state.missUntil = this.now() + MISS_RETRY_MS;
        return null;
      }
      state.tail ??= new CodexRolloutTail(file);
    }
    const tail = state.tail;
    if (state.lastCheckedAt === 0 || now - state.lastCheckedAt >= MIN_INTERVAL_MS) {
      state.lastCheckedAt = now;
      await withDeadline(tail.refresh(), READ_DEADLINE_MS);
    }
    if (state.closed) return null;
    if (tail.limits) this.paneLimits.set(source.paneId, tail.limits);
    const c = tail.count;
    if (c === null || c.total === null) return null; // まだ token_count が無い（始まったばかり）
    const t = c.total;
    const out: Omit<AgentUsage, "paneId" | "kind"> = {
      model: tail.model,
      // Codex の `input_tokens` は、キャッシュの読みを含む。`input` は、そのうちのキャッシュでない分（Claude と同じ意味）。`total` は記録の値。
      tokens: {
        basis: "cumulative",
        input: Math.max(0, t.input - t.cached - t.cacheWrite),
        output: t.output,
        cacheRead: t.cached,
        cacheWrite: t.cacheWrite,
        reasoning: t.reasoning,
        total: t.total,
      },
      source: "rollout",
      updatedAt: c.at > 0 ? c.at : now,
    };
    // コンテキストの使用率: 最後の呼び出しのトークン数 ÷ 窓の大きさ（Codex 自身の「残り」の式と違う可能性がある。文書に書いた）。
    if (c.last !== null && c.last.total > 0) {
      out.contextTokens = c.last.total;
      if (c.contextWindow !== null && c.contextWindow > 0) {
        out.contextWindowTokens = c.contextWindow;
        out.contextUsedPct = Math.min(100, Math.round((c.last.total / c.contextWindow) * 1000) / 10);
      }
    }
    return out;
  }

  async accounts(): Promise<AccountUsage[]> {
    if (this.closed) return [];
    const now = this.now();
    let limits: CodexRateLimits | null;
    if (this.account !== null && now - this.account.at < ACCOUNT_CACHE_MS) {
      limits = this.account.limits;
    } else {
      this.accountRunning ??= this.findNewestLimits().finally(() => {
        this.accountRunning = null;
      });
      limits = await this.accountRunning;
      this.account = { at: now, limits };
    }
    // pane の会話の記録が、もっと新しい値を持っていれば、そちら。
    for (const l of this.paneLimits.values()) if (limits === null || l.at > limits.at) limits = l;
    if (limits === null) return [];
    const root = this.home();
    const accountKey = createHash("sha256").update(`${hostname()}\0${root}`).digest("hex").slice(0, 16);
    return [
      {
        kind: "codex",
        accountKey,
        label: "codex",
        windows: toWindows(limits, now),
        ...(limits.plan !== undefined ? { plan: limits.plan } : {}),
        source: "rollout",
        asOf: limits.at > 0 ? limits.at : now,
      },
    ];
  }

  /** `sessions` の下の、新しい記録から（総当たりしない）。更新の新しい数件の末尾の `rate_limits` のうち、最初に見つかったもの。 */
  private async findNewestLimits(): Promise<CodexRateLimits | null> {
    const files = await this.newest(this.home());
    const stats: { file: string; mtime: number }[] = [];
    for (const file of files) {
      try {
        const st = await lstat(file);
        if (st.isFile() && !st.isSymbolicLink()) stats.push({ file, mtime: st.mtimeMs });
      } catch {
        // 消えた
      }
    }
    stats.sort((a, b) => b.mtime - a.mtime);
    for (const { file } of stats.slice(0, ACCOUNT_CANDIDATES)) {
      const tail = new CodexRolloutTail(file);
      if (!(await withDeadline(tail.refresh(), READ_DEADLINE_MS))) continue;
      if (tail.limits) return tail.limits;
    }
    return null;
  }
}

async function withDeadline(p: Promise<boolean>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
