import type { KeyInput } from "./actions.js";
import { actionDef, DEFAULT_PREFIX, type ActionId } from "./bindings.js";
import {
  chordOf,
  chordToKeyInput,
  expandRange,
  formatBinding,
  formatChord,
  isAltGrComposed,
  isDirectChord,
  isModifierOnly,
  parseBinding,
  parseChord,
  prefixBytes,
} from "./chord.js";
import {
  withBindings,
  withoutBindings,
  withoutNavigateBinding,
  withPrefix,
  emptyKeyPrefs,
  type KeyPrefs,
} from "./keyPrefs.js";
import {
  RESERVED_AFTER_PREFIX,
  RESERVED_DIRECT,
  resolveKeymap,
  type ResolvedKeymap,
} from "./keymap.js";
import { navigateKeyDef, NAVIGATE_RESERVED_CHORDS, type NavigateKeyId } from "./navigateKeys.js";
import { isCommandKeyId, type KeyTargetId } from "./commandKeys.js";
import { resolveNavigateKeymap, type ResolvedNavigateKeymap } from "./navigateKeymap.js";

/**
 * 取り込んだキーを割り当てにできるかの検証・戻し・おすすめの追加（20260921-keybinding-customization。design「取り込みの検証」）。**純粋**——DOM にも Vue にも store にも依存しない
 * （設定画面 `KeySettings.vue` が、通った結果を store の setter へ渡す）。
 */

/** 何を割り当てようとしているか。`replacing` は置き換える割り当ての文字列（［変更］。追加なら省く）。 */
export type AssignTarget =
  | { kind: "prefix" }
  | { kind: "binding"; id: KeyTargetId; via: "prefix" | "direct"; replacing?: string };

/**
 * 検証の結果。通れば `binding`（prefix なら chord・割り当てなら `prefix+shift+h` 等の正規形の文字列）。通らなければ画面に出す理由。
 * `ignore` は**取り込み待ちを続ける**もの（修飾キー単体・IME の変換中・押しっぱなしの繰り返し・keydown 以外）——chord の途中で押されるので、拒否ではなく待つ。
 * `reason` は空でないときだけ画面に出す。
 */
export type AssignResult =
  | { ok: true; binding: string }
  | {
      ok: false;
      reason: string;
      ignore?: true;
      /**
       * 衝突相手（20260922-keybinding-usability。design「US2」）。**「こちらへ移す」が出せるときだけ付く**——
       * owner が単一の（範囲でない）chord としてこの binding を持っているとき限定。範囲の操作の一部など、
       * 単一の chord として特定できないときは付けない（AC7）。
       */
      conflict?: { ownerId: KeyTargetId; via: "prefix" | "direct"; chord: string };
    };

const IGNORE_SILENT: AssignResult = { ok: false, ignore: true, reason: "" };

/** 画面に出すキーの表記（`prefix+v`・`ctrl+alt+d`）。 */
function display(via: "prefix" | "direct", chord: string): string {
  return via === "prefix" ? `prefix+${chord}` : chord;
}

/** 範囲の操作か（独自コマンドは範囲にならない）。 */
function isIndexed(id: KeyTargetId): boolean {
  return !isCommandKeyId(id) && actionDef(id)?.indexed === true;
}

/**
 * 取り込んだキー `k` を `target` に割り当てられるか。判定の規則は requirements の AC6（(a)〜(g)）・AC3（prefix の形）・AC7（範囲）。
 * **読み込みの検証（`resolveKeymap`）と同じ規則の取り込み側**——ただし (e)（AltGr）はイベントの状態なので、ここだけ。
 */
