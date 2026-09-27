import type { LayoutNode } from "@sodashitsu/protocol";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, type Pinia } from "pinia";
import { ActionDispatcherKey, ConnectionKey, ViewSyncKey } from "../injection.js";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";
import PaneLayout from "./PaneLayout.vue";

function makeConnection(): ConnectionPort {
  return {
    request: vi.fn().mockResolvedValue({}),
    sendInput: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    connect: vi.fn(),
  };
}

const SPLIT_LAYOUT: LayoutNode = {
  type: "split",
  id: "s1",
  dir: "right",
  ratio: 0.5,
  a: { type: "pane", paneId: "p1" },
  b: { type: "pane", paneId: "p2" },
};

// 文書に付けて描く（`isConnected` で「切り離された要素が載っていないか」を見るため。D105）。後始末は自動で外す。
enableAutoUnmount(afterEach);

type FakeViewSync = { commit: ReturnType<typeof vi.fn>; attachCommitter?: (commit: () => void) => () => void };

function mountLayout(
  layout: LayoutNode,
  opts: { zoomedPaneId?: string | null; viewSync?: FakeViewSync; followResize?: boolean; measureSinglePane?: (paneId: string, element: HTMLElement) => { width: number; height: number } } = {},
) {
  const conn = makeConnection();
  const viewSync = opts.viewSync ?? { commit: vi.fn() };
  // `attachCommitter`（D107）を確かめない test では、付けるだけで何もしないものを渡す。
  const provided = { commit: viewSync.commit, attachCommitter: viewSync.attachCommitter ?? (() => () => undefined) };
  const wrapper = mount(PaneLayout, {
    attachTo: document.body,
    props: {
      workspaceId: "w1",
      tabId: "t1",
      layout,
      zoomedPaneId: opts.zoomedPaneId ?? null,
      ...(opts.followResize ? { followResize: true } : {}),
      ...(opts.measureSinglePane ? { measureSinglePane: opts.measureSinglePane } : {}),
    },
    global: { provide: { [ConnectionKey as symbol]: conn, [ViewSyncKey as symbol]: provided } },
    slots: {
      pane: '<template #pane="{ paneId }"><div class="fake-pane" :data-pane-id="paneId"></div></template>',
    },
  });
  return { wrapper, viewSync };
}

describe("PaneLayout", () => {
  it("pane 単体のレイアウトは 1 つの葉を描く", () => {
    const { wrapper } = mountLayout({ type: "pane", paneId: "p1" });
    const leaves = wrapper.findAll(".fake-pane");
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.attributes("data-pane-id")).toBe("p1");
  });

  it("分割は 2 つの葉と 1 つの Splitter を描く", () => {
    const { wrapper } = mountLayout(SPLIT_LAYOUT);
    const leaves = wrapper.findAll(".fake-pane");
    expect(leaves.map((l) => l.attributes("data-pane-id")).sort()).toEqual(["p1", "p2"]);
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(1);
  });

  it("ネストした分割も再帰的に描く", () => {
    const nested: LayoutNode = {
      type: "split",
      id: "s1",
      dir: "right",
      ratio: 0.5,
      a: { type: "pane", paneId: "p1" },
      b: { type: "split", id: "s2", dir: "down", ratio: 0.5, a: { type: "pane", paneId: "p2" }, b: { type: "pane", paneId: "p3" } },
    };
    const { wrapper } = mountLayout(nested);
    expect(
      wrapper
        .findAll(".fake-pane")
        .map((l) => l.attributes("data-pane-id"))
        .sort(),
    ).toEqual(["p1", "p2", "p3"]);
    expect(wrapper.findAll('[role="separator"]')).toHaveLength(2);
  });

  it("zoom 中は分割を無視して 1 つの pane だけを描く", () => {
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { zoomedPaneId: "p2" });
    const leaves = wrapper.findAll(".fake-pane");
    expect(leaves).toHaveLength(1);
    expect(leaves[0]?.attributes("data-pane-id")).toBe("p2");
    expect(wrapper.find('[role="separator"]').exists()).toBe(false);
  });

  it("初回マウント直後に ViewSync.commit を、表示中の pane の要素つきで呼ぶ（D91：以前は onUpdated だけに頼っていて、分割・zoom・tab 切替が一度も起きない初回表示では呼ばれなかった）", async () => {
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { viewSync });
    await wrapper.vm.$nextTick();
    expect(viewSync.commit).toHaveBeenCalledTimes(1);
    const call = viewSync.commit.mock.calls[0]?.[0] as { workspaceId: string; tabId: string; visible: { paneId: string; element: HTMLElement }[] };
    expect(call.workspaceId).toBe("w1");
    expect(call.tabId).toBe("t1");
    expect(call.visible.map((v) => v.paneId).sort()).toEqual(["p1", "p2"]);
    expect(call.visible[0]?.element).toBeInstanceOf(HTMLElement);
  });

  it("再描画（props の変化）のたびにも ViewSync.commit を呼ぶ（onUpdated。初回分と合わせて 2 回）", async () => {
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { viewSync });
    await wrapper.vm.$nextTick();
    expect(viewSync.commit).toHaveBeenCalledTimes(1);
    (wrapper.vm as unknown as { commitView(): void }).commitView();
    expect(viewSync.commit).toHaveBeenCalledTimes(2);
  });
});

