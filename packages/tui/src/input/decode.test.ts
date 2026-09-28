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
    expect(d.feed("\x1b[1")).toEqual([]);
    expect(chords(d.flush())).toEqual([
      ["esc", "\x1b"],
      ["[", "["],
      ["1", "1"],
    ]);
    expect(decode("\x1b\x1b")).toEqual([]); // 続き（ESC ESC [ A 等）を時間切れまで待つ
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

  it("外側の端末の応答（DA・OSC・DCS・DECRPM）は捨てる。背景色の応答（OSC 11）だけは明暗として読む", () => {
    expect(
      decode(
        "\x1b[?62;22c\x1b]11;rgb:0000/0000/0000\x1b\\\x1b]10;x\x07\x1bP>|xterm\x1b\\\x1b[?2026;2$ya",
      ),
    ).toEqual([
      { kind: "colorScheme", dark: true },
      expect.objectContaining({ kind: "key", raw: "a" }),
    ]);
  });

  it("明暗：OSC 11 の背景色（1〜4 桁の 16 進）と CSI ? 997 ; 1|2 n（?2031 の知らせ）", () => {
    expect(decode("\x1b]11;rgb:ffff/ffff/ffff\x07")).toEqual([
      { kind: "colorScheme", dark: false },
    ]);
    expect(decode("\x1b]11;rgb:1e/1f/29\x1b\\")).toEqual([{ kind: "colorScheme", dark: true }]);
    expect(decode("\x1b]11;rgba:f/f/f/f\x07")).toEqual([{ kind: "colorScheme", dark: false }]);
    expect(decode("\x1b[?997;2n\x1b[?997;1n")).toEqual([
      { kind: "colorScheme", dark: false },
      { kind: "colorScheme", dark: true },
    ]);
    expect(decode("\x1b]11;?\x07")).toEqual([]);
  });
});

describe("InputDecoder（03 の点検の指摘）", () => {
  it("ESC ESC は Ctrl+Alt+[（＝Alt+Esc）。同じ読みでも時間切れでも。ESC ESC [ A は Alt+↑", () => {
    expect(chords(decode("\x1b\x1bx"))).toEqual([
      ["ctrl+alt+[", "\x1b\x1b"],
      ["x", "x"],
    ]);
    const d = new InputDecoder();
    expect(d.feed("\x1b\x1b")).toEqual([]);
    expect(chords(d.flush())).toEqual([["ctrl+alt+[", "\x1b\x1b"]]);
    expect(chords(decode("\x1b\x1b[A"))).toEqual([["alt+up", "\x1b\x1b[A"]]);
  });

  it("Alt+] / Alt+P / Alt+_ / Alt+^ は待たずに打鍵として届き、続く文字（Ctrl+G を含む）も消えない", () => {
    for (const c of ["]", "P", "_", "^"]) {
      const d = new InputDecoder();
      expect(chords(d.feed(`\x1b${c}`)).map((x) => x[1])).toEqual([`\x1b${c}`]);
      expect(d.waiting).toBe(false);
    }
    expect(chords(decode("\x1b]ab"))).toEqual([
      ["alt+]", "\x1b]"],
      ["a", "a"],
      ["b", "b"],
    ]);
    // 読みが分かれた Alt+] と Ctrl+G、同じ読みの中の Alt+] Ctrl+G（数字の無い OSC は形が正しくない）。
    expect(chords(decode("\x1b]", "\x07"))).toEqual([
      ["alt+]", "\x1b]"],
      ["ctrl+g", "\x07"],
    ]);
    expect(chords(decode("\x1b]\x07"))).toEqual([
      ["alt+]", "\x1b]"],
      ["ctrl+g", "\x07"],
    ]);
    // 同じ読みで完結しない OSC は打鍵として出す（待たない）。
    expect(chords(decode("\x1b]11;x")).map((x) => x[1])).toEqual(["\x1b]", "1", "1", ";", "x"]);
  });

  it("修飾つきの SS3（ESC O 5 P・ESC O 1;5 P）とキーパッド（DECKPAM の ESC O p 等）", () => {
    expect(chords(decode("\x1bO5P\x1bO1;2Q\x1bOq\x1bOM"))).toEqual([
      ["ctrl+f1", "\x1bO5P"],
      ["shift+f2", "\x1bO1;2Q"],
      ["1", "\x1bOq"],
      ["enter", "\x1bOM"],
    ]);
  });

  it("CSI・SS3 の途中は長く待つ（マウスの列が割れても崩さない）。ESC 単独は短く", () => {
    const d = new InputDecoder();
    d.feed("\x1b");
    expect(d.waitMs).toBe(25);
    d.feed("[<0;1");
    expect(d.waitMs).toBe(150);
    expect(d.feed("0;5M")).toEqual([expect.objectContaining({ kind: "mouse", x: 9, y: 4 })]);
  });

  it("CSI u の Shift＋英字は大文字のキー", () => {
    const ev = decode("\x1b[97;2u")[0];
    expect(ev).toMatchObject({ kind: "key", key: { key: "A", shift: true } });
  });
});

