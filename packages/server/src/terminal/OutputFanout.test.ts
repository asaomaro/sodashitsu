import { describe, expect, it } from "vitest";
import type { Disposable } from "../util/Disposable.js";
import { DefaultOutputFanout, type ClientSink } from "./OutputFanout.js";
import type { InputModes, Mirror, MirrorSnapshot } from "./Mirror.js";

/** 継ぎ目のタイミングを完全に制御できる偽のミラー（T12「テスト方針」）。 */
class FakeMirror implements Mirror {
  pending = 0;
  private snapshotText = "SNAPSHOT";
  private pendingWriteCallbacks: (() => void)[] = [];

  write(_chunk: string, done?: () => void): void {
    if (done) this.pendingWriteCallbacks.push(done);
  }
  /** テストから明示的に呼んで、溜まっている `write('', cb)` を 1 つ発火させる。 */
  flushOneWrite(): void {
    const cb = this.pendingWriteCallbacks.shift();
    cb?.();
  }
  pendingWriteCount(): number {
    return this.pendingWriteCallbacks.length;
  }
  pendingBytes(): number {
    return this.pending;
  }
  onDrained(): Disposable {
    return { dispose: () => undefined };
  }
  serialize(scrollbackLines: number): MirrorSnapshot {
    return { cols: 80, rows: 24, text: `${this.snapshotText}(${scrollbackLines})` };
  }
  setSnapshotText(text: string): void {
    this.snapshotText = text;
  }
  lastLogicalLines(): string[] {
    return [];
  }
  bottomLines(): string[] {
    return [];
  }
  plainText(): string {
    return "";
  }
  historyAnsi(): string {
    return "";
  }
  title(): string {
    return "";
  }
  progress(): string | null {
    return null;
  }
  cwdHint(): string | null {
    return null;
  }
  onResponse(): Disposable {
    return { dispose: () => undefined };
  }
  resize(): void {
    // no-op
  }
  dispose(): void {
    // no-op
  }
  notifyAppearanceMayHaveChanged(): void {
    // no-op
  }
  inputModes(): InputModes {
    return { bracketedPaste: false, applicationCursorKeys: false };
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeSink implements ClientSink {
  bufferedAmount = 0;
  readonly outputs: Uint8Array[] = [];
  readonly snapshots: { cols: number; rows: number; text: string }[] = [];
  constructor(readonly clientId: string) {}
  sendOutput(_paneId: string, chunk: Uint8Array): void {
    this.outputs.push(chunk);
  }
  sendSnapshot(_paneId: string, cols: number, rows: number, text: string): void {
    this.snapshots.push({ cols, rows, text });
  }
}

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (u: Uint8Array) => new TextDecoder().decode(u);

describe("DefaultOutputFanout — subscribe / continuity", () => {
  it("buffers output while waiting for the mirror, then flushes snapshot + buffered output in order", () => {
    const mirror = new FakeMirror();
    const fanout = new DefaultOutputFanout("p1", mirror);
    const sink = new FakeSink("c1");

    fanout.subscribe(sink, 5000);
    expect(fanout.stateOf("c1")).toBe("buffering");

    // subscribe より後に来た出力は、継ぎ目が終わるまで溜め置かれる。
    fanout.push(bytes("during-buffering-1"));
    fanout.push(bytes("during-buffering-2"));
    expect(sink.outputs.length).toBe(0);
    expect(sink.snapshots.length).toBe(0);

    mirror.flushOneWrite(); // これで write('', cb) の cb が呼ばれ、継ぎ目の手順が完了する

    expect(fanout.stateOf("c1")).toBe("live");
    expect(sink.snapshots).toEqual([{ cols: 80, rows: 24, text: "SNAPSHOT(5000)" }]);
    expect(sink.outputs.map(text)).toEqual(["during-buffering-1", "during-buffering-2"]);

    // live になった後は、そのまま直接送る。
    fanout.push(bytes("after-live"));
    expect(sink.outputs.map(text)).toEqual(["during-buffering-1", "during-buffering-2", "after-live"]);
  });

  it("does not duplicate or drop output when two clients subscribe at different times", () => {
    const mirror = new FakeMirror();
    const fanout = new DefaultOutputFanout("p1", mirror);
    const early = new FakeSink("early");
    fanout.subscribe(early, 5000);
    mirror.flushOneWrite();
    fanout.push(bytes("shared-1"));

    const late = new FakeSink("late");
    fanout.subscribe(late, 5000);
    fanout.push(bytes("shared-2")); // late はまだ buffering
    mirror.flushOneWrite();
    fanout.push(bytes("shared-3"));

    expect(early.outputs.map(text)).toEqual(["shared-1", "shared-2", "shared-3"]);
    expect(late.outputs.map(text)).toEqual(["shared-2", "shared-3"]);
    expect(late.snapshots.length).toBe(1);
  });
});

describe("DefaultOutputFanout — stale / retry", () => {
  it("moves a live client to stale when its bufferedAmount exceeds the threshold, and stops sending", () => {
    const mirror = new FakeMirror();
    const fanout = new DefaultOutputFanout("p1", mirror);
    const sink = new FakeSink("c1");
    fanout.subscribe(sink, 5000);
    mirror.flushOneWrite();
    expect(fanout.stateOf("c1")).toBe("live");

    sink.bufferedAmount = 3 * 1024 * 1024; // > 2MB
    fanout.push(bytes("dropped-1"));
    expect(fanout.stateOf("c1")).toBe("stale");
    fanout.push(bytes("dropped-2"));
    expect(sink.outputs.length).toBe(0); // stale の間は送らない
  });

  it("moves a buffering client to stale when the buffered amount exceeds the threshold, discarding it", () => {
    const mirror = new FakeMirror();
    const fanout = new DefaultOutputFanout("p1", mirror);
    const sink = new FakeSink("c1");
    fanout.subscribe(sink, 5000);

    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    fanout.push(big);
    expect(fanout.stateOf("c1")).toBe("stale");

    // 溜め置き中だった write('', cb) が後から発火しても、世代が変わっているので無視される。
    mirror.flushOneWrite();
    expect(sink.snapshots.length).toBe(0);
    expect(sink.outputs.length).toBe(0);
  });

  it("retryStale restarts the continuity procedure once both sink and mirror have drained", () => {
    const mirror = new FakeMirror();
    const fanout = new DefaultOutputFanout("p1", mirror);
    const sink = new FakeSink("c1");
    fanout.subscribe(sink, 5000);
    mirror.flushOneWrite();
    sink.bufferedAmount = 3 * 1024 * 1024;
    fanout.push(bytes("x"));
    expect(fanout.stateOf("c1")).toBe("stale");

    fanout.retryStale(); // まだ bufferedAmount が高いので何も起きない
    expect(fanout.stateOf("c1")).toBe("stale");
    expect(mirror.pendingWriteCount()).toBe(0);

    sink.bufferedAmount = 0;
    mirror.pending = 0;
    fanout.retryStale();
    expect(fanout.stateOf("c1")).toBe("buffering");
    mirror.setSnapshotText("SNAPSHOT-2");
    mirror.flushOneWrite();
    expect(fanout.stateOf("c1")).toBe("live");
    expect(sink.snapshots.at(-1)).toEqual({ cols: 80, rows: 24, text: "SNAPSHOT-2(5000)" });
  });

  it("retryStale does nothing while the mirror itself is still backed up", () => {
    const mirror = new FakeMirror();
    const fanout = new DefaultOutputFanout("p1", mirror);
    const sink = new FakeSink("c1");
    fanout.subscribe(sink, 5000);
    mirror.flushOneWrite();
    sink.bufferedAmount = 3 * 1024 * 1024;
    fanout.push(bytes("x"));

    sink.bufferedAmount = 0;
    mirror.pending = 1024 * 1024; // ミラー側がまだ詰まっている
    fanout.retryStale();
    expect(fanout.stateOf("c1")).toBe("stale");
  });
});

describe("DefaultOutputFanout — unsubscribe", () => {
  it("stops delivering output after unsubscribe, and ignores an in-flight write callback", () => {
    const mirror = new FakeMirror();
    const fanout = new DefaultOutputFanout("p1", mirror);
    const sink = new FakeSink("c1");
    fanout.subscribe(sink, 5000);
    fanout.unsubscribe("c1");
    mirror.flushOneWrite(); // 購読解除後に呼ばれても何も起きない
    fanout.push(bytes("after-unsubscribe"));
    expect(sink.outputs.length).toBe(0);
    expect(sink.snapshots.length).toBe(0);
  });
});
