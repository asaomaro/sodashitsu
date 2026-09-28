/*
 * 外側の端末のタイトルの書式・文字の洗い・端末のタイトルの回る記号の除去の試験の一部（「外側の端末のタイトルの書式」の describe）は、
 * herdr（https://github.com/herdrdev/herdr、commit da6bcd5969779bfe0396bcf89a8025d4375d611e）の `src/config/window_title.rs` の試験
 * （`parses_tokens_literals_and_escapes` 等）と `src/terminal/title.rs` の試験の値を本製品の型に書き換えて移したもの（Apache-2.0。ルートの `NOTICE`）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { computeLayout } from "../layout/computeLayout.js";
import { startedApp } from "../testing/appHarness.js";
import { fakeIo } from "../testing/fakeIo.js";
import { agent, leaf, pane, snapshot, split, tab, workspace } from "../testing/fixtures.js";
import { TerminalModes } from "./terminalModes.js";
import {
  MAX_WINDOW_TITLE_CHARS,
  parseWindowTitle,
  renderWindowTitle,
  sanitizeWindowTitle,
  strippedTerminalTitle,
} from "./windowTitle.js";

/** 05 の T7（herdr の見た目・操作の設定：外側の端末のタイトル・tab バー・pane の枠・はじめの案内・ベル・閉じる確認と名前の問い）。 */

const ESC = "\x1b";
const BEL = "\x07";
const PUSH = "\x1b[22;0t";
const POP = "\x1b[23;0t";

describe("外側の端末のタイトルの書式（H14。herdr の WindowTitleTemplate::parse・sanitize_window_title_text・stripped_terminal_title）", () => {
  it("語・文字・{{ }} の括弧を読む", () => {
    expect(parseWindowTitle("{hostname}: {workspace} {{a}}")).toEqual([
      { token: "hostname" },
      { literal: ": " },
      { token: "workspace" },
      { literal: " {a}" },
    ]);
    expect(parseWindowTitle("{ tab }/{pane}/{terminal_title}")).toEqual([
      { token: "tab" },
      { literal: "/" },
      { token: "pane" },
      { literal: "/" },
      { token: "terminal_title" },
    ]);
  });

  it("空なら null（タイトルに触らない）、読めない書式は理由を投げる", () => {
    expect(parseWindowTitle("")).toBeNull();
    expect(() => parseWindowTitle("{host")).toThrow("unclosed '{'");
    expect(() => parseWindowTitle("{nope}")).toThrow("unknown token '{nope}'");
    expect(() => parseWindowTitle("a}b")).toThrow("unmatched '}'");
  });

  it("制御文字（C0・DEL・C1）を除き、200 文字までにし、前後の空白を落とす。空なら null", () => {
    expect(sanitizeWindowTitle(" a\x1b]0;x\x07b\x7f\x9cc ")).toBe("a]0;xbc");
    expect(sanitizeWindowTitle(" \x07 ")).toBeNull();
    expect([...sanitizeWindowTitle("あ".repeat(300))!]).toHaveLength(MAX_WINDOW_TITLE_CHARS);
    const parts = parseWindowTitle("{workspace}@{hostname}")!;
    expect(renderWindowTitle(parts, { workspace: "w", hostname: "h" })).toBe("w@h");
    expect(renderWindowTitle(parts, {})).toBe("@");
  });

  it("端末のタイトルの先頭の回る記号を除く（herdr の stripped_terminal_title）", () => {
    expect(strippedTerminalTitle("⠋ building")).toBe("building");
    expect(strippedTerminalTitle("✳ Claude Code")).toBe("Claude Code");
    expect(strippedTerminalTitle("✳Claude")).toBe("✳Claude"); // 記号の後に空白が無ければそのまま
    expect(strippedTerminalTitle("  vim  ")).toBe("vim");
    expect(strippedTerminalTitle("⠋")).toBeNull();
    expect(strippedTerminalTitle("")).toBeNull();
  });

  it("TerminalModes：初めて置くときだけ退避し、同じタイトルは書かず、null・終わるときに戻す", () => {
    const io = fakeIo();
    const m = new TerminalModes(io);
    m.setTitle("x"); // 有効にする前は何もしない
    expect(io.output()).toBe("");
    m.enable(false);
    const start = io.output().length;
    m.setTitle("a");
    m.setTitle("a");
    m.setTitle("b");
    expect(io.output().slice(start)).toBe(`${PUSH}\x1b]2;a\x07\x1b]2;b\x07`);
    m.setTitle(null);
    expect(io.output().endsWith(POP)).toBe(true);
    m.setTitle("c");
    const before = io.output().length;
    m.restore();
    expect(io.output().slice(before).startsWith(POP)).toBe(true);
    // 置いていなければ戻さない
    const io2 = fakeIo();
    const m2 = new TerminalModes(io2);
    m2.enable(false);
    m2.restore();
    expect(io2.output()).not.toContain(POP);
  });
});

