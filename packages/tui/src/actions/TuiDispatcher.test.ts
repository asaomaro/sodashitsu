import { describe, expect, it, vi } from "vitest";
import { ACTIONS, type Action, type ActionDef } from "@sodashitsu/client-core";
import type { SessionSnapshot, Workspace } from "@sodashitsu/protocol";
import { PrefsModel } from "../model/PrefsModel.js";
import { MachinesModel, parseRemoteKey, remoteKey } from "../model/MachinesModel.js";
import { menuItems } from "../modes/ContextMenu.js";
import { SessionModel } from "../model/SessionModel.js";
import { UiState } from "../model/UiState.js";
import type { SidebarDragInfo } from "../render/chrome/sidebar.js";
import { REFUSE_BY_NAME, REFUSE_CONTAINER } from "../input/sidebarDrag.js";
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
 * 全操作（カタログの 58 操作。添字つきは 1）の効果の表。**web の `ActionDispatcher` の同じ操作と同じ RPC・引数・ダイアログ**（焦点は p1・w1/t1〔p1|p2〕・w2/t2〔p3〕）。
 * 表に無い操作があれば落ちる（足し忘れの検出）。
 */
const EFFECTS: Record<
  string,
  {
    rpc?: [string, unknown];
    dialog?: string;
    host?: "detach" | "focusNextNotification" | "pasteImage" | "toggleSidebar";
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
  // 20261004-subagent-display。エージェントが無い pane では何も起きない（動きは T13 で足す）。
  show_subagents: { none: true },
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
  open_graph: { toast: true },
};

