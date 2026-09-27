import { chordOf } from "@sodashitsu/client-core";
import { describe, expect, it } from "vitest";
import { InputDecoder, type InputEvent } from "./decode.js";

/** キーの事象を chord（client-core の正規形）と元の列の組に。 */
function chords(events: InputEvent[]): [string | null, string][] {
  return events.flatMap((e) =>
    e.kind === "key" ? [[chordOf(e.key), e.raw] as [string | null, string]] : [],
  );
}

function decode(...chunks: string[]): InputEvent[] {
  const d = new InputDecoder();
  return chunks.flatMap((c) => d.feed(new TextEncoder().encode(c)));
}

describe("InputDecoder（キー。AC6・AC8）", () => {
  it("文字・C0（ctrl＋文字）・Enter・Tab・Backspace", () => {
    expect(chords(decode("aZ1\x02\r\t\x7f\x00\x1f"))).toEqual([
      ["a", "a"],
      ["shift+z", "Z"],
      ["1", "1"],
      ["ctrl+b", "\x02"],
      ["enter", "\r"],
      ["tab", "\t"],
      ["backspace", "\x7f"],
      ["ctrl+space", "\x00"],
      ["ctrl+_", "\x1f"],
    ]);
  });

  it("UTF-8 の多バイト文字が読み取りの区切りをまたいでも 1 文字", () => {
    const d = new InputDecoder();
    const bytes = new TextEncoder().encode("日");
    expect(d.feed(bytes.slice(0, 1))).toEqual([]);
    expect(chords(d.feed(bytes.slice(1)))).toEqual([["日", "日"]]);
  });

  it("ESC 前置は Alt（ctrl との組み合わせも）", () => {
    expect(chords(decode("\x1bx\x1b\x02\x1bB"))).toEqual([
      ["alt+x", "\x1bx"],
      ["ctrl+alt+b", "\x1b\x02"],
      ["alt+shift+b", "\x1bB"],
    ]);
  });

  it("CSI・SS3 の矢印・Home/End・機能キーと修飾（CSI 1;m X）", () => {
    expect(
      chords(
        decode(
          "\x1b[A\x1bOB\x1b[1;5C\x1b[1;3D\x1b[H\x1b[F\x1b[3~\x1b[5;2~\x1bOP\x1b[15~\x1b[24;5~\x1b[Z",
        ),
      ),
    ).toEqual([
      ["up", "\x1b[A"],
      ["down", "\x1bOB"],
      ["ctrl+right", "\x1b[1;5C"],
      ["alt+left", "\x1b[1;3D"],
      ["home", "\x1b[H"],
      ["end", "\x1b[F"],
      ["delete", "\x1b[3~"],
      ["shift+pageup", "\x1b[5;2~"],
      ["f1", "\x1bOP"],
      ["f5", "\x1b[15~"],
      ["ctrl+f12", "\x1b[24;5~"],
      ["shift+tab", "\x1b[Z"],
    ]);
  });

  it("modifyOtherKeys（CSI 27;m;code~）と CSI u を通常のキーへ", () => {
    expect(chords(decode("\x1b[27;5;98~\x1b[27;6;66~\x1b[13;2u\x1b[97;5u"))).toEqual([
      ["ctrl+b", "\x1b[27;5;98~"],
      ["ctrl+shift+b", "\x1b[27;6;66~"],
      ["shift+enter", "\x1b[13;2u"],
      ["ctrl+a", "\x1b[97;5u"],
    ]);
  });

  it("列が読み取りの区切りをまたいでも待って 1 つに", () => {
    const d = new InputDecoder();
    expect(d.feed("\x1b[1;")).toEqual([]);
    expect(d.waiting).toBe(true);
    expect(chords(d.feed("5A"))).toEqual([["ctrl+up", "\x1b[1;5A"]]);
    expect(d.waiting).toBe(false);
  });

  it("ESC 単独は時間切れ（flush）で Escape。途中で切れた列は Escape＋残りの文字", () => {
    const d = new InputDecoder();
    expect(d.feed("\x1b")).toEqual([]);
    expect(chords(d.flush())).toEqual([["esc", "\x1b"]]);
    expect(d.feed("\x1b[")).toEqual([]);
    expect(chords(d.flush())).toEqual([
      ["esc", "\x1b"],
      ["[", "["],
    ]);
    expect(chords(decode("\x1b\x1b"))).toEqual([["esc", "\x1b"]]); // 2 つ目は時間切れ待ち
  });

  it("知らない CSI は Unidentified（元の列のまま pane へ）", () => {
    const ev = decode("\x1b[99x");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ kind: "key", key: { key: "Unidentified" }, raw: "\x1b[99x" });
  });
});

describe("InputDecoder（マウス・貼り付け・フォーカス・応答）", () => {
  it("SGR マウス（1006）：押す・離す・ドラッグ・ホイール・修飾。座標は 0 始まり", () => {
    expect(decode("\x1b[<0;10;5M\x1b[<0;10;5m\x1b[<32;11;5M\x1b[<65;3;4M\x1b[<20;1;1M")).toEqual([
      {
        kind: "mouse",
        action: "down",
        button: 0,
        x: 9,
        y: 4,
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      },
      {
        kind: "mouse",
        action: "up",
        button: 0,
        x: 9,
        y: 4,
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      },
      {
        kind: "mouse",
        action: "move",
        button: 0,
        x: 10,
        y: 4,
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      },
      {
        kind: "mouse",
        action: "wheel",
        button: 65,
        x: 2,
        y: 3,
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      },
      {
        kind: "mouse",
        action: "down",
        button: 0,
        x: 0,
        y: 0,
        mods: { shift: true, alt: false, ctrl: true, meta: false },
      },
    ]);
  });

  it("ブラケットペーストは区切りをまたいでも 1 つの貼り付け（中の ESC・改行もそのまま）", () => {
    const d = new InputDecoder();
    expect(d.feed("x\x1b[200~line1\r\n\x1b[A")).toEqual([expect.objectContaining({ kind: "key" })]);
    expect(d.waiting).toBe(false); // ペーストの途中は時間切れで確定しない
    expect(d.feed("tail\x1b[20")).toEqual([]);
    expect(d.feed("1~y")).toEqual([
      { kind: "paste", text: "line1\r\n\x1b[Atail" },
      expect.objectContaining({ kind: "key", raw: "y" }),
    ]);
  });

  it("フォーカス（CSI I/O）", () => {
    expect(decode("\x1b[I\x1b[O")).toEqual([
      { kind: "focus", focused: true },
      { kind: "focus", focused: false },
    ]);
  });

  it("外側の端末の応答（DA・OSC・DCS・DECRPM）は捨てる", () => {
    expect(
      decode(
        "\x1b[?62;22c\x1b]11;rgb:0000/0000/0000\x1b\\\x1b]10;x\x07\x1bP>|xterm\x1b\\\x1b[?2026;2$ya",
      ),
    ).toEqual([expect.objectContaining({ kind: "key", raw: "a" })]);
  });
});
