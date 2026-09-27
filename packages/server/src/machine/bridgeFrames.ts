/**
 * 中継の枠（20260927-multi-host-machines の design「中継の枠」）。手元の `wtm serve`（`MachineLink`）とリモートの `wtm serve` の受け口
 * （`BridgeEndpoint`）が、SSH の標準入出力の上（間の `wtm bridge` は素通し）でやり取りする形。**純粋な関数だけ**（I/O は持たない）。
 *
 * - 目印: 受け口は接続の最初に `WTM-BRIDGE 1\n` を書く。手元はそれより前のバイト（リモートのシェルの初期化ファイルの出力等）を読み捨てる。
 * - 枠: `[type u8][channel u32 BE][length u32 BE][payload]`（見出し 9 バイト）。
 *
 * decoder が見るのは **1 枠で閉じる規則**（type・向き・channel 0 の要否・長さ）だけ。開いているチャネルへの OPEN・同時に開く数・2 回目の HELLO・
 * 閉じたチャネル宛ての枠の扱いは、状態を持つ側（`BridgeEndpoint`・`MachineLink`）が見る。
 */

export const BRIDGE_MARKER = "WTM-BRIDGE 1\n";
export const BRIDGE_VERSION = 1;

export const BRIDGE_FRAME = {
  HELLO: 0x01,
  OPEN: 0x02,
  CLOSE: 0x03,
  TEXT: 0x04,
  BINARY: 0x05,
  PING: 0x06,
  PONG: 0x07,
} as const;
export type BridgeFrameType = (typeof BRIDGE_FRAME)[keyof typeof BRIDGE_FRAME];

export const BRIDGE_LIMITS = {
  /** 手元 → リモートの TEXT・BINARY の payload（ブラウザ・wtmctl から `/ws` で受ける 1 通の上限 `MAX_WS_PAYLOAD_BYTES` と同じ）。 */
  maxMessageBytes: 4 * 1024 * 1024,
  /**
   * リモート → 手元の TEXT・BINARY の payload。サーバからブラウザへの 1 通（大きな scrollback の SNAPSHOT・hello の snapshot）は `/ws` では上限が無いので、
   * 4MiB で切ると重い pane がリモートでだけ見られない（繋ぎ直しの輪になる。cross の点検）。信用しない入力なので上限は置く。
   */
  maxRemoteMessageBytes: 64 * 1024 * 1024,
  maxHelloBytes: 4 * 1024,
  maxCloseBytes: 1024,
  maxPingBytes: 64,
  /** 同時に開くチャネル。 */
  maxChannels: 64,
  /** 目印の前に読み捨ててよいバイト数。 */
  maxPreambleBytes: 64 * 1024,
  /** チャネルの番号の最大（u32）。 */
  maxChannelId: 0xffff_ffff,
} as const;

const HEADER_BYTES = 9;

export interface BridgeFrame {
  type: BridgeFrameType;
  channel: number;
  payload: Uint8Array;
}

/** 読んだ枠が規則に合わない（受け取った側は接続ごと切る）。 */
export class BridgeProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BridgeProtocolError";
  }
}

/**
 * 誰が読むか。`link`＝手元（リモートから来る HELLO・CLOSE・TEXT・BINARY・PONG を受ける。目印を探す）、
 * `endpoint`＝リモートの受け口（手元から来る OPEN・CLOSE・TEXT・BINARY・PING を受ける。目印は無い）。
 */
export type BridgeRole = "link" | "endpoint";

const ACCEPTED: Record<BridgeRole, ReadonlySet<number>> = {
  link: new Set([
    BRIDGE_FRAME.HELLO,
    BRIDGE_FRAME.CLOSE,
    BRIDGE_FRAME.TEXT,
    BRIDGE_FRAME.BINARY,
    BRIDGE_FRAME.PONG,
  ]),
  endpoint: new Set([
    BRIDGE_FRAME.OPEN,
    BRIDGE_FRAME.CLOSE,
    BRIDGE_FRAME.TEXT,
    BRIDGE_FRAME.BINARY,
    BRIDGE_FRAME.PING,
  ]),
};

/** type ごとの payload の上限（TEXT・BINARY は向きで違う。`role` は読む側。encode は大きい方で確かめる）。 */
function maxPayloadFor(type: number, role: BridgeRole | "any"): number {
  switch (type) {
    case BRIDGE_FRAME.HELLO:
      return BRIDGE_LIMITS.maxHelloBytes;
    case BRIDGE_FRAME.OPEN:
      return 0;
    case BRIDGE_FRAME.CLOSE:
      return BRIDGE_LIMITS.maxCloseBytes;
    case BRIDGE_FRAME.PING:
    case BRIDGE_FRAME.PONG:
      return BRIDGE_LIMITS.maxPingBytes;
    default:
      return role === "endpoint"
        ? BRIDGE_LIMITS.maxMessageBytes
        : BRIDGE_LIMITS.maxRemoteMessageBytes;
  }
}

