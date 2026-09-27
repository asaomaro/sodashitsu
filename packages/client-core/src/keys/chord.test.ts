import { afterEach, describe, expect, it } from "vitest";
import type { KeyInput } from "./actions.js";
import {
  chordOf,
  chordToKeyInput,
  expandRange,
  formatBinding,
  formatChord,
  isAltGrComposed,
  isDirectChord,
  isModifierOnly,
  keyInputOf,
  type KeyboardEventLike,
  parseBinding,
  parseChord,
  prefixBytes,
  setOptionComposes,
} from "./chord.js";

function k(partial: Partial<KeyInput> & { key: string }): KeyInput {
  return {
    code: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    type: "keydown",
    composing: false,
    ...partial,
  };
}

describe("chordOf — KeyInput の正規形（D3）", () => {
  it("修飾キーは ctrl・alt・shift・cmd の順に前置する", () => {
    expect(chordOf(k({ key: "b", ctrl: true }))).toBe("ctrl+b");
    expect(chordOf(k({ key: "d", ctrl: true, alt: true }))).toBe("ctrl+alt+d");
    expect(chordOf(k({ key: "x", ctrl: true, alt: true, shift: true, meta: true }))).toBe(
      "ctrl+alt+shift+cmd+x",
    );
  });

  it("文字は小文字にそろえ、shift は明示する——合成の（小文字＋shift）も、実物の（大文字＋shift）も同じ正規形（実測 F24）", () => {
    expect(chordOf(k({ key: "d", ctrl: true, alt: true, shift: true }))).toBe("ctrl+alt+shift+d"); // Playwright の合成
    expect(chordOf(k({ key: "D", ctrl: true, alt: true, shift: true }))).toBe("ctrl+alt+shift+d"); // 実物のキーボード
    expect(chordOf(k({ key: "D", alt: true, shift: true }))).toBe("alt+shift+d");
    expect(chordOf(k({ key: "H", shift: true }))).toBe("shift+h");
    expect(chordOf(k({ key: "h" }))).toBe("h");
  });

  it("大文字は shift 付きとみなす（今の `H`・`T` と同じ。shift の無い大文字＝CapsLock は shift+q で、割り当てなしのまま）", () => {
    expect(chordOf(k({ key: "Q" }))).toBe("shift+q");
    expect(chordOf(k({ key: "T", shift: true }))).toBe("shift+t");
  });

  it("数字・記号は shift を持たない（文字そのものが shift を表す）", () => {
    expect(chordOf(k({ key: "?", shift: true }))).toBe("?");
    expect(chordOf(k({ key: "1", shift: true }))).toBe("1"); // 合成の shift+1
    expect(chordOf(k({ key: "!", shift: true }))).toBe("!");
    expect(chordOf(k({ key: "-" }))).toBe("-");
    expect(chordOf(k({ key: "[", ctrl: true, alt: true }))).toBe("ctrl+alt+[");
    expect(chordOf(k({ key: "1", ctrl: true, alt: true }))).toBe("ctrl+alt+1");
  });

  it("名前のあるキーは shift を明示し、名前で書く", () => {
    expect(chordOf(k({ key: "Tab" }))).toBe("tab");
    expect(chordOf(k({ key: "Tab", shift: true }))).toBe("shift+tab");
    expect(chordOf(k({ key: "ArrowLeft", ctrl: true, alt: true, shift: true }))).toBe(
      "ctrl+alt+shift+left",
    );
    expect(chordOf(k({ key: "Escape" }))).toBe("esc");
    expect(chordOf(k({ key: " " }))).toBe("space");
    expect(chordOf(k({ key: "PageDown" }))).toBe("pagedown");
    expect(chordOf(k({ key: "F5" }))).toBe("f5");
    expect(chordOf(k({ key: "F12", shift: true }))).toBe("shift+f12");
    expect(chordOf(k({ key: "+", ctrl: true }))).toBe("ctrl+plus");
  });

  it("引く対象でないキー（修飾キー単体・Dead・Unidentified・CapsLock・IME の Process）は null", () => {
    for (const key of [
      "Shift",
      "Control",
      "Alt",
      "Meta",
      "AltGraph",
      "Dead",
      "Unidentified",
      "CapsLock",
      "Process",
      "ContextMenu",
    ]) {
      expect(chordOf(k({ key }))).toBeNull();
    }
  });

  it("プロトタイプ経由の名前（constructor・__proto__）は引かない", () => {
    expect(chordOf(k({ key: "constructor" }))).toBeNull();
    expect(chordOf(k({ key: "__proto__" }))).toBeNull();
    expect(chordOf(k({ key: "toString", ctrl: true }))).toBeNull();
  });
});