type CommitArg = { workspaceId: string; tabId: string; visible: { paneId: string; element: HTMLElement }[] };

/** 最後の `ViewSync.commit` の表示中の pane（paneId の順にそろえる）。要素が文書に付いているか・どの pane の中身を包んでいるかも返す。 */
function lastVisible(viewSync: { commit: ReturnType<typeof vi.fn> }) {
  const call = viewSync.commit.mock.calls.at(-1)?.[0] as CommitArg | undefined;
  return (call?.visible ?? [])
    .map((v) => ({ paneId: v.paneId, connected: v.element.isConnected, content: v.element.querySelector(".fake-pane")?.getAttribute("data-pane-id") ?? null }))
    .sort((a, b) => a.paneId.localeCompare(b.paneId));
}

/**
 * D105：表示する pane が変わったとき、外れた葉の登録を消す。以前は葉の関数 ref が外すとき（el＝null）に**その時点の**
 * `singlePaneId`（もう新しい pane）を読んでいたため、古い pane が切り離された要素のまま `ownLeaves` に残り、
 * `client.view` に `cols:1, rows:1` で載り続けた（モバイルではサーバが隠れた pane の PTY を 1×1 に縮めた）。
 */
describe("PaneLayout — 表示から外れた pane の登録（D105）", () => {
  it("単一 pane の表示が p1 → p2 に変わったら、client.view は p2 だけになる（モバイルの切り替え・デスクトップの tab／workspace の切り替え）", async () => {
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout({ type: "pane", paneId: "p1" }, { viewSync });
    await wrapper.vm.$nextTick();
    expect(lastVisible(viewSync)).toEqual([{ paneId: "p1", connected: true, content: "p1" }]);

    await wrapper.setProps({ layout: { type: "pane", paneId: "p2" } });
    expect(lastVisible(viewSync)).toEqual([{ paneId: "p2", connected: true, content: "p2" }]);
  });

  it("zoom する pane を p1 → p2 に変えたら、client.view は p2 だけになる", async () => {
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { zoomedPaneId: "p1", viewSync });
    await wrapper.vm.$nextTick();
    expect(lastVisible(viewSync)).toEqual([{ paneId: "p1", connected: true, content: "p1" }]);

    await wrapper.setProps({ zoomedPaneId: "p2" });
    expect(lastVisible(viewSync)).toEqual([{ paneId: "p2", connected: true, content: "p2" }]);
  });

  it("分割の中の子（root へ委ねる子の PaneLayout）の pane が p2 → p3 に変わったら、p2 は client.view から外れる", async () => {
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { viewSync });
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ layout: { ...SPLIT_LAYOUT, b: { type: "pane", paneId: "p3" } } satisfies LayoutNode });
    expect(lastVisible(viewSync)).toEqual([
      { paneId: "p1", connected: true, content: "p1" },
      { paneId: "p3", connected: true, content: "p3" },
    ]);
  });

  it("子どうしで pane が入れ替わっても（新しい葉の登録が古い葉の解除より先に届いても）、両方の pane が今の要素で残る", async () => {
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { viewSync });
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ layout: { ...SPLIT_LAYOUT, a: { type: "pane", paneId: "p2" }, b: { type: "pane", paneId: "p1" } } satisfies LayoutNode });
    expect(lastVisible(viewSync)).toEqual([
      { paneId: "p1", connected: true, content: "p1" },
      { paneId: "p2", connected: true, content: "p2" },
    ]);
  });

  it("zoom を解いて分割へ戻ったら、両方の pane が今の要素で載る（zoom 中の葉の解除で子の登録を消さない）", async () => {
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { zoomedPaneId: "p2", viewSync });
    await wrapper.vm.$nextTick();
    await wrapper.setProps({ zoomedPaneId: null });
    expect(lastVisible(viewSync)).toEqual([
      { paneId: "p1", connected: true, content: "p1" },
      { paneId: "p2", connected: true, content: "p2" },
    ]);
  });
});

