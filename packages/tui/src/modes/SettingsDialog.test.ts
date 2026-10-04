import { afterEach, describe, expect, it, vi } from "vitest";
import { CSS_VARS } from "@sodashitsu/client-core";
import { PrefsModel } from "../model/PrefsModel.js";
import { rgbColor, type ThemeColors } from "../render/color.js";
import { SettingsWriter } from "../settings/SettingsWriter.js";
import { startedApp } from "../testing/appHarness.js";
import { agent, pane, snapshot } from "../testing/fixtures.js";

const DOWN = "\x1b[B";
const ENTER = "\r";
const ESC = "\x1b";

/** 設定画面（05 の T1。design「設定画面（端末版）」・AC8・AC11・AC-I1〜AC-I4）。 */
describe("設定画面", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });

  async function open(opts?: Parameters<typeof startedApp>[0]) {
    // サーバの設定の保存（項目ごとの浅いマージ・rev を 1 つ進める）。
    let stored: Record<string, unknown> = {};
    let rev = 0;
    const h = await startedApp({
      ...opts,
      respond: {
        "prefs.set": (params: { patch: Record<string, unknown> }) => {
          stored = { ...stored, ...params.patch };
          rev += 1;
          return { prefs: stored, rev };
        },
        "agent_integration.status": {
          autoResumeEnabled: true,
          agents: {
            claude: { cliDetected: true, installed: false },
            codex: { cliDetected: false, installed: true },
          },
        },
        "agent_integration.install": { ok: true, message: null },
        ...opts?.respond,
      },
    });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.io.type("\x02s");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "settings" }));
    /** ESC の単独の確定を待たずに済むよう、ESC は後ろに何か続くときだけ送る。単独は `esc()`。 */
    const esc = async () => {
      h.io.type(ESC);
      await new Promise((r) => setTimeout(r, 40));
    };
    const text = async () => {
      h.app.renderNow();
      return h.screen();
    };
    /** 節 `index` の項目へ入る。 */
    const section = async (index: number) => {
      for (let i = 0; i < index; i++) h.io.type("j");
      h.io.type(ENTER);
    };
    const patches = () =>
      h.ws.requests("prefs.set").map((r) => (r.params as { patch: unknown }).patch);
    return { ...h, esc, text, section, patches };
  }

  it("prefix+s で開き、左に節・右に項目。Esc で節の一覧へ戻り、もう一度 Esc で閉じる", async () => {
    const h = await open();
    const t = await h.text();
    for (const s of ["通知", "テーマ", "表示", "端末", "エージェント連携", "キー", "端末版"])
      expect(t).toContain(s);
    expect(t).toContain("画面の中の知らせ");
    await h.section(0);
    await h.esc();
    expect(h.app.ui.dialogContext).toEqual({ kind: "settings" });
    await h.esc();
    expect(h.app.ui.dialogContext).toBeNull();
  });

  it("入切は Enter・Space でその場で prefs.set（通知の節は notify を丸ごと）。値は重ねて先に見せる", async () => {
    const h = await open();
    await h.section(0);
    h.io.type(" ");
    expect(h.patches()).toEqual([{ notify: { toast: false, desktop: false, sound: false } }]);
    expect(h.app.prefs.notify.toast).toBe(false);
    h.io.type(DOWN + DOWN + ENTER);
    expect(h.patches()[1]).toEqual({ notify: { toast: false, desktop: false, sound: true } });
  });

  it("選択肢の一覧：テーマを選ぶと theme と themeAuto:false。見出しは選べず、Esc は一覧だけ閉じる", async () => {
    const h = await open();
    await h.section(1);
    h.io.type(ENTER);
    let t = await h.text();
    expect(t).toContain("暗いテーマ");
    expect(t).toContain("● Dracula（既定）");
    h.io.type(DOWN + ENTER); // Dracula の次（暗いテーマの次の 1 つ）
    const p = h.patches()[0] as { theme: string; themeAuto: boolean };
    expect(p.themeAuto).toBe(false);
    expect(p.theme).not.toBe("dracula");
    // 自動の切り替えを入にすると、明るいとき・暗いときの行が出る。
    h.io.type(DOWN + ENTER);
    expect(h.patches()[1]).toEqual({ themeAuto: true });
    t = await h.text();
    expect(t).toContain("明るいとき");
    h.io.type(DOWN + ENTER);
    t = await h.text();
    expect(t).toContain("既定（");
    await h.esc();
    expect(h.app.ui.dialogContext).toEqual({ kind: "settings" });
    expect(h.patches()).toHaveLength(2);
  });

  it("入力欄：数の範囲の外は理由を出して保存しない。tui 節は節ごと送る", async () => {
    const h = await open();
    await h.section(6);
    h.io.type(DOWN + DOWN + DOWN + ENTER); // サイドバーの既定の幅
    h.io.type("\x15" + "5" + ENTER); // ctrl+u で消して 5
    expect(await h.text()).toContain("10〜200 の整数を入れてください");
    expect(h.patches()).toEqual([]);
    h.io.type(ENTER + "\x15" + "30" + ENTER);
    expect(h.patches()).toEqual([{ tui: { sidebarCols: 30 } }]);
    expect(h.app.prefs.sharedSidebarCols).toBe(30);
  });

  // 20260928-windows-pane-cwd の D-6：web の「端末」の節と同じ項目・同じ保存先（共有の設定の shellCwdTracking）。
  it("端末の節の「シェルの場所を追う（Windows）」は既定で入、押すと shellCwdTracking:false を送る", async () => {
    const h = await open();
    await h.section(3);
    const t = await h.text();
    expect(t).toContain("シェルの場所を追う（Windows）");
    expect(h.app.prefs.shellCwdTracking).toBe(true);
    h.io.type(DOWN + DOWN + DOWN); // scrollback・新しく開く場所・指定した場所のパスの次
    expect(await h.text()).toContain("PowerShell・cmd がプロンプトのたびに今の場所を知らせます"); // 項目の注記（選んだ項目の下に出る）
    h.io.type(ENTER);
    expect(h.patches()).toEqual([{ shellCwdTracking: false }]);
    expect(h.app.prefs.shellCwdTracking).toBe(false);
    h.io.type(" ");
    expect(h.patches()[1]).toEqual({ shellCwdTracking: true });
  });

  it("色の出し方は端末ごと（tui-state）で、共有の設定へは送らない", async () => {
    const h = await open();
    await h.section(6);
    for (let i = 0; i < 12; i++) h.io.type(DOWN);
    h.io.type(ENTER + DOWN + DOWN + ENTER); // 256 色
    expect(h.app.prefs.colorMode).toBe("256");
    expect(h.patches()).toEqual([]);
  });

  it("マウスを使うを切にすると外側の端末のマウスの報告を止め、入で出し直す", async () => {
    const h = await open();
    await h.section(6);
    const before = h.io.output().length;
    h.io.type(ENTER);
    await vi.waitFor(() =>
      expect(h.io.output().slice(before)).toContain("\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l"),
    );
    expect(h.patches()).toEqual([{ tui: { mouseCapture: false } }]);
    const mid = h.io.output().length;
    h.io.type(ENTER);
    await vi.waitFor(() =>
      expect(h.io.output().slice(mid)).toContain("\x1b[?1000h\x1b[?1002h\x1b[?1006h"),
    );
  });

  it("キー：操作の行で「追加：直接」→ 押したキーを割り当てて keys を送る。修飾キーだけは待ち続ける。Esc で取り消し", async () => {
    const h = await open();
    await h.section(5);
    h.io.type(DOWN + DOWN + DOWN); // prefix・プリセット・（全体の見出しを飛ばして）2 つ目の操作
    h.io.type(ENTER);
    let t = await h.text();
    expect(t).toContain("追加：直接");
    // 一覧の「追加：直接」を選ぶ。
    const lines = t.split("\n");
    const row = lines.findIndex((l) => l.includes("追加：直接"));
    const col = [...lines[row]!].findIndex((_, i) => lines[row]!.slice(i).startsWith("追加：直接"));
    h.io.type(`\x1b[<0;${col + 1};${row + 1}M\x1b[<0;${col + 1};${row + 1}m`);
    t = await h.text();
    expect(t).toContain("キーの取り込み");
    h.io.type("\x1b\x04"); // ctrl+alt+d
    await vi.waitFor(() => expect(h.patches()).toHaveLength(1));
    const keys = (h.patches()[0] as { keys: { bindings: Record<string, string[]> } }).keys;
    expect(JSON.stringify(keys)).toContain("ctrl+alt+d");
    expect(await h.text()).toContain("ctrl+alt+d を割り当てました");
  });

  it("キー：ほかの操作の割り当てとぶつかったら「こちらへ移す」を訊き、移すと相手から外して割り当てる", async () => {
    const h = await open();
    await h.section(5);
    h.io.type(DOWN + DOWN + DOWN + ENTER); // 2 つ目の操作
    let t = await h.text();
    // 「追加：prefix の後」を押す（変更・削除の行の後）。
    const lines = t.split("\n");
    const row = lines.findIndex((l) => l.includes("追加：prefix の後"));
    const col = [...lines[row]!].findIndex((_, i) =>
      lines[row]!.slice(i).startsWith("追加：prefix"),
    );
    h.io.type(`\x1b[<0;${col + 1};${row + 1}M\x1b[<0;${col + 1};${row + 1}m`);
    h.io.type("?"); // prefix+?（既定は「キー一覧」）
    t = await h.text();
    expect(t).toContain("こちらへ移しますか");
    h.io.type("y");
    expect(h.patches()).toHaveLength(1);
    const keys = JSON.stringify(h.patches()[0]);
    expect(keys).toContain("prefix+?");
    expect(await h.text()).toContain("へ移しました");
  });

  it("マウスで選んだらコピーを切にすると、選んでも写さない", async () => {
    const h = await open();
    await h.esc();
    await h.esc();
    h.app.prefs.apply({ tui: { copyOnSelect: false } }, 0);
    const t = h.app.panes.get("p1")!;
    t.snapshot(35, 27, "copy me");
    await t.flush();
    h.app.renderNow();
    h.io.type("\x1b[<0;28;3M\x1b[<32;32;3M\x1b[<0;32;3m");
    expect(h.app.mouse.selection).not.toBeNull();
    expect(h.io.output()).not.toContain("\x1b]52;");
  });

  it("キー：すべて既定に戻すは確認を挟む（開いたときは「やめる」）。既定に戻すと keys は null", async () => {
    const h = await open();
    h.app.prefs.apply({ keys: { prefix: "ctrl+a" } }, 0);
    await h.section(5);
    const items = await h.text();
    expect(items).toContain("ctrl+a");
    for (let i = 0; i < 200; i++) h.io.type("\x1b[F"); // End
    h.io.type(ENTER);
    expect(await h.text()).toContain("取り消せ");
    h.io.type(ENTER); // やめる
    expect(h.patches()).toEqual([]);
    h.io.type(ENTER + "y");
    expect(h.patches()).toEqual([{ keys: null }]);
    await vi.waitFor(async () =>
      expect(await h.text()).toContain("すべての割り当てと prefix を既定へ戻しました"),
    );
    expect((h.app as unknown as { keymap: { prefix: string } }).keymap.prefix).toBe("ctrl+b");
  });

  it("エージェント連携：開いたときに状態を読み、押すと導入の RPC。結果を知らせる", async () => {
    const h = await open();
    await vi.waitFor(() => expect(h.ws.requests("agent_integration.status")).toHaveLength(1));
    await h.section(4);
    const t = await h.text();
    expect(t).toContain("未導入");
    expect(t).toContain("導入済み（コマンドが見つかりません）");
    h.io.type(ENTER);
    expect(h.ws.requests("agent_integration.install").map((r) => r.params)).toEqual([
      { kind: "claude" },
    ]);
    await vi.waitFor(async () => expect(await h.text()).toContain("Claude Code：入れました"));
  });

  // 20261004-subagent-display。導入済みで足りないフックがあれば「更新が必要」と、押すと足す項目（解除とは別の項目）。
  it("エージェント連携：needsUpdate なら「更新が必要」と更新の項目を出し、押すと install の RPC（解除ではない）。足りていれば出さない", async () => {
    const h = await open({
      respond: {
        "agent_integration.status": {
          autoResumeEnabled: true,
          agents: {
            claude: { cliDetected: true, installed: true, needsUpdate: true },
            codex: { cliDetected: true, installed: true },
          },
        },
      },
    });
    await vi.waitFor(() => expect(h.ws.requests("agent_integration.status")).toHaveLength(1));
    await h.section(4);
    const t = await h.text();
    expect(t).toContain("導入済み（更新が必要）");
    expect(t).toContain("Claude Codeのフックを更新");
    expect(t).not.toContain("Codexのフックを更新");
    h.io.type("j"); // 更新の項目へ（Claude Code の次）
    h.io.type(ENTER);
    expect(h.ws.requests("agent_integration.install").map((r) => r.params)).toEqual([
      { kind: "claude" },
    ]);
    expect(h.ws.requests("agent_integration.uninstall")).toEqual([]);
    await vi.waitFor(async () => expect(await h.text()).toContain("Claude Code：更新しました"));
  });

  it("エージェント連携：Claude Code は 6 つのフックを入れる説明（サブエージェントの表示に使う）。ほかは 1 つ", async () => {
    const h = await open();
    await vi.waitFor(() => expect(h.ws.requests("agent_integration.status")).toHaveLength(1));
    await h.section(4);
    await vi.waitFor(async () => expect(await h.text()).toContain("未導入"));
    const t = await h.text();
    expect(t).toContain("フックを 6 つ入れます");
    expect(t).toContain("サブエージェントの表示");
  });

  it("状態を記号でも示すを切にすると、サイドバーの記号は色の点になる", async () => {
    const snap = snapshot({
      panes: [
        pane("p1", "t1"),
        pane("p2", "t1"),
        pane("p3", "t2", { agent: agent({ state: "working", label: "Claude" }) }),
      ],
    });
    const h = await open({ snapshot: snap });
    await h.esc();
    await h.esc();
    let t = await h.text();
    expect(t).toContain("◐ w2 t2");
    h.app.prefs.apply({ statusSymbols: false }, 7);
    t = await h.text();
    expect(t).toContain("● w2 t2");
    expect(t).not.toContain("◐");
  });
});

