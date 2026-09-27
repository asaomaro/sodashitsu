import { ACTIONS, actionDef, DEFAULT_PREFIX, type ActionId } from "./bindings.js";
import {
  formatBinding,
  formatChord,
  isDirectChord,
  parseBinding,
  parseChord,
  prefixBytes,
} from "./chord.js";
import { NAVIGATE_KEYS, NAVIGATE_RESERVED_CHORDS, navigateKeyDef, type NavigateKeyId } from "./navigateKeys.js";
import { COMMAND_ID_RE } from "@wtm/protocol";
import { commandIdOf, isCommandKeyId, type KeyTargetId } from "./commandKeys.js";

/** 保存しておく独自コマンドの割り当ての数の上限（一覧から消えたコマンドの分も残すので、際限なく溜めない）。 */
export const COMMAND_BINDINGS_MAX = 200;

/**
 * このブラウザに保存する割り当て（20260921-keybinding-customization。design「保存」・D2。navigate の
 * 6操作は 20260923-navigate-mode-keys で追加）。**既定との差だけ**を持つ——既定を保存しないので、
 * 更新で既定が変わっても差の無い操作には届く。`wtm.prefs.v1` の `keys` に `{ prefix?, bindings?, navigate? }`
 * （差が無ければ `keys` ごと消す）。
 *
 * 読み込みは**値ごとに落とす**（残りは生かす。`store/settings.ts` の他の設定と同じ流儀）。**衝突・予約の判定はここではしない**——`keymap.ts` の `resolveKeymap`／
 * `navigateKeymap.ts` の `resolveNavigateKeymap` が読み込みも編集も同じ規則で行う（D7）。
 */
export interface KeyPrefs {
  /** 上書きした prefix の chord。null は既定（`ctrl+b`）。 */
  prefix: string | null;
  /** 上書きした操作の割り当て（`prefix+v`・`ctrl+alt+d` の正規形の文字列）。`[]` は「割り当てなし」（既定へ戻すのではない）。 */
  bindings: Partial<Record<ActionId, string[]>>;
  /** 上書きした navigate モードの移動操作の割り当て（prefix なしの正規形の chord文字列。`[]` は「割り当てなし」）。
   *  `bindings` とは別の表（design D2）。20260923-navigate-mode-keys。 */
  navigateKeys: Partial<Record<NavigateKeyId, string[]>>;
  /**
   * 独自コマンドの割り当て（20260927-custom-command-keys）。鍵はコマンドの id（サーバの `commands.json` で持ち主が付けたもの）。既定が無いので、空の一覧は
   * 持たない（「無い」と同じ）。**サーバの一覧に無い id の分も残す**（設定ファイルを直して戻せば効く）。解決（`resolveKeymap`）は一覧にある分だけを載せる。
   */
  commands: Record<string, string[]>;
}

