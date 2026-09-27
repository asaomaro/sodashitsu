import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { RESTORE_SEQUENCE } from "./app/terminalModes.js";
import { runTui } from "./runTui.js";
import { fakeIo, type FakeIo } from "./testing/fakeIo.js";
import { startLocalServer, type LocalServer } from "./testing/localServer.js";
import { OuterTerminal } from "./testing/outerTerminal.js";

/**
 * `runTui` を実物のサーバ（一時の状態ディレクトリ）に繋ぎ、偽の外側の端末（`TuiIo`）の出力を headless に流して画面の文字を確かめる
 * （20260927-cli-mode の 03-tui-core のテスト方針）。
 */
vi.setConfig({ testTimeout: 30_000 });

const COLS = 100;
const ROWS = 30;

/** 端末版の出力を外側の端末（headless）へ流し、画面を読む。 */
function screen(io: FakeIo): { text(): Promise<string>; outer: OuterTerminal } {
  const outer = new OuterTerminal(COLS, ROWS);
  let written = 0;
  return {
    outer,
    text: async () => {
      const out = io.output();
      await outer.write(out.slice(written));
      written = out.length;
      return outer.text();
    },
  };
}

describe("runTui（実サーバ・偽の外側の端末）", () => {
  let local: LocalServer;
  beforeAll(async () => {
    local = await startLocalServer();
  }, 30_000);
  afterAll(async () => {
    await local.close();
  });

  it("サイドバーに workspace 名・pane にコマンドの出力が出て、打鍵が焦点の pane に届き、大きさを申告し、prefix+q で終わってモードが戻る（AC2・AC3・AC6・AC11）", async () => {
    const snap = local.server.session.snapshot();
    const ws = snap.workspaces[0]!;
    const paneId = snap.panes[0]!.id;
    const io = fakeIo({ cols: COLS, rows: ROWS, env: { COLORTERM: "truecolor" } });
    const s = screen(io);
    const running = runTui(local.target, io);
    try {
      await vi.waitFor(async () => expect(await s.text()).toContain(ws.label), { timeout: 15_000 });
      // 自分の割り付けの大きさ（サイドバー 26・枠の罫線 1）を申告し、サイズ権限を取って PTY がその大きさになる。
      await vi.waitFor(
        () =>
          expect(local.server.session.getPane(paneId)).toMatchObject({
            cols: COLS - 26 - 2,
            rows: ROWS - 1 - 2,
          }),
        {
          timeout: 15_000,
        },
      );
      const marker = `TUI_${Date.now()}`;
      io.type(`echo ${marker}\r`);
      await vi.waitFor(
        async () => {
          const lines = (await s.text()).split("\n");
          // コマンドを打った行ではなく、実行された結果の行（枠の中で marker だけの行）。
          expect(
            lines.some(
              (l) => /│\s*TUI_\d+\s*│?$/.test(l) && l.includes(marker) && !l.includes("echo"),
            ),
          ).toBe(true);
        },
        { timeout: 15_000 },
      );
      // pane の中で見た端末の大きさが申告した大きさ（stty size は「行 列」）。
      io.type("stty size\r");
      await vi.waitFor(async () => expect(await s.text()).toContain(`${ROWS - 3} ${COLS - 28}`), {
        timeout: 15_000,
      });

      io.type("\x02q");
      expect(await running).toBe(0);
      expect(io.output().endsWith(RESTORE_SEQUENCE)).toBe(true);
      expect(io.rawMode).toBe(false);
      expect(io.listenerCount()).toBe(0);
      // 切り離してもサーバと pane は動き続ける。
      expect(local.server.session.getPane(paneId)).toBeDefined();
    } finally {
      s.outer.dispose();
      io.signal("SIGTERM");
      await running;
    }
  });

  it("もう一度開くと同じ画面（スクロールバックの SNAPSHOT）が戻る。SIGHUP でも終わってモードが戻る（AC3）", async () => {
    const io = fakeIo({ cols: COLS, rows: ROWS });
    const s = screen(io);
    const running = runTui(local.target, io);
    try {
      await vi.waitFor(async () => expect(await s.text()).toMatch(/TUI_\d+/), { timeout: 15_000 });
      io.signal("SIGHUP");
      expect(await running).toBe(0);
      expect(io.output().endsWith(RESTORE_SEQUENCE)).toBe(true);
    } finally {
      s.outer.dispose();
    }
  });

  it("prefix+l で右の pane へ焦点が移り、以後の打鍵はその pane へ（focus_pane_right）", async () => {
    const first = local.server.session.snapshot().panes[0]!.id;
    const { pane: right } = await local.server.session.splitPane(first, "right", undefined);
    local.server.session.focusPane(first);
    const io = fakeIo({ cols: COLS, rows: ROWS });
    const s = screen(io);
    const running = runTui(local.target, io);
    try {
      // 焦点は分割の元（サーバの焦点）。左右の 2 つの枠が描かれるまで待つ。
      await vi.waitFor(
        async () => expect((await s.text()).split("\n")[1]!.match(/┌/g)).toHaveLength(2),
        { timeout: 15_000 },
      );
      io.type("\x02l");
      await vi.waitFor(() => expect(local.server.session.snapshot().focus?.paneId).toBe(right.id), {
        timeout: 10_000,
      });
      const marker = `RIGHT_${Date.now()}`;
      io.type(`echo ${marker}\r`);
      // 結果の行は右の pane の中（サイドバー 26 桁＋左の pane 37 桁より右）に出る。
      await vi.waitFor(
        async () => {
          const lines = (await s.text()).split("\n");
          expect(lines.some((l) => l.indexOf(marker) > 26 + 37 && !l.includes("echo"))).toBe(true);
        },
        { timeout: 15_000 },
      );
      io.type("\x02q");
      expect(await running).toBe(0);
    } finally {
      s.outer.dispose();
      io.signal("SIGTERM");
      await running;
    }
  });
});
