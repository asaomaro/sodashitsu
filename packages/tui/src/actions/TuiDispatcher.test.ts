import { describe, expect, it, vi } from "vitest";
import { ACTIONS, type Action, type ActionDef } from "@sodashitsu/client-core";
import type { SessionSnapshot } from "@sodashitsu/protocol";
import { PrefsModel } from "../model/PrefsModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import { agent, leaf, pane, snapshot, split, tab, workspace } from "../testing/fixtures.js";
import {
  PASTE_UNAVAILABLE,
  TuiDispatcher,
  type CopyTargetPort,
  type DispatcherHost,
} from "./TuiDispatcher.js";

/**
 * `TuiDispatcher` が web の `ActionDispatcher` と同じ RPC・確認・焦点の移り先になることを確かめる（web の `ActionDispatcher.test.ts` の場合を写した）。
 */

type Responder = unknown | ((params: unknown) => unknown);

interface FakeHold {
  source: string | null;
  released: string | null;
  canceled: boolean;
  release(id: string): void;
  cancel(): void;
  discard(): void;
}

function codeError(code: string): Error {
  return Object.assign(new Error(`${code}: x`), { code });
}

function harness(snap: SessionSnapshot = snapshot(), responses: Record<string, Responder> = {}) {
  const calls: [string, unknown][] = [];
  const conn = {
    request: ((method: string, params: unknown) => {
      calls.push([method, params]);
      const r = responses[method];
      try {
        const v = typeof r === "function" ? (r as (p: unknown) => unknown)(params) : r;
        if (v instanceof Error) return Promise.reject(v);
        return Promise.resolve(v ?? {});
      } catch (err) {
        return Promise.reject(err);
      }
    }) as DispatcherHost["conn"]["request"],
  };
  const model = new SessionModel();
  model.applySnapshot(snap, "c1");
  const ui = new UiState(model, () => undefined);
  const prefs = new PrefsModel();
  const holds: FakeHold[] = [];
  const modes: string[] = [];
  const copy: CopyTargetPort & {
    cmds: unknown[];
    resets: number;
    next: { copiedText?: string; exited?: boolean };
  } = {
    cmds: [],
    resets: 0,
    next: {},
    apply(cmd) {
      this.cmds.push(cmd);
      return this.next;
    },
    resetCursor() {
      this.resets++;
    },
  };
  const host = {
    model,
    ui,
    prefs,
    conn,
    input: {
      holdInput: (source: string | null) => {
        const h: FakeHold = {
          source,
          released: null,
          canceled: false,
          release(id) {
            h.released = id;
          },
          cancel() {
            h.canceled = true;
          },
          discard: () => undefined,
        };
        holds.push(h);
        return h;
      },
    },
    keys: { setMode: (m: string) => void modes.push(m) },
    copyTarget: () => copy,
    writeClipboard: vi.fn(async () => true),
    readClipboard: vi.fn(async (): Promise<string | null> => "clip"),
    pasteText: vi.fn(),
    detach: vi.fn(),
    toggleSidebar: vi.fn(),
    setCommands: vi.fn(),
    focusNextNotification: vi.fn(),
    runCommand: vi.fn(),
    pasteImage: vi.fn(),
  } satisfies DispatcherHost;
  const d = new TuiDispatcher(host);
  const sent = (method: string) => calls.filter((c) => c[0] === method).map((c) => c[1]);
  return { d, calls, sent, model, ui, prefs, holds, modes, copy, host };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

/**
 * 全操作（カタログの 56 操作。添字つきは 1）の効果の表。**web の `ActionDispatcher` の同じ操作と同じ RPC・引数・ダイアログ**（焦点は p1・w1/t1〔p1|p2〕・w2/t2〔p3〕）。
 * 表に無い操作があれば落ちる（足し忘れの検出）。
 */
const EFFECTS: Record<
  string,
  {
    rpc?: [string, unknown];
    dialog?: string;
    host?: Exclude<keyof DispatcherHost, "machines" | "prefsConn" | "pasteClipboard">;
    none?: true;
    mode?: true;
    toast?: true;
  }
> = {
  help: { dialog: "help" },
  detach: { host: "detach" },
  settings: { dialog: "settings" },
  open_notification_target: { host: "focusNextNotification" },
  reload_config: { rpc: ["prefs.get", {}] },
  stop_server: { dialog: "confirmStopServer" },
  workspace_picker: { mode: true },
  goto: { dialog: "goto" },
  new_workspace: {
    rpc: ["workspace.create", { newCwd: { policy: "follow", sourcePaneId: "p1" } }],
  },
  rename_workspace: { dialog: "renameWorkspace" },
  close_workspace: { dialog: "confirmClose" },
  new_worktree: { rpc: ["worktree.list", { workspaceId: "w1" }] },
  new_tab: { dialog: "newTab" },
  next_tab: { rpc: ["tab.focus", { tabId: "t1" }] },
  previous_tab: { rpc: ["tab.focus", { tabId: "t1" }] },
  switch_tab: { rpc: ["tab.focus", { tabId: "t1" }] },
  rename_tab: { dialog: "renameTab" },
  close_tab: { rpc: ["tab.close", { tabId: "t1" }] },
  previous_workspace: { rpc: ["workspace.focus", { workspaceId: "w2" }] },
  next_workspace: { rpc: ["workspace.focus", { workspaceId: "w2" }] },
  move_tab_previous: { rpc: ["tab.move", { tabId: "t1", direction: "previous" }] },
  move_tab_next: { rpc: ["tab.move", { tabId: "t1", direction: "next" }] },
  move_workspace_previous: {
    rpc: ["workspace.move", { workspaceId: "w1", direction: "previous" }],
  },
  move_workspace_next: { rpc: ["workspace.move", { workspaceId: "w1", direction: "next" }] },
  previous_agent: { none: true },
  next_agent: { none: true },
  focus_agent: { none: true },
  switch_workspace: { rpc: ["workspace.focus", { workspaceId: "w1" }] },
  open_worktree: { rpc: ["worktree.list", { workspaceId: "w1" }] },
  remove_worktree: { toast: true },
  split_vertical: {
    rpc: ["pane.split", { paneId: "p1", direction: "right", newCwd: { policy: "follow" } }],
  },
  split_horizontal: {
    rpc: ["pane.split", { paneId: "p1", direction: "down", newCwd: { policy: "follow" } }],
  },
  focus_pane_left: { none: true },
  focus_pane_down: { none: true },
  focus_pane_up: { none: true },
  focus_pane_right: { rpc: ["pane.focus", { paneId: "p2" }] },
  swap_pane_left: { rpc: ["pane.swap", { paneId: "p1", direction: "left" }] },
  swap_pane_down: { rpc: ["pane.swap", { paneId: "p1", direction: "down" }] },
  swap_pane_up: { rpc: ["pane.swap", { paneId: "p1", direction: "up" }] },
  swap_pane_right: { rpc: ["pane.swap", { paneId: "p1", direction: "right" }] },
  cycle_pane_next: { rpc: ["pane.focus", { paneId: "p2" }] },
  cycle_pane_previous: { rpc: ["pane.focus", { paneId: "p2" }] },
  close_pane: { rpc: ["pane.close", { paneId: "p1" }] },
  zoom: { rpc: ["pane.zoom", { paneId: "p1", mode: "toggle" }] },
  resize_mode: { mode: true },
  rename_pane: { dialog: "renamePane" },
  copy_mode: { mode: true },
  edit_scrollback: { rpc: ["pane.edit_scrollback", { paneId: "p1" }] },
  toggle_sidebar: { host: "toggleSidebar" },
  remote_image_paste: { host: "pasteImage" },
  last_pane: { none: true },
  resize_pane_left: { rpc: ["pane.resize", { paneId: "p1", direction: "left", amount: 0.05 }] },
  resize_pane_down: { rpc: ["pane.resize", { paneId: "p1", direction: "down", amount: 0.05 }] },
  resize_pane_up: { rpc: ["pane.resize", { paneId: "p1", direction: "up", amount: 0.05 }] },
  resize_pane_right: { rpc: ["pane.resize", { paneId: "p1", direction: "right", amount: 0.05 }] },
  swap_with_focused: { none: true },
};

describe("TuiDispatcher — 全操作の効果（web の 56 操作と同じ RPC・引数・ダイアログ）", () => {
  it("表はカタログの全操作をちょうど覆う", () => {
    expect(Object.keys(EFFECTS).sort()).toEqual(ACTIONS.map((d) => d.id).sort());
    expect(ACTIONS).toHaveLength(56);
  });

  it.each(ACTIONS.map((d) => [d.id, d as ActionDef] as const))("%s", (id, def) => {
    const h = harness();
    const action: Action = def.indexed ? def.action(1) : def.action;
    h.d.run(action);
    const e = EFFECTS[id]!;
    if (e.rpc) expect(h.calls[0]).toEqual(e.rpc);
    else if (!e.none && !e.mode) expect(h.calls).toEqual([]);
    if (e.dialog) expect(h.ui.dialogContext?.kind).toBe(e.dialog);
    else expect(h.ui.dialogContext).toBeNull();
    if (e.host) expect(h.host[e.host]).toHaveBeenCalled();
    if (e.none || e.mode) expect(h.calls).toEqual([]);
    if (e.toast) expect(h.ui.toasts).toHaveLength(1);
  });
});

describe("TuiDispatcher — 分割・焦点・入れ替え", () => {
  it("split：pane.split を送り、応答の pane へ焦点を移す。待つ間の入力は新しい pane へ（D99）", async () => {
    const snap = snapshot();
    const h = harness(snap, { "pane.split": { pane: pane("p9", "t1") } });
    h.d.run({ type: "split", dir: "right" });
    expect(h.sent("pane.split")).toEqual([
      { paneId: "p1", direction: "right", newCwd: { policy: "follow" } },
    ]);
    h.model.applyEvent({ event: "pane.created", data: { pane: pane("p9", "t1") } });
    h.model.applyEvent({
      event: "layout.updated",
      data: {
        tab: tab(
          "t1",
          "w1",
          split("right", leaf("p1"), split("right", leaf("p2"), leaf("p9"), 0.5, "s2")),
        ),
      },
    });
    await flush();
    expect(h.model.focusedPaneId).toBe("p9");
    expect(h.holds[0]).toMatchObject({ source: "p1", released: "p9" });
  });

  it("split が失敗したら知らせ、溜めた入力は元の pane へ", async () => {
    const h = harness(snapshot(), { "pane.split": new Error("x") });
    h.d.run({ type: "split", dir: "down" });
    await flush();
    expect(h.holds[0]!.canceled).toBe(true);
    expect(h.ui.toasts.map((t) => t.message)).toEqual(["分割できませんでした"]);
  });

  it("新しい pane が応答の時点で閉じていたら、溜めた入力は元の pane へ", async () => {
    const h = harness(snapshot(), { "pane.split": { pane: pane("p9", "t1") } });
    h.d.run({ type: "split", dir: "down" });
    await flush();
    expect(h.holds[0]!.canceled).toBe(true);
  });

  it("focusDir：隣を先に求めて焦点を移し pane.focus。無ければ何もしない", () => {
    const h = harness();
    h.d.run({ type: "focusDir", dir: "left" });
    expect(h.calls).toEqual([]);
    h.d.run({ type: "focusDir", dir: "right" });
    expect(h.model.focusedPaneId).toBe("p2");
    expect(h.sent("pane.focus")).toEqual([{ paneId: "p2" }]);
  });

  it("swap・zoom・resizeBy・cyclePane・moveTab", () => {
    const h = harness();
    h.d.run({ type: "swap", dir: "right" });
    h.d.run({ type: "zoom" });
    h.d.run({ type: "resizeBy", dir: "left", amount: 0.05 });
    h.d.run({ type: "moveTab", direction: "next" });
    expect(h.calls).toEqual([
      ["pane.swap", { paneId: "p1", direction: "right" }],
      ["pane.zoom", { paneId: "p1", mode: "toggle" }],
      ["pane.resize", { paneId: "p1", direction: "left", amount: 0.05 }],
      ["tab.move", { tabId: "t1", direction: "next" }],
    ]);
    h.calls.length = 0;
    h.d.run({ type: "cyclePane", delta: 1 });
    expect(h.model.focusedPaneId).toBe("p2");
    h.d.run({ type: "cyclePane", delta: 1 });
    expect(h.model.focusedPaneId).toBe("p1");
    h.d.run({ type: "cyclePane", delta: -1 });
    expect(h.model.focusedPaneId).toBe("p2");
    expect(h.sent("pane.focus")).toEqual([{ paneId: "p2" }, { paneId: "p1" }, { paneId: "p2" }]);
  });

  it("swapWithFocused：メニューの pane と入れ替えて焦点を送り直す。キーからは直前の pane と。別の tab・同じ pane は何もしない", async () => {
    const h = harness(snapshot(), { "pane.swap_with": { ok: true } });
    h.d.swapWithFocused("p3");
    h.d.swapWithFocused("p1");
    expect(h.calls).toEqual([]);
    h.d.swapWithFocused("p2");
    await flush();
    expect(h.calls).toEqual([
      ["pane.swap_with", { paneId: "p1", otherPaneId: "p2" }],
      ["pane.focus", { paneId: "p1" }],
    ]);
    h.calls.length = 0;
    h.model.focusPane("p2");
    h.d.run({ type: "swapWithFocused" });
    expect(h.sent("pane.swap_with")).toEqual([{ paneId: "p2", otherPaneId: "p1" }]);
  });
});

describe("TuiDispatcher — tab・workspace", () => {
  function twoTabs() {
    return snapshot({
      workspaces: [workspace("w1", ["t1", "t1b"]), workspace("w2", ["t2"])],
      tabs: [
        tab("t1", "w1", leaf("p1")),
        tab("t1b", "w1", leaf("p2")),
        tab("t2", "w2", leaf("p3")),
      ],
      panes: [pane("p1", "t1"), pane("p2", "t1b"), pane("p3", "t2")],
    });
  }

  it("tabDelta・tabIndex：tabIds の順で動き（端で反対へ）、tab.focus を送る", () => {
    const h = harness(twoTabs());
    h.d.run({ type: "tabDelta", delta: 1 });
    expect(h.model.tabId).toBe("t1b");
    expect(h.model.focusedPaneId).toBe("p2");
    h.d.run({ type: "tabDelta", delta: 1 });
    expect(h.model.tabId).toBe("t1");
    h.d.run({ type: "tabIndex", index: 2 });
    h.d.run({ type: "tabIndex", index: 9 });
    expect(h.model.tabId).toBe("t1b");
    expect(h.sent("tab.focus")).toEqual([{ tabId: "t1b" }, { tabId: "t1" }, { tabId: "t1b" }]);
  });

  it("newTab はダイアログを開き、確定で tab.create → その tab の pane へ。空・既定のままなら label を送らない", async () => {
    const h = harness(twoTabs(), {
      "tab.create": { tab: tab("t9", "w1", leaf("p9")), pane: pane("p9", "t9") },
    });
    h.d.run({ type: "newTab" });
    expect(h.ui.dialogContext).toEqual({ kind: "newTab", workspaceId: "w1" });
    h.d.confirmNewTab("  ");
    expect(h.ui.dialogContext).toBeNull();
    expect(h.sent("tab.create")).toEqual([
      { workspaceId: "w1", newCwd: { policy: "follow", sourcePaneId: "p1" } },
    ]);
    await flush();
    expect(h.model.viewTarget()).toEqual({ workspaceId: "w1", tabId: "t9", focusedPaneId: "p9" });
    h.d.run({ type: "newTab" });
    h.d.confirmNewTab("build");
    expect(h.sent("tab.create")[1]).toMatchObject({ label: "build" });
  });

  it("newWorkspace：名前を尋ねずに workspace.create を送り、応答へ切り替える", async () => {
    const h = harness(snapshot(), {
      "workspace.create": {
        workspace: workspace("w9", ["t9"]),
        tab: tab("t9", "w9", leaf("p9")),
        pane: pane("p9", "t9"),
      },
    });
    h.d.run({ type: "newWorkspace" });
    expect(h.sent("workspace.create")).toEqual([
      { newCwd: { policy: "follow", sourcePaneId: "p1" } },
    ]);
    await flush();
    expect(h.model.viewTarget()).toEqual({ workspaceId: "w9", tabId: "t9", focusedPaneId: "p9" });
  });

  it("新しく開く場所：方針に従う。分割は元の pane を載せない。cwdFallback なら知らせる", async () => {
    const h = harness(snapshot(), { "pane.split": { pane: pane("p9", "t1"), cwdFallback: true } });
    h.prefs.apply({ newCwdPolicy: "path", newCwdPath: "~/src" }, 1);
    h.d.run({ type: "split", dir: "right" });
    expect(h.sent("pane.split")[0]).toMatchObject({ newCwd: { policy: "path", path: "~/src" } });
    await flush();
    expect(h.ui.toasts[0]?.message).toContain("代わりの場所");
    h.prefs.apply({}, 2);
    h.d.run({ type: "split", dir: "right" });
    expect(h.sent("pane.split")[1]).toMatchObject({ newCwd: { policy: "follow" } });
  });

  it("workspaceDelta・workspaceIndex（switch_workspace）：サイドバーの並びで動き、workspace.focus を送る", () => {
    const h = harness();
    h.d.run({ type: "workspaceDelta", delta: 1 });
    expect(h.model.viewTarget()).toEqual({ workspaceId: "w2", tabId: "t2", focusedPaneId: "p3" });
    h.d.run({ type: "workspaceIndex", index: 1 });
    expect(h.model.workspaceId).toBe("w1");
    h.d.run({ type: "workspaceIndex", index: 5 });
    expect(h.sent("workspace.focus")).toEqual([{ workspaceId: "w2" }, { workspaceId: "w1" }]);
  });

  it("workspaceDelta：workspace が 1 つなら何もしない", () => {
    const h = harness(
      snapshot({
        workspaces: [workspace("w1", ["t1"])],
        tabs: [tab("t1", "w1", leaf("p1"))],
        panes: [pane("p1", "t1")],
      }),
    );
    h.d.run({ type: "workspaceDelta", delta: 1 });
    expect(h.calls).toEqual([]);
  });

  it("moveWorkspace・moveWorkspacesByDrag", () => {
    const h = harness();
    h.d.run({ type: "moveWorkspace", direction: "next" });
    h.d.moveWorkspacesByDrag(["w2"], "w1");
    h.d.moveWorkspacesByDrag(["w1"], null);
    expect(h.calls).toEqual([
      ["workspace.move", { workspaceId: "w1", direction: "next" }],
      ["workspace.move_to", { workspaceIds: ["w2"], beforeWorkspaceId: "w1" }],
      ["workspace.move_to", { workspaceIds: ["w1"], beforeWorkspaceId: null }],
    ]);
  });
});

describe("TuiDispatcher — 閉じる前の確認（D23）", () => {
  const busy = () =>
    snapshot({ panes: [pane("p1", "t1", { busy: true }), pane("p2", "t1"), pane("p3", "t2")] });

  it("closePane：busy でなければ直接、busy なら確認", () => {
    const h = harness(busy());
    h.model.focusPane("p2");
    h.d.run({ type: "closePane" });
    expect(h.sent("pane.close")).toEqual([{ paneId: "p2" }]);
    h.model.focusPane("p1");
    h.d.run({ type: "closePane" });
    expect(h.ui.dialogContext).toEqual({
      kind: "confirmClose",
      targets: [{ type: "pane", id: "p1" }],
    });
    h.d.confirmClose();
    expect(h.sent("pane.close")).toEqual([{ paneId: "p2" }, { paneId: "p1" }]);
    expect(h.ui.dialogContext).toBeNull();
  });

  it("closeTab：どれかが busy なら確認、無ければ直接。closeWorkspace は常に確認（linked worktree の一括は対象 1 件のときだけ）", () => {
    const h = harness(busy());
    h.d.run({ type: "closeTab" });
    expect(h.ui.dialogContext).toEqual({
      kind: "confirmClose",
      targets: [{ type: "tab", id: "t1" }],
    });
    h.ui.closeDialog();
    h.d.closeTabById("t2");
    expect(h.sent("tab.close")).toEqual([{ tabId: "t2" }]);
    h.d.run({ type: "closeWorkspace" });
    expect(h.ui.dialogContext).toEqual({
      kind: "confirmClose",
      targets: [{ type: "workspace", id: "w1" }],
    });
    h.d.confirmClose(true);
    expect(h.sent("workspace.close")).toEqual([{ workspaceId: "w1", closeLinkedWorktrees: true }]);
    h.ui.openDialogWithContext({
      kind: "confirmClose",
      targets: [
        { type: "workspace", id: "w1" },
        { type: "workspace", id: "w2" },
      ],
    });
    h.d.confirmClose(true);
    expect(h.sent("workspace.close").slice(1)).toEqual([
      { workspaceId: "w1", closeLinkedWorktrees: false },
      { workspaceId: "w2", closeLinkedWorktrees: false },
    ]);
  });

  it("replacePaneWithDrag：落とし先が busy なら確認、そうでなければ直接。別の種類のダイアログでは confirmReplacePane は何もしない", () => {
    const h = harness(busy());
    h.d.replacePaneWithDrag("p2", "p3");
    expect(h.sent("pane.replace")).toEqual([{ paneId: "p2", targetPaneId: "p3" }]);
    h.d.replacePaneWithDrag("p2", "p1");
    expect(h.ui.dialogContext).toEqual({
      kind: "confirmReplacePane",
      paneId: "p2",
      targetPaneId: "p1",
    });
    h.d.confirmReplacePane();
    expect(h.sent("pane.replace")).toHaveLength(2);
    h.ui.openDialogWithContext({ kind: "help" });
    h.d.confirmReplacePane();
    expect(h.sent("pane.replace")).toHaveLength(2);
  });

  it("ダイアログを閉じると開く前の pane へ焦点が戻る（AC-I4）", () => {
    const h = harness(busy());
    h.d.run({ type: "closePane" });
    h.model.focusPane("p2");
    h.d.cancelConfirm();
    expect(h.model.focusedPaneId).toBe("p1");
  });
});

describe("TuiDispatcher — 名前の変更", () => {
  it("renamePane：今の名前で開き、空なら label:null（消去）", () => {
    const h = harness(
      snapshot({ panes: [pane("p1", "t1", { label: "old" }), pane("p2", "t1"), pane("p3", "t2")] }),
    );
    h.d.run({ type: "renamePane" });
    expect(h.ui.dialogContext).toEqual({ kind: "renamePane", paneId: "p1", currentLabel: "old" });
    h.d.confirmRenamePane("  new ");
    h.d.renamePaneById("p2");
    h.d.confirmRenamePane(" ");
    expect(h.sent("pane.rename")).toEqual([
      { paneId: "p1", label: "new" },
      { paneId: "p2", label: null },
    ]);
  });

  it("renameTab：空は送らない", () => {
    const h = harness();
    h.d.run({ type: "renameTab" });
    h.d.confirmRenameTab("");
    h.d.renameTabById("t2");
    h.d.confirmRenameTab("x");
    expect(h.sent("tab.rename")).toEqual([{ tabId: "t2", label: "x" }]);
  });

  it("renameWorkspace：空は label:null。自動の名前のまま変えずに確定したら送らない（大小は区別）", () => {
    const h = harness(
      snapshot({
        workspaces: [
          workspace("w1", ["t1"], { label: "repo", autoLabel: true }),
          workspace("w2", ["t2"]),
        ],
      }),
    );
    h.d.run({ type: "renameWorkspace" });
    expect(h.ui.dialogContext).toEqual({
      kind: "renameWorkspace",
      workspaceId: "w1",
      currentLabel: "repo",
      currentAutoLabel: true,
    });
    h.d.confirmRenameWorkspace(" repo ");
    h.d.run({ type: "renameWorkspace" });
    h.d.confirmRenameWorkspace("Repo");
    h.d.run({ type: "renameWorkspace" });
    h.d.confirmRenameWorkspace("");
    expect(h.sent("workspace.rename")).toEqual([
      { workspaceId: "w1", label: "Repo" },
      { workspaceId: "w1", label: null },
    ]);
  });
});

describe("TuiDispatcher — モード・その他", () => {
  it("enterMode(navigate) は今の workspace を選び、up/down/activate/cancel/openMenu", () => {
    const h = harness();
    h.d.run({ type: "enterMode", mode: "navigate" });
    expect(h.ui.navigateSelection).toBe("w1");
    h.d.run({ type: "navigate", op: "down" });
    expect(h.ui.navigateSelection).toBe("w2");
    h.d.run({ type: "navigate", op: "down" });
    expect(h.ui.navigateSelection).toBe("w1");
    h.d.run({ type: "navigate", op: "up" });
    h.d.run({ type: "navigate", op: "openMenu" });
    expect(h.ui.navigateMenuRequested).toBe(true);
    h.d.run({ type: "navigate", op: "activate" });
    expect(h.ui.navigateSelection).toBeNull();
    expect(h.model.workspaceId).toBe("w2");
    expect(h.sent("workspace.focus")).toEqual([{ workspaceId: "w2" }]);
    h.d.run({ type: "navigate", op: "openMenu" });
    h.d.run({ type: "navigate", op: "paneDir", dir: "right" });
    h.d.run({ type: "navigate", op: "cancel" });
    expect(h.ui.navigateSelection).toBeNull();
  });

  it("copy：対象の結果でクリップボードへ書き・知らせ・抜ける。copy に入るたびカーソルを合わせ直す", async () => {
    const h = harness();
    h.d.run({ type: "enterMode", mode: "copy" });
    expect(h.copy.resets).toBe(1);
    h.copy.next = { copiedText: "abc", exited: true };
    h.d.run({ type: "copy", cmd: { op: "yank" } });
    await flush();
    expect(h.host.writeClipboard).toHaveBeenCalledWith("abc");
    expect(h.ui.toasts.map((t) => t.message)).toEqual(["コピーしました"]);
    expect(h.modes).toEqual(["terminal"]);
    h.d.run({ type: "exitMode" });
    expect(h.modes).toEqual(["terminal", "terminal"]);
  });

  it("help・goto・settings はダイアログ。toggleSidebar・detach・nextNotification・runCommand・pasteImage は host へ", () => {
    const h = harness();
    h.d.run({ type: "help" });
    expect(h.ui.dialogContext).toEqual({ kind: "help" });
    h.ui.closeDialog();
    h.d.run({ type: "goto" });
    expect(h.ui.dialogContext).toEqual({ kind: "goto" });
    h.ui.closeDialog();
    h.d.run({ type: "settings" });
    expect(h.ui.dialogContext).toEqual({ kind: "settings" });
    h.ui.closeDialog();
    h.d.run({ type: "toggleSidebar" });
    h.d.run({ type: "detach" });
    h.d.run({ type: "nextNotification" });
    h.d.run({ type: "runCommand", commandId: "x" });
    h.d.run({ type: "pasteImage" });
    expect(h.host.toggleSidebar).toHaveBeenCalled();
    expect(h.host.detach).toHaveBeenCalled();
    expect(h.host.focusNextNotification).toHaveBeenCalled();
    expect(h.host.runCommand).toHaveBeenCalledWith("x");
    expect(h.host.pasteImage).toHaveBeenCalled();
  });

  it("editScrollback：pane.edit_scrollback の応答の pane へ焦点。すぐ閉じていたら元のまま。失敗は知らせる", async () => {
    const h = harness(snapshot(), { "pane.edit_scrollback": { pane: pane("p2", "t1") } });
    h.d.run({ type: "editScrollback" });
    await flush();
    expect(h.model.focusedPaneId).toBe("p2");
    expect(h.holds[0]!.released).toBe("p2");
    const h2 = harness(snapshot(), { "pane.edit_scrollback": new Error("x") });
    h2.d.run({ type: "editScrollback" });
    await flush();
    expect(h2.ui.toasts[0]?.message).toBe("スクロールバックをエディタで開けませんでした");
  });

  it("reloadConfig：prefs.get で設定を取り直し、command.reload。問題があれば知らせる", async () => {
    const h = harness(snapshot(), {
      "prefs.get": { prefs: { theme: "nord" }, rev: 4 },
      "command.reload": { commands: [], problem: "bad toml" },
    });
    h.d.run({ type: "reloadConfig" });
    await flush();
    expect(h.prefs.theme).toBe("nord");
    expect(h.ui.toasts.map((t) => t.message)).toEqual([
      "設定を読み直しました。",
      "独自コマンドの設定を読めませんでした：bad toml",
    ]);
    expect(h.host.setCommands).toHaveBeenCalled();
  });

  it("lastPane：直前の pane へ（workspace をまたぐ）。閉じていれば何もしない", () => {
    const h = harness();
    h.model.focusPane("p3");
    h.d.run({ type: "lastPane" });
    expect(h.model.focusedPaneId).toBe("p1");
    expect(h.model.workspaceId).toBe("w1");
    h.d.run({ type: "lastPane" });
    expect(h.model.focusedPaneId).toBe("p3");
    h.model.applyEvent({ event: "pane.closed", data: { paneId: "p1" } });
    h.calls.length = 0;
    h.d.run({ type: "lastPane" });
    expect(h.calls).toEqual([]);
  });

  it("agentDelta・focusAgentIndex：エージェントの居る pane を巡る。居なければ何もしない", () => {
    const withAgents = snapshot({
      panes: [
        pane("p1", "t1"),
        pane("p2", "t1", { agent: agent({ instanceId: "a2" }) }),
        pane("p3", "t2", { agent: agent({ instanceId: "a3" }) }),
      ],
    });
    const h = harness(withAgents);
    h.d.run({ type: "agentDelta", delta: 1 });
    expect(h.model.focusedPaneId).toBe("p2");
    h.d.run({ type: "agentDelta", delta: 1 });
    expect(h.model.focusedPaneId).toBe("p3");
    h.d.run({ type: "focusAgentIndex", index: 0 });
    expect(h.model.focusedPaneId).toBe("p2");
    h.d.run({ type: "focusAgentIndex", index: 5 });
    expect(h.model.focusedPaneId).toBe("p2");
    const none = harness();
    none.d.run({ type: "agentDelta", delta: -1 });
    expect(none.calls).toEqual([]);
  });
});

describe("TuiDispatcher — worktree（D-7 を含む）", () => {
  const linked = () =>
    snapshot({
      workspaces: [
        workspace("w1", ["t1"], {
          cwd: "/repo",
          git: { branch: "main", repoKey: "/repo", isLinkedWorktree: false } as never,
        }),
        workspace("w2", ["t2"], {
          cwd: "/wt/feat",
          git: { branch: "feat", repoKey: "/repo", isLinkedWorktree: true } as never,
        }),
      ],
    });
  const entries = [
    { path: "/wt/feat", branch: "feat" },
    { path: "/wt/other", branch: null },
  ];

  it("newWorktree：一覧を取ってから作成のダイアログ。確定で worktree.create → その場所の workspace を開く（label はブランチ名）", async () => {
    const info = { worktreeRoot: "/wt", repoName: "repo", suggestedBranch: "x", entries };
    const h = harness(linked(), {
      "worktree.list": info,
      "worktree.create": { path: "/wt/new" },
      "workspace.create": {
        workspace: workspace("w9", ["t9"]),
        tab: tab("t9", "w9", leaf("p9")),
        pane: pane("p9", "t9"),
      },
    });
    h.d.run({ type: "newWorktree" });
    await flush();
    expect(h.ui.dialogContext).toEqual({ kind: "worktreeCreate", workspaceId: "w1", info });
    h.d.confirmWorktreeCreate("  ");
    expect(h.sent("worktree.create")).toEqual([]);
    h.d.confirmWorktreeCreate("new");
    await flush();
    expect(h.sent("workspace.create")).toEqual([{ cwd: "/wt/new", label: "new" }]);
    expect(h.model.focusedPaneId).toBe("p9");
  });

  it("openWorktree：空なら知らせる。既に開いている場所はそこへ移るだけ。detached はパスの末尾を名前に", async () => {
    const h = harness(linked(), {
      "worktree.list": { worktreeRoot: "/wt", repoName: "r", suggestedBranch: "", entries },
      "workspace.create": new Error("x"),
    });
    h.d.run({ type: "openWorktree" });
    await flush();
    expect(h.ui.dialogContext).toEqual({ kind: "worktreeOpen", workspaceId: "w1", entries });
    h.d.confirmWorktreeOpen("/wt/feat");
    expect(h.model.workspaceId).toBe("w2");
    expect(h.sent("workspace.focus")).toEqual([{ workspaceId: "w2" }]);
    h.ui.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries });
    h.d.confirmWorktreeOpen("/wt/other");
    expect(h.sent("workspace.create")).toEqual([{ cwd: "/wt/other", label: "other" }]);
    const empty = harness(linked(), {
      "worktree.list": { worktreeRoot: "", repoName: "", suggestedBranch: "", entries: [] },
    });
    empty.d.run({ type: "openWorktree" });
    await flush();
    expect(empty.ui.toasts[0]?.message).toBe("この repo にはまだ worktree がありません。");
  });

  it("openWorktree：linked worktree の workspace からは開かずに知らせる", () => {
    const h = harness(linked());
    h.model.focusPane("p3");
    h.d.run({ type: "openWorktree" });
    expect(h.calls).toEqual([]);
    expect(h.ui.toasts[0]?.message).toContain("repo の本体");
  });

  it("removeWorktree（キー）：linked でなければ知らせる。完全一致の場所で確認（取り消したら閉じる）。一致が無ければ知らせる", async () => {
    const h = harness(linked(), {
      "worktree.list": { worktreeRoot: "/wt", repoName: "r", suggestedBranch: "", entries },
    });
    h.d.run({ type: "removeWorktree" });
    expect(h.ui.toasts[0]?.message).toContain("worktree のチェックアウトではありません");
    h.model.focusPane("p3");
    h.d.run({ type: "removeWorktree" });
    await flush();
    expect(h.ui.dialogContext).toEqual({
      kind: "confirmWorktreeRemove",
      sourceWorkspaceId: "w2",
      path: "/wt/feat",
      openWorkspaceId: "w2",
      closeOnCancel: true,
    });
    h.d.cancelConfirm();
    expect(h.ui.dialogContext).toBeNull();
    expect(h.sent("worktree.list")).toHaveLength(1);
    const sub = harness(
      snapshot({
        workspaces: [
          workspace("w1", ["t1"], {
            cwd: "/wt/feat/sub",
            git: { branch: "f", repoKey: "/r", isLinkedWorktree: true } as never,
          }),
          workspace("w2", ["t2"]),
        ],
      }),
      { "worktree.list": { worktreeRoot: "/wt", repoName: "r", suggestedBranch: "", entries } },
    );
    sub.d.run({ type: "removeWorktree" });
    await flush();
    expect(sub.ui.dialogContext).toBeNull();
    expect(sub.ui.toasts[0]?.message).toContain("見つかりませんでした");
  });

  it("削除：成功で一覧を開き直す（削除元自身なら開き直さない）。dirty/locked は --force の確認へ（closeOnCancel を引き継ぐ）。他の失敗は知らせて一覧へ", async () => {
    let fail: Error | null = codeError("worktree_dirty");
    const h = harness(linked(), {
      "worktree.list": { worktreeRoot: "/wt", repoName: "r", suggestedBranch: "", entries },
      "worktree.remove": () => fail ?? {},
    });
    h.d.removeWorktree("w1", "/wt/other");
    expect(h.ui.dialogContext).toEqual({
      kind: "confirmWorktreeRemove",
      sourceWorkspaceId: "w1",
      path: "/wt/other",
      openWorkspaceId: null,
    });
    h.d.confirmWorktreeRemove();
    await flush();
    expect(h.ui.dialogContext).toMatchObject({
      kind: "confirmWorktreeRemoveForce",
      reason: "dirty",
    });
    fail = codeError("worktree_dirty");
    h.d.confirmWorktreeRemoveForce();
    await flush();
    expect(h.sent("worktree.remove")).toEqual([
      { workspaceId: "w1", path: "/wt/other", force: false },
      { workspaceId: "w1", path: "/wt/other", force: true },
    ]);
    // force 済みの失敗は --force の確認を繰り返さず、知らせて一覧へ。
    expect(h.ui.dialogContext).toMatchObject({ kind: "worktreeOpen" });
    fail = null;
    h.d.removeWorktree("w1", "/wt/other");
    h.d.confirmWorktreeRemove();
    await flush();
    expect(h.ui.dialogContext).toMatchObject({ kind: "worktreeOpen" });
    // locked・キーから（closeOnCancel）
    fail = codeError("worktree_locked");
    h.ui.closeDialog();
    h.ui.openDialogWithContext({
      kind: "confirmWorktreeRemove",
      sourceWorkspaceId: "w2",
      path: "/wt/feat",
      openWorkspaceId: "w2",
      closeOnCancel: true,
    });
    h.d.confirmWorktreeRemove();
    await flush();
    expect(h.ui.dialogContext).toEqual({
      kind: "confirmWorktreeRemoveForce",
      sourceWorkspaceId: "w2",
      path: "/wt/feat",
      openWorkspaceId: "w2",
      reason: "locked",
      closeOnCancel: true,
    });
    fail = codeError("git_failed");
    h.d.confirmWorktreeRemoveForce();
    await flush();
    expect(h.ui.dialogContext).toBeNull(); // closeOnCancel：一覧を開き直さない
  });

  it("削除の応答を待つ間に他のダイアログが開いていたら奪わない", async () => {
    let resolve!: (v: unknown) => void;
    const h = harness(linked(), {
      "worktree.remove": () => new Promise((r) => (resolve = r)),
      "worktree.list": { entries },
    });
    h.d.removeWorktree("w1", "/wt/other");
    h.d.confirmWorktreeRemove();
    h.ui.openDialogWithContext({ kind: "help" });
    resolve({});
    await flush();
    expect(h.ui.dialogContext).toEqual({ kind: "help" });
    expect(h.sent("worktree.list")).toEqual([]);
  });

  it("confirm 系は別の種類のダイアログでは何もしない", () => {
    const h = harness();
    h.ui.openDialogWithContext({ kind: "help" });
    h.d.confirmWorktreeRemove();
    h.d.confirmWorktreeRemoveForce();
    h.d.confirmClose();
    h.d.confirmStopServer();
    h.d.confirmNewTab("x");
    expect(h.calls).toEqual([]);
    expect(h.ui.dialogContext).toEqual({ kind: "help" });
  });
});