export function validateAssignment(
  km: ResolvedKeymap,
  target: AssignTarget,
  k: KeyInput,
): AssignResult {
  // chord の途中・確定でないもの：待ち続ける。
  if (k.type !== "keydown" || k.composing || k.repeat === true) return IGNORE_SILENT;
  if (isModifierOnly(k))
    return {
      ok: false,
      ignore: true,
      reason: "修飾キーだけでは割り当てられません。続けてほかのキーを押してください。",
    };

  // (e) AltGr で合成された文字は、キー配列によって変わるので割り当てに使えない。
  if (isAltGrComposed(k))
    return { ok: false, reason: "AltGr で入力する文字は、キーの割り当てに使えません。" };
  const chord = chordOf(k);
  if (chord === null) return { ok: false, reason: "このキーは割り当てに使えません。" };

  if (target.kind === "prefix") return validatePrefix(km, chord);
  return validateBinding(km, target, k, chord);
}

function validatePrefix(km: ResolvedKeymap, chord: string): AssignResult {
  if (prefixBytes(chord) === null) {
    return {
      ok: false,
      reason:
        "prefix には、ctrl+英字・alt+1 文字・ctrl+alt+英字・F1〜F12（修飾なし）だけを使えます（prefix を 2 回押したとき、そのキーを端末へ送れる形。shift・数字・名前のあるキー・cmd は使えません）。",
    };
  }
  if (chord === km.prefix) return { ok: true, binding: chord }; // いまの prefix と同じ（何も変わらない）
  // (b)(g) の prefix 側から：すでに prefix の後のキー・直接のキーとして使われているキーは prefix にできない。
  const after = km.ownerOf("prefix", chord);
  if (after !== null)
    return {
      ok: false,
      reason: `${chord} は「${km.labelOf(after)}」の prefix の後のキーに使われているので、prefix にできません。`,
    };
  const direct = km.ownerOf("direct", chord);
  if (direct !== null)
    return {
      ok: false,
      reason: `${chord} は「${km.labelOf(direct)}」の直接のキーに使われているので、prefix にできません。`,
    };
  return { ok: true, binding: chord };
}

function validateBinding(
  km: ResolvedKeymap,
  target: Extract<AssignTarget, { kind: "binding" }>,
  k: KeyInput,
  chord: string,
): AssignResult {
  const { id, via } = target;
  const indexed = isIndexed(id);

  // 形の規則（AC5・AC6 の (c)(d)(f)）。
  if (via === "direct") {
    const reservedDirect = RESERVED_DIRECT.get(chord);
    if (reservedDirect !== undefined) return { ok: false, reason: reservedDirect }; // (f)
    if (!isDirectChord(chord)) {
      return {
        ok: false,
        reason:
          "修飾キーの無い文字・shift だけを付けたキー・tab や矢印などは端末への入力を奪うので、直接のキーにできません。ctrl や alt と組み合わせてください。",
      }; // (d)
    }
    if (chord === km.prefix)
      return { ok: false, reason: `prefix（${km.prefix}）と同じキーは、直接のキーにできません。` }; // (g)
  } else {
    const reserved = RESERVED_AFTER_PREFIX.get(chord);
    if (reserved !== undefined) return { ok: false, reason: reserved }; // (c)
    if (chord === km.prefix)
      return {
        ok: false,
        reason: `prefix（${km.prefix}）と同じキーは、prefix の後のキーにできません（prefix を 2 回押すと、そのキーを端末へ送るため）。`,
      }; // (b)
  }

  // 範囲の操作（AC7）：数字（1〜9）だけ。shift を伴う数字は範囲にしない。
  const parts = parseChord(chord);
  if (parts === null) return { ok: false, reason: "このキーは割り当てに使えません。" };
  if (indexed) {
    if (!/^[1-9]$/.test(parts.key))
      return { ok: false, reason: "この操作は 1〜9 の数字のキーで割り当てます。" };
    if (k.shift)
      return {
        ok: false,
        reason: "shift を伴う数字は範囲にできません（キー配列によって別の記号になるため）。",
      };
  }

  // 割り当てる chord の一覧（範囲は 9 個）。それぞれを、prefix と持ち主に照らす。
  const chords = indexed ? expandRange(chord) : [chord];
  const replaced = replacedChords(target);
  for (const c of chords) {
    if (c === km.prefix)
      return {
        ok: false,
        reason: `prefix（${km.prefix}）と同じキーは、${via === "prefix" ? "prefix の後" : "直接"}のキーにできません。`,
      };
    const owner = km.ownerOf(via, c);
    if (owner === null) continue;
    if (owner !== id) {
      const single = formatBinding({ via, chord: c, range: false });
      // 範囲の一部など、単一の chord として特定できないときは conflict を付けない（AC7）。
      const conflict = km.bindingsOf(owner).includes(single)
        ? { conflict: { ownerId: owner, via, chord: c } }
        : {};
      return {
        ok: false,
        reason: `${display(via, c)} は「${km.labelOf(owner)}」がすでに使っています。`,
        ...conflict,
      }; // (a)
    }
    if (!replaced.has(c))
      return { ok: false, reason: `${display(via, c)} はこの操作にすでに割り当てられています。` };
  }
  return { ok: true, binding: formatBinding({ via, chord, range: indexed }) };
}

