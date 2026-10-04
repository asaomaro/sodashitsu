import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import type { AgentInfo, AgentIntegrationStatusResult, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeyInputController } from "../keys/KeyInputController.js";
import { KeyRouter, type KeyRouterClock } from "@sodashitsu/client-core";
import { DEFAULT_KEYMAP } from "@sodashitsu/client-core";
import { clientErrorMessage } from "@sodashitsu/client-core";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { RendererPool, type WebglAddonLike } from "../term/RendererPool.js";
import { TerminalRegistry } from "../term/TerminalRegistry.js";
import { MouseBridge } from "../term/MouseBridge.js";
import { useAgentIntegrationsStore } from "../store/agentIntegrations.js";
import { useCommandsStore } from "../store/commands.js";
import { useSessionStore } from "../store/session.js";
import { useMachinesStore } from "../store/machines.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import { InputGate } from "@sodashitsu/client-core";
import ContextMenu from "../components/ContextMenu.vue";
import { ActionDispatcherKey } from "../injection.js";
import { ActionDispatcher } from "./ActionDispatcher.js";

let pinia: Pinia;

beforeEach(() => {
  sessionStorage.clear();
  // view ストアは作る時点で `soda.prefs.v1` を読み、`toggleSidebar` はそこへ書く（20260921-herdr-settings-gaps）。
  // 消さないと、畳んだ状態が同じファイルの後続のテストへ残る（`--repeats` や再試行で 2 回目が落ちる）。
  localStorage.clear();
  pinia = createPinia();
});

function makeConnection(): ConnectionPort & {
  requests: [MethodName, unknown][];
  resolveWith: Partial<Record<MethodName, unknown>>;
  /** その方式を失敗させる。`Connection` と同じ `<code>: <message>` の形の Error を投げる（clientError.ts の `errorCodeOf`）。 */
  rejectWith: Partial<Record<MethodName, string>>;
} {
  return {
    requests: [],
    resolveWith: {},
    rejectWith: {},
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      const code = this.rejectWith[method];
      if (code !== undefined) return Promise.reject(new Error(`${code}: from server`));
      return Promise.resolve((this.resolveWith[method] ?? {}) as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

function realClock(): KeyRouterClock {
  return { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
}

class FakeWebglAddon implements WebglAddonLike {
  activate(): void {}
  dispose(): void {}
  onContextLoss(): { dispose(): void } {
    return { dispose: () => undefined };
  }
}

/** T17/T18 共通のテスト用の組み立て（実物の KeyRouter・TerminalRegistry を使う。軽量な部品なので実害は無い）。 */
function makeDispatcher(
  conn: ConnectionPort,
  extra: { notifications?: { focusNext(): void }; imagePaste?: { pasteClipboard(paneId: string): void } } = {},
): { dispatcher: ActionDispatcher; registry: TerminalRegistry; keys: KeyInputController } {
  const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
  const keys = new KeyInputController(router, conn);
  const renderers = new RendererPool({ capacity: 100, createWebglAddon: () => new FakeWebglAddon() });
  const registry = new TerminalRegistry({
    capacity: 100,
    conn,
    renderers,
    keys,
    createMouseBridge: (term, paneId) => new MouseBridge({ term, paneId, ui: { toast: () => undefined, openContextMenu: () => undefined }, getRightClickTarget: () => "herdr" }),
  });
  const dispatcher = new ActionDispatcher({ conn, pinia, registry, keys, notifications: { focusNext: () => undefined }, ...extra });
  const view = useViewStore(pinia);
  keys.bind({ action: dispatcher, focus: dispatcher, mode: { onModeChange: (m) => view.onModeChange(m) } });
  return { dispatcher, registry, keys };
}

function makeWorkspace(id: string, tabIds: string[] = [], overrides: Partial<Workspace> = {}): Workspace {
  return { id, label: id, cwd: "/", tabIds, activeTabId: tabIds[0] ?? "", groupId: null, git: null, autoLabel: false, ...overrides };
}
function makeTab(id: string, workspaceId: string, focusedPaneId = "p1"): Tab {
  return { id, workspaceId, label: id, layout: { type: "pane", paneId: focusedPaneId }, focusedPaneId, zoomedPaneId: null, sizeOwnerClientId: null };
}
function makePane(id: string, tabId: string, busy = false): Pane {
  return { id, tabId, label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy, title: "", rightClick: "herdr", agent: null, agentSession: null };
}
function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return { instanceId: "a1", kind: "claude", label: "Claude Code", state: "working", completionSeq: 0, serverSeenSeq: 0, verified: true, since: 0, ...overrides };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("ActionDispatcher — 分割・フォーカス移動・入れ替え", () => {
  it("split: pane.split を送り、応答の pane にフォーカスする（AC-I4）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.split"] = { pane: { id: "p2" } };
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "split", dir: "right" });
    await flush();
    // 既定の方針は「引き継ぐ」。分割の元の pane は `paneId` そのものなので `sourcePaneId` は載せない（20260921-new-terminal-cwd）。
    expect(conn.requests).toEqual([["pane.split", { paneId: "p1", direction: "right", newCwd: { policy: "follow" } }]]);
    expect(view.focusedPaneId).toBe("p2");
  });

  it("split：応答を待つ間に打った文字は、新しい pane へ届く（D99。InputGate）", async () => {
    const conn = makeConnection();
    let resolveSplit: (v: unknown) => void = () => undefined;
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return new Promise((r) => (resolveSplit = r as (v: unknown) => void));
    };
    const gate = new InputGate(conn);
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { registry, keys } = makeDispatcher(conn);
    const dispatcher = new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } });
    dispatcher.run({ type: "split", dir: "right" });
    gate.sendInput("p1", "ls\r"); // 応答の前に、まだ焦点のある p1 で打った
    expect(conn.sendInput).not.toHaveBeenCalled();
    useSessionStore(pinia).paneUpserted(makePane("p2", "t1")); // 実際は pane.created が応答より先に届く
    resolveSplit({ pane: { id: "p2" } });
    await flush();
    expect(view.focusedPaneId).toBe("p2");
    expect(conn.sendInput).toHaveBeenCalledWith("p2", "ls\r");
  });

  it("split が失敗したら、溜めた文字は元の pane へ届く（D99）", async () => {
    const conn = makeConnection();
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return Promise.reject(new Error("spawn_failed"));
    };
    const gate = new InputGate(conn);
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { registry, keys } = makeDispatcher(conn);
    new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } }).run({ type: "split", dir: "right" });
    gate.sendInput("p1", "ls");
    expect(conn.sendInput).not.toHaveBeenCalled(); // 失敗が分かるまでは溜めている
    await flush();
    expect(conn.sendInput).toHaveBeenCalledWith("p1", "ls");
  });

  it("新しい pane が応答の時点で既に閉じていたら（シェルが猶予中に終わった）、溜めた文字は元の pane へ（D99・独立点検の指摘）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.split"] = { pane: { id: "p2" } }; // p2 は session に無い（閉じた）
    const gate = new InputGate(conn);
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { registry, keys } = makeDispatcher(conn);
    new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } }).run({ type: "split", dir: "right" });
    gate.sendInput("p1", "ls");
    await flush();
    expect(conn.sendInput).toHaveBeenCalledWith("p1", "ls");
  });

  it("新しい tab（confirmNewTab）：応答を待つ間に打った文字は新しい tab の pane へ（D99）", async () => {
    const conn = makeConnection();
    conn.resolveWith["tab.create"] = { tab: makeTab("t2", "w1", "p2"), pane: makePane("p2", "t2") };
    const gate = new InputGate(conn);
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.paneUpserted(makePane("p2", "t2")); // 実際は pane.created が応答より先に届く
    view.setView("w1", "t1");
    view.focusPane("p1");
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    const { registry, keys } = makeDispatcher(conn);
    new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } }).confirmNewTab("second");
    gate.sendInput("p1", "pwd");
    expect(conn.sendInput).not.toHaveBeenCalled();
    await flush();
    expect(view.focusedPaneId).toBe("p2");
    expect(conn.sendInput).toHaveBeenCalledWith("p2", "pwd");
  });

  /** p1｜（p2 上／p3 下）のレイアウトの tab を用意する（focusDir のテスト用）。 */
  function setupLShapedTab(): ReturnType<typeof useViewStore> {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted({
      ...makeTab("t1", "w1", "p3"),
      layout: {
        type: "split",
        id: "s1",
        dir: "right",
        ratio: 0.5,
        a: { type: "pane", paneId: "p1" },
        b: { type: "split", id: "s2", dir: "down", ratio: 0.5, a: { type: "pane", paneId: "p2" }, b: { type: "pane", paneId: "p3" } },
      },
    });
    view.setView("w1", "t1");
    view.focusPane("p3");
    return view;
  }

  it("focusDir: 移動先をクライアントで求めて、応答を待たずに即座にフォーカスを移し、pane.focus を送る（D97）", () => {
    const conn = makeConnection();
    const view = setupLShapedTab();
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "focusDir", dir: "up" });
    expect(view.focusedPaneId).toBe("p2"); // 同期的に（await 無しで）移っている
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p2" }]]);
    dispatcher.run({ type: "focusDir", dir: "left" });
    expect(view.focusedPaneId).toBe("p1");
  });

  it("focusDir: その方向に pane が無ければ何もしない（要求も送らない）", () => {
    const conn = makeConnection();
    const view = setupLShapedTab();
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "focusDir", dir: "right" }); // p3 は右端
    expect(view.focusedPaneId).toBe("p3");
    expect(conn.requests).toEqual([]);
  });

  it("swap: pane.swap を送る（フォーカスは変えない）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "swap", dir: "up" });
    expect(conn.requests).toEqual([["pane.swap", { paneId: "p1", direction: "up" }]]);
    expect(view.focusedPaneId).toBe("p1");
  });

  it("zoom: pane.zoom(mode:'toggle') を送る", () => {
    const conn = makeConnection();
    useViewStore(pinia).focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "zoom" });
    expect(conn.requests).toEqual([["pane.zoom", { paneId: "p1", mode: "toggle" }]]);
  });

  it("フォーカス中の pane が無ければ何もしない", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.run({ type: "split", dir: "right" });
    expect(conn.requests).toEqual([]);
  });
});

describe("ActionDispatcher — cyclePane（レイアウト木の深さ優先）", () => {
  it("2 分割された tab で次/前へ回る（端で反対へ）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.tabUpserted({
      id: "t1",
      workspaceId: "w1",
      label: "t1",
      layout: { type: "split", id: "s1", dir: "right", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } },
      focusedPaneId: "p1",
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    });
    view.setView("w1", "t1");
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "cyclePane", delta: 1 });
    expect(view.focusedPaneId).toBe("p2");
    expect(conn.requests.at(-1)).toEqual(["pane.focus", { paneId: "p2" }]);

    dispatcher.run({ type: "cyclePane", delta: 1 }); // 端から反対へ
    expect(view.focusedPaneId).toBe("p1");

    dispatcher.run({ type: "cyclePane", delta: -1 }); // 前へ（反対へ回る）
    expect(view.focusedPaneId).toBe("p2");
  });
});

describe("ActionDispatcher — tab の切替（delta/index）", () => {
  it("tabDelta: workspace の tabIds の順で動く（端で反対へ）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2", "t3"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.tabUpserted(makeTab("t2", "w1", "p2"));
    session.tabUpserted(makeTab("t3", "w1", "p3"));
    view.setView("w1", "t3");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "tabDelta", delta: 1 }); // 端から反対へ
    expect(view.tabId).toBe("t1");
    expect(view.focusedPaneId).toBe("p1");
  });

  it("tabIndex: 1 始まりで workspace の tabIds を引く", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t2", "w1", "p2"));
    view.setView("w1", "t1");
    makeDispatcher(conn).dispatcher.run({ type: "tabIndex", index: 2 });
    expect(view.tabId).toBe("t2");
    expect(view.focusedPaneId).toBe("p2");
  });
});

describe("ActionDispatcher — newTab（ダイアログを開く。herdr の prompt_new_tab_name）", () => {
  it("newTab は tab.create を直接送らず、ダイアログを開く", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    makeDispatcher(conn).dispatcher.run({ type: "newTab" });
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "newTab", workspaceId: "w1" });
  });

  it("confirmNewTab: tab.create を送り、応答の tab/pane へ切り替える", async () => {
    const conn = makeConnection();
    conn.resolveWith["tab.create"] = { tab: { id: "t9" }, pane: { id: "p9" } };
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "newTab" });
    dispatcher.confirmNewTab("my tab");
    expect(conn.requests).toEqual([["tab.create", { workspaceId: "w1", label: "my tab", newCwd: { policy: "follow" } }]]);
    await flush();
    expect(view.tabId).toBe("t9");
    expect(view.focusedPaneId).toBe("p9");
    expect(view.dialogContext).toBeNull();
  });

  it("confirmNewTab: 空欄なら label を送らない（既定の名前は herdr 側の規約。design「ダイアログ」）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "newTab" });
    dispatcher.confirmNewTab("   ");
    expect(conn.requests).toEqual([["tab.create", { workspaceId: "w1", newCwd: { policy: "follow" } }]]);
  });
});

describe("ActionDispatcher — newWorkspace（名前を尋ねず直接作る。herdr の prompt_new_workspace_name）", () => {
  it("workspace.create を直接送り、応答へ切り替える", async () => {
    const conn = makeConnection();
    conn.resolveWith["workspace.create"] = { workspace: { id: "w9" }, tab: { id: "t9" }, pane: { id: "p9" } };
    const view = useViewStore(pinia);
    makeDispatcher(conn).dispatcher.run({ type: "newWorkspace" });
    expect(conn.requests).toEqual([["workspace.create", { newCwd: { policy: "follow" } }]]); // 焦点の pane が無い → 元の pane を載せない
    await flush();
    expect(view.workspaceId).toBe("w9");
    expect(view.tabId).toBe("t9");
    expect(view.focusedPaneId).toBe("p9");
  });
});

describe("ActionDispatcher — 閉じる前の確認（D23。busy な pane を含むときだけ・workspace は常に）", () => {
  it("closePane: busy でなければ確認せず直接閉じる", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", "t1", false));
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "closePane" });
    expect(conn.requests).toEqual([["pane.close", { paneId: "p1" }]]);
    expect(view.dialogContext).toBeNull();
  });

  it("closePane: busy なら確認ダイアログを開き、直接は閉じない", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", "t1", true));
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "closePane" });
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
  });

  it("closeTab: tab 内のどれかが busy なら確認する", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", "t1", false));
    session.paneUpserted(makePane("p2", "t1", true));
    view.setView("w1", "t1");
    makeDispatcher(conn).dispatcher.run({ type: "closeTab" });
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "confirmClose", targets: [{ type: "tab", id: "t1" }] });
  });

  it("closeTab: どれも busy でなければ直接閉じる", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", "t1", false));
    view.setView("w1", "t1");
    makeDispatcher(conn).dispatcher.run({ type: "closeTab" });
    expect(conn.requests).toEqual([["tab.close", { tabId: "t1" }]]);
  });

  it("closeWorkspace: busy かどうかによらず常に確認する", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    makeDispatcher(conn).dispatcher.run({ type: "closeWorkspace" });
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
  });

  it("confirmClose: 対象それぞれの close を送り、ダイアログを閉じる", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p1" }] });
    makeDispatcher(conn).dispatcher.confirmClose();
    expect(conn.requests).toEqual([["pane.close", { paneId: "p1" }]]);
    expect(view.dialogContext).toBeNull();
  });

  // 20260923-workspace-grouping（herdr の close_group 相当）。
  it("confirmClose: workspace 対象には closeLinkedWorktrees を渡す（既定 false）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
    makeDispatcher(conn).dispatcher.confirmClose();
    expect(conn.requests).toEqual([["workspace.close", { workspaceId: "w1", closeLinkedWorktrees: false }]]);
  });

  it("confirmClose: チェックボックスの状態（true）を workspace.close にそのまま渡す", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "workspace", id: "w1" }] });
    makeDispatcher(conn).dispatcher.confirmClose(true);
    expect(conn.requests).toEqual([["workspace.close", { workspaceId: "w1", closeLinkedWorktrees: true }]]);
  });

  // タスク点検の指摘：`ConfirmDialog.vue` のチェックボックスは workspace 対象1件のときだけ出るので、
  // 万一 workspace 対象が複数になる呼び出し元が現れても、誤って全部に closeLinkedWorktrees を適用しない。
  it("confirmClose: workspace 対象が複数あるときは closeLinkedWorktrees を適用しない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({
      kind: "confirmClose",
      targets: [
        { type: "workspace", id: "w1" },
        { type: "workspace", id: "w2" },
      ],
    });
    makeDispatcher(conn).dispatcher.confirmClose(true);
    expect(conn.requests).toEqual([
      ["workspace.close", { workspaceId: "w1", closeLinkedWorktrees: false }],
      ["workspace.close", { workspaceId: "w2", closeLinkedWorktrees: false }],
    ]);
  });
});