describe("TuiDispatcher — グループ", () => {
  it("作成して加える・名前・削除・折りたたみ・追加・外す", async () => {
    const h = harness(snapshot({ groups: [{ id: "g1", label: "G", collapsed: false }] }), {
      "group.create": { group: { id: "g2", label: "N", collapsed: false } },
    });
    h.d.createGroupForWorkspace("w1");
    h.d.confirmCreateGroup("  N ");
    await flush();
    h.d.renameGroupById("g1");
    expect(h.ui.dialogContext).toEqual({ kind: "renameGroup", groupId: "g1", currentLabel: "G" });
    h.d.confirmRenameGroup("H");
    h.d.deleteGroupById("g1");
    h.d.toggleGroupCollapsed("g1");
    h.d.openGroupPicker("w2");
    h.d.confirmAddToGroup("g1");
    h.d.removeWorkspaceFromGroup("w2");
    expect(h.calls).toEqual([
      ["group.create", { label: "N" }],
      ["group.add_member", { groupId: "g2", workspaceId: "w1" }],
      ["group.rename", { groupId: "g1", label: "H" }],
      ["group.delete", { groupId: "g1" }],
      ["group.toggle_collapsed", { groupId: "g1" }],
      ["group.add_member", { groupId: "g1", workspaceId: "w2" }],
      ["group.remove_member", { workspaceId: "w2" }],
    ]);
  });

  it("グループが無ければ追加の一覧を開かずに知らせる。add_member だけ失敗したら別の文言", async () => {
    const h = harness(snapshot(), {
      "group.create": { group: { id: "g2", label: "N", collapsed: false } },
      "group.add_member": new Error("x"),
    });
    h.d.openGroupPicker("w1");
    expect(h.ui.toasts[0]?.message).toBe("まだグループがありません。");
    h.d.createGroupForWorkspace("w1");
    h.d.confirmCreateGroup("N");
    await flush();
    expect(h.ui.toasts[1]?.message).toBe(
      "グループは作成しましたが、workspace の追加に失敗しました。",
    );
  });

  it("自動グループの折りたたみを保存できなければ元に戻して知らせる（04 の点検）", async () => {
    const h = harness(snapshot(), { "prefs.set": new Error("x") });
    h.d.toggleAutoGroupCollapsed("/repo");
    expect(h.prefs.collapsedAutoGroups.has("/repo")).toBe(true);
    await flush();
    expect(h.prefs.collapsedAutoGroups.has("/repo")).toBe(false);
    expect(h.ui.toasts.map((t) => t.message)).toEqual(["折りたたみを保存できませんでした"]);
  });

  it("メニューの貼り付け：空なら黙って何もしない。読めなければ外側の端末の貼り付けを案内する。読めたら貼る", async () => {
    const h = harness();
    h.host.readClipboard.mockResolvedValueOnce("");
    h.d.pasteIntoPane("p1");
    await flush();
    expect(h.host.pasteText).not.toHaveBeenCalled();
    expect(h.ui.toasts).toEqual([]);
    h.host.readClipboard.mockResolvedValueOnce(null);
    h.d.pasteIntoPane("p1");
    await flush();
    expect(h.host.pasteText).not.toHaveBeenCalled();
    expect(h.ui.toasts.map((t) => t.message)).toEqual([PASTE_UNAVAILABLE]);
    h.host.readClipboard.mockResolvedValueOnce("abc");
    h.d.pasteIntoPane("p1");
    await flush();
    expect(h.host.pasteText).toHaveBeenCalledWith("p1", "abc");
  });

  it("worktree の自動グループの折りたたみは共有の設定（prefs.set）", () => {
    const h = harness();
    h.d.toggleAutoGroupCollapsed("/repo");
    expect(h.prefs.collapsedAutoGroups.has("/repo")).toBe(true);
    h.d.toggleAutoGroupCollapsed("/repo");
    expect(h.sent("prefs.set")).toEqual([
      { patch: { collapsedAutoGroups: ["/repo"] } },
      { patch: { collapsedAutoGroups: [] } },
    ]);
  });
});

