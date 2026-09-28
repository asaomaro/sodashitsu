import { afterEach, describe, expect, it } from "vitest";
import { computeLayout } from "../layout/computeLayout.js";
import { PrefsModel } from "../model/PrefsModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { PaneRegistry } from "../term/PaneRegistry.js";
import { agent, leaf, pane, snapshot, split, tab, workspace } from "../testing/fixtures.js";
import { OuterTerminal } from "../testing/outerTerminal.js";
import type { ChromeContext } from "./chrome/context.js";
import { colorModeOf, hexColor, rgbTo256, ThemeColors } from "./color.js";
import { Renderer } from "./Renderer.js";
import { stringWidth, truncate } from "./width.js";

const W = 80;
const H = 20;

describe("Renderer（pane の中身と最小限の chrome。AC2・AC6・AC10）", () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    for (const fn of cleanup.splice(0)) fn();
  });

  async function setup(snap = snapshot()) {
    const model = new SessionModel();
    model.applySnapshot(snap, "c1");
    const prefs = new PrefsModel();
    const panes = new PaneRegistry(
      { request: (() => Promise.resolve({})) as never },
      () => 100,
      () => undefined,
    );
    cleanup.push(() => panes.dispose());
    const outer = new OuterTerminal(W, H);
    cleanup.push(() => outer.dispose());
    const renderer = new Renderer("truecolor", false);
    const layout = () =>
      computeLayout({
        cols: W,
        rows: H,
        sidebarVisible: true,
        sidebarCols: 20,
        narrowThreshold: 64,
        tab: model.currentTab() ? { layout: model.currentTab()!.layout, zoomedPaneId: null } : null,
        focusedPaneId: model.focusedPaneId,
      });
    const ctx = (): ChromeContext => ({
      model,
      prefs,
      theme: new ThemeColors("dracula"),
      mode: "terminal",
      connection: "open",
      notice: null,
      session: "work",
    });
    const commit = () => {
      const l = layout();
      panes.commit(
        {
          workspaceId: model.workspaceId!,
          tabId: model.tabId!,
          visible: l.panes.map((b) => ({ paneId: b.paneId, cols: b.content.w, rows: b.content.h })),
        },
        (id) => {
          const b = l.panes.find((x) => x.paneId === id)!;
          return { cols: b.content.w, rows: b.content.h };
        },
      );
    };
    const draw = async (mode: ChromeContext["mode"] = "terminal") => {
      const r = renderer.render(layout(), { ...ctx(), mode }, panes);
      await outer.write(r.output);
      return r;
    };
    return { model, prefs, panes, outer, draw, commit, layout, renderer };
  }

  it("サイドバーに workspace とエージェント、tab バーに tab、枠に pane の名前、中身に pane の出力", async () => {
    const snap = snapshot({
      workspaces: [
        workspace("w1", ["t1"], { label: "alpha" }),
        workspace("w2", ["t2"], { label: "beta" }),
      ],
      panes: [
        pane("p1", "t1", { label: "shell-1" }),
        pane("p2", "t1"),
        pane("p3", "t2", { agent: agent({ state: "working", label: "Claude" }) }),
      ],
    });
    const { outer, draw, commit, panes, layout } = await setup(snap);
    commit();
    const p1 = panes.get("p1")!;
    p1.snapshot(28, 17, "hello from p1\r\n日本語 ok");
    await p1.flush();
    const r = await draw();
    const text = outer.text();
    expect(text).toContain("Spaces");
    expect(outer.line(1)).toContain("alpha");
    expect(outer.line(2)).toContain("beta");
    expect(text).toContain("Agents");
    // agents は web と同じ既定の行の並び（1 行目：印・workspace・tab、2 行目：名前・エージェント・未検証）。
    const lines = text.split("\n");
    const agents = lines.findIndex((l) => l.includes("Agents"));
    const sidebarOf = (l: string) => l.slice(0, l.indexOf("│")).trimEnd();
    expect(sidebarOf(lines[agents + 1]!)).toBe(" ◐ beta t2");
    expect(sidebarOf(lines[agents + 2]!)).toBe("   Claude");
    expect(outer.line(0)).toContain("1:t1");
    expect(outer.line(0)).toContain("session: work");
    expect(outer.line(1)).toContain("shell-1");
    expect(outer.line(2)).toContain("hello from p1");
    expect(outer.line(3)).toContain("日本語 ok");
    // 何も無い行（"area"。ホイールでその区画を動かす）を除いた当たり。並び順と「«」（M14）のボタンもある。
    expect(
      r.sidebarHits
        .filter((h) => h.kind !== "area")
        .map((h) => (h.kind === "sort" ? `sort:${h.section}` : h.kind)),
    ).toEqual([
      "newWorkspace",
      "sort:spaces",
      "workspace",
      "workspace",
      "sectionDivider", // 狭いサイドバーでは agents の並び順のボタンは出さない（見出しと重なる）
      "agent", // エージェントの項目は 2 行（既定の行の並び）
      "agent",
      "collapse",
    ]);
    expect(outer.line(0)).toContain("開いた順");
    expect(r.tabHits.map((h) => h.tabId)).toEqual(["t1"]);
    // 本物のカーソルは焦点の pane（p1）のカーソルの位置（中身の左上 + カーソル）。
    const p1Box = layout().panes.find((b) => b.paneId === "p1")!.content;
    expect(outer.cursor).toEqual({ x: p1Box.x + stringWidth("日本語 ok"), y: p1Box.y + 1 });
  });

  it("prefix 待ちは tab バーの左端に PREFIX", async () => {
    const { outer, draw, commit } = await setup();
    commit();
    await draw("prefix");
    expect(outer.line(0)).toMatch(/^\s*\S.*PREFIX/);
  });

  it("pane の大きさが割り付けより大きければ左上を合わせて切り取り、枠の右下に ⋯", async () => {
    const snap = snapshot({
      tabs: [tab("t1", "w1", leaf("p1")), tab("t2", "w2", leaf("p3"))],
      panes: [pane("p1", "t1"), pane("p3", "t2")],
    });
    const { outer, draw, commit, panes, layout } = await setup(snap);
    commit();
    const p1 = panes.get("p1")!;
    const content = layout().panes[0]!.content;
    const long = "X".repeat(content.w) + "TAIL";
    p1.snapshot(content.w + 10, content.h + 5, `${long}\r\nsecond`);
    await p1.flush();
    await draw();
    const row = outer.line(content.y);
    expect(row).toContain("X".repeat(content.w));
    expect(row).not.toContain("TAIL");
    expect(outer.line(content.y + content.h)).toMatch(/⋯$/);
  });

  it("中身が変わっていない pane は前の格子を写し、変わった pane だけ読み直す", async () => {
    const { outer, draw, commit, panes, model, renderer } = await setup();
    commit();
    for (const id of ["p1", "p2"]) {
      const t = panes.get(id)!;
      t.snapshot(28, 17, `content-${id}`);
      await t.flush();
    }
    await draw();
    model.focusPane("p1");
    // p2 の headless を書き換えても dirty を下ろしておけば読み直さない（前の格子のまま）。
    const p2 = panes.get("p2")!;
    p2.output(new TextEncoder().encode("\r\nNEW"));
    await p2.flush();
    p2.dirty = false;
    await draw();
    expect(outer.text()).not.toContain("NEW");
    // 色の出し方が変わらない setColorMode は、写しの手がかりを捨てない（全部を読み直さない）。
    renderer.setColorMode("truecolor");
    await draw();
    expect(outer.text()).not.toContain("NEW");
    p2.dirty = true;
    await draw();
    expect(outer.text()).toContain("NEW");
  });

  it("小さすぎる端末では知らせだけ", async () => {
    const { panes } = await setup();
    const renderer = new Renderer("truecolor", false);
    const model = new SessionModel();
    const outer = new OuterTerminal(19, 4);
    cleanup.push(() => outer.dispose());
    const layout = computeLayout({
      cols: 19,
      rows: 4,
      sidebarVisible: true,
      sidebarCols: 20,
      narrowThreshold: 64,
      tab: null,
      focusedPaneId: null,
    });
    const r = renderer.render(
      layout,
      {
        model,
        prefs: new PrefsModel(),
        theme: new ThemeColors("nord"),
        mode: "terminal",
        connection: "open",
        notice: null,
      },
      panes,
    );
    await outer.write(r.output);
    expect(outer.text()).toContain("小さすぎます");
  });

  it("分割の枠は両方の pane の名前を出す", async () => {
    const snap = snapshot({
      tabs: [tab("t1", "w1", split("down", leaf("p1"), leaf("p2"))), tab("t2", "w2", leaf("p3"))],
    });
    const { outer, draw, commit } = await setup(snap);
    commit();
    await draw();
    expect(outer.text()).toContain("pane p1");
    expect(outer.text()).toContain("pane p2");
  });
});

