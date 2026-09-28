import { decodeFrame, encodeSnapshotFrame } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { pane } from "../testing/fixtures.js";
import { popupCells } from "./CommandPopup.js";

/** 独自コマンド（05 の T6。design の対象範囲「独自コマンド」・AC5・AC8）。 */
describe("popup の大きさ（web の popupCells と同じ規則）", () => {
  it("省略は半分・% は割合・セル数・最小と使える広さの間", () => {
    expect(popupCells(undefined, undefined, { cols: 100, rows: 40 })).toEqual({
      cols: 50,
      rows: 20,
    });
    expect(popupCells("80%", 10, { cols: 100, rows: 40 })).toEqual({ cols: 80, rows: 10 });
    expect(popupCells(5, 1, { cols: 100, rows: 40 })).toEqual({ cols: 10, rows: 3 });
    expect(popupCells(500, 500, { cols: 60, rows: 20 })).toEqual({ cols: 60, rows: 20 });
  });
});

describe("独自コマンドを走らせる（web の ActionDispatcher.runCommand と同じ）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  const commands = {
    commands: [
      { id: "lint", type: "shell", description: "リント" },
      { id: "logs", type: "pane" },
      { id: "fzf", type: "popup", description: "探す", width: "80%", height: 10 },
    ],
    problem: null,
  };
  async function start(respond: Record<string, unknown> = {}) {
    const h = await startedApp({ respond: { "command.list": commands, ...respond } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.app.model.commands.commands).toHaveLength(3));
    const run = (commandId: string) =>
      (h.app as unknown as { dispatcher: { run(a: unknown): void } }).dispatcher.run({
        type: "runCommand",
        commandId,
      });
    const inputs = () =>
      h.ws.sent
        .filter((m): m is Uint8Array => m instanceof Uint8Array)
        .map((m) => decodeFrame(m) as { paneId: string; bytes: Uint8Array })
        .map((f) => [f.paneId, new TextDecoder().decode(f.bytes)]);
    return { ...h, run, inputs };
  }

  it("shell は走らせて知らせる。pane はできた pane へ移る。知らない id は何もしない", async () => {
    const h = await start({
      "command.run": (p: { commandId: string }) =>
        p.commandId === "logs" ? { type: "pane", pane: pane("p9", "t1") } : { type: "shell" },
    });
    h.run("lint");
    await vi.waitFor(() =>
      expect(h.app.ui.toasts.map((t) => t.message)).toContain("「リント」を走らせました。"),
    );
    expect(h.ws.requests("command.run")[0]!.params).toEqual({ commandId: "lint", paneId: "p1" });
    h.ws.event("pane.created", { pane: pane("p9", "t1") });
    h.run("logs");
    await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p9"));
    h.run("nothing");
    expect(h.ws.requests("command.run")).toHaveLength(2);
  });

  it("popup：浮いた端末を出し、全てのキー（Esc・prefix も）を popup へ送る。終了コードが 0 でなければ知らせて閉じる", async () => {
    const h = await start({ "command.run": { type: "popup", popupId: "pp1", cols: 40, rows: 8 } });
    h.run("fzf");
    expect(h.app.ui.dialogContext).toMatchObject({
      kind: "commandPopup",
      commandId: "fzf",
      title: "探す",
    });
    await vi.waitFor(() =>
      expect(
        h.ws
          .requests("pane.subscribe")
          .some((r) => (r.params as { paneId: string }).paneId === "pp1"),
      ).toBe(true),
    );
    const run = h.ws.requests("command.run")[0]!.params as { cols: number; rows: number };
    expect(run.rows).toBe(10);
    h.ws.onmessage?.({ data: encodeSnapshotFrame("pp1", 40, 8, "> query here") });
    await new Promise((r) => setTimeout(r, 20));
    h.app.renderNow();
    const text = await h.screen();
    expect(text).toContain("探す");
    expect(text).toContain("> query here");
    h.io.type("a");
    h.io.type("\x02");
    expect(h.inputs()).toEqual([
      ["pp1", "a"],
      ["pp1", "\x02"],
    ]);
    h.ws.event("command.popup_closed", { popupId: "pp1", exitCode: 2 });
    expect(h.app.ui.dialogContext).toBeNull();
    expect(h.app.ui.toasts.map((t) => t.message)).toContain(
      "「探す」が終了コード 2 で終わりました。",
    );
  });

  it("popup：開き終える前に閉じた知らせが来ても閉じる。見出しの × で止めて閉じる", async () => {
    let resolveRun: (v: unknown) => void = () => undefined;
    const h = await start({ "command.run": () => new Promise((r) => (resolveRun = r)) });
    h.run("fzf");
    await vi.waitFor(() => expect(h.ws.requests("command.run")).toHaveLength(1));
    h.app.renderNow();
    h.ws.event("command.popup_closed", { popupId: "pp2", exitCode: 0 });
    resolveRun({ type: "popup", popupId: "pp2", cols: 40, rows: 8 });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
    expect(h.app.ui.toasts.map((t) => t.message)).not.toContain("popup を開けませんでした。");
    // もう一度開いて × で閉じる。
    h.run("fzf");
    await vi.waitFor(() => expect(h.ws.requests("command.run")).toHaveLength(2));
    resolveRun({ type: "popup", popupId: "pp3", cols: 40, rows: 8 });
    await new Promise((r) => setTimeout(r, 20));
    h.app.renderNow();
    expect(await h.screen()).toContain("[×]");
    const btn = (h.app as unknown as { popup: { closeButton: { x: number; y: number } } }).popup
      .closeButton;
    h.io.type(`\x1b[<0;${btn.x + 2};${btn.y + 1}M\x1b[<0;${btn.x + 2};${btn.y + 1}m`);
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
    expect(h.ws.requests("command.popup_close").map((r) => r.params)).toEqual([{ popupId: "pp3" }]);
  });

  it("別のダイアログが popup を置き換えたら、popup のコマンドを止める（web の watch(ctx) と同じ）", async () => {
    const h = await start({ "command.run": { type: "popup", popupId: "pp4", cols: 40, rows: 8 } });
    h.run("fzf");
    await vi.waitFor(() =>
      expect(
        h.ws
          .requests("pane.subscribe")
          .some((r) => (r.params as { paneId: string }).paneId === "pp4"),
      ).toBe(true),
    );
    h.app.ui.openDialogWithContext({ kind: "help" });
    h.app.renderNow();
    expect(h.ws.requests("command.popup_close").map((r) => r.params)).toEqual([{ popupId: "pp4" }]);
    expect(h.app.ui.dialogContext).toEqual({ kind: "help" });
  });

  it("popup の中のプログラムがマウスを求めていれば渡し、代替画面のホイールは矢印キー", async () => {
    const h = await start({ "command.run": { type: "popup", popupId: "pp5", cols: 40, rows: 8 } });
    h.run("fzf");
    await vi.waitFor(() =>
      expect(
        h.ws
          .requests("pane.subscribe")
          .some((r) => (r.params as { paneId: string }).paneId === "pp5"),
      ).toBe(true),
    );
    h.ws.onmessage?.({ data: encodeSnapshotFrame("pp5", 40, 8, "\x1b[?1049hlist") });
    await new Promise((r) => setTimeout(r, 20));
    h.app.renderNow();
    const c = (h.app as unknown as { popup: { content: { x: number; y: number } } }).popup.content;
    h.io.type(`\x1b[<65;${c.x + 3};${c.y + 2}M`); // ホイール（マウスを求めていない代替画面）
    expect(h.inputs().at(-1)).toEqual(["pp5", "\x1b[B\x1b[B\x1b[B"]);
    h.ws.onmessage?.({
      data: encodeSnapshotFrame("pp5", 40, 8, "\x1b[?1049h\x1b[?1000;1006hlist"),
    });
    await new Promise((r) => setTimeout(r, 20));
    h.io.type(`\x1b[<0;${c.x + 3};${c.y + 2}M`);
    expect(h.inputs().at(-1)).toEqual(["pp5", "\x1b[<0;3;2M"]);
  });

  it("接続が切れたら閉じて知らせる（開き終える前でも。後から返事が来ても開かない）", async () => {
    let resolveRun: (v: unknown) => void = () => undefined;
    const h = await start({ "command.run": () => new Promise((r) => (resolveRun = r)) });
    h.run("fzf");
    await vi.waitFor(() => expect(h.ws.requests("command.run")).toHaveLength(1));
    (h.app as unknown as { onConnectionClosed(): void }).onConnectionClosed();
    expect(h.app.ui.dialogContext).toBeNull();
    expect(h.app.ui.toasts.map((t) => t.message)).toContain(
      "接続が切れたため popup を閉じました。",
    );
    resolveRun({ type: "popup", popupId: "pp6", cols: 40, rows: 8 });
    await vi.waitFor(() =>
      expect(h.ws.requests("command.popup_close").map((r) => r.params)).toEqual([
        { popupId: "pp6" },
      ]),
    );
    expect(
      h.ws
        .requests("pane.subscribe")
        .some((r) => (r.params as { paneId: string }).paneId === "pp6"),
    ).toBe(false);
  });
});
