import type { UsageWindow } from "@sodashitsu/protocol";
import { openVerified, readRange } from "../agent/safeFile.js";
import { safeModel } from "./claudeScan.js";

/**
 * Codex の会話の記録（`rollout-*.jsonl`）の末尾から、利用状況の数字を読む（20261010-agent-usage の AC4。調査 `research.md` の 3）。
 *
 * - 最後の `event_msg` の `token_count`（`info.total_token_usage`＝累計・`last_token_usage`・`model_context_window`）と、その `rate_limits`。
 *   `info` が null の行（制限だけの行）では、累計は前のまま。
 * - 最後の `turn_context` の `model`。
 * - **続きから読む**: 初回は末尾の窓（`TAIL_STEP_BYTES`。足りなければ 4 倍ずつ、上限 `TAIL_MAX_BYTES`）を逆に見て、最後の `token_count` と `turn_context` が見つかるまで
 *   （`turn_context` はターンごとなので、長いターンの後は遠い。実機で、52 MB の記録の最後の `turn_context` が末尾から 8.7 MB にあった）。以後は前回の位置から
 *   （1 回 `INCREMENT_MAX_BYTES` まで。それ以上増えたときは末尾の窓だけ読み直す）。ファイルが小さくなったら最初（末尾）からやり直す。
 * - 開くのは `safeFile.openVerified`（`O_NOFOLLOW`・`O_NONBLOCK`・開いた fd で通常のファイル・リンク 1 つを確かめ直す）。
 * 中身（会話の文）は、どこにも保持しない。持つのは数字・モデル名・時刻だけ。
 */

export const TAIL_STEP_BYTES = 256 * 1024;
export const TAIL_MAX_BYTES = 16 * 1024 * 1024;
export const INCREMENT_MAX_BYTES = 1024 * 1024;
/** この大きさを超える 1 行は、読まずに飛ばす（`token_count` の行は数百バイト）。 */
const LINE_MAX_BYTES = 2 * 1024 * 1024;

export interface CodexTokenUsage {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
  reasoning: number;
  total: number;
}

export interface CodexCount {
  /** 累計（`total_token_usage`）。 */
  total: CodexTokenUsage | null;
  /** 最後の呼び出し（`last_token_usage`）。 */
  last: CodexTokenUsage | null;
  contextWindow: number | null;
  /** その行の時刻（epoch ms）。 */
  at: number;
}

export interface CodexRateLimits {
  windows: { slot: "primary" | "secondary"; usedPct: number; resetsAtMs?: number; windowMinutes?: number }[];
  plan?: string;
  /** その行の時刻（epoch ms）。 */
  at: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

function tokenUsage(v: unknown): CodexTokenUsage | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const input = num(o["input_tokens"]);
  const output = num(o["output_tokens"]);
  if (input === null || output === null) return null;
  return {
    input,
    cached: num(o["cached_input_tokens"]) ?? 0,
    cacheWrite: num(o["cache_write_input_tokens"]) ?? 0,
    output,
    reasoning: num(o["reasoning_output_tokens"]) ?? 0,
    total: num(o["total_tokens"]) ?? input + output,
  };
}

/**
 * 制限の枠は、`limit_id` が無いか `"codex"` のものだけを使う（モデルごとの別枠〔`codex_other` など〕を、Codex の枠として出さない）。ほかの `limit_id` の行は、
 * 無い扱い（アカウントの枠は、次の記録へ）。
 */
function rateLimits(v: unknown, at: number): CodexRateLimits | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const limitId = o["limit_id"];
  if (limitId !== undefined && limitId !== null && limitId !== "codex") return null;
  const windows: CodexRateLimits["windows"] = [];
  for (const slot of ["primary", "secondary"] as const) {
    const w = o[slot];
    if (typeof w !== "object" || w === null) continue;
    const x = w as Record<string, unknown>;
    const used = num(x["used_percent"]);
    if (used === null) continue;
    const resets = num(x["resets_at"]);
    const minutes = num(x["window_minutes"]);
    windows.push({
      slot,
      usedPct: Math.min(1000, used),
      ...(resets !== null ? { resetsAtMs: resets * 1000 } : {}),
      ...(minutes !== null ? { windowMinutes: minutes } : {}),
    });
  }
  if (windows.length === 0) return null;
  const plan = typeof o["plan_type"] === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(o["plan_type"]) ? o["plan_type"] : undefined;
  return { windows, ...(plan !== undefined ? { plan } : {}), at };
}