describe("chordOf — macOS の Option の文字化け（D6b。setOptionComposes が有効なときだけ）", () => {
  afterEach(() => setOptionComposes(false));

  it("既定は戻さない（ほかの環境の入力を書き換えない）", () => {
    expect(chordOf(k({ key: "∂", code: "KeyD", alt: true }))).toBe("alt+∂");
  });

  it("有効なら、alt だけで化けた文字（非 ASCII・Dead）を code の英字・数字へ戻す", () => {
    setOptionComposes(true);
    expect(chordOf(k({ key: "∂", code: "KeyD", alt: true }))).toBe("alt+d");
    expect(chordOf(k({ key: "Î", code: "KeyD", alt: true, shift: true }))).toBe("alt+shift+d");
    expect(chordOf(k({ key: "¡", code: "Digit1", alt: true }))).toBe("alt+1");
    expect(chordOf(k({ key: "Dead", code: "KeyE", alt: true }))).toBe("alt+e"); // Option+e は Dead キー
  });

  it("戻さないもの：ctrl・meta が付いている・英数字・ASCII の記号（Win・Linux の Alt+Shift+数字）・code が Key/Digit でない・Dead でも alt が無い", () => {
    setOptionComposes(true);
    expect(chordOf(k({ key: "å", code: "KeyA", alt: true, ctrl: true }))).toBe("ctrl+alt+å");
    expect(chordOf(k({ key: "å", code: "KeyA", alt: true, meta: true }))).toBe("alt+cmd+å");
    expect(chordOf(k({ key: "d", code: "KeyD", alt: true }))).toBe("alt+d");
    expect(chordOf(k({ key: "@", code: "Digit2", alt: true, shift: true }))).toBe("alt+@"); // US 配列の Alt+Shift+2
    expect(chordOf(k({ key: "&", code: "Digit7", alt: true, shift: true }))).toBe("alt+&");
    expect(chordOf(k({ key: ",", code: "KeyW", alt: true }))).toBe("alt+,"); // Dvorak の Alt+,
    expect(chordOf(k({ key: "[", code: "BracketLeft", alt: true }))).toBe("alt+[");
    expect(chordOf(k({ key: "ø", code: "Semicolon", alt: true }))).toBe("alt+ø");
    expect(chordOf(k({ key: "Dead", code: "KeyE" }))).toBeNull();
  });

  it("shift 付きの数字は戻さない（shift が落ちて Option+数字と同じ chord になるため。化けた文字のままなので、どの割り当てにも当たらない）", () => {
    setOptionComposes(true);
    expect(chordOf(k({ key: "⁄", code: "Digit1", alt: true, shift: true }))).toBe("alt+⁄");
  });
});

describe("parseChord / formatChord", () => {
  it("書き出しの逆で読める（往復）", () => {
    for (const c of [
      "ctrl+b",
      "ctrl+alt+shift+d",
      "shift+h",
      "tab",
      "shift+tab",
      "left",
      "space",
      "?",
      "-",
      "[",
      "plus",
      "f5",
      "alt+cmd+k",
      "1",
      "esc",
      "pagedown",
    ]) {
      const p = parseChord(c);
      expect(p, c).not.toBeNull();
      expect(formatChord(p!), c).toBe(c);
    }
  });

  it("別名を受ける（control・option・command・super・minus 等。herdr と同じ）", () => {
    expect(formatChord(parseChord("Control+Option+D")!)).toBe("ctrl+alt+shift+d");
    expect(formatChord(parseChord("command+K")!)).toBe("shift+cmd+k");
    expect(formatChord(parseChord("super+k")!)).toBe("cmd+k");
    expect(formatChord(parseChord("minus")!)).toBe("-");
    expect(formatChord(parseChord("escape")!)).toBe("esc");
    expect(formatChord(parseChord("return")!)).toBe("enter");
    expect(formatChord(parseChord("ampersand")!)).toBe("&");
    expect(formatChord(parseChord("F5")!)).toBe("f5");
  });

  it("1 文字の大文字は shift 付きの小文字（herdr と同じ）", () => {
    expect(formatChord(parseChord("H")!)).toBe("shift+h");
  });

  it("読めないものは null（meta は herdr では alt の意味なので受けない・キーが 2 つ・空の要素・数字や記号への shift+）", () => {
    for (const bad of [
      "",
      "meta+a",
      "ctrl+",
      "+a",
      "ctrl++",
      "a+b",
      "ctrl",
      "shift+1",
      "shift+?",
      "shift+-",
      "shift+plus",
      "ctrl+shift+plus",
      "f25",
      "ctrl+enterr",
      "prefix",
      "ctrl+a+constructor",
      "constructor",
      "__proto__",
      "ctrl+constructor",
    ]) {
      expect(parseChord(bad), bad).toBeNull();
    }
  });
});

