import { describe, expect, it, vi } from "vitest";
import {
  chordToKeyInput,
  loadKeyPrefs,
  resolveKeymap,
  resolveNavigateKeymap,
  type KeyInput,
} from "@sodashitsu/client-core";
import type { SessionSnapshot } from "@sodashitsu/protocol";
import { TuiDispatcher, type DispatcherHost } from "../actions/TuiDispatcher.js";
import { PrefsModel } from "../model/PrefsModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { ThemeColors } from "../render/color.js";
import { Grid } from "../render/Screen.js";
import { stringWidth } from "../render/width.js";
import { pane, snapshot, workspace } from "../testing/fixtures.js";
import { filterHelp, helpGroups } from "./HelpDialog.js";
import { OverlayHost } from "./OverlayHost.js";

function key(chord: string): KeyInput {
  return chordToKeyInput(chord);
}
const ch = (c: string): KeyInput => ({
  key: c,
  code: "",
  ctrl: false,
  alt: false,
  shift: false,
  meta: false,
  type: "keydown",
  composing: false,
});

function setup(snap: SessionSnapshot = snapshot(), responses: Record<string, unknown> = {}) {
  const calls: [string, unknown][] = [];
  const model = new SessionModel();
  model.applySnapshot(snap, "c1");
  const ui = new UiState(model, () => undefined);
  const prefs = new PrefsModel();
  const host: DispatcherHost = {
    model,
    ui,
    prefs,
    conn: {
      request: ((m: string, p: unknown) => {
        calls.push([m, p]);
        return Promise.resolve(responses[m] ?? {});
      }) as DispatcherHost["conn"]["request"],
    },
    keys: { setMode: () => undefined },
    copyTarget: () => undefined,
    writeClipboard: async () => true,
    readClipboard: async () => null,
    pasteText: vi.fn(),
    detach: vi.fn(),
    toggleSidebar: vi.fn(),
    focusNextNotification: vi.fn(),
    runCommand: vi.fn(),
    pasteImage: vi.fn(),
  };
  const actions = new TuiDispatcher(host);
  const keyPrefs = loadKeyPrefs(undefined);
  const overlays = new OverlayHost({
    ui,
    model,
    actions,
    helpGroups: () =>
      helpGroups(
        resolveKeymap(keyPrefs).keymap,
        resolveNavigateKeymap(keyPrefs.navigateKeys).keymap,
      ),
  });
  const theme = new ThemeColors("dracula");
  const screen = (): string => {
    const g = new Grid(100, 30);
    overlays.render(g, theme);
    return Array.from({ length: 30 }, (_, y) => g.rowText(y)).join("\n");
  };
  const type = (s: string) => {
    for (const c of s) overlays.handleKey(ch(c));
  };
  return { model, ui, prefs, actions, overlays, calls, screen, type, host };
}

describe("名前の入力欄（AC-I2）", () => {
  it("今の名前で開き、編集して Enter で確定。開く前の pane へ焦点が戻る", () => {
    const s = setup(
      snapshot({ panes: [pane("p1", "t1", { label: "old" }), pane("p2", "t1"), pane("p3", "t2")] }),
    );
    s.actions.run({ type: "renamePane" });
    expect(s.overlays.active).toBe(true);
    expect(s.screen()).toContain("pane の名前を変更");
    expect(s.screen()).toContain("old");
    for (let i = 0; i < 3; i++) s.overlays.handleKey(key("backspace"));
    s.type("新しい");
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toEqual([["pane.rename", { paneId: "p1", label: "新しい" }]]);
    expect(s.overlays.active).toBe(false);
    expect(s.model.focusedPaneId).toBe("p1");
  });

  it("Esc で取り消すと何も送らない。貼り付けは改行を空白にして入る", () => {
    const s = setup();
    s.actions.run({ type: "renameTab" });
    s.overlays.handlePaste("a\nb");
    expect(s.screen()).toContain("t1a b");
    s.overlays.handleKey(key("esc"));
    expect(s.calls).toEqual([]);
    expect(s.ui.dialogContext).toBeNull();
  });

  it("新しい tab：既定の名前（tab の数＋1）のまま確定したら名前を送らない", () => {
    const s = setup();
    s.actions.run({ type: "newTab" });
    expect(s.screen()).toContain("2");
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toEqual([
      ["tab.create", { workspaceId: "w1", newCwd: { policy: "follow", sourcePaneId: "p1" } }],
    ]);
  });

  it("workspace の名前：自動の名前のときの手掛かりを出す", () => {
    const s = setup(
      snapshot({
        workspaces: [workspace("w1", ["t1"], { autoLabel: true }), workspace("w2", ["t2"])],
      }),
    );
    s.actions.run({ type: "renameWorkspace" });
    expect(s.screen()).toContain("いまは自動の名前です。");
  });
});

