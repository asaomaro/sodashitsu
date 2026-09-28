import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Workspace } from "@sodashitsu/protocol";
import { ActionDispatcherKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import ConfirmDialog from "./ConfirmDialog.vue";

let pinia: Pinia;

beforeEach(() => {
  pinia = createPinia();
});

function makeWorkspace(id: string, overrides: Partial<Workspace> = {}): Workspace {
  return { id, label: id, cwd: `/${id}`, tabIds: [], activeTabId: "", groupId: null, git: null, autoLabel: false, ...overrides };
}

function makeActions() {
  return {
    confirmClose: vi.fn(),
    confirmReplacePane: vi.fn(),
    confirmWorktreeRemove: vi.fn(),
    confirmWorktreeRemoveForce: vi.fn(),
    openWorktree: vi.fn(),
    confirmStopServer: vi.fn(),
  };
}

function mountDialog(actions: ReturnType<typeof makeActions>) {
  return mount(ConfirmDialog, {
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } },
    attachTo: document.body,
  });
}

describe("ConfirmDialog — 表示", () => {
  it("role=alertdialog を持ち、開いたら最初のフォーカスは「キャンセル」", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    expect(dialog.getAttribute("role")).toBe("alertdialog");
    expect(dialog.open).toBe(true);
    const cancelBtn = wrapper.findAll("button")[0]!.element;
    expect(document.activeElement).toBe(cancelBtn);
  });

  it("対象外の dialogContext では閉じたまま", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "x" });
    await wrapper.vm.$nextTick();
    expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(false);
  });
});

describe("ConfirmDialog — 確定・取り消し", () => {
  it("「閉じる」ボタンで confirmClose を呼ぶ", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmClose).toHaveBeenCalledTimes(1);
  });

  it("「キャンセル」ボタンで取り消し、confirmClose を呼ばずに閉じる", async () => {
    const view = useViewStore(pinia);
    view.focusPane("p0");
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(actions.confirmClose).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
    expect(view.focusedPaneId).toBe("p0");
  });

  it("Esc（dialog の cancel イベント）で取り消す", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("cancel");
    expect(actions.confirmClose).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });

  it("外側（backdrop）のクリックで取り消す", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("click");
    expect(actions.confirmClose).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });

  it("y で確定・n で取り消す", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);

    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "tab", id: "t1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("keydown", { key: "n" });
    expect(actions.confirmClose).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();

    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "tab", id: "t1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("keydown", { key: "y" });
    expect(actions.confirmClose).toHaveBeenCalledTimes(1);
  });
});

// 20260923-workspace-grouping（herdr の close_group 相当）。
describe("ConfirmDialog — 束ねた worktree も一緒に閉じる", () => {
  function setUpAutoGroup(): void {
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", { git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false } }));
    session.workspaceUpserted(makeWorkspace("w2", { git: { branch: "feature", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true } }));
  }

  it("対象が worktree 自動グループの本体1件なら、束ねられた件数付きのチェックボックスを出す（既定オフ）", async () => {
    setUpAutoGroup();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
    await wrapper.vm.$nextTick();
    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.exists()).toBe(true);
    expect((checkbox.element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.get(".confirm-dialog-linked-worktrees").text()).toContain("1 件");
  });

  it("チェックを入れて確定すると true を渡す", async () => {
    setUpAutoGroup();
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmClose).toHaveBeenCalledWith(true);
  });

  it("チェックを入れないまま確定すると false を渡す", async () => {
    setUpAutoGroup();
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmClose).toHaveBeenCalledWith(false);
  });

  it("対象が worktree 自動グループの本体でなければチェックボックスを出さない", async () => {
    setUpAutoGroup();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    // w2（linked worktree 自身）を閉じる場合は対象外。
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w2" }] });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it("対象が複数（pane と workspace の混在等）ならチェックボックスを出さない", async () => {
    setUpAutoGroup();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({
      kind: "confirmClose",
      targets: [
        { type: "workspace", id: "w1" },
        { type: "pane", id: "p1" },
      ],
    });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it("開き直すたびにチェック状態を既定オフへ戻す", async () => {
    setUpAutoGroup();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    view.closeDialog();
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
    await wrapper.vm.$nextTick();
    expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false);
  });
});

