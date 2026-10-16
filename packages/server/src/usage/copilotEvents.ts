import { openVerified, readRange } from "../agent/safeFile.js";
import { safeModel } from "./claudeScan.js";

/**
 * GitHub Copilot CLI の会話の記録（`<COPILOT_HOME>/session-state/<id>/events.jsonl`）から、利用状況の数字を読む（20261016-agent-usage-bob-copilot。実機 1.0.98）。
 *
 * - `session.usage_record`（モデルの呼び出しごと）: `data.usage` の `inputTokens`（キャッシュの読み書きを含む）・`outputTokens`・`cacheReadTokens`・
 *   `cacheWriteTokens`・`reasoningTokens`・`model`・`maxPromptTokens`（窓の大きさ）・`copilotUsage.totalNanoAiu`（AI クレジットの 10 億分の 1）。
 *   **累計は、この行を初めから足す**（再開しても同じファイルに足される。足した AI クレジットは、Copilot の区切りの値と一致した）。
 * - `session.usage_checkpoint`: `totalPremiumRequests`（会話の初めからの累計。再開の後も続きから数える）。
 * - 累計が要るので、末尾ではなく**初めから順に**読む。1 回に `CHUNK_BYTES` まで（残りがあれば `scanning`）。会話の生涯で `LIFETIME_MAX_BYTES` を読んだら止める
 *   （`updatesStopped`）。会話の文の大きな行（`model.messages_snapshot` など）は JSON として解かない（使う種類の行だけを解く）。`LINE_MAX_BYTES` を超える行は丸ごと飛ばす。
 * - 開くのは `safeFile.openVerified`。持つのは数字・モデル名・時刻だけ。
 */

export const CHUNK_BYTES = 4 * 1024 * 1024;
export const LIFETIME_MAX_BYTES = 512 * 1024 * 1024;
const LINE_MAX_BYTES = 1024 * 1024;
const WANTED = ['"type":"session.usage_record"', '"type":"session.usage_checkpoint"'];

export interface CopilotTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  nanoAiu: number;
  records: number;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const zero = (): CopilotTotals => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, nanoAiu: 0, records: 0 });

export class CopilotEventsReader {
  totals: CopilotTotals = zero();
  model: string | null = null;
  /** 最後の呼び出しの、プロンプトの大きさ（入力・キャッシュの読み書きを含む）と、窓の大きさ。 */
  lastPrompt: { tokens: number; window: number | null } | null = null;
  premiumRequests: number | null = null;
  /** 最後に数字を得た行の時刻（epoch ms）。 */
  at = 0;
  /** まだ読み終えていない（次の呼び出しで続きから）。 */
  scanning = false;
  /** 生涯の上限に達して、読むのを止めた。 */
  stopped = false;
  private offset = 0;
  /** 読み進めた量（`offset` を進めた分の合計。読み直した書き途中の行は数えない）。生涯の上限と比べる。 */
  private readBytes = 0;
  /** 読んでいるファイルの inode（書き直し〔別のファイルに替わった〕を見つける。Copilot は追記しかしない前提だが、替わったら初めから）。 */
  private ino: number | null = null;
  /** 長すぎる行の途中（次の改行まで捨てる）。 */
  private skipping = false;

  constructor(
    readonly file: string,
    /** テストのため（既定は `CHUNK_BYTES`・`LIFETIME_MAX_BYTES`）。 */
    private readonly limits: { chunk: number; lifetime: number } = { chunk: CHUNK_BYTES, lifetime: LIFETIME_MAX_BYTES },
  ) {}