// 20260924-pane-dnd-split-move（review 指摘 must）：中央ドロップでの分割解除（pane.replace）は
// ドロップ先のプロセスを実際に終了させるため、既存の busy pane 確認（D23。上の describe）と
// 同じ安全策を踏襲する。
describe("ActionDispatcher — D&D での分割解除の確認（busy なドロップ先だけ。review 指摘 must）", () => {
  it("replacePaneWithDrag: ドロップ先が busy でなければ確認せず直接送る", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p2", "t1", false));
    makeDispatcher(conn).dispatcher.replacePaneWithDrag("p1", "p2");
    expect(conn.requests).toEqual([["pane.replace", { paneId: "p1", targetPaneId: "p2" }]]);
    expect(view.dialogContext).toBeNull();
  });

  it("replacePaneWithDrag: ドロップ先が busy なら確認ダイアログを開き、直接は送らない", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p2", "t1", true));
    makeDispatcher(conn).dispatcher.replacePaneWithDrag("p1", "p2");
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "confirmReplacePane", paneId: "p1", targetPaneId: "p2" });
  });

  it("confirmReplacePane: 確定すると pane.replace を送り、ダイアログを閉じる", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmReplacePane", paneId: "p1", targetPaneId: "p2" });
    makeDispatcher(conn).dispatcher.confirmReplacePane();
    expect(conn.requests).toEqual([["pane.replace", { paneId: "p1", targetPaneId: "p2" }]]);
    expect(view.dialogContext).toBeNull();
  });

  it("confirmReplacePane: 別の種類のダイアログが開いていたら何もしない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p9" }] });
    makeDispatcher(conn).dispatcher.confirmReplacePane();
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "confirmClose", targets: [{ type: "pane", id: "p9" }] });
  });
});

describe("ActionDispatcher — D&D による別 tab・別 workspace への移動（20260924-pane-move-cross-tab）", () => {
  it("movePaneToTab: pane.move_to_tab を送り、応答が ok なら移動先の tab（別 workspace 含む）へ表示を切り替える（AC8・AC-I4）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.move_to_tab"] = { ok: true };
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w2", ["t2"]));
    session.tabUpserted(makeTab("t2", "w2"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.movePaneToTab("p1", "t2");
    expect(conn.requests).toEqual([["pane.move_to_tab", { paneId: "p1", targetTabId: "t2" }]]);
    // 応答が返るまでは表示を切り替えない（design「エラー処理」。失敗時に何も起きていないのと区別する）。
    expect(view.workspaceId).toBe("w1");
    await flush();
    expect(view.workspaceId).toBe("w2");
    expect(view.tabId).toBe("t2");
    expect(view.focusedPaneId).toBe("p1");
  });

  it("movePaneToTab: 応答を待つ間にユーザーが別の tab へ既に移っていたら、応答到着時に view を追わない（review round1 の should 指摘）", async () => {
    const conn = makeConnection();
    let resolveMove: (v: unknown) => void = () => undefined;
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return new Promise((r) => (resolveMove = r as (v: unknown) => void));
    };
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w2", ["t2"]));
    session.tabUpserted(makeTab("t2", "w2"));
    session.tabUpserted(makeTab("t9", "w1"));
    view.setView("w1", "t1");
    const { dispatcher, registry } = makeDispatcher(conn);
    const focusSpy = vi.spyOn(registry, "focus");

    dispatcher.movePaneToTab("p1", "t2");
    view.setView("w1", "t9"); // 応答が返る前に、ユーザーが別の tab へ既に移っている
    resolveMove({ ok: true });
    await flush();

    // 応答到着時に t2 へ強制的に引き戻されない——ユーザーが今いる t9 のまま。
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t9");
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("movePaneToTab: 応答が ok:true でも移動先 tab がまだ session に同期されていなければ何もしない（focus だけ動いて表示と食い違う事故を防ぐ。taskcheck 指摘）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.move_to_tab"] = { ok: true };
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    view.focusPane("p0"); // 表示中の tab で今 focus されている、移動する pane（p1）とは別の pane
    const { dispatcher, registry } = makeDispatcher(conn);
    const focusSpy = vi.spyOn(registry, "focus");
    dispatcher.movePaneToTab("p1", "t-unknown");
    await flush();
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    // 表示は t1・p0 のまま——ここで p1 に focus だけ動くと、画面（p0）とキー入力の宛先（p1）が食い違う。
    expect(view.focusedPaneId).toBe("p0");
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("movePaneToTab: 応答が ok:false なら表示を切り替えない（自分自身の tab・存在しない tab 等）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.move_to_tab"] = { ok: false };
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.movePaneToTab("p1", "t9");
    await flush();
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
  });

  it("movePaneToNewTab: pane.move_to_new_tab を送り、応答の tab（別 workspace の新しい tab）へ表示を切り替える（AC9・AC-I4）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.move_to_new_tab"] = { ok: true, tab: makeTab("t9", "w2", "p1") };
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.movePaneToNewTab("p1", "w2");
    expect(conn.requests).toEqual([["pane.move_to_new_tab", { paneId: "p1", targetWorkspaceId: "w2" }]]);
    expect(view.workspaceId).toBe("w1");
    await flush();
    expect(view.workspaceId).toBe("w2");
    expect(view.tabId).toBe("t9");
    expect(view.focusedPaneId).toBe("p1");
  });

  it("movePaneToNewTab: 応答を待つ間にユーザーが別の tab へ既に移っていたら、応答到着時に view を追わない（review round1 の should 指摘）", async () => {
    const conn = makeConnection();
    let resolveMove: (v: unknown) => void = () => undefined;
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return new Promise((r) => (resolveMove = r as (v: unknown) => void));
    };
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.tabUpserted(makeTab("t9", "w1"));
    view.setView("w1", "t1");
    const { dispatcher, registry } = makeDispatcher(conn);
    const focusSpy = vi.spyOn(registry, "focus");

    dispatcher.movePaneToNewTab("p1", "w2");
    view.setView("w1", "t9"); // 応答が返る前に、ユーザーが別の tab へ既に移っている
    resolveMove({ ok: true, tab: makeTab("t-new", "w2", "p1") });
    await flush();

    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t9");
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("movePaneToNewTab: 応答が ok:false なら表示を切り替えない", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.move_to_new_tab"] = { ok: false };
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.movePaneToNewTab("p1", "w9");
    await flush();
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
  });
});

describe("ActionDispatcher — navigate", () => {
  it("enterMode(navigate) は現在の workspace を選択の初期値にする", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    makeDispatcher(conn).dispatcher.run({ type: "enterMode", mode: "navigate" });
    expect(view.navigateSelection).toBe("w1");
  });

  it("enterMode(copy/resize) は navigateSelection を変えない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    makeDispatcher(conn).dispatcher.run({ type: "enterMode", mode: "copy" });
    expect(view.navigateSelection).toBeNull();
  });

  it("up/down は workspace の一覧を順に回る（端で反対へ）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    session.workspaceUpserted(makeWorkspace("w2"));
    view.setNavigateSelection("w1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "navigate", op: "down" });
    expect(view.navigateSelection).toBe("w2");
    dispatcher.run({ type: "navigate", op: "down" }); // 端から反対へ
    expect(view.navigateSelection).toBe("w1");
    dispatcher.run({ type: "navigate", op: "up" });
    expect(view.navigateSelection).toBe("w2");
  });

  // レビューの指摘（must）：`workspaceDelta` と同じ回帰。`navigate`（サイドバーの選択ジャンプ）の
  // up/down も画面の並び（`Sidebar.vue` の `sidebar-row-selected` が乗る行）を辿る対象なので、
  // グループを考慮しない素の反復順のままでは選択が画面上の隣と食い違う。
  it("up/down はグループがあっても画面上の並び（グループはまとめて1ブロック）を辿る", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    // 開いた順（flat）は A, C, B。A・B は手動グループ g1 のメンバー、C は無所属。
    // 画面には「A（グループ先頭）→ B（グループ2番目）→ C（グループ外）」の順で表示される。
    session.workspaceUpserted(makeWorkspace("A", [], { groupId: "g1" }));
    session.workspaceUpserted(makeWorkspace("C"));
    session.workspaceUpserted(makeWorkspace("B", [], { groupId: "g1" }));
    session.groupUpserted({ id: "g1", label: "grp", collapsed: false });
    const view = useViewStore(pinia);
    view.setNavigateSelection("A");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "navigate", op: "down" });
    expect(view.navigateSelection).toBe("B"); // 画面上の隣（C ではない）
  });

  it("activate: 選択中の workspace の activeTabId へ切り替え、workspace.focus を送る", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1", ["t1"]), activeTabId: "t1" });
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    view.setNavigateSelection("w1");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "activate" });
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(view.focusedPaneId).toBe("p1");
    expect(view.navigateSelection).toBeNull();
    expect(conn.requests).toEqual([["workspace.focus", { workspaceId: "w1" }]]);
  });

  it("cancel: 選択を消すだけで何も送らない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.setNavigateSelection("w1");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "cancel" });
    expect(view.navigateSelection).toBeNull();
    expect(conn.requests).toEqual([]);
  });

  it("openMenu: 選択があれば navigateMenuRequested を立てる。DOM には一切触れない（20260925-sidebar-keyboard-menu。design「設計方針」）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.setNavigateSelection("w1");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "openMenu" });
    expect(view.navigateMenuRequested).toBe(true);
    expect(view.navigateSelection).toBe("w1"); // 選択は消えない（activate と違う）
    expect(conn.requests).toEqual([]);
  });

  it("openMenu: 選択が無ければ何もしない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "openMenu" });
    expect(view.navigateMenuRequested).toBe(false);
  });

  it("paneDir は focusDir と同じ経路を使う", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted({ ...makeTab("t1", "w1", "p1"), layout: { type: "split", id: "s1", dir: "down", ratio: 0.5, a: { type: "pane", paneId: "p1" }, b: { type: "pane", paneId: "p2" } } });
    view.setView("w1", "t1");
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "paneDir", dir: "down" });
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p2" }]]);
    expect(view.focusedPaneId).toBe("p2");
  });
});

describe("ActionDispatcher — resizeBy", () => {
  it("pane.resize を送る", () => {
    const conn = makeConnection();
    useViewStore(pinia).focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "resizeBy", dir: "left", amount: 0.05 });
    expect(conn.requests).toEqual([["pane.resize", { paneId: "p1", direction: "left", amount: 0.05 }]]);
  });
});

describe("ActionDispatcher — copy（D63：exited の判断はここで行う）", () => {
  it("CopyTarget.apply を呼び、copiedText があればクリップボードへ書き込んでトーストを出す", async () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher, registry } = makeDispatcher(conn);
    const entry = registry.acquire("p1");
    await new Promise<void>((resolve) => entry.term.write("hello", () => resolve()));
    view.focusPane("p1");
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    dispatcher.run({ type: "copy", cmd: { op: "selectStart", linewise: false } });
    dispatcher.run({ type: "copy", cmd: { op: "move", unit: "char", dir: 1 } });
    dispatcher.run({ type: "copy", cmd: { op: "move", unit: "char", dir: 1 } });
    dispatcher.run({ type: "copy", cmd: { op: "yank" } });
    await flush();
    expect(writeTextSpy).toHaveBeenCalled();
    expect(view.toasts.map((t) => t.message)).toContain("コピーしました");
    entry.term.dispose();
  });

  it("exited: true なら keys.setMode('terminal') を呼び、view.mode に反映される", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher, registry, keys } = makeDispatcher(conn);
    const entry = registry.acquire("p1");
    view.focusPane("p1");
    keys.setMode("copy"); // router 自身の状態も 'copy' にしておく（setMode の変化判定に効く）
    expect(view.mode).toBe("copy");
    dispatcher.run({ type: "copy", cmd: { op: "exit" } });
    expect(view.mode).toBe("terminal");
    entry.term.dispose();
  });

  it("フォーカス中の pane が無ければ何もしない（例外を投げない）", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    expect(() => dispatcher.run({ type: "copy", cmd: { op: "exit" } })).not.toThrow();
  });

  it("copy モードに入るたび、フォーカス中の pane の CopyTarget.resetCursor を呼ぶ（D94）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher, registry } = makeDispatcher(conn);
    const entry = registry.acquire("p1");
    view.focusPane("p1");
    const spy = vi.spyOn(entry.copy, "resetCursor");

    dispatcher.run({ type: "enterMode", mode: "copy" });
    expect(spy).toHaveBeenCalledTimes(1);

    dispatcher.run({ type: "enterMode", mode: "navigate" }); // copy 以外では呼ばない
    expect(spy).toHaveBeenCalledTimes(1);
    entry.term.dispose();
  });
});

describe("ActionDispatcher — 名前の変更", () => {
  it("renamePane: 現在の名前を入れてダイアログを開く", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted({ ...makePane("p1", "t1"), label: "old" });
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "renamePane" });
    expect(view.dialogContext).toEqual({ kind: "renamePane", paneId: "p1", currentLabel: "old" });
  });

  it("confirmRenamePane: pane.rename を送る", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "old" });
    makeDispatcher(conn).dispatcher.confirmRenamePane("new name");
    expect(conn.requests).toEqual([["pane.rename", { paneId: "p1", label: "new name" }]]);
    expect(view.dialogContext).toBeNull();
  });

  it("confirmRenamePane: 空欄なら label:null を送る（名前の消去と同じ扱い）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "renamePane", paneId: "p1", currentLabel: "old" });
    makeDispatcher(conn).dispatcher.confirmRenamePane("   ");
    expect(conn.requests).toEqual([["pane.rename", { paneId: "p1", label: null }]]);
  });

  it("renameTab/confirmRenameTab: 空欄はサーバの検証（min 1）に合わせて送らない", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.tabUpserted(makeTab("t1", "w1"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "renameTab" });
    expect(view.dialogContext).toMatchObject({ kind: "renameTab", tabId: "t1" });
    dispatcher.confirmRenameTab("");
    expect(conn.requests).toEqual([]); // 空欄は送らない
    expect(view.dialogContext).toBeNull(); // でもダイアログは閉じる

    dispatcher.run({ type: "renameTab" });
    dispatcher.confirmRenameTab("new name");
    expect(conn.requests).toEqual([["tab.rename", { tabId: "t1", label: "new name" }]]);
  });

  it("renameWorkspace/confirmRenameWorkspace", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "renameWorkspace" });
    expect(view.dialogContext).toMatchObject({ kind: "renameWorkspace", workspaceId: "w1" });
    dispatcher.confirmRenameWorkspace("new name");
    expect(conn.requests).toEqual([["workspace.rename", { workspaceId: "w1", label: "new name" }]]);
  });
});

describe("ActionDispatcher — help/goto/toggleSidebar/detach", () => {
  it("help/goto はダイアログを開く", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "help" });
    expect(view.dialogContext).toEqual({ kind: "help" });
    dispatcher.run({ type: "goto" });
    expect(view.dialogContext).toEqual({ kind: "goto" });
  });

  it("toggleSidebar", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    makeDispatcher(conn).dispatcher.run({ type: "toggleSidebar" });
    expect(view.sidebarCollapsed).toBe(true);
  });

  it("detach: client.detach を送る", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.run({ type: "detach" });
    expect(conn.requests).toEqual([["client.detach", {}]]);
  });

});

describe("ActionDispatcher — スクロールバックをエディタで開く（20260926-edit-scrollback）", () => {
  it("焦点の pane を対象に pane.edit_scrollback を送り、応答のエディタの pane へ焦点を移す（AC1）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.edit_scrollback"] = { pane: { id: "p2" } };
    useSessionStore(pinia).paneUpserted(makePane("p2", "t1")); // 実際は pane.created が応答より先に届く
    const view = useViewStore(pinia);
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "editScrollback" });
    await flush();
    expect(conn.requests).toEqual([["pane.edit_scrollback", { paneId: "p1" }]]);
    expect(view.focusedPaneId).toBe("p2");
    expect(view.toasts).toEqual([]);
  });

  it("応答を待つ間に打った文字は、エディタの pane へ届く（D99。拡大表示されているのはその pane 自身）", async () => {
    const conn = makeConnection();
    let resolveEdit: (v: unknown) => void = () => undefined;
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return new Promise((r) => (resolveEdit = r as (v: unknown) => void));
    };
    const gate = new InputGate(conn);
    const view = useViewStore(pinia);
    const session = useSessionStore(pinia);
    view.focusPane("p1");
    const { registry, keys } = makeDispatcher(conn);
    new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } }).run({ type: "editScrollback" });
    gate.sendInput("p1", "/err");
    expect(conn.sendInput).not.toHaveBeenCalled();
    session.tabUpserted({ ...makeTab("t1", "w1", "p2"), zoomedPaneId: "p2" });
    session.paneUpserted(makePane("p2", "t1"));
    resolveEdit({ pane: { id: "p2" } });
    await flush();
    expect(conn.sendInput).toHaveBeenCalledWith("p2", "/err");
  });

  it("失敗したらトーストを出し、焦点も打った文字も元の pane のまま（AC5）", async () => {
    const conn = makeConnection();
    conn.rejectWith["pane.edit_scrollback"] = "spawn_failed";
    const gate = new InputGate(conn);
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { registry, keys } = makeDispatcher(conn);
    new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } }).run({ type: "editScrollback" });
    gate.sendInput("p1", "q");
    await flush();
    expect(view.focusedPaneId).toBe("p1");
    expect(view.toasts.map((t) => t.message)).toEqual(["スクロールバックをエディタで開けませんでした"]);
    expect(conn.sendInput).toHaveBeenCalledWith("p1", "q");
  });

  it("エディタがすぐ終わって応答の時点で pane が無ければ、焦点は元の pane のまま・打った文字も元の pane へ", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.edit_scrollback"] = { pane: { id: "p2" } }; // p2 は session に無い（閉じた）
    const gate = new InputGate(conn);
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { registry, keys } = makeDispatcher(conn);
    new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } }).run({ type: "editScrollback" });
    gate.sendInput("p1", "ls");
    await flush();
    expect(view.focusedPaneId).toBe("p1");
    expect(conn.sendInput).toHaveBeenCalledWith("p1", "ls");
  });

  it("焦点の pane が無ければ何も送らない", async () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.run({ type: "editScrollback" });
    await flush();
    expect(conn.requests).toEqual([]);
  });
});