describe("SettingsWriter（手元で先に重ね、返事で外す）", () => {
  const deferred = () => {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const p = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { p, resolve, reject };
  };

  it("保存できなければ元に戻して知らせる。続けて変えたら古い返事で新しい値を消さない", async () => {
    const prefs = new PrefsModel();
    prefs.apply({ statusSymbols: true }, 1);
    const calls: ReturnType<typeof deferred>[] = [];
    const toasts: string[] = [];
    const w = new SettingsWriter({
      prefs,
      conn: {
        request: (() => {
          const d = deferred();
          calls.push(d);
          return d.p;
        }) as never,
      },
      toast: (m) => toasts.push(m),
      setLocal: () => undefined,
    });
    w.setShared({ statusSymbols: false });
    expect(prefs.statusSymbols).toBe(false);
    calls[0]!.reject(new Error("closed"));
    await Promise.resolve();
    await Promise.resolve();
    expect(prefs.statusSymbols).toBe(true);
    expect(toasts).toEqual(["設定を保存できませんでした"]);

    w.setShared({ statusSymbols: false });
    w.setShared({ statusSymbols: true });
    // 1 つ目の返事（rev 2 で false）が先に来ても、2 つ目の変更（true）は重ねたまま。
    calls[1]!.resolve({ prefs: { statusSymbols: false }, rev: 2 });
    await Promise.resolve();
    await Promise.resolve();
    expect(prefs.statusSymbols).toBe(true);
    calls[2]!.resolve({ prefs: { statusSymbols: true }, rev: 3 });
    await Promise.resolve();
    await Promise.resolve();
    expect(prefs.statusSymbols).toBe(true);
    expect(prefs.rev).toBe(3);
  });
});

