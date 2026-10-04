<script setup lang="ts">
/**
 * サイドバーの行の種類の印（20261004-group-worktree-items）。グループの見出し（`group`）と worktree グループの
 * 先頭の行（`worktreeGroup`）に付ける。色に頼らず、形（フォルダ／枝分かれ）と読み上げの文言で伝える。
 *
 * - 展開したサイドバー: 図形は飾り（`aria-hidden`）で、読み上げ用の文言を視覚的に隠した文字で添える（文言は position: absolute なので、基準の 1em の箱の中に置く）。
 * - 畳んだサイドバー（`compact`）: 文字は出せないので、印だけ。読み上げの名前と `title` は印自身が持つ。
 *
 * 見た目は `StateIcon.vue` と同じ作り: 1em の箱の中に `currentColor` で描く。
 */
const props = defineProps<{ kind: "group" | "worktreeGroup"; compact?: boolean }>();
const TEXT = { group: "グループ", worktreeGroup: "worktree グループ" } as const;
</script>

<template>
  <span
    class="sidebar-kind-icon"
    :data-kind="props.kind"
    :role="props.compact ? 'img' : undefined"
    :aria-label="props.compact ? TEXT[props.kind] : undefined"
    :title="TEXT[props.kind]"
  >
    <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <!-- グループ: フォルダ。 -->
      <path v-if="props.kind === 'group'" d="M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5z" />
      <!-- worktree グループ: 枝分かれ。 -->
      <template v-else>
        <circle cx="4.5" cy="3.5" r="1.5" />
        <circle cx="4.5" cy="12.5" r="1.5" />
        <circle cx="11.5" cy="5.5" r="1.5" />
        <path d="M4.5 5v6M11.5 7c0 2.5-3 2.5-7 4" />
      </template>
    </svg>
    <span v-if="!props.compact" class="sidebar-kind-text">{{ TEXT[props.kind] }}</span>
  </span>
</template>

<style scoped>
/* 占める場所は 1em の箱（`StateIcon.vue` と同じ）。行のラベルが印の有無で動かない。 */
.sidebar-kind-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1em;
  height: 1em;
  line-height: 1;
  /* 隠した文言（.sidebar-kind-text、position: absolute）の基準。無いとスクロール領域の外へ飛び出しうる。 */
  position: relative;
}
/* 読み上げ用の文言（見えない。畳んだサイドバーでは出さない）。 */
.sidebar-kind-text {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
</style>