// 20260924-pane-dnd-split-move（review 指摘 must）：D&D での分割解除がドロップ先の busy な
// pane を確認なしに閉じてしまっていたのを、既存の D23 の安全策と同じダイアログに乗せて直した。
describe("ConfirmDialog — D&D での分割解除の確認（kind: confirmReplacePane）", () => {
  it("busy なドロップ先の確認メッセージを出す", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmReplacePane", paneId: "p1", targetPaneId: "p2" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(wrapper.get(".confirm-dialog-message").text()).toContain("閉じてドラッグした pane に置き換えますか");
  });

  it("「閉じる」ボタンで confirmReplacePane を呼ぶ（confirmClose は呼ばない）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmReplacePane", paneId: "p1", targetPaneId: "p2" });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmReplacePane).toHaveBeenCalledTimes(1);
    expect(actions.confirmClose).not.toHaveBeenCalled();
  });

  it("linked worktree のチェックボックスは出ない（workspace 対象ではないため）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmReplacePane", paneId: "p1", targetPaneId: "p2" });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it("y キーで confirmReplacePane を呼ぶ", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmReplacePane", paneId: "p1", targetPaneId: "p2" });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("keydown", { key: "y" });
    expect(actions.confirmReplacePane).toHaveBeenCalledTimes(1);
  });
});

// 20260924-worktree-remove。
describe("ConfirmDialog — worktree の削除の確認（kind: confirmWorktreeRemove / confirmWorktreeRemoveForce）", () => {
  it("開いていない worktree なら「開いています」に触れないメッセージ", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".confirm-dialog-message").text()).toBe("この worktree を削除しますか？");
  });

  it("開いている workspace と一致すれば、閉じることに触れたメッセージになる（AC4）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w9" });
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".confirm-dialog-message").text()).toContain("workspace を閉じて worktree を削除しますか");
  });

  it("dirty での --force 確認は専用のメッセージ（AC6・AC7）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "dirty" });
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".confirm-dialog-message").text()).toContain("未コミットの変更が残っています");
  });

  // 20260925-worktree-remove-locked。
  it("ロック済みでの --force 確認は「ロックされています」を含む専用のメッセージ（AC5）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "locked" });
    await wrapper.vm.$nextTick();
    expect(wrapper.get(".confirm-dialog-message").text()).toContain("ロックされています");
    expect(wrapper.get(".confirm-dialog-message").text()).not.toContain("未コミットの変更が残っています");
  });

  it("確定ボタンの文言は「削除」——「閉じる」のままだと破壊的操作に見えない（decisions.md D1）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("button")[1]!.text()).toBe("削除");
  });

  it("confirmClose の確定ボタンは従来どおり「閉じる」のまま（回帰確認）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("button")[1]!.text()).toBe("閉じる");
  });

  it("role=alertdialog で開き、最初のフォーカスは「キャンセル」（AC-I4）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    const dialog = wrapper.get("dialog").element as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(wrapper.findAll("button")[0]!.element);
  });

  it("チェックボックス（束ねた worktree）は出ない——worktree 削除は workspace 対象ではない", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);
  });

  it("「削除」ボタンで confirmWorktreeRemove を呼ぶ（AC-I2）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmWorktreeRemove).toHaveBeenCalledTimes(1);
    expect(actions.confirmWorktreeRemoveForce).not.toHaveBeenCalled();
  });

  it("「削除」ボタン（--force 確認側）で confirmWorktreeRemoveForce を呼ぶ（AC8）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "dirty" });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmWorktreeRemoveForce).toHaveBeenCalledTimes(1);
    expect(actions.confirmWorktreeRemove).not.toHaveBeenCalled();
  });

  // 20260925-worktree-remove-locked。reason: "locked" でも確定・キーボード・初期フォーカスの
  // 配線（AC-I2・AC-I3・AC-I4）は reason: "dirty" と同じであることを確認する（メッセージだけが
  // 変わる。message の内容自体は上の別テストで確認済みなので、ここでは配線だけを見る）。
  it("reason: locked でも「削除」ボタンで confirmWorktreeRemoveForce を呼ぶ（AC-I2）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "locked" });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmWorktreeRemoveForce).toHaveBeenCalledTimes(1);
  });

  it("reason: locked でも y キーで確定する（AC-I3）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "locked" });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("keydown", { key: "y" });
    expect(actions.confirmWorktreeRemoveForce).toHaveBeenCalledTimes(1);
  });

  // taskcheck の should 指摘：上のテスト名が「y キーで確定・n キーで取り消す」だったのに n を
  // 一度もトリガーしておらず、見せかけの検証だった（T6 taskcheck round1）。ここで n を別途検証する。
  it("reason: locked でも n キーで取り消す（一覧へ戻る。AC-I3）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "locked" });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("keydown", { key: "n" });
    expect(actions.confirmWorktreeRemoveForce).not.toHaveBeenCalled();
    expect(actions.openWorktree).toHaveBeenCalledWith("w1");
  });

  it("reason: locked でも最初のフォーカスは「キャンセル」（AC-I4）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "locked" });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(document.activeElement).toBe(wrapper.findAll("button")[0]!.element);
  });

  it("「キャンセル」ボタンは削除を送らず、一覧ダイアログへ戻る（openWorktree を呼ぶ。AC-I1・AC-I2）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(actions.confirmWorktreeRemove).not.toHaveBeenCalled();
    expect(actions.openWorktree).toHaveBeenCalledWith("w1");
  });

  it("Esc（dialog の cancel イベント）でも一覧ダイアログへ戻る", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w2", path: "/w/b", openWorkspaceId: null, reason: "dirty" });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("cancel");
    expect(actions.confirmWorktreeRemoveForce).not.toHaveBeenCalled();
    expect(actions.openWorktree).toHaveBeenCalledWith("w2");
  });

  it("y で削除を確定・n でキャンセル（一覧へ戻る）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    const wrapper = mountDialog(actions);

    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("keydown", { key: "n" });
    expect(actions.confirmWorktreeRemove).not.toHaveBeenCalled();
    expect(actions.openWorktree).toHaveBeenCalledWith("w1");

    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    await wrapper.vm.$nextTick();
    await wrapper.get("dialog").trigger("keydown", { key: "y" });
    expect(actions.confirmWorktreeRemove).toHaveBeenCalledTimes(1);
  });

  it("confirmClose の「キャンセル」は openWorktree を呼ばず、ただ閉じる（回帰確認）", async () => {
    const actions = makeActions();
    const view = useViewStore(pinia);
    view.focusPane("p0");
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(actions.openWorktree).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });

  it("closeOnCancel の --force の確認も、取り消すと一覧へ戻らずに閉じる", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w1", reason: "dirty", closeOnCancel: true });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(actions.openWorktree).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });
});

