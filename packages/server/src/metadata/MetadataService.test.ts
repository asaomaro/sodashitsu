import { RpcError, type WorkspaceReportMetadataParams } from "@wtm/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../bus/EventBus.js";
import { MemoryLogger } from "../log/Logger.js";
import { NotFoundError } from "../session/SessionModel.js";
import { MetadataService, type MetadataTargets, type MetadataTimers } from "./MetadataService.js";

/** 20260927-sidebar-row-tokens の AC1・AC2・AC4〜AC7（配線: 検査の順・配布・タイマー・閉じたときの破棄）。 */

class FakeTargets implements MetadataTargets {
  readonly workspaces = new Set<string>(["w1", "w2"]);
  readonly panes = new Set<string>(["p1"]);
  readonly writes: [string, string, Record<string, string> | null][] = [];
  hasWorkspace(id: string): boolean {
    return this.workspaces.has(id);
  }
  hasPane(id: string): boolean {
    return this.panes.has(id);
  }
  /** 写すときに投げる（NotFoundError 以外の失敗を模す）。 */
  failWith: Error | null = null;
  setWorkspaceTokens(id: string, tokens: Record<string, string> | null): void {
    if (this.failWith) throw this.failWith;
    if (!this.workspaces.has(id)) throw new NotFoundError("workspace", id);
    this.writes.push(["workspace", id, tokens]);
  }
  setPaneTokens(id: string, tokens: Record<string, string> | null): void {
    if (!this.panes.has(id)) throw new NotFoundError("pane", id);
    this.writes.push(["pane", id, tokens]);
  }
}

/** 偽の時計とタイマー（実時間を待たない）。 */
class FakeClock implements MetadataTimers {
  now = 0;
  private seq = 0;
  readonly pending = new Map<number, { at: number; fn: () => void }>();
  set(fn: () => void, ms: number): unknown {
    const id = ++this.seq;
    this.pending.set(id, { at: this.now + ms, fn });
    return id;
  }
  clear(handle: unknown): void {
    this.pending.delete(handle as number);
  }
  /** `to` まで時計を進め、締め切りの来たタイマーを順に呼ぶ。 */
  advance(to: number): void {
    for (;;) {
      const due = [...this.pending].filter(([, t]) => t.at <= to).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.pending.delete(due[0]);
      this.now = due[1].at;
      due[1].fn();
    }
    this.now = to;
  }
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof RpcError ? err.code : "not-rpc-error";
  }
}

const ws = (tokens: WorkspaceReportMetadataParams["tokens"], extra: Partial<WorkspaceReportMetadataParams> = {}): WorkspaceReportMetadataParams => ({
  workspaceId: "w1",
  source: "hook",
  tokens,
  ...extra,
});

let targets: FakeTargets;
let clock: FakeClock;
let bus: EventBus;
let service: MetadataService;

beforeEach(() => {
  targets = new FakeTargets();
  clock = new FakeClock();
  bus = new EventBus();
  service = new MetadataService({ targets, bus, now: () => clock.now, timers: clock });
});

describe("MetadataService — 報告と配布（AC1・AC2）", () => {
  it("workspace の値を設定して写す。触れない名前は残し、消去で消える", () => {
    service.reportWorkspace(ws([{ name: "summary", value: "one" }, { name: "model", value: "opus" }]));
    service.reportWorkspace(ws([{ name: "summary", value: "two" }]));
    service.reportWorkspace(ws([{ name: "model", value: null }]));
    expect(targets.writes).toEqual([
      ["workspace", "w1", { summary: "one", model: "opus" }],
      ["workspace", "w1", { summary: "two", model: "opus" }],
      ["workspace", "w1", { summary: "two" }],
    ]);
  });

  it("pane の値は pane に写す", () => {
    service.reportPane({ paneId: "p1", source: "s", tokens: [{ name: "a", value: "1" }] });
    expect(targets.writes).toEqual([["pane", "p1", { a: "1" }]]);
  });

  it("最後の値を消すと null を写す", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }]));
    service.reportWorkspace(ws([{ name: "a", value: "  " }]));
    expect(targets.writes.at(-1)).toEqual(["workspace", "w1", null]);
  });

  it("値が変わらない報告は写さない（同じ値・無い名前の消去）", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }]));
    service.reportWorkspace(ws([{ name: "a", value: " 1 " }]));
    service.reportWorkspace(ws([{ name: "zz", value: null }]));
    expect(targets.writes).toHaveLength(1);
  });

  it("対象ごとに別の帳簿（w1 と w2・workspace と pane）", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }]));
    service.reportWorkspace(ws([{ name: "b", value: "2" }], { workspaceId: "w2" }));
    expect(targets.writes).toEqual([
      ["workspace", "w1", { a: "1" }],
      ["workspace", "w2", { b: "2" }],
    ]);
  });
});

