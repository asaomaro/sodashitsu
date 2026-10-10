import type { AgentUsage } from "@sodashitsu/protocol";
import { ClaudeSessionScan } from "./claudeScan.js";
import { claudeRoots, locateClaudeMain, locateClaudeSubagents, SESSION_ID_RE } from "./claudeSource.js";
import type { UsageAdapter, UsageSourceInfo } from "./UsageService.js";

/**
 * Claude Code のアダプタ（20261010-agent-usage の AC1・AC3）。pane ごとに、会話の記録の集計（`ClaudeSessionScan`）を持つ。
 * 呼ばれたとき: 記録の場所（無ければ探す）を確かめ、サブエージェントの記録を数え直し（`SUBAGENT_RELIST_MS` 以上あけて）、増えた分だけ読む。
 * 大きな記録の初回は、背景で数回に分けて読み、答えは `GET_DEADLINE_MS` までの分（`scanning`）。
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
  subagentsTruncated: boolean;
}

export interface ClaudeAdapterOptions {
  roots?: () => string[];
  now?: () => number;
}

export class ClaudeUsageAdapter implements UsageAdapter {
  readonly kind = "claude";
  private readonly states = new Map<string, PaneState>();
  private readonly roots: () => string[];
  private readonly now: () => number;

  constructor(opts: ClaudeAdapterOptions = {}) {
    this.roots = opts.roots ?? (() => claudeRoots());
    this.now = opts.now ?? Date.now;
  }

  forget(paneId: string): void {
    this.states.delete(paneId);
  }

  async usageFor(source: UsageSourceInfo): Promise<Omit<AgentUsage, "paneId" | "kind"> | null> {
    if (!SESSION_ID_RE.test(source.sessionId)) return null;
    const now = this.now();
    let st = this.states.get(source.paneId);
    if (!st || st.sessionId !== source.sessionId) {
      st = { sessionId: source.sessionId, mainFile: null, scan: null, lastCheckedAt: 0, lastRelistAt: 0, missUntil: 0, running: null, subagentsTruncated: false };
      this.states.set(source.paneId, st);
    }
    if (st.mainFile === null) {
      if (now < st.missUntil) return null;
      st.mainFile = await locateClaudeMain(source.sessionId, source.transcriptPath, this.roots());
      if (st.mainFile === null) {
        st.missUntil = now + MISS_RETRY_MS;
        return null;
      }
      st.scan = new ClaudeSessionScan(source.sessionId);
      st.scan.addFile(st.mainFile, false);
      st.lastRelistAt = 0;
    }
    const scan = st.scan as ClaudeSessionScan;
    if (st.running === null && (now - st.lastCheckedAt >= MIN_INTERVAL_MS || st.lastCheckedAt === 0)) {
      st.lastCheckedAt = now;
      st.running = this.drive(st, now).finally(() => {
        st!.running = null;
      });
    }
    if (st.running !== null) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        st.running,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, GET_DEADLINE_MS);
          timer.unref?.();
        }),
      ]);
      if (timer !== undefined) clearTimeout(timer);
    }
    const r = (st.scan ?? scan).result();
    const usage: Omit<AgentUsage, "paneId" | "kind"> = { ...r };
    if (st.subagentsTruncated) usage.partial = true;
    if (st.running !== null) usage.scanning = true;
    if (usage.updatedAt === 0) usage.updatedAt = now;
    return usage;
  }

  /** サブエージェントの記録を数え直し、読み終えるまで進める（背景。上限ごとに主スレッドを譲る）。 */
  private async drive(st: PaneState, now: number): Promise<void> {
    if (st.mainFile === null || st.scan === null) return;
    if (now - st.lastRelistAt >= SUBAGENT_RELIST_MS || st.lastRelistAt === 0) {
      st.lastRelistAt = now;
      const { files, truncated } = await locateClaudeSubagents(st.mainFile, st.sessionId, this.roots());
      for (const f of files) st.scan.addFile(f, true);
      st.subagentsTruncated = truncated;
    }
    for (let guard = 0; guard < 10_000; guard++) {
      const scan = st.scan;
      if (scan === null) return;
      const r = await scan.advance();
      if (r.reset) {
        // 記録が小さくなった（書き換え）。最初から数え直す。
        const fresh = new ClaudeSessionScan(st.sessionId);
        for (const f of scan.files.values()) fresh.addFile(f.path, f.sub);
        st.scan = fresh;
        continue;
      }
      if (!r.more) return;
    }
  }
}
