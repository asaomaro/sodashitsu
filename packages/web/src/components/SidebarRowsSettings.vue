<script setup lang="ts">
import { nextTick, reactive, ref, watch } from "vue";
import {
  BUILTIN_TOKENS,
  builtinToken,
  isTextValued,
  isTextWhen,
  MAX_CUSTOM_NAME,
  isValidColor,
  isValidCustomToken,
  MAX_ROWS,
  MAX_RULE_TEXT,
  MAX_RULES,
  MAX_TOKENS_PER_ROW,
  parseFiniteNumber,
  type RowLayout,
  type RuleWhen,
  SIDEBAR_AREAS,
  type SidebarArea,
  type TokenRule,
  type TokenSpec,
  type TokenStyle,
} from "../sidebar/rowLayout.js";
import { useSettingsStore } from "../store/settings.js";
import { useViewStore } from "../store/view.js";

/**
 * サイドバーの行の並びの編集（20260927-sidebar-row-tokens。herdr の `[ui.sidebar.*].rows` を設定画面で）。設定画面の節「表示」に置く。
 *
 * 形は既存の tab バー右端の編集（`SettingsDialog.vue` の `tabbar-right-*`）と同じ（decisions D8）: 項目ごとの［上へ］［下へ］［削除］と末尾の［追加］、
 * 選んだ時点で保存（確定ボタンは無い）、上限で［追加］を無効化、削除後のフォーカスは「繰り上がった項目の［削除］、無ければその並びの［追加］」。
 * トークンの見た目と条件は［詳細］（`aria-expanded` のボタン。WAI-ARIA の Disclosure）で開閉する。［既定に戻す］はその場の確認（色の上書きの一括の戻しと同じ）。
 *
 * 文字の入力（色・条件の値・独自トークンの名前）は下書きに持ち、Enter か `change`（入力欄を離れた）で確定する。規則外なら保存せず、状態の文に理由を出して
 * 下書きを残す。設定画面が閉じるときは規則に合う下書きを確定し、合わないものは捨てる（AC-I2）。保存は store の `setSidebarLayout` だけ。
 */

const settings = useSettingsStore();
const view = useViewStore();
const rootEl = ref<HTMLElement | null>(null);

const AREA_LABEL: Record<SidebarArea, string> = {
  spaces: "spaces の行（workspace）",
  agents: "agents の行（エージェント）",
};
const WHEN_CHOICES: readonly { value: RuleWhen; label: string }[] = [
  { value: "equals", label: "と一致する" },
  { value: "contains", label: "を含む" },
  { value: "starts_with", label: "で始まる" },
  { value: "gt", label: "より大きい（数）" },
  { value: "lt", label: "より小さい（数）" },
];
const TRI_CHOICES = [
  { value: "default", label: "既定" },
  { value: "on", label: "入" },
  { value: "off", label: "切" },
] as const;
type Tri = (typeof TRI_CHOICES)[number]["value"];
/** 「独自トークン」を選んだときの `<select>` の値。 */
const CUSTOM = "$";

function layoutOf(area: SidebarArea): RowLayout {
  return area === "spaces" ? settings.spacesLayout : settings.agentsLayout;
}
function isDefault(area: SidebarArea): boolean {
  return settings.sidebarRows[area] === null;
}
function tokenLabel(area: SidebarArea, token: string): string {
  return builtinToken(area, token)?.label ?? "独自トークン";
}
function tri(v: boolean | undefined): Tri {
  return v === undefined ? "default" : v ? "on" : "off";
}

/** 状態の文（区画ごと。`role="status"`）。 */
const messages = reactive<Record<SidebarArea, string>>({ spaces: "", agents: "" });

/** 変更は既定の並びにも写しから当てる（`DEFAULT_LAYOUTS` を書き換えない）。 */
function mutate(area: SidebarArea, fn: (layout: RowLayout) => void): void {
  const next = JSON.parse(JSON.stringify(layoutOf(area))) as RowLayout;
  fn(next);
  selfChange = true;
  try {
    settings.setSidebarLayout(area, next);
  } finally {
    selfChange = false;
  }
}

/** この部品が書いている最中か（ほかのウィンドウ・設定の読み直しでの差し替えと見分ける）。 */
let selfChange = false;

// --- 下書き（文字の入力） -------------------------------------------------------------

interface Draft {
  value: string;
  /** 確定する。規則外なら理由（保存しない）、確定できたら null。 */
  commit: (value: string) => string | null;
}
const drafts = reactive(new Map<string, Draft>());

