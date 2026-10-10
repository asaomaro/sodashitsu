import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { watch } from "vue";
import { useViewStore } from "../store/view.js";
import { UsageController } from "./UsageController.js";

function make(opts: { visible?: boolean; page?: boolean; machine?: string } = {}) {
  const state = { visible: opts.visible ?? false, page: opts.page ?? true, machine: opts.machine ?? "local" };
  const requests: [string, unknown][] = [];
  let failWith: unknown;
  const conn = {
    request: vi.fn(async (method: string, params: unknown) => {
      requests.push([method, params]);
      if (failWith !== undefined && method === "agent.usage_watch") throw failWith;
      if (method === "agent.usage") return { panes: {}, accounts: [] };
      return {};
    }),
  };
  const store = { setSnapshot: vi.fn(), markUnsupported: vi.fn(), markFailed: vi.fn(), clear: vi.fn() };
  const c = new UsageController({
    conn: conn as never,
    store,
    isWanted: () => state.visible,
    isPageVisible: () => state.page,
    machineId: () => state.machine,
  });
  return { c, state, requests, store, fail: (e: unknown) => (failWith = e) };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
const watchCalls = (r: [string, unknown][]) => r.filter(([m]) => m === "agent.usage_watch").map(([, p]) => (p as { on: boolean }).on);

describe("UsageController（20261010-agent-usage PR3 の AC2）", () => {
  it("見えていない間は何も頼まない。見えて・前面で・接続が開いたら、on を送って最初の値を取る。見えなくなったら off", async () => {
    const t = make();
    t.c.onOpened();
    await flush();
    expect(t.requests).toEqual([]);
    t.state.visible = true;
    t.c.sync();
    await flush();
    expect(t.requests.map(([m]) => m)).toEqual(["agent.usage_watch", "agent.usage"]);
    expect(watchCalls(t.requests)).toEqual([true]);
    expect(t.store.setSnapshot).toHaveBeenCalledTimes(1);
    t.c.sync(); // 重ねて頼まない
    await flush();
    expect(watchCalls(t.requests)).toEqual([true]);
    t.state.visible = false;
    t.c.sync();
    await flush();
    expect(watchCalls(t.requests)).toEqual([true, false]);
  });

  it("タブが裏へ回ったら止め、戻ったら頼み直す。接続が開く前・切れた後は頼まない", async () => {
    const t = make({ visible: true });
    t.c.sync(); // まだ開いていない
    await flush();
    expect(t.requests).toEqual([]);
    t.c.onOpened();
    await flush();
    expect(watchCalls(t.requests)).toEqual([true]);
    t.state.page = false;
    t.c.sync();
    await flush();
    expect(watchCalls(t.requests)).toEqual([true, false]);
    t.state.page = true;
    t.c.sync();
    await flush();
    expect(watchCalls(t.requests)).toEqual([true, false, true]);
    // 切れたら、サーバの印は消えている。off は送らず、開き直したら on を送り直す
    t.c.onClosed();
    t.state.visible = false;
    t.c.sync();
    await flush();
    expect(watchCalls(t.requests)).toEqual([true, false, true]);
    t.state.visible = true;
    t.c.onOpened();
    await flush();
    expect(watchCalls(t.requests)).toEqual([true, false, true, true]);
  });

  it("別のマシンへ替わった再接続では、前のマシンの値を捨てる。同じマシンの再接続では捨てない", async () => {
    const t = make({ machine: "local" });
    t.c.onOpened();
    t.c.onClosed();
    t.c.onOpened();
    expect(t.store.clear).not.toHaveBeenCalled();
    t.c.onClosed();
    t.state.machine = "m2";
    t.c.onOpened();
    expect(t.store.clear).toHaveBeenCalledTimes(1);
  });

  it("古いサーバ（not_found）は「対応していない」、ほかの失敗は「取れなかった」。どちらも、取り直しは次に見えたとき", async () => {
    const t = make({ visible: true });
    t.fail({ code: "not_found" });
    t.c.onOpened();
    await flush();
    expect(t.store.markUnsupported).toHaveBeenCalledTimes(1);
    const t2 = make({ visible: true });
    t2.fail(new Error("boom"));
    t2.c.onOpened();
    await flush();
    expect(t2.store.markFailed).toHaveBeenCalledTimes(1);
  });
});

// 20261010-agent-usage PR4: 窓（pane の情報）を閉じたら、配信が止まる。ダッシュボードが見えていれば、止めない（見ている、の数え方は 1 つ）。
describe("UsageController × view.usageWatchWanted（20261010-agent-usage PR4 の AC3）", () => {
  function wired() {
    setActivePinia(createPinia());
    localStorage.clear();
    const view = useViewStore();
    const requests: [string, unknown][] = [];
    const conn = {
      request: vi.fn(async (method: string, params: unknown) => {
        requests.push([method, params]);
        return method === "agent.usage" ? { panes: {}, accounts: [] } : {};
      }),
    };
    const c = new UsageController({
      conn: conn as never,
      store: { setSnapshot: vi.fn(), markUnsupported: vi.fn(), markFailed: vi.fn(), clear: vi.fn() },
      isWanted: () => view.usageWatchWanted,
      isPageVisible: () => true,
      machineId: () => "local",
    });
    watch(() => view.usageWatchWanted, () => c.sync(), { flush: "sync" }); // main.ts と同じ
    c.onOpened();
    return { view, requests };
  }

  it("窓を開くと on・閉じると off（usageWatchWanted が偽に戻る）", async () => {
    const { view, requests } = wired();
    expect(view.usageWatchWanted).toBe(false);
    view.openPaneInfo("p1");
    await flush();
    expect(view.usageWatchWanted).toBe(true);
    expect(watchCalls(requests)).toEqual([true]);
    view.closePaneInfo();
    await flush();
    expect(view.usageWatchWanted).toBe(false);
    expect(watchCalls(requests)).toEqual([true, false]);
  });

  it("ダッシュボードが見えているときに窓を閉じても、off は送らない（続けて見ている）。ダッシュボードを閉じて初めて off", async () => {
    const { view, requests } = wired();
    view.openDashboard();
    await flush();
    view.openPaneInfo("p1");
    await flush();
    expect(watchCalls(requests)).toEqual([true]); // 重ねて頼まない
    view.closePaneInfo();
    await flush();
    expect(view.usageWatchWanted).toBe(true);
    expect(watchCalls(requests)).toEqual([true]);
    view.closeDashboard();
    await flush();
    expect(watchCalls(requests)).toEqual([true, false]);
  });
});
