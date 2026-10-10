import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FORK_STALL_MS, FORK_STALLED_MESSAGE, useAgentForkStore } from "./agentFork.js";
import { useViewStore } from "./view.js";

beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.useRealTimers());

describe("agentFork ストア（20261009-agent-fork PR2）", () => {
  it("始めたもの（mine）は、完了でトーストを出す。最初の知らせが pending のまま終わるときは、そう書く", () => {
    const s = useAgentForkStore();
    const view = useViewStore();
    s.begin("p1");
    s.started("p1", { paneId: "p2", name: "src-fork", noteStatus: "pending" });
    s.apply({ sourcePaneId: "p1", paneId: "p2", stage: "detected" });
    expect(view.toasts).toHaveLength(0);
    s.apply({ sourcePaneId: "p1", paneId: "p2", stage: "done", noteStatus: "pending" });
    expect(view.toasts).toHaveLength(1);
    expect(view.toasts[0]!.message).toContain("fork しました: src-fork");
    expect(view.toasts[0]!.message).toContain("まだ送っていません");
    // 同じ完了を重ねて受けても、トーストは 1 つ
    s.apply({ sourcePaneId: "p1", paneId: "p2", stage: "done", noteStatus: "pending" });
    expect(view.toasts).toHaveLength(1);
  });
  it("失敗: 理由と残ったものを覚え、トーストを出す。ほかのブラウザが始めたもの（mine でない）は、トーストを出さない", () => {
    const s = useAgentForkStore();
    const view = useViewStore();
    s.begin("p1");
    s.apply({ sourcePaneId: "p1", stage: "failed", code: "fork_shell_not_ready", message: "シェルが入力を受けられません", created: { worktreePath: "/w", paneId: "p9" } });
    expect(s.runs["p1"]).toMatchObject({ finished: true, ok: false, message: "シェルが入力を受けられません" });
    expect(view.toasts.at(-1)!.message).toContain("fork に失敗しました");
    const before = view.toasts.length;
    s.apply({ sourcePaneId: "other", stage: "done" }); // 自分が始めたものではない
    expect(view.toasts).toHaveLength(before);
  });
  it("できごとが先に終わっていたら、応答は終わりを巻き戻さない。応答前の失敗は、記録を忘れる", () => {
    const s = useAgentForkStore();
    s.begin("p1");
    s.apply({ sourcePaneId: "p1", paneId: "p2", stage: "done", noteStatus: "sent" });
    s.started("p1", { paneId: "p2", name: "n", noteStatus: "pending" });
    expect(s.runs["p1"]).toMatchObject({ finished: true, ok: true, noteStatus: "sent" });
    s.begin("p3");
    s.forget("p3");
    expect(s.runs["p3"]).toBeUndefined();
  });

  it("進み具合が 11 分届かないときは、「届きません」の終わった記録にする（表示が残り続けない）。届いている間は延びる", () => {
    vi.useFakeTimers();
    const s = useAgentForkStore();
    const view = useViewStore();
    s.begin("p1");
    s.started("p1", { paneId: "p2", name: "n", noteStatus: "pending" });
    vi.advanceTimersByTime(FORK_STALL_MS - 1000);
    s.apply({ sourcePaneId: "p1", paneId: "p2", stage: "detected" }); // 届いたので、待ちは延びる
    vi.advanceTimersByTime(FORK_STALL_MS - 1000);
    expect(s.runs["p1"]!.finished).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(s.runs["p1"]).toMatchObject({ finished: true, ok: false, stalled: true, message: FORK_STALLED_MESSAGE });
    expect(view.toasts.at(-1)!.message).toContain("進み具合が届きません");
    // 終わった記録は、忘れられる
    s.forgetFinished("p1");
    expect(s.runs["p1"]).toBeUndefined();
  });
  it("終わった（done）ら待ちを止める。忘れたら、タイマーも残らない（否定の対照: 止めないと終わった後に失敗へ書き換わる）", () => {
    vi.useFakeTimers();
    const s = useAgentForkStore();
    s.begin("p1");
    s.apply({ sourcePaneId: "p1", paneId: "p2", stage: "done", noteStatus: "sent" });
    s.begin("p3");
    s.forget("p3");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(FORK_STALL_MS * 2);
    expect(s.runs["p1"]).toMatchObject({ finished: true, ok: true });
    expect(s.runs["p3"]).toBeUndefined();
  });
  it("forgetFinished は進行中の記録を消さない（裏で続き、終わったらトーストが出る）", () => {
    vi.useFakeTimers();
    const s = useAgentForkStore();
    const view = useViewStore();
    s.begin("p1");
    s.forgetFinished("p1");
    expect(s.runs["p1"]).toBeDefined();
    s.apply({ sourcePaneId: "p1", stage: "done", noteStatus: "sent" });
    expect(view.toasts).toHaveLength(1);
  });
});