function draftOr(key: string, saved: string): string {
  return drafts.get(key)?.value ?? saved;
}
function onDraftInput(key: string, ev: Event, commit: Draft["commit"]): void {
  drafts.set(key, { value: (ev.target as HTMLInputElement).value, commit });
}
/** 確定する（`change`・Enter）。下書きが無ければ何もしない。 */
function commitDraft(area: SidebarArea, key: string): void {
  const d = drafts.get(key);
  if (!d) return;
  const error = d.commit(d.value);
  if (error === null) {
    drafts.delete(key);
    messages[area] = ""; // 前の理由の文を残さない
  } else messages[area] = error;
}
/** Enter で確定する（IME の変換を確定する Enter は除く。`SettingsDialog.vue` の `onPathEnter` と同じ注意）。 */
function onEnter(ev: KeyboardEvent, fn: () => void): void {
  if (ev.isComposing || ev.keyCode === 229) return;
  fn();
}
/** 位置が変わる操作の前に、位置で結び付いた下書き・足すトークンの選択を捨てる（足す・値を変える操作では捨てない）。 */
function clearDrafts(): void {
  drafts.clear();
  newToken.clear();
}

function fgCommit(apply: (fg: string | undefined) => void): Draft["commit"] {
  return (raw) => {
    const v = raw.trim();
    if (v === "") {
      apply(undefined);
      return null;
    }
    if (!isValidColor(v)) return `色は #RGB か #RRGGBB で入れてください（${v} は使えません）。`;
    apply(v);
    return null;
  };
}

function setStyleField(
  target: TokenStyle,
  key: "fg" | "bold" | "dim",
  v: string | boolean | undefined,
): void {
  if (v === undefined) delete target[key];
  else (target as Record<string, unknown>)[key] = v;
}

// --- 開閉（［詳細］） -------------------------------------------------------------------

/** 開いているトークン（`area:行:位置`）。位置の変わる操作で付け替える。 */
const expanded = reactive(new Set<string>());
const tokenKey = (area: SidebarArea, ri: number, ti: number): string => `${area}:${ri}:${ti}`;
function detailId(area: SidebarArea, ri: number, ti: number): string {
  return `sidebar-rows-detail-${area}-${ri}-${ti}`;
}
function toggleExpanded(area: SidebarArea, ri: number, ti: number): void {
  const k = tokenKey(area, ri, ti);
  if (expanded.has(k)) expanded.delete(k);
  else expanded.add(k);
}
/** 開いている印を、位置の付け替え（null＝消えた）に合わせて移す。 */
function remapExpanded(
  area: SidebarArea,
  map: (ri: number, ti: number) => [number, number] | null,
): void {
  const next: string[] = [];
  for (const k of [...expanded]) {
    const [a, r, t] = k.split(":");
    if (a !== area) continue;
    expanded.delete(k);
    const to = map(Number(r), Number(t));
    if (to) next.push(tokenKey(area, to[0], to[1]));
  }
  for (const k of next) expanded.add(k);
}

// --- フォーカス（AC-I4） ------------------------------------------------------------------

/** `container` の中の `selector` の `index` 番目、無ければ `fallback`（どちらも無ければ何もしない）。 */
function focusIn(
  container: Element | null,
  selector: string,
  index: number,
  fallback: string,
): void {
  void nextTick(() => {
    const items = container?.querySelectorAll<HTMLElement>(selector) ?? [];
    (items[index] ?? container?.querySelector<HTMLElement>(fallback))?.focus();
  });
}
/** 動かした項目の新しい位置の、同じ向き（押せなければ逆向き）のボタンへ。 */
function focusMoved(container: Element | null, kind: string, index: number, dir: -1 | 1): void {
  void nextTick(() => {
    const pick = (d: -1 | 1) =>
      container?.querySelectorAll<HTMLButtonElement>(`[data-move-${kind}="${d}"]`)[index];
    const same = pick(dir);
    (same && !same.disabled ? same : pick(dir === -1 ? 1 : -1))?.focus();
  });
}
/**
 * 足した後、押した［追加］が上限で押せなくなったら（フォーカスが body へ落ちる）、足した項目の［削除］へ移す（AC-I4）。
 */
function keepFocusAfterAdd(
  ev: Event | undefined,
  scopeSelector: string,
  removeSelector: string,
): void {
  const btn = ev?.currentTarget as HTMLButtonElement | null | undefined;
  if (!btn) return;
  const scope = btn.closest(scopeSelector);
  void nextTick(() => {
    if (!btn.disabled) return;
    const items = scope?.querySelectorAll<HTMLElement>(removeSelector) ?? [];
    items[items.length - 1]?.focus();
  });
}
function scopeOf(ev: Event, selector: string): Element | null {
  return (ev.currentTarget as HTMLElement | null)?.closest(selector) ?? null;
}

