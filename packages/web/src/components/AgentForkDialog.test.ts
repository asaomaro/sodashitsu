import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentForkPreviewResult } from "@sodashitsu/protocol";
import { ActionDispatcherKey } from "../injection.js";
import { useAgentForkStore } from "../store/agentFork.js";
import { useViewStore } from "../store/view.js";
import AgentForkDialog from "./AgentForkDialog.vue";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
});

const preview = (over: Partial<AgentForkPreviewResult> = {}): AgentForkPreviewResult => ({
  available: true,
  sessionHead: "3e81f9a7",
  worktreeAvailable: true,
  sourceDir: "/repo",
  targetPath: null,
  suggestedBranch: "feature-fork",
  branchExists: null,
  dirtyCount: 0,
  noteUnsafe: false,
  ...over,
});

type ForkResult = { ok: true } | { ok: false; code: string | null; message: string };
function setup(forkPreview: (paneId: string, branch?: string) => Promise<AgentForkPreviewResult>, forkAgent = vi.fn(async (): Promise<ForkResult> => ({ ok: true }))) {
  const actions = { forkPreview: vi.fn(forkPreview), forkAgent };
  const wrapper = mount(AgentForkDialog, { global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } }, attachTo: document.body });
  const view = useViewStore(pinia);
  view.openDialogWithContext({ kind: "agentFork", paneId: "p1" });
  return { wrapper, actions, view };
}