describe("color・width", () => {
  it("COLORTERM で truecolor、無ければ 256 色", () => {
    expect(colorModeOf({ COLORTERM: "truecolor" })).toBe("truecolor");
    expect(colorModeOf({ COLORTERM: "24bit" })).toBe("truecolor");
    expect(colorModeOf({})).toBe("256");
  });

  it("truecolor の判定を広げる（WT_SESSION・TERM の -direct・TERM_PROGRAM・kitty・SODA_TRUECOLOR）と設定の上書き", () => {
    expect(colorModeOf({ WT_SESSION: "x" })).toBe("truecolor");
    expect(colorModeOf({ TERM: "xterm-direct" })).toBe("truecolor");
    for (const p of ["iTerm.app", "WezTerm", "vscode", "ghostty"])
      expect(colorModeOf({ TERM_PROGRAM: p }), p).toBe("truecolor");
    expect(colorModeOf({ TERM_PROGRAM: "Apple_Terminal" })).toBe("256");
    expect(colorModeOf({ KITTY_WINDOW_ID: "1" })).toBe("truecolor");
    expect(colorModeOf({ SODA_TRUECOLOR: "1" })).toBe("truecolor");
    expect(colorModeOf({ SODA_TRUECOLOR: "0", COLORTERM: "truecolor" })).toBe("256");
    expect(colorModeOf({ COLORTERM: "truecolor" }, "256")).toBe("256");
    // SODA_TRUECOLOR は手元の設定より優先する。
    expect(colorModeOf({ SODA_TRUECOLOR: "1" }, "256")).toBe("truecolor");
    expect(colorModeOf({ SODA_TRUECOLOR: "0" }, "truecolor")).toBe("256");
    expect(colorModeOf({}, "truecolor")).toBe("truecolor");
    expect(colorModeOf({ COLORTERM: "truecolor" }, "auto")).toBe("truecolor");
  });

  it("RGB → 256 色は立方体と灰色の近いほう", () => {
    expect(rgbTo256(255, 0, 0)).toBe(196);
    expect(rgbTo256(0, 0, 0)).toBe(16);
    expect(rgbTo256(128, 128, 128)).toBe(244);
  });

  it("テーマは pane の既定色と 0〜15 番をテーマの RGB へ、16 番以降と RGB はそのまま", () => {
    const t = new ThemeColors("dracula");
    expect(t.paneColor(0, -1, false)).toBe(hexColor("#f8f8f2"));
    expect(t.paneColor(0, -1, true)).toBe(hexColor("#282a36"));
    expect(t.paneColor(1, 1, false)).toBe(t.ansi[1]);
    expect(t.paneColor(1, 200, false)).toBe(0x1000000 | 200);
    expect(t.paneColor(2, 0x123456, false)).toBe(hexColor("#123456"));
  });

  it("幅は unicode11 の規則（全角・絵文字 2、ASCII 1）。切り詰めは … を含めて収める", () => {
    expect(stringWidth("ab日👍")).toBe(6);
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("日本語", 4)).toBe("日…");
    expect(truncate("abc", 3)).toBe("abc");
  });
});

