import { decodeFrame } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeIo } from "../testing/fakeIo.js";
import { FakeSocket } from "../testing/fakeSocket.js";
import { snapshot } from "../testing/fixtures.js";
import { OuterTerminal } from "../testing/outerTerminal.js";
import type { TuiTarget } from "../types.js";
import { TuiApp } from "./TuiApp.js";

const target: TuiTarget = {
  baseUrl: "http://127.0.0.1:9",
  origin: "http://127.0.0.1:9",
  login: async () => "sid=1",
  stateDir: "/nonexistent-state-dir",
  session: "work",
};

async function started(cols = 100, rows = 30) {
  const io = fakeIo({ cols, rows });
  const sockets: FakeSocket[] = [];
  const app = new TuiApp(target, io, {
    net: {
      createWebSocket: (ep) => (url) => {
        const s = new FakeSocket(url, ep.cookie());
        sockets.push(s);
        return s;
      },
      fetchImpl: () => async () => new Response(null, { status: 204 }),
    },
  });
  const running = app.run();
  await vi.waitFor(() => expect(sockets).toHaveLength(1));
  const ws = sockets[0]!;
  ws.open();
  ws.reply({ clientId: "c1", snapshot: snapshot() });
  return { io, app, ws, running };
}

describe("TuiApp：大きさの申告と描画の予約（AC2・AC11）", () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    for (const fn of cleanup.splice(0)) fn();
  });

  it("自分の割り付けの pane の中身の大きさを client.view で申告し、端末の大きさが変わったら申告し直す", async () => {
    const { io, app, ws, running } = await started();
    const views = () => ws.requests("client.view").map((r) => r.params);
    await vi.waitFor(() => expect(views()).toHaveLength(1));
    // サイドバー 26 桁・tab バー 1 行・左右に半分ずつ（74 桁 → 37 + 37）・枠の罫線 1 桁/1 行。
    expect(views()[0]).toEqual({
      workspaceId: "w1",
      tabId: "t1",
      visible: [
        { paneId: "p1", cols: 35, rows: 27 },
        { paneId: "p2", cols: 35, rows: 27 },
      ],
    });
    expect(
      ws.requests("pane.subscribe").map((r) => (r.params as { paneId: string }).paneId),
    ).toEqual(["p1", "p2"]);
    io.resizeTo(120, 40);
    await vi.waitFor(() => expect(views()).toHaveLength(2));
    expect(views()[1]).toMatchObject({
      visible: [
        { paneId: "p1", cols: 45, rows: 37 },
        { paneId: "p2", cols: 45, rows: 37 },
      ],
    });
    app.finish(0);
    expect(await running).toBe(0);
  });

  it("描画は変化をまとめて最短 16ms 間隔。画面にサイドバーの workspace と tab バーが出る", async () => {
    const { io, app, running } = await started(80, 20);
    const outer = new OuterTerminal(80, 20);
    cleanup.push(() => outer.dispose());
    await vi.waitFor(async () => {
      await outer.write(io.output());
      expect(outer.text()).toContain("w2");
    });
    expect(outer.line(1)).toContain("w1");
    expect(outer.line(0)).toContain("1:t1");
    // 同じ tick の多数の変化は 1 回の描画にまとまる。
    const before = io.output().split("\x1b[?2026h").length;
    for (let i = 0; i < 50; i++) app.scheduleRender();
    await new Promise((r) => setTimeout(r, 40));
    const after = io.output().split("\x1b[?2026h").length;
    expect(after - before).toBe(1);
    app.finish(0);
    await running;
  });

  it("prefs.changed の tui.sidebarCols で割り付けし直す", async () => {
    const { ws, app, running } = await started();
    const views = () =>
      ws.requests("client.view").map((r) => r.params as { visible: { cols: number }[] });
    await vi.waitFor(() => expect(views()).toHaveLength(1));
    ws.event("prefs.changed", { prefs: { tui: { sidebarCols: 40 } }, rev: 5, byClientId: "x" });
    await vi.waitFor(() => expect(views()).toHaveLength(2));
    expect(views()[1]!.visible[0]!.cols).toBe(28); // (100-40)/2 = 30 − 罫線 2
    app.finish(0);
    await running;
  });

  it("prefix+b（toggle_sidebar）でサイドバーを畳み、申告し直す", async () => {
    const { io, ws, app, running } = await started();
    const views = () =>
      ws.requests("client.view").map((r) => r.params as { visible: { cols: number }[] });
    await vi.waitFor(() => expect(views()).toHaveLength(1));
    io.type("\x02b");
    await vi.waitFor(() => expect(views()).toHaveLength(2));
    expect(views()[1]!.visible[0]!.cols).toBe(48); // 100/2 − 罫線 2
    app.finish(0);
    await running;
  });

  it("ESC 単独は 25ms 待って焦点の pane へ送る（INPUT フレーム）", async () => {
    const { io, ws, app, running } = await started();
    await vi.waitFor(() => expect(ws.requests("client.view")).toHaveLength(1));
    const inputs = () => ws.sent.filter((m): m is Uint8Array => m instanceof Uint8Array);
    io.type("\x1b");
    expect(inputs()).toHaveLength(0);
    await vi.waitFor(() => expect(inputs()).toHaveLength(1));
    const frame = decodeFrame(inputs()[0]!);
    expect(frame).toMatchObject({ paneId: "p1" });
    expect(new TextDecoder().decode((frame as { bytes: Uint8Array }).bytes)).toBe("\x1b");
    app.finish(0);
    await running;
  });

  it("確定の待ちは decoder.waitMs：ESC 単独は 25ms、途中まで届いた CSI は 150ms 待ってから送る（偽の時計）", async () => {
    const { io, ws, app, running } = await started();
    await vi.waitFor(() => expect(ws.requests("client.view")).toHaveLength(1));
    const sent = () =>
      ws.sent
        .filter((m): m is Uint8Array => m instanceof Uint8Array)
        .map((m) => new TextDecoder().decode((decodeFrame(m) as { bytes: Uint8Array }).bytes))
        .join("");
    vi.useFakeTimers();
    try {
      io.type("\x1b");
      vi.advanceTimersByTime(24);
      expect(sent()).toBe("");
      vi.advanceTimersByTime(2);
      expect(sent()).toBe("\x1b");
      io.type("\x1b[1;5");
      vi.advanceTimersByTime(100);
      expect(sent()).toBe("\x1b"); // まだ待っている（25ms では確定しない）
      io.type("A"); // 続きが届けば 1 つのキー（Ctrl+↑）
      expect(sent()).toBe("\x1b\x1b[1;5A");
      io.type("\x1b[1;");
      vi.advanceTimersByTime(151);
      expect(sent()).toBe("\x1b\x1b[1;5A\x1b[1;"); // 時間切れで Esc と残りの文字
    } finally {
      vi.useRealTimers();
    }
    app.finish(0);
    await running;
  });

  it("接続が開いていない間の打鍵は捨て、tab バーに「未接続のため入力を送れません」と知らせる", async () => {
    const { io, ws, app, running } = await started(100, 30);
    await vi.waitFor(() => expect(ws.requests("client.view")).toHaveLength(1));
    ws.close(1006);
    await vi.waitFor(() => expect(app.connectionState).toBe("reconnecting"));
    const before = ws.sent.length;
    io.type("x");
    expect(ws.sent.length).toBe(before);
    const outer = new OuterTerminal(100, 30);
    cleanup.push(() => outer.dispose());
    await vi.waitFor(async () => {
      await outer.write(io.output());
      expect(outer.line(0)).toContain("未接続のため入力を送れません");
    });
    app.finish(0);
    await running;
  });

  it("ダイアログを開いている間のキーは pane へ流さず、確定で RPC（prefix+shift+p で pane の名前の変更。AC-I5）", async () => {
    const { io, ws, app, running } = await started();
    await vi.waitFor(() => expect(ws.requests("client.view")).toHaveLength(1));
    const inputs = () => ws.sent.filter((m) => m instanceof Uint8Array).length;
    io.type("\x02P");
    await vi.waitFor(() => expect(app.ui.dialogContext?.kind).toBe("renamePane"));
    io.type("abc\r");
    await vi.waitFor(() => expect(ws.requests("pane.rename")).toHaveLength(1));
    expect(ws.requests("pane.rename")[0]!.params).toEqual({ paneId: "p1", label: "abc" });
    expect(inputs()).toBe(0);
    io.type("x");
    await vi.waitFor(() => expect(inputs()).toBe(1));
    app.finish(0);
    await running;
  });
});
