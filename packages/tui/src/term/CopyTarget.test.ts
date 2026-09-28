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

  it("/ の検索（大小無視）と n/N。見つかった所を選んだ状態にし、そのまま y で写せる。Esc はまず選択を消す", async () => {
    const { c } = await withText("alpha\r\nBeta\r\nalpha beta\r\n");
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "searchStart", dir: 1 });
    c.apply({ op: "searchInput", text: "beta" });
    expect(c.selection()).toMatchObject({ from: { row: 1, col: 0 }, to: { row: 1, col: 3 } });
    c.apply({ op: "searchNext", reverse: false });
    expect(c.selection()).toMatchObject({ from: { row: 2, col: 6 }, to: { row: 2, col: 9 } });
    c.apply({ op: "searchNext", reverse: true });
    expect(c.selection()).toMatchObject({ from: { row: 1, col: 0 } });
    expect(c.apply({ op: "clearOrExit" })).toEqual({});
    expect(c.selection()).toBeNull();
    c.apply({ op: "searchNext", reverse: false });
    expect(c.apply({ op: "yank" })).toEqual({ copiedText: "beta", exited: true });
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

  it("全角の行でもセルの列で動き、選んだ範囲と写す文字が合う（04 の点検）", async () => {
    const { c } = await withText("あいうえおXYZ\r\n");
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "move", unit: "lineEnd", dir: 1 });
    expect(c.cursor).toEqual({ row: 0, col: 12 });
    c.apply({ op: "move", unit: "lineStart", dir: -1 });
    c.apply({ op: "move", unit: "char", dir: 1 });
    expect(c.cursor).toEqual({ row: 0, col: 2 }); // 全角 1 文字＝2 セルを 1 歩で
    c.apply({ op: "selectStart", linewise: false });
    c.apply({ op: "move", unit: "char", dir: 1 });
    expect(c.selection()).toEqual({
      from: { row: 0, col: 2 },
      to: { row: 0, col: 5 },
      linewise: false,
    });
    expect(c.selectedText()).toBe("いう");
    c.apply({ op: "searchStart", dir: 1 });
    c.apply({ op: "searchInput", text: "xyz" });
    expect(c.selection()).toMatchObject({ from: { row: 0, col: 10 }, to: { row: 0, col: 12 } });
    expect(c.selectedText()).toBe("XYZ");
  });

  it("上下に動いて全角の右半分に当たったら、その文字の本体（左）へ寄せる（04 の点検）", async () => {
    const { c } = await withText("abcdef\r\nあいう\r\n");
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "move", unit: "lineStart", dir: -1 });
    for (let i = 0; i < 3; i++) c.apply({ op: "move", unit: "char", dir: 1 });
    expect(c.cursor).toEqual({ row: 0, col: 3 });
    c.apply({ op: "move", unit: "line", dir: 1 });
    expect(c.cursor).toEqual({ row: 1, col: 2 }); // 桁 3 は「い」の右半分
  });

  it("折り返しの続きの行へは改行を入れずに写し、検索は折り返しをまたぐ（04 の点検）", async () => {
    const { c } = await withText("0123456789abcdefNEEDLE\r\nzz\r\n", 10, 5);
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "selectStart", linewise: true });
    c.apply({ op: "move", unit: "line", dir: 1 });
    c.apply({ op: "move", unit: "line", dir: 1 });
    expect(c.selectedText()).toBe("0123456789abcdefNEEDLE");
    c.apply({ op: "clearOrExit" });
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "searchStart", dir: 1 });
    c.apply({ op: "searchInput", text: "9abc" });
    expect(c.selection()).toMatchObject({ from: { row: 0, col: 9 }, to: { row: 1, col: 2 } });
    expect(c.selectedText()).toBe("9abc");
  });

  it("選んでいないときの y は何も写さない（空を写して「コピーしました」を出さない）", async () => {
    const { c } = await withText("abc");
    expect(c.apply({ op: "yank" })).toEqual({ exited: true });
  });

  it("スクロールバックの切り詰めに位置が追従する", async () => {
    const t = new PaneTerminal("p", 20, 3, 5);
    terms.push(t);
    t.output(new TextEncoder().encode(Array.from({ length: 8 }, (_, i) => `L${i}`).join("\r\n")));
    await t.flush();
    const c = new TuiCopyTarget(t.term);
    c.apply({ op: "move", unit: "line", dir: -1 });
    c.apply({ op: "selectStart", linewise: true });
    const before = c.selectedText();
    t.output(new TextEncoder().encode("\r\nX1\r\nX2\r\nX3"));
    await t.flush();
    expect(c.selectedText()).toBe(before);
  });

  it("絵文字（サロゲートの組）の後の検索の一致も、その文字を選ぶ（04 ラウンド 2）", async () => {
    const { c } = await withText("x😀😀😀 bar bar\r\n", 30);
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "searchStart", dir: 1 });
    c.apply({ op: "searchInput", text: "bar" });
    expect(c.selection()).toMatchObject({ from: { row: 0, col: 8 }, to: { row: 0, col: 10 } });
    expect(c.selectedText()).toBe("bar");
    c.apply({ op: "searchNext", reverse: false });
    expect(c.selectedText()).toBe("bar");
    expect(c.selection()).toMatchObject({ from: { row: 0, col: 12 } });
  });

  it("行末に入らず次の行へ送った全角の前の空きは写さず、検索でもまたげる（xterm と同じ）", async () => {
    const { c } = await withText("abcdあいz\r\nq", 5, 4);
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "selectStart", linewise: true });
    c.apply({ op: "move", unit: "line", dir: 1 });
    expect(c.selectedText()).toBe("abcdあいz");
    c.apply({ op: "clearOrExit" });
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "searchStart", dir: 1 });
    c.apply({ op: "searchInput", text: "dあ" });
    expect(c.selectedText()).toBe("dあ");
  });

  it("小文字にすると長さの変わる文字（İ）の後の一致もずれない", async () => {
    const { c } = await withText("İİ foo bar\r\n", 20);
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "searchStart", dir: 1 });
    c.apply({ op: "searchInput", text: "BAR" });
    expect(c.selectedText()).toBe("bar");
  });

  it("選び始めの行が切り詰めで消えたら、選択ごと捨てる（無関係な文字を写さない）", async () => {
    const t = new PaneTerminal("p", 20, 3, 2);
    terms.push(t);
    t.output(new TextEncoder().encode(Array.from({ length: 5 }, (_, i) => `L${i}`).join("\r\n")));
    await t.flush();
    const c = new TuiCopyTarget(t.term);
    c.apply({ op: "move", unit: "bufferTop", dir: -1 });
    c.apply({ op: "selectStart", linewise: true });
    expect(c.selectedText()).not.toBe("");
    t.output(new TextEncoder().encode("\r\nX1\r\nX2\r\nX3\r\nX4\r\nX5\r\nX6"));
    await t.flush();
    expect(c.selection()).toBeNull();
    expect(c.apply({ op: "yank" })).toEqual({ exited: true });
  });
});
