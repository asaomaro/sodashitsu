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
    // 種類ごと・ディレクトリごとに並べて確かめる（WSL の `PATH` には Windows 側の `/mnt/c/…` が数十個あり、1 つずつ確かめると数秒かかる）。
    const kinds: AgentKindsResult["kinds"] = await Promise.all(
      Object.entries(AGENT_START_EXECUTABLES).map(async ([kind, executable]) => {
        const available =
          platform === "win32"
            ? false
            : (await Promise.all(dirs.map((dir) => isExecutable(join(dir, executable))))).some(Boolean);
        return { kind, label: agentStartLabel(kind), available };
      }),
    );
    const value = { kinds };
    cached = { at: now(), value };
    return value;
  };
}