/** channel 0 を使う（接続全体の）type か。 */
function isConnectionLevel(type: number): boolean {
  return type === BRIDGE_FRAME.HELLO || type === BRIDGE_FRAME.PING || type === BRIDGE_FRAME.PONG;
}

function checkFrame(type: number, channel: number, length: number, role: BridgeRole | "any"): void {
  if (length > maxPayloadFor(type, role))
    throw new BridgeProtocolError(`frame too large (type ${type}, ${length} bytes)`);
  if (isConnectionLevel(type)) {
    if (channel !== 0) throw new BridgeProtocolError(`type ${type} must use channel 0`);
  } else if (channel === 0) {
    throw new BridgeProtocolError(`type ${type} must not use channel 0`);
  }
}

/** 枠を 1 つ作る。上限・channel の規則に合わなければ投げる（送る側の誤りを早く見つける）。 */
export function encodeBridgeFrame(
  type: BridgeFrameType,
  channel: number,
  payload: Uint8Array = new Uint8Array(0),
): Uint8Array {
  if (!Number.isInteger(channel) || channel < 0 || channel > BRIDGE_LIMITS.maxChannelId)
    throw new RangeError(`invalid channel: ${channel}`);
  checkFrame(type, channel, payload.byteLength, "any");
  const out = new Uint8Array(HEADER_BYTES + payload.byteLength);
  const view = new DataView(out.buffer);
  view.setUint8(0, type);
  view.setUint32(1, channel, false);
  view.setUint32(5, payload.byteLength, false);
  out.set(payload, HEADER_BYTES);
  return out;
}

const enc = new TextEncoder();
const MARKER_BYTES = enc.encode(BRIDGE_MARKER);

export function markerBytes(): Uint8Array {
  return MARKER_BYTES.slice();
}

/**
 * 分割されて届くバイト列から枠を取り出す。規則に合わなければ `push` が投げる（以後は使わない）。
 * 受けたかたまりは一覧に溜め、要る分だけを 1 回で取り出す（1 つのかたまりに小さな枠が多数入っていても、大きな枠が細かく分かれて届いても、
 * 受けたバイト数に比例する手間で済む——リモートの入力で CPU を食い潰させない）。
 */
export class BridgeFrameDecoder {
  private readonly queue: Uint8Array[] = [];
  /** `queue[0]` の読み始めの位置。 */
  private head = 0;
  private queued = 0;
  private markerSeen: boolean;
  private readonly maxPreamble: number;
  /** 目印を探す間に読み捨てたバイト数（目印の始まりはこの位置より後ろ）。 */
  private preambleDropped = 0;
  /** 見出しを読んで本体を待っている枠。 */
  private pendingHeader: { type: number; channel: number; length: number } | undefined;

  constructor(private readonly opts: { role: BridgeRole; maxPreamble?: number }) {
    this.markerSeen = opts.role === "endpoint";
    this.maxPreamble = opts.maxPreamble ?? BRIDGE_LIMITS.maxPreambleBytes;
  }

  /** 目印を受けたか（`link` のとき。`endpoint` は常に真）。 */
  get sawMarker(): boolean {
    return this.markerSeen;
  }

  push(chunk: Uint8Array): BridgeFrame[] {
    if (chunk.byteLength > 0) {
      this.queue.push(chunk);
      this.queued += chunk.byteLength;
    }
    if (!this.markerSeen && !this.findMarker()) return [];
    const frames: BridgeFrame[] = [];
    const accepted = ACCEPTED[this.opts.role];
    for (;;) {
      if (this.pendingHeader === undefined) {
        if (this.queued < HEADER_BYTES) break;
        const h = this.take(HEADER_BYTES);
        const view = new DataView(h.buffer, h.byteOffset, HEADER_BYTES);
        const type = view.getUint8(0);
        const channel = view.getUint32(1, false);
        const length = view.getUint32(5, false);
        if (!accepted.has(type)) throw new BridgeProtocolError(`unexpected frame type ${type}`);
        checkFrame(type, channel, length, this.opts.role); // 長さは本体を待つ前に見る（巨大な長さで溜め込まない）
        this.pendingHeader = { type, channel, length };
      }
      const ph = this.pendingHeader;
      if (this.queued < ph.length) break;
      frames.push({
        type: ph.type as BridgeFrameType,
        channel: ph.channel,
        payload: this.take(ph.length),
      });
      this.pendingHeader = undefined;
    }
    return frames;
  }

