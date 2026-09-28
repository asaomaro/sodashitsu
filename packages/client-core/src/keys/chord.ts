import type { KeyInput } from "./actions.js";

/**
 * キーの割り当ての「chord」（20260921-keybinding-customization。design「chord の文法」）。**キーの照合はすべてこの正規形に集める**——
 * `KeyInput` → {@link chordOf} → 文字列、保存された割り当ての文字列 → {@link parseBinding} → 同じ文字列。2 系統にしない。
 *
 * ```
 * chord := (修飾 "+")* キー         修飾 := ctrl | alt | shift | cmd      （この順。cmd は event.metaKey）
 * キー  := 1 文字（小文字・数字・記号。"+" は plus）
 *        | esc | enter | tab | space | backspace | delete | insert | left | right | up | down | home | end | pageup | pagedown | f1 … f24
 * ```
 *
 * 表記は herdr の `format_key_combo`（`src/config/keybinds.rs`）に合わせる。文字は**小文字にそろえ、shift は明示のフラグ**で持つ（D3。実測では、
 * 合成のキーは shift を付けても大文字にならず、実物のキーボードは大文字を返す。どちらも同じ正規形になる）。記号・数字は文字そのものが shift を表すので shift を持たない。
 */

/** DOM のキーボードイベントのうち、この機能が読む面（テストで差し替えられる形）。 */
export interface KeyboardEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  type: string;
  isComposing: boolean;
  keyCode: number;
  /** 押しっぱなしの繰り返し（D4。直接のキーは繰り返しを食う）。 */
  repeat?: boolean;
  /** `"AltGraph"` を問い合わせる（D6a）。無い環境（テストの偽物）は偽として扱う。 */
  getModifierState?(key: string): boolean;
  preventDefault(): void;
}

/** DOM のイベントから `KeyInput` を作る。`KeyInputController` と設定画面の取り込みが同じ変換を使う。 */
export function keyInputOf(ev: KeyboardEventLike): KeyInput {
  return {
    key: ev.key,
    code: ev.code,
    ctrl: ev.ctrlKey,
    alt: ev.altKey,
    shift: ev.shiftKey,
    meta: ev.metaKey,
    type: ev.type === "keyup" ? "keyup" : ev.type === "keypress" ? "keypress" : "keydown",
    // Safari は IME の確定の keydown で isComposing が false になるので keyCode 229 も見る。
    composing: ev.isComposing || ev.keyCode === 229,
    altGraph: ev.getModifierState?.("AltGraph") === true,
    repeat: ev.repeat === true,
  };
}

/**
 * 修飾キー単体の `KeyboardEvent.key`。`Shift+T` 等を押すと、ブラウザは本命のキーより先に `Shift` 単体の keydown を必ず発火する
 * （20260918-web-terminal-multiplexer の decisions D81）。prefix 中・取り込み待ちの間は、これを「割り当てのないキー」にせず待ち続ける。
 */
export const MODIFIER_ONLY_KEYS: ReadonlySet<string> = new Set([
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "AltGraph",
]);

/** prefix の後で押すと prefix を取り消すキー（`KeyRouter`）。prefix の後のキーには割り当てられない（`keymap.ts` の `RESERVED_AFTER_PREFIX`）。 */
export const PREFIX_CANCEL_CHORD = "esc";

/** DOM の `event.key` → chord のキー名（名前のあるキー）。 */
const NAMED_KEYS: Readonly<Record<string, string>> = {
  Escape: "esc",
  Enter: "enter",
  Tab: "tab",
  " ": "space",
  Backspace: "backspace",
  Delete: "delete",
  Insert: "insert",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
};
const DOM_KEY_OF_NAME: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(NAMED_KEYS).map(([dom, name]) => [name, dom]),
);

/** 読み込みで受ける別名（herdr の `parse_key_combo`）→ 正規のキー名。 */
const KEY_ALIASES: Readonly<Record<string, string>> = {
  escape: "esc",
  return: "enter",
  bs: "backspace",
  del: "delete",
  minus: "-",
  comma: ",",
  period: ".",
  slash: "/",
  backslash: "\\",
  quote: "'",
  double_quote: '"',
  "double-quote": '"',
  semicolon: ";",
  colon: ":",
  percent: "%",
  ampersand: "&",
  backtick: "`",
};
const NAMED_KEY_NAMES: ReadonlySet<string> = new Set(Object.values(NAMED_KEYS));