describe("T7 の画面", () => {
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

  function run(h: Awaited<ReturnType<typeof app>>, action: { type: string }): void {
    (h.app as unknown as { dispatcher: { dispatch(a: unknown): void } }).dispatcher.dispatch(
      action,
    );
  }

  /** ESC の単独（確定を待つ）。 */
  async function esc(h: Awaited<ReturnType<typeof app>>): Promise<void> {
    h.io.type("\x1b");
    await new Promise((r) => setTimeout(r, 40));
  }

  /** 設定画面の端末版の節へ入る。 */
  async function tuiSettings(h: Awaited<ReturnType<typeof app>>): Promise<void> {
    h.io.type("\x02s");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "settings" }));
    for (let i = 0; i < 6; i++) h.io.type("j");
    h.io.type("\r");
  }

  /** 共有の設定を当てる（案内済み。はじめの案内を出さない）。 */
  function prefs(h: Awaited<ReturnType<typeof app>>, p: Record<string, unknown>, rev = 1): void {
    h.app.prefs.apply({ onboarding: false, ...p }, rev);
  }

  it("H14：既定の書式で「ホスト名: workspace」を置き、終えるときに元のタイトルへ戻す", async () => {
    const h = await app({
      snapshot: snapshot({
        workspaces: [workspace("w1", ["t1"], { label: "proj" }), workspace("w2", ["t2"])],
      }),
    });
    h.app.renderNow();
    const out = h.io.output();
    expect(out).toContain(`${PUSH}\x1b]2;h: proj\x07`);
    expect(out.split(PUSH)).toHaveLength(2); // 退避は 1 回
    await h.close();
    closers.splice(0);
    const tail = h.io.output().slice(out.length);
    expect(tail).toContain(POP);
    expect(tail.indexOf(POP)).toBeLessThan(tail.indexOf("\x1b[?1049l"));
  });

  it("H14：書式を空にするとタイトルに触らず（置いていたら戻す）、読めない書式でも触らない", async () => {
    const h = await app({
      respond: { "prefs.get": { prefs: { onboarding: false, tui: { windowTitle: "" } }, rev: 0 } },
    });
    await vi.waitFor(() => expect(h.app.prefs.rev).toBe(0));
    const start = h.io.output().length;
    h.app.renderNow();
    // 設定を受け取る前の描画は既定の書式で置くことがあるので、受け取った後だけを見る
    const afterEmpty = h.io.output().slice(start);
    expect(afterEmpty).not.toContain(PUSH);
    expect(afterEmpty).not.toContain("\x1b]2;");
    prefs(h, { tui: { windowTitle: "{workspace}|{tab}|{pane}|{terminal_title}" } }, 2);
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1b]2;w1|t1||\x07");
    const beforeBad = h.io.output().length;
    prefs(h, { tui: { windowTitle: "{bad" } }, 3);
    h.app.renderNow();
    const afterBad = h.io.output().slice(beforeBad);
    expect(afterBad).toContain(POP);
    expect(afterBad).not.toContain("\x1b]2;");
  });

  it("H14：pane の名前・端末のタイトル（回る記号を除く）を入れる。すべて空なら soda", async () => {
    const h = await app({
      snapshot: snapshot({
        panes: [
          pane("p1", "t1", { label: "api", title: "⠙ npm test" }),
          pane("p2", "t1"),
          pane("p3", "t2"),
        ],
      }),
    });
    prefs(h, { tui: { windowTitle: "{pane} / {terminal_title}" } });
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1b]2;api / npm test\x07");
    prefs(h, { tui: { windowTitle: "{tab}" } }, 2);
    h.app.model.tabs.get("t1")!.label = "";
    h.app.renderNow();
    expect(h.io.output()).toContain("\x1b]2;soda\x07");
  });

  it("H22：tab バーを下に・右端に固定文字列とホスト名・tab が 1 つなら隠して右上にモードの印", async () => {
    const h = await app({ cols: 100, rows: 20 });
    prefs(h, {
      tabBarPosition: "bottom",
      tabBarRight: [{ kind: "text", text: "HELLO" }, { kind: "hostname" }],
      tabBarRightSeparator: " | ",
    });
    h.app.renderNow();
    let lines = (await h.screen()).split("\n");
    expect(lines[19]).toContain("HELLO | h");
    expect(lines[0]).not.toContain("HELLO");
    // tab が 1 つ（w1 は t1 だけ）で隠す
    prefs(h, { tabBarPosition: "top", tui: { hideTabBarWhenSingle: true } }, 2);
    h.app.renderNow();
    lines = (await h.screen()).split("\n");
    expect(lines.join("\n")).not.toContain("1:t1");
    expect(h.app["lastLayout"]!.paneArea).toMatchObject({ y: 0, h: 20 });
    h.io.type("\x02");
    h.app.renderNow();
    lines = (await h.screen()).split("\n");
    expect(lines[0]!.trimEnd().endsWith("PREFIX")).toBe(true);
    // サイドバーを畳んでいる間は隠さない（開く「»」が tab バーにある）
    await esc(h);
    h.app.prefs.setLocal({ ...h.app.prefs.localState, sidebarCollapsed: true });
    h.app.renderNow();
    expect(await h.screen()).toContain("1:t1");
  });

  it("H22：日時を出していれば毎秒描き直す", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const h = await app();
      prefs(h, { tabBarRight: [{ kind: "datetime", format: "time" }] });
      h.app.renderNow();
      const spy = vi.spyOn(h.app, "scheduleRender");
      vi.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalled();
      prefs(h, { tabBarRight: [] }, 2);
      spy.mockClear();
      vi.advanceTimersByTime(1000);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("H23：枠の描き方（auto の 1 つだけの pane は枠なし・off は境目の線だけ）・エージェント名", async () => {
    const one = snapshot({
      workspaces: [workspace("w1", ["t1"])],
      tabs: [tab("t1", "w1", leaf("p1"))],
      panes: [pane("p1", "t1", { title: "shell" })],
    });
    const h = await app({ snapshot: one, cols: 100, rows: 12 });
    prefs(h, { paneBorders: "auto" });
    h.app.renderNow();
    const box = h.app["lastLayout"]!.panes[0]!;
    expect(box.content).toEqual(box.frame);
    expect(await h.screen()).not.toContain("┌");
  });

  it("H23：off の分割は枠を描かず、境目に線を 1 本だけ描く", async () => {
    const h = await app({ cols: 100, rows: 12 });
    prefs(h, { paneBorders: "off" });
    h.app.renderNow();
    const text = await h.screen();
    expect(text).not.toContain("┌");
    const [a, b] = h.app["lastLayout"]!.panes;
    const x = a!.frame.x + a!.frame.w - 1;
    expect(b!.frame.x).toBe(x + 1);
    const lines = text.split("\n");
    for (let y = a!.frame.y; y < a!.frame.y + a!.frame.h; y++) expect([...lines[y]!][x]).toBe("│");
  });

  it("H23：computeLayout：auto は分割のときだけ枠・off は右と下の境目だけ・隙間なしは縦の罫線を 1 本に", () => {
    const base = {
      cols: 60,
      rows: 20,
      sidebarVisible: false,
      sidebarCols: 20,
      narrowThreshold: 0,
      focusedPaneId: "a",
      tab: { layout: split("right", leaf("a"), leaf("b")), zoomedPaneId: null },
    };
    const auto = computeLayout({ ...base, paneBorders: "auto" });
    expect(auto.panes[0]!.sides).toEqual({ top: true, bottom: true, left: true, right: true });
    const autoOne = computeLayout({
      ...base,
      paneBorders: "auto",
      tab: { layout: leaf("a"), zoomedPaneId: null },
    });
    expect(autoOne.panes[0]!.sides).toEqual({
      top: false,
      bottom: false,
      left: false,
      right: false,
    });
    const off = computeLayout({ ...base, paneBorders: "off" });
    expect(off.panes[0]!.sides).toEqual({ top: false, bottom: false, left: false, right: true });
    expect(off.panes[1]!.sides).toEqual({ top: false, bottom: false, left: false, right: false });
    const noGap = computeLayout({ ...base, paneGaps: false });
    expect(noGap.panes[0]!.sides.right).toBe(false);
    expect(noGap.panes[1]!.sides.left).toBe(true);
    // 中身は描く辺の分だけ縮む
    expect(noGap.panes[0]!.content.w).toBe(noGap.panes[0]!.frame.w - 1);
    const bottom = computeLayout({ ...base, tabBarPosition: "bottom" });
    expect(bottom.tabBar).toEqual({ x: 0, y: 19, w: 60, h: 1 });
    expect(bottom.paneArea).toEqual({ x: 0, y: 0, w: 60, h: 19 });
    const hidden = computeLayout({ ...base, hideTabBar: true });
    expect(hidden.tabBar.h).toBe(0);
    expect(hidden.paneArea).toEqual({ x: 0, y: 0, w: 60, h: 20 });
    // 狭い幅は隠さず、いつも上
    const narrow = computeLayout({
      ...base,
      narrowThreshold: 100,
      hideTabBar: true,
      tabBarPosition: "bottom",
    });
    expect(narrow.tabBar).toMatchObject({ y: 0, h: 1 });
  });

  it("H23：枠の名前は paneAgentNameVisible が入のときだけエージェント名", async () => {
    const h = await app({
      snapshot: snapshot({
        panes: [
          pane("p1", "t1", {
            title: "zsh",
            agent: agent(),
          }),
          pane("p2", "t1"),
          pane("p3", "t2"),
        ],
      }),
    });
    prefs(h, { paneAgentNameVisible: false });
    h.app.renderNow();
    let top = (await h.screen()).split("\n")[1]!;
    expect(top).toContain("zsh");
    prefs(h, { paneAgentNameVisible: true }, 2);
    h.app.renderNow();
    top = (await h.screen()).split("\n")[1]!;
    expect(top).toContain("Claude");
  });

  it("H29d：見えている pane のベルを外側の端末へ（設定が切・外側の端末にフォーカスが無ければ回さない）", async () => {
    const h = await app();
    await vi.waitFor(() => expect(h.app.panes.get("p1")).toBeDefined());
    const bells = () => h.io.output().split("\x07").length - 1;
    // タイトル等の BEL で終わる OSC
    const oscRe = new RegExp(`${ESC}\\][^${BEL}]*${BEL}`, "g");
    const osc = () => (h.io.output().match(oscRe) ?? []).length;
    const plain = () => bells() - osc();
    const before = plain();
    h.app.panes.onOutput("p1", new TextEncoder().encode("hi\x07"));
    await vi.waitFor(() => expect(plain()).toBe(before + 1));
    // 外側の端末からフォーカスが外れた
    h.io.type("\x1b[O");
    await new Promise((r) => setTimeout(r, 120));
    h.app.panes.onOutput("p1", new TextEncoder().encode("\x07"));
    await new Promise((r) => setTimeout(r, 30));
    expect(plain()).toBe(before + 1);
    // フォーカスは戻ったが設定が切
    h.io.type("\x1b[I");
    prefs(h, { tui: { forwardBell: false } });
    h.app.panes.onOutput("p1", new TextEncoder().encode("\x07"));
    await new Promise((r) => setTimeout(r, 30));
    expect(plain()).toBe(before + 1);
    prefs(h, { tui: { forwardBell: true } }, 2);
    h.app.panes.onOutput("p2", new TextEncoder().encode("\x07"));
    await vi.waitFor(() => expect(plain()).toBe(before + 2));
    // 見えていない pane（別の tab の p3）のベルは回さない（headless は見えている pane にしか無いが、割り付けが変わる途中の取りこぼしを防ぐ）
    await new Promise((r) => setTimeout(r, 120));
    (h.app as unknown as { onPaneBell(id: string): void }).onPaneBell("p3");
    expect(plain()).toBe(before + 2);
    (h.app as unknown as { onPaneBell(id: string): void }).onPaneBell("p1");
    expect(plain()).toBe(before + 3);
    // 続けて鳴っても間隔の中は 1 回
    (h.app as unknown as { onPaneBell(id: string): void }).onPaneBell("p1");
    expect(plain()).toBe(before + 3);
  });

  it("H50：tui.promptNewTabName が切なら名前を聞かずに tab を作る", async () => {
    const h = await app({
      respond: { "tab.create": { tab: tab("t9", "w1", leaf("p9")), pane: pane("p9", "t9") } },
    });
    prefs(h, { tui: { promptNewTabName: false } });
    h.io.type("\x02c");
    await vi.waitFor(() => expect(h.ws.requests("tab.create")).toHaveLength(1));
    expect(h.app.ui.dialogContext).toBeNull();
    expect(h.ws.requests("tab.create")[0]!.params).not.toHaveProperty("label");
  });

  it("H50：既定では tab の名前を聞き、workspace は聞かない。promptNewWorkspaceName が入なら名前を聞いて付ける", async () => {
    const created = {
      workspace: workspace("w9", ["t9"]),
      tab: tab("t9", "w9", leaf("p9")),
      pane: pane("p9", "t9"),
    };
    const h = await app({ respond: { "workspace.create": created } });
    prefs(h, {});
    h.io.type("\x02c");
    await vi.waitFor(() => expect(h.app.ui.dialogContext?.kind).toBe("newTab"));
    await esc(h);
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
    run(h, { type: "newWorkspace" });
    await vi.waitFor(() => expect(h.ws.requests("workspace.create")).toHaveLength(1));
    expect(h.ws.requests("workspace.create")[0]!.params).not.toHaveProperty("label");
    prefs(h, { tui: { promptNewWorkspaceName: true } }, 2);
    run(h, { type: "newWorkspace" });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "newWorkspace" }));
    h.app.renderNow();
    expect(await h.screen()).toContain("新しい workspace の名前");
    h.io.type("api\r");
    await vi.waitFor(() => expect(h.ws.requests("workspace.create")).toHaveLength(2));
    expect(h.ws.requests("workspace.create")[1]!.params).toMatchObject({ label: "api" });
  });

  it("H50：tui.confirmClose が切なら workspace をすぐ閉じる（動作中の pane があれば確かめる）", async () => {
    const h = await app();
    prefs(h, { tui: { confirmClose: false } });
    run(h, { type: "closeWorkspace" });
    await vi.waitFor(() => expect(h.ws.requests("workspace.close")).toHaveLength(1));
    expect(h.ws.requests("workspace.close")[0]!.params).toEqual({
      workspaceId: "w1",
      closeLinkedWorktrees: false,
    });
    h.app.model.panes.get("p2")!.busy = true;
    run(h, { type: "closeWorkspace" });
    expect(h.app.ui.dialogContext?.kind).toBe("confirmClose");
    await esc(h);
    // 既定（入）は確かめる
    h.app.model.panes.get("p2")!.busy = false;
    prefs(h, {}, 2);
    run(h, { type: "closeWorkspace" });
    expect(h.app.ui.dialogContext?.kind).toBe("confirmClose");
    expect(h.ws.requests("workspace.close")).toHaveLength(1);
  });

  it("H25b：共有の設定を受け取り、案内済みでなければはじめの案内を 1 回出す。Esc では閉じず、Enter で案内済みにして設定画面へ", async () => {
    let rev = 0;
    const h = await app({
      respond: {
        "prefs.get": { prefs: {}, rev: 0 },
        "prefs.set": (p: { patch: unknown }) => ({ prefs: p.patch, rev: ++rev }),
      },
    });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" }));
    h.app.renderNow();
    const text = await h.screen();
    expect(text).toContain("Sodashitsu");
    expect(text).toContain("ctrl+b で prefix モード");
    await esc(h);
    expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" });
    h.io.type("x");
    expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" });
    h.io.type("\r");
    await vi.waitFor(() =>
      expect(h.app.ui.dialogContext).toEqual({ kind: "settings", section: "agents" }),
    );
    await vi.waitFor(() => expect(h.ws.requests("prefs.set")).toHaveLength(1));
    expect(h.ws.requests("prefs.set")[0]!.params).toMatchObject({ patch: { onboarding: false } });
    // 閉じても 2 回は出さない
    await esc(h);
    await esc(h);
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toBeNull());
    h.app.ui.toast("x");
    expect(h.app.ui.dialogContext).toBeNull();
  });

  it("H25b：web で案内済み（onboarding: false）なら出さない。設定画面から開き直せる", async () => {
    const h = await app({ respond: { "prefs.get": { prefs: { onboarding: false }, rev: 3 } } });
    await vi.waitFor(() => expect(h.app.prefs.rev).toBe(3));
    expect(h.app.ui.dialogContext).toBeNull();
    await tuiSettings(h);
    for (let i = 0; i < 13; i++) h.io.type("j"); // はじめの案内を開く
    h.app.renderNow();
    expect(await h.screen()).toContain("はじめの案内を開く");
    h.io.type("\r");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" }));
  });

  it("H25b：確定せずに閉じられても（マシンの切り替え等）、この起動では開き直さない", async () => {
    const h = await app({ respond: { "prefs.get": { prefs: {}, rev: 0 } } });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" }));
    h.app.ui.closeDialog();
    h.app.ui.toast("x");
    expect(h.app.ui.dialogContext).toBeNull();
    expect(h.ws.requests("prefs.set")).toEqual([]);
  });

  it("H25b：外側を押しても閉じず、［はじめる］を押すと確定する", async () => {
    const h = await app({ respond: { "prefs.get": { prefs: {}, rev: 0 } } });
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" }));
    h.app.renderNow();
    h.io.type("\x1b[<0;1;1M\x1b[<0;1;1m");
    expect(h.app.ui.dialogContext).toEqual({ kind: "onboarding" });
    const lines = (await h.screen()).split("\n");
    const y = lines.findIndex((l) => l.includes("はじめる"));
    const x = lines[y]!.indexOf("はじめる");
    h.io.type(`\x1b[<0;${x + 1};${y + 1}M`);
    await vi.waitFor(() =>
      expect(h.app.ui.dialogContext).toEqual({ kind: "settings", section: "agents" }),
    );
  });

  it("設定画面：外側の端末のタイトルの書式が読めなければ保存しない", async () => {
    const h = await app({
      respond: { "prefs.get": { prefs: { onboarding: false }, rev: 0 } },
    });
    await vi.waitFor(() => expect(h.app.prefs.rev).toBe(0));
    await tuiSettings(h);
    for (let i = 0; i < 6; i++) h.io.type("j"); // 外側の端末のタイトル
    h.io.type("\r\x15{oops\r");
    h.app.renderNow();
    expect(await h.screen()).toContain("書式が読めません");
    expect(h.ws.requests("prefs.set")).toEqual([]);
  });
});
