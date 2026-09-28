import {
  loadThemeOverrides as loadThemeOverridesWith,
  type ThemeOverrides,
} from "@sodashitsu/client-core";

/*
 * 色の個別の上書き（20260922-theme-custom-overrides）。DOM に依らない部分は client-core の `theme/themeOverrides.ts` へ移した
 * （20260927-cli-mode。端末版と共有する）。ここはブラウザの CSS で色を判定する部分と、その判定で読む `loadThemeOverrides`。
 */
export {
  CSS_VAR_LABELS,
  emptyThemeOverrides,
  mergeVars,
  serializeThemeOverrides,
  withOverride,
  withoutOverride,
  type ThemeOverrideBucket,
  type ThemeOverrideLayer,
  type ThemeOverrides,
} from "@sodashitsu/client-core";

/**
 * 色として妥当か（design「色の妥当性判定」・research F10）。**`CSS.supports` は使わない**——happy-dom では常に `true` を
 * 返すスタブで、単体テストが拒否側を確かめられない（研究で実測）。代わりに、実物の要素の `style.color` へ代入して読み戻す
 * ——ブラウザの本物の CSS の `<color>` 文法で検証される（happy-dom でも同じ）。空文字列・空白だけは偽（＝「未入力」。
 * 呼び出し側はこれを「上書きを外す」操作として扱う。design「空文字列の扱い」）。
 */
let probe: HTMLElement | null = null;
export function isValidCssColor(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  probe ??= document.createElement("span");
  probe.style.color = ""; // 前回の値を残さない
  probe.style.color = value;
  return probe.style.color !== "";
}

/** 保存値を**値ごとに**読む（AC8）。層が無ければ空、壊れていれば（オブジェクトでない等）その層だけ空にする。色はブラウザの CSS で判定する。 */
export function loadThemeOverrides(raw: unknown): ThemeOverrides {
  return loadThemeOverridesWith(raw, isValidCssColor);
}
