import type { AgentInfo, Pane, Tab, Workspace } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ActionDispatcherKey, TerminalRegistryKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import { useUsageStore } from "../store/usage.js";
import { useViewStore } from "../store/view.js";
import ContextMenu from "./ContextMenu.vue";
import PaneFrame from "./PaneFrame.vue";
import PaneInfoPopover from "./PaneInfoPopover.vue";

/** 20261010-agent-usage PR4 の AC2・AC3・AC5: 入口（モダンの［情報］・右クリックのメニュー）と、窓の開閉・フォーカス。 */

let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  document.body.innerHTML = "";
});

const agent = (over: Partial<AgentInfo> = {}): AgentInfo => ({ instanceId: "i", kind: "claude", label: "Claude Code", state: "idle", completionSeq: 0, serverSeenSeq: 0, verified: true, since: Date.now(), ...over });
function makePane(id: string, over: Partial<Pane> = {}): Pane {
  return { id, tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...over };
}
function seed(withAgent: boolean): void {
  const session = useSessionStore(pinia);
  session.workspaceUpserted({ id: "w1", label: "repo", cwd: "/", tabIds: ["t1"], activeTabId: "t1", groupId: null, git: null, autoLabel: false } as unknown as Workspace);
  session.tabUpserted({ id: "t1", workspaceId: "w1", label: "t1", layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null } as Tab);
  session.paneUpserted(makePane("p1", { agent: withAgent ? agent({ name: "alpha" }) : null }));
}

function mountFrame(style: "classic" | "modern", withAgent: boolean, named = true) {
  const settings = useSettingsStore(pinia);
  settings.setUiStyle(style);
  settings.paneAgentNameVisible = named;
  seed(withAgent);
  const actions = { openContextMenu: vi.fn(), splitPane: vi.fn(), zoomPane: vi.fn(), closePaneWithConfirm: vi.fn(), closePaneById: vi.fn() };
  const registry = { focus: vi.fn(), get: vi.fn(() => undefined) };
  const wrapper = mount(PaneFrame, {
    attachTo: document.body,
    props: { paneId: "p1", enabled: true, multiPane: true },
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions, [TerminalRegistryKey as symbol]: registry } },
    slots: { default: '<div class="fake-leaf"><textarea class="fake-terminal"></textarea></div>' },
  });
  return { wrapper, registry };
}

describe("［情報］ボタン（モダン）", () => {
  it("エージェントの居る pane: 分割と最大化の間に［情報］。読み上げのラベル・Tab の順に入れない・押すと窓が開き、もう一度で閉じる（aria-pressed）", async () => {
    const { wrapper } = mountFrame("modern", true);
    const g = wrapper.get("[data-pane-actions]");
    expect(g.findAll("button").map((b) => b.attributes("data-pane-action"))).toEqual(["split-right", "split-down", "info", "zoom", "close"]);
    const info = wrapper.get('[data-pane-action="info"]');
    expect(info.attributes("aria-label")).toBe("利用状況（情報）");
    expect(info.attributes("tabindex")).toBe("-1");
    expect(info.find("svg").exists()).toBe(true);
    const view = useViewStore(pinia);
    expect(info.attributes("aria-pressed")).toBe("false");
    await info.trigger("click");
    expect(view.paneInfoPaneId).toBe("p1");
    expect(info.attributes("aria-pressed")).toBe("true");
    await info.trigger("click");
    expect(view.paneInfoPaneId).toBeNull();
  });

  it("エージェントの居ない pane では出さない（否定の対照）。クラシックでは、エージェントが居ても、隅のボタン自体が出ない", () => {
    expect(mountFrame("modern", false).wrapper.find('[data-pane-action="info"]').exists()).toBe(false);
    pinia = createPinia();
    document.body.innerHTML = "";
    const c = mountFrame("classic", true);
    expect(c.wrapper.find("[data-pane-actions]").exists()).toBe(false);
    expect(c.wrapper.find('[data-pane-action="info"]').exists()).toBe(false);
  });

  it("押してもフォーカスは端末のまま（mousedown を止める）", async () => {
    const { wrapper } = mountFrame("modern", true);
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    wrapper.get('[data-pane-action="info"]').element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("右クリックのメニュー「利用状況…」", () => {
  function mountMenu() {
    const actions = { showPaneInfo: vi.fn(), renamePaneById: vi.fn(), clearPaneName: vi.fn(), splitPane: vi.fn(), zoomPane: vi.fn(), setRightClickTarget: vi.fn(), pasteIntoPane: vi.fn(), closePaneById: vi.fn(), swapWithFocused: vi.fn(), run: vi.fn(), openAgentFork: vi.fn() };
    const wrapper = mount(ContextMenu, { global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions } }, attachTo: document.body });
    return { wrapper, actions };
  }
  for (const style of ["classic", "modern"] as const) {
    it(`${style}: エージェントの居る pane のメニューに出て、選ぶと窓を開く。居ない pane には出さない`, async () => {
      useSettingsStore(pinia).setUiStyle(style);
      seed(true);
      const view = useViewStore(pinia);
      const { wrapper, actions } = mountMenu();
      view.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 10, y: 10 });
      await nextTick();
      const labels = wrapper.findAll("[role=menuitem]").map((i) => i.text());
      expect(labels).toContain("利用状況…");
      // ほかの項目の並びは、「利用状況…」が増えただけ（順序を保つ）。
      expect(labels.indexOf("利用状況…")).toBeGreaterThan(labels.indexOf("貼り付け"));
      expect(labels.indexOf("利用状況…")).toBeLessThan(labels.indexOf("閉じる"));
      await wrapper.findAll("[role=menuitem]")[labels.indexOf("利用状況…")]!.trigger("click");
      expect(actions.showPaneInfo).toHaveBeenCalledWith("p1");
      wrapper.unmount();
      pinia = createPinia();
      document.body.innerHTML = "";
      useSettingsStore(pinia).setUiStyle(style);
      seed(false);
      const v2 = useViewStore(pinia);
      const m2 = mountMenu();
      v2.openContextMenu({ kind: "pane", paneId: "p1" }, { x: 10, y: 10 });
      await nextTick();
      expect(m2.wrapper.findAll("[role=menuitem]").map((i) => i.text())).not.toContain("利用状況…");
    });
  }
});