// 20260927-cli-mode（design D-7）。
describe("ConfirmDialog — サーバの停止・キーからの worktree の削除", () => {
  it("confirmStopServer: 文言と「止める」ボタン。確定で confirmStopServer、取り消しは閉じるだけ", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmStopServer", target: "devbox", remote: false });
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect((wrapper.get("dialog").element as HTMLDialogElement).open).toBe(true);
    expect(wrapper.text()).toContain("このマシン（devbox）の soda serve を止めますか");
    expect(wrapper.findAll("button")[1]!.text()).toBe("止める");
    await wrapper.findAll("button")[1]!.trigger("click");
    expect(actions.confirmStopServer).toHaveBeenCalledTimes(1);
    view.openDialogWithContext({ kind: "confirmStopServer", target: "devbox", remote: false });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(view.dialogContext).toBeNull();
    expect(actions.openWorktree).not.toHaveBeenCalled();
  });

  it("confirmStopServer: 保存したマシンを向いていれば、そのマシンの名前で確かめる（02 の review）", async () => {
    const view = useViewStore(pinia);
    const wrapper = mountDialog(makeActions());
    view.openDialogWithContext({ kind: "confirmStopServer", target: "GPU", remote: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("保存したマシン「GPU」の soda serve を止めますか");
  });

  it("closeOnCancel の worktree の削除は、取り消すと一覧へ戻らずに閉じる", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w1", closeOnCancel: true });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(actions.openWorktree).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });

  it("closeOnCancel の --force の確認も、取り消すと一覧へ戻らずに閉じる", async () => {
    const view = useViewStore(pinia);
    const actions = makeActions();
    const wrapper = mountDialog(actions);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w1", reason: "dirty", closeOnCancel: true });
    await wrapper.vm.$nextTick();
    await wrapper.findAll("button")[0]!.trigger("click");
    expect(actions.openWorktree).not.toHaveBeenCalled();
    expect(view.dialogContext).toBeNull();
  });
});