describe("MetadataService — 検査の順と誤り（AC4）", () => {
  it("対象が無ければ not_found（ほかの誤りより先）", () => {
    expect(codeOf(() => service.reportWorkspace(ws([], { workspaceId: "nope", source: "" })))).toBe("not_found");
    expect(codeOf(() => service.reportPane({ paneId: "nope", source: "", tokens: [] }))).toBe("not_found");
  });

  it("source → ttl → tokens の順に見る", () => {
    expect(codeOf(() => service.reportWorkspace(ws([], { source: "a b", ttlMs: 0 })))).toBe("invalid_metadata_source");
    expect(codeOf(() => service.reportWorkspace(ws([], { ttlMs: 0 })))).toBe("invalid_metadata_ttl");
    expect(codeOf(() => service.reportWorkspace(ws([])))).toBe("invalid_metadata_token");
    expect(targets.writes).toEqual([]);
  });

  it("反映後の名前が 32 を超えると metadata_token_limit で、何も変えない", () => {
    for (let i = 0; i < 2; i++) {
      service.reportWorkspace(ws(Array.from({ length: 16 }, (_, j) => ({ name: `k${i}_${j}`, value: "v" }))));
    }
    const before = targets.writes.length;
    expect(codeOf(() => service.reportWorkspace(ws([{ name: "extra", value: "v" }])))).toBe("metadata_token_limit");
    expect(targets.writes).toHaveLength(before);
    // 置き換え・消去と同時なら通る
    service.reportWorkspace(ws([{ name: "k0_0", value: null }, { name: "extra", value: "v" }]));
    expect(targets.writes).toHaveLength(before + 1);
  });

  it("古い seq はキー数の上限より先に見る（上限を超える古い報告は成功・何もしない）", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { seq: 5 }));
    service.reportWorkspace(ws(Array.from({ length: 16 }, (_, j) => ({ name: `k0_${j}`, value: "v" }))));
    service.reportWorkspace(ws(Array.from({ length: 15 }, (_, j) => ({ name: `k1_${j}`, value: "v" })))); // 32 個
    expect(codeOf(() => service.reportWorkspace(ws([{ name: "extra", value: "v" }])))).toBe("metadata_token_limit");
    expect(codeOf(() => service.reportWorkspace(ws([{ name: "extra", value: "v" }], { seq: 4 })))).toBeNull();
  });
});