describe("ActionDispatcher — reloadConfig（設定を読み直す。20260922-appearance-settings-rest。AC13〜AC15）", () => {
  it("localStorage（soda.prefs.v1）の今の値を settings・view ストアへ読み直し、トーストを出す（AC13・AC14）", () => {
    const conn = makeConnection();
    const settings = useSettingsStore(pinia);
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    // ストアを作った時点の既定値（soda.prefs.v1 はまだ空）であることを前提にする。
    expect(settings.statusSymbols).toBe(true);
    expect(settings.newCwdPolicy).toBe("follow");
    expect(settings.paneFrameThickness).toBe("default");
    expect(settings.paneAgentNameVisible).toBe(false);
    expect(settings.themeAuto).toBe(false);
    expect(settings.tabBarPosition).toBe("top");
    expect(settings.tabBarRight).toEqual([]);
    expect(settings.tabBarRightSeparator).toBe(" ");
    expect(settings.paneOuterBorders).toBe(false);
    expect(settings.paneBorders).toBe("always");
    expect(settings.paneGaps).toBe(true);
    expect(settings.shellCwdTracking).toBe(true);
    expect(settings.sidebarRows).toEqual({ spaces: null, agents: null });
    expect(view.sidebarWidth).toBe(240);
    expect(view.sidebarCollapsed).toBe(false);
    expect(view.agentSort).toBe("grouped");
    expect(view.workspaceSort).toBe("opened");

    // 別のタブ・別のダイアログ経由など、この ActionDispatcher インスタンスを経ずに
    // `soda.prefs.v1` が書き変わった状況を模す（reloadConfig の実運用そのままの前提）。
    localStorage.setItem(
      "soda.prefs.v1",
      JSON.stringify({
        statusSymbols: false,
        scrollback: 500,
        newCwdPolicy: "home",
        newCwdPath: "/tmp/x",
        themeAuto: true,
        paneFrameThickness: "thick",
        paneAgentNameVisible: true,
        tabBarPosition: "bottom",
        tabBarRight: [{ kind: "hostname" }],
        tabBarRightSeparator: " / ",
        paneOuterBorders: true,
        paneBorders: "auto",
        paneGaps: false,
        shellCwdTracking: false,
        sidebarRows: { spaces: [[{ token: "$build" }]] },
        sidebarWidth: 300,
        sidebarCollapsed: true,
        agentSort: "priority",
        workspaceSort: "name",
      }),
    );

    dispatcher.run({ type: "reloadConfig" });

    expect(settings.statusSymbols).toBe(false);
    expect(settings.scrollback).toBe(500);
    expect(settings.newCwdPolicy).toBe("home");
    expect(settings.newCwdPath).toBe("/tmp/x");
    expect(settings.themeAuto).toBe(true);
    expect(settings.paneFrameThickness).toBe("thick");
    expect(settings.paneAgentNameVisible).toBe(true);
    expect(settings.tabBarPosition).toBe("bottom");
    expect(settings.tabBarRight).toEqual([{ kind: "hostname" }]);
    expect(settings.tabBarRightSeparator).toBe(" / ");
    expect(settings.paneOuterBorders).toBe(true);
    expect(settings.paneBorders).toBe("auto");
    expect(settings.paneGaps).toBe(false);
    expect(settings.shellCwdTracking).toBe(false); // 20260928-windows-pane-cwd
    expect(settings.sidebarRows).toEqual({ spaces: [[{ token: "$build" }]], agents: null }); // 20260927-sidebar-row-tokens
    expect(view.sidebarWidth).toBe(300);
    expect(view.sidebarCollapsed).toBe(true);
    expect(view.agentSort).toBe("priority");
    expect(view.workspaceSort).toBe("name");
    expect(view.toasts.map((t) => t.message)).toContain("設定を読み直しました。");
  });

  it("壊れた値は既定へ落ちる（load* の壊れた値の扱いをそのまま引き継ぐ）", () => {
    const conn = makeConnection();
    const settings = useSettingsStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    // 既定以外にしてから読み直す（既定のままだと、読み直さなくても既定に見えてしまう。taskcheck T6 の指摘）。
    settings.paneBorders = "off";
    settings.paneGaps = false;
    settings.shellCwdTracking = false;
    localStorage.setItem("soda.prefs.v1", JSON.stringify({ paneFrameThickness: "huge", paneBorders: "framed", paneGaps: "no", shellCwdTracking: "off" }));
    dispatcher.run({ type: "reloadConfig" });
    expect(settings.shellCwdTracking).toBe(true);
    expect(settings.paneFrameThickness).toBe("default");
    expect(settings.paneBorders).toBe("always");
    expect(settings.paneGaps).toBe(true);
  });

  it("workspace・tab・pane の構成・フォーカスには一切触れない（AC15）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.tabUpserted(makeTab("t1", "w1"));
    session.paneUpserted(makePane("p1", "t1"));
    view.setView("w1", "t1");
    view.focusPane("p1");
    const workspacesBefore = new Map(session.workspaces);
    const tabsBefore = new Map(session.tabs);
    const panesBefore = new Map(session.panes);

    localStorage.setItem("soda.prefs.v1", JSON.stringify({ agentSort: "priority" }));
    dispatcher.run({ type: "reloadConfig" });

    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(view.focusedPaneId).toBe("p1");
    expect(session.workspaces).toEqual(workspacesBefore);
    expect(session.tabs).toEqual(tabsBefore);
    expect(session.panes).toEqual(panesBefore);
    // 構成・フォーカスの要求は送らない。送るのは独自コマンドの読み直しだけ（20260927-custom-command-keys の F15）。
    expect(conn.requests, "構成・フォーカスを変える要求は送らない").toEqual([["command.reload", {}]]);
  });
});

describe("ActionDispatcher — メニュー専用の操作（D56 の訂正 10）", () => {
  it("clearPaneName: pane.rename(label:null) を送る", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.clearPaneName("p1");
    expect(conn.requests).toEqual([["pane.rename", { paneId: "p1", label: null }]]);
  });

  it("setRightClickTarget: pane.input.set を送る", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.setRightClickTarget("p1", "pane");
    expect(conn.requests).toEqual([["pane.input.set", { paneId: "p1", rightClick: "pane" }]]);
  });

  it("pasteFromMenu: クリップボードから読んで term.paste する", async () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher, registry } = makeDispatcher(conn);
    const entry = registry.acquire("p1");
    view.focusPane("p1");
    vi.spyOn(navigator.clipboard, "readText").mockResolvedValue("pasted");
    const pasteSpy = vi.spyOn(entry.term, "paste").mockImplementation(() => undefined);
    dispatcher.pasteFromMenu();
    await flush();
    expect(pasteSpy).toHaveBeenCalledWith("pasted");
    entry.term.dispose();
  });

  it("pasteIntoPane: imagePaste があればそちらへ（テキストが無く画像があれば画像も。20260927-clipboard-image-paste）", async () => {
    const conn = makeConnection();
    const imagePaste = { pasteClipboard: vi.fn() };
    const { dispatcher, registry } = makeDispatcher(conn, { imagePaste });
    const entry = registry.acquire("p3");
    const readText = vi.spyOn(navigator.clipboard, "readText");
    dispatcher.pasteIntoPane("p3");
    expect(imagePaste.pasteClipboard).toHaveBeenCalledWith("p3");
    expect(readText).not.toHaveBeenCalled();
    dispatcher.pasteIntoPane("nope"); // 端末の無い pane は何もしない
    expect(imagePaste.pasteClipboard).toHaveBeenCalledTimes(1);
    entry.term.dispose();
  });

  it("pasteIntoPane: 右クリックした pane（フォーカス中とは無関係）へ貼り付ける", async () => {
    const conn = makeConnection();
    const { dispatcher, registry } = makeDispatcher(conn);
    const entry = registry.acquire("p2");
    useViewStore(pinia).focusPane("p1"); // フォーカスは別の pane
    vi.spyOn(navigator.clipboard, "readText").mockResolvedValue("pasted");
    const pasteSpy = vi.spyOn(entry.term, "paste").mockImplementation(() => undefined);
    dispatcher.pasteIntoPane("p2");
    await flush();
    expect(pasteSpy).toHaveBeenCalledWith("pasted");
    entry.term.dispose();
  });
});

describe("ActionDispatcher — UiPort", () => {
  it("openContextMenu/toast は view ストアへ反映する", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 1, y: 2 });
    expect(view.contextMenu).toEqual({ target: { kind: "pane", paneId: "p1" }, at: { x: 1, y: 2 } });
    dispatcher.toast("hi");
    expect(view.toasts.map((t) => t.message)).toContain("hi");
  });
});

describe("ActionDispatcher — T22 向けの「任意の対象」メソッド（フォーカス中/表示中とは限らない）", () => {
  it("splitPane/zoomPane/closePaneById/renamePaneById は指定した paneId を使う（フォーカス中の pane とは無関係）", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.split"] = { pane: { id: "p9" } };
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted({ ...makePane("p2", "t1"), label: "old" });
    view.focusPane("p1"); // フォーカスは別の pane
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.splitPane("p2", "right");
    await flush();
    expect(conn.requests).toContainEqual(["pane.split", { paneId: "p2", direction: "right", newCwd: { policy: "follow" } }]);
    expect(view.focusedPaneId).toBe("p9"); // 新しい pane にはフォーカスする（AC-I4 は維持）

    dispatcher.zoomPane("p2");
    expect(conn.requests).toContainEqual(["pane.zoom", { paneId: "p2", mode: "toggle" }]);

    dispatcher.renamePaneById("p2");
    expect(view.dialogContext).toEqual({ kind: "renamePane", paneId: "p2", currentLabel: "old" });

    dispatcher.closePaneById("p2");
    expect(conn.requests).toContainEqual(["pane.close", { paneId: "p2" }]);
  });

  it("newTabInWorkspace/renameTabById/closeTabById は指定した対象を使う（表示中の workspace/tab とは無関係）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.tabUpserted(makeTab("t9", "w9"));
    view.setView("w1", "t1"); // 表示中は別の workspace/tab
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.newTabInWorkspace("w9");
    expect(view.dialogContext).toEqual({ kind: "newTab", workspaceId: "w9" });

    dispatcher.renameTabById("t9");
    expect(view.dialogContext).toEqual({ kind: "renameTab", tabId: "t9", currentLabel: "t9" });

    dispatcher.closeTabById("t9");
    expect(conn.requests).toContainEqual(["tab.close", { tabId: "t9" }]);
  });

  it("renameWorkspaceById/closeWorkspaceById は指定した対象を使う（表示中の workspace とは無関係）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w9"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.renameWorkspaceById("w9");
    expect(view.dialogContext).toEqual({ kind: "renameWorkspace", workspaceId: "w9", currentLabel: "w9", currentAutoLabel: false });

    dispatcher.closeWorkspaceById("w9");
    expect(view.dialogContext).toEqual({ kind: "confirmClose", targets: [{ type: "workspace", id: "w9" }] });
  });
});

// 20260920-git-worktree-actions。**サーバに聞いてからダイアログを開く**ので、開くまでに 1 往復ある。
describe("ActionDispatcher — worktree", () => {
  const LIST = { worktreeRoot: "/root", repoName: "soda", suggestedBranch: "worktree/brave-river-0000", entries: [{ path: "/w/a", branch: "a" }] };

  it("newWorktree：一覧を取ってから作成のダイアログを開く（AC1）", async () => {
    const conn = makeConnection();
    conn.resolveWith["worktree.list"] = LIST;
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    dispatcher.newWorktree("w1");
    await Promise.resolve();
    await Promise.resolve();
    expect(conn.requests[0]).toEqual(["worktree.list", { workspaceId: "w1" }]);
    expect(view.dialogContext).toMatchObject({ kind: "worktreeCreate", workspaceId: "w1" });
  });

  it("openWorktree：一覧が空ならダイアログを開かず知らせる（AC5）", async () => {
    const conn = makeConnection();
    conn.resolveWith["worktree.list"] = { ...LIST, entries: [] };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    dispatcher.openWorktree("w1");
    await Promise.resolve();
    await Promise.resolve();
    expect(view.dialogContext).toBeNull();
    expect(view.toasts.length).toBe(1);
  });

  it("confirmWorktreeCreate：作ってから、その場所を cwd に workspace を開く（AC3）", async () => {
    const conn = makeConnection();
    conn.resolveWith["worktree.create"] = { path: "/root/soda/feature-x" };
    conn.resolveWith["workspace.create"] = { workspace: makeWorkspace("w2", ["t2"]), tab: makeTab("t2", "w2", "p2"), pane: makePane("p2", "t2") };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: LIST });
    dispatcher.confirmWorktreeCreate("feature/x");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(conn.requests.map(([m]) => m)).toEqual(["worktree.create", "workspace.create"]);
    expect(conn.requests[0]![1]).toEqual({ workspaceId: "w1", branch: "feature/x" });
    // **label にブランチ名を渡す**（review ラウンド1）。渡さなければ worktree のフォルダ名が自動の名前になるが、選んだブランチ名のほうが
    // 情報が多い（20260921-workspace-auto-label。ブランチの 2 行目は上流が無いと出ない）。
    expect(conn.requests[1]![1]).toEqual({ cwd: "/root/soda/feature-x", label: "feature/x" });
  });

  it("confirmWorktreeCreate：空では何も送らない（AC3）", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: LIST });
    dispatcher.confirmWorktreeCreate("   ");
    expect(conn.requests).toEqual([]);
  });

  // AC6：同じ場所の workspace が 2 つできると、どちらで作業していたか分からなくなる。
  it("confirmWorktreeOpen：既に開いている場所ならそこへ移るだけで、workspace.create を呼ばない（AC6）", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w9", ["t9"], { cwd: "/w/a" }));
    session.tabUpserted(makeTab("t9", "w9", "p9"));
    view.focusPane("p-elsewhere"); // 別の workspace の pane を見ている状態から移る
    view.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries: LIST.entries });
    dispatcher.confirmWorktreeOpen("/w/a");
    expect(conn.requests.map(([m]) => m)).not.toContain("workspace.create");
    expect(view.workspaceId).toBe("w9");
    // `setView` は焦点の pane を触らないので、対で移さないと**打鍵が見えていない端末へ流れる**
    // （Sidebar・GotoPicker・goto・PanePicker はどれも対で呼んでいる）。
    expect(view.focusedPaneId, "その tab で最後に見ていた pane へ焦点が移る").toBe("p9");
  });

  it("confirmWorktreeOpen：まだ開いていない場所なら workspace.create を送る（AC5）", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries: LIST.entries });
    dispatcher.confirmWorktreeOpen("/w/a"); // 一覧にある項目（branch: "a"）
    expect(conn.requests[0]).toEqual(["workspace.create", { cwd: "/w/a", label: "a" }]);
  });

  it("confirmWorktreeOpen：branch が null（detached）ならパスの末尾を label にする", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries: [{ path: "/w/detached-here", branch: null }] });
    dispatcher.confirmWorktreeOpen("/w/detached-here");
    expect(conn.requests[0]).toEqual(["workspace.create", { cwd: "/w/detached-here", label: "detached-here" }]);
  });

  // AC7：**この describe が繋がりを見る唯一の場所**。コード→日本語の対応表そのものは clientError.test.ts が
  // 固定しているが、`ActionDispatcher` がその表へ橋渡ししているかは、失敗させてみないと分からない
  // （固定の文言を返す実装に差し替えても、それ以外のテストは全て通ってしまう）。
  async function toastAfterFailure(method: MethodName, code: string, run: (d: ActionDispatcher, v: ReturnType<typeof useViewStore>) => void): Promise<string> {
    const conn = makeConnection();
    conn.resolveWith["worktree.list"] = LIST;
    conn.rejectWith[method] = code;
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    const before = view.toasts.length; // 同じ it の中で 2 回呼ぶので、増えた 1 件だけを見る
    run(dispatcher, view);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(view.toasts.length).toBe(before + 1);
    return view.toasts[before]!.message;
  }

  it("worktree.create の失敗は、コードごとに違う日本語で知らせる（AC7）", async () => {
    const inUse = await toastAfterFailure("worktree.create", "worktree_branch_in_use", (d, v) => {
      v.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: LIST });
      d.confirmWorktreeCreate("feature/x");
    });
    const exists = await toastAfterFailure("worktree.create", "worktree_path_exists", (d, v) => {
      v.openDialogWithContext({ kind: "worktreeCreate", workspaceId: "w1", info: LIST });
      d.confirmWorktreeCreate("feature/x");
    });
    expect(inUse).toBe(clientErrorMessage("worktree_branch_in_use"));
    expect(exists).toBe(clientErrorMessage("worktree_path_exists"));
    expect(inUse).not.toBe(exists);
  });

  it("worktree.list と workspace.create の失敗も、同じ経路で日本語にする（AC7）", async () => {
    const listFailed = await toastAfterFailure("worktree.list", "not_a_git_repository", (d) => d.newWorktree("w1"));
    expect(listFailed).toBe(clientErrorMessage("not_a_git_repository"));

    const openFailed = await toastAfterFailure("workspace.create", "not_found", (d, v) => {
      v.openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries: LIST.entries });
      d.confirmWorktreeOpen("/w/new");
    });
    expect(openFailed).toBe(clientErrorMessage("not_found"));
  });

  it("コードを読み取れない失敗は、汎用の文言に落とす（AC7）", async () => {
    const message = await toastAfterFailure("worktree.list", "", (d) => d.openWorktree("w1"));
    expect(message).toBe("worktree の操作に失敗しました。");
  });
});

