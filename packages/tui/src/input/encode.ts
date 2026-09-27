import type { KeyInput } from "@sodashitsu/client-core";

/** pane へ送る列を決めるのに要る pane のモード（headless の `modes` の一部）。 */
export interface PaneInputModes {
  applicationCursorKeysMode: boolean;
  bracketedPasteMode: boolean;
}

const CURSOR_FINALS: Readonly<Record<string, string>> = {
  ArrowUp: "A",
  ArrowDown: "B",
  ArrowRight: "C",
  ArrowLeft: "D",
  Home: "H",
  End: "F",
};

/** modifyOtherKeys（`CSI 27;…~`）・CSI u（`CSI …u`）の列か（pane は解さないので従来の列へ直す）。 */
function isExtendedKeyRaw(raw: string): boolean {
  if (!raw.startsWith("\x1b[")) return false;
  const body = raw.slice(2);
  return /^27;\d+;\d+~$/.test(body) || /^\d+(?:;\d+)?u$/.test(body);
}

function ctrlByte(ch: string): string | null {
  const lower = ch.toLowerCase();
  if (ch === " " || ch === "@" || ch === "2") return "\x00";
  if (lower >= "a" && lower <= "z" && lower.length === 1)
    return String.fromCharCode(lower.charCodeAt(0) - 96);
  if ("[\\]^_".includes(ch) && ch.length === 1) return String.fromCharCode(ch.charCodeAt(0) & 0x1f);
  if (ch === "?") return "\x7f";
  return null;
}

/** `KeyInput` → xterm の既定の符号化（従来の列）。表せなければ null。 */
export function legacyBytes(k: KeyInput): string | null {
  const alt = k.alt ? "\x1b" : "";
  switch (k.key) {
    case "Enter":
      return `${alt}\r`;
    case "Tab":
      return k.shift ? "\x1b[Z" : `${alt}\t`;
    case "Escape":
      return `${alt}\x1b`;
    case "Backspace":
      return `${alt}${k.ctrl ? "\x08" : "\x7f"}`;
    default:
      break;
  }
  if ([...k.key].length !== 1) return null;
  if (k.ctrl) {
    const c = ctrlByte(k.key);
    return c === null ? null : `${alt}${c}`;
  }
  return `${alt}${k.key}`;
}

/**
 * pane へ送るキーの列（20260927-cli-mode の design「入力」）。外側の端末が作った列を基本にそのまま送り、次だけ作り直す:
 * - 修飾の無い矢印・Home/End は pane の DECCKM に合わせる（`CSI A` ↔ `SS3 A`。外側の端末は通常モードのまま。research §3.3）。
 * - modifyOtherKeys・CSI u の列は pane が解さないので、xterm の既定の符号化へ直す（kitty keyboard は使わない。design「入力」）。
 */
export function encodeKey(ev: { key: KeyInput; raw: string }, modes: PaneInputModes): string {
  const { key: k, raw } = ev;
  const final = CURSOR_FINALS[k.key];
  if (final && !k.ctrl && !k.alt && !k.shift && !k.meta)
    return `${modes.applicationCursorKeysMode ? "\x1bO" : "\x1b["}${final}`;
  if (isExtendedKeyRaw(raw)) return legacyBytes(k) ?? raw;
  return raw;
}

/** 貼り付け：pane がブラケットペーストを有効にしていれば包む。本文の終わりの印は取り除く（包みの抜け出し対策。research §3.3）。 */
export function encodePaste(text: string, modes: PaneInputModes): string {
  if (!modes.bracketedPasteMode) return text;
  return `\x1b[200~${text.split("\x1b[201~").join("")}\x1b[201~`;
}
