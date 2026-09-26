/**
 * `wtmctl pane observe` / `pane control` の純粋な部品（20260926-pane-observe-control。herdr の terminal session observe/control）。
 * 記録（stdout の NDJSON）の組み立て・stdin の行の切り出し・コマンドの検査。接続と終わり方は `commands/sessionStream.ts`。
 */

/** control の stdin の 1 行（`\n` を除く）の上限。INPUT フレームの上限（server `WsGateway.ts` の MAX_INPUT_FRAME_BYTES）と同じ。 */
export const MAX_CONTROL_LINE_BYTES = 1024 * 1024;
/** `--cols/--rows`・`terminal.resize` の上限（decisions D6。サーバのスキーマには上限が無い）。 */
export const MAX_STREAM_DIMENSION = 1000;
/** control の `--cols/--rows` の既定（herdr と同じ）。 */
export const DEFAULT_CONTROL_SIZE = { cols: 120, rows: 40 } as const;
/** stdout の書き出し待ちがこれを超えたら受信を止める（decisions D4）。 */
export const OUTPUT_HIGH_WATERMARK_BYTES = 1024 * 1024;

export type ClosedReason =
  "pane_closed" | "released" | "taken_over" | "connection_closed" | "output_closed";

const encoder = new TextEncoder();

/** 記録の 1 行（改行付き）を作る。`seq` はフレームごとに 1 から増える。 */
export class FrameWriter {
  private seq = 0;

  frame(text: string, full: boolean, width: number, height: number): string {
    this.seq += 1;
    const bytes = Buffer.from(encoder.encode(text)).toString("base64");
    return (
      JSON.stringify({
        type: "terminal.frame",
        seq: this.seq,
        encoding: "ansi",
        width,
        height,
        full,
        bytes,
      }) + "\n"
    );
  }

  closed(reason: ClosedReason): string {
    return JSON.stringify({ type: "terminal.closed", reason }) + "\n";
  }
}

export type LineEvent = { kind: "line"; bytes: Uint8Array } | { kind: "too_long" };

const LF = 0x0a;

/**
 * stdin のバイト列を `\n` で行に切る。読み取りの境界をまたいで断片を持ち越す。1 行が `MAX_CONTROL_LINE_BYTES` を超えたら、
 * その行を 1 回だけ `too_long` として報告し、次の `\n` までを捨てる（溜め続けない）。
 */
export class LineSplitter {
  private parts: Uint8Array[] = [];
  private size = 0;
  private discarding = false;

  constructor(private readonly max: number = MAX_CONTROL_LINE_BYTES) {}

  feed(chunk: Uint8Array): LineEvent[] {
    const out: LineEvent[] = [];
    let start = 0;
    while (start <= chunk.length) {
      const nl = chunk.indexOf(LF, start);
      const end = nl === -1 ? chunk.length : nl;
      const piece = chunk.subarray(start, end);
      if (this.discarding) {
        // 捨て中は `\n` まで何も溜めない。
      } else if (this.size + piece.length > this.max) {
        out.push({ kind: "too_long" });
        this.parts = [];
        this.size = 0;
        this.discarding = true;
      } else if (piece.length > 0) {
        this.parts.push(Uint8Array.prototype.slice.call(piece)); // Buffer の slice は写さないので、Uint8Array の slice で写す
        this.size += piece.length;
      }
      if (nl === -1) break;
      if (this.discarding) this.discarding = false;
      else out.push({ kind: "line", bytes: this.take() });
      start = nl + 1;
    }
    return out;
  }

  /** 入力の終わり。改行の無い最後の行があれば出す。 */
  end(): LineEvent[] {
    if (this.discarding || this.size === 0) {
      this.discarding = false;
      this.parts = [];
      this.size = 0;
      return [];
    }
    return [{ kind: "line", bytes: this.take() }];
  }

  private take(): Uint8Array {
    const line = new Uint8Array(this.size);
    let offset = 0;
    for (const p of this.parts) {
      line.set(p, offset);
      offset += p.length;
    }
    this.parts = [];
    this.size = 0;
    return line;
  }
}

export type ControlCommand =
  | { type: "terminal.input"; data: Uint8Array }
  | { type: "terminal.resize"; cols: number; rows: number }
  | { type: "terminal.release" };