describe("確認", () => {
  const busy = () =>
    snapshot({ panes: [pane("p1", "t1", { busy: true }), pane("p2", "t1"), pane("p3", "t2")] });

  it("文言と「キャンセル」が選ばれた状態で開き、Enter は取り消し。y で確定", () => {
    const s = setup(busy());
    s.actions.run({ type: "closePane" });
    expect(s.screen()).toContain("閉じますか？（pane）");
    expect(s.screen()).toContain("[ キャンセル ]");
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toEqual([]);
    expect(s.ui.dialogContext).toBeNull();
    s.actions.run({ type: "closePane" });
    s.overlays.handleKey(ch("y"));
    expect(s.calls).toEqual([["pane.close", { paneId: "p1" }]]);
  });

  it("→ で確定ボタンへ移って Enter。n・Esc で取り消し", () => {
    const s = setup(busy());
    s.actions.run({ type: "closePane" });
    s.overlays.handleKey(key("right"));
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toHaveLength(1);
    s.actions.run({ type: "closePane" });
    s.overlays.handleKey(ch("n"));
    s.actions.run({ type: "closePane" });
    s.overlays.handleKey(key("esc"));
    expect(s.calls).toHaveLength(1);
  });

  it("worktree の自動グループの本体を閉じるときは「束ねた worktree も一緒に閉じる」を Space で切り替えられる", () => {
    const git = (linked: boolean) =>
      ({ branch: "b", repoKey: "/r", isLinkedWorktree: linked }) as never;
    const s = setup(
      snapshot({
        workspaces: [
          workspace("w1", ["t1"], { git: git(false) }),
          workspace("w2", ["t2"], { git: git(true) }),
        ],
      }),
    );
    s.actions.run({ type: "closeWorkspace" });
    expect(s.screen()).toContain("[ ] 束ねた worktree も一緒に閉じる（1 件）");
    s.overlays.handleKey(ch(" "));
    expect(s.screen()).toContain("[x]");
    s.overlays.handleKey(ch("y"));
    expect(s.calls).toEqual([
      ["workspace.close", { workspaceId: "w1", closeLinkedWorktrees: true }],
    ]);
  });

  it("stop_server の確認はこのマシンの名前と「止める」", () => {
    const s = setup();
    s.actions.run({ type: "stopServer" });
    expect(s.screen()).toContain("このマシン（h）の soda serve を止めますか？");
    expect(s.screen()).toContain("[ 止める ]");
  });

  it("外側を押すと取り消し。ボタンの押下で確定", () => {
    const s = setup(busy());
    s.actions.run({ type: "closePane" });
    s.screen();
    s.overlays.handleMouse({ action: "down", button: 0, x: 0, y: 0 });
    expect(s.ui.dialogContext).toBeNull();
    s.actions.run({ type: "closePane" });
    const text = s.screen().split("\n");
    const y = text.findIndex((l) => l.includes("[ 閉じる ]"));
    const x = stringWidth(text[y]!.slice(0, text[y]!.indexOf("[ 閉じる ]")));
    s.overlays.handleMouse({ action: "down", button: 0, x: x + 1, y });
    expect(s.calls).toEqual([["pane.close", { paneId: "p1" }]]);
  });
});

