import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import NameDialog from "./NameDialog.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
});

function makeActions() {
  return {
    confirmNewTab: vi.fn(),
    confirmRenamePane: vi.fn(),
    confirmRenameTab: vi.fn(),
    confirmRenameWorkspace: vi.fn(),
    // 20260923-workspace-grouping。
    confirmCreateGroup: vi.fn(),
    confirmRenameGroup: vi.fn(),
  };
}

function mountDialog(actions: ReturnType<typeof makeActions>) {
  return mount(NameDialog, {
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } },
    attachTo: document.body,
  });
}

describe("NameDialog — 表示と入力初期値", () => {
  it("newTab は tab の数＋1 を入力済みにする（D55 の 12）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ id: "w1", label: "w1", cwd: "/", tabIds: ["t1", "t2"], activeTabId: "t1", groupId: null, git: null, autoLabel: false });
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const input = wrapper.get("input").element as HTMLInputElement;
    expect(input.value).toBe("3");
    expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(true);
  });

  it("renamePane/renameTab/renameWorkspace は今の名前を入力済みにする", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "my pane" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("my pane");
  });

  it("全選択で開く（selectionStart/selectionEnd が全体を覆う）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "renameTab", tabId: "t1", currentLabel: "abc" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const input = wrapper.get("input").element as HTMLInputElement;
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);
  });

  // 20260923-workspace-grouping。
  it("createGroup は空から始まり、renameGroup は今の名前を入力済みにする", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "createGroup", workspaceId: "w1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("");

    view.openDialogWithContext({ kind: "renameGroup", groupId: "g1", currentLabel: "backend" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("backend");
  });

  it("対象外の dialogContext（confirmClose 等）では閉じたまま", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(false);
  });
});

describe("NameDialog — 確定・取り消し", () => {
  it("Enter（submit）で該当する confirm* を呼ぶ（newTab）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ id: "w1", label: "w1", cwd: "/", tabIds: [], activeTabId: "", groupId: null, git: null, autoLabel: false });
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    await wrapper.get("input").setValue("build");
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmNewTab).toHaveBeenCalledWith("build");
  });

  it("newTab はプリフィルのまま変更せず確定すると、confirmNewTab に空文字を渡す（herdr overlay_input.rs 971 行。D75）", async () => {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ id: "w1", label: "w1", cwd: "/", tabIds: ["t1", "t2"], activeTabId: "t1", groupId: null, git: null, autoLabel: false });
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe("3");
    await wrapper.get("form").trigger("submit"); // 何も編集せずそのまま確定
    expect(actions.confirmNewTab).toHaveBeenCalledWith("");
  });

  it("Enter（submit）で該当する confirm* を呼ぶ（renamePane/renameTab/renameWorkspace）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);

    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "x" });
    await wrapper.vm.$nextTick();
    await wrapper.get("input").setValue("new-name");
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmRenamePane).toHaveBeenCalledWith("new-name");

    view.openDialogWithContext({ kind: "renameTab", tabId: "t1", currentLabel: "x" });
    await wrapper.vm.$nextTick();
    await wrapper.get("input").setValue("new-tab-name");
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmRenameTab).toHaveBeenCalledWith("new-tab-name");

    view.openDialogWithContext({ kind: "renameWorkspace", workspaceId: "w1", currentLabel: "x", currentAutoLabel: false });
    await wrapper.vm.$nextTick();
    await wrapper.get("input").setValue("new-ws-name");
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmRenameWorkspace).toHaveBeenCalledWith("new-ws-name");
  });

  // 20260923-workspace-grouping。
  it("Enter（submit）で該当する confirm* を呼ぶ（createGroup/renameGroup）", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);

    view.openDialogWithContext({ kind: "createGroup", workspaceId: "w1" });
    await wrapper.vm.$nextTick();
    await wrapper.get("input").setValue("backend");
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmCreateGroup).toHaveBeenCalledWith("backend");

    view.openDialogWithContext({ kind: "renameGroup", groupId: "g1", currentLabel: "backend" });
    await wrapper.vm.$nextTick();
    await wrapper.get("input").setValue("frontend");
    await wrapper.get("form").trigger("submit");
    expect(actions.confirmRenameGroup).toHaveBeenCalledWith("frontend");
  });

  it("キャンセルボタンで取り消し、confirm* を呼ばずに閉じて元の pane へフォーカスを戻す", async () => {
    const view = useViewStore(pinia);
    view.focusPane("p0");
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "x" });
    view.focusPane(null); // ダイアログが開いている間に DOM フォーカスが移った状態を模す
    await wrapper.vm.$nextTick();
    await wrapper.get("button[type=button]").trigger("click");
    expect(actions.confirmRenamePane).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
    expect(view.focusedPaneId).toBe("p0");
  });

  it("Esc（dialog の cancel イベント）で取り消す", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "x" });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("cancel");
    expect(actions.confirmRenamePane).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });

  it("外側（backdrop）のクリックで取り消す", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "x" });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("click"); // dialog 要素自身へのクリック＝backdrop クリック相当
    expect(actions.confirmRenamePane).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });
});

// 20260921-workspace-auto-label：手掛かりは workspace の名前を変えるときだけ（tab・pane の見た目は変えない。design D8）。
describe("NameDialog — workspace の自動の名前の手掛かり", () => {
  it("workspace のときだけ、空で確定すると自動の名前に戻ることを入力欄に結んで示す。自動の名前ならそれも添える", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "renameWorkspace", workspaceId: "w1", currentLabel: "my-repo", currentAutoLabel: true });
    await wrapper.vm.$nextTick();
    const hint = wrapper.get("#name-dialog-hint");
    expect(hint.text()).toContain("空にして確定すると、自動の名前");
    expect(hint.text()).toContain("いまは自動の名前です");
    expect(wrapper.get("input").attributes("aria-describedby")).toBe("name-dialog-hint");

    view.closeDialog();
    view.openDialogWithContext({ kind: "renameWorkspace", workspaceId: "w1", currentLabel: "mine", currentAutoLabel: false });
    await wrapper.vm.$nextTick();
    expect(wrapper.get("#name-dialog-hint").text()).not.toContain("いまは自動の名前です");

    for (const ctx of [
      { kind: "renameTab" as const, tabId: "t1", currentLabel: "1" },
      { kind: "renamePane" as const, paneId: "p1", currentLabel: "" },
      { kind: "newTab" as const, workspaceId: "w1" },
    ]) {
      view.closeDialog();
      view.openDialogWithContext(ctx);
      await wrapper.vm.$nextTick();
      expect(wrapper.find("#name-dialog-hint").exists(), `${ctx.kind} には出さない`).toBe(false);
      expect(wrapper.get("input").attributes("aria-describedby")).toBeUndefined();
    }
  });
});

it("keeps browser viewers out of the work tab kind picker", async () => {
  const view = useViewStore(pinia), actions = makeActions(), wrapper = mountDialog(actions);
  view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
  await wrapper.vm.$nextTick(); await wrapper.vm.$nextTick();
  const options = wrapper.get("select").text();
  for (const label of ["Webプレビュー", "デスクトップ", "VSCode"]) expect(options).not.toContain(label);
  wrapper.unmount();
});
