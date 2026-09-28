import { afterEach, describe, expect, it, vi } from "vitest";
import type { MachineStatus } from "@sodashitsu/protocol";
import { Grid } from "../render/Screen.js";
import { KittyImages } from "../image/kittyOutput.js";
import { startedApp } from "../testing/appHarness.js";
import { leaf, pane, snapshot, tab, workspace } from "../testing/fixtures.js";

/** 05 review ラウンド 1 の差し戻し（キーだけで別のマシンへ・tmux の中の OSC 52・Kitty の画像の中身・C1）。 */
const box: MachineStatus = { id: "m1", label: "box", state: "online", message: null };

describe("05 review", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  async function withRemote() {
    const h = await startedApp({ respond: { "machine.list": { machines: [box] } } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.sockets.some((s) => s.url.includes("machine=m1"))).toBe(true));
    const summary = h.sockets.find((s) => s.url.includes("machine=m1"))!;
    summary.open();
    await vi.waitFor(() => expect(summary.requests("client.hello")).toHaveLength(1));
    summary.reply({
      clientId: "s1",
      snapshot: snapshot({
        workspaces: [workspace("rw1", ["rt1"], { label: "remote-ws" })],
        tabs: [tab("rt1", "rw1", leaf("rp1"))],
        panes: [pane("rp1", "rt1")],
        focus: null,
      }),
    });
    await vi.waitFor(() => expect(h.app.machines.summaries["m1"]?.connected).toBe(true));
    return h;
  }

  it("navigate モード：別のマシンの workspace もサイドバーの並びで選べ、Enter でそのマシンへ切り替える", async () => {
    const h = await withRemote();
    h.io.type("\x02w");
    await vi.waitFor(() => expect(h.app.keys.mode).toBe("navigate"));
    for (let i = 0; i < 2; i++) h.io.type("\x1b[B"); // （今の w1 から）w2 → remote-ws
    expect(h.app.ui.navigateSelection).toBe("machine:m1:rw1");
    h.app.renderNow();
    expect(await h.screen()).toContain("remote-ws");
    h.io.type("\r");
    await vi.waitFor(() => expect(h.app.machines.selectedId).toBe("m1"));
  });

  it("goto：別のマシンの workspace の行（@マシン名）を選ぶとそのマシンへ切り替える", async () => {
    const h = await withRemote();
    h.io.type("\x02g");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "goto" }));
    h.app.renderNow();
    expect(await h.screen()).toContain("@box");
    h.io.type("G\r");
    await vi.waitFor(() => expect(h.app.machines.selectedId).toBe("m1"));
  });

  it("tmux の中の OSC 52 は素通しの包みでも出し、設定の案内を 1 回だけ出す", async () => {
    const h = await startedApp({ env: { TMUX: "/tmp/tmux-1/default,1,0" } });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    const w = (
      h.app as unknown as { writeClipboard(t: string): Promise<boolean> }
    ).writeClipboard.bind(h.app);
    await w("hi");
    await w("again");
    const b64 = Buffer.from("hi").toString("base64");
    expect(h.io.output()).toContain(`\x1b]52;c;${b64}\x07`);
    expect(h.io.output()).toContain(`\x1bPtmux;\x1b\x1b]52;c;${b64}\x07\x1b\\`);
    expect(h.app.ui.toasts.filter((t) => t.message.includes("set-clipboard"))).toHaveLength(1);
  });

  it("Kitty：置かないとき（ダイアログの間）も、pane が持つ画像の中身は消さない（送り直さない）", () => {
    const k = new KittyImages();
    const a = { imageKey: "h1", base64: "QUJD", x: 1, y: 1, cols: 2, rows: 1 };
    k.sync([a]);
    const hidden = k.sync([], new Set(["h1"]));
    expect(hidden).toContain("a=d,d=a");
    expect(hidden).not.toContain("d=I");
    expect(k.sync([a], new Set(["h1"]))).not.toContain("a=t");
  });

  it("chrome の文字列から C1（U+0080〜009F）と DEL を落とす", () => {
    const g = new Grid(20, 1);
    g.text(0, 0, "a\u009b31mb\u007fc\u0085d", 0, 0);
    expect(g.rowText(0).trimEnd()).toBe("a31mbcd");
  });
});
