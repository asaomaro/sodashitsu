import { afterEach, describe, expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { snapshot, tab, workspace, leaf, pane } from "../testing/fixtures.js";

/** 狭い幅（既定 64 桁未満）の 1 列表示（herdr の mobile。AC2・AC5）。 */
describe("TuiApp：狭い幅の 1 列表示", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  it("サイドバーを隠し、上辺に workspace と tab の位置と switch、焦点の pane だけを全体に出して申告する", async () => {
    const snap = snapshot({
      workspaces: [workspace("w1", ["t1", "tb"], { label: "alpha" }), workspace("w2", ["t2"])],
      tabs: [
        tab("t1", "w1", {
          type: "split",
          id: "s1",
          dir: "right",
          ratio: 0.5,
          a: leaf("p1"),
          b: leaf("p2"),
        }),
        tab("tb", "w1", leaf("p4")),
        tab("t2", "w2", leaf("p3")),
      ],
      panes: [pane("p1", "t1"), pane("p2", "t1"), pane("p4", "tb"), pane("p3", "t2")],
    });
    const h = await startedApp({ cols: 50, rows: 20, snapshot: snap });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    // 50 桁・枠の罫線 2 → 48、上辺 1 行・罫線 2 → 17。
    expect(h.ws.requests("client.view")[0]!.params).toEqual({
      workspaceId: "w1",
      tabId: "t1",
      visible: [{ paneId: "p1", cols: 48, rows: 17 }],
    });
    await vi.waitFor(async () => {
      const line0 = (await h.screen()).split("\n")[0]!;
      expect(line0).toContain("alpha");
      expect(line0).toContain("tab 1/2");
      expect(line0).toContain("switch");
    });
    expect(await h.screen()).not.toContain("Spaces");
    // 焦点を右の pane へ移すと、その pane を全体に出して申告し直す。
    h.io.type("\x02l");
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(2));
    expect(h.ws.requests("client.view")[1]!.params).toMatchObject({
      visible: [{ paneId: "p2", cols: 48, rows: 17 }],
    });
  });

  it("switch を押すと選び直しの一覧（goto）が開き、選んだ pane へ移る", async () => {
    const h = await startedApp({ cols: 50, rows: 20 });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    await h.screen();
    h.app.renderNow();
    h.io.type("\x1b[<0;47;1M\x1b[<0;47;1m");
    expect(h.app.ui.dialogContext).toEqual({ kind: "goto" });
    // w1, t1, p1(今), p2, w2, t2, p3 → G で最後（p3）へ
    h.io.type("G\r");
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p3"));
    expect(h.app.model.workspaceId).toBe("w2");
  });

  it("広げると元の割り付け（サイドバー・tab バー・分割）に戻る", async () => {
    const h = await startedApp({ cols: 50, rows: 20 });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.io.resizeTo(100, 30);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(2));
    expect(h.ws.requests("client.view")[1]!.params).toMatchObject({
      visible: [{ paneId: "p1" }, { paneId: "p2" }],
    });
  });

  it("広い → 狭い（63 桁）で 1 列に、64 桁で元の割り付けに戻る（既定の境目 64）", async () => {
    const h = await startedApp({ cols: 100, rows: 20 });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.io.resizeTo(63, 20);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(2));
    expect(h.ws.requests("client.view")[1]!.params).toMatchObject({
      visible: [{ paneId: "p1", cols: 61 }],
    });
    h.io.resizeTo(64, 20);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(3));
    expect(
      (h.ws.requests("client.view")[2]!.params as { visible: unknown[] }).visible,
    ).toHaveLength(2);
  });

  it("上辺：モードの印（tab バーと同じ）・tab の名前・接続の状態と session 名", async () => {
    const h = await startedApp({ cols: 60, rows: 20 });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.app.renderNow();
    let line0 = (await h.screen()).split("\n")[0]!;
    expect(line0).toContain("t1"); // tab が 1 つなら名前だけ
    expect(line0).toContain("session: work");
    h.io.type("\x02[");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("copy"));
    h.app.renderNow();
    line0 = (await h.screen()).split("\n")[0]!;
    expect(line0).toContain("COPY");
    h.io.type("q");
    h.app.connectionState = "rejected";
    h.app.renderNow();
    line0 = (await h.screen()).split("\n")[0]!;
    expect(line0).toContain("接続できません");
    // 繋がっていないときは名前より先に（名前・tab は出さない。tab バーと同じく警告を優先）。
    expect(line0).not.toContain("t1");
  });

  it("navigate モードではサイドバーを pane の上に重ね、選んでいる workspace が見える（herdr の switcher）", async () => {
    const h = await startedApp({ cols: 50, rows: 20 });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.io.type("\x02w");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("navigate"));
    h.io.type("\x1b[B");
    h.app.renderNow();
    const text = await h.screen();
    expect(text).toContain("Spaces");
    expect(h.app.ui.navigateSelection).toBe("w2");
    // 重ねたサイドバーの行を押すとその workspace へ。
    const hits = (
      h.app as unknown as { sidebarHits: { kind: string; y: number; workspaceId?: string }[] }
    ).sidebarHits;
    const w2 = hits.find((x) => x.kind === "workspace" && x.workspaceId === "w2")!;
    h.io.type(`\x1b[<0;4;${w2.y + 1}M\x1b[<0;4;${w2.y + 1}m`);
    await vi.waitFor(() => expect(h.app.model.workspaceId).toBe("w2"));
    // pane の割り付け（申告する大きさ）は変えない。
    expect(h.ws.requests("client.view").at(-1)!.params).toMatchObject({
      visible: [{ cols: 48, rows: 17 }],
    });
  });
});
