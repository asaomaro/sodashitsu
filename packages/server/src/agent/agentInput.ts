import type { InputModes } from "../terminal/Mirror.js";

/**
 * エージェントへの入力の組み立て（20260926-agent-prompt-send-keys design.md「server `agent/agentInput.ts`」）。
 * herdr の `src/app/api_helpers.rs`（`encode_api_text`）・`src/config/keybinds.rs`（`parse_key_combo`）に合わせる。
 * キーの符号化は xterm の既定（レガシー）の符号化だけ（kitty keyboard protocol は扱わない。decisions.md D1）。
 */

/** 貼り付け直後のEnterがTUIの貼り付け処理に取り込まれないよう、本文と確定キーの間を空ける。 */
export const AGENT_PROMPT_SUBMIT_DELAY_MS = 1000;

const ESC = "\u001b";

const PASTE_MARKERS = /\u001b\[20[01]~/g;

/**
 * 有効なら `ESC[200~`…`ESC[201~` で包む。本文の中の印は取り除く——残すと印の後ろが貼り付けではなく打鍵として届き、
 * 途中で確定されうる（herdr は取り除かない。decisions.md D11）。
 */
export function pastePayload(text: string, bracketedPaste: boolean): string {
  if (!bracketedPaste) return text;
  // 取り除いた後に印が組み上がる入れ子（`ESC[20ESC[201~1~`）があるので、変わらなくなるまで繰り返す。
  let body = text;
  for (let prev = ""; prev !== body;) {
    prev = body;
    body = body.replace(PASTE_MARKERS, "");
  }
  return `${ESC}[200~${body}${ESC}[201~`;
}

export interface KeySpec {
  /** 正規化した名前（`enter`・`up`・`f5` 等）か、1 文字。 */
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

const NAMED_KEYS: Readonly<Record<string, string>> = {
  enter: "enter",
  return: "enter",
  esc: "esc",
  escape: "esc",
  tab: "tab",
  backspace: "backspace",
  bs: "backspace",
  space: " ",
  up: "up",
  down: "down",
  left: "left",
  right: "right",
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
  plus: "+",
};

const MODIFIERS: Readonly<Record<string, "ctrl" | "alt" | "shift">> = {
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  meta: "alt",
  shift: "shift",
};

/** herdr の `normalize_api_key_alias`。 */
function normalizeAlias(name: string): string {
  if (name === "C-c" || name === "c-c") return "ctrl+c";
  if (name === "+") return "plus";
  return name;
}

/** キー名を解釈する。不明なら null（herdr の `parse_key_combo` と同じく、空の部分・修飾の無い組み合わせ・未知の名前は不明）。 */
export function parseKey(name: string): KeySpec | null {
  const spec: KeySpec = { key: "", ctrl: false, alt: false, shift: false };
  let key: string | null = null;
  for (const raw of normalizeAlias(name.trim()).split("+")) {
    const part = raw.trim();
    if (part === "") return null;
    const modifier = MODIFIERS[part.toLowerCase()];
    if (modifier !== undefined) {
      spec[modifier] = true;
      continue;
    }
    if (key !== null) return null;
    key = part;
  }
  if (key === null) return null;
  const named = Object.hasOwn(NAMED_KEYS, key.toLowerCase())
    ? NAMED_KEYS[key.toLowerCase()]!
    : null;
  if (named !== null) return { ...spec, key: named };
  if ([...key].length === 1) {
    if (/^[A-Z]$/.test(key)) return { ...spec, key: key.toLowerCase(), shift: true };
    return { ...spec, key };
  }
  const f = /^f([1-9]|1[0-2])$/i.exec(key);
  if (f) return { ...spec, key: `f${f[1]}` };
  return null;
}

const ARROW_FINAL: Readonly<Record<string, string>> = { up: "A", down: "B", right: "C", left: "D" };
const F1_F4_FINAL: Readonly<Record<string, string>> = { f1: "P", f2: "Q", f3: "R", f4: "S" };
const F5_F12_CODE: Readonly<Record<string, number>> = {
  f5: 15,
  f6: 17,
  f7: 18,
  f8: 19,
  f9: 20,
  f10: 21,
  f11: 23,
  f12: 24,
};

/** xterm の修飾パラメータ（1 + shift·1 + alt·2 + ctrl·4）。 */
function modifierParam(spec: KeySpec): number {
  return 1 + (spec.shift ? 1 : 0) + (spec.alt ? 2 : 0) + (spec.ctrl ? 4 : 0);
}

/** ctrl と組み合わせた 1 文字の符号（英字・`@[\]^_`・space・`?`）。符号化できなければ null。 */
function ctrlChar(c: string): string | null {
  if (c === " ") return "\u0000";
  if (c === "?") return "\u007f";
  if (/^[a-z]$/.test(c)) return String.fromCharCode(c.charCodeAt(0) & 0x1f);
  if ("@[\\]^_".includes(c)) return String.fromCharCode(c.charCodeAt(0) & 0x1f);
  return null;
}

/** モードに合わせて 1 つのキーを符号化する。符号化できない組み合わせは null（可否はモードに依らない）。 */
export function encodeKey(spec: KeySpec, modes: InputModes): string | null {
  const m = modifierParam(spec);
  const arrow = ARROW_FINAL[spec.key];
  if (arrow !== undefined) {
    if (m > 1) return `${ESC}[1;${m}${arrow}`;
    return modes.applicationCursorKeys ? `${ESC}O${arrow}` : `${ESC}[${arrow}`;
  }
  const f14 = F1_F4_FINAL[spec.key];
  if (f14 !== undefined) return m > 1 ? `${ESC}[1;${m}${f14}` : `${ESC}O${f14}`;
  const f512 = F5_F12_CODE[spec.key];
  if (f512 !== undefined) return m > 1 ? `${ESC}[${f512};${m}~` : `${ESC}[${f512}~`;

  const altPrefix = (s: string): string => (spec.alt ? `${ESC}${s}` : s);
  switch (spec.key) {
    case "enter":
      return spec.ctrl || spec.shift ? null : altPrefix("\r");
    case "esc":
      return spec.ctrl || spec.shift ? null : altPrefix(ESC);
    case "backspace":
      return spec.ctrl || spec.shift ? null : altPrefix("\u007f");
    case "tab":
      if (spec.ctrl) return null;
      if (spec.shift) return spec.alt ? null : `${ESC}[Z`;
      return altPrefix("\t");
    default:
      break;
  }
  // 1 文字（記号名・space を含む）。shift は英字にだけ効く（記号と space では無視する。design「解釈の細則」）。
  const c = spec.key;
  if (spec.ctrl) {
    const code = ctrlChar(c);
    return code === null ? null : altPrefix(code);
  }
  return altPrefix(spec.shift && /^[a-z]$/.test(c) ? c.toUpperCase() : c);
}