describe("MetadataService — seq（AC5）", () => {
  it("同じ source の古い seq は成功を返して何もしない", () => {
    service.reportWorkspace(ws([{ name: "a", value: "new" }], { seq: 2 }));
    service.reportWorkspace(ws([{ name: "a", value: "old" }], { seq: 1 }));
    service.reportWorkspace(ws([{ name: "a", value: "same" }], { seq: 2 }));
    expect(targets.writes).toEqual([["workspace", "w1", { a: "new" }]]);
    // 別の source・seq 無しは受け付ける
    service.reportWorkspace(ws([{ name: "a", value: "other" }], { source: "other", seq: 1 }));
    service.reportWorkspace(ws([{ name: "a", value: "noseq" }]));
    expect(targets.writes.map((w) => w[2])).toEqual([{ a: "new" }, { a: "other" }, { a: "noseq" }]);
  });

  it("seq 付きの source は対象ごと 32 まで。33 個目は metadata_sequence_source_limit で何も変えない", () => {
    for (let i = 0; i < 32; i++) service.reportWorkspace(ws([{ name: "a", value: `${i}` }], { source: `s${i}`, seq: 1 }));
    const before = targets.writes.length;
    expect(codeOf(() => service.reportWorkspace(ws([{ name: "a", value: "x" }], { source: "s32", seq: 1 })))).toBe("metadata_sequence_source_limit");
    expect(targets.writes).toHaveLength(before);
    // 別の対象は別に数える
    expect(codeOf(() => service.reportWorkspace(ws([{ name: "a", value: "x" }], { workspaceId: "w2", source: "s32", seq: 1 })))).toBeNull();
  });

  it("整え方で断った報告は seq を記録しない（後の小さい seq を古いと判定しない）", () => {
    expect(codeOf(() => service.reportWorkspace(ws([{ name: "bad.name", value: "v" }], { seq: 10 })))).toBe("invalid_metadata_token");
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { seq: 1 }));
    expect(targets.writes).toEqual([["workspace", "w1", { a: "1" }]]);
  });
});