/** 制限の枠のラベル（`window_minutes` から。300→「5 時間」・10080→「週」・ほかは「N 分」。分からなければ、枠の名前）。 */
export function windowLabel(minutes: number | undefined, slot: string): string {
  if (minutes === undefined) return slot === "primary" ? "主の枠" : "副の枠";
  if (minutes === 300) return "5 時間";
  if (minutes === 10080) return "週";
  return `${Math.round(minutes)} 分`;
}

export function toWindows(r: CodexRateLimits, now: number): UsageWindow[] {
  return r.windows.map((w) => ({
    label: windowLabel(w.windowMinutes, w.slot),
    usedPct: w.usedPct,
    ...(w.resetsAtMs !== undefined ? { resetsAt: w.resetsAtMs } : {}),
    ...(w.windowMinutes !== undefined ? { windowMinutes: w.windowMinutes } : {}),
    ...(w.resetsAtMs !== undefined && w.resetsAtMs <= now ? { stale: true } : {}),
  }));
}

/** 1 つの記録の末尾から読んだ最新の状態。 */
export class CodexRolloutTail {
  count: CodexCount | null = null;
  limits: CodexRateLimits | null = null;
  model: string | null = null;
  /** 次に読む位置（読み終えた最後の改行の次）。 */
  private offset = 0;
  private started = false;
  /** 初回に、末尾の窓だけを読んだ（一部）。 */
  partial = false;

  /**
   * `limitsOnly`: アカウントの枠のための読み（`rate_limits` だけ。`model` と累計は探さない。見つかった時点で止める）。
   */
  constructor(
    readonly file: string,
    private readonly limitsOnly = false,
  ) {}

  /** 増えた分を読む。読めなければ false（呼び手が、次の機会に。投げない）。 */
  async refresh(): Promise<boolean> {
    let opened;
    try {
      opened = await openVerified(this.file);
    } catch {
      return false;
    }
    if (opened === null) return false;
    const { fd, st } = opened;
    try {
      return await this.refreshOpen(fd, st.size);
    } catch {
      return false; // 読みの途中の I/O エラー。次の機会に
    } finally {
      await fd.close().catch(() => undefined);
    }
  }

  private async refreshOpen(fd: Parameters<typeof readRange>[0], size: number): Promise<boolean> {
    if (!this.started || size < this.offset) {
      this.reset();
      await this.readTail(fd, size);
      this.started = true;
      return true;
    }
    if (size === this.offset) return true;
    const start = this.offset;
    if (size - start > INCREMENT_MAX_BYTES) {
      // 大きく増えた（長い間見ていなかった）: 末尾の窓だけ読み直す。窓に無かった項目は、前の値のまま。
      const prev = { count: this.count, limits: this.limits, model: this.model };
      await this.readTail(fd, size);
      this.count ??= prev.count;
      this.limits ??= prev.limits;
      this.model ??= prev.model;
      return true;
    }
    const buf = await readRange(fd, start, size - start);
    const end = buf.lastIndexOf(0x0a);
    if (end === -1) return true; // 書き途中の行だけ（次に読む）
    this.consume(buf.subarray(0, end + 1));
    this.offset = start + end + 1;
    return true;
  }

  private reset(): void {
    this.count = null;
    this.limits = null;
    this.model = null;
    this.offset = 0;
    this.partial = false;
  }