const MODIFIER_ALIASES: Readonly<Record<string, "ctrl" | "alt" | "shift" | "cmd">> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  shift: "shift",
  cmd: "cmd",
  command: "cmd",
  super: "cmd",
};

const F_KEY = /^[fF]([1-9]|1[0-9]|2[0-4])$/;

export interface ChordParts {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  cmd: boolean;
  /** 正規のキー名（上の文法の「キー」）。 */
  key: string;
}

/** 表を**自分のプロパティだけ**で引く（`constructor`・`__proto__` のような名前がプロトタイプ経由で通らないように）。 */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

function isSingleChar(s: string): boolean {
  return [...s].length === 1;
}

/**
 * chord のキーになれる 1 文字か。空白の文字（NBSP・全角スペース。macOS の Option+Space は NBSP）と、小文字にすると 2 文字になる文字（トルコ語の `İ`）は不可——
 * 引く側（`chordOf`）と読む側（`parseChord`）が**同じ規則**で、読み戻せる chord だけを持つ（保存値を手で書き換えても、読み込みは通り解決で落ちる、を起こさない）。
 * 半角スペースは名前のあるキー（space）として別に拾う。
 */
function isChordChar(key: string): boolean {
  return isSingleChar(key) && !/\s/.test(key) && isSingleChar(key.toLowerCase());
}

/** 大小のある文字か（数字・記号・かな等はない）。 */
function isCased(ch: string): boolean {
  return ch.toLowerCase() !== ch.toUpperCase();
}

export function formatChord(p: ChordParts): string {
  const mods: string[] = [];
  if (p.ctrl) mods.push("ctrl");
  if (p.alt) mods.push("alt");
  if (p.shift) mods.push("shift");
  if (p.cmd) mods.push("cmd");
  return [...mods, p.key].join("+");
}

/**
 * chord の文字列を読む。**書き出し（{@link formatChord}）の逆で、別名も受ける**（`control`・`option`・`command`・`super`・`minus` 等。herdr と同じ）。
 * `meta` は herdr では alt を指すので受けない（誤解を避ける）。1 文字の大文字は shift 付きの小文字（herdr と同じ）。
 * 数字・記号への `shift+` は無効（キー配列で文字が変わるので、照合できない）。
 */
export function parseChord(s: string): ChordParts | null {
  const tokens = s.split("+").map((t) => t.trim());
  if (tokens.some((t) => t === "")) return null;
  const parts: ChordParts = { ctrl: false, alt: false, shift: false, cmd: false, key: "" };
  let keyToken: string | null = null;
  for (const token of tokens) {
    const mod = own(MODIFIER_ALIASES, token.toLowerCase());
    if (mod) {
      parts[mod] = true;
    } else if (keyToken === null) {
      keyToken = token;
    } else {
      return null; // キーが 2 つある
    }
  }
  if (keyToken === null) return null;
  const key = normalizeKeyToken(keyToken, parts);
  if (key === null) return null;
  parts.key = key;
  // 数字・記号（大小のない 1 文字。`+` は plus と綴る）に shift は付けられない。
  if (parts.shift && (key === "plus" || (isSingleChar(key) && !isCased(key)))) return null;
  return parts;
}

/** キーの綴りを正規のキー名にする。大文字 1 文字は `parts.shift` を立てて小文字にする。読めなければ null。 */
function normalizeKeyToken(token: string, parts: ChordParts): string | null {
  const lower = token.toLowerCase();
  if (NAMED_KEY_NAMES.has(lower)) return lower;
  if (lower === "plus") return "plus";
  const alias = own(KEY_ALIASES, lower);
  if (alias) return alias;
  if (F_KEY.test(token)) return lower;
  if (isChordChar(token)) {
    if (isCased(token) && token !== lower) parts.shift = true;
    return lower;
  }
  return null;
}

/**
 * `KeyInput` の正規形を作る。**引く対象でないキー（修飾キー単体・`Dead`・`Unidentified` 等）は null**。
 * macOS の Option の文字化け（`Option+d` → `∂`）は `code` で元へ戻す（{@link setOptionComposes} が有効なときだけ。D6b）。
 */