describe("TuiDispatcher — 全操作の効果（web の 58 操作と同じ RPC・引数・ダイアログ）", () => {
  it("表はカタログの全操作をちょうど覆う", () => {
    expect(Object.keys(EFFECTS).sort()).toEqual(ACTIONS.map((d) => d.id).sort());
    expect(ACTIONS).toHaveLength(58);
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

describe("TuiDispatcher — 連携のグラフ（20260927-agent-graph）", () => {
  it("open_graph は開かずに「ブラウザで開けます」と知らせる（D1-8）", () => {
    const h = harness();
    h.d.run({ type: "openGraph" });
    expect(h.ui.toasts.map((t) => t.message)).toEqual(["グラフの画面はブラウザで開けます。"]);
    expect(h.calls).toEqual([]);
    expect(h.ui.dialogContext).toBeNull();
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

  it("workspaceDelta・workspaceIndex は layout の順（描画と同じ木）で動き、畳んだグループの中は今いる workspace だけ（T16）", () => {
    const wsList = ["w1", "w2", "w3"].map((id) => workspace(id, [`t-${id}`]));
    const h = harness(
      snapshot({
        workspaces: wsList,
        tabs: wsList.map((w) => tab(w.tabIds[0]!, w.id, leaf(`p-${w.id}`))),
        panes: wsList.map((w) => pane(`p-${w.id}`, w.tabIds[0]!)),
        groups: [{ id: "g1", label: "G", collapsed: true }],
        // 開いた順は w1・w2・w3、レイアウトは グループなし（w3）→ グループ（w1・w2）。
        layout: { top: ["u", "g:g1"], groups: { g1: ["w:w1", "w:w2"] }, ungrouped: ["w:w3"] },
        focus: { workspaceId: "w1", tabId: "t-w1", paneId: "p-w1" },
      }),
    );
    // 畳んだグループの中は今いる w1 だけ：見える順は w3・w1（開いた順の w1・w2・w3 ではない）。
    h.d.run({ type: "workspaceIndex", index: 1 });
    expect(h.model.workspaceId).toBe("w3");
    // w3 に居ると、畳んだグループの中は何も見えない（w1 も隠れる）。
    h.d.run({ type: "workspaceIndex", index: 2 });
    expect(h.model.workspaceId).toBe("w3");
    // グループを開くと layout の順 w3・w1・w2。
    h.model.applyEvent({
      event: "group.updated",
      data: { group: { id: "g1", label: "G", collapsed: false } },
    });
    h.d.run({ type: "workspaceDelta", delta: 1 });
    expect(h.model.workspaceId).toBe("w1");
    h.d.run({ type: "workspaceDelta", delta: 1 });
    expect(h.model.workspaceId).toBe("w2");
    h.d.run({ type: "workspaceDelta", delta: 1 });
    expect(h.model.workspaceId).toBe("w3");
    expect(h.sent("workspace.focus")).toEqual([
      { workspaceId: "w3" },
      { workspaceId: "w1" },
      { workspaceId: "w2" },
      { workspaceId: "w3" },
    ]);
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

  it("moveWorkspace（layout の無いサーバは workspace.move）", () => {
    const h = harness();
    h.d.run({ type: "moveWorkspace", direction: "next" });
    expect(h.calls).toEqual([["workspace.move", { workspaceId: "w1", direction: "next" }]]);
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

  it("help・goto・settings はダイアログ。toggleSidebar・detach・nextNotification・pasteImage は host へ", () => {
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
    h.d.run({ type: "pasteImage" });
    expect(h.host.toggleSidebar).toHaveBeenCalled();
    expect(h.host.detach).toHaveBeenCalled();
    expect(h.host.focusNextNotification).toHaveBeenCalled();
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

describe("TuiDispatcher — 「グループなし」の折りたたみ", () => {
  it("共有の設定 ungroupedCollapsed を反転して保存する（追補 01）", () => {
    const h = harness();
    h.d.toggleUngroupedCollapsed();
    expect(h.prefs.ungroupedCollapsed).toBe(true);
    h.d.toggleUngroupedCollapsed();
    expect(h.sent("prefs.set")).toEqual([
      { patch: { ungroupedCollapsed: true } },
      { patch: { ungroupedCollapsed: false } },
    ]);
  });
});

/**
 * 端末版のメニューとキー（group-worktree-items T17。web の `ActionDispatcher.test.ts` の T13・T15・T26 の場合を写した）。
 * top: [g1, g2(空), u]、g1: [r:/r/.git(M 本体・W1 子), A]、ungrouped: [B]。
 */
describe("TuiDispatcher — グループの出し入れ・並べ替え・navigate（T17）", () => {
  const gitOf = (linked: boolean) => ({
    branch: "b",
    ahead: 0,
    behind: 0,
    repoKey: "/r/.git",
    isLinkedWorktree: linked,
  });
  const IDS = ["A", "W1", "B", "M"] as const;
  function fixture(
    opts: { collapsed?: boolean; layout?: boolean; focus?: string } = {},
  ): SessionSnapshot {
    const extra: Record<string, Partial<Workspace>> = {
      W1: { git: gitOf(true) },
      M: { git: gitOf(false) },
    };
    const focus = opts.focus ?? "A";
    return snapshot({
      workspaces: IDS.map((id) => workspace(id, [`t${id}`], { label: id, ...extra[id] })),
      tabs: IDS.map((id) => tab(`t${id}`, id, leaf(`p${id}`))),
      panes: IDS.map((id) => pane(`p${id}`, `t${id}`)),
      groups: [
        { id: "g1", label: "grp", collapsed: opts.collapsed ?? false },
        { id: "g2", label: "空", collapsed: false },
      ],
      focus: { workspaceId: focus, tabId: `t${focus}`, paneId: `p${focus}` },
      ...(opts.layout === false
        ? {}
        : {
            layout: {
              top: ["g:g1", "g:g2", "u"],
              groups: { g1: ["r:/r/.git", "w:A"], g2: [] },
              ungrouped: ["w:B"],
            },
          }),
    });
  }
  const down = (h: ReturnType<typeof harness>) => {
    h.d.run({ type: "navigate", op: "down" });
    return h.ui.navigateSelection;
  };

  it("navigate の up/down は、グループの見出しと「グループなし」の見出しも順に選ぶ（空のグループにも届く）", () => {
    const h = harness(fixture());
    h.ui.setNavigateSelection("group:g1");
    const seen: (string | null)[] = [];
    for (let i = 0; i < 7; i++) seen.push(down(h));
    expect(seen).toEqual(["M", "W1", "A", "group:g2", "ungrouped:", "B", "group:g1"]);
    h.d.run({ type: "navigate", op: "up" });
    expect(h.ui.navigateSelection).toBe("B");
  });

  it("見出しのキーは別のマシンの行のキー（machine:…）と混ざらない", () => {
    expect(parseRemoteKey("group:g1")).toBeNull();
    expect(parseRemoteKey("ungrouped:")).toBeNull();
    expect(parseRemoteKey(remoteKey("m1", "w1"))).not.toBeNull();
  });

  it("畳んだグループの見出しにも届く（中は今いる workspace だけ）", () => {
    const h = harness(fixture({ collapsed: true, focus: "B" }));
    h.ui.setNavigateSelection("group:g1");
    expect(down(h)).toBe("group:g2");
  });

  it("activate（Enter）: 見出しを選んでいるときは選択をやめるだけで workspace.focus を送らない", () => {
    const h = harness(fixture());
    for (const key of ["group:g1", "ungrouped:"]) {
      h.ui.setNavigateSelection(key);
      h.d.run({ type: "navigate", op: "activate" });
      expect(h.ui.navigateSelection).toBeNull();
    }
    expect(h.calls).toEqual([]);
    h.ui.setNavigateSelection("B");
    h.d.run({ type: "navigate", op: "activate" });
    expect(h.sent("workspace.focus")).toEqual([{ workspaceId: "B" }]);
  });

  it("openMenu: 見出しを選んでいても要求を立てる（開く先は TuiApp が決める）。別のマシンの行には立てない", () => {
    const h = harness(fixture());
    h.ui.setNavigateSelection("group:g1");
    h.d.run({ type: "navigate", op: "openMenu" });
    expect(h.ui.navigateMenuRequested).toBe(true);
    expect(h.ui.navigateSelection).toBe("group:g1");
    h.ui.clearNavigateMenuRequest();
    h.ui.setNavigateSelection(remoteKey("m1", "w1"));
    h.d.run({ type: "navigate", op: "openMenu" });
    expect(h.ui.navigateMenuRequested).toBe(false);
  });

  it("toggleCollapse: グループの見出しは group.toggle_collapsed（サーバ）", () => {
    const h = harness(fixture());
    h.ui.setNavigateSelection("group:g2");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.calls).toEqual([["group.toggle_collapsed", { groupId: "g2" }]]);
  });

  it("toggleCollapse: worktree グループの先頭でも子でも、その worktree グループを共有の設定で畳む・広げる（サーバへは送らない）", () => {
    const h = harness(fixture());
    h.ui.setNavigateSelection("M");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.prefs.collapsedAutoGroups.has("/r/.git")).toBe(true);
    h.ui.setNavigateSelection("W1");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.prefs.collapsedAutoGroups.has("/r/.git")).toBe(false);
    expect(h.sent("group.toggle_collapsed")).toEqual([]);
  });

  it("toggleCollapse: 通常の行・選択なし・別のマシンの行は何もしない", () => {
    const h = harness(fixture());
    for (const sel of ["B", "A", null, remoteKey("m1", "w1")]) {
      h.ui.setNavigateSelection(sel);
      h.d.run({ type: "navigate", op: "toggleCollapse" });
    }
    expect(h.prefs.collapsedAutoGroups.size).toBe(0);
    expect(h.calls).toEqual([]);
  });

  it("toggleCollapse: 代表でない通常の行（同じフォルダの 2 つ目）では、同じリポジトリの worktree グループを畳まない", () => {
    const snap = fixture();
    const wsOf = (id: string, git: NonNullable<Workspace["git"]>) => workspace(id, [`t${id}`], { label: id, git });
    // M と同じフォルダ（worktreeKey が同じ）の 2 つ目 M2。代表は M・W1 の 2 つあるので、代表なら畳める状況。
    const h = harness({
      ...snap,
      workspaces: [
        ...snap.workspaces.map((w) =>
          w.id === "M"
            ? { ...w, git: { ...gitOf(false), worktreeKey: "/r" } }
            : w.id === "W1"
              ? { ...w, git: { ...gitOf(true), worktreeKey: "/r-w1" } }
              : w,
        ),
        wsOf("M2", { ...gitOf(false), worktreeKey: "/r" }),
      ],
      tabs: [...snap.tabs, tab("tM2", "M2", leaf("pM2"))],
      panes: [...snap.panes, pane("pM2", "tM2")],
    });
    h.ui.setNavigateSelection("M2");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.prefs.collapsedAutoGroups.size).toBe(0);
    h.ui.setNavigateSelection("M");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.prefs.collapsedAutoGroups.has("/r/.git")).toBe(true);
    expect(h.sent("group.toggle_collapsed")).toEqual([]);
  });

  it("toggleCollapse: 「グループなし」は共有の設定 ungroupedCollapsed を切り替える。畳むと中の行は up/down で飛ばされ、見出しには届く", () => {
    const h = harness(fixture({ focus: "M" }));
    h.ui.setNavigateSelection("group:g2");
    expect(down(h)).toBe("ungrouped:");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.prefs.ungroupedCollapsed).toBe(true);
    expect(h.sent("prefs.set")).toEqual([{ patch: { ungroupedCollapsed: true } }]);
    expect(down(h)).toBe("group:g1"); // 畳んだ中の B は飛ばす
    h.d.run({ type: "navigate", op: "up" });
    expect(h.ui.navigateSelection).toBe("ungrouped:");
  });

  it("toggleCollapse: 見出しが消えているのに選択が残っていたら、何も送らず選択を外す（グループ・「グループなし」とも）", () => {
    const h = harness(fixture());
    h.model.applyEvent({ event: "group.deleted", data: { groupId: "g2" } } as never);
    h.ui.setNavigateSelection("group:g2");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.ui.navigateSelection).toBeNull();
    // グループが 1 つも無くなれば「グループなし」の見出しは出ない。
    h.model.applyEvent({ event: "group.deleted", data: { groupId: "g1" } } as never);
    h.model.applyEvent({
      event: "sidebar.layout_changed",
      data: { layout: { top: ["u"], groups: {}, ungrouped: ["r:/r/.git", "w:A", "w:B"] } },
    } as never);
    h.ui.setNavigateSelection("ungrouped:");
    h.d.run({ type: "navigate", op: "toggleCollapse" });
    expect(h.ui.navigateSelection).toBeNull();
    expect(h.prefs.ungroupedCollapsed).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("moveWorkspace: layout を持つサーバには項目の item.move_by（対象は今いる workspace）。layout の無いサーバは workspace.move", () => {
    const h = harness(fixture({ focus: "W1" }));
    h.d.run({ type: "moveWorkspace", direction: "previous" });
    expect(h.calls).toEqual([
      ["item.move_by", { item: { kind: "workspace", workspaceId: "W1" }, direction: "previous" }],
    ]);
    const old = harness(fixture({ layout: false, focus: "B" }));
    old.d.run({ type: "moveWorkspace", direction: "next" });
    expect(old.calls).toEqual([["workspace.move", { workspaceId: "B", direction: "next" }]]);
  });

  it("moveWorkspace: 名前順で一番上の項目（グループ外）は送らず知らせる。グループの中は送る。古いサーバにも同じ", () => {
    const h = harness(fixture({ focus: "B" }));
    h.prefs.apply({ workspaceSort: "name" }, 1);
    h.d.run({ type: "moveWorkspace", direction: "next" });
    expect(h.calls).toEqual([]);
    expect(h.ui.toasts.map((t) => t.message)).toEqual(["名前順では並べ替えできません"]);
    h.model.setView("A", "tA", "pA");
    h.d.run({ type: "moveWorkspace", direction: "next" });
    expect(h.sent("item.move_by")).toEqual([
      { item: { kind: "workspace", workspaceId: "A" }, direction: "next" },
    ]);
    const old = harness(fixture({ layout: false, focus: "B" }));
    old.prefs.apply({ workspaceSort: "name" }, 1);
    old.d.run({ type: "moveWorkspace", direction: "next" });
    expect(old.calls).toEqual([]);
    expect(old.ui.toasts).toHaveLength(1);
  });

  it("moveGroupBy・moveUngroupedBy: item.move_by を送る。名前順は送らず知らせる", () => {
    const h = harness(fixture());
    h.d.moveGroupBy("g1", "next");
    h.d.moveUngroupedBy("previous");
    expect(h.calls).toEqual([
      ["item.move_by", { item: { kind: "group", groupId: "g1" }, direction: "next" }],
      ["item.move_by", { item: { kind: "ungrouped" }, direction: "previous" }],
    ]);
    h.prefs.apply({ workspaceSort: "name" }, 1);
    h.d.moveGroupBy("g1", "previous");
    h.d.moveUngroupedBy("next");
    expect(h.calls).toHaveLength(2);
    expect(h.ui.toasts.map((t) => t.message)).toEqual([
      "名前順では並べ替えできません",
      "名前順では並べ替えできません",
    ]);
  });

  it("見出しのメニューから「下へ移動」を実行しても、見出しの選択が残る", () => {
    const h = harness(fixture());
    h.ui.setNavigateSelection("ungrouped:");
    h.ui.openContextMenu({ kind: "ungrouped" }, { x: 0, y: 0 });
    const items = menuItems(h.ui.contextMenu!, { ui: h.ui, model: h.model, actions: h.d });
    items[1]!.run();
    h.ui.closeContextMenu();
    expect(h.calls).toEqual([["item.move_by", { item: { kind: "ungrouped" }, direction: "next" }]]);
    expect(h.ui.navigateSelection).toBe("ungrouped:");
  });

  it("group.create: layout を持つサーバは workspaceId を添えて 1 回。古いサーバは 2 段で、項目の workspace 全部に add_member", async () => {
    const h = harness(fixture());
    h.d.createGroupForWorkspace("W1");
    h.d.confirmCreateGroup("新");
    await flush();
    expect(h.calls).toEqual([["group.create", { label: "新", workspaceId: "W1" }]]);
    const old = harness(fixture({ layout: false }), {
      "group.create": { group: { id: "g9", label: "新", collapsed: false } },
    });
    old.d.createGroupForWorkspace("W1");
    old.d.confirmCreateGroup("新");
    await flush();
    expect(old.calls).toEqual([
      ["group.create", { label: "新" }],
      ["group.add_member", { groupId: "g9", workspaceId: "M" }],
      ["group.add_member", { groupId: "g9", workspaceId: "W1" }],
    ]);
  });

  it("group.add_member／remove_member: layout を持つサーバは項目で 1 回。古いサーバは項目の workspace 全部に順に送り、1 件失敗したら止める", async () => {
    const h = harness(fixture());
    // 子の行（W1）でも、項目（M と W1 の worktree グループ）に対して 1 回ずつ。
    h.d.openGroupPicker("W1");
    h.d.confirmAddToGroup("g2");
    h.d.removeWorkspaceFromGroup("W1");
    expect(h.calls).toEqual([
      ["group.add_member", { groupId: "g2", workspaceId: "W1" }],
      ["group.remove_member", { workspaceId: "W1" }],
    ]);
    const old = harness(fixture({ layout: false }));
    old.d.openGroupPicker("W1");
    old.d.confirmAddToGroup("g1");
    await flush();
    old.d.removeWorkspaceFromGroup("W1");
    await flush();
    expect(old.calls).toEqual([
      ["group.add_member", { groupId: "g1", workspaceId: "M" }],
      ["group.add_member", { groupId: "g1", workspaceId: "W1" }],
      ["group.remove_member", { workspaceId: "M" }],
      ["group.remove_member", { workspaceId: "W1" }],
    ]);
    const failing = harness(fixture({ layout: false }), { "group.add_member": new Error("x") });
    failing.d.openGroupPicker("W1");
    failing.d.confirmAddToGroup("g1");
    await flush();
    expect(failing.sent("group.add_member")).toHaveLength(1);
    expect(failing.ui.toasts.map((t) => t.message)).toEqual(["グループへ追加できませんでした"]);
  });

  it("openGroupPicker: 選択肢はレイアウトの順。グループ外の項目は全部のグループ（moving なし）、グループの中は今のグループを除き moving 付き", () => {
    const h = harness(fixture());
    // レイアウトの並びを g2 → g1 に入れ替える（グループの配列の順ではなくレイアウトの順で並ぶ）。
    h.model.applyEvent({
      event: "sidebar.layout_changed",
      data: {
        layout: {
          top: ["g:g2", "g:g1", "u"],
          groups: { g1: ["r:/r/.git", "w:A"], g2: [] },
          ungrouped: ["w:B"],
        },
      },
    } as never);
    h.d.openGroupPicker("B");
    const outside = h.ui.dialogContext;
    expect(outside?.kind === "addToGroup" && outside.groups.map((g) => g.id)).toEqual(["g2", "g1"]);
    expect(outside).not.toHaveProperty("moving");
    h.ui.closeDialog();
    // 子の行（W1）でも本体の所属（g1）で答える。
    h.d.openGroupPicker("W1");
    const inside = h.ui.dialogContext;
    expect(inside?.kind === "addToGroup" && inside.groups.map((g) => g.id)).toEqual(["g2"]);
    expect(inside).toMatchObject({ moving: true });
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

describe("TuiDispatcher — dropSidebarItem（サイドバーのドラッグの確定）", () => {
  const w = (id: string) => ({ kind: "workspace", workspaceId: id }) as const;
  /** グループ g1 の中の 2 つの項目（w1・w2）の掴んだ行の情報。 */
  const info = (id: string, index: number, container: string | null = "g1"): SidebarDragInfo => ({
    item: w(id),
    container,
    index,
    workspaceIds: [id],
    anchorId: id,
    next: index === 0 ? { item: w("w2"), anchorId: "w2" } : null,
  });
  const withLayout = () =>
    snapshot({
      workspaces: [workspace("w1", ["t1"]), workspace("w2", ["t2"])],
      groups: [{ id: "g1", label: "G1", collapsed: false }],
      layout: { top: ["g:g1", "u"], groups: { g1: ["w:w1", "w:w2"] }, ungrouped: [] },
    });
  const toasts = (h: ReturnType<typeof harness>) => h.ui.toasts.map((t) => t.message);

  it("layout ありは item.move（下へは落とした項目の次の前、上へは落とした項目の前）", async () => {
    const h = harness(withLayout());
    h.d.dropSidebarItem(info("w1", 0), info("w2", 1));
    h.d.dropSidebarItem(info("w2", 1), info("w1", 0));
    await flush();
    expect(h.calls).toEqual([
      ["item.move", { item: w("w1"), before: null }],
      ["item.move", { item: w("w2"), before: w("w1") }],
    ]);
  });

  it("layout の無いサーバは workspace.move_to（動かす workspace 全部と落とし先の先頭の workspace）", async () => {
    const h = harness(snapshot({ workspaces: [workspace("w1", ["t1"]), workspace("w2", ["t2"])] }));
    h.d.dropSidebarItem(info("w2", 1, null), info("w1", 0, null));
    h.d.dropSidebarItem(info("w1", 0, null), info("w2", 1, null));
    await flush();
    expect(h.calls).toEqual([
      ["workspace.move_to", { workspaceIds: ["w2"], beforeWorkspaceId: "w1" }],
      ["workspace.move_to", { workspaceIds: ["w1"], beforeWorkspaceId: null }],
    ]);
  });

  it("名前順の拒否・入れ物をまたぐ拒否は送らず知らせる。行の外・自分の上は黙って何もしない", async () => {
    const h = harness(withLayout());
    h.d.dropSidebarItem(info("w1", 0), info("w2", 1, "g2"));
    h.prefs.apply({ workspaceSort: "name" }, 1);
    h.d.dropSidebarItem(info("w1", 0, null), info("w2", 1, null));
    h.d.dropSidebarItem(info("w1", 0), undefined);
    h.d.dropSidebarItem(info("w1", 0), info("w1", 0));
    await flush();
    expect(toasts(h)).toEqual([REFUSE_CONTAINER, REFUSE_BY_NAME]);
    expect(h.calls).toEqual([]);
  });

  it("古いサーバで動かす workspace が無い（空のグループ）ときは送らない", async () => {
    const h = harness(snapshot({ workspaces: [workspace("w1", ["t1"])] }));
    h.d.dropSidebarItem(
      { ...info("w1", 0, null), workspaceIds: [], anchorId: "w1" },
      info("w2", 1, null),
    );
    await flush();
    expect(h.calls).toEqual([]);
    expect(toasts(h)).toEqual([]);
  });

  it("送った RPC が失敗したら「移動できませんでした」と知らせる（item.move・workspace.move_to）", async () => {
    const h = harness(withLayout(), { "item.move": new Error("x") });
    h.d.dropSidebarItem(info("w1", 0), info("w2", 1));
    await flush();
    expect(toasts(h)).toEqual(["移動できませんでした"]);
    const old = harness(
      snapshot({ workspaces: [workspace("w1", ["t1"]), workspace("w2", ["t2"])] }),
      { "workspace.move_to": new Error("x") },
    );
    old.d.dropSidebarItem(info("w1", 0, null), info("w2", 1, null));
    await flush();
    expect(toasts(old)).toEqual(["移動できませんでした"]);
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

  // 統合の review：止めたのが手元のサーバなら、この後にサーバが居なくなっても異常の終わり方（終了コード 1）にしない。
  it("手元のサーバの停止が通ったら serverStopRequested を呼ぶ。断られたら呼ばない", async () => {
    const ok = harness(snapshot(), { "server.stop": {} });
    const requested = vi.fn();
    (ok.host as DispatcherHost).serverStopRequested = requested;
    ok.d.run({ type: "stopServer" });
    ok.d.confirmStopServer();
    await flush();
    expect(requested).toHaveBeenCalledTimes(1);
    const ng = harness(snapshot(), { "server.stop": codeError("server_busy") });
    const notRequested = vi.fn();
    (ng.host as DispatcherHost).serverStopRequested = notRequested;
    ng.d.run({ type: "stopServer" });
    ng.d.confirmStopServer();
    await flush();
    expect(notRequested).not.toHaveBeenCalled();
  });

  it("別のマシンのサーバを止めても serverStopRequested は呼ばない（手元の接続は続く）", async () => {
    const h = harness(snapshot(), { "server.stop": {} });
    const machines = new MachinesModel();
    machines.select("m1");
    const requested = vi.fn();
    Object.assign(h.host as DispatcherHost, { machines, serverStopRequested: requested });
    const d = new TuiDispatcher(h.host);
    d.run({ type: "stopServer" });
    expect(h.ui.dialogContext).toMatchObject({ kind: "confirmStopServer", remote: true });
    d.confirmStopServer();
    await flush();
    expect(h.sent("server.stop")).toEqual([{}]);
    expect(requested).not.toHaveBeenCalled();
  });
});
