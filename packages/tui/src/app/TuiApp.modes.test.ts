import { afterEach, describe, expect, it, vi } from "vitest";
import type { GotoDialog } from "../modes/GotoDialog.js";
import { startedApp } from "../testing/appHarness.js";

describe("TuiApp：モード（navigate・copy・resize・goto。AC5・AC7・AC-I1・AC-I3）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  async function start(opts?: Parameters<typeof startedApp>[0]) {
    const h = await startedApp(opts);
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    return h;
  }

  it("navigate（prefix+w）：NAVIGATE の印、j で次の workspace を選び、Enter でそこへ移って workspace.focus", async () => {
    const h = await start();
    h.io.type("\x02w");
    await vi.waitFor(async () => expect(await h.screen()).toContain("NAVIGATE"));
    expect(h.app.ui.navigateSelection).toBe("w1");
    h.io.type("\x1b[B"); // ↓（navigate_workspace_down の既定）
    expect(h.app.ui.navigateSelection).toBe("w2");
    h.io.type("\r");
    await vi.waitFor(() => expect(h.ws.requests("workspace.focus")).toHaveLength(1));
    expect(h.app.model.workspaceId).toBe("w2");
    expect(h.app.keys.mode).toBe("terminal");
  });

  it("navigate の Space で選んだ workspace のメニューを開く", async () => {
    const h = await start();
    h.io.type("\x02w");
    h.io.type(" ");
    await vi.waitFor(() =>
      expect(h.app.ui.contextMenu?.target).toEqual({ kind: "workspace", workspaceId: "w1" }),
    );
    await vi.waitFor(async () => expect(await h.screen()).toContain("新しいグループを作る…"));
  });

  it("resize（prefix+r）：l で pane.resize、Esc で抜ける", async () => {
    const h = await start();
    h.io.type("\x02r");
    await vi.waitFor(async () => expect(await h.screen()).toContain("RESIZE"));
    h.io.type("l");
    expect(h.ws.requests("pane.resize").map((r) => r.params)).toEqual([
      { paneId: "p1", direction: "right", amount: 0.05 },
    ]);
    h.io.type("\x1b");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("terminal"));
  });

  it("copy（prefix+[）：COPY の印、v と移動で選び、y で外側のクリップボード（OSC 52）へ書いて抜ける", async () => {
    const h = await start();
    const term = () => h.app.panes.get("p1")!;
    await vi.waitFor(() => expect(term()).toBeDefined());
    term().snapshot(35, 27, "copy me please");
    await term().flush();
    h.io.type("\x02[");
    await vi.waitFor(async () => expect(await h.screen()).toContain("COPY"));
    h.io.type("0"); // copy モードに無いキーは何もしない
    for (let i = 0; i < 6; i++) h.io.type("h");
    h.io.type("v");
    h.io.type("e");
    h.io.type("y");
    const b64 = Buffer.from("please", "utf8").toString("base64");
    await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;${b64}\x07`));
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("terminal"));
    expect(h.app.ui.toasts.map((t) => t.message)).toContain("コピーしました");
    // copy モードのキーは pane へ流れていない。
    expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toEqual([]);
  });

  it("goto（prefix+g）：木を出し、j で下の行へ・Enter でその pane へ移る", async () => {
    const h = await start();
    h.io.type("\x02g");
    await vi.waitFor(async () => expect(await h.screen()).toContain("goto"));
    // 行：w1, t1, p1（今）, p2, w2, t2, p3 → 今の p1 から j で p2
    h.io.type("j");
    h.io.type("\r");
    await vi.waitFor(() => expect(h.ws.requests("pane.focus")).toHaveLength(1));
    expect(h.app.model.focusedPaneId).toBe("p2");
    expect(h.app.ui.dialogContext).toBeNull();
  });

  it("goto：b/w/i/d で状態の絞り込み、/ で文字の絞り込み、Esc で閉じて元の pane のまま", async () => {
    const h = await start();
    h.io.type("\x02g");
    h.io.type("/");
    h.io.type("t2");
    const goto = () => h.app.overlays.overlay() as GotoDialog;
    expect(
      goto()
        .rows()
        .map((r) => r.label),
    ).toEqual(["w2", "t2"]);
    h.io.type("\x1b");
    await new Promise((r) => setTimeout(r, 40));
    h.io.type("a"); // 解除
    expect(goto().rows()).toHaveLength(7);
    h.io.type("w"); // 状態の絞り込み（working）：エージェントが居ないので空
    expect(goto().rows()).toEqual([]);
    h.io.type("\x1b");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
    expect(h.app.model.focusedPaneId).toBe("p1");
  });

  it("copy モードのまま別の pane へ移ると、元の pane の選択を消して末尾へ戻す（04 の点検）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, Array.from({ length: 80 }, (_, i) => `line${i}`).join("\r\n"));
    await t.flush();
    const bottom = t.term.buffer.active.viewportY;
    h.io.type("\x02[");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("copy"));
    h.io.type("v");
    for (let i = 0; i < 40; i++) h.io.type("k");
    expect(t.term.buffer.active.viewportY).toBeLessThan(bottom);
    h.io.type("\x02l"); // copy モードの中でも prefix は効く
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p2"));
    expect(t.term.buffer.active.viewportY).toBe(bottom);
    // 移った先の pane のカーソルは、前に copy モードで動かした古い位置でなく、その pane の今のカーソルから。
    const copyOf = (id: string) =>
      (
        h.app as unknown as { copyTargetOf(id: string): { cursor: { row: number; col: number } } }
      ).copyTargetOf(id);
    const t2 = h.app.panes.get("p2")!;
    expect(copyOf("p2").cursor).toEqual({
      row: t2.term.buffer.active.baseY + t2.term.buffer.active.cursorY,
      col: t2.term.buffer.active.cursorX,
    });
    // p2 で上へ動かしてから抜け、p2 に出力が増えた後に p1 の copy モードから p2 へ移る。
    for (let i = 0; i < 3; i++) h.io.type("k");
    h.io.type("q");
    await vi.waitFor(() => expect(h.app.keys.mode).not.toBe("copy"));
    t2.output(
      new TextEncoder().encode(Array.from({ length: 40 }, (_, i) => `more${i}`).join("\r\n")),
    );
    await t2.flush();
    h.io.type("\x02h");
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p1"));
    h.io.type("\x02[");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("copy"));
    h.io.type("\x02l");
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p2"));
    expect(copyOf("p2").cursor).toEqual({
      row: t2.term.buffer.active.baseY + t2.term.buffer.active.cursorY,
      col: t2.term.buffer.active.cursorX,
    });
  });
});
