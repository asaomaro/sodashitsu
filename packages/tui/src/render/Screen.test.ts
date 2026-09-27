import { afterEach, describe, expect, it } from "vitest";
import { OuterTerminal } from "../testing/outerTerminal.js";
import { ATTR, DEFAULT_COLOR, paletteColor, rgbColor } from "./color.js";
import { Grid, Screen } from "./Screen.js";

const outers: OuterTerminal[] = [];
function outer(cols: number, rows: number): OuterTerminal {
  const t = new OuterTerminal(cols, rows);
  outers.push(t);
  return t;
}

function gridOf(lines: string[], w: number, h = lines.length): Grid {
  const g = new Grid(w, h);
  lines.forEach((l, y) => g.text(0, y, l, DEFAULT_COLOR, DEFAULT_COLOR));
  return g;
}

describe("Grid", () => {
  it("全角は右隣を幅 0 にし、右端からはみ出す全角は空白にする", () => {
    const g = new Grid(4, 1);
    g.text(0, 0, "日本語", 0, 0);
    expect(g.cell(0, 0)).toMatchObject({ ch: "日", width: 2 });
    expect(g.cell(1, 0)).toMatchObject({ ch: "", width: 0 });
    expect(g.rowText(0)).toBe("日本");
    const h = new Grid(3, 1);
    h.set(2, 0, "日", 2, 0, 0);
    expect(h.cell(2, 0)).toMatchObject({ ch: " ", width: 1 });
  });

  it("全角の片割れを上書きしたら、もう片方は空白になる（幅 0 は必ず全角の右隣）", () => {
    const g = new Grid(4, 1);
    g.text(0, 0, "日本", 0, 0);
    g.set(1, 0, "x", 1, 0, 0);
    expect(g.rowText(0)).toBe(" x本");
    g.set(2, 0, "y", 1, 0, 0);
    expect(g.rowText(0)).toBe(" xy ");
    for (let x = 0; x < 4; x++)
      if (g.cell(x, 0).width === 0) expect(g.cell(x - 1, 0).width).toBe(2);
  });
});

describe("Screen（差分描画。AC2・AC6）", () => {
  afterEach(() => {
    for (const t of outers.splice(0)) t.dispose();
  });

  it("最初は同期出力で包み、カーソルを隠して全部描き、最後に本物のカーソルを置く", async () => {
    const s = new Screen("truecolor");
    const out = s.frame(gridOf(["hello", "world"], 10), {
      x: 3,
      y: 1,
      visible: true,
      style: "bar",
      blink: false,
    });
    expect(out.startsWith("\x1b[?2026h\x1b[?25l")).toBe(true);
    expect(out).toContain("\x1b[2J");
    expect(out).toContain("\x1b[6 q");
    expect(out.endsWith("\x1b[2;4H\x1b[6 q\x1b[?25h\x1b[?2026l\x1b[2;4H")).toBe(true);
    const t = outer(10, 2);
    await t.write(out);
    expect(t.text()).toBe("hello\nworld");
    expect(t.cursor).toEqual({ x: 3, y: 1 });
  });

  it("2 枚目からは変わったセルだけ（隣の ASCII は CUP を省く）。形が同じなら DECSCUSR を出し直さない", () => {
    const s = new Screen("truecolor", false);
    const cur = { x: 0, y: 0, visible: true, style: "block" as const, blink: true };
    s.frame(gridOf(["hello"], 8), cur);
    const out = s.frame(gridOf(["heLLo"], 8), cur);
    expect(out).not.toContain("\x1b[2J");
    expect(out).toContain("\x1b[1;3H");
    expect(out).toContain("LL");
    expect(out).not.toContain("he");
    for (let n = 0; n <= 6; n++) expect(out).not.toContain(`\x1b[${n} q`);
  });

  it("何も変わらなければセルを書かない", () => {
    const s = new Screen("truecolor", false);
    s.frame(gridOf(["abc"], 5), null);
    const out = s.frame(gridOf(["abc"], 5), null);
    expect(out).toBe("\x1b[?2026h\x1b[?25l\x1b[1;1H\x1b[?2026l");
  });

  it("大きさが変わったら全部描き直す・invalidate の後も", () => {
    const s = new Screen("truecolor", false);
    s.frame(gridOf(["abc"], 5), null);
    expect(s.frame(gridOf(["abc"], 6), null)).toContain("\x1b[2J");
    s.invalidate();
    expect(s.frame(gridOf(["abc"], 6), null)).toContain("\x1b[2J");
  });

  it("色と属性は SGR（truecolor と 256 色）", () => {
    const g = new Grid(3, 1);
    g.set(0, 0, "a", 1, rgbColor(255, 0, 0), paletteColor(4), ATTR.bold | ATTR.underline);
    expect(new Screen("truecolor").frame(g, null)).toContain("\x1b[0;1;4;38;2;255;0;0;48;5;4ma");
    expect(new Screen("256").frame(g, null)).toContain("\x1b[0;1;4;38;5;196;48;5;4ma");
  });

  it("全角・絵文字を含むフレームを続けて描いても、外側の端末の画面が格子と一致する", async () => {
    const W = 12;
    const H = 3;
    const t = outer(W, H);
    const s = new Screen("truecolor", false);
    let seed = 7;
    const rand = (n: number): number => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return (seed >>> 16) % n;
    };
    const pieces = ["a", "b", "日", "本", "👍", " ", "x", "漢"];
    for (let frame = 0; frame < 60; frame++) {
      const g = new Grid(W, H);
      for (let y = 0; y < H; y++) {
        let line = "";
        for (let i = 0; i < 9; i++) line += pieces[rand(pieces.length)];
        g.text(
          rand(3),
          y,
          line,
          rand(2) ? DEFAULT_COLOR : rgbColor(rand(255), 10, 20),
          DEFAULT_COLOR,
        );
      }
      await t.write(s.frame(g, null));
      for (let y = 0; y < H; y++) expect(t.line(y).trimEnd()).toBe(g.rowText(y).trimEnd());
    }
  });
});
