import { createHash } from "node:crypto";
import { opendir, realpath } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { AccountCostResult, AccountUsage, CostGroup } from "@sodashitsu/protocol";
import { lstatRegular, openVerified, readRange } from "../agent/safeFile.js";
import { claudeRoots, SESSION_ID_RE } from "./claudeSource.js";
import { accountKeyOf } from "./reportedUsage.js";

type LiveCost = { accountKey: string; sessionId: string; usd: number; at: number };
type Cost = { usd: number; at: number; models: Map<string, number>; efforts: Map<string, number> };
const number = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e9;
const label = (x: unknown) =>
  typeof x === "string" && x.length > 0 && x.length <= 128 && !/[\x00-\x1f\x7f]/.test(x)
    ? x
    : "不明";
/** Only explicit accounting amounts are classified. The last model/effort of a session is never applied to its entire cost. */
export function costRecord(
  row: Record<string, any>,
  sessionId: string,
  at: number,
): Cost | undefined {
  if (
    row.type !== "cost-state" ||
    (row.sessionId !== undefined && row.sessionId !== sessionId) ||
    !number(row.totalCostUSD)
  )
    return;
  const usd = row.totalCostUSD,
    models = new Map<string, number>(),
    efforts = new Map<string, number>();
  if (row.modelUsage && typeof row.modelUsage === "object" && !Array.isArray(row.modelUsage)) {
    for (const [model, value] of Object.entries(row.modelUsage).slice(0, 256)) {
      if (!value || typeof value !== "object") continue;
      const x = value as Record<string, unknown>;
      if (!number(x.costUSD)) continue;
      models.set(label(model), (models.get(label(model)) ?? 0) + x.costUSD);
      // A breakdown is valid only when the accounting record itself carries its effort.
      const effort = label(x.effort ?? row.effort);
      efforts.set(effort, (efforts.get(effort) ?? 0) + x.costUSD);
    }
  }
  const reconcile = (map: Map<string, number>) => {
    const sum = [...map.values()].reduce((a, b) => a + b, 0);
    if (sum > usd + 0.000001) {
      map.clear();
      map.set("不明", usd);
    } else if (usd - sum > 0.000001 || !map.size)
      map.set("不明", (map.get("不明") ?? 0) + usd - sum);
  };
  reconcile(models);
  reconcile(efforts);
  return { usd, at, models, efforts };
}

