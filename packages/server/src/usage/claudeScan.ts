import type { FileHandle } from "node:fs/promises";
import type { AgentUsage, UsageTokenCounts } from "@sodashitsu/protocol";
import { openVerified, readRange } from "../agent/safeFile.js";

/**
 * Claude Code の会話の記録（`<根>/<プロジェクト>/<会話の id>.jsonl` と、サブエージェントの `<id>/subagents/agent-*.jsonl`）から、利用状況の数字を集める
 * （20261010-agent-usage の AC3。調査 `usage-research-result.md` の 2）。
 *
 * - `assistant` の行の `message.usage` を、`message.id` で 1 回に数える（同じ応答が、content ブロックごとに別の行になる）。
 * - 主の記録とサブエージェントの記録を分ける（`isSidechain` の行は、サブエージェントの分）。
 * - `cost-state`（記録の区切りに書かれる会計の行。未文書）の最後の行を持つ。形が違えば、黙って無い扱い。
 * - **増分**: ファイルごとに、読み終えた位置を持つ。途中の行（改行が無い）は次に読む。壊れた行・巨大な行は飛ばす。
 * - 大きな記録は、1 回の読みを上限で切って数回に分け（`await setImmediate` で主スレッドを譲る）、初回は末尾の `MAX_INITIAL_BYTES` だけを読む（「一部」の印）。
 * 中身（会話の文）は、どこにも保持しない。持つのは数字・モデル名・時刻だけ。
 */

export const CHUNK_BYTES = 1024 * 1024;
/** 1 つのファイルを初めて読むときの上限。超えたら末尾だけ読む（`partial`）。 */
export const MAX_INITIAL_BYTES = 64 * 1024 * 1024;
/** 1 回の `advance` で読む量の上限。残りは次の呼び出し（背景で続ける）。 */
export const BYTES_PER_ADVANCE = 8 * 1024 * 1024;
/** この大きさを超える 1 行は、読まずに飛ばす（巨大な添付の行）。 */
export const LINE_MAX_BYTES = 4 * 1024 * 1024;
export const SUBAGENT_FILES_MAX = 256;
/** 1 つの会話の走査で、生涯に読む量の上限（サブエージェントのファイルが多いときの暴走を止める）。超えたら「一部」。 */
export const READ_TOTAL_MAX_BYTES = 512 * 1024 * 1024;
const RECORDS_MAX = 200_000;
const SEEN_MAX = 300_000;
const MODEL_MAX = 64;

interface Rec {
  ts: number;
  sub: boolean;
  model: string;
  i: number;
  o: number;
  cr: number;
  cw: number;
}

export interface CostStateInfo {
  /** この行が書かれた時刻の目安（同じファイルで、その行の直前までに見えた最後の `timestamp`）。 */
  at: number;
  totalCostUsd: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface FileCursor {
  path: string;
  sub: boolean;
  offset: number;
  /** 末尾だけを読んだ（初めの分を読んでいない）。 */
  tailOnly: boolean;
  /** 最後に見た記録の時刻（`cost-state` の時刻の目安）。 */
  lastTs: number;
  started: boolean;
}

export interface ScanLimits {
  chunkBytes: number;
  maxInitialBytes: number;
  lineMaxBytes: number;
  /** 1 つの会話の走査で、生涯（書き換えでの数え直しをまたいで）に読む量の上限。 */
  readTotalMax: number;
}
const DEFAULT_LIMITS: ScanLimits = { chunkBytes: CHUNK_BYTES, maxInitialBytes: MAX_INITIAL_BYTES, lineMaxBytes: LINE_MAX_BYTES, readTotalMax: READ_TOTAL_MAX_BYTES };

export type AdvanceResult = { more: boolean; reset: boolean };

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** モデルの id の形: 先頭が英数字で、英数字と `.`・`_`・`-`・`:` と、末尾の `[1m]` の類だけ（`/`・`..` 始まり・空白は通さない）。 */
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*(\[[A-Za-z0-9]{1,8}\])?$/;
function safeModel(v: unknown): string | null {
  if (typeof v !== "string" || v.length > MODEL_MAX || !MODEL_RE.test(v)) return null;
  return v;
}

export class ClaudeSessionScan {
  readonly files = new Map<string, FileCursor>();
  private records: Rec[] = [];
  /** `RECORDS_MAX` を超えて畳んだ古い分（主・サブエージェント）。 */
  private base = { main: zero(), sub: zero(), ts: 0 };
  private readonly seen = new Set<string>();
  private cost: CostStateInfo | null = null;
  private lastMain: { model: string | null; context: number; ts: number } | null = null;
  private lastTs = 0;
  /** 一部しか読めていない（大きな記録の末尾だけ・サブエージェントのファイルの数の上限）。 */
  partial = false;
  private readTotal: number;
  /** 生涯の読む量の上限に達した（その会話の更新を止めた）。 */
  stopped = false;