export type ParsedLine =
  { ok: true; command: ControlCommand } | { ok: false; reason: string } | { ok: "empty" };

/**
 * 正規の base64（`A-Za-z0-9+/`、4 文字単位、`=` の埋め草は末尾に 0〜2 個、埋め草の直前の文字の余りのビットが 0）か。
 * 空文字列は正規（0 バイト）。余りのビットは、戻して符号化し直したものと一致するかで確かめる（`YR==` は `YQ==` と同じバイトに戻るが正規ではない）。
 */
export function isCanonicalBase64(s: string): boolean {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) return false;
  return Buffer.from(s, "base64").toString("base64") === s;
}

/** type ごとに受け付けるキー（Map にするのは `constructor`・`__proto__` 等のプロトタイプのキーを type として引かないため）。 */
const KNOWN_KEYS: ReadonlyMap<string, readonly string[]> = new Map([
  ["terminal.input", ["type", "text", "bytes"]],
  ["terminal.resize", ["type", "cols", "rows", "cell_width_px", "cell_height_px"]],
  ["terminal.release", ["type"]],
]);

/** 理由に入れる利用者の値（type・キー）を 1 行の短い JSON 文字列にする（制御文字や巨大な値をそのまま stderr に流さない）。 */
function quoteForReason(v: string): string {
  return JSON.stringify(v.length > 64 ? `${v.slice(0, 64)}…` : v);
}

function isDimension(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= MAX_STREAM_DIMENSION;
}

function isNonNegativeInt(v: unknown): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

/**
 * control の stdin の 1 行を検査する（design「コマンド」の表）。空白だけの行は `empty`（黙って無視）。それ以外で表に合わないものは全て不正で、
 * 理由を返す（サーバには何も送らない）。
 */
export function parseControlLine(line: Uint8Array): ParsedLine {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(line); // BOM も黙って落とさない（JSON として不正になる）
  } catch {
    return { ok: false, reason: "line is not valid UTF-8" };
  }
  if (/^[ \t\r]*$/.test(text)) return { ok: "empty" }; // JSON の空白だけ（Unicode の空白は不正な JSON として扱う）
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "line is not valid JSON" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "command must be a JSON object" };
  }
  const obj = value as Record<string, unknown>;
  const type = obj["type"];
  if (typeof type !== "string") return { ok: false, reason: 'command has no string "type"' };
  if (type === "terminal.scroll") {
    return { ok: false, reason: "terminal.scroll is not supported" };
  }
  const known = KNOWN_KEYS.get(type);
  if (known === undefined)
    return { ok: false, reason: `unknown command type: ${quoteForReason(type)}` };
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      return { ok: false, reason: `unknown field for ${type}: ${quoteForReason(key)}` };
    }
  }
  switch (type) {
    case "terminal.input": {
      const hasText = "text" in obj;
      const hasBytes = "bytes" in obj;
      if (hasText === hasBytes) {
        return { ok: false, reason: "terminal.input needs exactly one of text or bytes" };
      }
      if (hasText) {
        if (typeof obj["text"] !== "string")
          return { ok: false, reason: "terminal.input text must be a string" };
        return { ok: true, command: { type, data: encoder.encode(obj["text"]) } };
      }
      const b64 = obj["bytes"];
      if (typeof b64 !== "string" || !isCanonicalBase64(b64)) {
        return { ok: false, reason: "terminal.input bytes must be canonical base64" };
      }
      // 独立した配列にする（小さい Buffer は Node の共有プールの切り出しで、`.buffer` がプール全体を指す）。
      return { ok: true, command: { type, data: Uint8Array.from(Buffer.from(b64, "base64")) } };
    }
    case "terminal.resize": {
      const { cols, rows } = obj;
      if (!isDimension(cols) || !isDimension(rows)) {
        return {
          ok: false,
          reason: `terminal.resize cols and rows must be integers between 1 and ${MAX_STREAM_DIMENSION}`,
        };
      }
      for (const key of ["cell_width_px", "cell_height_px"]) {
        if (key in obj && !isNonNegativeInt(obj[key])) {
          return { ok: false, reason: `terminal.resize ${key} must be a non-negative integer` };
        }
      }
      return { ok: true, command: { type, cols, rows } };
    }
    default:
      return { ok: true, command: { type: "terminal.release" } };
  }
}
