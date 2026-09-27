import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorktreeEntry } from "@sodashitsu/protocol";
import { ActionDispatcherKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import WorktreeOpenDialog from "./WorktreeOpenDialog.vue";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
});

const ENTRIES: WorktreeEntry[] = [
  { path: "/repo", branch: "main" },
  { path: "/w/feature", branch: "feature/x" },
  { path: "/w/detached", branch: null },
];

function makeActions() {
  return { confirmWorktreeOpen: vi.fn(), removeWorktree: vi.fn() };
}

function mountDialog(actions: ReturnType<typeof makeActions>) {
  return mount(WorktreeOpenDialog, {
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } },
    attachTo: document.body,
  });
}

async function open(wrapper: ReturnType<typeof mountDialog>, view: ReturnType<typeof useViewStore>): Promise<void> {
  view.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries: ENTRIES });
  await wrapper.vm.$nextTick();
}

describe("WorktreeOpenDialog（20260920-git-worktree-actions）", () => {
  it("ブランチ名とパスを並べ、detached は (detached) と出す（AC4）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    await open(wrapper, view);
    const items = wrapper.findAll(".worktree-open-dialog-item");
    expect(items.map((li) => li.get(".worktree-open-dialog-branch").text())).toEqual(["main", "feature/x", "(detached)"]);
    expect(items[1]!.get(".worktree-open-dialog-path").text()).toBe("/w/feature");
  });

  it("↑↓ で選べて、Enter で選んだものを渡す（AC5・AC-I3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const list = wrapper.get('[role="listbox"]');
    await list.trigger("keydown", { key: "ArrowDown" });
    await list.trigger("keydown", { key: "Enter" });
    expect(actions.confirmWorktreeOpen).toHaveBeenCalledWith("/w/feature");
  });

  it("上端で ↑ を押すと末尾へ回る", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const list = wrapper.get('[role="listbox"]');
    await list.trigger("keydown", { key: "ArrowUp" });
    await list.trigger("keydown", { key: "Enter" });
    expect(actions.confirmWorktreeOpen).toHaveBeenCalledWith("/w/detached");
  });

  it("クリックでも選んで確定する（AC5）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    await wrapper.findAll(".worktree-open-dialog-item")[2]!.trigger("click");
    expect(actions.confirmWorktreeOpen).toHaveBeenCalledWith("/w/detached");
  });

  it("Esc で閉じ、何も開かない（AC-I1・AC-I2）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    await wrapper.get('[role="listbox"]').trigger("keydown", { key: "Escape" });
    expect(view.dialogContext).toBeNull();
    expect(actions.confirmWorktreeOpen).not.toHaveBeenCalled();
  });

  // review ラウンド1：キー処理は `<ul>` ではなく `<dialog>` で受ける（`GotoPicker` / `HelpDialog` と同じ）。
  // `<ul>` に付けていると、見出しなど focusable でない所をクリックした時点で焦点が外れ、以後 ↑↓/Enter が
  // 届かなくなる。**`<dialog>` 自身で起きた keydown は `<ul>` のハンドラには降りてこない**ので、
  // これが「どちらに付いているか」を分ける判定になる。
  it("一覧の外（ダイアログ自身）で押したキーでも選択が動く（AC-I3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const dialog = wrapper.get("dialog");
    await dialog.trigger("keydown", { key: "ArrowDown" });
    await dialog.trigger("keydown", { key: "Enter" });
    expect(actions.confirmWorktreeOpen).toHaveBeenCalledWith("/w/feature");
  });

  it("選択中の項目に aria-selected が付く", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    await open(wrapper, view);
    const items = wrapper.findAll(".worktree-open-dialog-item");
    expect(items[0]!.attributes("aria-selected")).toBe("true");
    expect(items[1]!.attributes("aria-selected")).toBe("false");
  });
});

// 20260924-worktree-remove。
describe("WorktreeOpenDialog — 削除", () => {
  it("削除ボタンで removeWorktree(workspaceId, path) を呼ぶ（AC1）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    await wrapper.findAll(".worktree-open-dialog-delete")[1]!.trigger("click");
    expect(actions.removeWorktree).toHaveBeenCalledWith("w1", "/w/feature");
    expect(actions.confirmWorktreeOpen).not.toHaveBeenCalled(); // クリックの伝播で「開く」が誤発火しない（AC-I5）
  });

  it("削除ボタンのクリックは行の「開く」へ伝播しない（@click.stop。AC-I5）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const button = wrapper.findAll(".worktree-open-dialog-delete")[0]!;
    await button.trigger("click");
    expect(actions.removeWorktree).toHaveBeenCalledTimes(1);
    expect(actions.confirmWorktreeOpen).not.toHaveBeenCalled();
  });

  it("削除ボタンはタブ順に乗らない（tabindex=-1。キーボードは Delete/Backspace に一本化）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    await open(wrapper, view);
    for (const button of wrapper.findAll(".worktree-open-dialog-delete")) {
      expect(button.attributes("tabindex")).toBe("-1");
    }
  });

  it("Delete キーで、選択中の項目を削除する（AC-I3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const dialog = wrapper.get("dialog");
    await dialog.trigger("keydown", { key: "ArrowDown" }); // /w/feature を選ぶ
    await dialog.trigger("keydown", { key: "Delete" });
    expect(actions.removeWorktree).toHaveBeenCalledWith("w1", "/w/feature");
  });

  it("Backspace キーでも同様に削除する", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    await wrapper.get("dialog").trigger("keydown", { key: "Backspace" }); // 先頭（既定選択）
    expect(actions.removeWorktree).toHaveBeenCalledWith("w1", "/repo");
  });

  it("Delete/Backspace は既存の ↑↓/Enter/Escape と衝突しない（回帰確認）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const dialog = wrapper.get("dialog");
    await dialog.trigger("keydown", { key: "ArrowDown" });
    await dialog.trigger("keydown", { key: "ArrowUp" });
    await dialog.trigger("keydown", { key: "Enter" });
    expect(actions.confirmWorktreeOpen).toHaveBeenCalledWith("/repo"); // 選択が正しく先頭へ戻っている
    expect(actions.removeWorktree).not.toHaveBeenCalled();
  });
});