  /** 目印を探す。見つかれば目印までを捨てて true。上限（最初の `maxPreamble` バイトの中に始まる）を越えたら投げる。 */
  private findMarker(): boolean {
    const bytes = this.take(this.queued, { peek: true });
    const at = indexOf(bytes, MARKER_BYTES);
    if (at >= 0) {
      if (this.preambleDropped + at >= this.maxPreamble)
        throw new BridgeProtocolError("bridge marker not found");
      this.take(at + MARKER_BYTES.byteLength);
      this.markerSeen = true;
      return true;
    }
    // 目印の途中かもしれない末尾だけを残して捨てる。
    const keep = Math.min(bytes.byteLength, MARKER_BYTES.byteLength - 1);
    const drop = bytes.byteLength - keep;
    this.take(drop);
    this.preambleDropped += drop;
    if (this.preambleDropped >= this.maxPreamble)
      throw new BridgeProtocolError("bridge marker not found");
    return false;
  }

  /** 先頭から `n` バイトを取り出す（写しを返す）。`peek` なら取り出さない。 */
  private take(n: number, opts?: { peek?: boolean }): Uint8Array {
    const out = new Uint8Array(n);
    let filled = 0;
    let i = 0;
    let head = this.head;
    while (filled < n) {
      const c = this.queue[i]!;
      const avail = c.byteLength - head;
      const m = Math.min(avail, n - filled);
      out.set(c.subarray(head, head + m), filled);
      filled += m;
      head += m;
      if (head === c.byteLength) {
        i++;
        head = 0;
      }
    }
    if (!opts?.peek) {
      this.queue.splice(0, i);
      this.head = head;
      this.queued -= n;
    }
    return out;
  }
}

function indexOf(hay: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i + needle.byteLength <= hay.byteLength; i++) {
    for (let j = 0; j < needle.byteLength; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** HELLO の中身（design「中継の枠」）。 */
export interface BridgeHello {
  bridge: number;
  protocol: number;
  version: string;
  hostname: string;
  sessionName: string | null;
}

/** HELLO の payload を確かめて返す。形が違えば投げる（`BridgeProtocolError`。呼び出し側は非互換として扱う）。 */
export function parseBridgeHello(payload: Uint8Array): BridgeHello {
  let v: unknown;
  try {
    v = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  } catch {
    throw new BridgeProtocolError("malformed hello");
  }
  if (typeof v !== "object" || v === null) throw new BridgeProtocolError("malformed hello");
  const r = v as Record<string, unknown>;
  const shortString = (x: unknown): x is string =>
    typeof x === "string" && enc.encode(x).byteLength <= 256;
  if (r["bridge"] !== BRIDGE_VERSION)
    throw new BridgeProtocolError(`unsupported bridge version: ${String(r["bridge"])}`);
  if (r["protocol"] !== 1)
    throw new BridgeProtocolError(`unsupported protocol version: ${String(r["protocol"])}`);
  if (!shortString(r["version"]) || !shortString(r["hostname"]))
    throw new BridgeProtocolError("malformed hello");
  const sessionName = r["sessionName"];
  if (sessionName !== null && !shortString(sessionName))
    throw new BridgeProtocolError("malformed hello");
  return {
    bridge: BRIDGE_VERSION,
    protocol: 1,
    version: r["version"],
    hostname: r["hostname"],
    sessionName,
  };
}

export function encodeJson(value: unknown): Uint8Array {
  return enc.encode(JSON.stringify(value));
}

/** CLOSE の payload（空でもよい）。読めなければ code 1011。 */
export function parseClosePayload(payload: Uint8Array): { code: number; reason: string } {
  if (payload.byteLength === 0) return { code: 1000, reason: "" };
  try {
    const v = JSON.parse(new TextDecoder().decode(payload)) as { code?: unknown; reason?: unknown };
    const code = typeof v.code === "number" && isSendableCloseCode(v.code) ? v.code : 1011;
    // WebSocket の close の reason は 123 バイトまで（超えると ws が投げる）。信用しないリモートの値なので短く切る。
    const reason = typeof v.reason === "string" ? truncateUtf8(v.reason, 120) : "";
    return { code, reason };
  } catch {
    return { code: 1011, reason: "" };
  }
}

/** WebSocket の close で送れる code（1000〜4999 で、1004〜1006・1015 と未割り当ての 1016〜2999 を除く）。 */
export function isSendableCloseCode(code: number): boolean {
  if (!Number.isInteger(code)) return false;
  if (code >= 3000 && code <= 4999) return true;
  return code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006;
}

/** UTF-8 で `maxBytes` 以下になるよう切る（文字の途中では切らない）。 */
export function truncateUtf8(s: string, maxBytes: number): string {
  const bytes = enc.encode(s);
  if (bytes.byteLength <= maxBytes) return s;
  let end = maxBytes;
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return new TextDecoder().decode(bytes.subarray(0, end));
}