describe("parseBinding / formatBinding", () => {
  it("prefix の後のキーと直接のキーを分ける", () => {
    expect(parseBinding("prefix+v")).toEqual({ via: "prefix", chord: "v", range: false });
    expect(parseBinding("prefix+shift+h")).toEqual({
      via: "prefix",
      chord: "shift+h",
      range: false,
    });
    expect(parseBinding("ctrl+alt+d")).toEqual({
      via: "direct",
      chord: "ctrl+alt+d",
      range: false,
    });
    expect(parseBinding("  prefix+minus ")).toEqual({ via: "prefix", chord: "-", range: false });
    expect(parseBinding("prefix+shift+tab")).toEqual({
      via: "prefix",
      chord: "shift+tab",
      range: false,
    });
  });

  it("範囲 1..9（修飾は ctrl・alt・cmd。shift は不可）", () => {
    expect(parseBinding("prefix+1..9")).toEqual({ via: "prefix", chord: "1", range: true });
    expect(parseBinding("prefix+alt+1..9")).toEqual({ via: "prefix", chord: "alt+1", range: true });
    expect(parseBinding("ctrl+alt+1..9")).toEqual({
      via: "direct",
      chord: "ctrl+alt+1",
      range: true,
    });
    expect(parseBinding("prefix+shift+1..9")).toBeNull();
    expect(parseBinding("shift+alt+1..9")).toBeNull();
    expect(parseBinding("prefix+alt1..9")).toBeNull();
    expect(parseBinding("prefix+bogus+1..9")).toBeNull();
    expect(parseBinding("prefix+constructor+1..9")).toBeNull();
  });

  it("読めないものは null", () => {
    for (const bad of ["", "prefix+", "prefix", "prefix+meta+a", "ctrl+", "a b"]) {
      expect(parseBinding(bad), bad).toBeNull();
    }
  });

  it("formatBinding は parseBinding の逆", () => {
    for (const s of [
      "prefix+v",
      "prefix+shift+h",
      "ctrl+alt+d",
      "prefix+1..9",
      "prefix+alt+1..9",
      "ctrl+alt+1..9",
      "prefix+shift+tab",
      "prefix+-",
    ]) {
      expect(formatBinding(parseBinding(s)!), s).toBe(s);
    }
  });

  it("expandRange は 1〜9 の 9 個に展開する", () => {
    expect(expandRange("alt+1")).toEqual([
      "alt+1",
      "alt+2",
      "alt+3",
      "alt+4",
      "alt+5",
      "alt+6",
      "alt+7",
      "alt+8",
      "alt+9",
    ]);
    expect(expandRange("1")).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(expandRange("bogus+")).toEqual([]);
  });
});

