<script setup lang="ts">
import type { DisplayState } from "@sodashitsu/protocol";
import { computed } from "vue";
import { useSettingsStore } from "../store/settings.js";
import { stateGlyph, stateLabel } from "@sodashitsu/client-core";

/**
 * エージェントの状態の印（20260921-herdr-settings-gaps の D2・D4）。サイドバー・goto・モバイルのピッカーが使う。
 *
 * **見た目（色・字形・大きさ・形）はここだけが持つ**。以前は同じ配色の CSS が 3 か所に複製されていた。
 * 呼ぶ側は自分のクラスを付けて使う（`<StateIcon class="sidebar-state-icon" :state />`）——Vue の属性の引き継ぎで
 * 根要素に付くので、既存のテストと E2E のセレクタ（`.sidebar-state-icon[data-state]` 等）はそのまま効く。
 * **呼ぶ側に状態の点の CSS を残さない**——scoped CSS でも親の規則は子の根要素に効くので、残すと字形の後ろに
 * 塗りの丸が描かれる。
 *
 * - 記号「入」（既定）: herdr の `symbols` の字形を色で描く（色と併記。WCAG 1.4.1）。
 * - 記号「切」: 以前の色の丸。
 * - エージェントが居ない（`null`）: **どちらでも字形を出さず、以前の薄い丸のまま**（AC8。空の箱にすると、
 *   畳んだサイドバーの行は点だけなので、エージェントの居ない workspace の行に何も描かれなくなる）。
 * - **読み上げの名前は記号の入／切にかかわらず付ける**（色の丸にも無かった。WCAG 1.1.1）。居ない行は `aria-hidden`。
 */
const props = defineProps<{ state: DisplayState | null }>();
const settings = useSettingsStore();

const label = computed(() => stateLabel(props.state));
const glyph = computed(() => (settings.statusSymbols ? stateGlyph(props.state) : ""));
</script>

<template>
  <span
    class="state-icon"
    :data-state="state ?? 'none'"
    :data-symbols="settings.statusSymbols ? 'on' : 'off'"
    :role="state ? 'img' : undefined"
    :aria-label="label ?? undefined"
    :aria-hidden="state ? undefined : 'true'"
    :title="label ?? undefined"
    >{{ glyph }}</span
  >
</template>

<style scoped>
/*
 * **占める場所は、記号の入／切・エージェントの有無にかかわらず同じ 1em の箱**——幅が状態で変わると、エージェントが
 * 現れたり消えたりするたびに行のラベルが横に動き、畳んだサイドバー（行が印だけ）では行の高さが変わって下の行が上下に動く
 * （タスク点検 T5 の指摘。Chromium で測ってラベルの左端が約 5.6px ずれた）。丸はこの箱の中に以前と同じ 0.6em で描く。
 * 記号は Ambiguous 幅（日本語フォントで全角・欧文フォントで半角）なので、この箱で吸収する（D4）。
 */
.state-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  line-height: 1;
}
/*
 * 状態の色。記号も丸も `currentColor` で描くので、ここで両方に効く。blocked と idle は以前の配色（#ff5555・#6272a4）より明るくした——
 * 線の細い字形は塗りの丸よりインクが少なく、**選ばれている行の背景（#44475a）では idle が 1.94:1・blocked が 2.91:1** で
 * WCAG 1.4.11（非テキストのコントラスト 3:1）を下回った。いまの値は通常 #282a36・hover #343746・選択 #44475a・モバイルの #1e1f29 の
 * どれでも 3:1 以上（選択の行で blocked 3.36・idle 3.32）
 * （review ラウンド1 の指摘。decisions D6）。
 * 色はテーマの CSS 変数から取る（20260921-theme-settings）。予備の値は dracula の値で、ほかのテーマの値は `theme/uiTokens.ts` が同じ
 * 条件（背景・hover・選択の行・モバイルの背景の上で 3:1）で寄せ、`uiTokens.test.ts` が全テーマで確かめる。
 */
.state-icon[data-state="blocked"] {
  color: var(--soda-state-blocked, #ff6e6e);
}
.state-icon[data-state="working"] {
  color: var(--soda-state-working, #f1fa8c);
}
.state-icon[data-state="done"] {
  color: var(--soda-state-done, #50fa7b);
}
.state-icon[data-state="idle"] {
  color: var(--soda-state-idle, #8a9ad0);
}
/* 丸：記号「切」、またはエージェントが居ない行（以前の見た目。状態の無い丸は薄く）。 */
.state-icon[data-symbols="off"]::before,
.state-icon[data-state="none"]::before {
  content: "";
  width: 0.6em;
  height: 0.6em;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.3;
}
.state-icon[data-symbols="off"]:is([data-state="blocked"], [data-state="working"], [data-state="done"], [data-state="idle"])::before {
  opacity: 1;
}
/*
 * 記号は太字にする（細い線だとインクが少なく、形で読ませる効果が落ちる）。状態不明の `·` もこれで少し大きくなる——以前は
 * `opacity: 0.6` も掛けていて、インクが約 2px しかなく畳んだサイドバーではほぼ見えなかった（review ラウンド1 の指摘）。
 */
.state-icon[data-symbols="on"] {
  font-weight: bold;
}
</style>