  /**
   * 末尾の窓（`TAIL_STEP_BYTES`。足りなければ 4 倍ずつ、上限 `TAIL_MAX_BYTES`）を読み、後ろの行から、最後の `token_count`・`turn_context` を探す。
   * 窓の先頭の行は途中から始まりうるので捨てる。書き途中の最後の行（改行で終わらない）は読まず、次の読みの位置にする。
   */
  private async readTail(fd: Parameters<typeof readRange>[0], size: number): Promise<void> {
    let window = TAIL_STEP_BYTES;
    for (;;) {
      const start = Math.max(0, size - window);
      const buf = await readRange(fd, start, size - start);
      let from = 0;
      if (start > 0) {
        const nl = buf.indexOf(0x0a);
        from = nl === -1 ? buf.length : nl + 1;
      }
      const lastNl = buf.lastIndexOf(0x0a);
      const body = lastNl >= from ? buf.subarray(from, lastNl + 1) : Buffer.alloc(0);
      this.count = null;
      this.limits = null;
      this.model = null;
      const lines = splitLines(body);
      let gotCount = false;
      let gotModel = false;
      // 枠は、累計の行より前にあることがある（新しい行が別枠〔`codex_other`〕のとき）。小さい窓（1 MiB まで）の中では、枠も見つかるまで見る。
      const needLimits = window <= TAIL_STEP_BYTES * 4;
      const enough = (): boolean => (this.limitsOnly ? this.limits !== null : gotCount && gotModel && (!needLimits || this.limits !== null));
      for (let i = lines.length - 1; i >= 0 && !enough(); i--) {
        const line = lines[i]!;
        const isCount = (!gotCount || this.limits === null) && line.includes('"token_count"');
        const isTurn = !this.limitsOnly && !gotModel && line.includes('"turn_context"');
        if (!isCount && !isTurn) continue;
        const o = parse(line);
        if (o === null) continue;
        if (isCount) {
          const c = this.countOf(o);
          if (c !== undefined) {
            if (c.limits !== null && this.limits === null) this.limits = c.limits;
            if (c.count !== null && !gotCount) {
              this.count = c.count;
              gotCount = true;
            }
          }
        } else {
          const m = modelOf(o);
          if (m !== undefined && m !== null) {
            this.model = m;
            gotModel = true;
          }
        }
      }
      this.offset = lastNl === -1 ? start : start + lastNl + 1;
      if (enough() || start === 0 || window >= TAIL_MAX_BYTES) {
        this.partial = start > 0 && !enough();
        return;
      }
      window = Math.min(TAIL_MAX_BYTES, window * 4);
    }
  }

  /** 前から読む（増分）。新しいものが古いものを上書きする。 */
  private consume(buf: Buffer): void {
    for (const line of splitLines(buf)) {
      const isCount = line.includes('"token_count"');
      const isTurn = !isCount && line.includes('"turn_context"');
      if (!isCount && !isTurn) continue;
      const o = parse(line);
      if (o === null) continue;
      if (isCount) {
        const c = this.countOf(o);
        if (c !== undefined) {
          if (c.count !== null) this.count = c.count;
          if (c.limits !== null) this.limits = c.limits;
        }
      } else {
        const m = modelOf(o);
        if (m !== undefined) this.model = m;
      }
    }
  }

  private countOf(o: Record<string, unknown>): { count: CodexCount | null; limits: CodexRateLimits | null } | undefined {
    if (o["type"] !== "event_msg") return undefined;
    const p = o["payload"];
    if (typeof p !== "object" || p === null) return undefined;
    const pl = p as Record<string, unknown>;
    if (pl["type"] !== "token_count") return undefined;
    const ts = typeof o["timestamp"] === "string" ? Date.parse(o["timestamp"]) : NaN;
    const at = Number.isFinite(ts) ? ts : 0;
    let count: CodexCount | null = null;
    const info = pl["info"];
    if (typeof info === "object" && info !== null) {
      const i = info as Record<string, unknown>;
      const total = tokenUsage(i["total_token_usage"]);
      if (total !== null) count = { total, last: tokenUsage(i["last_token_usage"]), contextWindow: num(i["model_context_window"]), at };
    }
    return { count, limits: rateLimits(pl["rate_limits"], at) };
  }
}

function parse(line: string): Record<string, unknown> | null {
  try {
    const o: unknown = JSON.parse(line);
    return typeof o === "object" && o !== null && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function modelOf(o: Record<string, unknown>): string | null | undefined {
  if (o["type"] !== "turn_context") return undefined;
  const p = o["payload"];
  if (typeof p !== "object" || p === null) return undefined;
  const m = safeModel((p as Record<string, unknown>)["model"]);
  return m ?? undefined;
}

function splitLines(buf: Buffer): string[] {
  const out: string[] = [];
  let pos = 0;
  while (pos < buf.length) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl === -1) break;
    if (nl - pos > 2 && nl - pos <= LINE_MAX_BYTES) out.push(buf.toString("utf8", pos, nl));
    pos = nl + 1;
  }
  return out;
}