describe("isDirectChord — 直接のキーに使える形（D4）", () => {
  it("ctrl・alt・cmd のいずれかを含む chord は使える", () => {
    for (const c of [
      "ctrl+alt+d",
      "ctrl+b",
      "alt+x",
      "cmd+k",
      "ctrl+tab",
      "alt+left",
      "ctrl+alt+shift+d",
      "ctrl+-",
      "alt+space",
    ])
      expect(isDirectChord(c), c).toBe(true);
  });

  it("F キーは修飾なしでも使える", () => {
    for (const c of ["f5", "shift+f5", "f12", "ctrl+f5"]) expect(isDirectChord(c), c).toBe(true);
  });

  it("文字・名前のあるキー・shift だけを付けたものは、端末への入力を奪うので使えない", () => {
    for (const c of [
      "d",
      "shift+d",
      "?",
      "1",
      "tab",
      "shift+tab",
      "enter",
      "left",
      "space",
      "esc",
      "backspace",
    ])
      expect(isDirectChord(c), c).toBe(false);
  });

  it("読めない chord は使えない", () => {
    expect(isDirectChord("")).toBe(false);
    expect(isDirectChord("meta+a")).toBe(false);
  });
});

describe("prefixBytes — prefix を 2 度押したとき端末へ送る列（D5）", () => {
  it("ctrl+英字は制御文字（今の \\x02 の一般化）", () => {
    expect(prefixBytes("ctrl+b")).toBe("\x02");
    expect(prefixBytes("ctrl+a")).toBe("\x01");
    expect(prefixBytes("ctrl+z")).toBe("\x1a");
  });

  it("ctrl+[ \\ ] ^ _ @ ・ctrl+space", () => {
    expect(prefixBytes("ctrl+[")).toBe("\x1b");
    expect(prefixBytes("ctrl+\\")).toBe("\x1c");
    expect(prefixBytes("ctrl+]")).toBe("\x1d");
    expect(prefixBytes("ctrl+^")).toBe("\x1e");
    expect(prefixBytes("ctrl+_")).toBe("\x1f");
    expect(prefixBytes("ctrl+@")).toBe("\x00");
    expect(prefixBytes("ctrl+space")).toBe("\x00");
  });

  it("alt+1 文字は ESC 前置・ctrl+alt+英字は ESC＋制御文字", () => {
    expect(prefixBytes("alt+b")).toBe("\x1bb");
    expect(prefixBytes("alt+shift+b")).toBe("\x1bB");
    expect(prefixBytes("alt+1")).toBe("\x1b1");
    expect(prefixBytes("alt+space")).toBe("\x1b ");
    expect(prefixBytes("alt+plus")).toBe("\x1b+");
    expect(prefixBytes("ctrl+alt+b")).toBe("\x1b\x02");
  });

  it("修飾なしの F1〜F12 は xterm の列", () => {
    expect(prefixBytes("f1")).toBe("\x1bOP");
    expect(prefixBytes("f5")).toBe("\x1b[15~");
    expect(prefixBytes("f12")).toBe("\x1b[24~");
  });

  it("端末へ送れない形は null（ctrl+shift・cmd・名前のあるキー＋修飾・修飾付きの F キー・修飾なし・数字の制御文字）", () => {
    for (const c of [
      "ctrl+shift+a",
      "cmd+b",
      "ctrl+cmd+b",
      "alt+cmd+b",
      "ctrl+alt+cmd+b",
      "ctrl+tab",
      "alt+left",
      "ctrl+f5",
      "shift+f5",
      "alt+f5",
      "b",
      "tab",
      "ctrl+1",
      "ctrl+alt+1",
      "ctrl+alt+shift+b",
      "ctrl+alt+[",
      "ctrl+plus",
      "alt+shift+space",
      "alt+shift+ß",
      "alt+shift+1",
      "bogus+b",
      "f13",
    ]) {
      expect(prefixBytes(c), c).toBeNull();
    }
  });
});

describe("chordToKeyInput — chord から KeyInput（モバイルの Prefix ボタン）", () => {
  it("chordOf の逆になる（往復）", () => {
    for (const c of [
      "ctrl+b",
      "ctrl+alt+shift+d",
      "shift+h",
      "tab",
      "shift+tab",
      "left",
      "space",
      "?",
      "-",
      "plus",
      "f5",
      "alt+cmd+k",
      "1",
      "esc",
      "alt+shift+b",
    ]) {
      expect(chordOf(chordToKeyInput(c)), c).toBe(c);
    }
  });

  it("DOM の key・code の形を作る", () => {
    expect(chordToKeyInput("ctrl+b")).toEqual({
      key: "b",
      code: "KeyB",
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      type: "keydown",
      composing: false,
    });
    expect(chordToKeyInput("shift+h").key).toBe("H");
    expect(chordToKeyInput("f5").key).toBe("F5");
    expect(chordToKeyInput("alt+1").code).toBe("Digit1");
  });

  it("読めない chord は例外（呼ぶ側は解決した表の prefix しか渡さない）", () => {
    expect(() => chordToKeyInput("bogus+")).toThrow();
  });
});

