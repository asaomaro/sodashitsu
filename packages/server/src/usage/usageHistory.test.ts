import { afterEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UsageHistoryReader } from "./usageHistory.js";
import { UsageHistoryParams, RpcError } from "@sodashitsu/protocol";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const range = { from: "2026-10-01", to: "2026-10-31" };
const lines = (...rows: unknown[]) => rows.map(r => JSON.stringify(r)).join("\n") + "\n";
const claude = (id: string, at: string | undefined, input = 10, output = 20, model = "sonnet") => ({ type: "assistant", timestamp: at, message: { id, model, usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 30, cache_creation_input_tokens: 40 } } });
const count = (at: string, input: number, output: number, cached = 0) => ({ timestamp: at, type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: output, cached_input_tokens: cached, reasoning_output_tokens: 9999 } } } });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "usage-history-")); dirs.push(dir);
  const root = join(dir, "claude", "projects"), project = join(root, "p"), codex = join(dir, "codex"), day = join(codex, "sessions", "2026", "10", "01");
  await mkdir(project, { recursive: true }); await mkdir(day, { recursive: true });
  const reader = new UsageHistoryReader({ claudeRoots: () => [root], codexHome: () => codex });
  return { dir, root, project, codex, day, reader };
}
it("aggregates actual UTC response timestamps, deduplicates repeated IDs/copies, separates roots, and excludes undated usage", async () => {
  const f = await fixture();
  await writeFile(join(f.project, "s1.jsonl"), lines(claude("a", "2026-10-01T01:00:00+09:00"), claude("b", "2026-10-02T01:00:00+09:00"), claude("b", "2026-10-02T01:00:00+09:00"), claude("no-date", undefined), { ...claude("sub", "2026-10-03T00:00:00Z"), isSidechain: true }));
  await mkdir(join(f.root, "copy"));
  await writeFile(join(f.root, "copy", "s1.jsonl"), lines(claude("b", "2026-10-02T01:00:00+09:00")));
  const otherRoot = join(f.dir, "other", "projects"); await mkdir(join(otherRoot, "p"), { recursive: true });
  await writeFile(join(otherRoot, "p", "s1.jsonl"), lines(claude("b", "2026-10-03T00:00:00Z")));
  const result = await new UsageHistoryReader({ claudeRoots: () => [f.root, otherRoot], codexHome: () => f.codex }).read(range);
  expect(result.calls).toBe(2); expect(result.sessions).toBe(2); expect(result.excluded).toBe(1);
  expect(result.byDay.map(d => d.label)).toEqual(["2026-10-01", "2026-10-03"]);
  expect(result.totals).toEqual({ input: 20, output: 40, cacheRead: 60, cacheWrite: 80, total: 200 });
  expect(JSON.stringify(result)).not.toContain(f.dir);
});
it("uses Codex cumulative differences and current turn model without adding cached/reasoning twice; resets are excluded", async () => {
  const f = await fixture();
  await writeFile(join(f.day, "rollout-2026-10-01T00-00-00-11111111-1111-4111-8111-111111111111.jsonl"), lines(
    { type: "turn_context", payload: { model: "gpt-5" } },
    count("2026-09-30T23:00:00Z", 100, 20, 40),
    count("2026-10-01T00:00:00Z", 150, 30, 50),
    count("2026-10-01T00:00:00Z", 150, 30, 50),
    { type: "turn_context", payload: { model: "gpt-6" } },
    count("2026-10-02T00:00:00Z", 200, 50, 70),
    count("2026-10-03T00:00:00Z", 5, 1, 0),
    count("2026-10-03T01:00:00Z", 15, 5, 5),
  ));
  const result = await f.reader.read(range);
  expect(result.calls).toBe(3); expect(result.excluded).toBe(1); expect(result.partial).toBe(true);
  expect(result.totals).toEqual({ input: 75, output: 34, cacheRead: 35, cacheWrite: 0, total: 144 });
  expect(result.byModel.map(r => [r.label, r.total])).toEqual([["codex · gpt-6", 84], ["codex · gpt-5", 60]]);
});
it("bounds huge/tail files, excludes the first cumulative value without baseline, ignores incomplete rows and linked paths", async () => {
  const f = await fixture();
  const target = join(f.dir, "secret.jsonl"); await writeFile(target, lines(claude("secret", "2026-10-01T00:00:00Z", 999)));
  await symlink(target, join(f.project, "link.jsonl"));
  await symlink(f.dir, join(f.root, "linked-directory"));
  await writeFile(join(f.day, "rollout-2026-10-01T00-00-00-11111111-1111-4111-8111-111111111111.jsonl"), "x".repeat(3 * 1024 * 1024) + "\n" + lines(count("2026-10-01T00:00:00Z", 100, 20, 40), count("2026-10-02T00:00:00Z", 150, 30, 50)) + JSON.stringify(count("2026-10-03T00:00:00Z", 9999, 9999)));
  const result = await f.reader.read(range);
  expect(result.partial).toBe(true); expect(result.excluded).toBe(1); expect(result.totals.total).toBe(60); expect(result.calls).toBe(1);
  expect(result.byModel[0]?.label).toBe("codex · 不明");
});
it("validates range dates and cancels before reading records", async () => {
  const f = await fixture();
  expect(UsageHistoryParams.safeParse({ from: "2026-02-30", to: "2026-03-10" }).success).toBe(false);
  expect(UsageHistoryParams.safeParse({ from: "2024-01-01", to: "2026-01-01" }).success).toBe(false);
  expect(() => f.reader.read(range, () => { throw new RpcError("unauthorized", "revoked"); })).toThrow(/revoked/);
});
it("keeps valid events after cumulative reset even if their totals match a previous generation", async () => {
  const f = await fixture();
  await writeFile(join(f.day, "rollout-2026-10-01T00-00-00-11111111-1111-4111-8111-111111111111.jsonl"), lines(
    count("2026-10-01T00:00:00Z", 100, 20), count("2026-10-02T00:00:00Z", 0, 0), count("2026-10-03T00:00:00Z", 100, 20),
  ));
  const result = await f.reader.read(range);
  expect(result.calls).toBe(2); expect(result.totals.total).toBe(240); expect(result.partial).toBe(true);
});
it("retains a physical scan limit independently from the four-entry cache", async () => {
  const f = await fixture();
  const requests = Array.from({length: 8}, (_, day) => f.reader.read({from: `2026-10-${String(day+1).padStart(2,"0")}`, to:"2026-10-31"}));
  const results = await Promise.allSettled(requests);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(2);
  expect(results.filter(r => r.status === "rejected")).toHaveLength(6);
  await expect(f.reader.read({from:"2026-10-10",to:"2026-10-31"})).resolves.toMatchObject({calls:0});
});
it("includes archived Codex records without double counting a copy in active sessions", async () => {
  const f = await fixture();
  const filename = "rollout-2026-10-01T00-00-00-11111111-1111-4111-8111-111111111111.jsonl";
  const data = lines(count("2026-10-01T00:00:00Z", 100, 20));
  await writeFile(join(f.day, filename), data);
  await mkdir(join(f.codex,"archived_sessions"));
  await writeFile(join(f.codex,"archived_sessions",filename),data);
  expect(await f.reader.read(range)).toMatchObject({calls:1,sessions:1,totals:{total:120}});
});