describe("InputDecoder（03 ラウンド 2 の指摘）", () => {
  it("Esc の直後のマウス・フォーカス・貼り付け・応答は、Esc を単独で出してから事象をそのまま読む", () => {
    const esc: [string | null, string] = ["esc", "\x1b"];
    const mouse = decode("\x1b", "\x1b[<0;5;5M");
    expect(chords(mouse)).toEqual([esc]);
    expect(mouse[1]).toMatchObject({ kind: "mouse", action: "down", x: 4, y: 4 });
    const focus = decode("\x1b", "\x1b[I");
    expect(chords(focus)).toEqual([esc]);
    expect(focus[1]).toEqual({ kind: "focus", focused: true });
    const paste = decode("\x1b", "\x1b[200~hi\x02x\x1b[201~");
    expect(chords(paste)).toEqual([esc]);
    expect(paste[1]).toEqual({ kind: "paste", text: "hi\x02x" });
    // 貼り付けの始まりが読みで割れても。
    const d = new InputDecoder();
    const split = [...d.feed("\x1b\x1b[20"), ...d.feed("0~ok\x1b[201~")];
    expect(split).toEqual([
      expect.objectContaining({ kind: "key", raw: "\x1b" }),
      { kind: "paste", text: "ok" },
    ]);
    // キーの列は Alt＋キーにまとめる（ESC ESC O A = Alt+↑）。
    expect(chords(decode("\x1b\x1bOA"))).toEqual([["alt+up", "\x1b\x1bOA"]]);
  });

  it("待ちを 150ms に延ばすのは ESC [ / ESC O より先まで届いてから（Alt+[ / Alt+O は短い待ちで確定）", () => {
    const d = new InputDecoder();
    d.feed("\x1b[");
    expect(d.waitMs).toBe(25);
    expect(chords(d.flush())).toEqual([["alt+[", "\x1b["]]); // Alt+[（xterm の列そのもの）
    d.feed("\x1bO");
    expect(d.waitMs).toBe(25);
    expect(chords(d.flush())).toEqual([["alt+shift+o", "\x1bO"]]);
    d.feed("\x1b[1");
    expect(d.waitMs).toBe(150);
    d.flush();
    d.feed("\x1b[<");
    expect(d.waitMs).toBe(150);
    d.flush();
    d.feed("\x1bO5");
    expect(d.waitMs).toBe(150);
  });

  it("SGR マウスの拡張ボタン（128〜）は左ボタンにしない（捨てる）", () => {
    expect(decode("\x1b[<128;3;3M\x1b[<129;3;3m")).toEqual([]);
  });

  it("X10 形式のマウス（CSI M ＋ 3 バイト）を読み、文字として流さない", () => {
    expect(decode("\x1b[M !!", "\x1b[M#!!")).toEqual([
      {
        kind: "mouse",
        action: "down",
        button: 0,
        x: 0,
        y: 0,
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      },
      {
        kind: "mouse",
        action: "up",
        button: 0,
        x: 0,
        y: 0,
        mods: { shift: false, alt: false, ctrl: false, meta: false },
      },
    ]);
    // 3 バイトが割れて届いても待つ。
    const d = new InputDecoder();
    expect(d.feed("\x1b[M ")).toEqual([]);
    expect(d.feed("!!")).toEqual([expect.objectContaining({ kind: "mouse" })]);
  });
});

describe("InputDecoder：背景色の問い合わせの応答が読みで割れても打鍵にしない（05 T2 の点検）", () => {
  it("問い合わせの直後は、割れた ESC ] 1… を ESC の時間切れでも待ち、続きで明暗として読む", () => {
    let now = 1000;
    const d = new InputDecoder(() => now);
    d.expectReply(500);
    expect(d.feed("\x1b]11;rgb:ffff/")).toEqual([]);
    expect(d.waiting).toBe(true);
    expect(d.waitMs).toBeGreaterThanOrEqual(400);
    now += 30;
    expect(d.flush()).toEqual([]); // ESC の時間切れでも確定しない
    expect(d.feed("ffff/ffff\x1b")).toEqual([]);
    expect(d.feed("\\x")).toEqual([
      { kind: "colorScheme", dark: false },
      expect.objectContaining({ kind: "key", raw: "x" }),
    ]);
  });

  it("締め切りの後・問い合わせていないときは、いつもの規則（Alt+] と続きの文字）", () => {
    let now = 0;
    const d = new InputDecoder(() => now);
    d.expectReply(500);
    expect(d.feed("\x1b]1")).toEqual([]);
    now = 600;
    expect(chords(d.flush())).toEqual([
      ["alt+]", "\x1b]"],
      ["1", "1"],
    ]);
    const plain = new InputDecoder(() => 0);
    expect(chords(plain.feed("\x1b]1"))).toEqual([
      ["alt+]", "\x1b]"],
      ["1", "1"],
    ]);
  });
});

describe("InputDecoder：応答を待つ間も、ほかの列（CSI 等）の待ちはいつもどおり", () => {
  it("途中まで届いた CSI（ESC [ 1 …）は応答として待たない", () => {
    const d = new InputDecoder(() => 0);
    d.expectReply(500);
    expect(d.feed("\x1b[1;")).toEqual([]);
    expect(d.waitMs).toBeLessThan(500);
    expect(d.flush().length).toBeGreaterThan(0);
  });
});