describe("isAltGrComposed — AltGr で合成された文字（D6a）", () => {
  it("AltGraph が偽なら合成ではない", () => {
    expect(isAltGrComposed(k({ key: "@", code: "KeyQ" }))).toBe(false);
  });

  it("ドイツ語配列の AltGr+Q＝@ ・AltGr+8＝[ は合成", () => {
    expect(isAltGrComposed(k({ key: "@", code: "KeyQ", altGraph: true }))).toBe(true);
    expect(isAltGrComposed(k({ key: "[", code: "Digit8", altGraph: true }))).toBe(true);
  });

  it("英数字は通す（Firefox・Windows は Ctrl+Alt だけで AltGraph が真になる）", () => {
    expect(isAltGrComposed(k({ key: "d", code: "KeyD", altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "1", code: "Digit1", altGraph: true }))).toBe(false);
  });

  it("US 配列の ctrl+alt+[ ・] ・/ は、物理キーの文字と同じなので通す", () => {
    expect(isAltGrComposed(k({ key: "[", code: "BracketLeft", altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "]", code: "BracketRight", altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "/", code: "Slash", altGraph: true }))).toBe(false);
  });

  it("US 配列のシフトありの記号（ctrl+alt+shift+[＝{ ・? ・<）とテンキーの記号も、物理キーの文字と同じなので通す。ドイツ語配列の AltGr+7＝{ は合成", () => {
    expect(isAltGrComposed(k({ key: "{", code: "BracketLeft", shift: true, altGraph: true }))).toBe(
      false,
    );
    expect(isAltGrComposed(k({ key: "?", code: "Slash", shift: true, altGraph: true }))).toBe(
      false,
    );
    expect(isAltGrComposed(k({ key: "<", code: "Comma", shift: true, altGraph: true }))).toBe(
      false,
    );
    expect(isAltGrComposed(k({ key: "+", code: "NumpadAdd", altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "*", code: "NumpadMultiply", altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "{", code: "Digit7", altGraph: true }))).toBe(true);
    expect(isAltGrComposed(k({ key: "}", code: "Digit0", altGraph: true }))).toBe(true);
  });

  it("AltGr の層が US のシフトの記号と同じ文字になる配列（フランス語 AltGr+3＝#・スペイン語 AltGr+2＝@・北欧 AltGr+4＝$）は、shift が偽なら合成（shift の状態を見て比べる）", () => {
    expect(isAltGrComposed(k({ key: "#", code: "Digit3", altGraph: true }))).toBe(true);
    expect(isAltGrComposed(k({ key: "@", code: "Digit2", altGraph: true }))).toBe(true);
    expect(isAltGrComposed(k({ key: "$", code: "Digit4", altGraph: true }))).toBe(true);
    // 同じ文字でも、US 配列で shift とともに押す（ctrl+alt+shift+3＝#）なら通る。
    expect(isAltGrComposed(k({ key: "#", code: "Digit3", shift: true, altGraph: true }))).toBe(
      false,
    );
    // シフトありで、シフトなしの文字が届くのは、US 配列ではありえない（AltGr の層）。
    expect(isAltGrComposed(k({ key: "[", code: "BracketLeft", shift: true, altGraph: true }))).toBe(
      true,
    );
  });

  // US 配列の記号キーの真値（コード・シフトなし・シフトあり）。表（`US_BASE_CHAR`・`US_SHIFT_CHAR`）を 1 項ずつ、shift の状態ごとに確かめる。
  const US_SYMBOL_KEYS: ReadonlyArray<readonly [string, string, string]> = [
    ["Backquote", "`", "~"],
    ["Digit1", "1", "!"],
    ["Digit2", "2", "@"],
    ["Digit3", "3", "#"],
    ["Digit4", "4", "$"],
    ["Digit5", "5", "%"],
    ["Digit6", "6", "^"],
    ["Digit7", "7", "&"],
    ["Digit8", "8", "*"],
    ["Digit9", "9", "("],
    ["Digit0", "0", ")"],
    ["Minus", "-", "_"],
    ["Equal", "=", "+"],
    ["BracketLeft", "[", "{"],
    ["BracketRight", "]", "}"],
    ["Backslash", "\\", "|"],
    ["Semicolon", ";", ":"],
    ["Quote", "'", '"'],
    ["Comma", ",", "<"],
    ["Period", ".", ">"],
    ["Slash", "/", "?"],
  ];

  it("US 配列の記号キーは、同じ shift の状態の文字なら通り、違う状態の文字（AltGr の層）なら合成", () => {
    for (const [code, base, shifted] of US_SYMBOL_KEYS) {
      if (!/^[A-Za-z0-9]$/.test(base))
        expect(isAltGrComposed(k({ key: base, code, altGraph: true })), `${code} ${base}`).toBe(
          false,
        );
      if (!/^[A-Za-z0-9]$/.test(shifted)) {
        expect(
          isAltGrComposed(k({ key: shifted, code, shift: true, altGraph: true })),
          `${code} shift ${shifted}`,
        ).toBe(false);
        // shift が偽なのにシフトの記号が届くのは、AltGr の層。
        expect(
          isAltGrComposed(k({ key: shifted, code, altGraph: true })),
          `${code} ${shifted}（shift なし）`,
        ).toBe(true);
      }
      if (!/^[A-Za-z0-9]$/.test(base) && shifted !== base)
        expect(
          isAltGrComposed(k({ key: base, code, shift: true, altGraph: true })),
          `${code} ${base}（shift あり）`,
        ).toBe(true);
    }
  });

  it("テンキーの記号・Space は shift に依らず通り、AltGraph が偽ならどれも合成ではない", () => {
    for (const [code, key] of [
      ["NumpadAdd", "+"],
      ["NumpadSubtract", "-"],
      ["NumpadMultiply", "*"],
      ["NumpadDivide", "/"],
      ["NumpadDecimal", "."],
      ["NumpadEqual", "="],
      ["NumpadComma", ","],
      ["Space", " "],
    ] as const)
      for (const shift of [false, true])
        expect(
          isAltGrComposed(k({ key, code, shift, altGraph: true })),
          `${code} shift=${shift}`,
        ).toBe(false);
    for (const [code, base, shifted] of US_SYMBOL_KEYS) {
      expect(isAltGrComposed(k({ key: base, code, altGraph: false }))).toBe(false);
      expect(isAltGrComposed(k({ key: shifted, code, shift: false }))).toBe(false); // altGraph 未指定
    }
  });

  it("大文字の英数字は通す（実物のキーボードは Ctrl+Alt+Shift+D で key＝D。CapsLock で shift なしの大文字でも同じ）", () => {
    expect(isAltGrComposed(k({ key: "D", code: "KeyD", shift: true, altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "D", code: "KeyD", altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "Z", code: "KeyZ", shift: true, altGraph: true }))).toBe(false);
  });

  it("shift 真で表に無い code の非 ASCII の文字（ポーランド語 AltGr+Shift+A＝Ą・€）は、拒否側に倒す（フェイルクローズ）", () => {
    expect(isAltGrComposed(k({ key: "Ą", code: "KeyA", shift: true, altGraph: true }))).toBe(true);
    expect(isAltGrComposed(k({ key: "€", code: "KeyE", shift: true, altGraph: true }))).toBe(true);
    expect(isAltGrComposed(k({ key: "€", code: "KeyE", altGraph: true }))).toBe(true); // shift 偽でも同じ
    // 表のプロトタイプ経由の名前は表の項ではない
    expect(isAltGrComposed(k({ key: "€", code: "constructor", shift: true, altGraph: true }))).toBe(
      true,
    );
  });

  it("表に無い code や 1 文字でない key は、前者は拒否側・後者は合成ではない", () => {
    expect(isAltGrComposed(k({ key: "€", code: "KeyE", altGraph: true }))).toBe(true);
    expect(isAltGrComposed(k({ key: "ArrowLeft", code: "ArrowLeft", altGraph: true }))).toBe(false);
    expect(isAltGrComposed(k({ key: "ø", code: "", altGraph: true }))).toBe(true);
  });
});