// --- 行 ----------------------------------------------------------------------------------

function addRow(area: SidebarArea, ev?: Event): void {
  if (layoutOf(area).length >= MAX_ROWS) return;
  mutate(area, (l) => l.push([]));
  keepFocusAfterAdd(ev, "fieldset", "[data-remove-line]");
  messages[area] = `${layoutOf(area).length} 行目を足しました。`;
}

function moveRow(area: SidebarArea, ri: number, dir: -1 | 1, ev: Event): void {
  const to = ri + dir;
  if (to < 0 || to >= layoutOf(area).length) return;
  clearDrafts();
  const scope = scopeOf(ev, "fieldset");
  mutate(area, (l) => {
    [l[ri], l[to]] = [l[to]!, l[ri]!];
  });
  remapExpanded(area, (r, t) => [r === ri ? to : r === to ? ri : r, t]);
  messages[area] = `${ri + 1} 行目を ${to + 1} 行目へ動かしました。`;
  focusMoved(scope, "line", to, dir);
}

function removeRow(area: SidebarArea, ri: number, ev: Event): void {
  clearDrafts();
  const scope = scopeOf(ev, "fieldset");
  mutate(area, (l) => l.splice(ri, 1));
  remapExpanded(area, (r, t) => (r === ri ? null : [r > ri ? r - 1 : r, t]));
  messages[area] = `${ri + 1} 行目を消しました。`;
  focusIn(scope, "[data-remove-line]", ri, "[data-add-line]");
}

// --- トークン ------------------------------------------------------------------------------

/** 足すトークンの選択（`area:行` → id か `$`）。既定は先頭の組み込み。 */
const newToken = reactive(new Map<string, string>());
function newTokenOf(area: SidebarArea, ri: number): string {
  return newToken.get(`${area}:${ri}`) ?? BUILTIN_TOKENS[area][0]!.id;
}
function customKey(area: SidebarArea, ri: number): string {
  return `custom:${area}:${ri}`;
}

function addToken(area: SidebarArea, ri: number, ev?: Event): void {
  const row = layoutOf(area)[ri];
  if (!row || row.length >= MAX_TOKENS_PER_ROW) return;
  let token = newTokenOf(area, ri);
  if (token === CUSTOM) {
    const raw = (drafts.get(customKey(area, ri))?.value ?? "").trim();
    token = raw.startsWith("$") ? raw : `$${raw}`;
    if (!isValidCustomToken(token)) {
      messages[area] =
        `独自トークンの名前は英数字と _ - の 1〜${MAX_CUSTOM_NAME} 文字で入れてください（$ は付けなくてよい）。`;
      return;
    }
  }
  drafts.delete(customKey(area, ri));
  mutate(area, (l) => l[ri]!.push({ token }));
  keepFocusAfterAdd(ev, "[data-line]", "[data-remove-token]");
  messages[area] = `「${tokenLabel(area, token)}」（${token}）を ${ri + 1} 行目に足しました。`;
}

function moveToken(area: SidebarArea, ri: number, ti: number, dir: -1 | 1, ev: Event): void {
  const to = ti + dir;
  const row = layoutOf(area)[ri];
  if (!row || to < 0 || to >= row.length) return;
  clearDrafts();
  const scope = scopeOf(ev, "[data-line]");
  mutate(area, (l) => {
    const r = l[ri]!;
    [r[ti], r[to]] = [r[to]!, r[ti]!];
  });
  remapExpanded(area, (r, t) => [r, r !== ri ? t : t === ti ? to : t === to ? ti : t]);
  focusMoved(scope, "token", to, dir);
}

function removeToken(area: SidebarArea, ri: number, ti: number, ev: Event): void {
  clearDrafts();
  const scope = scopeOf(ev, "[data-line]");
  const label = tokenLabel(area, layoutOf(area)[ri]?.[ti]?.token ?? "");
  mutate(area, (l) => l[ri]!.splice(ti, 1));
  remapExpanded(area, (r, t) => (r !== ri ? [r, t] : t === ti ? null : [r, t > ti ? t - 1 : t]));
  messages[area] = `「${label}」を ${ri + 1} 行目から消しました。`;
  focusIn(scope, "[data-remove-token]", ti, "[data-add-token]");
}

function tokenAt(l: RowLayout, ri: number, ti: number): TokenSpec {
  return l[ri]![ti]!;
}