// 20260924-worktree-remove。
describe("ActionDispatcher — worktree の削除", () => {
  it("removeWorktree：開いている workspace の cwd と一致しなければ openWorkspaceId は null（AC1）", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    dispatcher.removeWorktree("w1", "/w/a");
    expect(view.dialogContext).toEqual({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
  });

  it("removeWorktree：開いている workspace の cwd と一致すれば、その id が openWorkspaceId に入る（AC4）", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const session = useSessionStore(pinia);
    session.workspaceUpserted(makeWorkspace("w9", ["t9"], { cwd: "/w/a" }));
    dispatcher.removeWorktree("w1", "/w/a");
    expect(useViewStore(pinia).dialogContext).toEqual({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w9" });
  });

  it("confirmWorktreeRemove：worktree.remove(force:false) を送り、成功すると一覧を開き直す（AC2・AC3・AC-I1）", async () => {
    const conn = makeConnection();
    conn.resolveWith["worktree.remove"] = {};
    conn.resolveWith["worktree.list"] = { worktreeRoot: "/root", repoName: "soda", suggestedBranch: "s", entries: [] };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });

    dispatcher.confirmWorktreeRemove();

    expect(conn.requests[0]).toEqual(["worktree.remove", { workspaceId: "w1", path: "/w/a", force: false }]);
    expect(view.dialogContext).toBeNull(); // 送った時点で一覧の確認ダイアログは閉じている
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(conn.requests.map(([m]) => m)).toContain("worktree.list"); // 成功後、一覧を開き直す
  });

  it("confirmWorktreeRemove：削除対象が一覧を開いた元の workspace 自身なら、成功後に openWorktree を呼ばない（review round1 の should 指摘。AC3）", async () => {
    const conn = makeConnection();
    conn.resolveWith["worktree.remove"] = {};
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    // openWorkspaceId === sourceWorkspaceId：一覧を開いた元の workspace 自身を削除する。
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w1" });

    dispatcher.confirmWorktreeRemove();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // w1 はサーバ側で既に閉じられている——そこから一覧を開き直すと not_found になるので呼ばない
    // （view の移動先は既存の repairView に任せる）。
    expect(conn.requests.map(([m]) => m)).not.toContain("worktree.list");
  });

  it("応答を待つ間に他のダイアログが開いていたら、成功しても奪わない（review round1 の should 指摘）", async () => {
    const conn = makeConnection();
    let resolveRemove: (v: unknown) => void = () => undefined;
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return new Promise((r) => (resolveRemove = r as (v: unknown) => void));
    };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });

    dispatcher.confirmWorktreeRemove();
    view.openDialogWithContext({ kind: "help" }); // 応答が返る前に、別の操作で別のダイアログが開いた
    resolveRemove({});
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(conn.requests.map(([m]) => m)).not.toContain("worktree.list"); // 一覧を開き直して奪わない
    expect(view.dialogContext).toEqual({ kind: "help" }); // 開いていたダイアログのまま
  });

  it("応答を待つ間に他のダイアログが開いていたら、dirty で失敗しても --force 確認を開かない（同上）", async () => {
    const conn = makeConnection();
    let rejectRemove: (err: unknown) => void = () => undefined;
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return new Promise((_r, rej) => (rejectRemove = rej));
    };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });

    dispatcher.confirmWorktreeRemove();
    view.openDialogWithContext({ kind: "help" });
    rejectRemove(new Error("worktree_dirty: from server"));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(view.dialogContext).toEqual({ kind: "help" }); // confirmWorktreeRemoveForce に奪われない
  });

  it("confirmWorktreeRemove：dirty で失敗すると、一覧へは戻らず --force 確認を開く（AC6・AC7）", async () => {
    const conn = makeConnection();
    conn.rejectWith["worktree.remove"] = "worktree_dirty";
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w9" });

    dispatcher.confirmWorktreeRemove();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(view.dialogContext).toEqual({
      kind: "confirmWorktreeRemoveForce",
      sourceWorkspaceId: "w1",
      path: "/w/a",
      openWorkspaceId: "w9",
      reason: "dirty",
    });
    expect(conn.requests.map(([m]) => m)).not.toContain("worktree.list"); // まだ一覧には戻らない
    expect(view.toasts.length).toBe(0); // dirty はトーストではなく確認で伝える
  });

  // 20260925-worktree-remove-locked。dirty と同じ --force 確認フローへ合流するが、reason は
  // "locked"——ConfirmDialog.vue の文言を出し分ける入力になる（AC2）。
  it("confirmWorktreeRemove：ロック済みで失敗すると、一覧へは戻らず reason: locked の --force 確認を開く（AC2）", async () => {
    const conn = makeConnection();
    conn.rejectWith["worktree.remove"] = "worktree_locked";
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: "w9" });

    dispatcher.confirmWorktreeRemove();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(view.dialogContext).toEqual({
      kind: "confirmWorktreeRemoveForce",
      sourceWorkspaceId: "w1",
      path: "/w/a",
      openWorkspaceId: "w9",
      reason: "locked",
    });
    expect(conn.requests.map(([m]) => m)).not.toContain("worktree.list"); // まだ一覧には戻らない
    expect(view.toasts.length).toBe(0); // ロックもトーストではなく確認で伝える
  });

  it("confirmWorktreeRemove：dirty 以外の失敗は、トーストで知らせてから一覧を開き直す（AC9）", async () => {
    const conn = makeConnection();
    conn.rejectWith["worktree.remove"] = "worktree_not_a_worktree";
    // entries を空にしない——空だと openWorktree 自身が追加のトーストを出し、件数の検証が壊れる。
    conn.resolveWith["worktree.list"] = { worktreeRoot: "/root", repoName: "soda", suggestedBranch: "s", entries: [{ path: "/w/other", branch: "other" }] };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });

    dispatcher.confirmWorktreeRemove();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(view.toasts.length).toBe(1);
    expect(view.toasts[0]!.message).toBe(clientErrorMessage("worktree_not_a_worktree"));
    expect(conn.requests.map(([m]) => m)).toContain("worktree.list"); // 一覧を開き直して戻す
  });

  it("confirmWorktreeRemoveForce：worktree.remove(force:true) を送る（AC8）", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "dirty" });

    dispatcher.confirmWorktreeRemoveForce();

    expect(conn.requests[0]).toEqual(["worktree.remove", { workspaceId: "w1", path: "/w/a", force: true }]);
  });

  it("confirmWorktreeRemoveForce：force 済みの再試行が再び dirty で失敗しても、--force 確認を繰り返さない（無限ループ防止）", async () => {
    const conn = makeConnection();
    conn.rejectWith["worktree.remove"] = "worktree_dirty";
    // entries を空にしない——空だと openWorktree 自身が追加のトーストを出し、件数の検証が壊れる。
    conn.resolveWith["worktree.list"] = { worktreeRoot: "/root", repoName: "soda", suggestedBranch: "s", entries: [{ path: "/w/other", branch: "other" }] };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemoveForce", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null, reason: "dirty" });

    dispatcher.confirmWorktreeRemoveForce();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // トーストで知らせて一覧を開き直す（confirmWorktreeRemoveForce をもう一度開いて無限に確認を
    // 繰り返すことはしない——`force: true` での再試行は `!force` のガードで dirty 分岐に入らない）。
    expect(view.dialogContext).toMatchObject({ kind: "worktreeOpen" });
    expect(view.toasts.length).toBe(1);
    expect(conn.requests.map(([m]) => m)).toContain("worktree.list");
  });

  it("confirmWorktreeRemove：別の種類のダイアログが開いていたら何もしない", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmClose", targets: [{ type: "pane", id: "p9" }] });
    dispatcher.confirmWorktreeRemove();
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "confirmClose", targets: [{ type: "pane", id: "p9" }] });
  });

  it("confirmWorktreeRemoveForce：別の種類のダイアログが開いていたら何もしない", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
    dispatcher.confirmWorktreeRemoveForce();
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext).toEqual({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w1", path: "/w/a", openWorkspaceId: null });
  });
});

// 20260923-workspace-grouping。
describe("ActionDispatcher — workspace の並べ替え", () => {
  it("moveWorkspace: 表示中の workspace を対象に workspace.move を送る", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1"));
    view.setView("w1", "t1");
    makeDispatcher(conn).dispatcher.run({ type: "moveWorkspace", direction: "next" });
    expect(conn.requests).toEqual([["workspace.move", { workspaceId: "w1", direction: "next" }]]);
  });

  it("moveWorkspace: 表示中の workspace が無ければ何も送らない", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.run({ type: "moveWorkspace", direction: "previous" });
    expect(conn.requests).toEqual([]);
  });

  // タスク点検の指摘：`moveTab` と同じく、閉じた直後の stale な id では送らない。
  it("moveWorkspace: 表示中とされている workspace がもう session に存在しなければ何も送らない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.setView("w9", "t9"); // session には無い id
    makeDispatcher(conn).dispatcher.run({ type: "moveWorkspace", direction: "next" });
    expect(conn.requests).toEqual([]);
  });

  const legacyArg = { workspaceIds: ["w1", "w2"], beforeWorkspaceId: "w3" };

  it("moveItemByDrag: layout を持つサーバには item.move（項目と落とし先の項目）を送る", () => {
    const conn = makeConnection();
    useSessionStore(pinia).layoutChanged({ top: ["r:/r/.git", "w:w3"], groups: {}, ungrouped: [] });
    makeDispatcher(conn).dispatcher.moveItemByDrag({ kind: "workspace", workspaceId: "w1" }, { kind: "workspace", workspaceId: "w3" }, legacyArg);
    expect(conn.requests).toEqual([["item.move", { item: { kind: "workspace", workspaceId: "w1" }, before: { kind: "workspace", workspaceId: "w3" } }]]);
  });

  it("moveItemByDrag: グループも項目として送る", () => {
    const conn = makeConnection();
    useSessionStore(pinia).layoutChanged({ top: ["g:g1", "w:w3"], groups: { g1: [] }, ungrouped: [] });
    makeDispatcher(conn).dispatcher.moveItemByDrag({ kind: "group", groupId: "g1" }, { kind: "workspace", workspaceId: "w3" }, legacyArg);
    expect(conn.requests).toEqual([["item.move", { item: { kind: "group", groupId: "g1" }, before: { kind: "workspace", workspaceId: "w3" } }]]);
  });

  it("moveItemByDrag: layout の無い古いサーバには workspace.move_to（id の集まりと落とし先）を送る", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.moveItemByDrag({ kind: "workspace", workspaceId: "w1" }, { kind: "workspace", workspaceId: "w3" }, legacyArg);
    expect(conn.requests).toEqual([["workspace.move_to", { workspaceIds: ["w1", "w2"], beforeWorkspaceId: "w3" }]]);
  });

  it("moveItemByDrag: item.move が失敗したら「移動できませんでした」と知らせる", async () => {
    const conn = makeConnection();
    conn.rejectWith["item.move"] = "internal";
    useSessionStore(pinia).layoutChanged({ top: ["w:w1", "w:w3"], groups: {}, ungrouped: [] });
    makeDispatcher(conn).dispatcher.moveItemByDrag({ kind: "workspace", workspaceId: "w1" }, { kind: "workspace", workspaceId: "w3" }, legacyArg);
    await new Promise((r) => setTimeout(r, 0));
    expect(useViewStore(pinia).toasts.map((t) => t.message)).toEqual(["移動できませんでした"]);
  });

  it("moveItemByDrag: 古いサーバで動かす workspace が無い（空のグループ）なら何も送らない（workspaceIds: [] を送らない）", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.moveItemByDrag({ kind: "group", groupId: "g1" }, { kind: "workspace", workspaceId: "w3" }, { workspaceIds: [], beforeWorkspaceId: "w3" });
    expect(conn.requests).toEqual([]);
  });

  it("moveItemByDrag: 古いサーバで落とし先の workspace が無い（空のグループの上）なら何も送らない（null は末尾の意味になる）", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.moveItemByDrag({ kind: "workspace", workspaceId: "w1" }, { kind: "group", groupId: "g1" }, { workspaceIds: ["w1"], beforeWorkspaceId: null });
    expect(conn.requests).toEqual([]);
  });
});