describe("isModifierOnly / keyInputOf", () => {
  it("修飾キー単体を見分ける", () => {
    expect(isModifierOnly({ key: "Shift" })).toBe(true);
    expect(isModifierOnly({ key: "AltGraph" })).toBe(true);
    expect(isModifierOnly({ key: "a" })).toBe(false);
  });

  it("DOM のイベントから KeyInput を作る（altGraph・repeat・IME の 229）", () => {
    const base: KeyboardEventLike = {
      key: "d",
      code: "KeyD",
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false,
      type: "keydown",
      isComposing: false,
      keyCode: 68,
      preventDefault() {},
    };
    expect(keyInputOf(base)).toEqual({
      key: "d",
      code: "KeyD",
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
      type: "keydown",
      composing: false,
      altGraph: false,
      repeat: false,
    });
    expect(keyInputOf({ ...base, repeat: true }).repeat).toBe(true);
    expect(keyInputOf({ ...base, getModifierState: (s) => s === "AltGraph" }).altGraph).toBe(true);
    expect(keyInputOf({ ...base, getModifierState: () => false }).altGraph).toBe(false);
    expect(keyInputOf({ ...base, isComposing: true }).composing).toBe(true);
    expect(keyInputOf({ ...base, keyCode: 229 }).composing).toBe(true);
    expect(keyInputOf({ ...base, type: "keyup" }).type).toBe("keyup");
    expect(keyInputOf({ ...base, type: "keypress" }).type).toBe("keypress");
    expect(keyInputOf({ ...base, type: "something" }).type).toBe("keydown");
  });
});