function setTokenTri(
  area: SidebarArea,
  ri: number,
  ti: number,
  key: "bold" | "dim",
  ev: Event,
): void {
  const v = (ev.target as HTMLSelectElement).value as Tri;
  mutate(area, (l) =>
    setStyleField(tokenAt(l, ri, ti), key, v === "default" ? undefined : v === "on"),
  );
}

function tokenFgCommit(area: SidebarArea, ri: number, ti: number): Draft["commit"] {
  const commit = fgCommit((fg) => mutate(area, (l) => setStyleField(tokenAt(l, ri, ti), "fg", fg)));
  // 位置のトークンが無くなっていたら（ほかのウィンドウの変更の直後等）何もせず下書きを捨てる。
  return (raw) => (layoutOf(area)[ri]?.[ti] ? commit(raw) : null);
}

// --- 条件 ----------------------------------------------------------------------------------

function ruleAt(l: RowLayout, ri: number, ti: number, k: number): TokenRule {
  return tokenAt(l, ri, ti).rules![k]!;
}

function addRule(area: SidebarArea, ri: number, ti: number, ev?: Event): void {
  const spec = layoutOf(area)[ri]?.[ti];
  if (!spec || (spec.rules?.length ?? 0) >= MAX_RULES) return;
  mutate(area, (l) => {
    const t = tokenAt(l, ri, ti);
    t.rules = [...(t.rules ?? []), { when: "equals", value: "" }];
  });
  keepFocusAfterAdd(ev, "[data-token-item]", "[data-remove-rule]");
}

function moveRule(
  area: SidebarArea,
  ri: number,
  ti: number,
  k: number,
  dir: -1 | 1,
  ev: Event,
): void {
  const rules = layoutOf(area)[ri]?.[ti]?.rules ?? [];
  const to = k + dir;
  if (to < 0 || to >= rules.length) return;
  clearDrafts();
  const scope = scopeOf(ev, "[data-token-item]");
  mutate(area, (l) => {
    const rs = tokenAt(l, ri, ti).rules!;
    [rs[k], rs[to]] = [rs[to]!, rs[k]!];
  });
  focusMoved(scope, "rule", to, dir);
}

function removeRule(area: SidebarArea, ri: number, ti: number, k: number, ev: Event): void {
  clearDrafts();
  const scope = scopeOf(ev, "[data-token-item]");
  mutate(area, (l) => {
    const t = tokenAt(l, ri, ti);
    t.rules!.splice(k, 1);
    if (t.rules!.length === 0) delete t.rules;
  });
  focusIn(scope, "[data-remove-rule]", k, "[data-add-rule]");
}

/** 条件の種類を変える。文字と数をまたぐときは値を移せるときだけ移す（読めなければ 0 か空）。 */
function setRuleWhen(area: SidebarArea, ri: number, ti: number, k: number, ev: Event): void {
  const when = (ev.target as HTMLSelectElement).value as RuleWhen;
  drafts.delete(`rv:${tokenKey(area, ri, ti)}:${k}`); // 種類が変わると値の読み方も変わる
  mutate(area, (l) => {
    const rules = tokenAt(l, ri, ti).rules!;
    const prev = rules[k]!;
    const style: TokenStyle & { hide?: boolean } = {};
    for (const key of ["fg", "bold", "dim", "hide"] as const)
      if (prev[key] !== undefined) (style as Record<string, unknown>)[key] = prev[key];
    if (isTextWhen(when)) {
      const next: TokenRule = { ...style, when: when as "equals", value: String(prev.value) };
      if (isTextWhen(prev.when) && "ignoreCase" in prev && prev.ignoreCase) next.ignoreCase = true;
      rules[k] = next;
    } else {
      rules[k] = {
        ...style,
        when: when as "gt",
        value:
          typeof prev.value === "number" ? prev.value : (parseFiniteNumber(prev.value.trim()) ?? 0),
      };
    }
  });
}

function ruleValueCommit(area: SidebarArea, ri: number, ti: number, k: number): Draft["commit"] {
  return (raw) => {
    const rule = layoutOf(area)[ri]?.[ti]?.rules?.[k];
    if (!rule) return null;
    if (isTextWhen(rule.when)) {
      if (raw.length > MAX_RULE_TEXT) return `条件の文字は ${MAX_RULE_TEXT} 文字までです。`;
      mutate(area, (l) => {
        (ruleAt(l, ri, ti, k) as { value: string }).value = raw;
      });
      return null;
    }
    const n = parseFiniteNumber(raw.trim());
    if (n === null) return `数の条件には数を入れてください（${raw} は数として読めません）。`;
    mutate(area, (l) => {
      (ruleAt(l, ri, ti, k) as { value: number }).value = n;
    });
    return null;
  };
}

