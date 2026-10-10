import type { AccountUsage, AgentUsage, AgentUsageResult, Pane } from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";
import type { ReportedUsage, UsageReport } from "./reportedUsage.js";

/**
 * エージェントの利用状況（20261010-agent-usage）。種類ごとの取り方（アダプタ）を持ち、`agent.usage` の答えを作る。
 *
 * - 入力は pane の id だけ（記録の場所は受け取らない。アダプタが、サーバの決まりで決める）。
 * - 対応しない種類・エージェントが居ない・会話の id が分からない・記録が読めない pane は、`null`（答えに入れて、無いと示す）。
 * - 配るのは数字・モデル名・時刻・ラベルだけ。ログに記録の場所・中身を出さない（理由の種類だけ）。
 */

export interface UsageSourceInfo {
  paneId: string;
  sessionId: string;
  /** フックの報告の `transcript_path`（信用しない。アダプタが確かめる）。 */
  transcriptPath: string | undefined;
}

/** 種類ごとの取り方。知らない種類は、アダプタが無い＝何も返さない。 */
export interface UsageAdapter {
  readonly kind: string;
  /** その pane の利用状況。取れなければ null。投げない。 */
  usageFor(source: UsageSourceInfo): Promise<Omit<AgentUsage, "paneId" | "kind"> | null>;
  /** アカウント全体（制限の枠）。無ければ空。 */
  accounts?(): Promise<AccountUsage[]>;
  /** その pane の状態を捨てる（pane が閉じた・会話が替わった）。 */
  forget?(paneId: string): void;
}

export interface UsageServiceDeps {
  session: {
    getPane(paneId: string): Pane | undefined;
    snapshot(): { panes: Pane[] };
  };
  adapters: readonly UsageAdapter[];
  logger: Pick<Logger, "debug" | "warn">;
  /** ステータスラインの包みの報告（20261010-agent-usage の PR2。無ければ、記録だけ）。 */
  reported?: ReportedUsage;
  now?: () => number;
}

const TRANSCRIPT_NOTES_MAX = 512;

export class UsageService {
  private readonly adapters = new Map<string, UsageAdapter>();
  private readonly transcripts = new Map<string, { sessionId: string; path: string }>();

  constructor(private readonly deps: UsageServiceDeps) {
    for (const a of deps.adapters) this.adapters.set(a.kind, a);
  }

  /** フックの `session` の報告の記録の場所を覚える（pane ごとに最新の 1 件）。使うとき、アダプタが確かめる。 */
  noteTranscript(paneId: string, sessionId: string, path: string | undefined): void {
    if (path === undefined) return;
    this.transcripts.delete(paneId);
    this.transcripts.set(paneId, { sessionId, path });
    while (this.transcripts.size > TRANSCRIPT_NOTES_MAX) this.transcripts.delete(this.transcripts.keys().next().value as string);
  }

  /** pane が閉じた。 */
  forgetPane(paneId: string): void {
    this.transcripts.delete(paneId);
    this.deps.reported?.forgetPane(paneId);
    for (const a of this.adapters.values()) a.forget?.(paneId);
  }

  /** `paneId` を省くと、利用状況を取れる全部の pane。 */
  async get(paneId?: string): Promise<AgentUsageResult> {
    const panes: Pane[] = paneId !== undefined ? [this.deps.session.getPane(paneId)].filter((p): p is Pane => p !== undefined) : this.deps.session.snapshot().panes;
    const out: Record<string, AgentUsage | null> = {};
    if (paneId !== undefined) out[paneId] = null;
    await Promise.all(
      panes.map(async (pane) => {
        const usage = await this.one(pane);
        if (usage !== null || paneId !== undefined) out[pane.id] = usage;
      }),
    );
    const accounts: AccountUsage[] = [];
    for (const a of this.adapters.values()) {
      try {
        accounts.push(...((await a.accounts?.()) ?? []));
      } catch {
        this.deps.logger.debug("usage: accounts failed", { kind: a.kind });
      }
    }
    // 包みの報告から（制限の枠。記録には出ない）。同じ鍵のアダプタの値が、既にあれば、そちらを優先する。
    const seen = new Set(accounts.map((a) => a.accountKey));
    for (const acc of this.deps.reported?.accountList() ?? []) if (!seen.has(acc.accountKey)) accounts.push(acc);
    return { panes: out, accounts };
  }

  private async one(pane: Pane): Promise<AgentUsage | null> {
    const agent = pane.agent;
    if (!agent) return null;
    const adapter = this.adapters.get(agent.kind);
    if (!adapter) return null;
    const ref = pane.agentSession;
    if (!ref || ref.kind !== agent.kind) return null;
    const note = this.transcripts.get(pane.id);
    const transcriptPath = note !== undefined && note.sessionId === ref.sessionId ? note.path : undefined;
    let base: Omit<AgentUsage, "paneId" | "kind"> | null = null;
    try {
      base = await adapter.usageFor({ paneId: pane.id, sessionId: ref.sessionId, transcriptPath });
    } catch {
      // 例外の中身（場所を含みうる）は書かない。
      this.deps.logger.debug("usage: read failed", { kind: agent.kind });
    }
    const rep = this.deps.reported?.paneReport(pane.id, ref.sessionId);
    const merged = rep === undefined ? base : mergeReported(base, rep.report, rep.at);
    return merged === null ? null : { paneId: pane.id, kind: agent.kind, ...merged };
  }
}

/**
 * 記録からの値（`base`。無ければ null）に、包みの報告を重ねる。**記録からのトークンの合計は、置き換えない**（報告の `total_input_tokens` は、いま文脈にある分で、
 * 累計ではない。`contextTokens` として別に持つ）。コストは、報告（見積り）が、記録の `cost-state`（区切りにだけ書かれる）より新しければ、報告を使う。
 * コンテキストの使用率・窓の大きさは、報告のほうが正確（記録には窓の大きさが出ない）。
 */
function mergeReported(base: Omit<AgentUsage, "paneId" | "kind"> | null, r: UsageReport, at: number): Omit<AgentUsage, "paneId" | "kind"> {
  const out: Omit<AgentUsage, "paneId" | "kind"> =
    base !== null
      ? { ...base }
      : {
          model: r.model ?? null,
          tokens: { basis: "context", ...(r.contextTokens !== undefined ? { input: r.contextTokens } : {}) },
          source: "statusline",
          updatedAt: at,
        };
  if (out.model === null && r.model !== undefined) out.model = r.model;
  if (r.costUsd !== undefined && (out.costAsOf === undefined || at >= out.costAsOf)) {
    out.costUsd = r.costUsd;
    out.costBasis = "reported";
    out.costAsOf = at;
  }
  if (r.contextTokens !== undefined) out.contextTokens = r.contextTokens;
  if (r.contextWindowSize !== undefined) out.contextWindowTokens = r.contextWindowSize;
  if (r.contextUsedPct !== undefined) out.contextUsedPct = r.contextUsedPct;
  if (at >= out.updatedAt) {
    out.source = "statusline";
    out.updatedAt = at;
  }
  return out;
}
