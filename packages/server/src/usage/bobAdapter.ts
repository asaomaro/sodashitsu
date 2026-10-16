import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AgentUsage } from "@sodashitsu/protocol";
import { lstatRegular } from "../agent/safeFile.js";
import { safeModel } from "./claudeScan.js";
import type { UsageAdapter, UsageSourceInfo } from "./UsageService.js";

/**
 * Bob Shell のアダプタ（20261016-agent-usage-bob-copilot）。pane の会話は `pane.agentSession`（フックの `session_id`＝Bob のタスクの id）。
 *
 * 記録は `~/.bob/db/bob.db`（SQLite・WAL）の `tasks` の行（実機 2.0.6）:
 * - `costs` = `{"cost":<Bobcoin の累計>,"contextTokens":<いま文脈にあるトークン数>}`（画面の下の `19.7k / 270.0k (7%) · 0.079 🅞` と同じ値）
 * - `env.model` = `{"id":"premium-ide",…,"contextWindow":270000}`（タスクを作ったときのもの）
 * - `updated_at`（epoch ms）
 * 入力・出力の内訳は記録に無いので、トークンは「いま文脈にある分」（`basis: "context"`）だけ。コストは USD でないので `credits`（Bobcoin）に入れる。
 *
 * - 読み取りだけで開く（`readOnly`。WAL なので Bob の書き込みを妨げない）。開く前に、リンクでない通常のファイルかを確かめる。
 * - `DatabaseSync` は同期なので、DB ごとに `MIN_INTERVAL_MS` に 1 回まで（pane の数によらず、1 回で全部のタスクを読む）、かつ `bob.db`・`bob.db-wal` の
 *   大きさ・更新の時刻が変わったときだけ読む。ロックの待ちは `BUSY_TIMEOUT_MS` まで、失敗したら `FAIL_BACKOFF_MS` は読まない。
 * - 持つのは数字・モデルの id・時刻だけ（タスクの題・最初のメッセージなどは読まない）。
 */

const MIN_INTERVAL_MS = 1_000;
const BUSY_TIMEOUT_MS = 20;
const FAIL_BACKOFF_MS = 5_000;
const TASK_ID_RE = /^[0-9a-f]{32}$/;

type Usage = Omit<AgentUsage, "paneId" | "kind">;

export interface BobAdapterOptions {
  /** `bob.db` の場所（既定は `~/.bob/db/bob.db`。Bob に場所を替える環境変数は無い）。 */
  dbPath?: () => string;
  now?: () => number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function parseObject(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.length > 1024 * 1024) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** タスクの行から、利用状況を作る（純関数。テストのため export）。 */
export function bobUsageFromRow(row: { costs: unknown; env: unknown; updated_at: unknown }, now: number): Usage | null {
  const costs = parseObject(row.costs);
  if (costs === null) return null;
  const amount = num(costs["cost"]);
  const context = num(costs["contextTokens"]);
  if (amount === null && context === null) return null;
  const env = parseObject(row.env);
  const model = env !== null && typeof env["model"] === "object" && env["model"] !== null ? (env["model"] as Record<string, unknown>) : null;
  const window = model !== null ? num(model["contextWindow"]) : null;
  const updated = num(row.updated_at);
  const out: Usage = {
    model: model !== null ? safeModel(model["id"]) : null,
    // 「いま文脈にある分」は、包みの報告（`mergeReported`）と同じく `input` に置く（累計の `total` は無い）。
    tokens: { basis: "context", ...(context !== null ? { input: context } : {}) },
    source: "bob-db",
    updatedAt: updated !== null && updated > 0 ? updated : now,
  };
  if (amount !== null) out.credits = { amount, unit: "bobcoin" };
  if (context !== null) {
    out.contextTokens = context;
    if (window !== null && window > 0) {
      out.contextWindowTokens = window;
      out.contextUsedPct = Math.min(100, Math.round((context / window) * 1000) / 10);
    }
  }
  return out;
}

export class BobUsageAdapter implements UsageAdapter {
  readonly kind = "bob";
  /** pane → そのタスクの id（読む対象）。 */
  private readonly panes = new Map<string, string>();
  /**
   * DB の読みは、pane の数によらず **DB ごとに `MIN_INTERVAL_MS` に 1 回まで**（`DatabaseSync` は同期で、ロックの待ちはイベントループを止めるため）。
   * 1 回で、いま見ている全部のタスクの行を読む。失敗（ロック中など）したら `FAIL_BACKOFF_MS` は読まず、前の値を出す。
   */
  private db: { file: string; checkedAt: number; stamp: string; rows: Map<string, Usage | null>; failUntil: number } | null = null;
  private reading: Promise<void> | null = null;
  private readonly dbPath: () => string;
  private readonly now: () => number;
  private closed = false;

