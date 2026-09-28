import { afterEach, describe, expect, it, vi } from "vitest";
import { PaneTerminal } from "./PaneTerminal.js";

const enc = new TextEncoder();
const created: PaneTerminal[] = [];
function make(cols = 20, rows = 5, onDirty?: (id: string) => void): PaneTerminal {
  const t = new PaneTerminal("p1", cols, rows, 100, onDirty);
  created.push(t);
  return t;
}
function line(t: PaneTerminal, y: number): string {
  return t.term.buffer.active.getLine(y)?.translateToString(true) ?? "";
}

describe("PaneTerminal（AC6）", () => {
  afterEach(() => {
    for (const t of created.splice(0)) t.dispose();
  });

  it("SNAPSHOT は大きさを合わせ、前の中身を消してから書き直す", async () => {
    const t = make();
    t.output(enc.encode("old text\r\n"));
    await t.flush();
    t.snapshot(30, 6, "hello\r\nworld");
    await t.flush();
    expect([t.cols, t.rows]).toEqual([30, 6]);
    expect(line(t, 0)).toBe("hello");
    expect(line(t, 1)).toBe("world");
  });

  it("OUTPUT を書き、中身が変わったら dirty を 1 回知らせる", async () => {
    const onDirty = vi.fn();
    const t = make(20, 5, onDirty);
    t.dirty = false;
    t.output(enc.encode("abc"));
    t.output(enc.encode("def"));
    await t.flush();
    expect(line(t, 0)).toBe("abcdef");
    expect(t.dirty).toBe(true);
    expect(onDirty).toHaveBeenCalledTimes(1);
  });

  it("カーソルの表示（?25）・形（DECSCUSR）とマウスの符号化（?1006 等）を追い、束ねた Pm も xterm 本体に届く", async () => {
    const t = make();
    t.output(enc.encode("\x1b[?25l\x1b[5 q\x1b[?1002;1006h"));
    await t.flush();
    expect(t.cursorVisible).toBe(false);
    expect(t.cursorStyle).toBe("bar");
    expect(t.cursorBlink).toBe(true);
    expect(t.mouseEncoding).toBe("sgr");
    // 同じ列に束ねた 1002 は xterm 本体でも有効（false を返して委ねている）。
    expect(t.modes.mouseTrackingMode).toBe("drag");
    t.output(enc.encode("\x1b[?25h\x1b[2 q\x1b[?1006l"));
    await t.flush();
    expect(t.cursorVisible).toBe(true);
    expect(t.cursorStyle).toBe("block");
    expect(t.cursorBlink).toBe(false);
    expect(t.mouseEncoding).toBe("default");
  });

  it("SNAPSHOT（RIS）で追っている状態も初期値に戻る", async () => {
    const t = make();
    t.output(enc.encode("\x1b[?25l\x1b[4 q\x1b[?1006h"));
    await t.flush();
    t.snapshot(20, 5, "x");
    await t.flush();
    expect(t.cursorVisible).toBe(true);
    expect(t.cursorStyle).toBe("block");
    expect(t.mouseEncoding).toBe("default");
  });

  it("DECCKM・ブラケットペーストは xterm のモードで読める", async () => {
    const t = make();
    t.output(enc.encode("\x1b[?1h\x1b[?2004h"));
    await t.flush();
    expect(t.modes.applicationCursorKeysMode).toBe(true);
    expect(t.modes.bracketedPasteMode).toBe(true);
  });

  it("unicode11：絵文字・全角は幅 2、右隣は幅 0", async () => {
    const t = make();
    t.output(enc.encode("a👍日"));
    await t.flush();
    const row = t.term.buffer.active.getLine(0)!;
    expect(row.getCell(1)?.getWidth()).toBe(2);
    expect(row.getCell(2)?.getWidth()).toBe(0);
    expect(row.getCell(3)?.getChars()).toBe("日");
    expect(row.getCell(3)?.getWidth()).toBe(2);
  });

  it("捨てた後の書き込みは何もしない", () => {
    const t = make();
    t.dispose();
    expect(() => t.output(enc.encode("x"))).not.toThrow();
    expect(() => t.snapshot(10, 2, "x")).not.toThrow();
  });

  it("DECSTR（CSI ! p）でカーソルの表示・形を初期値へ戻す", async () => {
    const t = make();
    t.output(enc.encode("\x1b[?25l\x1b[5 q"));
    await t.flush();
    t.output(enc.encode("\x1b[!p"));
    await t.flush();
    expect(t.cursorVisible).toBe(true);
    expect(t.cursorStyle).toBe("block");
    expect(t.cursorBlink).toBe(false);
  });

  it("DECSCUSR の 7 以上は無視する（xterm と同じ）", async () => {
    const t = make();
    t.output(enc.encode("\x1b[4 q\x1b[7 q"));
    await t.flush();
    expect(t.cursorStyle).toBe("underline");
    expect(t.cursorBlink).toBe(false);
  });
});

