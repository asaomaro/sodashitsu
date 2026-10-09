import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { AGENT_START_EXECUTABLES, agentStartLabel, type AgentKindsResult } from "@sodashitsu/protocol";

/**
 * 起動できるエージェントの種類の一覧（`agent.kinds`。20261008-graph-first の PR3）。表（`AGENT_START_EXECUTABLES`）の種類のうち、サーバのプロセスの `PATH` に実行ファイルがあるもの
 * を `available` にする。**実行ファイルの名前・パスは返さない**。Windows のサーバは、`agent.start` が未対応なので、すべて `available: false`。
 * 検索は 5 秒だけ覚える（フォームを開くたびに呼ばれても、ディスクを何度も見ない）。
 */
const CACHE_MS = 5_000;

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface AgentKindsOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  now?: () => number;
}

export function createAgentKindsLister(opts: AgentKindsOptions = {}): () => Promise<AgentKindsResult> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const now = opts.now ?? Date.now;
  let cached: { at: number; value: AgentKindsResult } | null = null;
  return async () => {
    if (cached !== null && now() - cached.at < CACHE_MS) return cached.value;
    const dirs = (env["PATH"] ?? "").split(delimiter).filter((d) => d !== "");
    const kinds: AgentKindsResult["kinds"] = [];
    for (const [kind, executable] of Object.entries(AGENT_START_EXECUTABLES)) {
      let available = false;
      if (platform !== "win32") {
        for (const dir of dirs) {
          if (await isExecutable(join(dir, executable))) {
            available = true;
            break;
          }
        }
      }
      kinds.push({ kind, label: agentStartLabel(kind), available });
    }
    const value = { kinds };
    cached = { at: now(), value };
    return value;
  };
}
