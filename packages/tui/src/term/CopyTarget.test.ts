import { afterEach, describe, expect, it } from "vitest";
import { PaneTerminal } from "./PaneTerminal.js";
import { TuiCopyTarget } from "./CopyTarget.js";

const terms: PaneTerminal[] = [];
async function withText(
  text: string,
  cols = 20,
  rows = 4,
): Promise<{ t: PaneTerminal; c: TuiCopyTarget }> {
  const t = new PaneTerminal("p", cols, rows, 100);
  terms.push(t);
  t.output(new TextEncoder().encode(text));
  await t.flush();
  return { t, c: new TuiCopyTarget(t.term) };
}

describe("TuiCopyTarget（copy モード。AC7）", () => {
  afterEach(() => {
    for (const t of terms.splice(0)) t.dispose();
  });

  it("カーソルは今の端末のカーソルから。v で選び、移動して y でその範囲の文字を返して抜ける", async () => {
    const { c } = await withText("hello world\r\nsecond line");
    expect(c.cursor).toEqual({ row: 1, col: 11 });
    c.apply({ op: "move", unit: "line", dir: -1 });
    c.apply({ op: "move", unit: "lineStart", dir: 1 });
    c.apply({ op: "selectStart", linewise: false });
    for (let i = 0; i < 4; i++) c.apply({ op: "move", unit: "char", dir: 1 });
    expect(c.selection()).toEqual({
      from: { row: 0, col: 0 },
      to: { row: 0, col: 4 },
      linewise: false,
    });
    expect(c.apply({ op: "yank" })).toEqual({ copiedText: "hello", exited: true });
    expect(c.selection()).toBeNull();
  });

  it("V は行ごと。複数行は改行でつなぐ", async () => {
    const { c } = await withText("aa\r\nbb\r\ncc");
    c.apply({ op: "move", unit: "line", dir: -1 });
    c.apply({ op: "selectStart", linewise: true });
    c.apply({ op: "move", unit: "line", dir: -1 });
    expect(c.apply({ op: "yank" }).copiedText).toBe("aa\nbb");
  });

  it("w・b・e の単語の移動と、Esc は選択を消してから抜ける", async () => {
    const { c } = await withText("foo bar-baz");
    c.apply({ op: "move", unit: "lineStart", dir: 1 });
    c.apply({ op: "move", unit: "word", dir: 1 });
    expect(c.cursor.col).toBe(4);
    c.apply({ op: "move", unit: "wordEnd", dir: 1 });
    expect(c.cursor.col).toBe(6);
    c.apply({ op: "selectStart", linewise: false });
    expect(c.apply({ op: "clearOrExit" })).toEqual({});
    expect(c.apply({ op: "clearOrExit" })).toEqual({ exited: true });
  });

  it("/ の検索（大小無視）と n/N。見つかった所へカーソルを移し、選択は外す", async () => {
    const { c } = await withText("alpha\r\nBeta\r\nalpha beta\r\n");
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "searchStart", dir: 1 });
    c.apply({ op: "searchInput", text: "beta" });
    expect(c.cursor).toEqual({ row: 1, col: 0 });
    c.apply({ op: "searchNext", reverse: false });
    expect(c.cursor).toEqual({ row: 2, col: 6 });
    c.apply({ op: "searchNext", reverse: true });
    expect(c.cursor).toEqual({ row: 1, col: 0 });
  });

  it("画面より上へ動くとスクロールし、抜けると末尾へ戻る", async () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\r\n");
    const { t, c } = await withText(lines, 20, 4);
    const bottomTop = t.term.buffer.active.viewportY;
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    expect(t.term.buffer.active.viewportY).toBe(0);
    c.apply({ op: "exit" });
    expect(t.term.buffer.active.viewportY).toBe(bottomTop);
  });
});