export function chordOf(
  k: Pick<KeyInput, "key" | "code" | "ctrl" | "alt" | "shift" | "meta">,
): string | null {
  const key = recoverOptionKey(k);
  if (MODIFIER_ONLY_KEYS.has(key)) return null;
  let shift = k.shift;
  let name: string;
  const named = own(NAMED_KEYS, key);
  if (named !== undefined) {
    name = named;
  } else if (F_KEY.test(key)) {
    name = key.toLowerCase();
  } else if (isSingleChar(key)) {
    // 空白の文字・小文字にすると 2 文字になる文字は引かない（`isChordChar`。`parseChord` と同じ規則）——読み戻せる chord だけを作る（照合は `chordOf` の正規形に集める）。
    if (!isChordChar(key)) return null;
    const lower = key.toLowerCase();
    if (isCased(key)) {
      shift = k.shift || key !== lower; // 大文字は shift 付きとみなす（今の `H`・`T` と同じ）
      name = lower;
    } else {
      shift = false; // 数字・記号は文字そのものが shift を表す
      name = key === "+" ? "plus" : key;
    }
  } else {
    return null;
  }
  return formatChord({ ctrl: k.ctrl, alt: k.alt, shift, cmd: k.meta, key: name });
}

/**
 * macOS の Option の文字化けを `code` で元へ戻すか（{@link setOptionComposes}）。**既定は戻さない**——ほかの環境では、`code` が物理キーの位置（QWERTY）なので、
 * Dvorak の Alt+`,`（`code` は `KeyW`）や AZERTY の Alt+é（`Digit2`）を別の chord にしてしまう。本番の `main.ts` が macOS のときだけ有効にする。
 * **既知の制約**：macOS でも Dvorak・QWERTZ・AZERTY は `code` が QWERTY の位置なので、化けた Option の chord の表示が押した字と食い違う（取り込みと照合は同じ変換を通るので、動作はそろう）。
 */
let optionComposes = false;

/** macOS（Option が文字を別の文字に化かす環境）かを伝える。既定は偽。**実機（macOS）では未確認**。 */
export function setOptionComposes(on: boolean): void {
  optionComposes = on;
}

/**
 * Option で化けた `key`（`∂`・`¡`・`Dead`）を `code` の英字・数字へ戻す（D6b）。ctrl・meta なしの alt だけのときだけ。**ASCII の文字は化けではないので戻さない**
 * （Windows・Linux の Alt+Shift+数字の `!`）。shift 付きの数字は shift が落ちて Option+数字と同じ chord になってしまうので戻さない（化けた文字のまま＝どの割り当てにも当たらない）。
 */
function recoverOptionKey(
  k: Pick<KeyInput, "key" | "code" | "ctrl" | "alt" | "shift" | "meta">,
): string {
  const { key } = k;
  if (!optionComposes || !k.alt || k.ctrl || k.meta) return key;
  const composed = key === "Dead" || (isSingleChar(key) && (key.codePointAt(0) ?? 0) > 0x7f);
  if (!composed) return key;
  const m = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(k.code);
  if (m === null) return key;
  const letter = m[1];
  const digit = m[2];
  if (letter !== undefined) return k.shift ? letter : letter.toLowerCase();
  return digit !== undefined && !k.shift ? digit : key;
}

/** 修飾キー単体の keydown か（`KeyInput.key` を見る）。 */
export function isModifierOnly(k: Pick<KeyInput, "key">): boolean {
  return MODIFIER_ONLY_KEYS.has(k.key);
}

/**
 * **直接のキーに使える形**か（D4。この規則の唯一の実装）：ctrl・alt・cmd のいずれかを含む chord か F キー。
 * 文字・名前のあるキー（`tab`・`enter`・矢印等）・shift だけを付けたものは、端末への入力を奪うので使えない。
 */
export function isDirectChord(chord: string): boolean {
  const p = parseChord(chord);
  if (p === null) return false;
  return p.ctrl || p.alt || p.cmd || F_KEY.test(p.key);
}

export interface ParsedBinding {
  via: "prefix" | "direct";
  /** 範囲のときは `1` の chord（`alt+1`）。 */
  chord: string;
  /** `1..9` の範囲か（`switch_tab`・`focus_agent` のような `indexed: true` の操作向け）。 */
  range: boolean;
}