  /** 増えた分を（`CHUNK_BYTES` まで）読む。読めなければ false（投げない）。 */
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
      // 小さくなった・別のファイルに替わった（書き直された）: 初めから。止めた後も、これだけは見る。
      if (st.size < this.offset || (this.ino !== null && st.ino !== this.ino)) this.reset();
      this.ino = st.ino;
      if (this.stopped) return true;
      if (st.size === this.offset) {
        this.scanning = false;
        return true;
      }
      const budget = this.limits.lifetime - this.readBytes;
      const length = Math.min(st.size - this.offset, this.limits.chunk, budget);
      const buf = await readRange(fd, this.offset, length);
      const before = this.offset;
      this.consumeChunk(buf, buf.length === this.limits.chunk);
      this.readBytes += this.offset - before;
      // 上限に達した。または、残りの枠が次の行より小さく、もう進めない（残りの枠いっぱいまで読んで、進まなかった）。
      const cutByBudget = length === budget && length < this.limits.chunk && length < st.size - before;
      if (this.readBytes >= this.limits.lifetime || (cutByBudget && this.offset === before)) this.stopped = true;
      // 読み残しがあるのは、塊か上限の枠で読みを切ったときだけ（改行の無い末尾だけが残ったのは、読み残しではない。次の追記を待つ）。
      this.scanning = !this.stopped && length < st.size - before;
      return true;
    } catch {
      return false;
    } finally {
      await fd.close().catch(() => undefined);
    }
  }

  private reset(): void {
    this.totals = zero();
    this.model = null;
    this.lastPrompt = null;
    this.premiumRequests = null;
    this.at = 0;
    this.offset = 0;
    this.readBytes = 0;
    this.ino = null;
    this.skipping = false;
    this.stopped = false;
  }

  /** `full`: 読める上限いっぱいまで読んだ（改行の無い塊は、長すぎる行の途中）。書き途中の最後の行は、次に読む。 */
  private consumeChunk(buf: Buffer, full: boolean): void {
    let pos = 0;
    if (this.skipping) {
      const nl = buf.indexOf(0x0a);
      if (nl === -1) {
        this.offset += buf.length;
        return;
      }
      this.skipping = false;
      pos = nl + 1;
    }
    const end = buf.lastIndexOf(0x0a);
    if (end < pos) {
      // `pos` から始まる行に改行が無い: 書き途中か、長すぎる行。塊の**先頭から**いっぱいまで読んで改行が無い・上限より長い、ときだけ飛ばす。
      // （長い行を飛ばし終えた後〔`pos > 0`〕に始まった行が塊の境目をまたぐだけなら、その行の頭から読み直す。`full` だけで決めると、その行まで飛ばす）
      if ((full && pos === 0) || buf.length - pos > Math.min(LINE_MAX_BYTES, this.limits.chunk)) {
        this.skipping = true;
        this.offset += buf.length;
      } else {
        this.offset += pos;
      }
      return;
    }
    while (pos <= end) {
      const nl = buf.indexOf(0x0a, pos);
      if (nl - pos <= LINE_MAX_BYTES) this.line(buf.subarray(pos, nl));
      pos = nl + 1;
    }
    this.offset += end + 1;
  }

  private line(raw: Buffer): void {
    const head = raw.subarray(0, 256).toString("utf8");
    if (!WANTED.some((w) => head.includes(w))) return; // 会話の文などは解かない
    let e: Record<string, unknown>;
    try {
      const v: unknown = JSON.parse(raw.toString("utf8"));
      if (typeof v !== "object" || v === null) return;
      e = v as Record<string, unknown>;
    } catch {
      return;
    }
    const data = typeof e["data"] === "object" && e["data"] !== null ? (e["data"] as Record<string, unknown>) : null;
    if (data === null) return;
    const ts = typeof e["timestamp"] === "string" ? Date.parse(e["timestamp"]) : NaN;
    if (e["type"] === "session.usage_record") {
      const u = typeof data["usage"] === "object" && data["usage"] !== null ? (data["usage"] as Record<string, unknown>) : null;
      if (u === null) return;
      const input = num(u["inputTokens"]);
      const output = num(u["outputTokens"]);
      if (input === null || output === null) return;
      const cacheRead = num(u["cacheReadTokens"]) ?? 0;
      const cacheWrite = num(u["cacheWriteTokens"]) ?? 0;
      const t = this.totals;
      // Copilot の `inputTokens` はキャッシュの読み書きを含む。`input` は、そのうちのキャッシュでない分（Claude・Codex と同じ意味）。
      t.input += Math.max(0, input - cacheRead - cacheWrite);
      t.output += output;
      t.cacheRead += cacheRead;
      t.cacheWrite += cacheWrite;
      t.reasoning += num(u["reasoningTokens"]) ?? 0;
      const cu = typeof u["copilotUsage"] === "object" && u["copilotUsage"] !== null ? (u["copilotUsage"] as Record<string, unknown>) : null;
      t.nanoAiu += (cu !== null ? num(cu["totalNanoAiu"]) : null) ?? 0;
      t.records++;
      this.model = safeModel(u["model"]) ?? this.model;
      this.lastPrompt = { tokens: input, window: num(u["maxPromptTokens"]) };
    } else {
      const p = num(data["totalPremiumRequests"]);
      if (p === null) return;
      this.premiumRequests = p;
    }
    if (Number.isFinite(ts) && ts > this.at) this.at = ts;
  }
}
