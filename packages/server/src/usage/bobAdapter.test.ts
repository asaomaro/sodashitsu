import { rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTempDir } from "../persist/atomicFile.js";
import { BobUsageAdapter, bobUsageFromRow } from "./bobAdapter.js";

/**
 * Bob Shell の記録の読み（20261016-agent-usage-bob-copilot）。表の形・値は、実機 2.0.6 の `~/.bob/db/bob.db` の `tasks` から写した（題・最初のメッセージは除いた）。
 */

const TASK = "a90d344e36bbf09cf98363f0e9520b46";
const ENV = JSON.stringify({ id: TASK, workspace: "/w", model: { id: "premium-ide", family: "", provider: "", version: "", contextWindow: 270000 } });

function makeDb(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', first_message TEXT, env TEXT, costs TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)");
  return db;
}

describe("bobUsageFromRow", () => {
  it("costs の Bobcoin とコンテキスト、env の窓の大きさから作る（画面の下の `19.7k / 270.0k (7%) · 0.079 🅞` と同じ）", () => {
    const u = bobUsageFromRow({ costs: '{"cost":0.078512,"contextTokens":19700}', env: ENV, updated_at: 1792136261819 }, 0);
    expect(u).toEqual({
      model: "premium-ide",
      tokens: { basis: "context", input: 19700 },
      source: "bob-db",
      updatedAt: 1792136261819,
      credits: { amount: 0.078512, unit: "bobcoin" },
      contextTokens: 19700,
      contextWindowTokens: 270000,
      contextUsedPct: 7.3,
    });
  });

  it("窓の大きさが無ければ率は出さない。costs が無い・壊れている・数でなければ null（無いものは無い）", () => {
    expect(bobUsageFromRow({ costs: '{"cost":0.5}', env: null, updated_at: 5 }, 9)).toMatchObject({ model: null, credits: { amount: 0.5 }, updatedAt: 5 });
    expect(bobUsageFromRow({ costs: '{"cost":0.5}', env: null, updated_at: 5 }, 9)?.contextUsedPct).toBeUndefined();
    expect(bobUsageFromRow({ costs: null, env: ENV, updated_at: 5 }, 9)).toBeNull();
    expect(bobUsageFromRow({ costs: "{oops", env: ENV, updated_at: 5 }, 9)).toBeNull();
    expect(bobUsageFromRow({ costs: '{"cost":"1","contextTokens":-3}', env: ENV, updated_at: 5 }, 9)).toBeNull();
  });
});

describe("BobUsageAdapter", () => {
  let dir: string;
  let file: string;
  let db: DatabaseSync;
  let now: number;
  beforeEach(async () => {
    dir = await makeTempDir("soda-bob-usage-");
    file = join(dir, "bob.db");
    db = makeDb(file);
    db.prepare("INSERT INTO tasks (id, title, first_message, env, costs, created_at, updated_at) VALUES (?, 'secret title', 'secret message', ?, ?, 1, 2)").run(TASK, ENV, '{"cost":0.039,"contextTokens":19556}');
    now = 1_000_000;
  });
  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const adapter = (path = () => file) => new BobUsageAdapter({ dbPath: path, now: () => now });

  it("タスクの行を読む（Bob が書き込み中の WAL の DB でも、読み取りだけで開く）。題・メッセージは出さない", async () => {
    const a = adapter();
    const u = await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined });
    expect(u).toMatchObject({ credits: { amount: 0.039, unit: "bobcoin" }, contextTokens: 19556 });
    expect(JSON.stringify(u)).not.toContain("secret");
  });

  it("1 秒に 1 回まで。間をあければ、更新を読む", async () => {
    const a = adapter();
    await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined });
    db.prepare("UPDATE tasks SET costs = ?, updated_at = 3 WHERE id = ?").run('{"cost":0.0785,"contextTokens":19700}', TASK);
    expect((await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined }))?.credits?.amount).toBe(0.039);
    now += 1_000;
    expect((await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined }))?.credits?.amount).toBe(0.0785);
  });

  it("DB がロックされて読めなければ、前の値を出し、5 秒は読み直さない（同期の待ちを重ねない）", async () => {
    const a = adapter();
    expect((await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined }))?.credits?.amount).toBe(0.039);
    // WAL では普通の書き込み中も読めるので、読み手も止める排他の接続でロックを作る（Bob の WAL の後始末〔checkpoint〕の最中に近い）。
    db.close();
    const locker = new DatabaseSync(file);
    locker.exec("PRAGMA locking_mode = EXCLUSIVE");
    locker.prepare("UPDATE tasks SET costs = ?, updated_at = 3 WHERE id = ?").run('{"cost":0.5,"contextTokens":1}', TASK);
    now += 1_000;
    expect((await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined }))?.credits?.amount).toBe(0.039); // 前の値
    locker.close();
    db = new DatabaseSync(file);
    now += 2_000;
    expect((await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined }))?.credits?.amount).toBe(0.039); // まだ間をあけている
    now += 3_000;
    expect((await a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined }))?.credits?.amount).toBe(0.5);
  });

  it("pane が複数でも、DB の読みはまとめる（2 つ目の pane の新しいタスクは、すぐ読む）", async () => {
    const T2 = "b".repeat(32);
    db.prepare("INSERT INTO tasks (id, env, costs, created_at, updated_at) VALUES (?, ?, ?, 1, 2)").run(T2, ENV, '{"cost":1.5,"contextTokens":10}');
    const a = adapter();
    const [x, y] = await Promise.all([
      a.usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined }),
      a.usageFor({ paneId: "q", sessionId: T2, transcriptPath: undefined }),
    ]);
    expect(x?.credits?.amount).toBe(0.039);
    expect(y?.credits?.amount ?? (await a.usageFor({ paneId: "q", sessionId: T2, transcriptPath: undefined }))?.credits?.amount).toBe(1.5);
  });

  it("id の形が違う・行が無い・DB が無い・DB がリンクなら null", async () => {
    expect(await adapter().usageFor({ paneId: "p", sessionId: "x'; DROP TABLE tasks; --", transcriptPath: undefined })).toBeNull();
    expect(await adapter().usageFor({ paneId: "p", sessionId: "0".repeat(32), transcriptPath: undefined })).toBeNull();
    expect(await adapter(() => join(dir, "none.db")).usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined })).toBeNull();
    const link = join(dir, "link.db");
    await symlink(file, link);
    expect(await adapter(() => link).usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined })).toBeNull();
  });

  it("表の形が違う（版が替わった）DB でも投げない", async () => {
    const other = join(dir, "other.db");
    const d = new DatabaseSync(other);
    d.exec("CREATE TABLE something (x)");
    d.close();
    expect(await adapter(() => other).usageFor({ paneId: "p", sessionId: TASK, transcriptPath: undefined })).toBeNull();
  });
});
