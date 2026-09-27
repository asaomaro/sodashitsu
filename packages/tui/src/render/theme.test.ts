import { afterEach, describe, expect, it, vi } from "vitest";
import { enterSequence, RESTORE_SEQUENCE } from "../app/terminalModes.js";
import { systemDarkFromEnv } from "../app/TuiApp.js";
import { PrefsModel } from "../model/PrefsModel.js";
import { startedApp } from "../testing/appHarness.js";
import { agent, pane, snapshot, workspace } from "../testing/fixtures.js";
import { rgbColor, ThemeColors } from "./color.js";
import { parseCssColor } from "./cssColor.js";

/** テーマの配色（05 の T2。色の上書き・明暗の自動・client.theme）とサイドバーの行の並び。 */
describe("CSS の色の読み取り（色の上書き）", () => {
  it("#hex・rgb()・hsl()・色の名前。透明度は捨て、読めないものは null", () => {
    expect(parseCssColor("#f0a")).toEqual({ r: 255, g: 0, b: 170 });
    expect(parseCssColor("#ff000080")).toEqual({ r: 255, g: 0, b: 0 });
    expect(parseCssColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30 });
    expect(parseCssColor("rgb(100% 0% 50% / 0.5)")).toEqual({ r: 255, g: 0, b: 128 });
    expect(parseCssColor("hsl(120, 100%, 50%)")).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseCssColor("RebeccaPurple")).toEqual({ r: 0x66, g: 0x33, b: 0x99 });
    for (const bad of [
      "",
      "transparent",
      "currentcolor",
      "#12",
      "rgb(1,2)",
      "color-mix(in srgb, red, blue)",
      5,
    ])
      expect(parseCssColor(bad)).toBeNull();
  });
});

describe("ThemeColors（色の上書き）", () => {
  it("テーマの明暗の層だけを重ね、読めない色はテーマの色のまま", () => {
    const base = new ThemeColors("dracula");
    const t = new ThemeColors("dracula", {
      light: { "--soda-accent": "#00ff00" },
      dark: { "--soda-accent": "#ff0000", "--soda-fg": "color-mix(in srgb, red, blue)" },
    });
    expect(t.ui("--soda-accent")).toBe(rgbColor(255, 0, 0));
    expect(t.ui("--soda-fg")).toBe(base.ui("--soda-fg"));
    expect(t.key).not.toBe(base.key);
    const light = new ThemeColors("catppuccin-latte", {
      light: { "--soda-accent": "#00ff00" },
      dark: {},
    });
    expect(light.ui("--soda-accent")).toBe(rgbColor(0, 255, 0));
  });
});

describe("明暗の自動の切り替え", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  it("起動の見当は COLORFGBG（背景 7・9〜15 は明るい）。無ければ暗い", () => {
    expect(systemDarkFromEnv({})).toBe(true);
    expect(systemDarkFromEnv({ COLORFGBG: "0;15" })).toBe(false);
    expect(systemDarkFromEnv({ COLORFGBG: "15;0" })).toBe(true);
    expect(systemDarkFromEnv({ COLORFGBG: "0;default;7" })).toBe(false);
    expect(systemDarkFromEnv({ COLORFGBG: "x" })).toBe(true);
  });

  it("起動で背景色を訊き（OSC 11）、明暗の知らせ（?2031）を有効にし、終わりで戻す", () => {
    expect(enterSequence(true)).toContain("\x1b[?2031h\x1b]11;?\x1b\\");
    expect(RESTORE_SEQUENCE).toContain("\x1b[?2031l");
  });

  it("自動の切り替えが入なら、外側の端末の背景色の応答で明るいテーマへ移り、client.theme を送る", async () => {
    const h = await startedApp();
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.theme")).toHaveLength(1));
    h.app.prefs.apply({ themeAuto: true }, 1);
    expect(h.app.prefs.theme).toBe("dracula");
    h.io.type("\x1b]11;rgb:ffff/ffff/ffff\x1b\\");
    expect(h.app.prefs.systemDark).toBe(false);
    expect(h.app.prefs.theme).not.toBe("dracula");
    await vi.waitFor(() => expect(h.ws.requests("client.theme")).toHaveLength(2));
    expect(h.ws.requests("client.theme")[1]!.params).toEqual({ theme: h.app.prefs.theme });
    // 明暗の変化の知らせ（CSI ? 997 ; 1 n）で暗いテーマへ戻る。
    h.io.type("\x1b[?997;1n");
    expect(h.app.prefs.theme).toBe("dracula");
  });

  it("PrefsModel：色の上書きは端末版で読める色だけ", () => {
    const p = new PrefsModel();
    p.apply(
      { themeOverrides: { dark: { "--soda-accent": "#123456", "--soda-fg": "var(--x)" } } },
      1,
    );
    expect(p.themeOverrides.dark).toEqual({ "--soda-accent": "#123456" });
  });
});

describe("サイドバーの行の並び（sidebarRows。web と同じ client-core の resolveRows）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  it("独自の並び・独自トークン・条件（隠す）で描く", async () => {
    const snap = snapshot({
      workspaces: [
        workspace("w1", ["t1"], { label: "alpha", tokens: { ticket: "SODA-12" } }),
        workspace("w2", ["t2"], {
          label: "beta",
          git: { branch: "feat/x", ahead: 2, behind: 0 } as never,
        }),
      ],
      panes: [
        pane("p1", "t1"),
        pane("p2", "t1"),
        pane("p3", "t2", { agent: agent({ state: "working", label: "Claude" }) }),
      ],
    });
    const h = await startedApp({ snapshot: snap });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.app.prefs.apply(
      {
        sidebarRows: {
          spaces: [
            [
              { token: "workspace", rules: [{ when: "equals", value: "beta", hide: true }] },
              { token: "$ticket" },
            ],
            [{ token: "branch" }],
          ],
          agents: [[{ token: "agent" }, { token: "state_text" }]],
        },
      },
      1,
    );
    h.app.renderNow();
    const text = await h.screen();
    expect(text).toContain("alpha SODA-12");
    expect(text).not.toContain("beta"); // 条件で隠した（w2 の 1 行目は空）
    expect(text).toContain("feat/x");
    expect(text).toContain("Claude 作業中");
  });
});
