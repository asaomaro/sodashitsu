import type { Pane, Tab } from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { ActionDispatcherKey, TerminalRegistryKey } from "../injection.js";
import { useSessionStore } from "../store/session.js";
import { useSettingsStore } from "../store/settings.js";
import PaneFrame from "./PaneFrame.vue";

/** pane の枠の操作ボタン（モダンの様式だけ。20261008-ui-style PR4 の AC19〜AC22）。クラシックでは出ない（否定の対照）。 */

let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  pinia = createPinia();
});
afterEach(() => {
  document.body.innerHTML = "";
});

function makePane(id: string, overrides: Partial<Pane> = {}): Pane {
  return { id, tabId: "t1", label: null, cwd: "/", shell: "/bin/bash", cols: 80, rows: 24, status: "running", failure: null, busy: false, title: "", rightClick: "herdr", agent: null, agentSession: null, ...overrides };
}
function makeTab(overrides: Partial<Tab> = {}): Tab {
  return { id: "t1", workspaceId: "w1", label: "t1", layout: { type: "pane", paneId: "p1" }, focusedPaneId: "p1", zoomedPaneId: null, sizeOwnerClientId: null, ...overrides };
}

function mountFrame(style: "classic" | "modern", opts: { named?: boolean; enabled?: boolean } = {}) {
  const settings = useSettingsStore(pinia);
  settings.setUiStyle(style);
  settings.paneAgentNameVisible = opts.named === true;
  const session = useSessionStore(pinia);
  session.paneUpserted(makePane("p1", { label: opts.named ? "alpha" : null }));
  session.tabUpserted(makeTab());
  const actions = { openContextMenu: vi.fn(), splitPane: vi.fn(), zoomPane: vi.fn(), closePaneWithConfirm: vi.fn(), closePaneById: vi.fn() };
  const registry = { focus: vi.fn(), get: vi.fn(() => undefined) };
  const wrapper = mount(PaneFrame, {
    attachTo: document.body,
    props: { paneId: "p1", enabled: opts.enabled ?? true, multiPane: true },
    global: { plugins: [pinia], provide: { [ActionDispatcherKey as symbol]: actions, [TerminalRegistryKey as symbol]: registry } },
    slots: { default: '<div class="fake-leaf"><textarea class="fake-terminal"></textarea></div>' },
  });
  return { wrapper, actions, registry, session };
}

describe("pane の枠の操作ボタン（モダン）", () => {
  it("クラシックでは出ない。モダンでも、枠を使わない（enabled でない。モバイル・単体テスト）ときは出ない", () => {
    expect(mountFrame("classic", { named: true }).wrapper.find("[data-pane-actions]").exists()).toBe(false);
    expect(mountFrame("classic").wrapper.find("[data-pane-actions]").exists()).toBe(false);
    expect(mountFrame("modern", { enabled: false }).wrapper.find("[data-pane-actions]").exists()).toBe(false);
  });

  it("名前の行があるときは、行の右端（row）に［右へ分割］［下へ分割］［最大化］［閉じる］の順。閉じるが最後", () => {
    const { wrapper } = mountFrame("modern", { named: true });
    const g = wrapper.get("[data-pane-actions]");
    expect(g.classes()).toContain("pane-actions-row");
    expect(g.findAll("button").map((b) => b.attributes("data-pane-action"))).toEqual(["split-right", "split-down", "zoom", "close"]);
    expect(g.findAll("button").map((b) => b.attributes("aria-label"))).toEqual(["右へ分割", "下へ分割", "最大化", "閉じる"]);
    // Tab の順に入れない。
    for (const b of g.findAll("button")) expect(b.attributes("tabindex")).toBe("-1");
  });

  it("名前の行が無いとき（枠の名前の設定が切）は、端末の領域の右上の隅（corner）に出す", () => {
    const { wrapper } = mountFrame("modern");
    const g = wrapper.get("[data-pane-actions]");
    expect(g.classes()).toContain("pane-actions-corner");
    expect(wrapper.get(".pane-frame-center").element.contains(g.element)).toBe(true);
  });

  it("押すと、今ある操作を呼ぶ（分割・拡大表示）。pane を選び、端末へフォーカスを戻す", async () => {
    const { wrapper, actions, registry } = mountFrame("modern", { named: true });
    await wrapper.get('[data-pane-action="split-right"]').trigger("click");
    expect(actions.splitPane).toHaveBeenLastCalledWith("p1", "right");
    await wrapper.get('[data-pane-action="split-down"]').trigger("click");
    expect(actions.splitPane).toHaveBeenLastCalledWith("p1", "down");
    await wrapper.get('[data-pane-action="zoom"]').trigger("click");
    expect(actions.zoomPane).toHaveBeenCalledWith("p1");
    expect(registry.focus).toHaveBeenCalledWith("p1");
  });

  it("閉じるは、確認つきの経路（closePaneWithConfirm）だけを呼ぶ。busy でない素のシェルでも。直に閉じる経路（closePaneById）は呼ばない", async () => {
    const { wrapper, actions } = mountFrame("modern", { named: true });
    await wrapper.get('[data-pane-action="close"]').trigger("click");
    expect(actions.closePaneWithConfirm).toHaveBeenCalledWith("p1");
    expect(actions.closePaneById).not.toHaveBeenCalled();
  });

  it("最大化している間は、同じ場所が「元に戻す」になる（印と読み上げのラベルが替わる）", async () => {
    const { wrapper, session } = mountFrame("modern", { named: true });
    const btn = () => wrapper.get('[data-pane-action="zoom"]');
    expect(btn().attributes("aria-label")).toBe("最大化");
    const svgBefore = btn().html();
    session.tabUpserted(makeTab({ zoomedPaneId: "p1" }));
    await nextTick();
    expect(btn().attributes("aria-label")).toBe("元に戻す");
    expect(btn().attributes("aria-pressed")).toBe("true");
    expect(btn().html()).not.toBe(svgBefore);
    // 位置は同じ（順は変わらない）。
    expect(wrapper.findAll("[data-pane-actions] button").map((b) => b.attributes("data-pane-action"))).toEqual(["split-right", "split-down", "zoom", "close"]);
  });

  it("ボタンの押下は、端末からフォーカスを奪わない（mousedown を止める）。名前の D&D・枠の右クリックに混ざらない", () => {
    const { wrapper, actions } = mountFrame("modern", { named: true });
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    wrapper.get('[data-pane-action="zoom"]').element.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(actions.openContextMenu).not.toHaveBeenCalled();
  });

  it("様式を切り替えると、再読み込みなしで出る・消える", async () => {
    const { wrapper } = mountFrame("modern", { named: true });
    expect(wrapper.find("[data-pane-actions]").exists()).toBe(true);
    useSettingsStore(pinia).setUiStyle("classic");
    await nextTick();
    expect(wrapper.find("[data-pane-actions]").exists()).toBe(false);
  });
});
