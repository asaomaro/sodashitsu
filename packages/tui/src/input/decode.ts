import type { KeyInput } from "@sodashitsu/client-core";

/** 修飾（xterm の修飾の番号 m − 1 のビット：shift 1・alt 2・ctrl 4・meta 8）。 */
export interface Mods {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

/** 標準入力の事象（architecture の `InputEvent`）。`raw` はそのキーを表した元の列（pane へそのまま送る既定）。 */
export type InputEvent =
  | { kind: "key"; key: KeyInput; raw: string }
  | {
      kind: "mouse";
      action: "down" | "up" | "move" | "wheel";
      button: number;
      x: number;
      y: number;
      mods: Mods;
    }
  | { kind: "paste"; text: string }
  | { kind: "focus"; focused: boolean };

/** ESC 単独を確定するまで待つ時間（design「input/decode.ts」）。 */
export const ESC_TIMEOUT_MS = 25;

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

const NO_MODS: Mods = { shift: false, alt: false, ctrl: false, meta: false };

function modsOf(param: number | undefined): Mods {
  const m = (param ?? 1) - 1;
  if (m <= 0) return NO_MODS;
  return { shift: (m & 1) !== 0, alt: (m & 2) !== 0, ctrl: (m & 4) !== 0, meta: (m & 8) !== 0 };
}

function codeOf(key: string): string {
  if (/^[a-zA-Z]$/.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (key === " ") return "Space";
  return key;
}

export function keyInput(key: string, mods: Mods, code = codeOf(key)): KeyInput {
  return {
    key,
    code,
    ctrl: mods.ctrl,
    alt: mods.alt,
    shift: mods.shift,
    meta: mods.meta,
    type: "keydown",
    composing: false,
  };
}

const CSI_LETTER_KEYS: Readonly<Record<string, string>> = {
  A: "ArrowUp",
  B: "ArrowDown",
  C: "ArrowRight",
  D: "ArrowLeft",
  H: "Home",
  F: "End",
  P: "F1",
  Q: "F2",
  R: "F3",
  S: "F4",
};

const TILDE_KEYS: Readonly<Record<number, string>> = {
  1: "Home",
  2: "Insert",
  3: "Delete",
  4: "End",
  5: "PageUp",
  6: "PageDown",
  7: "Home",
  8: "End",
  11: "F1",
  12: "F2",
  13: "F3",
  14: "F4",
  15: "F5",
  17: "F6",
  18: "F7",
  19: "F8",
  20: "F9",
  21: "F10",
  23: "F11",
  24: "F12",
};

/** 1 文字（ESC 以外）のキー。C0 は ctrl＋文字、DEL は Backspace。 */
function singleKey(ch: string, extra: Mods = NO_MODS): KeyInput {
  const c = ch.codePointAt(0)!;
  const withMods = (key: string, m: Partial<Mods> = {}): KeyInput =>
    keyInput(key, {
      ...extra,
      ...m,
      ctrl: extra.ctrl || m.ctrl === true,
      alt: extra.alt || m.alt === true,
    });
  if (c === 0x0d) return withMods("Enter");
  if (c === 0x09) return withMods("Tab");
  if (c === 0x7f) return withMods("Backspace");
  if (c === 0x00) return withMods(" ", { ctrl: true });
  if (c >= 0x01 && c <= 0x1a) return withMods(String.fromCharCode(c + 0x60), { ctrl: true });
  if (c >= 0x1c && c <= 0x1f) return withMods(String.fromCharCode(c + 0x40), { ctrl: true });
  // 文字：大文字は shift 付き（chordOf も大文字を shift とみなす）。
  const upper = /^[A-Z]$/.test(ch);
  return withMods(ch, upper ? { shift: true } : {});
}

/** modifyOtherKeys（`CSI 27 ; m ; code ~`）と CSI u（`CSI code ; m u`）の文字コード → キー。 */
function keyFromCode(code: number, mods: Mods): KeyInput {
  if (code === 13) return keyInput("Enter", mods);
  if (code === 9) return keyInput("Tab", mods);
  if (code === 27) return keyInput("Escape", mods);
  if (code === 127 || code === 8) return keyInput("Backspace", mods);
  const ch = String.fromCodePoint(code);
  return keyInput(ch, /^[A-Z]$/.test(ch) ? { ...mods, shift: true } : mods);
}

type Parsed = { event: InputEvent | null; length: number } | "incomplete";

/**
 * 標準入力の列を事象に分解する（20260927-cli-mode の design「input/decode.ts」。状態を持つ：途中で切れた列・ブラケットペーストの本文を持ち越す）。
 * キー（C0・ESC 前置の Alt・CSI・SS3・modifyOtherKeys の `CSI 27`・CSI u）、SGR マウス（1006）、ブラケットペースト、フォーカス（CSI I/O）。
 * 外側の端末の問い合わせの応答（DA・DCS・OSC 等）は入力に混ぜず捨てる。ESC 単独は `ESC_TIMEOUT_MS` 待って `flush()` で確定する。
 */
export class InputDecoder {
  private readonly utf8 = new TextDecoder();
  private pending = "";
  private paste: string | null = null;

  /** 確定を待っている列があるか（呼び出し側が `ESC_TIMEOUT_MS` 後に `flush()` する）。ペーストの途中は待たない（終わりまで持ち越す）。 */
  get waiting(): boolean {
    return this.paste === null && this.pending !== "";
  }

  feed(bytes: Uint8Array | string): InputEvent[] {
    this.pending += typeof bytes === "string" ? bytes : this.utf8.decode(bytes, { stream: true });
    return this.drain(false);
  }

  /** 時間切れ：残りの ESC を単独の Escape（とそれに続く文字）として確定する。 */
  flush(): InputEvent[] {
    return this.drain(true);
  }

  private drain(force: boolean): InputEvent[] {
    const out: InputEvent[] = [];
    let s = this.pending;
    while (s.length > 0) {
      if (this.paste !== null) {
        const end = s.indexOf(PASTE_END);
        if (end < 0) {
          // 終わりの印が区切りをまたぐかもしれないので、印の長さ-1 だけ残す。
          const keep = Math.min(s.length, PASTE_END.length - 1);
          this.paste += s.slice(0, s.length - keep);
          s = s.slice(s.length - keep);
          break;
        }
        out.push({ kind: "paste", text: this.paste + s.slice(0, end) });
        this.paste = null;
        s = s.slice(end + PASTE_END.length);
        continue;
      }
      if (s.startsWith(PASTE_START)) {
        this.paste = "";
        s = s.slice(PASTE_START.length);
        continue;
      }
      const parsed = this.parseOne(s, force);
      if (parsed === "incomplete") break;
      if (parsed.event) out.push(parsed.event);
      s = s.slice(parsed.length);
    }
    this.pending = s;
    return out;
  }

  private parseOne(s: string, force: boolean): Parsed {
    const ch = String.fromCodePoint(s.codePointAt(0)!);
    if (ch !== "\x1b")
      return { event: { kind: "key", key: singleKey(ch), raw: ch }, length: ch.length };
    if (s.length === 1) {
      return force
        ? { event: { kind: "key", key: keyInput("Escape", NO_MODS), raw: "\x1b" }, length: 1 }
        : "incomplete";
    }
    const next = s[1]!;
    if (next === "[") {
      const r = this.parseCsi(s);
      if (r !== "incomplete") return r;
      return force ? this.escapeThenRest() : "incomplete";
    }
    if (next === "O") {
      if (s.length < 3) return force ? this.escapeThenRest() : "incomplete";
      const final = s[2]!;
      const name = CSI_LETTER_KEYS[final];
      const raw = s.slice(0, 3);
      return {
        event: { kind: "key", key: keyInput(name ?? "Unidentified", NO_MODS), raw },
        length: 3,
      };
    }
    if (next === "]" || next === "P" || next === "_" || next === "^") {
      // OSC・DCS・APC・PM（外側の端末の応答）。終わり（BEL か ST）まで捨てる。
      const bel = next === "]" ? s.indexOf("\x07", 2) : -1;
      const st = s.indexOf("\x1b\\", 2);
      const ends = [bel >= 0 ? bel + 1 : -1, st >= 0 ? st + 2 : -1].filter((n) => n > 0);
      if (ends.length === 0) return force ? this.escapeThenRest() : "incomplete";
      return { event: null, length: Math.min(...ends) };
    }
    if (next === "\x1b") {
      // ESC ESC：前の ESC を単独の Escape として確定し、後ろは次の列の頭として読む。
      return { event: { kind: "key", key: keyInput("Escape", NO_MODS), raw: "\x1b" }, length: 1 };
    }
    // ESC ＋ 1 文字 = Alt。
    const second = String.fromCodePoint(s.codePointAt(1)!);
    const key = singleKey(second, { ...NO_MODS, alt: true });
    return { event: { kind: "key", key, raw: `\x1b${second}` }, length: 1 + second.length };
  }

  /** 時間切れで確定できない列の頭の ESC を Escape にし、残りは次の読みで普通の文字として扱う。 */
  private escapeThenRest(): Parsed {
    return { event: { kind: "key", key: keyInput("Escape", NO_MODS), raw: "\x1b" }, length: 1 };
  }

  private parseCsi(s: string): Parsed {
    // CSI P...P I...I F（引数 0x30-0x3f、中間 0x20-0x2f、終わり 0x40-0x7e）。
    let i = 2;
    while (i < s.length && s.charCodeAt(i) >= 0x30 && s.charCodeAt(i) <= 0x3f) i++;
    while (i < s.length && s.charCodeAt(i) >= 0x20 && s.charCodeAt(i) <= 0x2f) i++;
    if (i >= s.length) return "incomplete";
    const finalCode = s.charCodeAt(i);
    if (finalCode < 0x40 || finalCode > 0x7e) {
      // 壊れた列：頭の ESC [ を Alt+[ として読み、残りは普通の文字に。
      return {
        event: { kind: "key", key: keyInput("[", { ...NO_MODS, alt: true }), raw: "\x1b[" },
        length: 2,
      };
    }
    const raw = s.slice(0, i + 1);
    const body = s.slice(2, i);
    const final = s[i]!;
    const length = i + 1;
    const unknown = (): Parsed => ({
      event: { kind: "key", key: keyInput("Unidentified", NO_MODS), raw },
      length,
    });

    // SGR マウス：CSI < b ; x ; y M/m
    if (body.startsWith("<") && (final === "M" || final === "m")) {
      const [b, x, y] = body
        .slice(1)
        .split(";")
        .map((n) => Number.parseInt(n, 10));
      if (b === undefined || x === undefined || y === undefined || [b, x, y].some(Number.isNaN))
        return { event: null, length };
      const mods: Mods = {
        shift: (b & 4) !== 0,
        alt: (b & 8) !== 0,
        ctrl: (b & 16) !== 0,
        meta: false,
      };
      const button = b & 3;
      const wheel = (b & 64) !== 0;
      const motion = (b & 32) !== 0;
      const action = wheel ? "wheel" : motion ? "move" : final === "M" ? "down" : "up";
      return {
        event: {
          kind: "mouse",
          action,
          button: wheel ? 64 + button : motion && button === 3 ? -1 : button,
          x: x - 1,
          y: y - 1,
          mods,
        },
        length,
      };
    }
    // 応答（DA `CSI ? … c`・kitty のフラグ `CSI ? … u`・DECRPM `CSI ? … $ y` 等）は入力に混ぜない。
    if (body.startsWith("?") || body.startsWith(">") || body.includes("$"))
      return { event: null, length };
    if (body === "" && final === "I") return { event: { kind: "focus", focused: true }, length };
    if (body === "" && final === "O") return { event: { kind: "focus", focused: false }, length };
    if (body === "" && final === "Z")
      return {
        event: { kind: "key", key: keyInput("Tab", { ...NO_MODS, shift: true }), raw },
        length,
      };

    const params = body
      .split(";")
      .map((p) => (p === "" ? undefined : Number.parseInt(p.split(":")[0]!, 10)));
    if (final in CSI_LETTER_KEYS && !body.includes("<")) {
      return {
        event: { kind: "key", key: keyInput(CSI_LETTER_KEYS[final]!, modsOf(params[1])), raw },
        length,
      };
    }
    if (final === "~") {
      const n = params[0];
      if (n === 27 && params[2] !== undefined)
        return {
          event: { kind: "key", key: keyFromCode(params[2], modsOf(params[1])), raw },
          length,
        };
      const name = n !== undefined ? TILDE_KEYS[n] : undefined;
      if (name)
        return { event: { kind: "key", key: keyInput(name, modsOf(params[1])), raw }, length };
      return unknown();
    }
    if (final === "u" && params[0] !== undefined) {
      return {
        event: { kind: "key", key: keyFromCode(params[0], modsOf(params[1])), raw },
        length,
      };
    }
    return unknown();
  }
}