/** 置き換える割り当て（`replacing`）が持っている chord。置き換えるので、その chord は自分の持ち物として許す。 */
function replacedChords(target: Extract<AssignTarget, { kind: "binding" }>): Set<string> {
  const out = new Set<string>();
  if (target.replacing === undefined) return out;
  const b = parseBinding(target.replacing);
  if (b === null || b.via !== target.via) return out;
  for (const c of b.range ? expandRange(b.chord) : [b.chord]) out.add(c);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// 戻し（AC9）とおすすめの直接のキー（AC10）
// ---------------------------------------------------------------------------------------------------------------------

/** 何を既定へ戻すか。 */
export type ResetTarget =
  { kind: "action"; id: KeyTargetId } | { kind: "prefix" } | { kind: "all" };

/** 戻せなかった既定の割り当て（別の操作が使っている・prefix と同じ）と理由。 */
export interface SkippedBinding {
  binding: string;
  reason: string;
}

export type ResetPlan =
  { ok: true; prefs: KeyPrefs; skipped: SkippedBinding[] } | { ok: false; reason: string };

/**
 * 既定へ戻したあとの `KeyPrefs` を作る（設定画面の［既定に戻す］の下請け。design「戻し方」）。
 * - **すべて**：`keys` を消す（AC2 の状態と同じ）。
 * - **操作ごと**：その操作の上書きを消す。**既定のキーを別の操作が使っていればその分は戻さず**、`skipped` で返す（上書きが既定に勝つ。D7）。
 * - **prefix**：既定（`ctrl+b`）が、いま prefix の後・直接のキーに使われていれば拒否する（通常の prefix の変更と同じ規則）。
 */
export function planReset(km: ResolvedKeymap, prefs: KeyPrefs, target: ResetTarget): ResetPlan {
  switch (target.kind) {
    case "all":
      return { ok: true, prefs: emptyKeyPrefs(), skipped: [] };
    case "prefix": {
      const r = validateAssignment(km, { kind: "prefix" }, chordToKeyInput(DEFAULT_PREFIX));
      if (!r.ok) return { ok: false, reason: r.reason };
      return { ok: true, prefs: withPrefix(prefs, null), skipped: [] };
    }
    case "action": {
      const next = withoutBindings(prefs, target.id);
      const after = resolveKeymap(next, km.commands).keymap; // 独自コマンドの一覧を引き継ぐ（落とすとその割り当てとの重なりが見えない）
      const effective = new Set(after.bindingsOf(target.id));
      const skipped: SkippedBinding[] = [];
      const defaults = isCommandKeyId(target.id) ? [] : (actionDef(target.id)?.defaults ?? []); // 独自コマンドに既定は無い
      for (const binding of defaults) {
        if (effective.has(binding)) continue;
        skipped.push({ binding, reason: whyNotRestored(after, binding) });
      }
      return { ok: true, prefs: next, skipped };
    }
  }
}

/** 既定の割り当てが戻らなかった理由（持ち主の名前）。 */
function whyNotRestored(km: ResolvedKeymap, binding: string): string {
  const b = parseBinding(binding);
  if (b === null) return "読めない割り当てです";
  for (const c of b.range ? expandRange(b.chord) : [b.chord]) {
    const owner = km.ownerOf(b.via, c);
    if (owner !== null) return `${display(b.via, c)} は「${km.labelOf(owner)}」が使っています`;
    if (c === km.prefix) return `prefix（${km.prefix}）と同じキーです`;
  }
  return "ほかの割り当てと重なっています";
}

/**
 * herdr が文書で勧める prefix なしの直接のキー（`keyboard.mdx`「Going prefix-free」）。**`ctrl+alt` は端末・デスクトップがほぼ使わず、macOS の Option の文字化けの影響も受けない**。
 * 各操作の現在の割り当てに**足す**（prefix の後のキーは残す）。
 */
export const RECOMMENDED_DIRECT: ReadonlyArray<readonly [ActionId, string]> = [
  ["focus_pane_left", "ctrl+alt+h"],
  ["focus_pane_down", "ctrl+alt+j"],
  ["focus_pane_up", "ctrl+alt+k"],
  ["focus_pane_right", "ctrl+alt+l"],
  ["previous_tab", "ctrl+alt+["],
  ["next_tab", "ctrl+alt+]"],
  ["new_tab", "ctrl+alt+c"],
  ["split_vertical", "ctrl+alt+d"],
  ["split_horizontal", "ctrl+alt+shift+d"],
  ["zoom", "ctrl+alt+z"],
];

export interface RecommendedResult {
  prefs: KeyPrefs;
  /** 足せたもの（表に書かれた割り当て文字列そのまま。`ctrl+alt+h`・`prefix+%` 等）。 */
  added: string[];
  /** すでにその操作が持っていたもの（何もしない）。 */
  already: string[];
  /** 足せなかったもの（別の操作が使っている・prefix と同じ・読めない）と理由。 */
  skipped: { id: ActionId; binding: string; reason: string }[];
}

/**
 * プリセット（一式）を足す（AC10。20260922-keybinding-presets で `RECOMMENDED_DIRECT` 専用から
 * 一般化——design「`assign.ts` の一般化」）。**冪等**（すでに持っていれば何もしない）。表の各エントリの
 * 割り当て文字列は `ActionDef.defaults` と同じ書式（`prefix+…` も bare の直接のキーも可）で、
 * `parseBinding` で `via`/chord に分けたうえで、1 つずつ通常の取り込みと同じ検証（`validateAssignment`）
 * を通す。通らないものは足さずに理由を返す。足すたびに表を作り直すので、一式の中の重なりも見える
 * （`set` は一式の差し替え。既定は herdr のおすすめ。一式の中の重なりを試すテストが使う）。
 */
export function applyRecommended(
  km: ResolvedKeymap,
  prefs: KeyPrefs,
  set: ReadonlyArray<readonly [ActionId, string]> = RECOMMENDED_DIRECT,
): RecommendedResult {
  let current = prefs;
  let working = km;
  const result: RecommendedResult = { prefs, added: [], already: [], skipped: [] };
  for (const [id, binding] of set) {
    if (working.bindingsOf(id).includes(binding)) {
      result.already.push(binding);
      continue;
    }
    const parsed = parseBinding(binding);
    if (parsed === null) {
      result.skipped.push({ id, binding, reason: "読めない割り当てです。" });
      continue;
    }
    const r = validateAssignment(
      working,
      { kind: "binding", id, via: parsed.via },
      chordToKeyInput(parsed.chord),
    );
    if (!r.ok) {
      result.skipped.push({ id, binding, reason: r.reason });
      continue;
    }
    current = withBindings(current, id, [...working.bindingsOf(id), r.binding]);
    working = resolveKeymap(current, km.commands).keymap; // 独自コマンドの割り当てとの重なりも見る
    result.added.push(binding);
  }
  result.prefs = current;
  return result;
}

// ---------------------------------------------------------------------------------------------------------------------
// navigate モードの6操作（20260923-navigate-mode-keys。design「取り込みの検証（keys/assign.ts）」）
// ---------------------------------------------------------------------------------------------------------------------

/** navigate の1操作への割り当て。`replacing` は置き換える割り当ての chord（［変更］。追加なら省く）。 */
export type NavigateAssignTarget = { kind: "navigateKey"; id: NavigateKeyId; replacing?: string };

function navigateLabelOf(id: NavigateKeyId): string {
  return navigateKeyDef(id)?.label ?? id;
}

/**
 * 取り込んだキー `k` を navigate の1操作へ割り当てられるか（design「取り込みの検証」手順1〜8）。
 * 既存34〜35操作の `validateAssignment`/`validateBinding` と同じ骨格だが、prefix 概念・`isDirectChord`
 * の modifier 必須規則を持たない——navigate モードは端末入力を奪う心配が無いので、bare な単一文字も
 * 許す（decisions D2）。**`conflict` は常に付けない**（「こちらへ移す」は navigate 側には設けない設計方針。
 * design「設計方針」）。
 */
export function validateNavigateAssignment(
  km: ResolvedNavigateKeymap,
  target: NavigateAssignTarget,
  k: KeyInput,
): AssignResult {
  // chord の途中・確定でないもの：待ち続ける（既存34〜35操作と同じ判定）。
  if (k.type !== "keydown" || k.composing || k.repeat === true) return IGNORE_SILENT;
  if (isModifierOnly(k))
    return {
      ok: false,
      ignore: true,
      reason: "修飾キーだけでは割り当てられません。続けてほかのキーを押してください。",
    };
  if (isAltGrComposed(k))
    return { ok: false, reason: "AltGr で入力する文字は、キーの割り当てに使えません。" };
  const chord = chordOf(k);
  if (chord === null) return { ok: false, reason: "このキーは割り当てに使えません。" };

  if (NAVIGATE_RESERVED_CHORDS.has(chord))
    return {
      ok: false,
      reason: `${chord} は navigate モードの中で予約されているキーなので、割り当てられません。`,
    };

  const { id, replacing } = target;
  const owner = km.ownerOf(chord);
  if (owner !== null && owner !== id)
    return { ok: false, reason: `${chord} は「${navigateLabelOf(owner)}」がすでに使っています。` };
  if (owner === id && chord !== replacing)
    return { ok: false, reason: `${chord} はこの操作にすでに割り当てられています。` };

  return { ok: true, binding: chord };
}

/** navigate の1操作を既定へ戻す対象。「すべて」は既存の `resetAllKeys`（`emptyKeyPrefs()`）が
 *  `navigateKeys` も一緒に既定へ戻すのでここには無い（design「設計方針」）。 */
export type NavigateResetTarget = { kind: "navigateKey"; id: NavigateKeyId };

/**
 * ある navigate 操作を既定へ戻したあとの `KeyPrefs`（`planReset` の `"action"` 分岐と同型）。
 * 既定のキーを別の navigate 操作が使っていれば、その分は戻さず `skipped` で返す（上書きが既定に勝つ）。
 */
export function planNavigateReset(
  km: ResolvedNavigateKeymap,
  prefs: KeyPrefs,
  target: NavigateResetTarget,
): ResetPlan {
  const next = withoutNavigateBinding(prefs, target.id);
  const after = resolveNavigateKeymap(next.navigateKeys).keymap;
  const effective = new Set(after.bindingsOf(target.id));
  const skipped: SkippedBinding[] = [];
  for (const binding of navigateKeyDef(target.id)?.defaults ?? []) {
    if (effective.has(binding)) continue;
    skipped.push({ binding, reason: whyNavigateNotRestored(after, binding) });
  }
  return { ok: true, prefs: next, skipped };
}

/** 既定の割り当てが戻らなかった理由（持ち主の名前）。`whyNotRestored`（34〜35操作向け）と同型。 */
function whyNavigateNotRestored(km: ResolvedNavigateKeymap, binding: string): string {
  const parts = parseChord(binding);
  if (parts === null) return "読めない割り当てです";
  const owner = km.ownerOf(formatChord(parts));
  return owner !== null
    ? `${binding} は「${navigateLabelOf(owner)}」が使っています`
    : "ほかの割り当てと重なっています";
}
