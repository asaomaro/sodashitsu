import { EXTENSION_LINE_MAX_BYTES } from "@sodashitsu/protocol";

/**
 * 拡張の標準出力を、行（`\n` で切る。直前の `\r` は除く）に切り出す入れ物（20261007-ext-host）。
 * - 改行が無いまま `maxBytes` を超えたら、持っている分を捨て、次の改行までを捨てて、`too_long` を（超えた時点で）1 回返す。
 * - 空白だけの行は飛ばす。UTF-8 として壊れた行は `bad_utf8`（置き換えずに断る）。
 * - 持つのは、切り出していない残りだけ（行の途中は上限＋1 片まで）。
 */

export type LineItem = { kind: "line"; text: string; bytes: number } | { kind: "too_long"; bytes: number } | { kind: "bad_utf8"; bytes: number };

type Segment = { kind: "buf"; buf: Buffer; pos: number } | { kind: "mark"; item: LineItem };

/** 行の途中の片の数の上限（超えたら 1 つにまとめる）。 */
const TAIL_PARTS_MAX = 64;
const NL = 0x0a;
const CR = 0x0d;

function isBlank(b: Buffer): boolean {
  for (const c of b) if (c !== 0x20 && c !== 0x09 && c !== CR && c !== NL) return false;
  return true;
}

export class LineReader {
  private readonly maxBytes: number;
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  /** 切り出し待ちの、完成した行の塊と、`too_long` の印（出来事の順に並ぶ）。 */
  private segments: Segment[] = [];
  /** 改行がまだ来ていない、行の途中。 */
  private tail: Buffer[] = [];
  private tailLen = 0;
  /** 長すぎた行の残りを、次の改行まで捨てている。 */
  private discarding = false;

  constructor(maxBytes: number = EXTENSION_LINE_MAX_BYTES) {
    this.maxBytes = maxBytes;
  }

  /** 持っているバイト数（行の途中＋切り出し待ち）。テスト用。 */
  heldBytes(): number {
    let n = this.tailLen;
    for (const s of this.segments) if (s.kind === "buf") n += s.buf.length - s.pos;
    return n;
  }

  push(chunk: Buffer): void {
    let c = chunk;
    if (this.discarding) {
      const i = c.indexOf(NL);
      if (i === -1) return;
      this.discarding = false;
      c = c.subarray(i + 1);
    }
    if (c.length === 0) return;
    const last = c.lastIndexOf(NL);
    if (last === -1) {
      this.addTail(c);
      return;
    }
    const complete = this.tail.length > 0 ? Buffer.concat([...this.tail, c.subarray(0, last + 1)]) : c.subarray(0, last + 1);
    this.tail = [];
    this.tailLen = 0;
    this.segments.push({ kind: "buf", buf: complete, pos: 0 });
    const rest = c.subarray(last + 1);
    if (rest.length > 0) this.addTail(rest);
  }

  private addTail(c: Buffer): void {
    this.tail.push(c);
    this.tailLen += c.length;
    // 細切れの片が何百万個もたまらないように、一定数を超えたら 1 つにまとめる（上限の扱いは変えない）。
    if (this.tail.length > TAIL_PARTS_MAX) this.tail = [Buffer.concat(this.tail)];
    if (this.tailLen > this.maxBytes) {
      this.segments.push({ kind: "mark", item: { kind: "too_long", bytes: this.tailLen } });
      this.tail = [];
      this.tailLen = 0;
      this.discarding = true;
    }
  }

  next(): LineItem | null {
    for (;;) {
      const seg = this.segments[0];
      if (seg === undefined) return null;
      if (seg.kind === "mark") {
        this.segments.shift();
        return seg.item;
      }
      if (seg.pos >= seg.buf.length) {
        this.segments.shift();
        continue;
      }
      const nl = seg.buf.indexOf(NL, seg.pos);
      const end = nl === -1 ? seg.buf.length : nl; // 完成した塊には必ず改行がある
      let line = seg.buf.subarray(seg.pos, end);
      seg.pos = nl === -1 ? seg.buf.length : nl + 1;
      if (line.length > 0 && line[line.length - 1] === CR) line = line.subarray(0, line.length - 1);
      if (line.length > this.maxBytes) return { kind: "too_long", bytes: line.length };
      if (isBlank(line)) continue;
      try {
        return { kind: "line", text: this.decoder.decode(line), bytes: line.length };
      } catch {
        return { kind: "bad_utf8", bytes: line.length };
      }
    }
  }
}