describe("ActionDispatcher — 手動グループ（herdr に前例が無い独自拡張）", () => {
  it("createGroupForWorkspace: createGroup ダイアログを開く", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    makeDispatcher(conn).dispatcher.createGroupForWorkspace("w1");
    expect(view.dialogContext).toEqual({ kind: "createGroup", workspaceId: "w1" });
  });

  it("confirmCreateGroup: group.create してから、返ってきた id で group.add_member を送る", async () => {
    const conn = makeConnection();
    conn.resolveWith["group.create"] = { group: { id: "g9", label: "backend", collapsed: false } };
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "createGroup", workspaceId: "w1" });
    makeDispatcher(conn).dispatcher.confirmCreateGroup("backend");
    expect(view.dialogContext).toBeNull(); // 応答を待たずに閉じる
    await flush();
    expect(conn.requests).toEqual([
      ["group.create", { label: "backend" }],
      ["group.add_member", { groupId: "g9", workspaceId: "w1" }],
    ]);
  });

  it("confirmCreateGroup: 空欄では確定しない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "createGroup", workspaceId: "w1" });
    makeDispatcher(conn).dispatcher.confirmCreateGroup("   ");
    expect(conn.requests).toEqual([]);
  });

  // タスク点検の指摘：group.create 自体の失敗と、それに続く group.add_member だけの失敗を
  // 別の文言にする（後者はグループ自体は作成済みなので「作成できませんでした」は誤り）。
  it("confirmCreateGroup: group.create が失敗したら「作成できませんでした」と知らせる", async () => {
    const conn = makeConnection();
    conn.rejectWith["group.create"] = "not_found";
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "createGroup", workspaceId: "w1" });
    makeDispatcher(conn).dispatcher.confirmCreateGroup("backend");
    await flush();
    expect(view.toasts.map((t) => t.message)).toContain("グループを作成できませんでした");
  });

  it("confirmCreateGroup: group.create は成功したが group.add_member が失敗したら、別の文言で知らせる", async () => {
    const conn = makeConnection();
    conn.resolveWith["group.create"] = { group: { id: "g9", label: "backend", collapsed: false } };
    conn.rejectWith["group.add_member"] = "not_found";
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "createGroup", workspaceId: "w1" });
    makeDispatcher(conn).dispatcher.confirmCreateGroup("backend");
    await flush();
    expect(view.toasts.map((t) => t.message)).toContain("グループは作成しましたが、workspace の追加に失敗しました。");
    expect(view.toasts.map((t) => t.message)).not.toContain("グループを作成できませんでした");
  });

  // 20261004-group-worktree-items：`layout` を持つサーバは 1 回、持たない古いサーバは今までどおり。
  describe("layout を持つサーバ", () => {
    it("confirmCreateGroup: group.create に workspaceId を添えて 1 回だけ送る", async () => {
      const conn = makeConnection();
      useSessionStore(pinia).layoutChanged({ top: [], groups: {}, ungrouped: [] });
      const view = useViewStore(pinia);
      view.openDialogWithContext({ kind: "createGroup", workspaceId: "w1" });
      makeDispatcher(conn).dispatcher.confirmCreateGroup("backend");
      await flush();
      expect(conn.requests).toEqual([["group.create", { label: "backend", workspaceId: "w1" }]]);
    });

    it("confirmAddToGroup: 項目の workspace が複数でも group.add_member は 1 回", () => {
      const conn = makeConnection();
      const session = useSessionStore(pinia);
      session.layoutChanged({ top: ["g:g1"], groups: { g1: [] }, ungrouped: [] });
      const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
      session.workspaceUpserted(makeWorkspace("w1", [], { git: git(false) }));
      session.workspaceUpserted(makeWorkspace("w2", [], { git: git(true) }));
      useViewStore(pinia).openDialogWithContext({ kind: "addToGroup", workspaceId: "w2", groups: [] });
      makeDispatcher(conn).dispatcher.confirmAddToGroup("g1");
      expect(conn.requests).toEqual([["group.add_member", { groupId: "g1", workspaceId: "w2" }]]);
    });

    it("removeWorkspaceFromGroup: group.remove_member は 1 回", () => {
      const conn = makeConnection();
      const session = useSessionStore(pinia);
      session.layoutChanged({ top: [], groups: {}, ungrouped: [] });
      const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
      session.workspaceUpserted(makeWorkspace("w1", [], { git: git(false) }));
      session.workspaceUpserted(makeWorkspace("w2", [], { git: git(true) }));
      makeDispatcher(conn).dispatcher.removeWorkspaceFromGroup("w2");
      expect(conn.requests).toEqual([["group.remove_member", { workspaceId: "w2" }]]);
    });

    it("moveGroupBy: item.move_by を送る", () => {
      const conn = makeConnection();
      useSessionStore(pinia).layoutChanged({ top: ["g:g1"], groups: { g1: [] }, ungrouped: [] });
      makeDispatcher(conn).dispatcher.moveGroupBy("g1", "next");
      expect(conn.requests).toEqual([["item.move_by", { item: { kind: "group", groupId: "g1" }, direction: "next" }]]);
    });

    it("moveGroupBy: 名前順のときは送らず「名前順では並べ替えできません」と知らせる", () => {
      const conn = makeConnection();
      useSessionStore(pinia).layoutChanged({ top: ["g:g1"], groups: { g1: [] }, ungrouped: [] });
      const view = useViewStore(pinia);
      view.workspaceSort = "name";
      makeDispatcher(conn).dispatcher.moveGroupBy("g1", "previous");
      expect(conn.requests).toEqual([]);
      expect(view.toasts.map((t) => t.message)).toContain("名前順では並べ替えできません");
    });
  });

  describe("layout の無い古いサーバ（今までの RPC）", () => {
    function setUpRepo(session: ReturnType<typeof useSessionStore>): void {
      const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
      session.workspaceUpserted(makeWorkspace("w1", [], { git: git(false) }));
      session.workspaceUpserted(makeWorkspace("w2", [], { git: git(true) }));
    }

    it("confirmAddToGroup: 項目の workspace 全部（repoMembers の順）に group.add_member を順に送る", async () => {
      const conn = makeConnection();
      const session = useSessionStore(pinia);
      setUpRepo(session);
      useViewStore(pinia).openDialogWithContext({ kind: "addToGroup", workspaceId: "w2", groups: [] });
      makeDispatcher(conn).dispatcher.confirmAddToGroup("g1");
      await flush();
      expect(conn.requests).toEqual([
        ["group.add_member", { groupId: "g1", workspaceId: "w1" }],
        ["group.add_member", { groupId: "g1", workspaceId: "w2" }],
      ]);
    });

    it("removeWorkspaceFromGroup: 項目の workspace 全部に group.remove_member を順に送る", async () => {
      const conn = makeConnection();
      const session = useSessionStore(pinia);
      setUpRepo(session);
      makeDispatcher(conn).dispatcher.removeWorkspaceFromGroup("w2");
      await flush();
      expect(conn.requests).toEqual([
        ["group.remove_member", { workspaceId: "w1" }],
        ["group.remove_member", { workspaceId: "w2" }],
      ]);
    });

    it("confirmCreateGroup: 2 段（group.create の後に項目の workspace 全部へ add_member）", async () => {
      const conn = makeConnection();
      conn.resolveWith["group.create"] = { group: { id: "g9", label: "backend", collapsed: false } };
      const session = useSessionStore(pinia);
      setUpRepo(session);
      useViewStore(pinia).openDialogWithContext({ kind: "createGroup", workspaceId: "w2" });
      makeDispatcher(conn).dispatcher.confirmCreateGroup("backend");
      await flush();
      expect(conn.requests).toEqual([
        ["group.create", { label: "backend" }],
        ["group.add_member", { groupId: "g9", workspaceId: "w1" }],
        ["group.add_member", { groupId: "g9", workspaceId: "w2" }],
      ]);
    });
  });

  it("openGroupPicker: 選択肢はレイアウトの順で、移すときは今のグループを除く（moving 付き）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    session.groupUpserted({ id: "g1", label: "a", collapsed: false });
    session.groupUpserted({ id: "g2", label: "b", collapsed: false });
    session.groupUpserted({ id: "g3", label: "c", collapsed: false });
    session.workspaceUpserted(makeWorkspace("w1", [], { groupId: "g2" }));
    session.layoutChanged({ top: ["g:g3", "g:g2", "g:g1"], groups: { g1: [], g2: ["w:w1"], g3: [] }, ungrouped: [] });
    makeDispatcher(conn).dispatcher.openGroupPicker("w1");
    const ctx = useViewStore(pinia).dialogContext;
    expect(ctx).toMatchObject({ kind: "addToGroup", workspaceId: "w1", moving: true });
    expect(ctx?.kind === "addToGroup" && ctx.groups.map((g) => g.id)).toEqual(["g3", "g1"]);
  });

  it("renameGroupById: 現在の名前を入れて renameGroup ダイアログを開く", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    makeDispatcher(conn).dispatcher.renameGroupById("g1");
    expect(useViewStore(pinia).dialogContext).toEqual({ kind: "renameGroup", groupId: "g1", currentLabel: "backend" });
  });

  it("confirmRenameGroup: group.rename を送る。空欄では確定しない", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "renameGroup", groupId: "g1", currentLabel: "backend" });
    makeDispatcher(conn).dispatcher.confirmRenameGroup("frontend");
    expect(conn.requests).toEqual([["group.rename", { groupId: "g1", label: "frontend" }]]);

    view.openDialogWithContext({ kind: "renameGroup", groupId: "g1", currentLabel: "backend" });
    makeDispatcher(conn).dispatcher.confirmRenameGroup("  ");
    expect(conn.requests).toHaveLength(1); // 増えていない
  });

  it("deleteGroupById: group.delete を送る（確認は無し。design どおり）", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.deleteGroupById("g1");
    expect(conn.requests).toEqual([["group.delete", { groupId: "g1" }]]);
  });

  // タスク点検の指摘：値を計算して送るのではなく、サーバに反転させる（`pane.zoom` の
  // `mode: "toggle"` と同じ考え方。二重クリックの競合を避ける）。
  it("toggleGroupCollapsed: groupId だけを渡し、値の計算はサーバに任せる（group.toggle_collapsed）", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.toggleGroupCollapsed("g1");
    expect(conn.requests).toEqual([["group.toggle_collapsed", { groupId: "g1" }]]);
  });

  it("openGroupPicker: グループが1件以上あれば addToGroup ダイアログを開く", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    session.groupUpserted({ id: "g1", label: "backend", collapsed: false });
    makeDispatcher(conn).dispatcher.openGroupPicker("w1");
    expect(useViewStore(pinia).dialogContext).toEqual({ kind: "addToGroup", workspaceId: "w1", groups: [{ id: "g1", label: "backend", collapsed: false }] });
  });

  it("openGroupPicker: グループが0件ならダイアログを開かず知らせる", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    makeDispatcher(conn).dispatcher.openGroupPicker("w1");
    expect(view.dialogContext).toBeNull();
    expect(view.toasts.length).toBeGreaterThan(0);
  });

  it("confirmAddToGroup: group.add_member を送り、ダイアログを閉じる", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "addToGroup", workspaceId: "w1", groups: [] });
    makeDispatcher(conn).dispatcher.confirmAddToGroup("g1");
    expect(conn.requests).toEqual([["group.add_member", { groupId: "g1", workspaceId: "w1" }]]);
    expect(view.dialogContext).toBeNull();
  });

  it("removeWorkspaceFromGroup: group.remove_member を送る", () => {
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.removeWorkspaceFromGroup("w1");
    expect(conn.requests).toEqual([["group.remove_member", { workspaceId: "w1" }]]);
  });
});

describe("ActionDispatcher — 公式フック連携（20260923-agent-session-resume）", () => {
  it("refreshAgentIntegrationStatus：agent_integration.status を呼び、store へ反映する", async () => {
    const conn = makeConnection();
    const notInstalled = { cliDetected: false, installed: false };
    const status: AgentIntegrationStatusResult = {
      autoResumeEnabled: true,
      agents: {
        claude: { cliDetected: true, installed: false },
        codex: notInstalled,
        cursor: notInstalled,
        copilot: notInstalled,
        devin: notInstalled,
        droid: notInstalled,
        grok: notInstalled,
        qwen: notInstalled,
      },
    };
    conn.resolveWith["agent_integration.status"] = status;
    const { dispatcher } = makeDispatcher(conn);

    await dispatcher.refreshAgentIntegrationStatus();

    expect(conn.requests).toEqual([["agent_integration.status", {}]]);
    expect(useAgentIntegrationsStore(pinia).status).toEqual(status);
  });

  it("installAgentIntegration / uninstallAgentIntegration：kind をそのまま渡し、結果を返す", async () => {
    const conn = makeConnection();
    conn.resolveWith["agent_integration.install"] = { ok: true, message: null };
    conn.resolveWith["agent_integration.uninstall"] = { ok: true, message: "未導入でした" };
    const { dispatcher } = makeDispatcher(conn);

    await expect(dispatcher.installAgentIntegration("claude")).resolves.toEqual({ ok: true, message: null });
    await expect(dispatcher.uninstallAgentIntegration("codex")).resolves.toEqual({ ok: true, message: "未導入でした" });
    expect(conn.requests).toEqual([
      ["agent_integration.install", { kind: "claude" }],
      ["agent_integration.uninstall", { kind: "codex" }],
    ]);
  });

  it("setAgentIntegrationAutoResume：enabled をそのまま渡す", async () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);

    await dispatcher.setAgentIntegrationAutoResume(false);

    expect(conn.requests).toEqual([["agent_integration.set_auto_resume", { enabled: false }]]);
  });
});

// 20260920-agent-notifications：`run()` の switch に `default` も網羅性の検査も無いので、
// **足し忘れてもキーが黙って何もしないだけで型では落ちない**。ここで結線を固定する。
describe("ActionDispatcher — 通知", () => {
  it("settings で設定のダイアログが開く", () => {
    const { dispatcher } = makeDispatcher(makeConnection());
    const view = useViewStore(pinia);
    dispatcher.run({ type: "settings" });
    expect(view.dialogContext).toEqual({ kind: "settings" });
    expect(view.openDialog, "ダイアログのモードに入る（端末へキーを流さない）").toBe("settings");
  });

  it("nextNotification で次の知らせへ移る", () => {
    const conn = makeConnection();
    const focusNext = vi.fn();
    const { dispatcher } = makeDispatcher(conn, { notifications: { focusNext } });
    dispatcher.run({ type: "nextNotification" });
    expect(focusNext).toHaveBeenCalledOnce();
  });

  it("通知を繋いでいなくても落ちない（テスト・古い呼び出し元）", () => {
    const { dispatcher } = makeDispatcher(makeConnection());
    expect(() => dispatcher.run({ type: "nextNotification" })).not.toThrow();
  });
});