describe("設定画面の点検の指摘（05 T1）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  function writer(prefs: PrefsModel, fail: (patch: Record<string, unknown>) => unknown) {
    const sent: Record<string, unknown>[] = [];
    const toasts: string[] = [];
    const w = new SettingsWriter({
      prefs,
      conn: {
        request: ((_m: string, p: { patch: Record<string, unknown> }) => {
          sent.push(p.patch);
          const err = fail(p.patch);
          return err
            ? Promise.reject(err)
            : Promise.resolve({ prefs: p.patch, rev: prefs.rev + 1 });
        }) as never,
      },
      toast: (m) => toasts.push(m),
      setLocal: () => undefined,
    });
    return { w, sent, toasts };
  }

  it("大きすぎて受け付けられない変更は、この画面の中だけで効かせたまま 1 回だけ知らせる（D10）", async () => {
    const prefs = new PrefsModel();
    prefs.apply({}, 1);
    const { w, toasts } = writer(prefs, () =>
      Object.assign(new Error("too large"), { code: "invalid_params" }),
    );
    w.setShared({ statusSymbols: false });
    await flush();
    expect(prefs.statusSymbols).toBe(false);
    w.setShared({ paneGaps: false });
    await flush();
    expect(toasts).toEqual([
      "設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）",
    ]);
  });

  it("tui の項目は、サーバが受け付けた tui に今回の項目（と返事待ちの項目）だけを重ねて送る。失敗した項目は乗せない", async () => {
    const prefs = new PrefsModel();
    prefs.apply({ tui: { narrowThreshold: 50 } }, 1);
    let failNext = true;
    const { w, sent } = writer(prefs, () => {
      if (!failNext) return null;
      failNext = false;
      return new Error("closed");
    });
    w.setTui("mouseCapture", false);
    await flush();
    expect(prefs.mouseCapture).toBe(true); // 戻った
    w.setTui("copyOnSelect", false);
    await flush();
    expect(sent[1]).toEqual({ tui: { narrowThreshold: 50, copyOnSelect: false } });
  });

  it("この画面だけで効かせている tui の項目（大きすぎて保存できなかった）も、ほかの項目の要求に乗せない", async () => {
    const prefs = new PrefsModel();
    prefs.apply({ tui: { narrowThreshold: 50 } }, 1);
    let first = true;
    const { w, sent } = writer(prefs, () => {
      if (!first) return null;
      first = false;
      return Object.assign(new Error("too large"), { code: "invalid_params" });
    });
    w.setTui("mouseCapture", false);
    await flush();
    expect(prefs.mouseCapture).toBe(false); // この画面だけで効いている
    w.setTui("copyOnSelect", false);
    expect(sent[1]).toEqual({ tui: { narrowThreshold: 50, copyOnSelect: false } });
  });

  it("数の入力は 10 進の数字だけ（空・0x40・1e2 は通さない）", async () => {
    let rev = 0;
    const h = await startedApp({
      respond: { "prefs.set": (p: { patch: unknown }) => ({ prefs: p.patch, rev: ++rev }) },
    });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.io.type("\x02s");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "settings" }));
    for (let i = 0; i < 6; i++) h.io.type("j");
    h.io.type(ENTER + DOWN + DOWN + DOWN);
    for (const bad of ["", "0x40", "1e2", "+50", "30.0"]) {
      h.io.type(ENTER + "\x15" + bad + ENTER);
    }
    expect(h.ws.requests("prefs.set")).toEqual([]);
  });

  it("独自コマンドがあれば一覧に出し、その割り当てとぶつかるキーは「こちらへ移す」を訊く。prefix の「既定に戻す」は上書きしているときだけ", async () => {
    let rev = 0;
    const h = await startedApp({
      respond: {
        "command.list": {
          commands: [{ id: "deploy", type: "shell", description: "デプロイ" }],
          problem: null,
        },
        "prefs.set": (p: { patch: unknown }) => ({ prefs: p.patch, rev: ++rev }),
      },
    });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("command.list")).toHaveLength(1));
    // 案内済み（はじめの案内を出さない）。
    h.app.prefs.apply({ keys: { commands: { deploy: ["ctrl+alt+d"] } }, onboarding: false }, 0);
    const km = () =>
      (h.app as unknown as { keymap: { bindingsOf(id: string): readonly string[] } }).keymap;
    await vi.waitFor(() => expect(km().bindingsOf("command:deploy")).toEqual(["ctrl+alt+d"]));
    h.io.type("\x02s");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "settings" }));
    for (let i = 0; i < 5; i++) h.io.type("j");
    h.io.type(ENTER + "\x1b[F"); // 末尾へ（独自コマンドの群は操作の後）
    h.app.renderNow();
    let t = await h.screen();
    expect(t).toContain("デプロイ");
    expect(t).not.toContain("独自コマンドはありません");
    // prefix の行：上書きが無いので「既定に戻す」は無い。
    h.io.type("\x1b[H" + ENTER);
    h.app.renderNow();
    t = await h.screen();
    expect(t).toContain("変更（次に押したキー）");
    expect(t).not.toContain("既定に戻す");
    h.io.type(ESC + "[B"); // 一覧を閉じる前に Esc だけ送ると確定待ちになるので、矢印と組にして送る
    await new Promise((r) => setTimeout(r, 40));
    h.io.type(ESC);
    await new Promise((r) => setTimeout(r, 40));
    // 2 つ目の操作に直接 ctrl+alt+d を足そうとすると、独自コマンドとぶつかる。
    h.io.type(DOWN + DOWN + ENTER);
    h.app.renderNow();
    t = await h.screen();
    const lines = t.split("\n");
    const row = lines.findIndex((l) => l.includes("追加：直接"));
    const col = [...lines[row]!].findIndex((_, i) => lines[row]!.slice(i).startsWith("追加：直接"));
    h.io.type(`\x1b[<0;${col + 1};${row + 1}M\x1b[<0;${col + 1};${row + 1}m`);
    h.io.type("\x1b\x04");
    h.app.renderNow();
    expect(await h.screen()).toContain("こちらへ移しますか");
  });
});