describe("TuiDispatcher — 移動（ドラッグ）とメニュー専用の操作", () => {
  it("movePaneToTab・movePaneToNewTab：ok なら移し、待つ間に表示が動いていたら追わない", async () => {
    let resolve!: (v: unknown) => void;
    const h = harness(snapshot(), {
      "pane.move_to_tab": () => new Promise((r) => (resolve = r)),
      "pane.move_to_new_tab": { ok: true, tab: tab("t9", "w2", leaf("p2")) },
    });
    h.d.movePaneToTab("p2", "t2");
    resolve({ ok: true });
    await flush();
    expect(h.model.viewTarget()).toEqual({ workspaceId: "w2", tabId: "t2", focusedPaneId: "p2" });
    // 待つ間に利用者が別の tab へ移っていたら、応答が来ても表示を追わない。
    h.model.setView("w1", "t1", "p1");
    h.d.movePaneToTab("p1", "t2");
    h.model.setView("w1", "t1", "p2");
    h.model.focusPane("p3");
    resolve({ ok: true });
    await flush();
    expect(h.model.focusedPaneId).toBe("p3");
    h.model.setView("w1", "t1", "p1");
    h.d.movePaneToNewTab("p2", "w2");
    await flush();
    expect(h.model.viewTarget()).toEqual({ workspaceId: "w2", tabId: "t9", focusedPaneId: "p2" });
  });

  it("movePaneToEdge・clearPaneName・setRightClickTarget・pasteIntoPane", async () => {
    const h = harness();
    h.d.movePaneToEdge("p2", "p1", "top");
    h.d.clearPaneName("p1");
    h.d.setRightClickTarget("p1", "pane");
    h.d.pasteIntoPane("p2");
    await flush();
    expect(h.calls).toEqual([
      ["pane.move_to_edge", { paneId: "p2", targetPaneId: "p1", edge: "top" }],
      ["pane.rename", { paneId: "p1", label: null }],
      ["pane.input.set", { paneId: "p1", rightClick: "pane" }],
    ]);
    expect(h.host.pasteText).toHaveBeenCalledWith("p2", "clip");
  });
});

describe("TuiDispatcher — stop_server", () => {
  it("確認（止まるのはこのマシン。ホスト名）→ 確定で server.stop。断られたら code の文言", async () => {
    const h = harness(snapshot(), { "server.stop": codeError("server_busy") });
    h.d.run({ type: "stopServer" });
    expect(h.ui.dialogContext).toEqual({ kind: "confirmStopServer", target: "h", remote: false });
    h.d.confirmStopServer();
    await flush();
    expect(h.sent("server.stop")).toEqual([{}]);
    expect(h.ui.toasts[0]?.message).not.toBe("サーバを止められませんでした。");
    expect(h.ui.dialogContext).toBeNull();
  });
});