describe("AgentForkDialog（20261009-agent-fork PR2）", () => {
  it("fork できない pane は、理由を出して、確定を押せない", async () => {
    const { wrapper } = setup(async () => preview({ available: false, reason: "no_session_id" }));
    await flushPromises();
    expect(wrapper.get("[data-fork-unavailable]").text()).toContain("会話の id が分かりません");
    expect((wrapper.get("[data-fork-submit]").element as HTMLButtonElement).disabled).toBe(true);
  });

  it("同じフォルダ: 確定で forkAgent（行き先 same）。コミットしていない変更の注意は、worktree のときだけ", async () => {
    const { wrapper, actions } = setup(async () => preview({ dirtyCount: 3 }));
    await flushPromises();
    expect(wrapper.find("[data-fork-dirty]").exists()).toBe(false);
    expect(wrapper.get("[data-fork-notinherited]").text()).toContain("権限のモード");
    await wrapper.get("form").trigger("submit");
    expect(actions.forkAgent).toHaveBeenCalledWith("p1", { kind: "same" }, true);
  });

  it("新しい worktree: ブランチ名・作成先・変更の件数の注意。既にあるブランチ名では、確定を押せない（理由）", async () => {
    const { wrapper, actions } = setup(async (_id, branch) =>
      preview({ dirtyCount: 3, targetPath: branch ? `/wt/${branch}` : null, branchExists: branch === undefined ? null : branch === "main" }),
    );
    await flushPromises();
    await wrapper.get('[data-fork-target="worktree"]').setValue(true);
    await flushPromises();
    expect(wrapper.get("[data-fork-dirty]").text()).toContain("3 件");
    expect(wrapper.get("[data-fork-dirty]").text()).toContain("来ません");
    const input = wrapper.get("[data-fork-branch]");
    await input.setValue("main");
    await new Promise((r) => setTimeout(r, 330));
    await flushPromises();
    expect(wrapper.get("[data-fork-branch-msg]").text()).toContain("既にあります");
    expect((wrapper.get("[data-fork-submit]").element as HTMLButtonElement).disabled).toBe(true);
    await input.setValue("new-one");
    await new Promise((r) => setTimeout(r, 330));
    await flushPromises();
    expect(wrapper.get("[data-fork-target-path]").text()).toBe("/wt/new-one");
    expect((wrapper.get("[data-fork-submit]").element as HTMLButtonElement).disabled).toBe(false);
    await wrapper.get("form").trigger("submit");
    expect(actions.forkAgent).toHaveBeenCalledWith("p1", { kind: "worktree", branch: "new-one" }, true);
  });

  it("git の外の pane は、worktree を選べず理由が出る。送れないパスなら、最初の知らせのチェックが外れる理由", async () => {
    const { wrapper } = setup(async () => preview({ worktreeAvailable: false, worktreeReason: "not_a_git_repository", noteUnsafe: true }));
    await flushPromises();
    expect((wrapper.get('[data-fork-target="worktree"]').element as HTMLInputElement).disabled).toBe(true);
    expect(wrapper.get("[data-fork-worktree-blocked]").text()).toContain("git のリポジトリの中");
  });

  it("確定の後の画面: 進み具合と、「最初の知らせを、まだ送っていません（入力欄を待っています）」。失敗は理由と残ったもの", async () => {
    const { wrapper } = setup(async () => preview());
    await flushPromises();
    const store = useAgentForkStore(pinia);
    store.begin("p1");
    store.started("p1", { paneId: "p2", name: "src-fork", noteStatus: "pending", worktreePath: "/wt/x" });
    store.apply({ sourcePaneId: "p1", paneId: "p2", stage: "detected", noteStatus: "pending" });
    await flushPromises();
    expect(wrapper.get("[data-fork-run]").text()).toContain("手が空くのを待っています");
    expect(wrapper.get("[data-fork-note]").text()).toBe("最初の知らせを、まだ送っていません（入力欄を待っています）。");
    expect(wrapper.text()).toContain("閉じても、裏で続きます");
    store.apply({ sourcePaneId: "p1", paneId: "p2", stage: "failed", message: "エージェントが検出されません", created: { worktreePath: "/wt/x", paneId: "p2" } });
    await flushPromises();
    expect(wrapper.get("[data-fork-failed]").text()).toContain("エージェントが検出されません");
    expect(wrapper.get("[data-fork-failed]").text()).toContain("/wt/x");
  });

  it("サーバが断った（応答の失敗）: ダイアログの中に理由を出し、閉じない", async () => {
    const forkAgent = vi.fn(async (): Promise<ForkResult> => ({ ok: false, code: "fork_in_progress", message: "この pane の fork は、すでに進んでいます。" }));
    const { wrapper, view } = setup(async () => preview(), forkAgent);
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[data-fork-submit-error]").text()).toContain("すでに進んでいます");
    expect(view.dialogContext?.kind).toBe("agentFork");
  });

  it("終わった記録は、閉じたら消える。同じ pane で開き直したとき、前の結果ではなく確かめの画面になる", async () => {
    const { wrapper, view } = setup(async () => preview());
    await flushPromises();
    const store = useAgentForkStore(pinia);
    store.begin("p1");
    store.apply({ sourcePaneId: "p1", paneId: "p2", stage: "done", noteStatus: "sent" });
    await flushPromises();
    expect(wrapper.find("[data-fork-run]").exists()).toBe(true);
    view.closeDialog();
    await flushPromises();
    expect(store.runs["p1"]).toBeUndefined();
    view.openDialogWithContext({ kind: "agentFork", paneId: "p1" });
    await flushPromises();
    expect(wrapper.find("[data-fork-run]").exists()).toBe(false);
    expect(wrapper.find("[data-fork-submit]").exists()).toBe(true);
  });

  it("進行中のまま閉じても、記録は残る（裏で続き、終わったらトースト）", async () => {
    const { wrapper, view } = setup(async () => preview());
    await flushPromises();
    const store = useAgentForkStore(pinia);
    store.begin("p1");
    store.apply({ sourcePaneId: "p1", paneId: "p2", stage: "launched" });
    await flushPromises();
    await wrapper.get(".fork-run .fork-primary").trigger("click");
    await flushPromises();
    expect(view.dialogContext).toBeNull();
    expect(store.runs["p1"]).toMatchObject({ finished: false, mine: true });
    store.apply({ sourcePaneId: "p1", paneId: "p2", stage: "done", noteStatus: "sent" });
    expect(view.toasts.at(-1)!.message).toContain("fork しました");
  });

  it("ブランチ名の確かめが入力に追いつくまでは、確定を押せない（追いついたら押せる）", async () => {
    let release: (() => void) | undefined;
    const { wrapper } = setup(async (_id, branch) => {
      if (branch === "slow") await new Promise<void>((r) => (release = r));
      return preview({ targetPath: branch ? `/wt/${branch}` : null, branchExists: branch === undefined ? null : false });
    });
    await flushPromises();
    await wrapper.get('[data-fork-target="worktree"]').setValue(true);
    await flushPromises();
    const submit = () => wrapper.get("[data-fork-submit]").element as HTMLButtonElement;
    await wrapper.get("[data-fork-branch]").setValue("slow");
    await new Promise((r) => setTimeout(r, 330)); // 確かめを始めた（まだ答えが来ていない）
    expect(submit().disabled).toBe(true);
    release?.();
    await flushPromises();
    expect(submit().disabled).toBe(false);
  });
});