describe("OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2）", () => {
  const e = (x: string) => new TextEncoder().encode(x);
  const link = (uri: string, text: string) => `\x1b]8;;${uri}\x1b\\${text}\x1b]8;;\x1b\\`;
  async function term(cols = 40, rows = 5): Promise<PaneTerminal> {
    const t = new PaneTerminal("p", cols, rows, 100);
    return t;
  }

  it("リンクの中で書いた文字だけ。前後の文字には付かない", async () => {
    const t = await term();
    t.output(e(`ab${link("https://x.example/", "click")} tail`));
    await t.flush();
    expect(t.hyperlinkAt(0, 1)).toBeNull();
    expect(t.hyperlinkAt(0, 2)).toBe("https://x.example/");
    expect(t.hyperlinkAt(0, 6)).toBe("https://x.example/");
    expect(t.hyperlinkAt(0, 7)).toBeNull();
    t.dispose();
  });

  it("上書き（\\r の後の書き直し・画面の消去）で外れる", async () => {
    const t = await term();
    t.output(e(`${link("https://evil.example/y", "progress")}\rDONE!!!!!`));
    await t.flush();
    expect(t.hyperlinkAt(0, 2)).toBeNull();
    t.output(e(`\r\n${link("https://evil.example/x", "click")}\x1b[H\x1b[2Jplain text here`));
    await t.flush();
    const row = t.term.buffer.active.baseY;
    for (let c = 0; c < 15; c++) expect(t.hyperlinkAt(row, c)).toBeNull();
    t.dispose();
  });

  it("代替画面のリンクは通常の画面と別（代替画面の文字に通常の画面のリンクを当てない）", async () => {
    const t = await term();
    t.output(e(`${link("https://evil.example/z", "normal-link")}\r\n`));
    t.output(e("\x1b[?1049h\x1b[Hvim content line"));
    await t.flush();
    expect(t.term.buffer.active.type).toBe("alternate");
    expect(t.hyperlinkAt(0, 2)).toBeNull();
    t.output(e("\x1b[?1049l"));
    await t.flush();
    expect(t.hyperlinkAt(0, 2)).toBe("https://evil.example/z");
    t.dispose();
  });

  it("開いてから閉じるまでにカーソルが動いても、その間に書いていない行には付かない", async () => {
    const t = await term();
    t.output(
      e(
        "aaaa\r\nbbbb\r\ncccc\x1b[1;1H\x1b]8;;https://evil.example/w\x1b\\L\x1b[3;1H\x1b]8;;\x1b\\",
      ),
    );
    await t.flush();
    expect(t.hyperlinkAt(0, 0)).toBe("https://evil.example/w");
    expect(t.hyperlinkAt(1, 2)).toBeNull();
    expect(t.hyperlinkAt(2, 1)).toBeNull();
    t.dispose();
  });

  it("大きさを変えて折り返し直すと、リンクは文字と一緒に動く", async () => {
    const t = await term();
    t.output(e(`${"x".repeat(30)}${link("https://a.example/", "LINKS")}\r\nnext`));
    await t.flush();
    t.resize(20, 5);
    await t.flush();
    const buf = t.term.buffer.active;
    let found: { row: number; col: number } | null = null;
    for (let r = 0; r < buf.length && !found; r++) {
      const text = buf.getLine(r)?.translateToString(true) ?? "";
      const c = text.indexOf("LINKS");
      if (c >= 0) found = { row: r, col: c };
    }
    expect(found).not.toBeNull();
    expect(t.hyperlinkAt(found!.row, found!.col)).toBe("https://a.example/");
    expect(t.hyperlinkAt(found!.row, found!.col - 1)).toBeNull();
    t.dispose();
  });
});
