import { describe, expect, it, vi } from "vitest";
import { resolveKeymap, loadKeyPrefs } from "@sodashitsu/client-core";
import { InputDecoder } from "./decode.js";
import { encodeKey, encodePaste, legacyBytes } from "./encode.js";
import { TuiKeys } from "./keys.js";

const normal = {
  applicationCursorKeysMode: false,
  applicationKeypadMode: false,
  bracketedPasteMode: false,
};
const app = {
  applicationCursorKeysMode: true,
  applicationKeypadMode: true,
  bracketedPasteMode: true,
};

function keyEv(raw: string) {
  const ev = new InputDecoder().feed(raw)[0];
  if (!ev || ev.kind !== "key") throw new Error("not a key");
  return ev;
}

describe("encodeKey（pane へ送る列。AC6）", () => {
  it("修飾の無い矢印・Home/End は pane の DECCKM に合わせる", () => {
    expect(encodeKey(keyEv("\x1b[A"), app)).toBe("\x1bOA");
    expect(encodeKey(keyEv("\x1bOA"), normal)).toBe("\x1b[A");
    expect(encodeKey(keyEv("\x1b[H"), app)).toBe("\x1bOH");
    // 修飾つきは外側の列のまま。
    expect(encodeKey(keyEv("\x1b[1;5A"), app)).toBe("\x1b[1;5A");
  });

  it("modifyOtherKeys・CSI u は従来の列へ直す", () => {
    expect(encodeKey(keyEv("\x1b[27;5;98~"), normal)).toBe("\x02");
    expect(encodeKey(keyEv("\x1b[13;2u"), normal)).toBe("\r");
    expect(encodeKey(keyEv("\x1b[27;3;120~"), normal)).toBe("\x1bx");
  });

  it("それ以外は外側の端末の列のまま", () => {
    for (const raw of ["a", "日", "\x02", "\x1bx", "\x1b[3~", "\x1b[15~", "\r", "\x7f"])
      expect(encodeKey(keyEv(raw), normal)).toBe(raw);
  });

  it("legacyBytes：ctrl・alt・名前のあるキー", () => {
    expect(
      legacyBytes({
        key: "c",
        code: "KeyC",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        type: "keydown",
        composing: false,
      }),
    ).toBe("\x03");
    expect(
      legacyBytes({
        key: "Tab",
        code: "Tab",
        ctrl: false,
        alt: false,
        shift: true,
        meta: false,
        type: "keydown",
        composing: false,
      }),
    ).toBe("\x1b[Z");
    expect(
      legacyBytes({
        key: "F5",
        code: "F5",
        ctrl: true,
        alt: false,
        shift: false,
        meta: false,
        type: "keydown",
        composing: false,
      }),
    ).toBeNull();
  });

  it("貼り付けは pane のブラケットペーストに合わせて包み、本文の終わりの印は取り除く", () => {
    expect(encodePaste("a\nb", normal)).toBe("a\nb");
    expect(encodePaste("a\x1b[201~b", app)).toBe("\x1b[200~ab\x1b[201~");
  });
});

