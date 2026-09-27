/*
 * 入力の分解の方針（ESC 単独の時間切れ・マウス中の長い待ち・ブラケットペーストを丸ごとで判定）は herdr（https://github.com/herdrdev/herdr、
 * commit da6bcd5969779bfe0396bcf89a8025d4375d611e）の `src/raw_input.rs` に倣った（Apache-2.0。TypeScript で書き直した。ルートの `NOTICE` を参照）。
 */
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
/** CSI・SS3（マウスの報告を含む）の途中まで届いた列を待つ時間（遅い回線で列が割れても崩さない。herdr のマウス中の 150ms と同じ）。 */
export const SEQUENCE_TIMEOUT_MS = 150;

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

/** キーパッド（DECKPAM で `ESC O x`）の終わり → [キー, code]。 */
const KEYPAD_KEYS: Readonly<Record<string, readonly [string, string]>> = {
  ...Object.fromEntries([..."pqrstuvwxy"].map((c, n) => [c, [String(n), `Numpad${n}`] as const])),
  M: ["Enter", "NumpadEnter"],
  j: ["*", "NumpadMultiply"],
  k: ["+", "NumpadAdd"],
  l: [",", "NumpadComma"],
  m: ["-", "NumpadSubtract"],
  n: [".", "NumpadDecimal"],
  o: ["/", "NumpadDivide"],
  X: ["=", "NumpadEqual"],
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
  let ch = String.fromCodePoint(code);
  // CSI u の Shift＋英字は小文字のコードで届く。DOM と同じく大文字のキーにする（従来の列に直すと大文字になる）。
  if (mods.shift && /^[a-z]$/.test(ch)) ch = ch.toUpperCase();
  return keyInput(ch, /^[A-Z]$/.test(ch) ? { ...mods, shift: true } : mods);
}

type Parsed = { event: InputEvent | null; length: number } | "incomplete";

/**
 * 標準入力の列を事象に分解する（20260927-cli-mode の design「input/decode.ts」。状態を持つ：途中で切れた列・ブラケットペーストの本文を持ち越す）。
 * キー（C0・ESC 前置の Alt・CSI・SS3・modifyOtherKeys の `CSI 27`・CSI u）、SGR マウス（1006）、ブラケットペースト、フォーカス（CSI I/O）。
 * 外側の端末の応答（CSI の DA・DECRPM 等と、同じ読みで完全に届いた OSC・DCS）は入力に混ぜず捨てる。ESC 単独は `ESC_TIMEOUT_MS` 待って `flush()` で確定する。
 */
export class InputDecoder {
  private readonly utf8 = new TextDecoder();
  private pending = "";
  private paste: string | null = null;

