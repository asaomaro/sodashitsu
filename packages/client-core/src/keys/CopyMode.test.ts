import { beforeEach, describe, expect, it } from "vitest";
import type { KeyInput } from "./actions.js";
import { CopyMode } from "./CopyMode.js";

function key(k: string, opts: Partial<KeyInput> = {}): KeyInput {
  return { key: k, code: "", ctrl: false, alt: false, shift: false, meta: false, type: "keydown", composing: false, ...opts };
}

describe("CopyMode", () => {
  let mode: CopyMode;
  beforeEach(() => {
    mode = new CopyMode();
  });

  it("移動: h/j/k/l は文字/行単位（留まる）", () => {
    expect(mode.handle(key("h"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "char", dir: -1 } } });
    expect(mode.handle(key("l"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "char", dir: 1 } } });
    expect(mode.handle(key("j"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "line", dir: 1 } } });
    expect(mode.handle(key("k"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "line", dir: -1 } } });
  });

  it("移動: w/b/e と W/B/E（単語・WORD）", () => {
    expect(mode.handle(key("w"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "word", dir: 1 } } });
    expect(mode.handle(key("b"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "word", dir: -1 } } });
    expect(mode.handle(key("e"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "wordEnd", dir: 1 } } });
    expect(mode.handle(key("W"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "WORD", dir: 1 } } });
    expect(mode.handle(key("B"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "WORD", dir: -1 } } });
    expect(mode.handle(key("E"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "WORDEnd", dir: 1 } } });
  });

  it("移動: 段落・ページ・半ページ", () => {
    expect(mode.handle(key("{"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "paragraph", dir: -1 } } });
    expect(mode.handle(key("}"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "paragraph", dir: 1 } } });
    expect(mode.handle(key("PageUp"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "page", dir: -1 } } });
    expect(mode.handle(key("PageDown"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "page", dir: 1 } } });
    expect(mode.handle(key("f", { ctrl: true }))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "page", dir: 1 } } });
    expect(mode.handle(key("u", { ctrl: true }))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "halfPage", dir: -1 } } });
    expect(mode.handle(key("d", { ctrl: true }))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "halfPage", dir: 1 } } });
  });

  it("Ctrl+B は copy モード自身には割り当てない（KeyRouter が prefix として横取りする。D63）", () => {
    expect(mode.handle(key("b", { ctrl: true }))).toEqual({});
  });

  it("検索: / ? はそれぞれ独立に searchStart を返す（別インスタンスで確認——同一インスタンスで連続して押すと" + "2 打目は検索語の入力として扱われる。下の describe を参照）", () => {
    expect(mode.handle(key("/"))).toEqual({ action: { type: "copy", cmd: { op: "searchStart", dir: 1 } } });
  });

  it("検索: ? は単独で searchStart（dir: -1）を返す", () => {
    expect(mode.handle(key("?"))).toEqual({ action: { type: "copy", cmd: { op: "searchStart", dir: -1 } } });
  });

  it("検索の繰り返し: n/N（検索語の入力中でなければ通常の移動系キーと同じ扱い）", () => {
    expect(mode.handle(key("n"))).toEqual({ action: { type: "copy", cmd: { op: "searchNext", reverse: false } } });
    expect(mode.handle(key("N"))).toEqual({ action: { type: "copy", cmd: { op: "searchNext", reverse: true } } });
  });

  it("選択: v・Space は文字単位、V は行単位（留まる）", () => {
    expect(mode.handle(key("v"))).toEqual({ action: { type: "copy", cmd: { op: "selectStart", linewise: false } } });
    expect(mode.handle(key(" "))).toEqual({ action: { type: "copy", cmd: { op: "selectStart", linewise: false } } });
    expect(mode.handle(key("V"))).toEqual({ action: { type: "copy", cmd: { op: "selectStart", linewise: true } } });
  });

  it("y・Enter は yank で、常に抜ける", () => {
    expect(mode.handle(key("y"))).toEqual({ action: { type: "copy", cmd: { op: "yank" } }, exit: true });
    expect(mode.handle(key("Enter"))).toEqual({ action: { type: "copy", cmd: { op: "yank" } }, exit: true });
  });

  it("q は exit で、常に抜ける", () => {
    expect(mode.handle(key("q"))).toEqual({ action: { type: "copy", cmd: { op: "exit" } }, exit: true });
  });

  it("Esc は clearOrExit を返すだけで、KeyRouter 側では抜けたと判断しない（D63）", () => {
    const result = mode.handle(key("Escape"));
    expect(result).toEqual({ action: { type: "copy", cmd: { op: "clearOrExit" } } });
    expect(result.exit).toBeUndefined();
  });

  it("割り当ての無いキーは何もしない（留まる）", () => {
    expect(mode.handle(key("z"))).toEqual({});
  });
});

describe("CopyMode — 検索語の入力（D93。`/`・`?` の直後は続くキーを検索語として集める）", () => {
  let mode: CopyMode;
  beforeEach(() => {
    mode = new CopyMode();
  });

  it("/ の直後に文字を打つと、copy モードの移動キーとして解釈されず検索語として集まり、Enter で searchInput を返す", () => {
    expect(mode.handle(key("/"))).toEqual({ action: { type: "copy", cmd: { op: "searchStart", dir: 1 } } });
    // "beta" の各文字は copy モードでは移動系のキー（b・e 等）に割り当てられているが、
    // 検索語の入力中はそちらへ解釈されない（修正前の不具合そのもの）。
    expect(mode.handle(key("b"))).toEqual({});
    expect(mode.handle(key("e"))).toEqual({});
    expect(mode.handle(key("t"))).toEqual({});
    expect(mode.handle(key("a"))).toEqual({});
    expect(mode.handle(key("Enter"))).toEqual({ action: { type: "copy", cmd: { op: "searchInput", text: "beta" } } });
  });

  it("Backspace で 1 文字消せる", () => {
    mode.handle(key("/"));
    mode.handle(key("a"));
    mode.handle(key("b"));
    mode.handle(key("c"));
    expect(mode.handle(key("Backspace"))).toEqual({});
    expect(mode.handle(key("Enter"))).toEqual({ action: { type: "copy", cmd: { op: "searchInput", text: "ab" } } });
  });

  it("Escape で検索語の入力を取り消す（copy モード自体からは抜けない・action を返さない）", () => {
    mode.handle(key("/"));
    mode.handle(key("x"));
    const result = mode.handle(key("Escape"));
    expect(result).toEqual({});
    // 取り消した後は通常の copy モードのキーとして解釈される（検索語の続きとして食われない）。
    expect(mode.handle(key("h"))).toEqual({ action: { type: "copy", cmd: { op: "move", unit: "char", dir: -1 } } });
  });

  it("空のまま Enter を押しても何もしない（既定の検索語で誤検索しない）", () => {
    mode.handle(key("/"));
    expect(mode.handle(key("Enter"))).toEqual({});
  });

  it("検索語の入力中に Ctrl 等の修飾付きキーは無視する（暴発防止）", () => {
    mode.handle(key("/"));
    expect(mode.handle(key("c", { ctrl: true }))).toEqual({});
    expect(mode.handle(key("Enter"))).toEqual({}); // 何も集まっていない
  });

  it("? で始めた検索も同じ経路で検索語を集める（逆方向）", () => {
    expect(mode.handle(key("?"))).toEqual({ action: { type: "copy", cmd: { op: "searchStart", dir: -1 } } });
    mode.handle(key("x"));
    expect(mode.handle(key("Enter"))).toEqual({ action: { type: "copy", cmd: { op: "searchInput", text: "x" } } });
  });
});