  private readonly lim: ScanLimits;

  /**
   * `carriedRead`: 数え直し（記録が書き換えられて、新しい集計に替えるとき）の前の集計が読んだ量。**引き継ぐ**ので、書き換えを繰り返しても、
   * 生涯の上限が効かなくならない（20261010-agent-usage の R5）。
   */
  constructor(
    private readonly sessionId: string,
    limits: Partial<ScanLimits> = {},
    carriedRead = 0,
  ) {
    this.lim = { ...DEFAULT_LIMITS, ...limits };
    this.readTotal = carriedRead;
    if (this.readTotal >= this.lim.readTotalMax) {
      this.stopped = true;
      this.partial = true;
    }
  }

  /** ここまでに（引き継ぎを含めて）読んだ量。 */
  get bytesRead(): number {
    return this.readTotal;
  }

  /** ファイルを足す（すでにあれば何もしない）。 */
  addFile(path: string, sub: boolean): void {
    if (this.files.has(path)) return;
    this.files.set(path, { path, sub, offset: 0, tailOnly: false, lastTs: 0, started: false });
  }

  /** 全部のファイルを、上限の範囲で進める。 */
  async advance(budgetBytes: number = BYTES_PER_ADVANCE, shouldStop: () => boolean = () => false): Promise<AdvanceResult> {
    if (this.readTotal >= this.lim.readTotalMax) {
      this.partial = true;
      this.stopped = true;
      return { more: false, reset: false };
    }
    let left = budgetBytes;
    let more = false;
    for (const cur of this.files.values()) {
      if (shouldStop()) return { more: false, reset: false };
      if (left <= 0) {
        more = true;
        break;
      }
      const r = await this.advanceFile(cur, left, shouldStop);
      if (r.reset) return { more: false, reset: true };
      left -= r.read;
      this.readTotal += r.read;
      if (r.more) more = true;
    }
    return { more, reset: false };
  }

  private async advanceFile(cur: FileCursor, budget: number, shouldStop: () => boolean): Promise<{ read: number; more: boolean; reset: boolean }> {
    let opened;
    try {
      opened = await openVerified(cur.path);
    } catch {
      return { read: 0, more: false, reset: false }; // 消えた・読めない（次の機会に）
    }
    if (opened === null) return { read: 0, more: false, reset: false };
    const { fd, st } = opened;
    let read = 0;
    try {
      const size = st.size;
      if (size < cur.offset) return { read: 0, more: false, reset: true }; // 小さくなった（書き換え）。最初からやり直す
      if (!cur.started) {
        cur.started = true;
        if (size > this.lim.maxInitialBytes) {
          // 末尾だけ。最初の行は途中から始まるので、次の改行まで捨てる。
          cur.offset = size - this.lim.maxInitialBytes;
          cur.tailOnly = true;
          this.partial = true;
          const skip = await skipToNewline(fd, cur.offset, size);
          cur.offset = skip;
        }
      }
      while (cur.offset < size && read < budget && !shouldStop()) {
        const want = Math.min(this.lim.chunkBytes, size - cur.offset);
        let buf = await readRange(fd, cur.offset, want);
        let nl = buf.lastIndexOf(0x0a);
        if (nl === -1) {
          // 改行が無い: 1 行が chunk より長いか、まだ書き途中。
          if (cur.offset + buf.length >= size && buf.length < this.lim.lineMaxBytes) break; // 書き途中（次に読む）
          if (buf.length < this.lim.lineMaxBytes && size - cur.offset > buf.length) {
            buf = await readRange(fd, cur.offset, Math.min(this.lim.lineMaxBytes, size - cur.offset));
            nl = buf.lastIndexOf(0x0a);
          }
          if (nl === -1) {
            if (buf.length >= this.lim.lineMaxBytes) {
              cur.offset += buf.length; // 巨大な 1 行は飛ばす
              read += buf.length;
              continue;
            }
            break;
          }
        }
        this.consume(buf.subarray(0, nl + 1), cur);
        cur.offset += nl + 1;
        read += nl + 1;
        await new Promise<void>((r) => setImmediate(r)); // 主スレッドを譲る
      }
      return { read, more: cur.offset < size, reset: false };
    } finally {
      await fd.close().catch(() => undefined);
    }
  }