function setRuleCheck(
  area: SidebarArea,
  ri: number,
  ti: number,
  k: number,
  key: "ignoreCase" | "hide",
  ev: Event,
): void {
  const checked = (ev.target as HTMLInputElement).checked;
  mutate(area, (l) => {
    const r = ruleAt(l, ri, ti, k) as unknown as Record<string, unknown>;
    if (checked) r[key] = true;
    else delete r[key];
  });
}

function setRuleTri(
  area: SidebarArea,
  ri: number,
  ti: number,
  k: number,
  key: "bold" | "dim",
  ev: Event,
): void {
  const v = (ev.target as HTMLSelectElement).value as Tri;
  mutate(area, (l) =>
    setStyleField(ruleAt(l, ri, ti, k), key, v === "default" ? undefined : v === "on"),
  );
}

function ruleFgCommit(area: SidebarArea, ri: number, ti: number, k: number): Draft["commit"] {
  const commit = fgCommit((fg) =>
    mutate(area, (l) => setStyleField(ruleAt(l, ri, ti, k), "fg", fg)),
  );
  return (raw) => (layoutOf(area)[ri]?.[ti]?.rules?.[k] ? commit(raw) : null);
}

// --- 既定に戻す -----------------------------------------------------------------------------

const confirming = ref<SidebarArea | null>(null);

function askReset(area: SidebarArea): void {
  confirming.value = area;
  void nextTick(() =>
    rootEl.value?.querySelector<HTMLElement>(`[data-area="${area}"] [data-confirm-no]`)?.focus(),
  );
}
function endReset(area: SidebarArea): void {
  confirming.value = null;
  void nextTick(() =>
    rootEl.value?.querySelector<HTMLElement>(`[data-area="${area}"] [data-reset-area]`)?.focus(),
  );
}
function confirmReset(area: SidebarArea): void {
  clearDrafts();
  remapExpanded(area, () => null);
  settings.setSidebarLayout(area, null);
  messages[area] = "既定の並びに戻しました。";
  endReset(area);
}

/** ほかのウィンドウ・設定の読み直しで並びが差し替わったら、位置で結び付いた状態（下書き・開閉・足す選択）を捨てる。 */
watch(
  () => settings.sidebarRows,
  () => {
    if (selfChange) return;
    clearDrafts();
    expanded.clear();
  },
  { flush: "sync" },
);

// --- 設定画面の開閉 --------------------------------------------------------------------------

/**
 * 開くたびに保存値から始め（下書き・確認・状態の文を捨てる）、閉じるときは規則に合う下書きを確定して捨てる（AC-I2）。
 * 確定の順は入れた順（`Map` の順）。1 つの確定で位置が変わることは無い（文字の入力は位置を変えない）。
 */
watch(
  () => view.dialogContext?.kind === "settings",
  (open, wasOpen) => {
    if (!open && wasOpen) {
      for (const d of [...drafts.values()]) {
        try {
          d.commit(d.value);
        } catch {
          // 1 つの失敗で残りの確定と後始末を止めない
        }
      }
    }
    clearDrafts();
    confirming.value = null;
    messages.spaces = "";
    messages.agents = "";
  },
);
</script>

