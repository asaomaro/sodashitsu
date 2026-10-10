import { describe, expect, it, vi } from "vitest";
import { MOVE_FAILED, MOVE_NOT_SYNCED, moveNodeTo, type MoveNodeDeps } from "./moveNodeTo.js";

const target = { kind: "move" as const, workspaceId: "w2", tabId: "t2", frameId: "w2", label: "move-b", viaTag: false };
function deps(over: Partial<MoveNodeDeps> = {}): MoveNodeDeps & { calls: string[] } {
  const calls: string[] = [];
  const d: MoveNodeDeps = {
    movePaneToTab: vi.fn(async () => ({ ok: true })),
    waitMember: vi.fn(async () => true),
    placeNode: vi.fn(async () => {
      calls.push("place");
    }),
    bodyPosition: vi.fn(() => ({ x: 20, y: 60 })),
    clearDrag: vi.fn(() => calls.push("clear")),
    toast: vi.fn((m: string) => calls.push(`toast:${m}`)),
    announce: vi.fn(),
    flash: vi.fn(),
    ...over,
  };
  return Object.assign(d, { calls });
}

describe("moveNodeTo（20261008-graph-first PR4）", () => {
  it("成功して所属が届いたら、離した場所へ置く（囲いの見出しの下ではなく）", async () => {
    const d = deps();
    expect(await moveNodeTo(d, { paneId: "p1", name: "n", target, dropPos: { x: 300, y: 200 } })).toBe("moved");
    expect(d.placeNode).toHaveBeenCalledWith({ x: 300, y: 200 });
  });
  it("タグ・メニュー（離した場所が無い）のときは、囲いの中の最初の場所へ置く。見えていない囲いなら置かない", async () => {
    const d = deps();
    await moveNodeTo(d, { paneId: "p1", name: "n", target, dropPos: null });
    expect(d.placeNode).toHaveBeenCalledWith({ x: 20, y: 60 });
    const d2 = deps({ bodyPosition: vi.fn(() => null) });
    expect(await moveNodeTo(d2, { paneId: "p1", name: "n", target, dropPos: null })).toBe("moved");
    expect(d2.placeNode).not.toHaveBeenCalled();
  });
  it("所属の変化を待つ間に待ちが切れたら、位置を書かない（graph.moveNodes に当たる placeNode を呼ばない）。知らせて、つかむ前の表示へ戻す", async () => {
    const d = deps({ waitMember: vi.fn(async () => false) });
    expect(await moveNodeTo(d, { paneId: "p1", name: "n", target, dropPos: { x: 300, y: 200 } })).toBe("not_synced");
    expect(d.placeNode).not.toHaveBeenCalled();
    expect(d.calls).toContain(`toast:${MOVE_NOT_SYNCED}`);
    expect(d.clearDrag).toHaveBeenCalled();
  });
  it("サーバが断った（理由つき）: 位置を書かず、元へ戻す。理由は呼び手がトーストに出している（ここでは重ねて出さない）", async () => {
    const d = deps({ movePaneToTab: vi.fn(async () => ({ ok: false, reason: "different_worktree" })) });
    expect(await moveNodeTo(d, { paneId: "p1", name: "n", target, dropPos: null })).toBe("declined");
    expect(d.waitMember).not.toHaveBeenCalled();
    expect(d.placeNode).not.toHaveBeenCalled();
    expect(d.toast).not.toHaveBeenCalled();
    expect(d.clearDrag).toHaveBeenCalled();
  });
  it("理由の無い ok:false・通信の失敗は、一般のトーストで元へ戻す", async () => {
    for (const r of [{ ok: false }, null]) {
      const d = deps({ movePaneToTab: vi.fn(async () => r) });
      expect(await moveNodeTo(d, { paneId: "p1", name: "n", target, dropPos: null })).toBe("declined");
      expect(d.toast).toHaveBeenCalledWith(MOVE_FAILED);
      expect(d.placeNode).not.toHaveBeenCalled();
    }
  });
});