describe("MetadataService — 期限（AC6）", () => {
  it("期限が来たら消して写し、タイマーは次の締め切りへ掛け直す", () => {
    service.reportWorkspace(ws([{ name: "short", value: "1" }], { ttlMs: 100 }));
    service.reportWorkspace(ws([{ name: "long", value: "2" }], { ttlMs: 300 }));
    service.reportWorkspace(ws([{ name: "keep", value: "3" }]));
    expect(clock.pending.size).toBe(1);
    clock.advance(99);
    expect(targets.writes.at(-1)).toEqual(["workspace", "w1", { short: "1", long: "2", keep: "3" }]);
    clock.advance(100);
    expect(targets.writes.at(-1)).toEqual(["workspace", "w1", { long: "2", keep: "3" }]);
    expect(clock.pending.size).toBe(1);
    clock.advance(300);
    expect(targets.writes.at(-1)).toEqual(["workspace", "w1", { keep: "3" }]);
    expect(clock.pending.size).toBe(0);
  });

  it("期限なしで設定し直すと期限は外れ、タイマーも外れる", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { ttlMs: 100 }));
    service.reportWorkspace(ws([{ name: "a", value: "1" }]));
    expect(clock.pending.size).toBe(0);
    clock.advance(1000);
    expect(targets.writes.at(-1)).toEqual(["workspace", "w1", { a: "1" }]);
  });

  it("早い締め切りが後から来たら、タイマーを 1 つのまま早い方へ掛け直す", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { ttlMs: 500 }));
    service.reportPane({ paneId: "p1", source: "s", tokens: [{ name: "b", value: "2" }], ttlMs: 50 });
    expect(clock.pending.size).toBe(1);
    expect([...clock.pending.values()][0]!.at).toBe(50);
    clock.advance(50);
    expect(targets.writes.at(-1)).toEqual(["pane", "p1", null]);
    expect([...clock.pending.values()][0]!.at).toBe(500);
  });

  it("掃くときに対象が無くなっていても、ほかの対象の掃除を止めず、無い対象の帳簿は捨てる", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { ttlMs: 10, seq: 5 }));
    service.reportWorkspace(ws([{ name: "b", value: "2" }], { workspaceId: "w2", ttlMs: 10 }));
    targets.workspaces.delete("w1"); // 閉じたのに購読より先にタイマーが来た
    clock.advance(10);
    expect(targets.writes.at(-1)).toEqual(["workspace", "w2", null]);
    // 帳簿を捨てたので、同じ id に同じ source の小さい seq が受け付けられる（テストの都合で対象を戻す）
    targets.workspaces.add("w1");
    service.reportWorkspace(ws([{ name: "a", value: "again" }], { seq: 1 }));
    expect(targets.writes.at(-1)).toEqual(["workspace", "w1", { a: "again" }]);
  });

  it("対象が無い以外の失敗では帳簿（seq の記録）を残してログに出す", () => {
    const logger = new MemoryLogger();
    const s2 = new MetadataService({ targets, bus, now: () => clock.now, timers: clock, logger });
    s2.reportWorkspace(ws([{ name: "a", value: "1" }, { name: "b", value: "2" }], { ttlMs: 10, seq: 5 }));
    s2.reportWorkspace(ws([{ name: "keep", value: "k" }]));
    targets.failWith = new Error("boom");
    clock.advance(10);
    targets.failWith = null;
    expect(logger.lines.some((e) => e.msg === "failed to publish expired metadata tokens")).toBe(true);
    expect(s2.reportWorkspace(ws([{ name: "keep", value: "x" }], { seq: 5 }))).toBeUndefined();
    expect(targets.writes.at(-1)).toEqual(["workspace", "w1", { a: "1", b: "2", keep: "k" }]); // 写せなかった後に書き込みは無い。seq 5 は古い＝記録が残っている
    s2.dispose();
  });

  it("写す側が投げても、反映済みの締め切りのタイマーは掛かっている", () => {
    targets.failWith = new Error("boom");
    expect(() => service.reportWorkspace(ws([{ name: "a", value: "1" }], { ttlMs: 10 }))).toThrow("boom");
    targets.failWith = null;
    expect(clock.pending.size).toBe(1);
  });

  it("dispose でタイマーを外し、bus の購読も外す", () => {
    const localBus = new EventBus();
    const disposes: ReturnType<typeof vi.fn>[] = [];
    const orig = localBus.subscribe.bind(localBus);
    vi.spyOn(localBus, "subscribe").mockImplementation((fn) => {
      const sub = orig(fn);
      const d = vi.fn(() => sub.dispose());
      disposes.push(d);
      return { dispose: d };
    });
    const s2 = new MetadataService({ targets, bus: localBus, now: () => clock.now, timers: clock });
    s2.reportWorkspace(ws([{ name: "a", value: "1" }], { ttlMs: 10 }));
    s2.dispose();
    expect(clock.pending.size).toBe(0);
    expect(disposes).toHaveLength(1);
    expect(disposes[0]).toHaveBeenCalledTimes(1);
  });

  it("既定のタイマーは unref する（プロセスの終了を妨げない）", () => {
    const real = new MetadataService({ targets, bus: new EventBus() });
    const handles: { hasRef(): boolean }[] = [];
    const origSet = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      const h = origSet(fn, ms);
      handles.push(h);
      return h;
    }) as typeof setTimeout;
    try {
      real.reportWorkspace(ws([{ name: "a", value: "1" }], { ttlMs: 60_000 }));
    } finally {
      globalThis.setTimeout = origSet;
    }
    expect(handles).toHaveLength(1);
    expect(handles[0]!.hasRef()).toBe(false);
    real.dispose();
  });
});

describe("MetadataService — 閉じたとき（AC7）", () => {
  it("pane.closed・workspace.closed で帳簿を捨てる（seq の記録も消え、同じ id の報告は新しい帳簿で受ける）", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { seq: 9 }));
    service.reportPane({ paneId: "p1", source: "s", tokens: [{ name: "b", value: "2" }], seq: 9 });
    bus.publish({ event: "workspace.closed", data: { workspaceId: "w1" } });
    bus.publish({ event: "pane.closed", data: { paneId: "p1" } });
    const before = targets.writes.length;
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { seq: 1 }));
    service.reportPane({ paneId: "p1", source: "s", tokens: [{ name: "b", value: "2" }], seq: 1 });
    expect(targets.writes).toHaveLength(before + 2);
  });

  it("閉じた対象の期限のタイマーは、次の掛け直しで正す（写しに行かない）", () => {
    service.reportWorkspace(ws([{ name: "a", value: "1" }], { ttlMs: 10 }));
    bus.publish({ event: "workspace.closed", data: { workspaceId: "w1" } });
    targets.workspaces.delete("w1");
    const before = targets.writes.length;
    clock.advance(10);
    expect(targets.writes).toHaveLength(before);
    expect(clock.pending.size).toBe(0);
  });
});