<template>
  <details ref="rootEl" class="sidebar-rows-settings">
    <summary>サイドバーの行（上級者向け）</summary>
    <p class="sr-note">
      並べたトークンを 1 行ずつ描きます（1 行目が主の行、2
      行目からは小さい補足の行）。値の無いトークンと、何も残らない行は出ません。<code>$名前</code>
      は <code>wtmctl workspace report-metadata</code>・<code>wtmctl pane report-metadata</code>
      で外から報告された値です。変更はこのブラウザにすぐ保存されます。
      畳んだサイドバーとグループの見出しの行は変わりません。色は <code>#RGB</code> か
      <code>#RRGGBB</code>（自動のコントラスト調整はかかりません）。
    </p>
    <fieldset v-for="area in SIDEBAR_AREAS" :key="area" class="sr-area" :data-area="area">
      <legend class="sr-legend">
        {{ AREA_LABEL[area] }}{{ isDefault(area) ? "（既定）" : "" }}
      </legend>
      <ol class="sr-lines">
        <li v-for="(row, ri) in layoutOf(area)" :key="ri" class="sr-line" data-line>
          <div class="sr-line-head">
            <span class="sr-line-title">{{ ri + 1 }} 行目</span>
            <button
              type="button"
              class="sr-btn"
              data-move-line="-1"
              :disabled="ri === 0"
              :aria-label="`行を上へ（${ri + 1} 行目）`"
              @click="moveRow(area, ri, -1, $event)"
            >
              行を上へ
            </button>
            <button
              type="button"
              class="sr-btn"
              data-move-line="1"
              :disabled="ri === layoutOf(area).length - 1"
              :aria-label="`行を下へ（${ri + 1} 行目）`"
              @click="moveRow(area, ri, 1, $event)"
            >
              行を下へ
            </button>
            <button
              type="button"
              class="sr-btn"
              data-remove-line
              :aria-label="`行を削除（${ri + 1} 行目）`"
              @click="removeRow(area, ri, $event)"
            >
              行を削除
            </button>
          </div>
          <p v-if="row.length === 0" class="sr-note">
            （トークンがありません。この行は描かれません）
          </p>
          <ul class="sr-tokens">
            <li v-for="(tok, ti) in row" :key="ti" class="sr-token" data-token-item>
              <div class="sr-token-head">
                <span class="sr-token-label">{{ tokenLabel(area, tok.token) }}</span>
                <code class="sr-token-id">{{ tok.token }}</code>
                <button
                  type="button"
                  class="sr-btn"
                  data-move-token="-1"
                  :disabled="ti === 0"
                  :aria-label="`${tok.token} を前へ`"
                  @click="moveToken(area, ri, ti, -1, $event)"
                >
                  前へ
                </button>
                <button
                  type="button"
                  class="sr-btn"
                  data-move-token="1"
                  :disabled="ti === row.length - 1"
                  :aria-label="`${tok.token} を後へ`"
                  @click="moveToken(area, ri, ti, 1, $event)"
                >
                  後へ
                </button>
                <button
                  type="button"
                  class="sr-btn"
                  data-toggle-detail
                  :aria-expanded="expanded.has(tokenKey(area, ri, ti)) ? 'true' : 'false'"
                  :aria-controls="detailId(area, ri, ti)"
                  :aria-label="`詳細（${tok.token} の見た目と条件）`"
                  @click="toggleExpanded(area, ri, ti)"
                >
                  詳細
                </button>
                <button
                  type="button"
                  class="sr-btn"
                  data-remove-token
                  :aria-label="`${tok.token} を削除`"
                  @click="removeToken(area, ri, ti, $event)"
                >
                  削除
                </button>
              </div>
              <div
                v-if="expanded.has(tokenKey(area, ri, ti))"
                :id="detailId(area, ri, ti)"
                class="sr-detail"
              >
                <label class="sr-field">
                  <span>前景色</span>
                  <input
                    type="text"
                    class="sr-input"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="#RGB か #RRGGBB（空で既定）"
                    :value="draftOr(`fg:${tokenKey(area, ri, ti)}`, tok.fg ?? '')"
                    @input="
                      onDraftInput(
                        `fg:${tokenKey(area, ri, ti)}`,
                        $event,
                        tokenFgCommit(area, ri, ti),
                      )
                    "
                    @change="commitDraft(area, `fg:${tokenKey(area, ri, ti)}`)"
                    @keydown.enter="
                      onEnter($event, () => commitDraft(area, `fg:${tokenKey(area, ri, ti)}`))
                    "
                  />
                </label>
                <label class="sr-field">
                  <span>太字</span>
                  <select
                    class="sr-select"
                    :value="tri(tok.bold)"
                    @change="setTokenTri(area, ri, ti, 'bold', $event)"
                  >
                    <option v-for="c in TRI_CHOICES" :key="c.value" :value="c.value">
                      {{ c.label }}
                    </option>
                  </select>
                </label>
                <label class="sr-field">
                  <span>薄字</span>
                  <select
                    class="sr-select"
                    :value="tri(tok.dim)"
                    @change="setTokenTri(area, ri, ti, 'dim', $event)"
                  >
                    <option v-for="c in TRI_CHOICES" :key="c.value" :value="c.value">
                      {{ c.label }}
                    </option>
                  </select>
                </label>
                <template v-if="isTextValued(area, tok.token)">
                  <p class="sr-note">
                    条件（上から順に見て、最初に当たったものだけが効きます。最大 {{ MAX_RULES }}）
                  </p>
                  <ol class="sr-rules">
                    <li
                      v-for="(rule, k) in tok.rules ?? []"
                      :key="k"
                      class="sr-rule"
                      data-rule-item
                    >
                      <div class="sr-rule-main">
                        <span>値が</span>
                        <input
                          type="text"
                          class="sr-input sr-rule-value"
                          autocomplete="off"
                          spellcheck="false"
                          :aria-label="`条件 ${k + 1} の値`"
                          :value="draftOr(`rv:${tokenKey(area, ri, ti)}:${k}`, String(rule.value))"
                          @input="
                            onDraftInput(
                              `rv:${tokenKey(area, ri, ti)}:${k}`,
                              $event,
                              ruleValueCommit(area, ri, ti, k),
                            )
                          "
                          @change="commitDraft(area, `rv:${tokenKey(area, ri, ti)}:${k}`)"
                          @keydown.enter="
                            onEnter($event, () =>
                              commitDraft(area, `rv:${tokenKey(area, ri, ti)}:${k}`),
                            )
                          "
                        />
                        <select
                          class="sr-select"
                          :aria-label="`条件 ${k + 1} の種類`"
                          :value="rule.when"
                          @change="setRuleWhen(area, ri, ti, k, $event)"
                        >
                          <option v-for="w in WHEN_CHOICES" :key="w.value" :value="w.value">
                            {{ w.label }}
                          </option>
                        </select>
                      </div>
                      <div class="sr-rule-style">
                        <label v-if="isTextWhen(rule.when)" class="sr-check">
                          <input
                            type="checkbox"
                            :checked="'ignoreCase' in rule && rule.ignoreCase === true"
                            @change="setRuleCheck(area, ri, ti, k, 'ignoreCase', $event)"
                          />
                          <span>大文字小文字を区別しない（ASCII）</span>
                        </label>
                        <label class="sr-check">
                          <input
                            type="checkbox"
                            :checked="rule.hide === true"
                            @change="setRuleCheck(area, ri, ti, k, 'hide', $event)"
                          />
                          <span>当たったら隠す</span>
                        </label>
                        <label class="sr-field">
                          <span>色</span>
                          <input
                            type="text"
                            class="sr-input"
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="#RGB（空で変えない）"
                            :aria-label="`条件 ${k + 1} の色`"
                            :value="draftOr(`rfg:${tokenKey(area, ri, ti)}:${k}`, rule.fg ?? '')"
                            @input="
                              onDraftInput(
                                `rfg:${tokenKey(area, ri, ti)}:${k}`,
                                $event,
                                ruleFgCommit(area, ri, ti, k),
                              )
                            "
                            @change="commitDraft(area, `rfg:${tokenKey(area, ri, ti)}:${k}`)"
                            @keydown.enter="
                              onEnter($event, () =>
                                commitDraft(area, `rfg:${tokenKey(area, ri, ti)}:${k}`),
                              )
                            "
                          />
                        </label>
                        <label class="sr-field">
                          <span>太字</span>
                          <select
                            class="sr-select"
                            :aria-label="`条件 ${k + 1} の太字`"
                            :value="tri(rule.bold)"
                            @change="setRuleTri(area, ri, ti, k, 'bold', $event)"
                          >
                            <option v-for="c in TRI_CHOICES" :key="c.value" :value="c.value">
                              {{ c.label }}
                            </option>
                          </select>
                        </label>
                        <label class="sr-field">
                          <span>薄字</span>
                          <select
                            class="sr-select"
                            :aria-label="`条件 ${k + 1} の薄字`"
                            :value="tri(rule.dim)"
                            @change="setRuleTri(area, ri, ti, k, 'dim', $event)"
                          >
                            <option v-for="c in TRI_CHOICES" :key="c.value" :value="c.value">
                              {{ c.label }}
                            </option>
                          </select>
                        </label>
                        <button
                          type="button"
                          class="sr-btn"
                          data-move-rule="-1"
                          :disabled="k === 0"
                          :aria-label="`条件 ${k + 1} を上へ`"
                          @click="moveRule(area, ri, ti, k, -1, $event)"
                        >
                          上へ
                        </button>
                        <button
                          type="button"
                          class="sr-btn"
                          data-move-rule="1"
                          :disabled="k === (tok.rules?.length ?? 0) - 1"
                          :aria-label="`条件 ${k + 1} を下へ`"
                          @click="moveRule(area, ri, ti, k, 1, $event)"
                        >
                          下へ
                        </button>
                        <button
                          type="button"
                          class="sr-btn"
                          data-remove-rule
                          :aria-label="`条件 ${k + 1} を削除`"
                          @click="removeRule(area, ri, ti, k, $event)"
                        >
                          削除
                        </button>
                      </div>
                    </li>
                  </ol>
                  <button
                    type="button"
                    class="sr-btn"
                    data-add-rule
                    :disabled="(tok.rules?.length ?? 0) >= MAX_RULES"
                    @click="addRule(area, ri, ti, $event)"
                  >
                    条件を追加
                  </button>
                </template>
                <p v-else class="sr-note">このトークンには条件を付けられません（見た目だけ）。</p>
              </div>
            </li>
          </ul>
          <div class="sr-add-token">
            <label class="sr-field">
              <span>足すトークン</span>
              <select
                class="sr-select"
                :value="newTokenOf(area, ri)"
                @change="newToken.set(`${area}:${ri}`, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="b in BUILTIN_TOKENS[area]" :key="b.id" :value="b.id">
                  {{ b.label }}（{{ b.id }}）
                </option>
                <option :value="CUSTOM">独自トークン（$名前）</option>
              </select>
            </label>
            <input
              v-if="newTokenOf(area, ri) === CUSTOM"
              type="text"
              class="sr-input"
              autocomplete="off"
              spellcheck="false"
              placeholder="名前（例 summary）"
              :aria-label="`${ri + 1} 行目に足す独自トークンの名前`"
              :value="draftOr(customKey(area, ri), '')"
              @input="onDraftInput(customKey(area, ri), $event, () => null)"
              @keydown.enter="onEnter($event, () => addToken(area, ri))"
            />
            <button
              type="button"
              class="sr-btn"
              data-add-token
              :disabled="row.length >= MAX_TOKENS_PER_ROW"
              @click="addToken(area, ri, $event)"
            >
              追加
            </button>
          </div>
        </li>
      </ol>
      <div class="sr-area-foot">
        <button
          type="button"
          class="sr-btn"
          data-add-line
          :disabled="layoutOf(area).length >= MAX_ROWS"
          @click="addRow(area, $event)"
        >
          行を追加
        </button>
        <button
          v-if="confirming !== area"
          type="button"
          class="sr-btn"
          data-reset-area
          @click="askReset(area)"
        >
          既定に戻す
        </button>
        <div
          v-else
          class="sr-confirm"
          role="group"
          :aria-label="`${AREA_LABEL[area]}を既定に戻す確認`"
          @keydown.esc.stop.prevent="endReset(area)"
        >
          <span>{{ AREA_LABEL[area] }}の並びを既定に戻します。取り消せません。</span>
          <button type="button" class="sr-btn" data-confirm-yes @click="confirmReset(area)">
            戻す
          </button>
          <button type="button" class="sr-btn" data-confirm-no @click="endReset(area)">
            やめる
          </button>
        </div>
      </div>
      <p class="sr-note sr-message" role="status" aria-live="polite">{{ messages[area] }}</p>
    </fieldset>
  </details>