/**
 * 割り当ての文字列（`prefix+shift+h`・`ctrl+alt+d`・`prefix+alt+1..9`）を読む。**書式だけを見る**（直接のキーの形・衝突は呼ぶ側の規則）。
 * 範囲の修飾は ctrl・alt・cmd（shift は不可。配列によって数字が別の記号になる）。
 */
export function parseBinding(s: string): ParsedBinding | null {
  let body = s.trim();
  let via: ParsedBinding["via"] = "direct";
  if (body.startsWith("prefix+")) {
    via = "prefix";
    body = body.slice("prefix+".length);
  }
  if (body.endsWith("1..9")) {
    const mods = body === "1..9" ? "" : body.slice(0, -"1..9".length);
    if (mods !== "" && !mods.endsWith("+")) return null;
    const parts: ChordParts = { ctrl: false, alt: false, shift: false, cmd: false, key: "1" };
    if (mods !== "") {
      for (const token of mods.slice(0, -1).split("+")) {
        const mod = own(MODIFIER_ALIASES, token.trim().toLowerCase());
        if (mod === undefined || mod === "shift") return null;
        parts[mod] = true;
      }
    }
    return { via, chord: formatChord(parts), range: true };
  }
  const parts = parseChord(body);
  if (parts === null) return null;
  return { via, chord: formatChord(parts), range: false };
}

/** {@link parseBinding} の逆。範囲は `alt+1..9`。 */
export function formatBinding(b: ParsedBinding): string {
  const body = b.range ? `${b.chord.slice(0, -1)}1..9` : b.chord;
  return b.via === "prefix" ? `prefix+${body}` : body;
}

/** 範囲の chord（`alt+1`）を `alt+1`〜`alt+9` の 9 個に展開する。 */
export function expandRange(chord: string): string[] {
  const p = parseChord(chord);
  if (p === null) return [];
  return Array.from({ length: 9 }, (_, i) => formatChord({ ...p, key: String(i + 1) }));
}

/** xterm の F1〜F12（修飾なし）の列。 */
const F_KEY_BYTES: Readonly<Record<string, string>> = {
  f1: "\x1bOP",
  f2: "\x1bOQ",
  f3: "\x1bOR",
  f4: "\x1bOS",
  f5: "\x1b[15~",
  f6: "\x1b[17~",
  f7: "\x1b[18~",
  f8: "\x1b[19~",
  f9: "\x1b[20~",
  f10: "\x1b[21~",
  f11: "\x1b[23~",
  f12: "\x1b[24~",
};

function ctrlByte(ch: string): string | null {
  if (ch === " ") return "\x00";
  if (ch >= "a" && ch <= "z") return String.fromCharCode(ch.charCodeAt(0) - 96);
  if ("@[\\]^_".includes(ch)) return String.fromCharCode(ch.charCodeAt(0) & 0x1f);
  return null;
}

/**
 * prefix を 2 回押したとき端末へ送る列（D5）。**端末へ送れる形だけ**——`ctrl+<英字・[ \ ] ^ _ @>`（制御文字。ctrl+shift は ctrl と区別できないので不可）・
 * `alt+<1 文字>`（ESC 前置）・`ctrl+alt+<英字>`・修飾なしの F1〜F12。cmd・名前のあるキーに修飾を付けたものは null（prefix にできない）。
 */
export function prefixBytes(chord: string): string | null {
  const p = parseChord(chord);
  if (p === null || p.cmd) return null;
  const fKey = own(F_KEY_BYTES, p.key);
  if (fKey !== undefined) return p.ctrl || p.alt || p.shift ? null : fKey;
  const ch = p.key === "space" ? " " : p.key === "plus" ? "+" : isSingleChar(p.key) ? p.key : null;
  if (ch === null) return null;
  if (p.ctrl && p.alt) {
    if (p.shift || !(ch >= "a" && ch <= "z")) return null;
    const c = ctrlByte(ch);
    return c === null ? null : `\x1b${c}`;
  }
  if (p.ctrl) return p.shift ? null : ctrlByte(ch);
  if (p.alt) {
    // shift は「大文字になる文字」だけ（`alt+shift+b` → ESC B）。ほかは端末が区別できない（`alt+shift+space`）か、大文字が 2 文字になる（`ß`）ので送れない。
    if (!p.shift) return `\x1b${ch}`;
    const upper = ch.toUpperCase();
    return isCased(ch) && isSingleChar(upper) ? `\x1b${upper}` : null;
  }
  return null;
}

