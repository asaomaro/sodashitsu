import { CSS_VARS, type CssVar } from "@sodashitsu/client-core";

/**
 * 色の個別の上書き（20260922-theme-custom-overrides。herdr の `[theme.custom]` 相当。design「インターフェース / データ構造」）。
 *
 * herdr の 19 トークンではなく、本製品が実際に使う 19 個の CSS 変数（`uiTokens.ts` の `CSS_VARS`）を上書きの対象にする
 * （名前も粒度も herdr とは 1:1 ではない。research F4）。「常に」の層は持たず、「明るいとき」「暗いとき」の 2 層だけ
 * （本製品はテーマ自体を明暗の対で選ぶ既存の設計があるため。research F2 の意図的な逸脱）。
 */

/** 1 つの明暗の層（上書きしている CSS 変数だけを持つ）。 */
export type ThemeOverrideLayer = Partial<Record<CssVar, string>>;

/** 上書きの全体（明るいとき・暗いとき）。 */
export interface ThemeOverrides {
  readonly light: ThemeOverrideLayer;
  readonly dark: ThemeOverrideLayer;
}

export type ThemeOverrideBucket = "light" | "dark";

export function emptyThemeOverrides(): ThemeOverrides {
  return { light: {}, dark: {} };
}

const CSS_VAR_SET: ReadonlySet<string> = new Set(CSS_VARS);

/** その文字列が `CssVar`（`CSS_VARS` のいずれか）か。 */
function isCssVar(key: string): key is CssVar {
  return CSS_VAR_SET.has(key);
}

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

/** 1 つの層を、保存値から**値ごとに**読む（`CssVar` でないキー・妥当でない色は、その項目だけを落とす）。 */
function loadLayer(raw: unknown): ThemeOverrideLayer {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const layer: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isCssVar(key) && isValidCssColor(value)) layer[key] = value;
  }
  return layer;
}

/** 保存値を**値ごとに**読む（AC8）。層が無ければ空、壊れていれば（オブジェクトでない等）その層だけ空にする。 */
export function loadThemeOverrides(raw: unknown): ThemeOverrides {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return emptyThemeOverrides();
  const r = raw as Record<string, unknown>;
  return { light: loadLayer(r["light"]), dark: loadLayer(r["dark"]) };
}

function serializeLayer(layer: ThemeOverrideLayer): Record<string, string> | undefined {
  const entries = Object.entries(layer);
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** 保存する形（両方の層が空なら `undefined`＝`soda.prefs.v1` から `themeOverrides` ごと消える。`keys` と同じ「差が無くなれば消す」規則）。 */
export function serializeThemeOverrides(
  o: ThemeOverrides,
): { light?: Record<string, string>; dark?: Record<string, string> } | undefined {
  const light = serializeLayer(o.light);
  const dark = serializeLayer(o.dark);
  if (light === undefined && dark === undefined) return undefined;
  const out: { light?: Record<string, string>; dark?: Record<string, string> } = {};
  if (light !== undefined) out.light = light;
  if (dark !== undefined) out.dark = dark;
  return out;
}

/**
 * 1 項目を差し替えた新しい `ThemeOverrides`（イミュータブル）。`value` は妥当な色である前提——空文字列や無効な値の
 * 特別扱いはしない（呼び出し側の `SettingsDialog.vue` が振り分ける。design「空文字列の扱い」）。
 */
export function withOverride(o: ThemeOverrides, bucket: ThemeOverrideBucket, key: CssVar, value: string): ThemeOverrides {
  return { ...o, [bucket]: { ...o[bucket], [key]: value } };
}

/** 1 項目を外した新しい `ThemeOverrides`。 */
export function withoutOverride(o: ThemeOverrides, bucket: ThemeOverrideBucket, key: CssVar): ThemeOverrides {
  const rest = { ...o[bucket] };
  delete rest[key];
  return { ...o, [bucket]: rest };
}

/** 既定の値 (`base`) に、1 つの層 (`layer`) を重ねる（純粋。`ThemeController` が適用にも起動用の控えにも使う）。 */
export function mergeVars(base: Readonly<Record<CssVar, string>>, layer: ThemeOverrideLayer): Record<CssVar, string> {
  const out = { ...base };
  for (const key of CSS_VARS) {
    const v = layer[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** 画面に出す、その CSS 変数の使われ方の短い日本語（AC12。研究 F4 の対応表から）。 */
export const CSS_VAR_LABELS: Readonly<Record<CssVar, string>> = {
  "--soda-bg": "画面地の背景",
  "--soda-fg": "画面地の文字",
  "--soda-menu-bg": "メニュー・ダイアログ・サイドバー等の背景",
  "--soda-menu-fg": "同じ面の文字",
  "--soda-menu-border": "区切りの線",
  "--soda-menu-active-bg": "選ばれている行の背景（メニュー・goto・tab・サイドバーの選択行）",
  "--soda-menu-hover-bg": "ホバーの背景",
  "--soda-accent": "強調の色（フォーカスの枠等）",
  "--soda-accent-fg": "強調の上の文字",
  "--soda-error-fg": "エラーの文字",
  "--soda-warn-fg": "警告の文字",
  "--soda-state-blocked": "状態アイコンの色（入力待ち）",
  "--soda-state-working": "状態アイコンの色（作業中）",
  "--soda-state-done": "状態アイコンの色（完了）",
  "--soda-state-idle": "状態アイコンの色（待機中）",
  "--soda-subtle-bg": "薄い強調の背景",
  "--soda-backdrop": "ダイアログの幕",
  "--soda-backdrop-strong": "再接続の表示の幕",
  "--soda-pane-current": "選ばれている pane の枠",
};
