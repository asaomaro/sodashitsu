import { afterEach, describe, expect, it } from "vitest";
import { PaneRegistry, type RequestPort, type ViewCommit } from "./PaneRegistry.js";

function fakeConn(): RequestPort & { calls: [string, unknown][] } {
  const calls: [string, unknown][] = [];
  return {
    calls,
    request: ((method: string, params: unknown) => {
      calls.push([method, params]);
      return Promise.resolve({ cols: 80, rows: 24 });
    }) as RequestPort["request"],
  };
}

const view = (ids: string[], tabId = "t1"): ViewCommit => ({
  workspaceId: "w1",
  tabId,
  visible: ids.map((paneId) => ({ paneId, cols: 40, rows: 10 })),
});
const size = () => ({ cols: 80, rows: 24 });

describe("PaneRegistry（見えている pane の購読。T3）", () => {
  const regs: PaneRegistry[] = [];
  afterEach(() => {
    for (const r of regs.splice(0)) r.dispose();
  });
  function make() {
    const conn = fakeConn();
    const reg = new PaneRegistry(
      conn,
      () => 500,
      () => undefined,
    );
    regs.push(reg);
    return { conn, reg };
  }

  it("hello の前は何も送らず、繋がったら client.view → pane.subscribe の順に送る", () => {
    const { conn, reg } = make();
    reg.commit(view(["p1", "p2"]), size);
    expect(conn.calls).toEqual([]);
    expect(reg.get("p1")?.cols).toBe(80); // サーバの大きさで作る（SNAPSHOT で合わせ直る）
    reg.connectionOpened();
    expect(conn.calls.map((c) => c[0])).toEqual([
      "client.view",
      "pane.subscribe",
      "pane.subscribe",
    ]);
    expect(conn.calls[0]![1]).toEqual(view(["p1", "p2"]));
    expect(conn.calls[1]![1]).toEqual({ paneId: "p1", scrollbackLines: 500 });
  });

  it("同じ表示は送り直さず、見えなくなった pane は購読を外して headless を捨てる", () => {
    const { conn, reg } = make();
    reg.connectionOpened();
    reg.commit(view(["p1", "p2"]), size);
    conn.calls.length = 0;
    reg.commit(view(["p1", "p2"]), size);
    expect(conn.calls).toEqual([]);
    reg.commit(view(["p3"], "t2"), size);
    expect(conn.calls.map((c) => c[0])).toEqual([
      "client.view",
      "pane.subscribe",
      "pane.unsubscribe",
      "pane.unsubscribe",
    ]);
    expect(reg.get("p1")).toBeUndefined();
    expect(reg.get("p3")).toBeDefined();
  });

  it("接続が替わったら同じ表示でも送り直し、購読し直す（新しい clientId は前の購読を持たない）", () => {
    const { conn, reg } = make();
    reg.connectionOpened();
    reg.commit(view(["p1"]), size);
    reg.connectionClosed();
    conn.calls.length = 0;
    reg.commit(view(["p1"]), size);
    expect(conn.calls).toEqual([]);
    reg.connectionOpened();
    expect(conn.calls.map((c) => c[0])).toEqual(["client.view", "pane.subscribe"]);
  });

  it("SNAPSHOT・OUTPUT・大きさの変化は対応する pane の headless へ", async () => {
    const { reg } = make();
    reg.commit(view(["p1"]), size);
    reg.onSnapshot("p1", 30, 4, "snap");
    reg.onOutput("p1", new TextEncoder().encode("!"));
    reg.onOutput("zz", new TextEncoder().encode("ignored"));
    const t = reg.get("p1")!;
    await t.flush();
    expect(t.term.buffer.active.getLine(0)?.translateToString(true)).toBe("snap!");
    reg.onSizeChanged("p1", 50, 7);
    expect([t.cols, t.rows]).toEqual([50, 7]);
  });

  it("閉じた pane は捨てる", () => {
    const { reg } = make();
    reg.connectionOpened();
    reg.commit(view(["p1"]), size);
    reg.paneClosed("p1");
    expect(reg.get("p1")).toBeUndefined();
    expect(reg.isSubscribed("p1")).toBe(false);
  });
});