/** chord から `KeyInput` を作る（`KeyRouter.prefixKeyInput()`＝モバイルの Prefix ボタンが注入するキー）。 */
export function chordToKeyInput(chord: string): KeyInput {
  const p = parseChord(chord);
  if (p === null) throw new Error(`chordToKeyInput: 読めない chord です: ${chord}`);
  let key: string;
  const dom = own(DOM_KEY_OF_NAME, p.key);
  if (dom !== undefined) key = dom;
  else if (F_KEY.test(p.key)) key = p.key.toUpperCase();
  else if (p.key === "plus") key = "+";
  else {
    const upper = p.key.toUpperCase();
    key = p.shift && isCased(p.key) && isSingleChar(upper) ? upper : p.key;
  }
  const code = /^[a-z]$/.test(p.key)
    ? `Key${p.key.toUpperCase()}`
    : /^[0-9]$/.test(p.key)
      ? `Digit${p.key}`
      : key;
  return {
    key,
    code,
    ctrl: p.ctrl,
    alt: p.alt,
    shift: p.shift,
    meta: p.cmd,
    type: "keydown",
    composing: false,
  };
}

/** 物理キー（`code`）の US 配列の文字（シフトなし。{@link isAltGrComposed} の比べる先）。テンキーの記号はどの配列でも同じ文字。 */
const US_BASE_CHAR: Readonly<Record<string, string>> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Space: " ",
  NumpadAdd: "+",
  NumpadSubtract: "-",
  NumpadMultiply: "*",
  NumpadDivide: "/",
  NumpadDecimal: ".",
  NumpadEqual: "=",
  NumpadComma: ",",
};

/** 同じ物理キーを Shift とともに押したときの US 配列の記号（{@link isAltGrComposed} の比べる先。`ctrl+alt+shift+[`＝`{` を通す）。 */
const US_SHIFT_CHAR: Readonly<Record<string, string>> = {
  Backquote: "~",
  Digit1: "!",
  Digit2: "@",
  Digit3: "#",
  Digit4: "$",
  Digit5: "%",
  Digit6: "^",
  Digit7: "&",
  Digit8: "*",
  Digit9: "(",
  Digit0: ")",
  Minus: "_",
  Equal: "+",
  BracketLeft: "{",
  BracketRight: "}",
  Backslash: "|",
  Semicolon: ":",
  Quote: '"',
  Comma: "<",
  Period: ">",
  Slash: "?",
};

/**
 * AltGr で**合成された文字**か（D6a）。`getModifierState("AltGraph")` が真で、`key` が英数字以外の 1 文字で、かつその文字が**同じ物理キー（`code`）を同じ shift の状態で押したときの
 * US 配列の文字**と違うとき（シフトなしはシフトなしの文字、シフトありはシフトありの記号と比べる。Space・テンキーは shift に依らない）。英数字は通す——Firefox・Windows は Ctrl+Alt を
 * 両方押すだけで AltGraph が真になる（MDN）ので、US 配列の `ctrl+alt+[`・`ctrl+alt+shift+[`（`{`）は通り、ドイツ語配列の AltGr+8＝`[`・AltGr+7＝`{`、フランス語の AltGr+3＝`#`
 * （shift なしの `Digit3` は `3`）は拒否される。**shift の状態を見ずに両方の表と比べると、AltGr の層が US のシフトの記号と同じ文字になる配列で素通しになる**（`#`・`@`・`$`）。
 * 表に無い `code` は拒否側に倒す。**実機では未確認**。
 */
export function isAltGrComposed(k: Pick<KeyInput, "key" | "code" | "altGraph" | "shift">): boolean {
  if (k.altGraph !== true) return false;
  if (!isSingleChar(k.key)) return false;
  if (/^[A-Za-z0-9]$/.test(k.key)) return false;
  const expected = k.shift
    ? (own(US_SHIFT_CHAR, k.code) ?? own(US_BASE_CHAR, k.code))
    : own(US_BASE_CHAR, k.code);
  return expected !== k.key;
}
