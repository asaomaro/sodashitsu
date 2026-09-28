import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startedApp } from "../testing/appHarness.js";

/** 05 T7 の点検の指摘（境界の当たり・はじめの案内の対象）。 */
const down = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}M`;
const up = (x: number, y: number) => `\x1b[<0;${x + 1};${y + 1}m`;
const drag = (x: number, y: number) => `\x1b[<32;${x + 1};${y + 1}M`;

describe("05 T7 の点検", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  async function app(opts: Parameters<typeof startedApp>[0] = {}) {
    const h = await startedApp(opts);
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    return h;
  }

  /**
   * 100×30・サイドバー 26・p1 の枠は 26〜62・p2 の枠は 63〜99。境界として掴めるのは罫線・境目の線の桁だけで、中身の桁を押すと pane へ
   * （焦点が移り、比率は変わらない）。
   */
  async function borders(p: Record<string, unknown>) {
    const h = await app();
    h.app.prefs.apply({ onboarding: false, ...p }, 1);
    h.app.renderNow();
    const ratios = () => h.ws.requests("layout.set_split_ratio").length;
    return { h, ratios };
  }

  it("枠を描かない（off）：p2 の最初の中身の桁は境界にせず、境目の線（p1 の右）は掴める", async () => {
    const { h, ratios } = await borders({ paneBorders: "off" });
    const [a, b] = h.app["lastLayout"]!.panes;
    expect(b!.content.x).toBe(63);
    expect(a!.sides.right).toBe(true);
    h.io.type(down(63, 10) + drag(55, 10) + up(55, 10));
    expect(ratios()).toBe(0);
    expect(h.app.model.focusedPaneId).toBe("p2");
    h.io.type(down(62, 10) + drag(55, 10) + up(55, 10));
    expect(ratios()).toBeGreaterThan(0);
  });

  it("隙間なし：p1 の右端の中身の桁は境界にせず、p2 の左の罫線は掴める", async () => {
    const { h, ratios } = await borders({ paneGaps: false });
    const [a] = h.app["lastLayout"]!.panes;
    expect(a!.content.x + a!.content.w - 1).toBe(62);
    h.io.type(down(62, 10) + drag(55, 10) + up(55, 10));
    expect(ratios()).toBe(0);
    h.io.type(down(63, 10) + drag(55, 10) + up(55, 10));
    expect(ratios()).toBeGreaterThan(0);
  });

  it("はじめの案内：設定を前から使っていた既存の利用者（rev が 1 以上で onboarding の項目が無い）には出さない", async () => {
    const h = await app({ respond: { "prefs.get": { prefs: { theme: "nord" }, rev: 4 } } });
    await vi.waitFor(() => expect(h.app.prefs.rev).toBe(4));
    h.app.ui.toast("x");
    expect(h.app.ui.dialogContext).toBeNull();
  });

  it("はじめの案内：onboarding: true なら rev が 1 以上でも出す", async () => {
    const h = await app({ respond: { "prefs.get": { prefs: { onboarding: true }, rev: 4 } } });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" }));
  });

  it("はじめの案内：SODA_NO_ONBOARDING=1 の起動には出さない", async () => {
    const h = await app({
      env: { SODA_NO_ONBOARDING: "1" },
      respond: { "prefs.get": { prefs: {}, rev: 0 } },
    });
    await vi.waitFor(() => expect(h.app.prefs.rev).toBe(0));
    h.app.ui.toast("x");
    expect(h.app.ui.dialogContext).toBeNull();
  });

  it("はじめの案内：この状態ディレクトリで端末版を前にも使った（tui-state.json がある）なら出さない", async () => {
    const dir = await mkdtemp(join(tmpdir(), "soda-t7-"));
    try {
      await writeFile(join(dir, "tui-state.json"), "{}");
      const h = await app({ stateDir: dir, respond: { "prefs.get": { prefs: {}, rev: 0 } } });
      await vi.waitFor(() => expect(h.app.prefs.rev).toBe(0));
      h.app.ui.toast("x");
      expect(h.app.ui.dialogContext).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("はじめの案内の後は設定画面の「エージェント連携」の節を選んで開く（herdr と同じ）", async () => {
    const h = await app({
      respond: {
        "prefs.get": { prefs: {}, rev: 0 },
        "agent_integration.status": {
          autoResumeEnabled: true,
          agents: { claude: { cliDetected: true, installed: false } },
        },
      },
    });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" }));
    h.io.type("\r");
    await vi.waitFor(() =>
      expect(h.app.ui.dialogContext).toEqual({ kind: "settings", section: "agents" }),
    );
    await vi.waitFor(async () => {
      h.app.renderNow();
      expect(await h.screen()).toContain("Qwen Code");
    });
  });

  it("外側の端末に戻ったら（CSI I）全部描き直す。tui.redrawOnFocusGained が切なら差分だけ", async () => {
    const h = await app();
    h.app.prefs.apply({ onboarding: false }, 1);
    h.app.renderNow();
    const frameAfter = (seq: string): string => {
      const start = h.io.output().length;
      h.io.type(seq);
      h.app.renderNow();
      return h.io.output().slice(start);
    };
    // 離れたときは描き直さない
    expect(frameAfter("\x1b[O")).not.toContain("\x1b[2J");
    expect(frameAfter("\x1b[I")).toContain("\x1b[2J");
    h.app.prefs.apply({ onboarding: false, tui: { redrawOnFocusGained: false } }, 2);
    h.app.renderNow();
    frameAfter("\x1b[O");
    expect(frameAfter("\x1b[I")).not.toContain("\x1b[2J");
  });

  it("設定画面の端末版の節に「外側の端末に戻ったら全部描き直す」（既定は入）", async () => {
    const h = await app({ respond: { "prefs.get": { prefs: { onboarding: false }, rev: 0 } } });
    await vi.waitFor(() => expect(h.app.prefs.rev).toBe(0));
    expect(h.app.prefs.redrawOnFocusGained).toBe(true);
    h.io.type("\x02s");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "settings" }));
    for (let i = 0; i < 6; i++) h.io.type("j");
    h.io.type("\r");
    h.app.renderNow();
    expect(await h.screen()).toContain("外側の端末に戻ったら全部描き直す");
  });
});