describe("chordOf の出力は必ず parseChord で読み戻せる（照合は chordOf の正規形に集める）", () => {
  it("空白の文字（NBSP・全角スペース）と、小文字にすると 2 文字になる文字（トルコ語の İ）は引かない", () => {
    expect(chordOf(k({ key: "\u00a0" }))).toBeNull();
    expect(chordOf(k({ key: "\u3000", alt: true }))).toBeNull();
    expect(chordOf(k({ key: "İ", shift: true }))).toBeNull();
    expect(chordOf(k({ key: " " }))).toBe("space"); // 半角スペースは名前のあるキー
  });

  it("読む側も同じ規則：İ・空白の文字は parseChord・parseBinding でも読めない（chordOf が引かない chord を、手で書き換えた保存値が持ち込めない）", () => {
    for (const bad of ["shift+İ", "alt+İ", "ctrl+alt+İ", "alt+\u00a0", "alt+\u3000"])
      expect(parseChord(bad), bad).toBeNull();
    expect(parseBinding("prefix+İ")).toBeNull();
    expect(parseBinding("prefix+\u00a0")).toBeNull();
    // 小文字にしても 1 文字のままの文字は読める（ドットなしの ı・ß 等）。
    expect(parseChord("alt+ı")).not.toBeNull();
    expect(parseChord("alt+ß")).not.toBeNull();
  });

  it("いろいろなキーで、chordOf が返す chord は parseChord で読め、書き出すと同じになる", () => {
    const keys = [
      ..."abcxyzABCXYZ0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~äöüßéèñçşğıİøåæ日本語あ",
      "Tab",
      "Enter",
      "Escape",
      " ",
      "Backspace",
      "Delete",
      "Insert",
      "ArrowLeft",
      "ArrowUp",
      "Home",
      "End",
      "PageUp",
      "PageDown",
      "F1",
      "F12",
      "F24",
      "\u00a0",
      "\u3000",
    ];
    let checked = 0;
    for (const key of keys) {
      for (const mods of [
        {},
        { ctrl: true },
        { alt: true },
        { shift: true },
        { ctrl: true, alt: true, shift: true },
        { meta: true },
      ]) {
        const chord = chordOf(k({ key, ...mods }));
        if (chord === null) continue;
        checked++;
        const parsed = parseChord(chord);
        expect(parsed, `${key} ${JSON.stringify(mods)} → ${chord}`).not.toBeNull();
        expect(formatChord(parsed!), `${key} ${JSON.stringify(mods)}`).toBe(chord);
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it("chordToKeyInput は大文字が 2 文字になる文字を大文字にしない（shift+ß）", () => {
    expect(chordToKeyInput("shift+ß").key).toBe("ß");
  });
});