// 新しく開く場所（20260921-new-terminal-cwd）。方針はこのブラウザの設定、「引き継ぐ」の元の pane は design D7。
describe("ActionDispatcher — 新しく開く場所（newCwd）", () => {
  const FALLBACK_TOAST = "新しく開く場所が使えないため、代わりの場所で開きました（設定の「端末」で確かめてください）";

  /** w1（t1: p1）と w2（t2: p2）。焦点は p1。 */
  function twoWorkspaces(): { session: ReturnType<typeof useSessionStore>; view: ReturnType<typeof useViewStore> } {
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.workspaceUpserted(makeWorkspace("w2", ["t2"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.tabUpserted(makeTab("t2", "w2", "p2"));
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t2"));
    view.setView("w1", "t1");
    view.focusPane("p1");
    return { session, view };
  }

  it("引き継ぐ：新しい workspace はこのブラウザの焦点の pane を元の pane として載せる（AC1）", () => {
    const conn = makeConnection();
    twoWorkspaces();
    makeDispatcher(conn).dispatcher.run({ type: "newWorkspace" });
    expect(conn.requests).toEqual([["workspace.create", { newCwd: { policy: "follow", sourcePaneId: "p1" } }]]);
  });

  it("引き継ぐ：新しい tab は、焦点の pane が作る先の workspace にあるときだけ元の pane を載せる（AC2・design D7）", () => {
    const conn = makeConnection();
    const { view } = twoWorkspaces();
    const { dispatcher } = makeDispatcher(conn);
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    dispatcher.confirmNewTab("");
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w2" }); // 焦点の p1 は w1 の pane
    dispatcher.confirmNewTab("");
    expect(conn.requests).toEqual([
      ["tab.create", { workspaceId: "w1", newCwd: { policy: "follow", sourcePaneId: "p1" } }],
      ["tab.create", { workspaceId: "w2", newCwd: { policy: "follow" } }],
    ]);
  });

  // 焦点はダイアログを閉じた**後**で読む——開いている間に焦点の pane が閉じられると、閉じたときに戻す先（残った pane）へ
  // 差し替わる（D97）。閉じる前に読むと、閉じた pane を拾って元の pane が無いことになり、workspace の場所で開いてしまう。
  it("引き継ぐ：ダイアログの間に焦点の pane が閉じられたら、戻った先の pane を元の pane にする（design D7）", () => {
    const conn = makeConnection();
    const { session, view } = twoWorkspaces();
    session.paneUpserted(makePane("p3", "t1"));
    const { dispatcher } = makeDispatcher(conn);
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    session.paneClosed("p1");
    view.retargetPreDialogFocus("p3"); // StoreAdapter が閉じた pane の代わりに差し替える（store/StoreAdapter.ts）
    dispatcher.confirmNewTab("");
    expect(conn.requests).toEqual([["tab.create", { workspaceId: "w1", newCwd: { policy: "follow", sourcePaneId: "p3" } }]]);
  });

  it("引き継ぐ：分割は元の pane を載せない（サーバが分割する pane を元にする。AC3）", () => {
    const conn = makeConnection();
    twoWorkspaces();
    makeDispatcher(conn).dispatcher.splitPane("p2", "down"); // 焦点（p1）とは別の pane
    expect(conn.requests).toEqual([["pane.split", { paneId: "p2", direction: "down", newCwd: { policy: "follow" } }]]);
  });

  it("方針を変えると、次に作る workspace・tab・分割から効き、既に開いている pane には何も送らない（AC6〜AC8・AC10）", () => {
    const conn = makeConnection();
    const { view } = twoWorkspaces();
    const settings = useSettingsStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    settings.setNewCwdPolicy("home");
    settings.setNewCwdPath("~/work");
    expect(conn.requests, "設定を変えただけでは何も送らない").toEqual([]);
    dispatcher.run({ type: "newWorkspace" });
    settings.setNewCwdPolicy("path");
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    dispatcher.confirmNewTab("");
    settings.setNewCwdPolicy("current");
    dispatcher.splitPane("p1", "right");
    expect(conn.requests.map(([, params]) => (params as { newCwd?: unknown }).newCwd)).toEqual([
      { policy: "home" },
      { policy: "path", path: "~/work" },
      { policy: "current" },
    ]);
  });

  // AC11：worktree を開く経路は場所を明示するので、方針が何でも `newCwd` を載せない（サーバでは `cwd` が勝つ）。
  it("worktree を開く経路は、方針に関わらず cwd だけを送る（AC11）", () => {
    const conn = makeConnection();
    const settings = useSettingsStore(pinia);
    settings.setNewCwdPolicy("path");
    settings.setNewCwdPath("/elsewhere");
    const { dispatcher } = makeDispatcher(conn);
    useViewStore(pinia).openDialogWithContext({ kind: "worktreeOpen", workspaceId: "w1", entries: [{ path: "/w/a", branch: "a" }] });
    dispatcher.confirmWorktreeOpen("/w/a");
    expect(conn.requests).toEqual([["workspace.create", { cwd: "/w/a", label: "a" }]]);
  });

  it("応答に cwdFallback があれば知らせ、無ければ知らせない（AC9・AC5）", async () => {
    const conn = makeConnection();
    const { view } = twoWorkspaces();
    const { dispatcher } = makeDispatcher(conn);
    conn.resolveWith["workspace.create"] = { workspace: { id: "w9" }, tab: { id: "t9" }, pane: { id: "p9" } };
    conn.resolveWith["tab.create"] = { tab: { id: "t8" }, pane: { id: "p8" } };
    conn.resolveWith["pane.split"] = { pane: { id: "p7" } };
    dispatcher.run({ type: "newWorkspace" });
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    dispatcher.confirmNewTab("");
    dispatcher.splitPane("p1", "right");
    await flush();
    expect(view.toasts.filter((t) => t.message === FALLBACK_TOAST), "cwdFallback が無ければ知らせない").toHaveLength(0);

    conn.resolveWith["workspace.create"] = { workspace: { id: "w9" }, tab: { id: "t9" }, pane: { id: "p9" }, cwdFallback: true };
    conn.resolveWith["tab.create"] = { tab: { id: "t8" }, pane: { id: "p8" }, cwdFallback: true };
    conn.resolveWith["pane.split"] = { pane: { id: "p7" }, cwdFallback: true };
    dispatcher.run({ type: "newWorkspace" });
    view.openDialogWithContext({ kind: "newTab", workspaceId: "w1" });
    dispatcher.confirmNewTab("");
    dispatcher.splitPane("p1", "right");
    await flush();
    expect(view.toasts.filter((t) => t.message === FALLBACK_TOAST), "3 つの作成それぞれで知らせる").toHaveLength(3);
  });
});

// 20260921-workspace-auto-label：空で確定すると自動の名前に戻し、自動の名前のまま変えずに確定したら送らない（design D7）。
describe("ActionDispatcher — workspace の名前変更と自動の名前", () => {
  function open(autoLabel: boolean) {
    const conn = makeConnection();
    useSessionStore(pinia).workspaceUpserted(makeWorkspace("w1", [], { label: "my-repo", autoLabel }));
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.renameWorkspaceById("w1");
    return { conn, dispatcher, view: useViewStore(pinia) };
  }

  it("開いた時点で名前が自動だったかを持つ", () => {
    expect(open(true).view.dialogContext).toMatchObject({ kind: "renameWorkspace", currentLabel: "my-repo", currentAutoLabel: true });
  });

  it("空（空白だけ）で確定すると label: null（自動の名前に戻す）", () => {
    const { conn, dispatcher } = open(false);
    dispatcher.confirmRenameWorkspace("   ");
    expect(conn.requests).toEqual([["workspace.rename", { workspaceId: "w1", label: null }]]);
  });

  it("自動の名前のまま変えずに確定したら送らない（付けた名前として固定しない）", () => {
    const { conn, dispatcher, view } = open(true);
    dispatcher.confirmRenameWorkspace(" my-repo ");
    expect(conn.requests).toEqual([]);
    expect(view.dialogContext, "ダイアログは閉じる").toBeNull();
  });

  it("自動の名前のときに空で確定しても label: null を送る（手掛かりの約束どおり）", () => {
    const { conn, dispatcher } = open(true);
    dispatcher.confirmRenameWorkspace("  ");
    expect(conn.requests).toEqual([["workspace.rename", { workspaceId: "w1", label: null }]]);
  });

  it("変えたかどうかは開いた時点の名前で比べ、大小は区別する", () => {
    const { conn, dispatcher } = open(true);
    // 開いた後にほかのブラウザで名前が付けられても、変えずに確定したことに変わりはない（開いた時点の値で見る）。
    useSessionStore(pinia).workspaceUpserted(makeWorkspace("w1", [], { label: "other", autoLabel: false }));
    dispatcher.confirmRenameWorkspace("my-repo");
    expect(conn.requests).toEqual([]);
    pinia = createPinia();
    const cased = open(true);
    cased.dispatcher.confirmRenameWorkspace("My-Repo");
    expect(cased.conn.requests).toEqual([["workspace.rename", { workspaceId: "w1", label: "My-Repo" }]]);
  });

  it("自動の名前でも変えて確定すれば送る。付けた名前は今までどおり送る", () => {
    const auto = open(true);
    auto.dispatcher.confirmRenameWorkspace("api");
    expect(auto.conn.requests).toEqual([["workspace.rename", { workspaceId: "w1", label: "api" }]]);
    pinia = createPinia();
    const named = open(false);
    named.dispatcher.confirmRenameWorkspace("my-repo");
    expect(named.conn.requests).toEqual([["workspace.rename", { workspaceId: "w1", label: "my-repo" }]]);
  });
});

// 20260923-missing-keybinding-actions（herdr にあって本製品に操作自体が無かったもの）。
describe("ActionDispatcher — workspaceDelta（previous_workspace/next_workspace）", () => {
  it("workspace の一覧を順に回る（端で反対へ）。workspace.focus を送る", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1", ["t1"]), activeTabId: "t1" });
    session.workspaceUpserted({ ...makeWorkspace("w2", ["t2"]), activeTabId: "t2" });
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.tabUpserted(makeTab("t2", "w2", "p2"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("w2");
    expect(view.focusedPaneId).toBe("p2");
    expect(conn.requests).toEqual([["workspace.focus", { workspaceId: "w2" }]]);

    dispatcher.run({ type: "workspaceDelta", delta: 1 }); // 端から反対へ
    expect(view.workspaceId).toBe("w1");

    dispatcher.run({ type: "workspaceDelta", delta: -1 }); // 前へ（反対へ回る）
    expect(view.workspaceId).toBe("w2");
  });

  it("workspace が1個以下なら何もしない（AC4）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1", ["t1"]), activeTabId: "t1" });
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("w1");
    expect(conn.requests).toEqual([]);
  });

  // レビューの指摘（must）：`Sidebar.vue` は 20260923-workspace-grouping でグループを1ブロックとして
  // まとめる描画（旧 `groupedWorkspaceRows`）に切り替わったが、`workspaceDelta` は素の「開いた順」
  // （素の開いた順）のままだったため、画面上の隣と実際に切り替わる先が食い違っていた。
  it("画面上の並び（グループはまとめて1ブロック）を辿る——開いた順が A, C, B でも次は画面上隣の B", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    // 開いた順（flat）は A, C, B。A・B は手動グループ g1 のメンバー、C は無所属。
    // 画面には「A（グループ先頭）→ B（グループ2番目）→ C（グループ外）」の順で表示される。
    session.workspaceUpserted({ ...makeWorkspace("A", ["ta"]), activeTabId: "ta", groupId: "g1" });
    session.workspaceUpserted({ ...makeWorkspace("C", ["tc"]), activeTabId: "tc" });
    session.workspaceUpserted({ ...makeWorkspace("B", ["tb"]), activeTabId: "tb", groupId: "g1" });
    session.groupUpserted({ id: "g1", label: "grp", collapsed: false });
    session.tabUpserted(makeTab("ta", "A", "pa"));
    session.tabUpserted(makeTab("tc", "C", "pc"));
    session.tabUpserted(makeTab("tb", "B", "pb"));
    view.setView("A", "ta");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("B"); // 画面上の隣（C ではない）
  });
});

describe("ActionDispatcher — lastPane（last_pane。1スロットのトグル）", () => {
  it("直前の pane（workspace/tab をまたいで）へ戻り、押すたびに入れ替わる（トグル。AC1・AC2）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.workspaceUpserted(makeWorkspace("w2", ["t2"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.tabUpserted(makeTab("t2", "w2", "p2"));
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t2"));
    view.setView("w1", "t1");
    view.focusPane("p1");
    view.setView("w2", "t2");
    view.focusPane("p2"); // p1 → p2 の移動で lastFocusedPaneId が p1 になる
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "lastPane" });
    expect(view.workspaceId).toBe("w1");
    expect(view.tabId).toBe("t1");
    expect(view.focusedPaneId).toBe("p1");
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p1" }]]);

    dispatcher.run({ type: "lastPane" }); // もう一度でトグルして戻る
    expect(view.workspaceId).toBe("w2");
    expect(view.focusedPaneId).toBe("p2");
  });

  it("直前の pane が既に閉じていれば何もしない（AC2）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t2"]));
    session.tabUpserted(makeTab("t2", "w1", "p2"));
    session.paneUpserted(makePane("p2", "t2")); // p1（直前の pane）は登録しない＝既に閉じている想定
    view.setView("w1", "t2");
    view.focusPane("p1");
    view.focusPane("p2"); // lastFocusedPaneId が p1 になる
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "lastPane" });
    expect(view.focusedPaneId).toBe("p2"); // 動かない（p1 は session.panes に無い）
    expect(conn.requests).toEqual([]);
  });

  it("直前の pane が今の focus と同じなら何もしない（AC2）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.focusPane("p1"); // lastFocusedPaneId はまだ null（最初の focus）
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "lastPane" });
    expect(view.focusedPaneId).toBe("p1"); // 動かない
    expect(conn.requests).toEqual([]);
  });
});

describe("ActionDispatcher — moveTab（move_tab_previous/move_tab_next）", () => {
  it("表示中の tab を対象に tab.move を送る", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1", "t2"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "moveTab", direction: "next" });
    expect(conn.requests).toEqual([["tab.move", { tabId: "t1", direction: "next" }]]);
  });

  it("表示中の tab が無ければ何もしない", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "moveTab", direction: "previous" });
    expect(conn.requests).toEqual([]);
  });
});

describe("ActionDispatcher — agentDelta/focusAgentIndex（previous_agent/next_agent/focus_agent）", () => {
  /** agent が検出された3つの pane（別々の workspace/tab）を用意する（herdr と同じく workspace/tab をまたぐ対象。research F3）。 */
  function setupAgents(session: ReturnType<typeof useSessionStore>): void {
    session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
    session.workspaceUpserted(makeWorkspace("w2", ["t2"]));
    session.workspaceUpserted(makeWorkspace("w3", ["t3"]));
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.tabUpserted(makeTab("t2", "w2", "p2"));
    session.tabUpserted(makeTab("t3", "w3", "p3"));
    session.paneUpserted({ ...makePane("p1", "t1"), agent: makeAgent({ instanceId: "a1" }) });
    session.paneUpserted({ ...makePane("p2", "t2"), agent: makeAgent({ instanceId: "a2" }) });
    session.paneUpserted({ ...makePane("p3", "t3"), agent: makeAgent({ instanceId: "a3" }) });
  }

  it("agentDelta：agent の一覧（grouped＝サーバ順）を巡回し、workspace/tab をまたいでフォーカスする（AC7）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    setupAgents(session);
    view.setView("w1", "t1");
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "agentDelta", delta: 1 });
    expect(view.workspaceId).toBe("w2");
    expect(view.focusedPaneId).toBe("p2");
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p2" }]]);

    dispatcher.run({ type: "agentDelta", delta: 1 });
    expect(view.focusedPaneId).toBe("p3");

    dispatcher.run({ type: "agentDelta", delta: 1 }); // 端から反対へ
    expect(view.focusedPaneId).toBe("p1");
  });

  it("agentDelta：現在の focus が一覧に無いとき、next は先頭・previous は末尾（herdr と同じ。research F3）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    setupAgents(session);
    view.focusPane("p-not-an-agent"); // agent の一覧に無い pane

    const nextDispatcher = makeDispatcher(conn).dispatcher;
    nextDispatcher.run({ type: "agentDelta", delta: 1 });
    expect(view.focusedPaneId).toBe("p1"); // 先頭

    pinia = createPinia();
    const conn2 = makeConnection();
    const session2 = useSessionStore(pinia);
    const view2 = useViewStore(pinia);
    setupAgents(session2);
    view2.focusPane("p-not-an-agent");
    makeDispatcher(conn2).dispatcher.run({ type: "agentDelta", delta: -1 });
    expect(view2.focusedPaneId).toBe("p3"); // 末尾
  });

  it("agentDelta：agent が検出された pane が1つも無ければ何もしない（AC7a）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "agentDelta", delta: 1 });
    expect(view.focusedPaneId).toBe("p1"); // 動かない
    expect(conn.requests).toEqual([]);
  });

  it("focusAgentIndex：0始まりの索引で直接ジャンプする", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    setupAgents(session);
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "focusAgentIndex", index: 2 });
    expect(view.workspaceId).toBe("w3");
    expect(view.focusedPaneId).toBe("p3");
    expect(conn.requests).toEqual([["pane.focus", { paneId: "p3" }]]);
  });

  it("focusAgentIndex：範囲外の索引は何もしない（AC7b）", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    setupAgents(session);
    const { dispatcher } = makeDispatcher(conn);

    dispatcher.run({ type: "focusAgentIndex", index: 9 });
    expect(view.focusedPaneId).toBeNull();
    expect(conn.requests).toEqual([]);
  });
});

/** 20260926-named-session-ui（AC2・AC7）。 */
describe("session の一覧と切り替え", () => {
  const SESSIONS = [
    { name: "default", default: true, running: true, current: true },
    { name: "work", default: false, running: true, current: false, endpoint: { port: 7781, https: false, host: "127.0.0.1" } },
    { name: "lan", default: false, running: false, current: false },
  ];
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };

  it("refreshServerSessions：名前付き session の数を入れる（失敗は前の値のまま）", async () => {
    const conn = makeConnection();
    conn.resolveWith["server.sessions"] = { sessions: SESSIONS };
    const { dispatcher } = makeDispatcher(conn);
    const session = useSessionStore(pinia);
    expect(session.namedSessionCount).toBe(0);
    await dispatcher.refreshServerSessions();
    expect(conn.requests).toEqual([["server.sessions", {}]]);
    expect(session.namedSessionCount).toBe(2);
    conn.rejectWith["server.sessions"] = "internal";
    await dispatcher.refreshServerSessions();
    expect(session.namedSessionCount).toBe(2);
  });

  it("openSessionSwitcher：一覧を取ってからダイアログを開き、数も更新する。失敗は開かずに知らせる", async () => {
    const conn = makeConnection();
    conn.resolveWith["server.sessions"] = { sessions: SESSIONS };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    dispatcher.openSessionSwitcher();
    await flush();
    expect(view.dialogContext).toEqual({ kind: "sessionSwitch", sessions: SESSIONS });
    expect(view.openDialog).toBe("sessionSwitch");
    expect(useSessionStore(pinia).namedSessionCount).toBe(2);
    view.closeDialog();

    conn.rejectWith["server.sessions"] = "internal";
    dispatcher.openSessionSwitcher();
    await flush();
    expect(view.dialogContext).toBeNull();
    expect(view.toasts.map((t) => t.message)).toContain("session の一覧を取れませんでした");
  });

  it("ほかのマシンを選んでいる間は session の一覧を読まず開かない（20260927-multi-host-machines）", async () => {
    const conn = makeConnection();
    conn.resolveWith["server.sessions"] = { sessions: SESSIONS };
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    useMachinesStore(pinia).select("abc");
    await dispatcher.refreshServerSessions();
    dispatcher.openSessionSwitcher();
    await flush();
    expect(conn.requests).toEqual([]);
    expect(useSessionStore(pinia).namedSessionCount).toBe(0);
    expect(view.openDialog).toBeNull();
    expect(view.toasts.map((t) => t.message).join()).toMatch(/ほかのマシン/);
  });

  it("openServerSession：新しいタブで noopener,noreferrer で開き、ダイアログを閉じる", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    const view = useViewStore(pinia);
    view.openDialogWithContext({ kind: "sessionSwitch", sessions: SESSIONS });
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    try {
      dispatcher.openServerSession("http://127.0.0.1:7781/");
      expect(open).toHaveBeenCalledWith("http://127.0.0.1:7781/", "_blank", "noopener,noreferrer");
      expect(view.openDialog).toBeNull();
    } finally {
      open.mockRestore();
    }
  });
});

