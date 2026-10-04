import type {
  AgentInfo,
  MethodName,
  ParamsOf,
  ResultOf,
  SessionSnapshot,
  Workspace,
} from "@sodashitsu/protocol";
import { mount } from "@vue/test-utils";
import { createPinia, type Pinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionDispatcherKey, ConnectionKey, MachineSwitcherKey } from "../injection.js";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useMachinesStore } from "../store/machines.js";
import { useSessionStore } from "../store/session.js";
import { useViewStore } from "../store/view.js";
import Sidebar from "./Sidebar.vue";

/** サイドバーのマシンのまとまり（20260927-multi-host-machines の T14。相互作用の AC-I1〜I5）。 */
let pinia: Pinia;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  pinia = createPinia();
});

const B = "b".repeat(32);
const C = "c".repeat(32);
const ws = (id: string, label = id): Workspace => ({
  id,
  label,
  cwd: "/",
  tabIds: [`t-${id}`],
  activeTabId: `t-${id}`,
  groupId: null,
  git: null,
  autoLabel: false,
});
const agent = (over: Partial<AgentInfo> = {}): AgentInfo => ({
  instanceId: "a1",
  kind: "claude",
  label: "Claude",
  state: "blocked",
  completionSeq: 0,
  serverSeenSeq: 0,
  verified: true,
  since: 0,
  ...over,
});
const remoteSnap = (): SessionSnapshot => ({
  protocol: 1,
  serverVersion: "t",
  host: { os: "linux", windowsBuild: null, hostname: "gpu" },
  workspaces: [ws("w1", "train"), ws("w2", "eval")],
  tabs: [
    {
      id: "t-w1",
      workspaceId: "w1",
      label: "t",
      layout: { type: "pane", paneId: "p1" },
      focusedPaneId: "p1",
      zoomedPaneId: null,
      sizeOwnerClientId: null,
    },
  ],
  panes: [
    {
      id: "p1",
      tabId: "t-w1",
      label: null,
      cwd: "/",
      shell: "sh",
      cols: 80,
      rows: 24,
      status: "running",
      failure: null,
      busy: false,
      title: "",
      rightClick: "herdr",
      agent: agent(),
      agentSession: null,
    },
  ],
  groups: [],
  focus: null,
  limits: { scrollbackLines: 5000 },
});

function makeConnection(): ConnectionPort & { requests: [MethodName, unknown][] } {
  return {
    requests: [],
    request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
      this.requests.push([method, params]);
      return Promise.resolve({} as ResultOf<M>);
    },
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

function mountWith(opts: { withMachines: boolean }) {
  const session = useSessionStore(pinia);
  session.workspaceUpserted(ws("w1", "local-api"));
  const machines = useMachinesStore(pinia);
  if (opts.withMachines) {
    machines.setMachines([
      { id: B, label: "GPU", state: "online", message: null },
      {
        id: C,
        label: "Build",
        state: "attention",
        message: "リモートで soda serve が動いていません",
      },
    ]);
    machines.applySummarySnapshot(B, remoteSnap());
    machines.applySummarySnapshot(C, remoteSnap());
    machines.setSummaryConnected(C, false);
  }
  const switchTo = vi.fn(async () => true);
  const conn = makeConnection();
  const wrapper = mount(Sidebar, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      provide: {
        [ConnectionKey as symbol]: conn,
        [ActionDispatcherKey as symbol]: {
          openContextMenu: vi.fn(),
          run: vi.fn(),
          toggleGroupCollapsed: vi.fn(),
          moveItemByDrag: vi.fn(),
          openSessionSwitcher: vi.fn(),
        },
        [MachineSwitcherKey as symbol]: { switchTo },
      },
    },
  });
  return { wrapper, switchTo, machines, conn };
}