describe("TuiKeys（KeyRouter を通す。AC-I5）", () => {
  function setup(keys: Record<string, unknown> | undefined = undefined, modes = normal) {
    const sent: string[] = [];
    const actions: unknown[] = [];
    const k = new TuiKeys(resolveKeymap(loadKeyPrefs(keys)).keymap, {
      paneModes: () => modes,
      sendToPane: (b) => sent.push(b),
      dispatch: (a) => actions.push(a),
    });
    const type = (raw: string) => {
      for (const ev of new InputDecoder().feed(raw)) if (ev.kind === "key") k.handle(ev);
    };
    return { k, sent, actions, type };
  }

  it("prefix 以外は焦点の pane へ（DECCKM に合わせて）", () => {
    const { sent, type } = setup(undefined, app);
    type("ls\r");
    type("\x1b[A");
    expect(sent).toEqual(["l", "s", "\r", "\x1bOA"]);
  });

  it("prefix+q は detach、prefix+h/l は focus_pane、prefix+b は toggle_sidebar。prefix の間は PREFIX のモード", () => {
    const { k, sent, actions, type } = setup();
    type("\x02");
    expect(k.mode).toBe("prefix");
    type("q");
    expect(k.mode).toBe("terminal");
    type("\x02l\x02h\x02b");
    expect(actions).toEqual([
      { type: "detach" },
      { type: "focusDir", dir: "right" },
      { type: "focusDir", dir: "left" },
      { type: "toggleSidebar" },
    ]);
    expect(sent).toEqual([]);
  });

  it("prefix+prefix は prefix のバイトを pane へ", () => {
    const { sent, type } = setup();
    type("\x02\x02");
    expect(sent).toEqual(["\x02"]);
  });

  it("設定の prefix（prefs.keys）に従う", () => {
    const { actions, sent, type } = setup({ prefix: "ctrl+a" });
    type("\x02");
    expect(sent).toEqual(["\x02"]);
    type("\x01q");
    expect(actions).toEqual([{ type: "detach" }]);
  });

  it("prefix は 3 秒で解除される", () => {
    vi.useFakeTimers();
    try {
      const { k, type } = setup();
      type("\x02");
      vi.advanceTimersByTime(3001);
      expect(k.mode).toBe("terminal");
    } finally {
      vi.useRealTimers();
    }
  });

  it("送り先の pane が無ければ何も送らない", () => {
    const sent: string[] = [];
    const k = new TuiKeys(resolveKeymap(loadKeyPrefs(undefined)).keymap, {
      paneModes: () => null,
      sendToPane: (b) => sent.push(b),
      dispatch: () => undefined,
    });
    for (const ev of new InputDecoder().feed("x")) if (ev.kind === "key") k.handle(ev);
    expect(sent).toEqual([]);
  });
});

describe("encodeKey（03 の点検の指摘）", () => {
  it("キーパッドは pane の DECKPAM に合わせる（SS3 のまま／文字）", () => {
    expect(encodeKey(keyEv("\x1bOq"), app)).toBe("\x1bOq");
    expect(encodeKey(keyEv("\x1bOq"), normal)).toBe("1");
    expect(encodeKey(keyEv("\x1bOM"), normal)).toBe("\r");
    expect(encodeKey(keyEv("\x1bOk"), normal)).toBe("+");
  });

  it("Ctrl+2〜8・Ctrl+/・Ctrl+- は xterm の従来のバイト。CSI u の Shift＋英字は大文字", () => {
    const expected: [string, string][] = [
      ["2", "\x00"],
      ["3", "\x1b"],
      ["4", "\x1c"],
      ["5", "\x1d"],
      ["6", "\x1e"],
      ["7", "\x1f"],
      ["8", "\x7f"],
      ["/", "\x1f"],
      ["-", "\x1f"],
    ];
    for (const [ch, bytes] of expected) {
      expect(encodeKey(keyEv(`\x1b[27;5;${ch.charCodeAt(0)}~`), normal)).toBe(bytes);
    }
    expect(encodeKey(keyEv("\x1b[97;2u"), normal)).toBe("A");
    expect(encodeKey(keyEv("\x1b[97;4u"), normal)).toBe("\x1bA");
  });
});

describe("encodeKey（03 ラウンド 2 の指摘）", () => {
  it("従来の列に直せない modifyOtherKeys・CSI u は修飾を落として送り（Alt は ESC 前置）、拡張の列のまま送らない", () => {
    expect(encodeKey(keyEv("\x1b[27;5;49~"), normal)).toBe("1"); // Ctrl+1
    expect(encodeKey(keyEv("\x1b[44;5u"), normal)).toBe(","); // Ctrl+,
    expect(encodeKey(keyEv("\x1b[44;7u"), normal)).toBe("\x1b,"); // Ctrl+Alt+,
  });
});