describe("ActionDispatcher — 独自コマンド（20260927-custom-command-keys）", () => {
  function withCatalog() {
    useCommandsStore(pinia).setCatalog({
      commands: [
        { id: "git", type: "popup", description: "lazygit", width: "80%" },
        { id: "htop", type: "pane" },
        { id: "build", type: "shell", description: "ビルド" },
      ],
      problem: null,
    });
  }

  it("shell：id とフォーカス中の pane だけを送り、走らせたことを知らせる（AC7）", async () => {
    withCatalog();
    const conn = makeConnection();
    conn.resolveWith["command.run"] = { type: "shell" };
    const view = useViewStore(pinia);
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "runCommand", commandId: "build" });
    await flush();
    expect(conn.requests).toEqual([["command.run", { commandId: "build", paneId: "p1" }]]);
    expect(view.toasts.map((t) => t.message)).toEqual(["「ビルド」を走らせました。"]);
  });

  it("失敗は code から引いた文言で知らせる（AC6）", async () => {
    withCatalog();
    const conn = makeConnection();
    conn.rejectWith["command.run"] = "command_busy";
    const view = useViewStore(pinia);
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "runCommand", commandId: "build" });
    await flush();
    expect(view.toasts.map((t) => t.message)).toEqual([clientErrorMessage("command_busy")]);
  });

  it("pane：応答の pane へ焦点を移す（AC8）。失敗ならトーストで焦点はそのまま", async () => {
    withCatalog();
    const conn = makeConnection();
    conn.resolveWith["command.run"] = { type: "pane", pane: { id: "p2" } };
    useSessionStore(pinia).paneUpserted(makePane("p2", "t1"));
    const view = useViewStore(pinia);
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "runCommand", commandId: "htop" });
    await flush();
    expect(view.focusedPaneId).toBe("p2");

    const failing = makeConnection();
    failing.rejectWith["command.run"] = "spawn_failed";
    view.focusPane("p1");
    makeDispatcher(failing).dispatcher.run({ type: "runCommand", commandId: "htop" });
    await flush();
    expect(view.focusedPaneId).toBe("p1");
    expect(view.toasts.map((t) => t.message)).toContain(clientErrorMessage("spawn_failed"));
  });

  it("pane：応答を待つ間に打った文字は新しい pane へ届き、失敗・応答の時点で閉じていれば元の pane へ（D99。editScrollback と同じ）", async () => {
    withCatalog();
    const view = useViewStore(pinia);
    const session = useSessionStore(pinia);
    // 1) 成功：拡大表示の新しい pane へ
    const conn = makeConnection();
    let resolveRun: (v: unknown) => void = () => undefined;
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return new Promise((r) => (resolveRun = r as (v: unknown) => void));
    };
    const gate = new InputGate(conn);
    view.focusPane("p1");
    const { registry, keys } = makeDispatcher(conn);
    new ActionDispatcher({ conn, pinia, registry, keys, input: gate, notifications: { focusNext: () => undefined } }).run({ type: "runCommand", commandId: "htop" });
    gate.sendInput("p1", "q");
    expect(conn.sendInput).not.toHaveBeenCalled();
    session.tabUpserted({ ...makeTab("t1", "w1", "p2"), zoomedPaneId: "p2" });
    session.paneUpserted(makePane("p2", "t1"));
    resolveRun({ type: "pane", pane: { id: "p2" } });
    await flush();
    expect(conn.sendInput).toHaveBeenCalledWith("p2", "q");
    // 2) 失敗：元の pane へ
    const failing = makeConnection();
    failing.rejectWith["command.run"] = "spawn_failed";
    const gate2 = new InputGate(failing);
    view.focusPane("p1");
    new ActionDispatcher({ conn: failing, pinia, registry, keys, input: gate2, notifications: { focusNext: () => undefined } }).run({ type: "runCommand", commandId: "htop" });
    gate2.sendInput("p1", "x");
    await flush();
    expect(failing.sendInput).toHaveBeenCalledWith("p1", "x");
    expect(view.focusedPaneId).toBe("p1");
    // 3) 応答の時点で pane が閉じていた：焦点も入力も元の pane
    const gone = makeConnection();
    gone.resolveWith["command.run"] = { type: "pane", pane: { id: "p9" } };
    const gate3 = new InputGate(gone);
    new ActionDispatcher({ conn: gone, pinia, registry, keys, input: gate3, notifications: { focusNext: () => undefined } }).run({ type: "runCommand", commandId: "htop" });
    gate3.sendInput("p1", "y");
    await flush();
    expect(view.focusedPaneId).toBe("p1");
    expect(gone.sendInput).toHaveBeenCalledWith("p1", "y");
  });

  it("code の無い失敗・読み直しの失敗は汎用の文言で知らせる", async () => {
    withCatalog();
    const conn = makeConnection();
    conn.request = function <M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return Promise.reject(new Error("socket closed"));
    };
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "runCommand", commandId: "build" });
    dispatcher.run({ type: "reloadConfig" });
    await flush();
    expect(view.toasts.map((t) => t.message)).toEqual(
      expect.arrayContaining(["独自コマンドを走らせられませんでした。", "独自コマンドの設定を読み直せませんでした。"]),
    );
  });

  it("popup：要求は送らず、名前と大きさの指定（幅・高さ）を持って popup の部品を開く", () => {
    useCommandsStore(pinia).setCatalog({ commands: [{ id: "g2", type: "popup", width: 90, height: "40%" }], problem: null });
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "runCommand", commandId: "g2" });
    expect(view.dialogContext).toEqual({ kind: "commandPopup", commandId: "g2", paneId: "p1", title: "g2", width: 90, height: "40%" });
  });

  it("popup：要求は送らず、名前と大きさの指定を持って popup の部品を開く（AC4）", () => {
    withCatalog();
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.focusPane("p1");
    makeDispatcher(conn).dispatcher.run({ type: "runCommand", commandId: "git" });
    expect(conn.requests).toEqual([]);
    expect(view.openDialog).toBe("commandPopup");
    expect(view.dialogContext).toEqual({ kind: "commandPopup", commandId: "git", paneId: "p1", title: "lazygit", width: "80%" });
  });

  it("一覧に無い id・焦点の無いときは何もしない（AC13）", async () => {
    withCatalog();
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "runCommand", commandId: "build" }); // 焦点なし
    view.focusPane("p1");
    dispatcher.run({ type: "runCommand", commandId: "gone" });
    await flush();
    expect(conn.requests).toEqual([]);
    expect(view.openDialog).toBeNull();
  });

  it("refreshCommands は command.list で一覧を入れ、失敗しても投げず一覧を消さない", async () => {
    const conn = makeConnection();
    conn.resolveWith["command.list"] = { commands: [{ id: "a", type: "shell" }], problem: null };
    const { dispatcher } = makeDispatcher(conn);
    await dispatcher.refreshCommands();
    const store = useCommandsStore(pinia);
    expect(store.catalog).toEqual([{ id: "a", type: "shell" }]);
    conn.rejectWith["command.list"] = "internal";
    await expect(dispatcher.refreshCommands()).resolves.toBeUndefined();
    expect(store.catalog).toEqual([{ id: "a", type: "shell" }]);
  });

  it("reload_config はサーバに読み直させ、一覧を置き換え、問題があれば知らせる（AC15）", async () => {
    const conn = makeConnection();
    conn.resolveWith["command.reload"] = { commands: [], problem: "commands.json: 知らない項目です（env）" };
    const view = useViewStore(pinia);
    withCatalog();
    makeDispatcher(conn).dispatcher.run({ type: "reloadConfig" });
    await flush();
    expect(conn.requests).toContainEqual(["command.reload", {}]);
    expect(useCommandsStore(pinia).catalog).toEqual([]);
    expect(view.toasts.map((t) => t.message)).toContain("独自コマンドの設定を読めませんでした：commands.json: 知らない項目です（env）");

    const ok = makeConnection();
    ok.resolveWith["command.reload"] = { commands: [{ id: "a", type: "shell" }], problem: null };
    view.toasts.splice(0);
    makeDispatcher(ok).dispatcher.run({ type: "reloadConfig" });
    await flush();
    expect(view.toasts.map((t) => t.message)).toEqual(["設定を読み直しました。"]);
  });
});

// 20260927-cli-mode（herdr にあって Web に無かった操作。design D-7）。
describe("ActionDispatcher — D-7 の操作（20260927-cli-mode）", () => {
  it("workspaceIndex（switch_workspace）: サイドバーの並びの N 番目へ移る。範囲の外は何もしない", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted({ ...makeWorkspace("w1", ["t1"]), activeTabId: "t1" });
    session.workspaceUpserted({ ...makeWorkspace("w2", ["t2"]), activeTabId: "t2" });
    session.tabUpserted(makeTab("t1", "w1", "p1"));
    session.tabUpserted(makeTab("t2", "w2", "p2"));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "workspaceIndex", index: 2 });
    expect(view.workspaceId).toBe("w2");
    expect(view.focusedPaneId).toBe("p2");
    expect(conn.requests).toEqual([["workspace.focus", { workspaceId: "w2" }]]);
    dispatcher.run({ type: "workspaceIndex", index: 3 });
    expect(view.workspaceId).toBe("w2");
    expect(conn.requests).toHaveLength(1);
  });

  it("openWorktree（open_worktree）: 今の workspace の worktree の一覧を開く", async () => {
    const conn = makeConnection();
    conn.resolveWith["worktree.list"] = { worktreeRoot: "/wt", repoName: "r", suggestedBranch: "b", entries: [{ path: "/wt/r/a", branch: "a" }] };
    const view = useViewStore(pinia);
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "openWorktree" });
    await flush();
    expect(conn.requests).toEqual([["worktree.list", { workspaceId: "w1" }]]);
    expect(view.dialogContext).toEqual({ kind: "worktreeOpen", workspaceId: "w1", entries: [{ path: "/wt/r/a", branch: "a" }] });
  });

  it("removeWorktree（remove_worktree）: linked worktree でなければ知らせるだけ", () => {
    const conn = makeConnection();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w1", ["t1"], { git: { branch: "main", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: false } }));
    view.setView("w1", "t1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "removeWorktree" });
    expect(conn.requests).toEqual([]);
    expect(view.toasts.at(-1)?.message).toContain("worktree のチェックアウトではありません");
  });

  function linkedSetup(cwd: string) {
    const conn = makeConnection();
    conn.resolveWith["worktree.list"] = {
      worktreeRoot: "/wt",
      repoName: "r",
      suggestedBranch: "b",
      entries: [
        { path: "/r", branch: "main" },
        { path: "/wt/r/feat", branch: "feat" },
      ],
    };
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.workspaceUpserted(makeWorkspace("w2", ["t1"], { cwd, git: { branch: "feat", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: true } }));
    view.setView("w2", "t1");
    return { conn, view, ...makeDispatcher(conn) };
  }

  it("removeWorktree: linked worktree なら、今の場所と同じ場所の worktree の削除の確認を開く（取り消したら閉じる）", async () => {
    const { conn, view, dispatcher } = linkedSetup("/wt/r/feat");
    dispatcher.run({ type: "removeWorktree" });
    await flush();
    expect(conn.requests).toEqual([["worktree.list", { workspaceId: "w2" }]]);
    expect(view.dialogContext).toEqual({ kind: "confirmWorktreeRemove", sourceWorkspaceId: "w2", path: "/wt/r/feat", openWorkspaceId: "w2", closeOnCancel: true });
  });

  // 点検の指摘（02 の修正）：部分一致で選ぶと、サーバ（完全一致でしか workspace を閉じない）と食い違う。一覧の行からの削除と同じ完全一致にする。
  it("removeWorktree: 今の場所が worktree の中の下の場所なら（完全一致が無ければ）確認を開かずに知らせる", async () => {
    const { view, dispatcher } = linkedSetup("/wt/r/feat/sub");
    dispatcher.run({ type: "removeWorktree" });
    await flush();
    expect(view.dialogContext).toBeNull();
    expect(view.toasts.at(-1)?.message).toContain("見つかりませんでした");
  });

  it("removeWorktree（キーから）: dirty で断られたら --force の確認へ closeOnCancel を引き継ぎ、ほかの失敗では一覧を開き直さない", async () => {
    const { conn, view, dispatcher } = linkedSetup("/wt/r/feat");
    dispatcher.run({ type: "removeWorktree" });
    await flush();
    conn.rejectWith["worktree.remove"] = "worktree_dirty";
    dispatcher.confirmWorktreeRemove();
    await flush();
    expect(view.dialogContext).toMatchObject({ kind: "confirmWorktreeRemoveForce", reason: "dirty", closeOnCancel: true });
    conn.rejectWith["worktree.remove"] = "worktree_failed";
    const listCalls = conn.requests.filter(([m]) => m === "worktree.list").length;
    dispatcher.confirmWorktreeRemoveForce();
    await flush();
    expect(view.dialogContext).toBeNull();
    expect(conn.requests.filter(([m]) => m === "worktree.list").length).toBe(listCalls); // 一覧を開き直さない
  });

  // 点検の指摘（02 の修正）：herdr は linked worktree の workspace からは始めず案内する。
  it("openWorktree: linked worktree の workspace からは一覧を開かずに知らせる", () => {
    const { conn, view, dispatcher } = linkedSetup("/wt/r/feat");
    dispatcher.run({ type: "openWorktree" });
    expect(conn.requests).toEqual([]);
    expect(view.toasts.at(-1)?.message).toContain("repo の本体");
  });

  it("swapWithFocused: メニューを開いた pane と焦点の pane を pane.swap_with で入れ替え、焦点を送り直す。キーからは直前の pane と。別の tab・同じ pane は何もしない", async () => {
    const conn = makeConnection();
    conn.resolveWith["pane.swap_with"] = { ok: true };
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    session.paneUpserted(makePane("p1", "t1"));
    session.paneUpserted(makePane("p2", "t1"));
    session.paneUpserted(makePane("p3", "t2"));
    view.focusPane("p2");
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.swapWithFocused("p2");
    await flush();
    expect(conn.requests).toEqual([
      ["pane.swap_with", { paneId: "p1", otherPaneId: "p2" }],
      ["pane.focus", { paneId: "p1" }],
    ]);
    conn.requests.length = 0;
    dispatcher.run({ type: "swapWithFocused" }); // 直前の pane（p2）と
    await flush();
    expect(conn.requests[0]).toEqual(["pane.swap_with", { paneId: "p1", otherPaneId: "p2" }]);
    conn.requests.length = 0;
    dispatcher.swapWithFocused("p3");
    dispatcher.swapWithFocused("p1");
    await flush();
    expect(conn.requests).toEqual([]);
  });

  it("stopServer（stop_server）: 確認を開き、確定で server.stop を送る。断られたら code の文言で知らせる", async () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "stopServer" });
    expect(view.dialogContext).toEqual({ kind: "confirmStopServer", target: "このマシン", remote: false });
    expect(conn.requests).toEqual([]);
    dispatcher.confirmStopServer();
    await flush();
    expect(view.dialogContext).toBeNull();
    expect(conn.requests).toEqual([["server.stop", {}]]);
    conn.rejectWith["server.stop"] = "server_busy";
    dispatcher.run({ type: "stopServer" });
    dispatcher.confirmStopServer();
    await flush();
    expect(view.toasts.at(-1)?.message).toBe(clientErrorMessage("server_busy"));
  });

  // 02 の review：画面の接続が保存したマシンを向いていれば、止まるのはそのマシンの soda serve。確認でどれが止まるかを言う。
  it("stopServer: 確認の文脈に止まるサーバ（ローカルはホスト名・保存したマシンはその名前）を入れる", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    const session = useSessionStore(pinia);
    session.host = { os: "linux", windowsBuild: null, hostname: "devbox" };
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "stopServer" });
    expect(view.dialogContext).toEqual({ kind: "confirmStopServer", target: "devbox", remote: false });
    view.closeDialog();
    const machines = useMachinesStore(pinia);
    const id = "b".repeat(32);
    machines.setMachines([{ id, label: "GPU", state: "online", message: null }]);
    machines.select(id);
    dispatcher.run({ type: "stopServer" });
    expect(view.dialogContext).toEqual({ kind: "confirmStopServer", target: "GPU", remote: true });
  });

  it("confirmStopServer は確認の文脈でなければ何もしない", () => {
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.confirmStopServer();
    expect(conn.requests).toEqual([]);
  });

  // 20261004-subagent-display（show_subagents）。
  describe("showSubagents（show_subagents）", () => {
    const subs = (n: number) => ({ count: n, items: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, startedAt: 0 })) });
    function setup(agent: AgentInfo | null) {
      const session = useSessionStore(pinia);
      const view = useViewStore(pinia);
      session.workspaceUpserted(makeWorkspace("w1", ["t1"]));
      session.tabUpserted(makeTab("t1", "w1"));
      session.paneUpserted({ ...makePane("p1", "t1"), agent });
      view.setView("w1", "t1");
      view.focusPane("p1");
      return { session, view };
    }

    it("フォーカスしている pane のエージェントの一覧を開く（ボタンから開いたのではないので opener は無い。何も送らない）", () => {
      const { view } = setup(makeAgent({ subagents: subs(2) }));
      const conn = makeConnection();
      const { dispatcher } = makeDispatcher(conn);
      dispatcher.run({ type: "showSubagents" });
      expect(view.dialogContext).toEqual({ kind: "subagents", machineId: "local", paneId: "p1" });
      expect(conn.requests).toEqual([]);
    });

    it("0 件・分からない（項目なし）・エージェントが居ない・フォーカスが無いときは何もしない", () => {
      for (const agent of [makeAgent({ subagents: subs(0) }), makeAgent(), null]) {
        pinia = createPinia();
        const { view } = setup(agent);
        const { dispatcher } = makeDispatcher(makeConnection());
        dispatcher.run({ type: "showSubagents" });
        expect(view.dialogContext).toBeNull();
      }
      pinia = createPinia();
      const view = useViewStore(pinia);
      const { dispatcher } = makeDispatcher(makeConnection());
      dispatcher.run({ type: "showSubagents" });
      expect(view.dialogContext).toBeNull();
    });

    it("別のマシンを選んでいれば、そのマシンの対象として開く", () => {
      const { view } = setup(makeAgent({ subagents: subs(1) }));
      const machines = useMachinesStore(pinia);
      machines.setMachines([{ id: "gpu", label: "GPU", host: "h", enabled: true, state: "connected" } as never]);
      machines.select("gpu");
      const { dispatcher } = makeDispatcher(makeConnection());
      dispatcher.run({ type: "showSubagents" });
      expect(view.dialogContext).toMatchObject({ kind: "subagents", machineId: "gpu", paneId: "p1" });
    });
  });

  it("openGraph（open_graph。20260927-agent-graph）: グラフ画面を開く（ダイアログの枠は使わない・何も送らない）", () => {
    const conn = makeConnection();
    const view = useViewStore(pinia);
    view.focusPane("p1");
    const { dispatcher } = makeDispatcher(conn);
    dispatcher.run({ type: "openGraph" });
    expect(view.graphOpen).toBe(true);
    expect(view.preGraphFocusPaneId).toBe("p1");
    expect(view.dialogContext).toBeNull();
    expect(conn.requests).toEqual([]);
  });
});

