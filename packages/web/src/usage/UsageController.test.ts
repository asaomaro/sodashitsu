import { describe, expect, it, vi } from "vitest";
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
