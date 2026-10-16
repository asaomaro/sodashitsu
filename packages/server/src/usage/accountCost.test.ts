import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { AccountCostReader, costRecord } from "./accountCost.js";
import { accountKeyOf } from "./reportedUsage.js";
import type { AccountUsage } from "@sodashitsu/protocol";
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});
const rec = (total: number, models: Record<string, unknown>, extra = {}) => ({
  type: "cost-state",
  sessionId: "s1",
  totalCostUSD: total,
  modelUsage: models,
  ...extra,
});
it("keeps explicit model/effort accounting and reconciles unclassified amounts without inferring from the last model", () => {
  const r = costRecord(rec(10, { a: { costUSD: 3, effort: "high" }, b: { costUSD: 4 } }), "s1", 0)!;
  expect([...r.models]).toEqual([
    ["a", 3],
    ["b", 4],
    ["不明", 3],
  ]);
  expect([...r.efforts]).toEqual([
    ["high", 3],
    ["不明", 7],
  ]);
  expect(costRecord(rec(-1, {}), "s1", 0)).toBeUndefined();
  expect(costRecord(rec(1, {}), "other", 0)).toBeUndefined();
  expect([...costRecord(rec(2, { a: { costUSD: 100 } }), "s1", 0)!.models]).toEqual([["不明", 2]]);
});
async function setup() {
  const config = await mkdtemp(join(tmpdir(), "account-cost-"));
  dirs.push(config);
  const root = join(config, "projects"),
    p = join(root, "project");
  await mkdir(p, { recursive: true });
  const key = accountKeyOf(
    "claude",
    createHash("sha256").update(config).digest("hex").slice(0, 16),
  );
  const account: AccountUsage = {
    kind: "claude",
    accountKey: key,
    label: "test",
    windows: [],
    source: "statusline",
    asOf: 0,
  };
  return { config, root, p, key, account };
}
it("deduplicates sessions across projects, adds only unclassified cache/live deltas, and isolates account keys", async () => {
  const { config, root, p, key, account } = await setup();
  await writeFile(
    join(p, "s1.jsonl"),
    JSON.stringify(
      rec(
        10,
        { a: { costUSD: 3, effort: "high" }, b: { costUSD: 7 } },
        { timestamp: "2026-10-15T00:00:00Z" },
      ),
    ) + "\n",
  );
  await mkdir(join(root, "copy"));
  await writeFile(
    join(root, "copy", "s1.jsonl"),
    JSON.stringify(rec(8, { a: { costUSD: 8 } }, { timestamp: "2026-10-14T00:00:00Z" })) + "\n",
  );
  await writeFile(
    join(p, "s2.jsonl"),
    JSON.stringify({ type: "assistant", model: "last-model" }) + "\n",
  );
  await writeFile(
    join(config, "weekly-usage.json"),
    JSON.stringify({
      sessions: { s1: { date: "2026-10-15", cost: 12 }, s3: { date: "2026-10-14", cost: 4 } },
    }),
  );
  const reader = new AccountCostReader(
    () => [root],
    () => Date.parse("2026-10-15T02:00:00Z"),
  );
  const r = await reader.read(account, [
    { accountKey: key, sessionId: "s1", usd: 14, at: Date.parse("2026-10-15T01:00:00Z") },
    { accountKey: "wrong", sessionId: "s4", usd: 100, at: 1 },
  ]);
  expect(r).toMatchObject({ totalUsd: 18, sessions: 3, unpricedSessions: 1, partial: false });
  expect(r.byModel).toEqual([
    { label: "不明", usd: 8, sessions: 2 },
    { label: "b", usd: 7, sessions: 1 },
    { label: "a", usd: 3, sessions: 1 },
  ]);
  expect(r.byEffort).toEqual([
    { label: "不明", usd: 15, sessions: 2 },
    { label: "high", usd: 3, sessions: 1 },
  ]);
  const other = await reader.read({ ...account, accountKey: "wrong" });
  expect(other.totalUsd).toBeUndefined();
  expect(other.sessions).toBe(0);
});
it("never follows linked project directories/files, bounds tail reads, and leaves absent costs unknown", async () => {
  const { root, p, account } = await setup();
  const outside = await mkdtemp(join(tmpdir(), "outside-cost-"));
  dirs.push(outside);
  await writeFile(
    join(outside, "s1.jsonl"),
    JSON.stringify(rec(999, { a: { costUSD: 999 } })) + "\n",
  );
  await symlink(outside, join(root, "escape"));
  await symlink(join(outside, "s1.jsonl"), join(p, "s1.jsonl"));
  await writeFile(
    join(p, "s2.jsonl"),
    " ".repeat(600 * 1024) + "\n" + JSON.stringify({ type: "assistant" }) + "\n",
  );
  const r = await new AccountCostReader(() => [root]).read(account);
  expect(r.totalUsd).toBeUndefined();
  expect(r.sessions).toBe(1);
  expect(r.partial).toBe(true);
  const empty = await new AccountCostReader(() => []).read({ ...account, kind: "codex" });
  expect(empty.totalUsd).toBeUndefined();
});