  private consume(buf: Buffer, cur: FileCursor): void {
    let pos = 0;
    while (pos < buf.length) {
      const nl = buf.indexOf(0x0a, pos);
      if (nl === -1) break;
      const len = nl - pos;
      if (len > 2 && len <= this.lim.lineMaxBytes) this.line(buf.toString("utf8", pos, nl), cur);
      pos = nl + 1;
    }
  }

  private line(text: string, cur: FileCursor): void {
    // 先に、文字列の検査で、関係の無い行（大半）を解かずに飛ばす。
    const isAssistant = text.includes('"type":"assistant"');
    const isCost = !isAssistant && text.includes('"type":"cost-state"');
    if (!isAssistant && !isCost) return;
    let o: unknown;
    try {
      o = JSON.parse(text);
    } catch {
      return; // 壊れた行
    }
    if (typeof o !== "object" || o === null) return;
    const rec = o as Record<string, unknown>;
    const ts = typeof rec["timestamp"] === "string" ? Date.parse(rec["timestamp"]) : NaN;
    const at = Number.isFinite(ts) ? ts : cur.lastTs;
    if (Number.isFinite(ts)) {
      cur.lastTs = ts;
      if (ts > this.lastTs) this.lastTs = ts;
    }
    if (isCost) {
      if (cur.sub || rec["type"] !== "cost-state") return;
      this.takeCostState(rec, at);
      return;
    }
    if (rec["type"] !== "assistant") return;
    const m = rec["message"];
    if (typeof m !== "object" || m === null) return;
    const msg = m as Record<string, unknown>;
    const usage = msg["usage"];
    if (typeof usage !== "object" || usage === null) return;
    const u = usage as Record<string, unknown>;
    const id = typeof msg["id"] === "string" ? msg["id"] : typeof rec["uuid"] === "string" ? rec["uuid"] : null;
    if (id !== null) {
      if (this.seen.has(id)) return;
      this.seen.add(id);
      if (this.seen.size > SEEN_MAX) this.seen.delete(this.seen.values().next().value as string);
    }
    if (msg["model"] === "<synthetic>") return; // 実際の呼び出しではない行（中断の印など）
    const model = safeModel(msg["model"]);
    const sub = cur.sub || rec["isSidechain"] === true;
    const r: Rec = {
      ts: at,
      sub,
      model: model ?? "",
      i: num(u["input_tokens"]),
      o: num(u["output_tokens"]),
      cr: num(u["cache_read_input_tokens"]),
      cw: num(u["cache_creation_input_tokens"]),
    };
    this.records.push(r);
    if (this.records.length > RECORDS_MAX) this.fold();
    if (!sub && (this.lastMain === null || at >= this.lastMain.ts)) {
      this.lastMain = { model, context: r.i + r.cr + r.cw, ts: at };
    }
  }

  private takeCostState(rec: Record<string, unknown>, at: number): void {
    const sid = rec["sessionId"];
    if (typeof sid === "string" && sid !== this.sessionId) return; // 別の会話の行（引き継いだ記録）
    const total = rec["totalCostUSD"];
    const mu = rec["modelUsage"];
    if (typeof total !== "number" || !Number.isFinite(total) || total < 0 || typeof mu !== "object" || mu === null) return;
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    for (const v of Object.values(mu as Record<string, unknown>)) {
      if (typeof v !== "object" || v === null) return; // 形が違う: 無い扱い
      const x = v as Record<string, unknown>;
      tokens.input += num(x["inputTokens"]);
      tokens.output += num(x["outputTokens"]);
      tokens.cacheRead += num(x["cacheReadInputTokens"]);
      tokens.cacheWrite += num(x["cacheCreationInputTokens"]);
    }
    if (this.cost === null || at >= this.cost.at) this.cost = { at, totalCostUsd: total, tokens };
  }