/** `ResizeObserver` の代わり（happy-dom には無い）。`fire()` で大きさの変化を知らせる。 */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  readonly observed = new Set<Element>();
  observeCalls = 0;
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element): void {
    this.observeCalls++;
    this.observed.add(el);
  }
  unobserve(el: Element): void {
    this.observed.delete(el);
  }
  disconnect(): void {
    this.observed.clear();
    this.disconnected = true;
  }
  fire(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** 葉の要素（`.pane-layout-leaf`）を、包んでいる pane の id で引く。 */
function leafOf(paneId: string): Element {
  const el = document.querySelector(`.fake-pane[data-pane-id="${paneId}"]`)?.closest(".pane-layout-leaf");
  if (!el) throw new Error(`leaf not found: ${paneId}`);
  return el;
}

/**
 * D107（統合 review ラウンド1 で発見）：(1) 新しい接続の hello の後に、root が今の表示で commit し直せるよう `ViewSync` へ
 * commit の関数を付ける。(2) 以前は mount と自身の描き直しのときしか commit せず、窓・サイドバーの幅や折りたたみを変えても
 * `client.view` を送り直さなかった——`followResize` の root は葉の大きさの変化を見て commit し直す（間隔を空けてまとめる）。
 */
describe("PaneLayout — 接続が替わったときの commit と、表示領域の大きさへの追従（D107）", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    FakeResizeObserver.instances = [];
  });

  function makeViewSync() {
    const committers: (() => void)[] = [];
    const detach = vi.fn();
    const viewSync = {
      commit: vi.fn(),
      attachCommitter: vi.fn((commit: () => void) => {
        committers.push(commit);
        return detach;
      }),
    };
    return { viewSync, committers, detach };
  }

  it("root は mount 時に commit の関数を 1 つだけ（子は付けない）付け、呼ばれると描き直しを待ってから今の葉で commit する。unmount で外し、外した後は commit しない", async () => {
    const { viewSync, committers, detach } = makeViewSync();
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { viewSync });
    await wrapper.vm.$nextTick();
    expect(viewSync.attachCommitter).toHaveBeenCalledTimes(1);
    expect(viewSync.commit).toHaveBeenCalledTimes(1);

    committers[0]!(); // 新しい接続の hello が通った（ViewSync.onConnectionOpened）
    expect(viewSync.commit).toHaveBeenCalledTimes(1); // hello の snapshot で描き直すのを待つ
    await wrapper.vm.$nextTick();
    expect(viewSync.commit).toHaveBeenCalledTimes(2);
    expect(lastVisible(viewSync)).toEqual([
      { paneId: "p1", connected: true, content: "p1" },
      { paneId: "p2", connected: true, content: "p2" },
    ]);

    committers[0]!();
    wrapper.unmount(); // 描き直しの前に外れた（ログイン画面へ替わった等）
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(detach).toHaveBeenCalledTimes(1);
    expect(viewSync.commit).toHaveBeenCalledTimes(2);
  });

  it("followResize の root は葉を ResizeObserver で見て、変化があれば 100ms に 1 回まで（まとめて）commit し直す", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.useFakeTimers();
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { viewSync, followResize: true });
    await wrapper.vm.$nextTick();
    expect(FakeResizeObserver.instances).toHaveLength(1); // root の 1 つだけ（子の PaneLayout は作らない）
    const ro = FakeResizeObserver.instances[0]!;
    expect(ro.observed).toEqual(new Set([leafOf("p1"), leafOf("p2")]));
    const before = viewSync.commit.mock.calls.length;

    ro.fire(); // 窓の端のドラッグ等で続けて届く
    ro.fire();
    vi.advanceTimersByTime(50);
    ro.fire();
    vi.advanceTimersByTime(49);
    expect(viewSync.commit).toHaveBeenCalledTimes(before);
    vi.advanceTimersByTime(1);
    expect(viewSync.commit).toHaveBeenCalledTimes(before + 1);
    expect(lastVisible(viewSync).map((v) => v.paneId)).toEqual(["p1", "p2"]);

    // 間隔の後の変化は、また 1 回にまとめて commit する（最後の変化の分は必ず送る）。
    ro.fire();
    vi.advanceTimersByTime(100);
    expect(viewSync.commit).toHaveBeenCalledTimes(before + 2);
    vi.advanceTimersByTime(1000);
    expect(viewSync.commit).toHaveBeenCalledTimes(before + 2);
  });

  it("followResize：外れた葉は見るのをやめ、新しい葉を見る。同じ葉を描き直しのたびに見直さない", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout(SPLIT_LAYOUT, { viewSync, followResize: true });
    await wrapper.vm.$nextTick();
    const ro = FakeResizeObserver.instances[0]!;
    expect(ro.observeCalls).toBe(2);
    const oldP2 = leafOf("p2");

    await wrapper.setProps({ layout: { ...SPLIT_LAYOUT, b: { type: "pane", paneId: "p3" } } satisfies LayoutNode });
    expect(ro.observed.has(oldP2)).toBe(false);
    expect(ro.observed.has(leafOf("p1"))).toBe(true);
    expect(ro.observed.has(leafOf("p3"))).toBe(true);
    expect(ro.observed.size).toBe(2);
    expect(ro.observeCalls).toBe(3); // p1 の葉は描き直されても見直さない（見直すと通知が出直す）

    await wrapper.setProps({ zoomedPaneId: "p3" }); // zoom：分割の葉は外れ、zoom の葉だけ
    expect(ro.observed.size).toBe(1);
    expect(ro.observed.has(leafOf("p3"))).toBe(true);
  });

  it("followResize：unmount で見るのをやめ、待っている commit も捨てる", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.useFakeTimers();
    const viewSync = { commit: vi.fn() };
    const { wrapper } = mountLayout({ type: "pane", paneId: "p1" }, { viewSync, followResize: true });
    await wrapper.vm.$nextTick();
    const ro = FakeResizeObserver.instances[0]!;
    const before = viewSync.commit.mock.calls.length;
    ro.fire();
    wrapper.unmount();
    vi.advanceTimersByTime(1000);
    expect(ro.disconnected).toBe(true);
    expect(viewSync.commit).toHaveBeenCalledTimes(before);
  });

  it("followResize を付けない呼び出し（モバイルの MobileShell）は葉を見ない", async () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const { wrapper } = mountLayout(SPLIT_LAYOUT);
    await wrapper.vm.$nextTick();
    expect(FakeResizeObserver.instances).toHaveLength(0);
  });
});