describe("Sidebar のマシンのまとまり（T14）", () => {
  it("有効なマシンが無ければ見出しを出さず今までのまま（AC15・AC-I1）", () => {
    const { wrapper } = mountWith({ withMachines: false });
    expect(wrapper.find(".machine-header").exists()).toBe(false);
    expect(wrapper.find(".machine-rows").exists()).toBe(false);
    expect(wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.text())).toEqual([
      "local-api",
    ]);
    wrapper.unmount();
  });

  it("ローカルを先頭に登録の順で見出しと状態を出す。選んでいるマシンは今までの行、ほかは要約の行と状態の印（AC8）", () => {
    const { wrapper } = mountWith({ withMachines: true });
    const headers = wrapper.findAll(".machine-header");
    expect(headers.map((h) => h.find(".machine-label").text())).toEqual([
      "ローカル",
      "GPU",
      "Build",
    ]);
    expect(headers.map((h) => h.find(".machine-state").text())).toEqual([
      "再接続中",
      "接続済み",
      "要対応",
    ]); // ローカルは画面の接続がまだ open でない
    expect(headers[2]!.find(".machine-select").attributes("title")).toMatch(/動いていません/);
    expect(headers[0]!.find(".machine-select").attributes("aria-current")).toBe("true");
    expect(wrapper.findAll(".sidebar-spaces .sidebar-row").map((r) => r.text())).toEqual([
      "local-api",
    ]);
    const gpuRows = wrapper.find(`[data-machine-rows="${B}"]`).findAll(".machine-row");
    expect(gpuRows.map((r) => r.find(".machine-row-label").text())).toEqual(["train", "eval"]);
    expect(gpuRows[0]!.find(".sidebar-state-icon").attributes("data-state")).toBe("blocked");
    expect(gpuRows[0]!.attributes("aria-label")).toMatch(/^train・入力待ち・別のマシン/); // 行の名前が状態の印の名前を上書きするので含める
    wrapper.unmount();
  });

  it("ほかのマシンの行・見出しを押すとそのマシンへ切り替える（行は workspace つき、見出しは無し）。切れているマシンは disabled で押しても何もしない（AC9・AC11・AC-I2）", async () => {
    const { wrapper, switchTo } = mountWith({ withMachines: true });
    await wrapper.find(`[data-machine-rows="${B}"] .machine-row`).trigger("click");
    expect(switchTo).toHaveBeenLastCalledWith(B, { workspaceId: "w1", tabId: "t-w1" });
    await wrapper.findAll(".machine-header")[1]!.find(".machine-select").trigger("click");
    expect(switchTo).toHaveBeenLastCalledWith(B);
    const buildRows = wrapper.find(`[data-machine-rows="${C}"]`);
    expect(buildRows.classes()).toContain("machine-rows-dim");
    expect(buildRows.find(".machine-row").attributes("aria-disabled")).toBe("true");
    const buildHeader = wrapper.findAll(".machine-header")[2]!.find(".machine-select");
    expect(buildHeader.attributes("aria-disabled")).toBe("true");
    expect(buildHeader.attributes("disabled")).toBeUndefined(); // Tab で辿れる（AC-I3）
    expect(buildHeader.attributes("aria-label")).toMatch(
      /要対応.*動いていません.*切り替えられません/,
    ); // 理由を読み上げる
    await buildHeader.trigger("click");
    const calls = switchTo.mock.calls.length;
    await buildRows.find(".machine-row").trigger("click");
    expect(switchTo.mock.calls.length).toBe(calls);
    wrapper.unmount();
  });

  it("折りたたみのボタンは一覧を畳む・開くだけで切り替えない。aria-expanded が変わりフォーカスはボタンに残る（AC-I1・AC-I4）", async () => {
    const { wrapper, switchTo } = mountWith({ withMachines: true });
    const toggle = wrapper.findAll(".machine-toggle")[1]!;
    (toggle.element as HTMLButtonElement).focus();
    expect(toggle.attributes("aria-expanded")).toBe("true");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(`[data-machine-rows="${B}"]`).exists()).toBe(false);
    expect(document.activeElement).toBe(toggle.element);
    expect(switchTo).not.toHaveBeenCalled();
    // 選んでいるマシン（ローカル）も畳める（今までの行が消える）。切れているマシンも畳める。
    await wrapper.findAll(".machine-toggle")[0]!.trigger("click");
    expect(wrapper.findAll(".sidebar-spaces .sidebar-row")).toHaveLength(0);
    await wrapper.findAll(".machine-toggle")[2]!.trigger("click");
    expect(wrapper.find(`[data-machine-rows="${C}"]`).exists()).toBe(false);
    wrapper.unmount();
  });

  it("見出し・折りたたみ・行はボタンで、Enter は window の keydown へ漏らさない（AC-I3・AC-I5）", async () => {
    const { wrapper } = mountWith({ withMachines: true });
    const seen: string[] = [];
    const onKey = (ev: KeyboardEvent): void => void seen.push(ev.key);
    window.addEventListener("keydown", onKey);
    for (const el of [
      wrapper.find(".machine-toggle"),
      wrapper.find(".machine-select"),
      wrapper.find(".machine-row"),
    ]) {
      expect(el.element.tagName).toBe("BUTTON");
      await el.trigger("keydown", { key: "Enter" });
      await el.trigger("keydown", { key: "ArrowDown" });
    }
    window.removeEventListener("keydown", onKey);
    expect(seen).toEqual(["ArrowDown", "ArrowDown", "ArrowDown"]);
    wrapper.unmount();
  });

  it("ほかのマシンの行のポインタ操作は今までの行の D&D に流れない。ほかのマシンを選んでいる間は session のボタンを出さない（AC-I5）", async () => {
    const { wrapper } = mountWith({ withMachines: true });
    const view = useViewStore(pinia);
    const row = wrapper.find(`[data-machine-rows="${B}"] .machine-row`);
    row.element.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 1, clientY: 1, pointerId: 1 }),
    );
    row.element.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 50, clientY: 50, pointerId: 1 }),
    );
    expect(view.workspaceDrag).toBeNull();
    const session = useSessionStore(pinia);
    session.setNamedSessionCount(2);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".sidebar-session-btn").exists()).toBe(true);
    useMachinesStore(pinia).select(B);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".sidebar-session-btn").exists()).toBe(false);
    wrapper.unmount();
  });

  it("navigate モードに入ると、畳んだ選んでいるマシンのまとまりを開く。開閉のボタンは一覧を指す（aria-controls）", async () => {
    const { wrapper, machines } = mountWith({ withMachines: true });
    expect(wrapper.findAll(".machine-toggle")[1]!.attributes("aria-controls")).toBe(
      `machine-rows-${B}`,
    );
    expect(wrapper.find(`#machine-rows-${B}`).exists()).toBe(true);
    machines.toggleCollapsed("local");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".sidebar-spaces .sidebar-row")).toHaveLength(0);
    useViewStore(pinia).onModeChange("navigate");
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll(".sidebar-spaces .sidebar-row")).toHaveLength(1);
    wrapper.unmount();
  });

  it("選んでいるマシンが切り替わると、そのまとまりに今までの行が移る", async () => {
    const { wrapper, machines } = mountWith({ withMachines: true });
    machines.applySummarySnapshot("local", {
      ...remoteSnap(),
      workspaces: [ws("w1", "local-api")],
    });
    machines.select(B);
    await wrapper.vm.$nextTick();
    // GPU は今までの行（session のストア）、ローカルは要約の行
    expect(
      wrapper
        .find(`[data-machine-rows="local"]`)
        .findAll(".machine-row-label")
        .map((r) => r.text()),
    ).toEqual(["local-api"]);
    expect(wrapper.find(`[data-machine-rows="${B}"]`).exists()).toBe(false);
    expect(
      wrapper.findAll(".machine-header")[1]!.find(".machine-select").attributes("aria-current"),
    ).toBe("true");
    wrapper.unmount();
  });
});