describe("右クリックのメニュー（M3）", () => {
  it("pane の項目（web と同じ）。↓ と Enter で選び、閉じてから実行する", () => {
    const s = setup();
    s.ui.openContextMenu({ kind: "pane", paneId: "p2" }, { x: 10, y: 5 });
    const text = s.screen();
    for (const label of [
      "名前の変更",
      "焦点の pane と入れ替え",
      "右へ分割",
      "下へ分割",
      "拡大表示",
      "右クリックを pane に送る",
      "貼り付け",
      "閉じる",
    ])
      expect(text).toContain(label);
    expect(text).not.toContain("名前の消去");
    s.overlays.handleKey(key("down"));
    s.overlays.handleKey(key("down"));
    s.overlays.handleKey(key("enter"));
    expect(s.ui.contextMenu).toBeNull();
    expect(s.calls[0]).toEqual([
      "pane.split",
      { paneId: "p2", direction: "right", newCwd: { policy: "follow" } },
    ]);
  });

  it("マウス：押して離した項目を実行。開いた右クリックの離す事象では実行しない。外側を押すと閉じる", () => {
    const s = setup();
    s.ui.openContextMenu({ kind: "tab", tabId: "t1" }, { x: 10, y: 5 });
    s.screen();
    s.overlays.handleMouse({ action: "up", button: 2, x: 12, y: 6 });
    expect(s.ui.contextMenu).not.toBeNull();
    s.overlays.handleMouse({ action: "down", button: 0, x: 12, y: 7 });
    s.overlays.handleMouse({ action: "up", button: 0, x: 12, y: 7 });
    expect(s.ui.dialogContext).toEqual({ kind: "renameTab", tabId: "t1", currentLabel: "t1" });
    s.ui.closeDialog();
    s.ui.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    s.screen();
    s.overlays.handleMouse({ action: "down", button: 0, x: 80, y: 20 });
    expect(s.ui.contextMenu).toBeNull();
  });

  it("workspace・group・global の項目", () => {
    const s = setup(snapshot({ groups: [{ id: "g1", label: "G", collapsed: false }] }));
    s.ui.openContextMenu({ kind: "workspace", workspaceId: "w1" }, { x: 0, y: 0 });
    expect(s.screen()).toContain("グループへ追加…");
    expect(s.screen()).not.toContain("新しい worktree");
    s.ui.openContextMenu({ kind: "group", groupId: "g1" }, { x: 0, y: 0 });
    expect(s.screen()).toContain("グループを削除");
    s.ui.openContextMenu({ kind: "global" }, { x: 0, y: 0 });
    expect(s.screen()).toContain("切り離し");
  });
});

describe("キー一覧（ヘルプ）", () => {
  it("群と今の割り当てを出し、helpHidden の操作は出さない", () => {
    const s = setup();
    s.actions.run({ type: "help" });
    const text = s.screen();
    expect(text).toContain("キー一覧");
    expect(text).toContain("prefix+q");
    expect(text).toContain("全体");
    const keyPrefs = loadKeyPrefs(undefined);
    const all = helpGroups(
      resolveKeymap(keyPrefs).keymap,
      resolveNavigateKeymap(keyPrefs.navigateKeys).keymap,
    );
    expect(all.flatMap((g) => g.entries.map((e) => e.label))).not.toContain(
      "焦点の pane と入れ替える",
    );
    expect(filterHelp(all, "prefix+q").flatMap((g) => g.entries.map((e) => e.keys))).toEqual([
      "prefix+q",
    ]);
  });

  it("/ で絞り込み、Esc で絞り込みを消して抜け（閉じない）、もう一度 Esc で閉じる", () => {
    const s = setup();
    s.actions.run({ type: "help" });
    s.type("/");
    s.type("拡大");
    expect(s.screen()).toContain("prefix+z");
    expect(s.screen()).not.toContain("prefix+q");
    s.overlays.handleKey(key("esc"));
    expect(s.ui.dialogContext).toEqual({ kind: "help" });
    expect(s.screen()).toContain("prefix+q");
    s.overlays.handleKey(key("esc"));
    expect(s.ui.dialogContext).toBeNull();
  });
});

describe("一覧（worktree・グループ）", () => {
  const entries = [
    { path: "/wt/a", branch: "a" },
    { path: "/wt/b", branch: null },
  ];
  it("worktree の一覧：↓ Enter で開く・Delete で削除の確認", () => {
    const s = setup(snapshot(), {
      "workspace.create": {
        workspace: workspace("w9", ["t9"]),
        tab: { id: "t9" },
        pane: { id: "p9" },
      },
    });
    s.ui.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries });
    expect(s.screen()).toContain("(detached)");
    s.overlays.handleKey(key("down"));
    s.overlays.handleKey(key("delete"));
    expect(s.ui.dialogContext).toEqual({
      kind: "confirmWorktreeRemove",
      sourceWorkspaceId: "w1",
      path: "/wt/b",
      openWorkspaceId: null,
    });
    s.ui.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries });
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toEqual([["workspace.create", { cwd: "/wt/a", label: "a" }]]);
  });

  it("グループへ追加：Enter で group.add_member", () => {
    const s = setup();
    s.ui.openDialogWithContext({
      kind: "addToGroup",
      workspaceId: "w2",
      groups: [{ id: "g1", label: "G1", collapsed: false }],
    });
    expect(s.screen()).toContain("G1");
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toEqual([["group.add_member", { groupId: "g1", workspaceId: "w2" }]]);
  });

  it("worktree の作成：候補のブランチ名と作成先のプレビュー。空では確定しない", () => {
    const s = setup();
    s.ui.openDialogWithContext({
      kind: "worktreeCreate",
      workspaceId: "w1",
      info: { worktreeRoot: "/wt", repoName: "repo", suggestedBranch: "feat-1", entries: [] },
    });
    expect(s.screen()).toContain("/wt/repo/feat-1");
    s.overlays.handleKey(key("ctrl+u"));
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toEqual([]);
    expect(s.ui.dialogContext?.kind).toBe("worktreeCreate");
  });
});