/** Bounded on-demand scan of configured account roots. Never accepts a client-provided path or reads credentials. */
export class AccountCostReader {
  private cache = new Map<string, { at: number; result: Promise<AccountCostResult> }>();
  constructor(
    private readonly roots: () => string[] = claudeRoots,
    private readonly now = Date.now,
  ) {}
  read(account: AccountUsage, live: LiveCost[] = []): Promise<AccountCostResult> {
    const cached = this.cache.get(account.accountKey),
      at = this.now();
    if (cached && at >= cached.at && at - cached.at < 10_000) return cached.result;
    const result = this.load(account, live, at);
    this.cache.set(account.accountKey, { at, result });
    if (this.cache.size > 16) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
  private async load(
    account: AccountUsage,
    live: LiveCost[],
    now: number,
  ): Promise<AccountCostResult> {
    const costs = new Map<string, Cost>(),
      seen = new Set<string>();
    let partial = false,
      budget = 64 * 1024 * 1024,
      entries = 0,
      files = 0;
    const deadline = Date.now() + 2500;
    const running = () => {
      const ok = entries < 20_000 && files < 512 && budget > 0 && Date.now() < deadline;
      if (!ok) partial = true;
      return ok;
    };
    const unknown = (usd: number, at: number): Cost => ({
      usd,
      at,
      models: new Map([["不明", usd]]),
      efforts: new Map([["不明", usd]]),
    });
    const take = (id: string, cost: Cost) => {
      const old = costs.get(id);
      if (!old || old.at <= cost.at) costs.set(id, cost);
    };
    if (account.kind === "claude") {
      for (const [index, configured] of this.roots().entries()) {
        const config = resolve(dirname(configured));
        const key = accountKeyOf(
          "claude",
          createHash("sha256").update(config).digest("hex").slice(0, 16),
        );
        if (
          key !== account.accountKey &&
          !(index === 0 && accountKeyOf("claude", undefined) === account.accountKey)
        )
          continue;
        const root = await realpath(configured).catch(() => null);
        if (!root) continue;
        try {
          const dirs = await opendir(root);
          for await (const dir of dirs) {
            entries++;
            if (!running()) break;
            if (!dir.isDirectory() || dir.isSymbolicLink()) continue;
            const project = join(root, dir.name);
            if ((await realpath(project).catch(() => null)) !== project) {
              partial = true;
              continue;
            }
            try {
              const children = await opendir(project);
              for await (const child of children) {
                entries++;
                if (!running()) break;
                if (!child.isFile() || !child.name.endsWith(".jsonl")) continue;
                const id = child.name.slice(0, -6);
                if (!SESSION_ID_RE.test(id)) continue;
                const file = join(project, child.name);
                if ((await lstatRegular(file)) !== "ok") {
                  partial = true;
                  continue;
                }
                files++;
                seen.add(id);
                const opened = await openVerified(file).catch(() => null);
                if (!opened) {
                  partial = true;
                  continue;
                }
                try {
                  const count = Math.min(opened.st.size, 512 * 1024, budget),
                    start = opened.st.size - count;
                  budget -= count;
                  if (start > 0) partial = true;
                  const bytes = await readRange(opened.fd, start, count);
                  let lines = bytes.toString("utf8").split("\n");
                  if (start > 0) lines = lines.slice(1);
                  lines.pop(); // incomplete final row must not be used
                  for (const line of lines) {
                    if (!line.includes("cost-state")) continue;
                    try {
                      const row = JSON.parse(line);
                      if (!row || typeof row !== "object") continue;
                      const stamp =
                        typeof row.timestamp === "string" ? Date.parse(row.timestamp) : NaN;
                      const cost = costRecord(
                        row,
                        id,
                        Number.isFinite(stamp) ? stamp : opened.st.mtimeMs,
                      );
                      if (cost) take(id, cost);
                    } catch {
                      partial = true;
                    }
                  }
                } finally {
                  await opened.fd.close();
                }
              }
            } catch {
              partial = true;
            }
          }
        } catch {
          partial = true;
        }
        // Existing statusline cache includes closed sessions and can be newer than cost-state.
        const cacheFile = join(dirname(root), "weekly-usage.json");
        if ((await lstatRegular(cacheFile)) === "ok") {
          const opened = await openVerified(cacheFile).catch(() => null);
          if (opened)
            try {
              if (opened.st.size > 1024 * 1024) partial = true;
              else {
                const raw = JSON.parse(
                  (await readRange(opened.fd, 0, opened.st.size)).toString("utf8"),
                );
                const cached = raw?.sessions;
                if (cached && typeof cached === "object" && !Array.isArray(cached)) {
                  const rows = Object.entries(cached);
                  if (rows.length > 4096) partial = true;
                  for (const [id, value] of rows.slice(0, 4096)) {
                    if (!SESSION_ID_RE.test(id) || !value || typeof value !== "object") continue;
                    const x = value as Record<string, unknown>;
                    if (
                      !number(x.cost) ||
                      typeof x.date !== "string" ||
                      !/^\d{4}-\d{2}-\d{2}$/.test(x.date)
                    )
                      continue;
                    seen.add(id);
                    const prior = costs.get(id);
                    // The cache has no per-entry timestamps. It may add a known nonnegative remainder, but never replace a larger verified total.
                    if (!prior) take(id, unknown(x.cost, opened.st.mtimeMs));
                    else if (x.cost > prior.usd) {
                      const delta = x.cost - prior.usd;
                      prior.usd = x.cost;
                      prior.models.set("不明", (prior.models.get("不明") ?? 0) + delta);
                      prior.efforts.set("不明", (prior.efforts.get("不明") ?? 0) + delta);
                    }
                  }
                }
              }
            } catch {
              partial = true;
            } finally {
              await opened.fd.close();
            }
        }
      }
    }
    for (const report of live)
      if (report.accountKey === account.accountKey && number(report.usd)) {
        seen.add(report.sessionId);
        const old = costs.get(report.sessionId);
        if (!old) take(report.sessionId, unknown(report.usd, report.at));
        else if (report.at >= old.at && report.usd >= old.usd) {
          const delta = report.usd - old.usd;
          old.usd = report.usd;
          old.models.set("不明", (old.models.get("不明") ?? 0) + delta);
          old.efforts.set("不明", (old.efforts.get("不明") ?? 0) + delta);
        }
      }
    const groups = (field: "models" | "efforts"): CostGroup[] => {
      const map = new Map<string, CostGroup>();
      for (const cost of costs.values())
        for (const [name, usd] of cost[field]) {
          const row = map.get(name) ?? { label: name, usd: 0, sessions: 0 };
          row.usd += usd;
          row.sessions++;
          map.set(name, row);
        }
      return [...map.values()].sort((a, b) => b.usd - a.usd || a.label.localeCompare(b.label));
    };
    return {
      accountKey: account.accountKey,
      ...(costs.size ? { totalUsd: [...costs.values()].reduce((a, b) => a + b.usd, 0) } : {}),
      sessions: seen.size,
      unpricedSessions: seen.size - costs.size,
      byModel: groups("models"),
      byEffort: groups("efforts"),
      partial,
      asOf: now,
    };
  }
}