// 20261004-group-worktree-items：描画とキー操作の順は同じ関数（サーバが配るレイアウトの順）を通る。
describe("ActionDispatcher — レイアウトの順（20261004-group-worktree-items）", () => {
  const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
  /** 開いた順（flat）は A, W1(worktree の子), B, M(本体)。レイアウトは top: [g1, B]、g1: [r:/r/.git, A]。 */
  function setup() {
    const session = useSessionStore(pinia);
    for (const [id, o] of [
      ["A", {}],
      ["W1", { git: git(true), groupId: "g1" }],
      ["B", {}],
      ["M", { git: git(false), groupId: "g1" }],
    ] as const) {
      session.workspaceUpserted({ ...makeWorkspace(id, ["t" + id]), activeTabId: "t" + id, ...o });
      session.tabUpserted(makeTab("t" + id, id, "p" + id));
    }
    session.groupUpserted({ id: "g1", label: "grp", collapsed: false });
    session.layoutChanged({ top: ["g:g1", "w:B"], groups: { g1: ["r:/r/.git", "w:A"] }, ungrouped: [] });
    return session;
  }

  it("workspaceDelta・workspaceIndex・navigate は、レイアウトの順（グループ → worktree グループの本体・子 → グループの中の通常の行 → 一番上の行）を辿る", () => {
    setup();
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(makeConnection());
    view.setView("M", "tM");
    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("W1"); // 本体の次は子（開いた順では B の前）
    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("A");
    dispatcher.run({ type: "workspaceIndex", index: 4 });
    expect(view.workspaceId).toBe("B");
    view.setNavigateSelection("M");
    dispatcher.run({ type: "navigate", op: "down" });
    expect(view.navigateSelection).toBe("W1");
  });

  it("畳んだグループの中は今いる workspace だけが対象（畳んだ worktree グループも同じ）", () => {
    const session = setup();
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(makeConnection());
    session.groupUpserted({ id: "g1", label: "grp", collapsed: true });
    view.setView("W1", "tW1");
    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("B"); // グループの中は今いる W1 だけ。次は一番上の B
    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("B"); // 今いる B だけが見える（グループの中は見えない）ので動かない
  });

  it("layout の無い古いサーバでも、layoutFromLegacy で導いた順を辿る（同じリポジトリは本体の所属で 1 つの項目）", () => {
    const session = setup();
    session.layout = null;
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(makeConnection());
    // 導く順（追補 01 B）: グループ g1 = [r:/r/.git(本体 M の所属 g1)] が先、グループなし = [A, B]（平らな順）が後。
    view.setView("M", "tM");
    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("W1"); // 本体の次は子
    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("A"); // グループの次はグループなしの先頭
    dispatcher.run({ type: "workspaceDelta", delta: 1 });
    expect(view.workspaceId).toBe("B");
  });
});

// 20261004-group-worktree-items T15：navigate の選択を行に広げ、畳む・開く・項目の並べ替え。
describe("ActionDispatcher — キーボード（行の選択・折りたたみ・項目の並べ替え。T15）", () => {
  const git = (linked: boolean) => ({ branch: "b", ahead: 0, behind: 0, repoKey: "/r/.git", isLinkedWorktree: linked });
  /** top: [g1, g2(空), B]、g1: [r:/r/.git(M 本体・W1 子), A]。 */
  function setup(opts: { collapsed?: boolean } = {}) {
    const session = useSessionStore(pinia);
    for (const [id, o] of [
      ["A", {}],
      ["W1", { git: git(true) }],
      ["B", {}],
      ["M", { git: git(false) }],
    ] as const) {
      session.workspaceUpserted({ ...makeWorkspace(id, ["t" + id]), activeTabId: "t" + id, ...o });
      session.tabUpserted(makeTab("t" + id, id, "p" + id));
    }
    session.groupUpserted({ id: "g1", label: "grp", collapsed: opts.collapsed ?? false });
    session.groupUpserted({ id: "g2", label: "空", collapsed: false });
    session.layoutChanged({ top: ["g:g1", "g:g2", "w:B"], groups: { g1: ["r:/r/.git", "w:A"], g2: [] }, ungrouped: [] });
    return session;
  }

  it("up/down はグループの見出しと「グループなし」の見出しも順に選ぶ（空のグループにも届く）。キーは workspace の id と混ざらない", () => {
    setup();
    const view = useViewStore(pinia);
    const { dispatcher } = makeDispatcher(makeConnection());
    view.setNavigateSelection("group:g1");
    const seen: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      dispatcher.run({ type: "navigate", op: "down" });
      seen.push(view.navigateSelection);
    }
    expect(seen).toEqual(["M", "W1", "A", "group:g2", "ungrouped:", "B", "group:g1"]);
    dispatcher.run({ type: "navigate", op: "up" });
    expect(view.navigateSelection).toBe("B");
  });

  it("畳んだグループの見出しにも届く（中は今いる workspace だけ）", () => {
    setup({ collapsed: true });
    const view = useViewStore(pinia);
    view.setView("B", "tB");
    const { dispatcher } = makeDispatcher(makeConnection());
    view.setNavigateSelection("group:g1");
    dispatcher.run({ type: "navigate", op: "down" });
    expect(view.navigateSelection).toBe("group:g2");
  });

  it("openMenu: 見出しを選んでいても要求を立てる（開く先の判断は Sidebar.vue）", () => {
    setup();
    const view = useViewStore(pinia);
    view.setNavigateSelection("group:g1");
    makeDispatcher(makeConnection()).dispatcher.run({ type: "navigate", op: "openMenu" });
    expect(view.navigateMenuRequested).toBe(true);
    expect(view.navigateSelection).toBe("group:g1");
  });

  it("activate: 見出しを選んでいるときは選択をやめるだけで workspace.focus を送らない", () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    view.setNavigateSelection("group:g1");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "activate" });
    expect(view.navigateSelection).toBeNull();
    expect(conn.requests).toEqual([]);
  });

  it("toggleCollapse: 見出しならグループを group.toggle_collapsed で切り替える", () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    view.setNavigateSelection("group:g2");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(conn.requests).toEqual([["group.toggle_collapsed", { groupId: "g2" }]]);
  });

  it("toggleCollapse: worktree グループの先頭でも子でも、その worktree グループを畳む・広げる（サーバへは送らない）", () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    view.setNavigateSelection("M");
    dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.collapsedAutoGroups.has("/r/.git")).toBe(true);
    view.setNavigateSelection("W1");
    dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.collapsedAutoGroups.has("/r/.git")).toBe(false);
    expect(conn.requests).toEqual([]);
  });

  it("toggleCollapse: 通常の行・選択なしは何もしない（1 つだけのリポジトリも worktree グループではない）", () => {
    const session = setup();
    session.workspaceUpserted({ ...makeWorkspace("S", ["tS"]), git: { ...git(false), repoKey: "/s/.git" } });
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    for (const sel of ["B", "S", null]) {
      view.setNavigateSelection(sel);
      dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    }
    expect(view.collapsedAutoGroups.size).toBe(0);
    expect(conn.requests).toEqual([]);
  });

  it("toggleCollapse: 代表でない通常の行（同じフォルダの 2 つ目）では、同じリポジトリの worktree グループを畳まない", () => {
    const session = setup();
    // M と同じフォルダ（worktreeKey が同じ）の 2 つ目。代表は M・W1 の 2 つあるので、代表なら畳める状況。
    session.workspaceUpserted({ ...makeWorkspace("M2", ["tM2"]), activeTabId: "tM2", git: { ...git(false), worktreeKey: "/r" } });
    session.workspaceUpserted({ ...session.workspaces.get("M")!, git: { ...git(false), worktreeKey: "/r" } });
    session.workspaceUpserted({ ...session.workspaces.get("W1")!, git: { ...git(true), worktreeKey: "/r-w1" } });
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    view.setNavigateSelection("M2");
    dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.collapsedAutoGroups.size).toBe(0);
    view.setNavigateSelection("M");
    dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.collapsedAutoGroups.has("/r/.git")).toBe(true);
    expect(conn.requests).toEqual([]);
  });

  it("moveWorkspace: layout を持つサーバには項目の item.move_by を送る（対象は今いる workspace。サーバが項目に読み替える）", () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    view.setView("W1", "tW1");
    makeDispatcher(conn).dispatcher.run({ type: "moveWorkspace", direction: "previous" });
    expect(conn.requests).toEqual([["item.move_by", { item: { kind: "workspace", workspaceId: "W1" }, direction: "previous" }]]);
  });

  it("moveWorkspace: 名前順の一番上は送らず知らせる。グループの中は送る", () => {
    setup();
    const view = useViewStore(pinia);
    view.toggleWorkspaceSort();
    expect(view.workspaceSort).toBe("name");
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    view.setView("B", "tB"); // 一番上
    dispatcher.run({ type: "moveWorkspace", direction: "next" });
    expect(conn.requests).toEqual([]);
    expect(view.toasts.map((t) => t.message)).toEqual(["名前順では並べ替えできません"]);
    view.setView("A", "tA"); // グループの中
    dispatcher.run({ type: "moveWorkspace", direction: "next" });
    expect(conn.requests).toEqual([["item.move_by", { item: { kind: "workspace", workspaceId: "A" }, direction: "next" }]]);
  });

  it("moveWorkspace: layout の無い古いサーバには今までの workspace.move を送る", () => {
    const session = setup();
    session.layout = null;
    const view = useViewStore(pinia);
    const conn = makeConnection();
    view.setView("B", "tB");
    makeDispatcher(conn).dispatcher.run({ type: "moveWorkspace", direction: "next" });
    expect(conn.requests).toEqual([["workspace.move", { workspaceId: "B", direction: "next" }]]);
  });

  // AC-I4。実際のメニュー経路（見出しのメニューを開く→「上へ移動」を押す→ moveGroupBy）を通して、選択が消えないことを確かめる。
  it("見出しのメニューから「上へ移動」を実行しても、見出しの選択が残る（メニューを閉じる経路でも消えない）", async () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    view.onModeChange("navigate");
    view.setNavigateSelection("group:g1");
    dispatcher.run({ type: "navigate", op: "openMenu" });
    view.clearNavigateMenuRequest(); // Sidebar.vue が要求を受けて消す
    dispatcher.openContextMenu({ kind: "group", groupId: "g1" }, { x: 0, y: 0 });
    const wrapper = mount(ContextMenu, { global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: dispatcher } }, attachTo: document.body });
    expect(view.navigateSelection).toBe("group:g1");
    const up = wrapper.findAll("li").find((li) => li.text() === "上へ移動");
    await up!.trigger("click");
    expect(view.contextMenu).toBeNull();
    expect(conn.requests).toEqual([["item.move_by", { item: { kind: "group", groupId: "g1" }, direction: "previous" }]]);
    expect(view.navigateSelection).toBe("group:g1");
    wrapper.unmount();
  });

  // 追補 01 B / T26：「グループなし」の見出しの選択・畳む・メニュー・並べ替え。
  it("「グループなし」の見出しを畳むと、中の項目は up/down で選べなくなる（見出し自体には届く）", () => {
    setup();
    const view = useViewStore(pinia);
    view.setView("M", "tM");
    const { dispatcher } = makeDispatcher(makeConnection());
    view.setNavigateSelection("group:g2");
    dispatcher.run({ type: "navigate", op: "down" });
    expect(view.navigateSelection).toBe("ungrouped:");
    dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.ungroupedCollapsed).toBe(true);
    dispatcher.run({ type: "navigate", op: "down" });
    expect(view.navigateSelection).toBe("group:g1"); // 畳んだ中の B（今いる workspace ではない）は飛ばす
    dispatcher.run({ type: "navigate", op: "up" });
    expect(view.navigateSelection).toBe("ungrouped:");
  });

  it("toggleCollapse: 「グループなし」は共有の設定を切り替えるだけで、サーバへは何も送らない（広げ直せる）", () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    view.setNavigateSelection("ungrouped:");
    dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.ungroupedCollapsed).toBe(true);
    dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.ungroupedCollapsed).toBe(false);
    expect(conn.requests).toEqual([]);
  });

  it("toggleCollapse: 見出しが出ていない（グループが無くなった）のに「グループなし」が選択に残っていたら、畳まずに選択を外す", () => {
    const session = setup();
    const view = useViewStore(pinia);
    session.groupDeleted("g1");
    session.groupDeleted("g2");
    session.layoutChanged({ top: ["u"], groups: {}, ungrouped: ["w:A", "w:B", "r:/r/.git"] });
    view.setNavigateSelection("ungrouped:");
    makeDispatcher(makeConnection()).dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(view.ungroupedCollapsed).toBe(false);
    expect(view.navigateSelection).toBeNull();
  });

  it("activate: 「グループなし」を選んでいるときは選択をやめるだけで workspace.focus を送らない", () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    view.setNavigateSelection("ungrouped:");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "activate" });
    expect(view.navigateSelection).toBeNull();
    expect(conn.requests).toEqual([]);
  });

  it("openMenu: 「グループなし」を選んでいても要求を立てる（開く先の判断は Sidebar.vue）", () => {
    setup();
    const view = useViewStore(pinia);
    view.setNavigateSelection("ungrouped:");
    makeDispatcher(makeConnection()).dispatcher.run({ type: "navigate", op: "openMenu" });
    expect(view.navigateMenuRequested).toBe(true);
    expect(view.navigateSelection).toBe("ungrouped:");
  });

  it("moveUngroupedBy: 「グループなし」の項目で item.move_by を送る", () => {
    setup();
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.moveUngroupedBy("previous");
    expect(conn.requests).toEqual([["item.move_by", { item: { kind: "ungrouped" }, direction: "previous" }]]);
  });

  it("moveUngroupedBy: 名前順のときは送らず「名前順では並べ替えできません」と知らせる", () => {
    setup();
    const view = useViewStore(pinia);
    view.toggleWorkspaceSort();
    const conn = makeConnection();
    makeDispatcher(conn).dispatcher.moveUngroupedBy("next");
    expect(conn.requests).toEqual([]);
    expect(view.toasts.map((t) => t.message)).toEqual(["名前順では並べ替えできません"]);
  });

  it("「グループなし」の見出しのメニューから「下へ移動」を実行しても、見出しの選択が残る", async () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    view.onModeChange("navigate");
    view.setNavigateSelection("ungrouped:");
    dispatcher.openContextMenu({ kind: "ungrouped" }, { x: 0, y: 0 });
    const wrapper = mount(ContextMenu, { global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: dispatcher } }, attachTo: document.body });
    expect(wrapper.findAll("li").map((li) => li.text())).toEqual(["上へ移動", "下へ移動"]);
    await wrapper.findAll("li")[1]!.trigger("click");
    expect(conn.requests).toEqual([["item.move_by", { item: { kind: "ungrouped" }, direction: "next" }]]);
    expect(view.navigateSelection).toBe("ungrouped:");
    wrapper.unmount();
  });

  it("moveWorkspace: 「グループなし」の中の項目は項目の item.move_by", () => {
    setup();
    const view = useViewStore(pinia);
    const conn = makeConnection();
    const { dispatcher } = makeDispatcher(conn);
    view.setView("B", "tB");
    dispatcher.run({ type: "moveWorkspace", direction: "previous" });
    expect(conn.requests).toEqual([["item.move_by", { item: { kind: "workspace", workspaceId: "B" }, direction: "previous" }]]);
  });

  it("openGroupPicker: 「グループなし」の項目からは全部のグループを選べる（moving は付かない）", () => {
    setup();
    makeDispatcher(makeConnection()).dispatcher.openGroupPicker("B");
    const ctx = useViewStore(pinia).dialogContext;
    expect(ctx?.kind === "addToGroup" && ctx.groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(ctx).not.toHaveProperty("moving");
  });

  it("toggleCollapse: 別の画面で消されたグループが選択に残っていたら、何も送らず選択を外す", () => {
    setup();
    const session = useSessionStore(pinia);
    const view = useViewStore(pinia);
    const conn = makeConnection();
    view.setNavigateSelection("group:g2");
    session.groupDeleted("g2");
    makeDispatcher(conn).dispatcher.run({ type: "navigate", op: "toggleCollapse" });
    expect(conn.requests).toEqual([]);
    expect(view.navigateSelection).toBeNull();
  });
});