export function emptyKeyPrefs(): KeyPrefs {
  return { prefix: null, bindings: {}, navigateKeys: {}, commands: {} };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * prefix の chord を読む。**端末へ送れる形だけ**（D5。`prefixBytes` が列を返すもの）。読めない・送れない形は undefined。
 * 既定（`ctrl+b`）は正規形の `ctrl+b` を返す（「差が無い」の判断は呼ぶ側）。
 */
export function parsePrefix(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const parts = parseChord(raw);
  if (parts === null) return undefined;
  const chord = formatChord(parts);
  return prefixBytes(chord) === null ? undefined : chord;
}

/** 保存された prefix を読む。読めない・送れない形は null（＝既定）。既定と同じ値も null（差が無い）。 */
export function loadPrefix(raw: unknown): string | null {
  const chord = parsePrefix(raw);
  return chord === undefined || chord === DEFAULT_PREFIX ? null : chord;
}

/**
 * 1 つの割り当ての文字列を、その操作で有効な**正規の文字列**にする。無効は null。
 * 範囲（`1..9`）は範囲の操作でだけ・範囲の操作は範囲でだけ。直接のキーは「ctrl・alt・cmd を含む chord か F キー」（`isDirectChord`）だけ。
 */
export function normalizeBinding(id: ActionId, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const b = parseBinding(raw);
  if (b === null) return null;
  const indexed = actionDef(id)?.indexed === true;
  if (b.range !== indexed) return null;
  if (b.via === "direct" && !isDirectChord(b.chord)) return null;
  return formatBinding(b);
}

/** 割り当ての一覧を正規の文字列にし、無効・重複を落とす（順序は保つ）。独自コマンドは範囲でない操作と同じ規則。 */
function normalizeList(id: KeyTargetId, raw: readonly unknown[]): string[] {
  const list: string[] = [];
  for (const s of raw) {
    const n = isCommandKeyId(id) ? normalizePlainBinding(s) : normalizeBinding(id, s);
    if (n !== null && !list.includes(n)) list.push(n);
  }
  return list;
}

/** 範囲でない割り当て（独自コマンド）を正規の文字列にする。規則は範囲でない操作の `normalizeBinding` と同じ。 */
function normalizePlainBinding(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const b = parseBinding(raw);
  if (b === null || b.range) return null;
  if (b.via === "direct" && !isDirectChord(b.chord)) return null;
  return formatBinding(b);
}

/**
 * navigate 6操作の1つの割り当て文字列を正規形にする。無効は null。`prefix+`/範囲の概念が無いので
 * `parseBinding`/`formatBinding` ではなく `parseChord`/`formatChord` を直接使う（design「KeyPrefs の拡張」）。
 * 予約キー（`NAVIGATE_RESERVED_CHORDS`）は既定・上書きのどちらでも無効（AC2）。
 */
export function normalizeNavigateBinding(_id: NavigateKeyId, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const parts = parseChord(raw);
  if (parts === null) return null;
  const chord = formatChord(parts);
  return NAVIGATE_RESERVED_CHORDS.has(chord) ? null : chord;
}

/** navigate 用の割り当ての一覧を正規の文字列にし、無効・重複を落とす（順序は保つ）。 */
function normalizeNavigateList(id: NavigateKeyId, raw: readonly unknown[]): string[] {
  const list: string[] = [];
  for (const s of raw) {
    const n = normalizeNavigateBinding(id, s);
    if (n !== null && !list.includes(n)) list.push(n);
  }
  return list;
}

/** `wtm.prefs.v1` の `keys` を読む。形が違えば空（既定）。 */
export function loadKeyPrefs(raw: unknown): KeyPrefs {
  const prefs = emptyKeyPrefs();
  if (!isRecord(raw)) return prefs;
  prefs.prefix = loadPrefix(raw["prefix"]);
  const stored = raw["bindings"];
  if (isRecord(stored)) {
    for (const def of ACTIONS) {
      // カタログの順に読む（結果が決定的になる）。未知の操作の項目は読まれない。
      const value = stored[def.id];
      if (!Array.isArray(value)) continue;
      const list = normalizeList(def.id, value);
      if (list.length === 0 && value.length > 0) continue; // 全部落ちたら、上書きを消して既定へ戻す（元から `[]` のときだけ「割り当てなし」）
      if (sameList(list, def.defaults)) continue; // 既定と同じ内容は「差」ではない
      prefs.bindings[def.id] = list;
    }
  }
  const storedCommands = raw["commands"];
  if (isRecord(storedCommands)) {
    for (const commandId of Object.keys(storedCommands).sort()) {
      if (Object.keys(prefs.commands).length >= COMMAND_BINDINGS_MAX) break;
      if (!COMMAND_ID_RE.test(commandId)) continue;
      const value = storedCommands[commandId];
      if (!Array.isArray(value)) continue;
      const list = normalizeList(`command:${commandId}`, value);
      if (list.length > 0) prefs.commands[commandId] = list;
    }
  }
  const storedNavigate = raw["navigate"];
  if (isRecord(storedNavigate)) {
    for (const def of NAVIGATE_KEYS) {
      const value = storedNavigate[def.id];
      if (!Array.isArray(value)) continue;
      const list = normalizeNavigateList(def.id, value);
      if (list.length === 0 && value.length > 0) continue;
      if (sameList(list, def.defaults)) continue;
      prefs.navigateKeys[def.id] = list;
    }
  }
  return prefs;
}

/** 保存する形。差が無ければ undefined（`keys` ごと消す）。カタログの順に並べる。 */
export function serializeKeyPrefs(
  p: KeyPrefs,
):
  | { prefix?: string; bindings?: Record<string, string[]>; navigate?: Record<string, string[]>; commands?: Record<string, string[]> }
  | undefined {
  const out: {
    prefix?: string;
    bindings?: Record<string, string[]>;
    navigate?: Record<string, string[]>;
    commands?: Record<string, string[]>;
  } = {};
  if (p.prefix !== null) out.prefix = p.prefix;
  const bindings: Record<string, string[]> = {};
  for (const def of ACTIONS) {
    const list = p.bindings[def.id];
    if (list !== undefined) bindings[def.id] = [...list];
  }
  if (Object.keys(bindings).length > 0) out.bindings = bindings;
  const navigate: Record<string, string[]> = {};
  for (const def of NAVIGATE_KEYS) {
    const list = p.navigateKeys[def.id];
    if (list !== undefined) navigate[def.id] = [...list];
  }
  if (Object.keys(navigate).length > 0) out.navigate = navigate;
  const commands: Record<string, string[]> = {};
  for (const commandId of Object.keys(p.commands).sort()) {
    const list = p.commands[commandId];
    if (list !== undefined && list.length > 0) commands[commandId] = [...list];
  }
  if (Object.keys(commands).length > 0) out.commands = commands;
  return out.prefix === undefined && out.bindings === undefined && out.navigate === undefined && out.commands === undefined
    ? undefined
    : out;
}

/**
 * ある操作の割り当てを差し替えた新しい `KeyPrefs`（store の setter の下請け）。無効な文字列は落とし（渡されたら反映しない）、
 * **既定と同じ内容になったら上書きを消す**（保存を最小に保ち、既定の更新が届く）。全部無効で空でない入力は、何も変えない。
 */
export function withBindings(prefs: KeyPrefs, id: KeyTargetId, list: readonly string[]): KeyPrefs {
  const norm = normalizeList(id, list);
  if (norm.length === 0 && list.length > 0) return prefs;
  if (isCommandKeyId(id)) {
    // 独自コマンドは既定が無いので、空は「上書きを消す」と同じ。
    const commandId = commandIdOf(id);
    if (!COMMAND_ID_RE.test(commandId)) return prefs;
    // 保存しておく数の上限（読み込みと同じ）。新しいコマンドを足すときだけ見る（既にあるものの差し替え・削除は通す）。
    if (norm.length > 0 && !Object.hasOwn(prefs.commands, commandId) && Object.keys(prefs.commands).length >= COMMAND_BINDINGS_MAX) return prefs;
    const commands = { ...prefs.commands };
    if (norm.length === 0) delete commands[commandId];
    else commands[commandId] = norm;
    return { ...prefs, commands };
  }
  const bindings = { ...prefs.bindings };
  if (sameList(norm, actionDef(id)?.defaults ?? [])) delete bindings[id];
  else bindings[id] = norm;
  return { ...prefs, bindings };
}

/** prefix を差し替えた新しい `KeyPrefs`。null は既定へ戻す。無効な chord は何も変えない。既定と同じなら上書きを消す。 */
export function withPrefix(prefs: KeyPrefs, chord: string | null): KeyPrefs {
  if (chord === null) return { ...prefs, prefix: null };
  const parsed = parsePrefix(chord);
  if (parsed === undefined) return prefs;
  return { ...prefs, prefix: parsed === DEFAULT_PREFIX ? null : parsed };
}

/** ある操作の上書きを消す（既定へ戻す）。 */
export function withoutBindings(prefs: KeyPrefs, id: KeyTargetId): KeyPrefs {
  if (isCommandKeyId(id)) {
    const commandId = commandIdOf(id);
    if (!Object.hasOwn(prefs.commands, commandId)) return prefs;
    const commands = { ...prefs.commands };
    delete commands[commandId];
    return { ...prefs, commands };
  }
  if (prefs.bindings[id] === undefined) return prefs;
  const bindings = { ...prefs.bindings };
  delete bindings[id];
  return { ...prefs, bindings };
}

/**
 * navigate の1操作の割り当てを差し替えた新しい `KeyPrefs`（`withBindings` と同型。20260923-navigate-mode-keys）。
 * 無効な文字列は落とし、既定と同じ内容になったら上書きを消す。全部無効で空でない入力は何も変えない。
 */
export function withNavigateBinding(
  prefs: KeyPrefs,
  id: NavigateKeyId,
  list: readonly string[],
): KeyPrefs {
  const norm = normalizeNavigateList(id, list);
  if (norm.length === 0 && list.length > 0) return prefs;
  const navigateKeys = { ...prefs.navigateKeys };
  if (sameList(norm, navigateKeyDef(id)?.defaults ?? [])) delete navigateKeys[id];
  else navigateKeys[id] = norm;
  return { ...prefs, navigateKeys };
}

/** navigate の1操作の上書きを消す（既定へ戻す）。 */
export function withoutNavigateBinding(prefs: KeyPrefs, id: NavigateKeyId): KeyPrefs {
  if (prefs.navigateKeys[id] === undefined) return prefs;
  const navigateKeys = { ...prefs.navigateKeys };
  delete navigateKeys[id];
  return { ...prefs, navigateKeys };
}
