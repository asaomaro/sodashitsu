import { formatBinding, formatChord, parseBinding, parseChord } from "./chord.js";

/**
 * macOS の非 US 配列で、Option の chord の表示を実際に押した字へ合わせる
 * （20260922-keybinding-usability。design「US3」・AC8〜AC10）。**表示専用**——取り込み・照合に
 * 関わる関数（`chordOf`・`recoverOptionKey`・`validateAssignment`/`validateBinding`）は
 * 一切 import せず、呼ばない・変えない。保存される chord 文字列自体もこのファイルの外では
 * 一切変更しない。
 */

/**
 * `navigator.keyboard.getLayoutMap()` が返す `KeyboardLayoutMap` に必要な形だけを切り出した
 * 最小のインターフェース（テストで差し替えやすくする）。
 */
export interface LayoutMap {
  get(code: string): string | undefined;
}

/**
 * chord の表示文字列を、いまのキー配列の実際の文字へ置き換える。`alt` を含み `ctrl`・`cmd` を
 * 含まない、大小のある英字 1 文字の chord だけが対象（`chord.ts` の `recoverOptionKey` が復元する
 * 対象と同じ範囲）。`layoutMap` が無い・対応する `code` が無い・変わらないときは元の binding を
 * そのまま返す（AC9。フォールバック）。
 */
export function displayBinding(binding: string, layoutMap: LayoutMap | null): string {
  if (layoutMap === null) return binding;
  const parsed = parseBinding(binding);
  if (parsed === null) return binding;
  const parts = parseChord(parsed.chord);
  if (parts === null || !parts.alt || parts.ctrl || parts.cmd) return binding;
  if (!/^[a-z]$/.test(parts.key)) return binding; // 英字 1 文字だけが対象
  const layoutChar = layoutMap.get(`Key${parts.key.toUpperCase()}`);
  // 1 文字でない（デッドキーの合成途中等、稀なキー配列の値）ときは chord にできないので、
  // 元の表示のままにする（design のコード例に対する安全側の追加。taskcheck の指摘で明記）。
  if (layoutChar === undefined || layoutChar.length !== 1) return binding;
  if (layoutChar.toLowerCase() === parts.key) return binding; // 変わらないなら今までの表示のまま
  const shift = parts.shift || layoutChar !== layoutChar.toLowerCase();
  const newChord = formatChord({ ...parts, key: layoutChar.toLowerCase(), shift });
  return formatBinding({ ...parsed, chord: newChord });
}
