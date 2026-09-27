import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceGroup } from "@sodashitsu/protocol";
import { ActionDispatcherKey } from "../injection.js";
import { useViewStore } from "../store/view.js";
import GroupPickerDialog from "./GroupPickerDialog.vue";

let pinia: Pinia;
beforeEach(() => {
  pinia = createPinia();
});

const GROUPS: WorkspaceGroup[] = [
  { id: "g1", label: "backend", collapsed: false },
  { id: "g2", label: "frontend", collapsed: true },
  { id: "g3", label: "infra", collapsed: false },
];

function makeActions() {
  return { confirmAddToGroup: vi.fn() };
}

function mountDialog(actions: ReturnType<typeof makeActions>) {
  return mount(GroupPickerDialog, {
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } },
    attachTo: document.body,
  });
}

async function open(wrapper: ReturnType<typeof mountDialog>, view: ReturnType<typeof useViewStore>): Promise<void> {
  view.openDialogWithContext({ kind: "addToGroup", workspaceId: "w1", groups: GROUPS });
  await wrapper.vm.$nextTick();
}

// 20260923-workspace-grouping。`WorktreeOpenDialog.test.ts` をそのまま踏襲する。
describe("GroupPickerDialog", () => {
  it("グループ名を並べる", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    await open(wrapper, view);
    const items = wrapper.findAll(".group-picker-dialog-item");
    expect(items.map((li) => li.text())).toEqual(["backend", "frontend", "infra"]);
  });

  it("↑↓ で選べて、Enter で選んだものを渡す（AC-I3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const list = wrapper.get('[role="listbox"]');
    await list.trigger("keydown", { key: "ArrowDown" });
    await list.trigger("keydown", { key: "Enter" });
    expect(actions.confirmAddToGroup).toHaveBeenCalledWith("g2");
  });

  it("上端で ↑ を押すと末尾へ回る", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const list = wrapper.get('[role="listbox"]');
    await list.trigger("keydown", { key: "ArrowUp" });
    await list.trigger("keydown", { key: "Enter" });
    expect(actions.confirmAddToGroup).toHaveBeenCalledWith("g3");
  });

  it("クリックでも選んで確定する", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    await wrapper.findAll(".group-picker-dialog-item")[2]!.trigger("click");
    expect(actions.confirmAddToGroup).toHaveBeenCalledWith("g3");
  });

  it("Esc で閉じ、何も確定しない（AC-I1・AC-I2）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    await wrapper.get('[role="listbox"]').trigger("keydown", { key: "Escape" });
    expect(view.dialogContext).toBeNull();
    expect(actions.confirmAddToGroup).not.toHaveBeenCalled();
  });

  it("一覧の外（ダイアログ自身）で押したキーでも選択が動く（AC-I3）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    await open(wrapper, view);
    const dialog = wrapper.get("dialog");
    await dialog.trigger("keydown", { key: "ArrowDown" });
    await dialog.trigger("keydown", { key: "Enter" });
    expect(actions.confirmAddToGroup).toHaveBeenCalledWith("g2");
  });

  it("選択中の項目に aria-selected が付く", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    await open(wrapper, view);
    const items = wrapper.findAll(".group-picker-dialog-item");
    expect(items[0]!.attributes("aria-selected")).toBe("true");
    expect(items[1]!.attributes("aria-selected")).toBe("false");
  });

  it("対象外の dialogContext では閉じたまま", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries: [] });
    await wrapper.vm.$nextTick();
    expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(false);
  });
});