/**
 * 04-mobile T9・D108：モバイル（`MobileShell`）は葉の代わりに表示領域の大きさを申告する。root の `PaneLayout` は `measureSinglePane` を
 * `ViewSync.commit` の `measureSinglePane` へそのまま渡す（デスクトップは付けないので、commit の中身は以前と同じ）。
 */
describe("PaneLayout — 測り方の口（measureSinglePane。D108）", () => {
  it("measureSinglePane を付けた root は、commit の measureSinglePane としてそのまま渡す", async () => {
    const measureSinglePane = vi.fn(() => ({ width: 390, height: 600 }));
    const { wrapper, viewSync } = mountLayout({ type: "pane", paneId: "p1" }, { measureSinglePane });
    await wrapper.vm.$nextTick();
    expect(viewSync.commit).toHaveBeenCalled();
    const arg = viewSync.commit.mock.calls.at(-1)![0] as { measureSinglePane?: unknown; visible: { paneId: string }[] };
    expect(arg.measureSinglePane).toBe(measureSinglePane);
    expect(arg.visible.map((v) => v.paneId)).toEqual(["p1"]);
  });

  it("付けなければ commit に measureSinglePane を載せない（デスクトップは葉を測る）", async () => {
    const { wrapper, viewSync } = mountLayout(SPLIT_LAYOUT);
    await wrapper.vm.$nextTick();
    const arg = viewSync.commit.mock.calls.at(-1)![0] as object;
    expect("measureSinglePane" in arg).toBe(false);
  });
});

