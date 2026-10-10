import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useAgentForkStore } from "./agentFork.js";
import { useViewStore } from "./view.js";

beforeEach(() => setActivePinia(createPinia()));

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
});
