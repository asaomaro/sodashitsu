import { decodeFrame } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";
import { leaf, pane, snapshot, tab, workspace } from "../testing/fixtures.js";
import { encodeMouse, trackingAccepts } from "./mouseEncode.js";
import { wordBounds, zoneAt } from "./mouse.js";

const NO = { shift: false, alt: false, ctrl: false, meta: false };
/** SGR の押下・離す・移動・ホイール（外側の端末の 0 始まりの桁・行）。 */
const down = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}M`;
const up = (x: number, y: number, b = 0) => `\x1b[<${b};${x + 1};${y + 1}m`;
const drag = (x: number, y: number) => `\x1b[<32;${x + 1};${y + 1}M`;
const wheelDown = (x: number, y: number) => `\x1b[<65;${x + 1};${y + 1}M`;

describe("マウスの符号化（herdr の encode_mouse_cb）", () => {
  it("SGR・既定・URXVT・UTF-8。修飾・離す・ドラッグ・ホイール", () => {
    expect(
      encodeMouse({ action: "down", button: 0, col: 3, row: 4, mods: NO }, "sgr", "vt200"),
    ).toBe("\x1b[<0;4;5M");
    expect(encodeMouse({ action: "up", button: 0, col: 3, row: 4, mods: NO }, "sgr", "vt200")).toBe(
      "\x1b[<0;4;5m",
    );
    expect(
      encodeMouse({ action: "move", button: 0, col: 0, row: 0, mods: NO }, "sgr", "drag"),
    ).toBe("\x1b[<32;1;1M");
    expect(
      encodeMouse(
        { action: "wheel", button: 65, col: 0, row: 0, mods: { ...NO, ctrl: true } },
        "sgr",
        "vt200",
      ),
    ).toBe("\x1b[<81;1;1M");
    expect(
      encodeMouse({ action: "up", button: 2, col: 0, row: 0, mods: NO }, "default", "vt200"),
    ).toEqual(Uint8Array.from([0x1b, 0x5b, 0x4d, 35, 33, 33]));
    expect(
      encodeMouse({ action: "down", button: 0, col: 300, row: 0, mods: NO }, "default", "vt200"),
    ).toBeNull();
    expect(
      encodeMouse(
        { action: "down", button: 1, col: 0, row: 0, mods: { ...NO, shift: true } },
        "urxvt",
        "vt200",
      ),
    ).toBe("\x1b[37;1;1M");
    expect(
      encodeMouse({ action: "down", button: 0, col: 200, row: 0, mods: NO }, "utf8", "vt200"),
    ).toBe(`\x1b[M ${String.fromCodePoint(233)}!`);
  });

  it("pane のモードで送る事象を絞る（x10 は押下だけ・vt200 は移動なし・drag はボタンを押したままの移動・any は全部）", () => {
    const ev = (action: "down" | "up" | "move", button = 0) => ({
      action,
      button,
      col: 0,
      row: 0,
      mods: NO,
    });
    expect(trackingAccepts("x10", ev("up"))).toBe(false);
    expect(trackingAccepts("vt200", ev("move"))).toBe(false);
    expect(trackingAccepts("drag", ev("move"))).toBe(true);
    expect(trackingAccepts("drag", ev("move", -1))).toBe(false);
    expect(trackingAccepts("any", ev("move", -1))).toBe(true);
    expect(trackingAccepts("none", ev("down"))).toBe(false);
  });

  it("落とし先のゾーン（左右を先に）と単語の範囲", () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(zoneAt(r, 0, 5)).toBe("left");
    expect(zoneAt(r, 9, 0)).toBe("right");
    expect(zoneAt(r, 5, 0)).toBe("top");
    expect(zoneAt(r, 5, 9)).toBe("bottom");
    expect(zoneAt(r, 5, 5)).toBe("center");
    expect(wordBounds("cd /tmp/foo-bar; ls", 6)).toEqual([3, 14]);
    expect(wordBounds("a  b", 1)).toEqual([1, 1]);
  });
});

/**
 * 100×30・サイドバー 26（右端の境界は 25）・tab バーは 0 行目・p1 の枠は 26〜62（中身 27〜61・2〜28 行）・p2 の枠は 63〜99。
 * サイドバー：0 行目 Spaces（「＋」は 23）・1 行目 w1・2 行目 w2。
 */
describe("マウスの操作（AC9・AC-I5）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  async function start(opts?: Parameters<typeof startedApp>[0]) {
    const h = await startedApp(opts);
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    await h.screen();
    h.app.renderNow();
    const inputs = () =>
      h.ws.sent
        .filter((m): m is Uint8Array => m instanceof Uint8Array)
        .map((m) => new TextDecoder().decode((decodeFrame(m) as { bytes: Uint8Array }).bytes));
    return { ...h, inputs };
  }

  it("pane の中身をクリックで焦点（M1）。サイドバーの行で workspace へ、「＋」で新しい workspace", async () => {
    const h = await start();
    h.io.type(down(70, 10) + up(70, 10));
    expect(h.app.model.focusedPaneId).toBe("p2");
    expect(h.ws.requests("pane.focus").map((r) => r.params)).toEqual([{ paneId: "p2" }]);
    h.io.type(down(5, 2) + up(5, 2));
    expect(h.app.model.workspaceId).toBe("w2");
    expect(h.ws.requests("workspace.focus").map((r) => r.params)).toEqual([{ workspaceId: "w2" }]);
    h.io.type(down(23, 0) + up(23, 0));
    expect(h.ws.requests("workspace.create")).toHaveLength(1);
  });

  it("右クリックでメニュー（tab・workspace・pane・何も無い所は全体）（M3）", async () => {
    const h = await start();
    h.io.type(down(28, 0, 2));
    expect(h.app.ui.contextMenu?.target).toEqual({ kind: "tab", tabId: "t1" });
    h.app.ui.closeContextMenu();
    h.io.type(down(5, 1, 2));
    expect(h.app.ui.contextMenu?.target).toEqual({ kind: "workspace", workspaceId: "w1" });
    h.app.ui.closeContextMenu();
    h.io.type(down(40, 10, 2));
    expect(h.app.ui.contextMenu?.target).toEqual({ kind: "pane", paneId: "p1" });
    h.app.ui.closeContextMenu();
    h.io.type(down(5, 20, 2));
    expect(h.app.ui.contextMenu?.target).toEqual({ kind: "global" });
  });

  it("分割の境界のドラッグで比率（M2）。サイドバーの右端のドラッグで幅（M13）", async () => {
    const h = await start();
    h.io.type(down(63, 10) + drag(50, 10) + up(50, 10));
    const ratios = h.ws
      .requests("layout.set_split_ratio")
      .map((r) => r.params as { ratio: number; tabId: string; splitId: string });
    expect(ratios.at(-1)).toEqual({ tabId: "t1", splitId: "s1", ratio: (50 - 26) / 74 });
    h.io.type(down(25, 10) + drag(30, 10) + up(30, 10));
    expect(h.app.prefs.sidebarCols).toBe(31);
  });

  it("pane がマウスを求めていれば pane ローカルの座標で送り（M11）、Shift を押していれば端末版が扱う", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.output(new TextEncoder().encode("\x1b[?1002;1006h"));
    await t.flush();
    h.io.type(down(30, 5) + drag(31, 5) + up(31, 5));
    expect(h.inputs()).toEqual(["\x1b[<0;4;4M", "\x1b[<32;5;4M", "\x1b[<0;5;4m"]);
    h.io.type(wheelDown(30, 5));
    expect(h.inputs().at(-1)).toBe("\x1b[<65;4;4M");
    const n = h.inputs().length;
    h.io.type("\x1b[<4;31;6M\x1b[<4;31;6m"); // Shift＋押下
    expect(h.inputs()).toHaveLength(n);
  });

  it("マウスを求めていない pane：ドラッグで選んで離すとコピー（M4）、ダブルクリックで単語（M5）、ホイールでスクロールバック（M8）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "hello world foo");
    await t.flush();
    h.io.type(down(27, 2) + drag(31, 2) + up(31, 2));
    const b64 = (s: string) => Buffer.from(s).toString("base64");
    await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;${b64("hello")}\x07`));
    h.io.type(down(34, 2) + up(34, 2) + down(34, 2) + up(34, 2));
    await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;${b64("world")}\x07`));
    t.output(new TextEncoder().encode("\r\n".repeat(60)));
    await t.flush();
    const bottom = t.term.buffer.active.viewportY;
    h.io.type(`\x1b[<64;31;11M`);
    expect(t.term.buffer.active.viewportY).toBe(bottom - 3);
    expect(h.inputs()).toEqual([]);
  });

  it("pane の名前のドラッグ：縁で分割、中央で置き換え、サイドバーの workspace へ移す（W01〜W03）。動かさずに離せば焦点", async () => {
    const h = await start();
    h.io.type(down(70, 1) + drag(28, 15) + up(28, 15));
    expect(h.ws.requests("pane.move_to_edge").map((r) => r.params)).toEqual([
      { paneId: "p2", targetPaneId: "p1", edge: "left" },
    ]);
    h.io.type(down(70, 1) + drag(44, 15) + up(44, 15));
    expect(h.ws.requests("pane.replace").map((r) => r.params)).toEqual([
      { paneId: "p2", targetPaneId: "p1" },
    ]);
    h.io.type(down(70, 1) + drag(5, 2) + up(5, 2));
    expect(h.ws.requests("pane.move_to_new_tab").map((r) => r.params)).toEqual([
      { paneId: "p2", targetWorkspaceId: "w2" },
    ]);
    h.io.type(down(70, 1) + up(70, 1));
    expect(h.app.model.focusedPaneId).toBe("p2");
  });

  it("tab のクリックで移り、ドラッグで並べ替え（M12）、「＋」で新しい tab（M14）", async () => {
    const snap = snapshot({
      workspaces: [workspace("w1", ["t1", "t2", "t3"])],
      tabs: [tab("t1", "w1", leaf("p1")), tab("t2", "w1", leaf("p2")), tab("t3", "w1", leaf("p3"))],
      panes: [pane("p1", "t1"), pane("p2", "t2"), pane("p3", "t3")],
    });
    const h = await start({ snapshot: snap });
    const hits = () => (h.app as unknown as { tabHits: { tabId: string; x: number }[] }).tabHits;
    const x = (id: string) => hits().find((t) => t.tabId === id)!.x + 1;
    h.io.type(down(x("t2"), 0) + up(x("t2"), 0));
    expect(h.app.model.tabId).toBe("t2");
    h.app.renderNow();
    h.io.type(down(x("t1"), 0) + drag(x("t3"), 0) + up(x("t3"), 0));
    expect(h.ws.requests("tab.move").map((r) => r.params)).toEqual([
      { tabId: "t1", direction: "next" },
      { tabId: "t1", direction: "next" },
    ]);
    const plus = (h.app as unknown as { newTabButton: { x: number } }).newTabButton;
    h.io.type(down(plus.x + 1, 0) + up(plus.x + 1, 0));
    expect(h.app.ui.dialogContext).toEqual({ kind: "newTab", workspaceId: "w1" });
  });

  it("サイドバーの workspace の行のドラッグで並べ替え", async () => {
    const h = await start();
    h.io.type(down(5, 2) + drag(5, 1) + up(5, 1));
    expect(h.ws.requests("workspace.move_to").map((r) => r.params)).toEqual([
      { workspaceIds: ["w2"], beforeWorkspaceId: "w1" },
    ]);
  });

  it("オーバーレイの間のマウスは pane へ流さない（AC-I5）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.output(new TextEncoder().encode("\x1b[?1000;1006h"));
    await t.flush();
    h.app.ui.openDialogWithContext({ kind: "help" });
    h.io.type(down(30, 5) + up(30, 5));
    expect(h.inputs()).toEqual([]);
  });

  it("上下の分割：下の pane の上辺（名前の行）は名前のドラッグ・焦点で、境界は上の pane の下辺（04 の点検）", async () => {
    const snap = snapshot({
      tabs: [
        tab("t1", "w1", {
          type: "split",
          id: "s1",
          dir: "down",
          ratio: 0.5,
          a: leaf("p1"),
          b: leaf("p2"),
        }),
        tab("t2", "w2", leaf("p3")),
      ],
    });
    const h = await start({ snapshot: snap });
    const lower = (
      h.app as unknown as { lastLayout: { panes: { paneId: string; frame: { y: number } }[] } }
    ).lastLayout.panes.find((b) => b.paneId === "p2")!;
    h.io.type(down(70, lower.frame.y) + up(70, lower.frame.y));
    expect(h.app.model.focusedPaneId).toBe("p2");
    expect(h.ws.requests("layout.set_split_ratio")).toEqual([]);
    h.io.type(down(70, lower.frame.y - 1) + drag(70, 10) + up(70, 10));
    expect(h.ws.requests("layout.set_split_ratio").length).toBeGreaterThan(0);
  });

  it("離す事象を取りこぼしたドラッグは次の押下・外側の端末を離れたときに捨てる（04 の点検）", async () => {
    const h = await start();
    h.io.type(down(63, 10) + drag(50, 10)); // 離さない
    const n = h.ws.requests("layout.set_split_ratio").length;
    h.io.type(down(70, 10) + up(70, 10));
    expect(h.app.model.focusedPaneId).toBe("p2");
    expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(n);
    h.io.type(down(63, 10) + "\x1b[O" + drag(40, 10));
    expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(n);
    // オーバーレイを開いたら途中のドラッグを捨てる（閉じた後の動きで境界が動かない）。
    h.io.type(down(63, 10));
    h.app.ui.openDialogWithContext({ kind: "help" });
    h.app.ui.closeDialog();
    h.io.type(drag(40, 10) + up(40, 10));
    expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(n);
  });

  it("代替画面でマウスを求めていない pane のホイールは矢印キー（04 の点検）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.output(new TextEncoder().encode("\x1b[?1049h"));
    await t.flush();
    h.io.type(wheelDown(30, 5) + `\x1b[<64;31;6M`);
    expect(h.inputs()).toEqual(["\x1b[B\x1b[B\x1b[B", "\x1b[A\x1b[A\x1b[A"]);
    // アプリケーションのカーソルキー（DECCKM）なら SS3 の形で送る。
    t.output(new TextEncoder().encode("\x1b[?1h"));
    await t.flush();
    h.io.type(wheelDown(30, 5));
    expect(h.inputs().at(-1)).toBe("\x1bOB\x1bOB\x1bOB");
  });

  it("pane の実際の大きさより外（切り取りの余白）の座標は端に寄せて送る（04 の点検）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(10, 5, "");
    t.output(new TextEncoder().encode("\x1b[?1000;1006h"));
    await t.flush();
    h.io.type(down(50, 20) + up(50, 20));
    expect(h.inputs()).toEqual(["\x1b[<0;10;5M", "\x1b[<0;10;5m"]);
  });

  it("全部の動きを求める pane（?1003）があれば外側の端末にも ?1003 を出し、ボタンを押していない動きを送る（04 の点検）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.output(new TextEncoder().encode("\x1b[?1003;1006h"));
    await t.flush();
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1b[?1003h");
    h.io.type("\x1b[<35;31;6M");
    expect(h.inputs()).toEqual(["\x1b[<35;4;4M"]);
    t.output(new TextEncoder().encode("\x1b[?1003l"));
    await t.flush();
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1b[?1003l");
  });

  it("Ctrl＋クリックで URL を開く（M6）", async () => {
    const opened: string[] = [];
    const h = await start({ openUrl: (u) => opened.push(u) });
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "see https://example.com/a?b=1. ok");
    await t.flush();
    h.io.type("\x1b[<16;35;3M\x1b[<16;35;3m"); // Ctrl＋左（桁 34 は URL の中）
    expect(opened).toEqual(["https://example.com/a?b=1"]);
  });

  it("サイドバーの spaces と agents の区切りのドラッグで区画の高さ（H19b・04 の点検）", async () => {
    const snap = snapshot({
      panes: [
        pane("p1", "t1"),
        pane("p2", "t1"),
        pane("p3", "t2", {
          agent: {
            instanceId: "a",
            kind: "claude",
            label: "Claude",
            state: "idle",
            completionSeq: 0,
            serverSeenSeq: 0,
            verified: true,
            since: 0,
          },
        }),
      ],
    });
    const h = await start({ snapshot: snap });
    h.app.renderNow();
    const hits = (h.app as unknown as { sidebarHits: { kind: string; y: number }[] }).sidebarHits;
    const div = hits.find((x) => x.kind === "sectionDivider")!;
    h.io.type(down(3, div.y) + drag(3, div.y + 5) + up(3, div.y + 5));
    expect(h.app.prefs.sidebarSpacesRows).toBe(div.y + 5);
    // 描き直すと区切りがその位置へ動く（上の区画が 5 行広がる）。
    h.app.renderNow();
    const after = (h.app as unknown as { sidebarHits: { kind: string; y: number }[] }).sidebarHits;
    expect(after.find((x) => x.kind === "sectionDivider")!.y).toBe(div.y + 5);
  });

  it("全角の行でもダブルクリックの単語と選択の写しがセルの列で合う（04 の点検）", async () => {
    const h = await start();
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "あいう foo-bar/baz end");
    await t.flush();
    // 「あいう 」は 7 セル → foo は桁 7〜。中身の x=27 から。
    h.io.type(down(27 + 9, 2) + up(27 + 9, 2) + down(27 + 9, 2) + up(27 + 9, 2));
    const b64 = (s: string) => Buffer.from(s).toString("base64");
    await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;${b64("foo-bar/baz")}\x07`));
    // 「い」（桁 2・3）から「う」の右半分（桁 5）まで：全角の組ごと写す。
    h.io.type(down(27 + 2, 2) + drag(27 + 5, 2) + up(27 + 5, 2));
    await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;${b64("いう")}\x07`));
    // 終わりが全角の本体（「う」の桁 4）なら、選択の範囲は右半分（桁 5）まで含める（反転の表示が文字の半分で切れない）。
    h.io.type(down(27 + 0, 2) + drag(27 + 4, 2));
    const top = t.term.buffer.active.viewportY;
    expect(h.app.mouse.selection).toMatchObject({
      from: { row: top, col: 0 },
      to: { row: top, col: 5 },
    });
    h.io.type(up(27 + 4, 2));
  });
});