  constructor(opts: BobAdapterOptions = {}) {
    this.dbPath = opts.dbPath ?? (() => join(homedir(), ".bob", "db", "bob.db"));
    this.now = opts.now ?? Date.now;
  }

  forget(paneId: string): void {
    this.panes.delete(paneId);
  }

  close(): void {
    this.closed = true;
    this.panes.clear();
    this.db = null;
  }

  async usageFor(source: UsageSourceInfo): Promise<Usage | null> {
    if (this.closed || !TASK_ID_RE.test(source.sessionId)) return null;
    this.panes.set(source.paneId, source.sessionId);
    const file = this.dbPath();
    const now = this.now();
    if (this.db === null || this.db.file !== file) this.db = { file, checkedAt: 0, stamp: "", rows: new Map(), failUntil: 0 };
    const db = this.db;
    const due = db.checkedAt === 0 || now - db.checkedAt >= MIN_INTERVAL_MS || (!db.rows.has(source.sessionId) && now >= db.failUntil);
    if (due && now >= db.failUntil) {
      this.reading ??= this.refresh(db, now).finally(() => {
        this.reading = null;
      });
    }
    if (this.reading !== null) await this.reading;
    if (this.closed) return null;
    return db.rows.get(source.sessionId) ?? null;
  }

  private async refresh(db: NonNullable<BobUsageAdapter["db"]>, now: number): Promise<void> {
    db.checkedAt = now;
    if ((await lstatRegular(db.file)) !== "ok") {
      db.rows.clear();
      db.stamp = "";
      db.failUntil = now + FAIL_BACKOFF_MS; // 無い・リンク: 呼ばれるたびに確かめに行かない
      return;
    }
    const stamp = await stampOf(db.file);
    if (this.closed) return;
    const ids = [...new Set(this.panes.values())];
    if (stamp === db.stamp && ids.every((id) => db.rows.has(id))) return; // 変わっていない
    const rows = readTasks(db.file, ids, now);
    if (rows === null) {
      db.failUntil = now + FAIL_BACKOFF_MS; // ロック中・開けない: 間をあける（前の値は、そのまま出す）
      return;
    }
    db.stamp = stamp;
    db.rows = rows;
  }
}

/** `bob.db` と `bob.db-wal` の大きさ・更新の時刻（変わっていなければ、読み直さない）。 */
async function stampOf(file: string): Promise<string> {
  const parts: string[] = [];
  for (const f of [file, `${file}-wal`]) {
    try {
      const s = await stat(f);
      parts.push(`${s.size}:${s.mtimeMs}`);
    } catch {
      parts.push("-");
    }
  }
  return parts.join("|");
}

/** 渡したタスクの行を 1 回で読む。開けない・ロック中・表の形が違えば null（呼び手が間をあける）。 */
function readTasks(file: string, ids: readonly string[], now: number): Map<string, Usage | null> | null {
  const out = new Map<string, Usage | null>(ids.map((id) => [id, null]));
  if (ids.length === 0) return out;
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(file, { readOnly: true, timeout: BUSY_TIMEOUT_MS });
    const stmt = db.prepare(`SELECT id, costs, env, updated_at FROM tasks WHERE id IN (${ids.map(() => "?").join(",")})`);
    for (const row of stmt.all(...ids) as { id: unknown; costs: unknown; env: unknown; updated_at: unknown }[]) {
      if (typeof row.id === "string" && out.has(row.id)) out.set(row.id, bobUsageFromRow(row, now));
    }
    return out;
  } catch {
    return null; // 開けない・形が違う（版が替わった）・書き込みの最中
  } finally {
    try {
      db?.close();
    } catch {
      // 閉じられない（開けていない）
    }
  }
}
