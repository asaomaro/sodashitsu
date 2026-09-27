import type { MethodName, ParamsOf, Pane, ResultOf, Tab } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalRegistryKey } from "../injection.js";
import { KeyInputController } from "../keys/KeyInputController.js";
import { KeyRouter, type KeyRouterClock } from "../keys/KeyRouter.js";
import { DEFAULT_KEYMAP } from "../keys/keymap.js";
import type { ConnectionPort } from "../net/ports.js";
import { useSeenStore } from "../store/seen.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import { MouseBridge } from "../term/MouseBridge.js";
import { RendererPool, type WebglAddonLike } from "../term/RendererPool.js";
import { TerminalRegistry } from "../term/TerminalRegistry.js";
import TerminalPane from "./TerminalPane.vue";

let pinia: Pinia;

beforeEach(() => {
  // seen store は soda.seen.v1（localStorage）を読む。消さないと前のテストの既読が持ち越される
  // （20260925-seen-semantics-fix。Sidebar.test.ts の並び順の扱いと同じ理由）。
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  document.body.innerHTML = "";
});

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

function makeConnection(): ConnectionPort {
  return {
    request<M extends MethodName>(_method: M, _params: ParamsOf<M>): Promise<ResultOf<M>> {
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

function makeRegistry(): TerminalRegistry {
  const conn = makeConnection();
  const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
  const keys = new KeyInputController(router, conn);
  const renderers = new RendererPool({ capacity: 100, createWebglAddon: () => new FakeWebglAddon() });
  return new TerminalRegistry({
    capacity: 100,
    conn,
    renderers,
    keys,
    createMouseBridge: (term, paneId) => new MouseBridge({ term, paneId, ui: { toast: () => undefined, openContextMenu: () => undefined }, getRightClickTarget: () => "herdr" }),
  });
}

function makePane(id: string, overrides: Partial<Pane> = {}): Pane {
  return { id, tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}
function makeTab(id: string, sizeOwnerClientId: string | null = null): Tab {
  return { id, workspaceId: "w1", label: id, layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId };
}

function mountPane(paneId: string, registry: TerminalRegistry) {
  return mount(TerminalPane, {
    props: { paneId },
    global: { plugins: [pinia], provide: { [TerminalRegistryKey as symbol]: registry } },
    attachTo: document.body,
  });
}

describe("TerminalPane", () => {
  it("acquire した要素を差し込む", () => {
    const registry = makeRegistry();
    useSessionStore(pinia).tabUpserted(makeTab("t1"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    const wrapper = mountPane("p1", registry);
    const entry = registry.get("p1")!;
    expect(wrapper.find(".terminal-pane-mount").element.contains(entry.element)).toBe(true);
    wrapper.unmount();
  });

  // 20260925-seen-semantics-fix（design「振る舞いの詳細」手順3）。ウィンドウが既にフォーカス
  // されたまま pane を表示に切り替えた遷移を拾う——main.ts の発火点だけでは拾えなかった。
  describe("mount 時の既読（20260925-seen-semantics-fix）", () => {
    function makeAgent(overrides: Partial<Pane["agent"]> = {}): NonNullable<Pane["agent"]> {
      return { instanceId: "a1", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 3, serverSeenSeq: 0, verified: true, since: 0, ...overrides };
    }

    it("ウィンドウにフォーカスがあれば、mount した pane のエージェントを既読にする", () => {
      const registry = makeRegistry();
      useSessionStore(pinia).tabUpserted(makeTab("t1"));
      useSessionStore(pinia).paneUpserted(makePane("p1", { agent: makeAgent() }));
      const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
      const wrapper = mountPane("p1", registry);
      const seen = useSeenStore(pinia);
      expect(seen.getSeenSeq("a1", -1)).toBe(3);
      wrapper.unmount();
      hasFocus.mockRestore();
    });

    it("ウィンドウにフォーカスが無ければ、既読にしない", () => {
      const registry = makeRegistry();
      useSessionStore(pinia).tabUpserted(makeTab("t1"));
      useSessionStore(pinia).paneUpserted(makePane("p1", { agent: makeAgent() }));
      const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
      const wrapper = mountPane("p1", registry);
      const seen = useSeenStore(pinia);
      expect(seen.getSeenSeq("a1", -1)).toBe(-1);
      wrapper.unmount();
      hasFocus.mockRestore();
    });

    it("エージェントが無い pane は既読の対象にしない", () => {
      const registry = makeRegistry();
      useSessionStore(pinia).tabUpserted(makeTab("t1"));
      useSessionStore(pinia).paneUpserted(makePane("p1", { agent: null }));
      const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
      const wrapper = mountPane("p1", registry);
      const seen = useSeenStore(pinia);
      expect(seen.seen).toEqual({});
      wrapper.unmount();
      hasFocus.mockRestore();
    });
  });

  it("unmount で release し、要素を取り外す", () => {
    const registry = makeRegistry();
    useSessionStore(pinia).tabUpserted(makeTab("t1"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    const wrapper = mountPane("p1", registry);
    const entry = registry.get("p1")!;
    wrapper.unmount();
    expect(entry.element.parentElement).toBeNull();
    // release されただけで保持は続く（破棄はされていない）。容量超過で evict されるまで get できる。
    expect(registry.get("p1")).toBe(entry);
  });

  it("mousedown で view.focusPane を呼ぶ（capture フェーズ。M1）", async () => {
    const registry = makeRegistry();
    useSessionStore(pinia).tabUpserted(makeTab("t1"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    const view = useViewStore(pinia);
    const wrapper = mountPane("p1", registry);
    await wrapper.get(".terminal-pane").trigger("mousedown");
    expect(view.focusedPaneId).toBe("p1");
    wrapper.unmount();
  });

  it("view.focusedPaneId がこの pane になったら term.focus() する", async () => {
    const registry = makeRegistry();
    useSessionStore(pinia).tabUpserted(makeTab("t1"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    const view = useViewStore(pinia);
    const wrapper = mountPane("p1", registry);
    const entry = registry.get("p1")!;
    const focusSpy = vi.spyOn(entry.term, "focus");
    view.focusPane("p1");
    await wrapper.vm.$nextTick();
    expect(focusSpy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it("マウント時に既に focus 対象なら最初から term.focus() する", () => {
    const registry = makeRegistry();
    useSessionStore(pinia).tabUpserted(makeTab("t1"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    useViewStore(pinia).focusPane("p1");
    const wrapper = mountPane("p1", registry);
    const entry = registry.get("p1")!;
    expect(entry.element.contains(document.activeElement)).toBe(true);
    wrapper.unmount();
  });

  it("端末の入力欄を Tab で止まる場所にするのは、選ばれている pane だけ（roving tabindex。D110・独立点検 #2）", async () => {
    const registry = makeRegistry();
    useSessionStore(pinia).tabUpserted(makeTab("t1"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    useSessionStore(pinia).paneUpserted(makePane("p2"));
    const view = useViewStore(pinia);
    view.focusPane("p2");
    const w1 = mountPane("p1", registry);
    const w2 = mountPane("p2", registry);
    const t1 = registry.get("p1")!.term.textarea!;
    const t2 = registry.get("p2")!.term.textarea!;
    expect([t1.tabIndex, t2.tabIndex]).toEqual([-1, 0]);
    view.focusPane("p1");
    await w1.vm.$nextTick();
    expect([t1.tabIndex, t2.tabIndex]).toEqual([0, -1]);
    w1.unmount();
    w2.unmount();
  });

  it("status:'failed' の pane は xterm.js を作らず、理由を表示する", () => {
    const registry = makeRegistry();
    useSessionStore(pinia).tabUpserted(makeTab("t1"));
    useSessionStore(pinia).paneUpserted(makePane("p1", { status: "failed", failure: "実行ファイルが見つかりません" }));
    const wrapper = mountPane("p1", registry);
    expect(wrapper.find(".terminal-pane-failed").text()).toBe("実行ファイルが見つかりません");
    expect(wrapper.find(".terminal-pane-mount").exists()).toBe(false);
    expect(registry.get("p1")).toBeUndefined(); // acquire していない
    wrapper.unmount();
  });

  it("サイズ権限が無ければ terminal-pane-scaled クラスがつく", () => {
    const registry = makeRegistry();
    useSessionStore(pinia).applySnapshot(
      { protocol: 1, serverVersion: "t", host: { os: "linux", windowsBuild: null, hostname: "h" }, workspaces: [], tabs: [], panes: [], groups: [], focus: null, limits: { scrollbackLines: 5000 } },
      "me",
    );
    useSessionStore(pinia).tabUpserted(makeTab("t1", "someone-else"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    const wrapper = mountPane("p1", registry);
    expect(wrapper.find(".terminal-pane").classes()).toContain("terminal-pane-scaled");
    wrapper.unmount();
  });

  it("サイズ権限を持っていれば terminal-pane-scaled クラスがつかない", () => {
    const registry = makeRegistry();
    useSessionStore(pinia).applySnapshot(
      { protocol: 1, serverVersion: "t", host: { os: "linux", windowsBuild: null, hostname: "h" }, workspaces: [], tabs: [], panes: [], groups: [], focus: null, limits: { scrollbackLines: 5000 } },
      "me",
    );
    useSessionStore(pinia).tabUpserted(makeTab("t1", "me"));
    useSessionStore(pinia).paneUpserted(makePane("p1"));
    const wrapper = mountPane("p1", registry);
    expect(wrapper.find(".terminal-pane").classes()).not.toContain("terminal-pane-scaled");
    wrapper.unmount();
  });
});