  /**
   * 確定まで待つ時間。CSI・SS3 が `ESC [` / `ESC O` より先まで届いている（引数・中間のバイトか、`ESC [<`・`ESC [M` まで来た）ときだけ長め
   * （割れたマウスの列を崩さない）。`ESC [` / `ESC O` だけなら短い待ちで Alt+[ / Alt+O として確定する（xterm と同じ）。
   * **残るあいまいさ**：Alt+[ / Alt+O の直後 25ms 以内に次の文字を打つと、列として読まれる（xterm 自身も区別できない）。
   */
  get waitMs(): number {
    const core = this.pending.startsWith("\x1b\x1b") ? this.pending.slice(1) : this.pending;
    const sequence = core.startsWith("\x1b[") || core.startsWith("\x1bO");
    return sequence && core.length > 2 ? SEQUENCE_TIMEOUT_MS : ESC_TIMEOUT_MS;
  }

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
    // `ESC [` / `ESC O` だけで時間切れ：Alt+[ / Alt+O（xterm が送る列そのもの）。
    if ((next === "[" || next === "O") && s.length === 2 && force) {
      return {
        event: { kind: "key", key: singleKey(next, { ...NO_MODS, alt: true }), raw: `\x1b${next}` },
        length: 2,
      };
    }
    if (next === "[") {
      const r = this.parseCsi(s);
      if (r !== "incomplete") return r;
      return force ? this.escapeThenRest() : "incomplete";
    }
    if (next === "O") return this.parseSs3(s, force);
    if (next === "]" || next === "P" || next === "_" || next === "^") {
      // 端末版は外側の端末に問い合わせないので、ESC ] 等はふつう Alt+] 等の打鍵。完全で形の正しい OSC・DCS 等が同じ読みの中に
      // 届いたときだけ（外側の端末が自分から送るもの）捨てる。待たない——続く BEL（Ctrl+G）等の打鍵を消さない。
      const len = stringSequenceLength(s, next);
      if (len !== null) return { event: null, length: len };
      return {
        event: { kind: "key", key: singleKey(next, { ...NO_MODS, alt: true }), raw: `\x1b${next}` },
        length: 2,
      };
    }
    if (next === "\x1b") {
      // ESC ESC：Alt＋（続きのキー）。xterm（metaSendsEscape）では Alt+Esc・Ctrl+Alt+[ が ESC ESC になる。ESC ESC [ A 等は Alt＋矢印。
      // **あいまいさ（残す）**：Esc を 2 回すばやく押す（同じ読みか 25ms 以内）と Ctrl+Alt+[ と区別できない（docs/tui-parity.md に書く）。
      const third = s[2];
      const rest = s.slice(1);
      // 続きがキー以外（貼り付けの始まり・マウス・フォーカス・応答）なら、前の ESC は単独の Escape、続きはそのまま読む。
      if (rest.startsWith(PASTE_START)) return this.escapeThenRest();
      if (PASTE_START.startsWith(rest) && !force) return "incomplete";
      if (third === "[" || third === "O") {
        const inner = this.parseOne(rest, force);
        if (inner === "incomplete") return "incomplete";
        if (inner.event === null || inner.event.kind !== "key") return this.escapeThenRest();
        const key = { ...inner.event.key, alt: true };
        return {
          event: { kind: "key", key, raw: `\x1b${inner.event.raw}` },
          length: inner.length + 1,
        };
      }
      if (third === undefined && !force) return "incomplete";
      return {
        event: {
          kind: "key",
          key: keyInput("[", { ...NO_MODS, ctrl: true, alt: true }),
          raw: "\x1b\x1b",
        },
        length: 2,
      };
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

  /** SS3（`ESC O` ＋ [修飾] ＋ 終わり）。修飾は `ESC O 5 P`（古い xterm）と `ESC O 1 ; 5 P` の両方。キーパッド（DECKPAM）の列も読む。 */
  private parseSs3(s: string, force: boolean): Parsed {
    let i = 2;
    while (i < s.length && /[0-9;]/.test(s[i]!)) i++;
    if (i >= s.length) return force ? this.escapeThenRest() : "incomplete";
    const final = s[i]!;
    const raw = s.slice(0, i + 1);
    const params = s
      .slice(2, i)
      .split(";")
      .filter((p) => p !== "");
    const mods = modsOf(
      params.length > 0 ? Number.parseInt(params[params.length - 1]!, 10) : undefined,
    );
    const keypad = KEYPAD_KEYS[final];
    if (keypad)
      return {
        event: { kind: "key", key: keyInput(keypad[0], mods, keypad[1]), raw },
        length: i + 1,
      };
    const name = CSI_LETTER_KEYS[final];
    return {
      event: { kind: "key", key: keyInput(name ?? "Unidentified", mods), raw },
      length: i + 1,
    };
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
      // 拡張ボタン（128〜。戻る・進む等）は扱わない（左ボタンと取り違えない）。
      if ((b & 128) !== 0) return { event: null, length };
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
    // X10 形式のマウス（`CSI M` ＋ 3 バイト。1006 を解さない端末）。
    if (body === "" && final === "M") {
      if (s.length < length + 3) return "incomplete";
      const [cb, cx, cy] = [...s.slice(length, length + 3)].map((c) => c.codePointAt(0)! - 32);
      const b = cb!;
      const button = b & 3;
      const wheel = (b & 64) !== 0;
      const motion = (b & 32) !== 0;
      const mods: Mods = {
        shift: (b & 4) !== 0,
        alt: (b & 8) !== 0,
        ctrl: (b & 16) !== 0,
        meta: false,
      };
      const action = wheel ? "wheel" : motion ? "move" : button === 3 ? "up" : "down";
      return {
        event: {
          kind: "mouse",
          action,
          button: wheel ? 64 + button : button === 3 ? 0 : button,
          x: cx! - 1,
          y: cy! - 1,
          mods,
        },
        length: length + 3,
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

/**
 * 完全で形の正しい OSC（`ESC ] 数字 … BEL|ST`）・DCS/APC/PM（`ESC P|_|^ 中身 ST`）の長さ。途中で C0（BEL 以外）が来る・終わりが無い・中身が空なら null。
 */
function stringSequenceLength(s: string, kind: string): number | null {
  let i = 2;
  if (kind === "]") {
    while (i < s.length && s[i]! >= "0" && s[i]! <= "9") i++;
    if (i === 2) return null;
  }
  for (let j = i; j < s.length; j++) {
    const c = s.charCodeAt(j);
    if (c === 0x07 && kind === "]") return j + 1;
    if (c === 0x1b) return s[j + 1] === "\\" && j > 2 ? j + 2 : null;
    if (c < 0x20) return null;
  }
  return null;
}
