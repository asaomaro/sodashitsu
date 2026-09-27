import type { PaneId } from "@sodashitsu/protocol";
import type { Mirror } from "./Mirror.js";

/** クライアントへの送信先（WsGateway が実装する。architecture.md「ClientSink」）。 */
export interface ClientSink {
  readonly clientId: string;
  sendOutput(paneId: PaneId, chunk: Uint8Array): void;
  sendSnapshot(paneId: PaneId, cols: number, rows: number, text: string): void;
  readonly bufferedAmount: number;
}

/**
 * pane 1 つ分の購読者の管理（architecture.md「OutputFanout」）。
 * 購読者ごとの状態は buffering → live ⇄ stale の 3 状態（「購読者の状態」の図）。
 */
export interface OutputFanout {
  subscribe(sink: ClientSink, scrollbackLines: number): void;
  unsubscribe(clientId: string): void;
  push(chunk: Uint8Array): void;
  retryStale(): void;
}

const STALE_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2MB（design「流量制御」）
const DRAIN_LOW_WATERMARK_BYTES = 256 * 1024; // 256KB

type SubState = "buffering" | "live" | "stale";

interface SubEntry {
  sink: ClientSink;
  scrollbackLines: number;
  state: SubState;
  /** 継ぎ目の手順を始めるたびに増やす。捨てた/やり直した試行の古い `write('', cb)` を無視するため。 */
  generation: number;
  buffered: Uint8Array[];
  bufferedBytes: number;
}

export class DefaultOutputFanout implements OutputFanout {
  private readonly subs = new Map<string, SubEntry>();

  constructor(
    private readonly paneId: PaneId,
    private readonly mirror: Mirror,
  ) {}

  subscribe(sink: ClientSink, scrollbackLines: number): void {
    const entry: SubEntry = {
      sink,
      scrollbackLines,
      state: "buffering",
      generation: 0,
      buffered: [],
      bufferedBytes: 0,
    };
    this.subs.set(sink.clientId, entry);
    this.startBuffering(entry);
  }

  unsubscribe(clientId: string): void {
    const entry = this.subs.get(clientId);
    if (entry) entry.generation++; // 進行中の継ぎ目があれば、その `cb` を無効化する
    this.subs.delete(clientId);
  }

  push(chunk: Uint8Array): void {
    for (const entry of this.subs.values()) {
      switch (entry.state) {
        case "live":
          if (entry.sink.bufferedAmount > STALE_THRESHOLD_BYTES) {
            entry.state = "stale";
            entry.generation++; // 念のため：この後 retryStale が改めて継ぎ目をやり直す
            continue;
          }
          entry.sink.sendOutput(this.paneId, chunk);
          break;
        case "buffering":
          entry.buffered.push(chunk);
          entry.bufferedBytes += chunk.byteLength;
          if (entry.bufferedBytes > STALE_THRESHOLD_BYTES) {
            // ミラーの処理が大きく遅れている。溜め置きを捨てて stale にする（design「購読者の状態」）。
            entry.state = "stale";
            entry.buffered = [];
            entry.bufferedBytes = 0;
            entry.generation++; // 進行中の write('', cb) を無効化する
          }
          break;
        case "stale":
          // 何もしない（捨てる）。retryStale が回復したら継ぎ目をやり直す。
          break;
      }
    }
  }

  retryStale(): void {
    for (const entry of this.subs.values()) {
      if (entry.state !== "stale") continue;
      if (entry.sink.bufferedAmount < DRAIN_LOW_WATERMARK_BYTES && this.mirror.pendingBytes() < DRAIN_LOW_WATERMARK_BYTES) {
        this.startBuffering(entry);
      }
    }
  }

  /** 現在購読しているクライアントの状態（テスト・診断用）。 */
  stateOf(clientId: string): SubState | undefined {
    return this.subs.get(clientId)?.state;
  }

  private startBuffering(entry: SubEntry): void {
    entry.state = "buffering";
    entry.buffered = [];
    entry.bufferedBytes = 0;
    const generation = ++entry.generation;
    this.mirror.write("", () => {
      // 捨てた／やり直した試行の古い callback は無視する（世代が変わっている）。
      if (entry.generation !== generation) return;
      const snap = this.mirror.serialize(entry.scrollbackLines);
      entry.sink.sendSnapshot(this.paneId, snap.cols, snap.rows, snap.text);
      for (const chunk of entry.buffered) entry.sink.sendOutput(this.paneId, chunk);
      entry.buffered = [];
      entry.bufferedBytes = 0;
      entry.state = "live";
    });
  }
}