/**
 * D110（M7 の後半「pane の枠の右クリックは常にメニューを開く」）：デスクトップの本体は `paneFrames` を付け、各葉を `PaneFrame` で
 * 包む。枠は葉の外なので、`ViewSync` に渡す（測る）要素は今までどおり葉——枠の太さを cols/rows に入れない。
 */
describe("PaneLayout — pane の枠（paneFrames。D110）", () => {
  function mountFramed(layout: LayoutNode, opts: { zoomedPaneId?: string | null } = {}) {
    const viewSync = { commit: vi.fn(), attachCommitter: () => () => undefined };
    const actions = { openContextMenu: vi.fn() };
    const wrapper = mount(PaneLayout, {
      attachTo: document.body,
      props: { workspaceId: "w1", tabId: "t1", layout, zoomedPaneId: opts.zoomedPaneId ?? null, paneFrames: true },
      global: {
        plugins: [createPinia()],
        provide: { [ConnectionKey as symbol]: makeConnection(), [ViewSyncKey as symbol]: viewSync, [ActionDispatcherKey as symbol]: actions },
      },
      slots: { pane: '<template #pane="{ paneId }"><div class="fake-pane" :data-pane-id="paneId"></div></template>' },
    });
    return { wrapper, viewSync, actions };
  }

  it("分割の中の葉も含め、pane ごとに枠を描き、枠の右クリックでその pane のメニューを開く", () => {
    const { wrapper, actions } = mountFramed(SPLIT_LAYOUT);
    const edges = wrapper.findAll(".pane-frame-edge");
    expect(edges).toHaveLength(2);
    for (const paneId of ["p1", "p2"]) {
      const frame = leafOf(paneId).closest(".pane-frame")!;
      frame.querySelector(".pane-frame-edge")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 2 }));
      expect(actions.openContextMenu).toHaveBeenLastCalledWith({ kind: "pane", paneId }, { x: 1, y: 2 });
    }
  });

  it("枠は葉の外：ViewSync に渡す要素は葉のまま（枠の太さを測る大きさに入れない）", async () => {
    const { wrapper, viewSync } = mountFramed(SPLIT_LAYOUT);
    await wrapper.vm.$nextTick();
    const arg = viewSync.commit.mock.calls.at(-1)![0] as { visible: { paneId: string; element: HTMLElement }[] };
    for (const { paneId, element } of arg.visible) {
      expect(element).toBe(leafOf(paneId));
      expect(element.closest(".pane-frame-enabled")).not.toBeNull(); // 枠の内側にある
      expect(element.querySelector(".pane-frame-edge")).toBeNull(); // 枠は葉の中に無い
    }
  });

  it("zoom 中は表示する 1 つの pane に枠を描く", () => {
    const { wrapper } = mountFramed(SPLIT_LAYOUT, { zoomedPaneId: "p2" });
    expect(wrapper.findAll(".pane-frame-edge")).toHaveLength(1);
    expect(leafOf("p2").closest(".pane-frame-enabled")).not.toBeNull();
  });

  it("paneFrames を付けない呼び出し（モバイルの MobileShell）は枠を描かない", () => {
    const { wrapper } = mountLayout(SPLIT_LAYOUT);
    expect(wrapper.find(".pane-frame-edge").exists()).toBe(false);
    expect(wrapper.find(".pane-frame-enabled").exists()).toBe(false);
  });
});