describe("オーバーレイの点検の指摘（04）", () => {
  it("入力欄は DEL・C1 の制御文字を入れない", () => {
    const s = setup();
    s.actions.run({ type: "renameTab" });
    s.overlays.handleKey(key("ctrl+u"));
    s.overlays.handlePaste("a\x7fb\x85c");
    s.overlays.handleKey(ch("\x7f"));
    s.overlays.handleKey(key("enter"));
    expect(s.calls).toEqual([["tab.rename", { tabId: "t1", label: "abc" }]]);
  });

  it("キー一覧：q では閉じない（web と同じ）。絞り込みの欄は全角の見出しの幅の後ろから（カーソルも）", () => {
    const s = setup();
    s.actions.run({ type: "help" });
    s.type("q");
    expect(s.ui.dialogContext).toEqual({ kind: "help" });
    s.type("/");
    const g = new Grid(100, 30);
    const cur = s.overlays.render(g, new ThemeColors("dracula"));
    // 箱は x=1、内側は x=3。「絞り込み: 」は幅 10。
    expect(cur).toMatchObject({ x: 13, visible: true });
  });

  it("一覧：見えている行の外（下の案内の行）を押しても実行しない", () => {
    const s = setup();
    // 30 行の画面に入りきらない数のグループ：案内の行の位置にも（見えていない）続きの項目がある。
    const groups = Array.from({ length: 40 }, (_, i) => ({
      id: `g${i + 1}`,
      label: `G${i + 1}`,
      collapsed: false,
    }));
    s.ui.openDialogWithContext({ kind: "addToGroup", workspaceId: "w2", groups });
    const text = s.screen().split("\n");
    const helpRow = text.findIndex((l) => l.includes("Enter で追加"));
    s.overlays.handleMouse({ action: "down", button: 0, x: 40, y: helpRow });
    expect(s.calls).toEqual([]);
    const row = text.findIndex((l) => /\bG1\b/.test(l));
    s.overlays.handleMouse({ action: "down", button: 0, x: 40, y: row });
    expect(s.calls).toEqual([["group.add_member", { groupId: "g1", workspaceId: "w2" }]]);
  });

  it("短い端末のメニュー：見える分だけ出し、選んだ項目までずらす（見えない項目を実行しない）", () => {
    const s = setup();
    s.ui.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 0, y: 0 });
    const small = new Grid(40, 6); // 枠を除いて 4 項目
    const theme = new ThemeColors("dracula");
    s.overlays.render(small, theme);
    for (let i = 0; i < 4; i++) s.overlays.handleKey(key("down"));
    s.overlays.render(small, theme); // 1〜4 番目が見え、枠の下の罫線の位置には見えていない 5 番目がある
    // 枠の下の罫線を押しても、見えていない次の項目を実行しない。
    s.overlays.handleMouse({ action: "down", button: 0, x: 3, y: 5 });
    s.overlays.handleMouse({ action: "up", button: 0, x: 3, y: 5 });
    expect(s.calls).toEqual([]);
    for (let i = 0; i < 2; i++) s.overlays.handleKey(key("down"));
    s.overlays.render(small, theme);
    const rows = Array.from({ length: 6 }, (_, y) => small.rowText(y)).join("\n");
    expect(rows).toContain("閉じる"); // 7 番目（0 始まりの 6）が見えている
    expect(rows).not.toContain("名前の変更");
    s.overlays.handleMouse({ action: "down", button: 0, x: 3, y: 1 });
    s.overlays.handleMouse({ action: "up", button: 0, x: 3, y: 1 });
    // いちばん上に見えている項目（拡大表示）を実行した
    expect(s.calls).toEqual([["pane.zoom", { paneId: "p1", mode: "toggle" }]]);
  });
});
