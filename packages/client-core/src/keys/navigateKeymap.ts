import type { Action } from "./actions.js";
import { formatChord, parseChord } from "./chord.js";
import {
  NAVIGATE_KEYS,
  NAVIGATE_RESERVED_CHORDS,
  navigateKeyDef,
  type NavigateKeyId,
} from "./navigateKeys.js";

/**
 * navigate の6操作の解決した表（20260923-navigate-mode-keys。design「インターフェース / データ構造 >
 * 解決した表」）。`keymap.ts` の `resolveKeymap` と同じ設計（カタログ＋上書きから解決・上書きが既定に
 * 勝つ・予約キーは登録時に落とす）を、prefix 概念と `isDirectChord` の modifier 必須規則を除いて踏襲する。
 */
export interface ResolvedNavigateKeymap {
  /** ある操作の有効な割り当て（表示用）。無ければ空。 */
  bindingsOf(id: NavigateKeyId): readonly string[];
  /** その chord を使っている操作。無ければ null。 */
  ownerOf(chord: string): NavigateKeyId | null;
  /** その chord に割り当てられた `Action`。無ければ undefined。 */
  actionFor(chord: string): Action | undefined;
}

/**
 * カタログと上書きから表を作る（純粋）。`keymap.ts` の `resolveKeymap` と同じ2段階登録
 * （1. 上書きのある操作をカタログ順に登録 2. 上書きの無い操作、または上書きが1つ以上あるのに1つも
 * 登録できなかった操作は既定を登録し直す）。予約キー・衝突は `problems` に記録してその chord だけ落とす
 * （`source: "user"` のときだけ記録。既定の登録失敗は起こらないことを `navigateKeymap.test.ts` で保証する）。
 */
export function resolveNavigateKeymap(prefs: Partial<Record<NavigateKeyId, string[]>>): {
  keymap: ResolvedNavigateKeymap;
  problems: string[];
} {
  const problems: string[] = [];
  const chordMap = new Map<string, NavigateKeyId>();
  const effective = new Map<NavigateKeyId, string[]>();

  const register = (id: NavigateKeyId, raw: string, source: "user" | "default"): void => {
    const parts = parseChord(raw);
    if (parts === null) {
      if (source === "user") problems.push(`${id}: 「${raw}」は読めないので落としました`);
      return;
    }
    const chord = formatChord(parts);
    if (NAVIGATE_RESERVED_CHORDS.has(chord)) {
      if (source === "user")
        problems.push(`${id}: 「${raw}」を落としました（${chord} は navigate モードで予約されています）`);
      return;
    }
    // `keymap.ts` の `resolveKeymap` と同じく、自分自身が既に持っている chord への再登録も「すでに
    // 使っています」で落とす（重複排除は上流＝`keyPrefs.ts` の正規化が担う。ここでは踏襲しない）。
    const owner = chordMap.get(chord);
    if (owner !== undefined) {
      if (source === "user")
        problems.push(`${id}: 「${raw}」を落としました（${chord} はすでに ${owner} が使っています）`);
      return;
    }
    chordMap.set(chord, id);
    const list = effective.get(id) ?? [];
    list.push(chord);
    effective.set(id, list);
  };

  // 1. 上書きのある操作（カタログ順）。
  for (const def of NAVIGATE_KEYS) {
    const list = prefs[def.id];
    if (list === undefined) continue;
    for (const raw of list) register(def.id, raw, "user");
  }
  // 2. 上書きの無い操作、または上書きが1つ以上あるのに1つも登録できなかった操作は既定へ。
  for (const def of NAVIGATE_KEYS) {
    const list = prefs[def.id];
    if (list !== undefined && (list.length === 0 || (effective.get(def.id)?.length ?? 0) > 0)) continue;
    for (const raw of def.defaults) register(def.id, raw, "default");
  }

  const keymap: ResolvedNavigateKeymap = {
    bindingsOf: (id) => effective.get(id) ?? [],
    ownerOf: (chord) => chordMap.get(chord) ?? null,
    actionFor: (chord) => {
      const id = chordMap.get(chord);
      return id === undefined ? undefined : navigateKeyDef(id)?.action;
    },
  };
  return { keymap, problems };
}

/** 何も上書きしていない既定の表。 */
export const DEFAULT_NAVIGATE_KEYMAP: ResolvedNavigateKeymap = resolveNavigateKeymap({}).keymap;
