import { afterEach, describe, expect, it, vi } from "vitest";
import { PrefsModel } from "../model/PrefsModel.js";
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

  it("色の出し方は端末ごと（tui-state）で、共有の設定へは送らない", async () => {
    const h = await open();
    await h.section(6);
    for (let i = 0; i < 5; i++) h.io.type(DOWN);
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
    expect(t).toContain("◐ Claude");
    h.app.prefs.apply({ statusSymbols: false }, 7);
    t = await h.text();
    expect(t).toContain("● Claude");
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