describe("pane の中身と chrome の指摘の直し", () => {
  it("太字のパレット 0〜7 は明るい 8〜15 で描く（xterm.js の既定と同じ）", async () => {
    const { PaneTerminal } = await import("../term/PaneTerminal.js");
    const { paintPane } = await import("./paintPane.js");
    const { Grid } = await import("./Screen.js");
    const t = new PaneTerminal("p", 10, 1, 0);
    try {
      t.output(new TextEncoder().encode("\x1b[1;31mA\x1b[0;31mB\x1b[1;91mC"));
      await t.flush();
      const theme = new ThemeColors("dracula");
      const g = new Grid(10, 1);
      paintPane(g, t, { x: 0, y: 0, w: 10, h: 1 }, theme);
      expect(g.cell(0, 0).fg).toBe(theme.ansi[9]);
      expect(g.cell(1, 0).fg).toBe(theme.ansi[1]);
      expect(g.cell(2, 0).fg).toBe(theme.ansi[9]);
    } finally {
      t.dispose();
    }
  });

  it("結合文字（NFD）は直前のセルへまとめ、桁がずれない", async () => {
    const { Grid } = await import("./Screen.js");
    const g = new Grid(6, 1);
    const nfd = "がx"; // が（NFD）＋ x
    expect(g.text(0, 0, nfd, 0, 0)).toBe(3);
    expect(g.cell(0, 0).ch).toBe("が");
    expect(g.cell(2, 0).ch).toBe("x");
  });
});

describe("Renderer.setColorMode", () => {
  it("変わらなければ描き直さない。変われば全部描き直す", async () => {
    const { PaneRegistry } = await import("../term/PaneRegistry.js");
    const panes = new PaneRegistry(
      { request: (() => Promise.resolve({})) as never },
      () => 0,
      () => undefined,
    );
    const model = new SessionModel();
    model.applySnapshot(snapshot(), "c1");
    const r = new Renderer("truecolor", false);
    const layout = computeLayout({
      cols: 60,
      rows: 10,
      sidebarVisible: true,
      sidebarCols: 20,
      narrowThreshold: 0,
      tab: null,
      focusedPaneId: null,
    });
    const ctx = {
      model,
      prefs: new PrefsModel(),
      theme: new ThemeColors("dracula"),
      mode: "terminal" as const,
      connection: "open" as const,
      notice: null,
    };
    r.render(layout, ctx, panes);
    r.setColorMode("truecolor");
    expect(r.render(layout, ctx, panes).output).not.toContain("\x1b[2J");
    r.setColorMode("256");
    expect(r.render(layout, ctx, panes).output).toContain("\x1b[2J");
  });
});
