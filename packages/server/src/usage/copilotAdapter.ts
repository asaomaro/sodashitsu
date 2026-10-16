import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AgentUsage } from "@sodashitsu/protocol";
import { realRootsOf } from "../agent/safeFile.js";
import { CopilotEventsReader } from "./copilotEvents.js";
import type { UsageAdapter, UsageSourceInfo } from "./UsageService.js";

/**
 * GitHub Copilot CLI のアダプタ（20261016-agent-usage-bob-copilot）。pane の会話は `pane.agentSession`（フックの `sessionId`）。
 * 記録は `<COPILOT_HOME（既定 ~/.copilot）>/session-state/<sessionId>/events.jsonl`（`CopilotEventsReader`）。
 *
 * - トークンは、記録に残る呼び出しの合計（`basis: "transcript"`）。サブエージェントの分も含む（内訳は出さない）。
 * - コンテキスト: 最後の呼び出しのプロンプトの大きさ ÷ `maxPromptTokens`。
 * - コストは USD でないので `credits`（AI クレジット。`totalNanoAiu` ÷ 10 億。画面の下の `0.15 AIC used`）。プレミアムリクエストの数も出す。
 * - アカウント全体の枠は、記録に無いので出さない。
 */

const MIN_INTERVAL_MS = 1_000;
const READ_DEADLINE_MS = 2_000;
const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Usage = Omit<AgentUsage, "paneId" | "kind">;

interface PaneState {
  sessionId: string;
  reader: CopilotEventsReader;
  reading: Promise<boolean> | null;
  lastCheckedAt: number;
  closed: boolean;
  /** 記録の実体が `<home>/session-state/<id>/events.jsonl` そのものか（途中のフォルダがリンクで根の外を指していないか）を確かめた。 */
  verified: boolean;
}

export interface CopilotAdapterOptions {
  home?: () => string;
  now?: () => number;
}

/** 読んだ状態から、利用状況を作る（テストのため export）。 */
export function copilotUsageOf(r: CopilotEventsReader, now: number): Usage | null {
  const t = r.totals;
  if (t.records === 0) return null; // まだ呼び出しが無い
  const out: Usage = {
    model: r.model,
    tokens: {
      basis: "transcript",
      input: t.input,
      output: t.output,
      cacheRead: t.cacheRead,
      cacheWrite: t.cacheWrite,
      reasoning: t.reasoning,
      total: t.input + t.output + t.cacheRead + t.cacheWrite,
    },
    source: "copilot-events",
    updatedAt: r.at > 0 ? r.at : now,
  };
  if (t.nanoAiu > 0) out.credits = { amount: t.nanoAiu / 1e9, unit: "aic" };
  if (r.premiumRequests !== null) out.premiumRequests = r.premiumRequests;
  if (r.lastPrompt !== null && r.lastPrompt.tokens > 0) {
    out.contextTokens = r.lastPrompt.tokens;
    if (r.lastPrompt.window !== null && r.lastPrompt.window > 0) {
      out.contextWindowTokens = r.lastPrompt.window;
      out.contextUsedPct = Math.min(100, Math.round((r.lastPrompt.tokens / r.lastPrompt.window) * 1000) / 10);
    }
  }
  if (r.scanning) out.scanning = true;
  if (r.stopped) {
    out.updatesStopped = true;
    out.partial = true;
  }
  return out;
}

export class CopilotUsageAdapter implements UsageAdapter {
  readonly kind = "copilot";
  private readonly states = new Map<string, PaneState>();
  private readonly home: () => string;
  private readonly now: () => number;
  private closed = false;

  constructor(opts: CopilotAdapterOptions = {}) {
    this.home = opts.home ?? (() => process.env["COPILOT_HOME"] || join(homedir(), ".copilot"));
    this.now = opts.now ?? Date.now;
  }

  forget(paneId: string): void {
    const st = this.states.get(paneId);
    if (st) st.closed = true;
    this.states.delete(paneId);
  }

  close(): void {
    this.closed = true;
    for (const st of this.states.values()) st.closed = true;
    this.states.clear();
  }

  async usageFor(source: UsageSourceInfo): Promise<Usage | null> {
    if (this.closed || !SESSION_ID_RE.test(source.sessionId)) return null;
    const now = this.now();
    let st = this.states.get(source.paneId);
    if (!st || st.sessionId !== source.sessionId) {
      if (st) st.closed = true;
      const file = join(this.home(), "session-state", source.sessionId, "events.jsonl");
      st = { sessionId: source.sessionId, reader: new CopilotEventsReader(file), reading: null, lastCheckedAt: 0, closed: false, verified: false };
      this.states.set(source.paneId, st);
    }
    const state = st;
    if (!state.verified) {
      // 途中のフォルダ（`session-state`・`<id>`）がリンクで根の外を指していれば読まない（`O_NOFOLLOW` は最後の要素にしか効かない。ほかのアダプタの根の確かめと同じ考え）。
      const [root] = await realRootsOf([join(this.home(), "session-state")]);
      const real = await realpath(state.reader.file).catch(() => null);
      if (state.closed || root === undefined || real === null || real !== join(root, source.sessionId, "events.jsonl")) return null;
      state.verified = true;
    }
    // 読みは 1 つの約束を共有する（同じ pane への同時の呼び出しは、同じものを待つ）。読み残しがあるときは、間をあけずに続きを読む。
    if (state.reading === null && (state.lastCheckedAt === 0 || state.reader.scanning || now - state.lastCheckedAt >= MIN_INTERVAL_MS)) {
      state.lastCheckedAt = now;
      state.reading = state.reader.refresh().finally(() => {
        state.reading = null;
      });
    }
    if (state.reading !== null) await withDeadline(state.reading, READ_DEADLINE_MS);
    if (state.closed) return null;
    return copilotUsageOf(state.reader, now);
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