describe("利用状況の窓（PaneInfoPopover）", () => {
  function mountPopover() {
    const registry = { focus: vi.fn(), get: vi.fn(() => undefined) };
    seed(true);
    // pane の箱（基本画面）の代わり。大きさのある要素。
    const paneEl = document.createElement("div");
    paneEl.setAttribute("data-pane-id", "p1");
    paneEl.getBoundingClientRect = () => ({ left: 0, top: 0, right: 900, bottom: 600, width: 900, height: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(paneEl);
    const wrapper = mount(PaneInfoPopover, { attachTo: document.body, global: { plugins: [pinia], provide: { [TerminalRegistryKey as symbol]: registry } } });
    return { wrapper, registry, view: useViewStore(pinia), usage: useUsageStore(pinia) };
  }

  it("開いている間だけ出る。開くと窓にフォーカス。Esc で閉じ、フォーカスは端末へ戻る", async () => {
    const { wrapper, registry, view } = mountPopover();
    expect(wrapper.find("[data-pane-info-window]").exists()).toBe(false);
    view.openPaneInfo("p1");
    await nextTick();
    await nextTick();
    const win = wrapper.get("[data-pane-info-window]");
    expect(win.attributes("role")).toBe("dialog");
    expect(win.find("[data-pane-info]").exists()).toBe(true);
    await win.trigger("keydown", { key: "Escape" });
    expect(view.paneInfoPaneId).toBeNull();
    await nextTick();
    expect(registry.focus).toHaveBeenCalledWith("p1");
    expect(wrapper.find("[data-pane-info-window]").exists()).toBe(false);
  });

  it("外を押すと閉じる（フォーカスは押した先へ。端末へは戻さない）。窓の中を押しても閉じない", async () => {
    const { wrapper, registry, view } = mountPopover();
    view.openPaneInfo("p1");
    await nextTick();
    await nextTick();
    wrapper.get("[data-pane-info-window]").element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(view.paneInfoPaneId).toBe("p1");
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(view.paneInfoPaneId).toBeNull();
    expect(registry.focus).not.toHaveBeenCalled();
  });

  it("開いている間、配信を受ける（usageWatchWanted）。閉じたら止まる（ダッシュボードが見えていなければ）", async () => {
    const { view } = mountPopover();
    expect(view.usageWatchWanted).toBe(false);
    view.openPaneInfo("p1");
    expect(view.usageWatchWanted).toBe(true);
    view.closePaneInfo();
    expect(view.usageWatchWanted).toBe(false);
  });

  it("pane が閉じたら窓も閉じる。ダイアログ（確認など）が開いている間は隠れる", async () => {
    const { wrapper, view } = mountPopover();
    view.openPaneInfo("p1");
    await nextTick();
    view.openDialogWithContext({ kind: "help" });
    await nextTick();
    expect(wrapper.find("[data-pane-info-window]").exists()).toBe(false);
    view.closeDialog();
    await nextTick();
    expect(wrapper.find("[data-pane-info-window]").exists()).toBe(true);
    useSessionStore(pinia).panes.delete("p1");
    await nextTick();
    await nextTick();
    expect(view.paneInfoPaneId).toBeNull();
  });
});
