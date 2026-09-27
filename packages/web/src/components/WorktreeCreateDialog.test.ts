import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeListResult } from "@sodashitsu/protocol";
import { ActionDispatcherKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import WorktreeCreateDialog from "./WorktreeCreateDialog.vue";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
});

const INFO: WorktreeListResult = {
  worktreeRoot: "/home/me/.sodashitsu/worktrees",
  repoName: "soda",
  suggestedBranch: "worktree/brave-river-0000",
  entries: [],
};

function makeActions() {
  return { confirmWorktreeCreate: vi.fn() };
}

function mountDialog(actions: ReturnType<typeof makeActions>) {
  return mount(WorktreeCreateDialog, {
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } },
    attachTo: document.body,
  });
}

describe("WorktreeCreateDialog（20260920-git-worktree-actions）", () => {
  it("サーバが作った候補を入力済みで開く（AC1）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: INFO });
    await wrapper.vm.$nextTick();
    expect((wrapper.get(".worktree-dialog-input").element as HTMLInputElement).value).toBe("worktree/brave-river-0000");
  });

  // 実際に作られる場所とずれないよう、サーバと同じ `defaultCheckoutPath` を使っている。
  it("入力に応じて作成先のパスを見せる（AC2）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: INFO });
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".worktree-dialog-preview-path").text()).toBe("/home/me/.sodashitsu/worktrees/soda/worktree-brave-river-0000");

    await wrapper.get(".worktree-dialog-input").setValue("issue/137 Spaces");
    expect(wrapper.get(".worktree-dialog-preview-path").text()).toBe("/home/me/.sodashitsu/worktrees/soda/issue-137-spaces");
  });

  it("確定すると入力したブランチ名を渡す（AC3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: INFO });
    await wrapper.vm.$nextTick();
    await wrapper.get(".worktree-dialog-input").setValue("feature/x");
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmWorktreeCreate).toHaveBeenCalledWith("feature/x");
  });

  it("空では確定できない（ボタンが無効で、submit しても呼ばない。AC3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: INFO });
    await wrapper.vm.$nextTick();
    await wrapper.get(".worktree-dialog-input").setValue("   ");
    expect(wrapper.get('button[type="submit"]').attributes("disabled")).toBeDefined();
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmWorktreeCreate).not.toHaveBeenCalled();
  });

  it("Esc（ネイティブの cancel）で閉じ、何も作らない（AC-I1・AC-I2）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: INFO });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("cancel");
    expect(view.dialogContext).toBeNull();
    expect(actions.confirmWorktreeCreate).not.toHaveBeenCalled();
  });
});