  /** 古い半分を、合計に畳む（メモリの上限）。 */
  private fold(): void {
    const half = Math.floor(this.records.length / 2);
    const old = this.records.splice(0, half);
    for (const r of old) {
      const t = r.sub ? this.base.sub : this.base.main;
      t.input += r.i;
      t.output += r.o;
      t.cacheRead += r.cr;
      t.cacheWrite += r.cw;
      if (r.ts > this.base.ts) this.base.ts = r.ts;
    }
    this.partial = true;
  }

  /** いまの集計から、利用状況（pane の id と種類は呼び手が決める）を作る。 */
  result(): Pick<AgentUsage, "model" | "tokens" | "breakdown" | "costUsd" | "costBasis" | "costAsOf" | "contextTokens" | "contextWindowTokens" | "contextUsedPct" | "source" | "updatedAt" | "partial"> {
    const main = { ...this.base.main };
    const sub = { ...this.base.sub };
    const after = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    const cs = this.cost;
    for (const r of this.records) {
      const t = r.sub ? sub : main;
      t.input += r.i;
      t.output += r.o;
      t.cacheRead += r.cr;
      t.cacheWrite += r.cw;
      if (cs !== null && r.ts > cs.at) {
        after.input += r.i;
        after.output += r.o;
        after.cacheRead += r.cr;
        after.cacheWrite += r.cw;
      }
    }
    const recorded = (c: { input: number; output: number; cacheRead: number; cacheWrite: number }): UsageTokenCounts => ({
      input: c.input,
      output: c.output,
      cacheRead: c.cacheRead,
      cacheWrite: c.cacheWrite,
      total: c.input + c.output + c.cacheRead + c.cacheWrite,
    });
    const subFiles = [...this.files.values()].filter((f) => f.sub).length;
    const breakdown = { main: recorded(main), subagents: { ...recorded(sub), files: subFiles } };
    const useCost = cs !== null;
    const basisTokens = useCost
      ? {
          input: cs.tokens.input + after.input,
          output: cs.tokens.output + after.output,
          cacheRead: cs.tokens.cacheRead + after.cacheRead,
          cacheWrite: cs.tokens.cacheWrite + after.cacheWrite,
        }
      : { input: main.input + sub.input, output: main.output + sub.output, cacheRead: main.cacheRead + sub.cacheRead, cacheWrite: main.cacheWrite + sub.cacheWrite };
    const model = this.lastMain?.model ?? null;
    const contextTokens = this.lastMain?.context;
    // 窓の大きさは、記録に出ない（モデルの id に `[1m]` が付くことがあるときだけ 100 万と分かる）。分からなければ、率は無い。
    const windowTokens = model !== null && model.includes("[1m]") ? 1_000_000 : undefined;
    const out: ReturnType<ClaudeSessionScan["result"]> = {
      model,
      tokens: { ...recorded(basisTokens), basis: useCost ? "cumulative" : "transcript" },
      breakdown,
      source: useCost ? "cost-state" : "transcript",
      updatedAt: Math.max(this.lastTs, cs?.at ?? 0),
    };
    if (useCost) {
      out.costUsd = cs.totalCostUsd;
      out.costBasis = "cost-state";
      out.costAsOf = cs.at;
    }
    if (contextTokens !== undefined && contextTokens > 0) {
      out.contextTokens = contextTokens;
      if (windowTokens !== undefined) {
        out.contextWindowTokens = windowTokens;
        out.contextUsedPct = Math.min(100, Math.round((contextTokens / windowTokens) * 1000) / 10);
      }
    }
    if (this.partial) out.partial = true;
    return out;
  }
}

function zero(): { input: number; output: number; cacheRead: number; cacheWrite: number } {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

/** `from` から次の改行の次の位置（無ければ `size`）。 */
async function skipToNewline(fd: FileHandle, from: number, size: number): Promise<number> {
  let pos = from;
  while (pos < size) {
    const buf = await readRange(fd, pos, Math.min(64 * 1024, size - pos));
    const nl = buf.indexOf(0x0a);
    if (nl !== -1) return pos + nl + 1;
    pos += buf.length;
    if (buf.length === 0) break;
  }
  return size;
}