describe("設定画面：色の上書き・サイドバーの行（05 の T2）", () => {
  const closers: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const c of closers.splice(0)) await c();
  });
  async function open() {
    let stored: Record<string, unknown> = {};
    let rev = 0;
    const h = await startedApp({
      respond: {
        "prefs.set": (p: { patch: Record<string, unknown> }) => {
          stored = { ...stored, ...p.patch };
          return { prefs: stored, rev: ++rev };
        },
      },
    });
    closers.push(h.close);
    await vi.waitFor(() => expect(h.ws.requests("client.view")).toHaveLength(1));
    h.io.type("\x02s");
    await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ kind: "settings" }));
    const patches = () =>
      h.ws.requests("prefs.set").map((r) => (r.params as { patch: unknown }).patch);
    const text = async () => {
      h.app.renderNow();
      return h.screen();
    };
    return { ...h, patches, text };
  }

  it("色の上書き（暗いとき）：読める色は保存して画面に効き、読めない色は理由を出す。空で外す", async () => {
    const h = await open();
    h.io.type("j" + ENTER); // テーマの節
    // テーマ・明暗・いま使っている・（見出し）明るいとき 19・（見出し）暗いとき の「強調の色」まで。
    const steps = 3 + CSS_VARS.length + CSS_VARS.indexOf("--soda-accent");
    for (let i = 0; i < steps; i++) h.io.type(DOWN);
    expect(await h.text()).toContain("強調の色");
    h.io.type(ENTER + "var(--x)" + ENTER);
    expect(await h.text()).toContain("は色として読めません");
    expect(h.patches()).toEqual([]);
    h.io.type(ENTER + "#ff0000" + ENTER);
    expect(h.patches()).toEqual([{ themeOverrides: { dark: { "--soda-accent": "#ff0000" } } }]);
    await vi.waitFor(() =>
      expect((h.app as unknown as { theme: ThemeColors }).theme.ui("--soda-accent")).toBe(
        rgbColor(255, 0, 0),
      ),
    );
    h.io.type(ENTER + "\x15" + ENTER);
    expect(h.patches()[1]).toEqual({ themeOverrides: null });
  });

  it("サイドバーの行：行を足し、トークンを足すと sidebarRows を丸ごと送る。既定に戻すは確認を挟む", async () => {
    const h = await open();
    h.io.type("jj" + ENTER); // 表示の節
    h.io.type("\x1b[F"); // 末尾（agents の最後の行）
    let t = await h.text();
    expect(t).toContain("spaces の行（workspace）");
    const lines = t.split("\n");
    const row = lines.findIndex((l) => l.includes("spaces の行（workspace）"));
    const col = [...lines[row]!].findIndex((_, i) =>
      lines[row]!.slice(i).startsWith("spaces の行"),
    );
    h.io.type(`\x1b[<0;${col + 1};${row + 1}M\x1b[<0;${col + 1};${row + 1}m`);
    h.io.type(ENTER); // 行を足す
    expect(h.patches()).toEqual([
      {
        sidebarRows: {
          spaces: [[{ token: "state_icon" }, { token: "workspace" }], [{ token: "git" }], []],
        },
      },
    ]);
    t = await h.text();
    expect(t).toContain("3 行目");
    // 3 行目にブランチを足す。
    const l2 = t.split("\n");
    const r3 = l2.findIndex((l) => l.includes("3 行目"));
    const c3 = [...l2[r3]!].findIndex((_, i) => l2[r3]!.slice(i).startsWith("3 行目"));
    h.io.type(`\x1b[<0;${c3 + 1};${r3 + 1}M\x1b[<0;${c3 + 1};${r3 + 1}m`);
    h.io.type(ENTER); // トークンを足す（空の行なので先頭）
    for (let i = 0; i < 3; i++) h.io.type(DOWN); // state_icon・state_text・workspace・branch
    h.io.type(ENTER);
    expect(h.patches()[1]).toEqual({
      sidebarRows: {
        spaces: [
          [{ token: "state_icon" }, { token: "workspace" }],
          [{ token: "git" }],
          [{ token: "branch" }],
        ],
      },
    });
  });
});