/**
 * 20260926-pane-frame-auto-mode：枠の描画モード・隙間。`PaneLayout` が分割の有無と辺ごとの隣を `PaneFrame` へ渡し、
 * `PaneFrame` が辺ごとの余白（inline style）・強調を描き分ける（design「振る舞いの詳細」）。
 */
describe("PaneLayout — 枠の描画モードと隙間（AC1〜AC5・AC7・AC9）", () => {
  const GAP = "var(--soda-pane-gap, 4px)";
  // p1 | (p2 / p3)：右分割の b が下分割（入れ子）。
  const NESTED: LayoutNode = {
    type: "split",
    id: "s1",
    dir: "right",
    ratio: 0.5,
    a: { type: "pane", paneId: "p1" },
    b: { type: "split", id: "s2", dir: "down", ratio: 0.5, a: { type: "pane", paneId: "p2" }, b: { type: "pane", paneId: "p3" } },
  };
  const SINGLE: LayoutNode = { type: "pane", paneId: "p1" };

  let pinia: Pinia;
  // 1 つのテストで描き直すときは前のものを外す（`leafOf` は文書全体から探すため）。
  let last: { unmount(): void } | null = null;
  function mountWith(layout: LayoutNode, opts: { zoomedPaneId?: string | null; paneFrames?: boolean; borders?: "always" | "auto" | "off"; gaps?: boolean } = {}) {
    last?.unmount();
    localStorage.clear();
    pinia = createPinia();
    const settings = useSettingsStore(pinia);
    if (opts.borders) settings.setPaneBorders(opts.borders);
    if (opts.gaps !== undefined) settings.setPaneGaps(opts.gaps);
    const viewSync = { commit: vi.fn(), attachCommitter: () => () => undefined };
    const wrapper = mount(PaneLayout, {
      attachTo: document.body,
      props: { workspaceId: "w1", tabId: "t1", layout, zoomedPaneId: opts.zoomedPaneId ?? null, paneFrames: opts.paneFrames ?? true },
      global: {
        plugins: [pinia],
        provide: { [ConnectionKey as symbol]: makeConnection(), [ViewSyncKey as symbol]: viewSync, [ActionDispatcherKey as symbol]: { openContextMenu: vi.fn() } },
      },
      slots: { pane: '<template #pane="{ paneId }"><div class="fake-pane" :data-pane-id="paneId"></div></template>' },
    });
    last = wrapper;
    return wrapper;
  }
  /** [上, 右, 下, 左] の余白。 */
  function paddingOf(paneId: string): string[] {
    const st = (leafOf(paneId).closest(".pane-frame") as HTMLElement).style;
    return [st.paddingTop, st.paddingRight, st.paddingBottom, st.paddingLeft];
  }
  const ALL = [GAP, GAP, GAP, GAP];
  const NONE = ["0px", "0px", "0px", "0px"];

  it("既定（常に・隙間入）：単一 pane も入れ子の分割も、各 pane の 4 辺に余白・選ばれた pane に強調（今と同じ。AC1）", () => {
    mountWith(SINGLE);
    useViewStore(pinia).focusPane("p1");
    expect(paddingOf("p1")).toEqual(ALL);
    const w = mountWith(NESTED);
    for (const p of ["p1", "p2", "p3"]) expect(paddingOf(p), p).toEqual(ALL);
    useViewStore(pinia).focusPane("p2");
    return w.vm.$nextTick().then(() => {
      expect(leafOf("p2").closest(".pane-frame")!.querySelector(".pane-frame-edge-current")).not.toBeNull();
      expect(document.querySelector(".pane-frame-edge-flush")).toBeNull();
    });
  });

  it("分割時だけ：単一 pane の tab は余白・強調なし、分割（zoom 中を含む）は常にと同じ（AC2）", async () => {
    const single = mountWith(SINGLE, { borders: "auto" });
    useViewStore(pinia).focusPane("p1");
    await single.vm.$nextTick();
    expect(paddingOf("p1")).toEqual(NONE);
    expect(document.querySelector(".pane-frame-edge-current")).toBeNull();

    mountWith(NESTED, { borders: "auto" });
    for (const p of ["p1", "p2", "p3"]) expect(paddingOf(p), p).toEqual(ALL);

    const zoomed = mountWith(NESTED, { borders: "auto", zoomedPaneId: "p2" });
    useViewStore(pinia).focusPane("p2");
    await zoomed.vm.$nextTick();
    expect(paddingOf("p2")).toEqual(ALL);
    expect(document.querySelector(".pane-frame-edge-current")).not.toBeNull();
  });

  it("表示しない×隙間入：外周の辺は 0、隣と接する辺にだけ余白（AC3・AC5・AC9）", () => {
    mountWith(NESTED, { borders: "off" });
    expect(paddingOf("p1")).toEqual(["0px", GAP, "0px", "0px"]);
    expect(paddingOf("p2")).toEqual(["0px", "0px", GAP, GAP]);
    expect(paddingOf("p3")).toEqual([GAP, "0px", "0px", GAP]);
    mountWith(SINGLE, { borders: "off" });
    expect(paddingOf("p1")).toEqual(NONE);
  });

  it("常に×隙間切：入れ子でも辺ごとに隣を判定し、隣と接する辺だけ 0（AC4・AC9）", () => {
    mountWith(NESTED, { gaps: false });
    expect(paddingOf("p1")).toEqual([GAP, "0px", GAP, GAP]);
    expect(paddingOf("p2")).toEqual([GAP, GAP, "0px", "0px"]);
    expect(paddingOf("p3")).toEqual(["0px", GAP, GAP, "0px"]);
  });

  it("表示しない×隙間切はすべて 0。zoom 中の pane は root が描くので、隙間切でも辺はすべて外周（AC3・AC4）", () => {
    mountWith(NESTED, { borders: "off", gaps: false });
    for (const p of ["p1", "p2", "p3"]) expect(paddingOf(p), p).toEqual(NONE);
    mountWith(NESTED, { gaps: false, zoomedPaneId: "p3" });
    expect(paddingOf("p3")).toEqual(ALL);
  });

  it("paneFrames を付けない呼び出し（モバイル）は、設定を変えても枠も余白の style も付けない（AC7）", () => {
    mountWith(NESTED, { paneFrames: false, borders: "off", gaps: false });
    expect(document.querySelector(".pane-frame-enabled")).toBeNull();
    expect(document.querySelector(".pane-frame[style]")).toBeNull();
  });
});