</template>

<style scoped>
/* 設定画面（`SettingsDialog.vue`）の scoped CSS はこの部品の中に効かないので、同じ見た目をここに持つ（`.settings-btn` 等と同じ値）。 */
.sidebar-rows-settings > summary {
  cursor: pointer;
}
.sr-note {
  margin: 0.3em 0 0;
  font-size: 0.85em;
  opacity: 0.8;
}
.sr-area {
  margin: 0.8em 0 0;
  padding: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.sr-legend {
  padding: 0;
  margin-bottom: 0.3em;
  font-weight: bold;
}
.sr-lines,
.sr-tokens,
.sr-rules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.sr-line {
  border: 1px solid var(--wtm-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.4em;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
}
.sr-line-head,
.sr-token-head,
.sr-add-token,
.sr-area-foot,
.sr-confirm,
.sr-rule-main,
.sr-rule-style {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3em 0.5em;
}
.sr-line-title {
  margin-right: auto;
}
.sr-token-label {
  margin-right: 0.2em;
}
.sr-token-id {
  margin-right: auto;
  opacity: 0.8;
}
.sr-detail,
.sr-rule {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  padding-left: 1em;
  border-left: 2px solid var(--wtm-menu-border, #44475a);
}
.sr-field,
.sr-check {
  display: flex;
  align-items: center;
  gap: 0.4em;
  min-height: 1.75rem;
}
.sr-input {
  box-sizing: border-box;
  font: inherit;
  padding: 0.2em 0.4em;
  min-width: 8em;
}
.sr-rule-value {
  flex: 1 1 8em;
}
.sr-select {
  font: inherit;
  min-height: 1.75rem;
  max-width: 100%;
}
.sr-btn {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid var(--wtm-menu-border, #44475a);
  border-radius: 4px;
  padding: 0.15em 0.7em;
  min-height: 1.75rem;
  cursor: pointer;
}
.sr-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
