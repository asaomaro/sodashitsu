<script setup lang="ts">
/**
 * 囲いの層（20261008-graph-first の PR1c T11c・T11d）。ノード・線の**下**に描く（世界の層の先頭）。囲いの本体はポインタを通す（背景のパン・ノードの操作を邪魔しない）。
 * 見出し（高さ 40 の帯）だけが押せる——つかんで動かす（親が持つ）・tab のタグを押す。色は既存の `--soda-*` だけ。文字の幅は測らない（CSS の省略）。
 * workspace の囲い: 名前（太字）・フォルダとブランチ（小さな等幅）・tab のタグ。worktree グループ: 名前と「worktree グループ・N worktree」。
 */
import { computed, ref } from "vue";
import type { DisplayFrame, FrameInfo } from "@sodashitsu/client-core";

const props = defineProps<{
  frames: readonly DisplayFrame[];
  infos: ReadonlyMap<string, FrameInfo>;
  /** 選んでいる workspace の id（その囲いを見分ける）。 */
  selectedWorkspaceId: string | null;
  /** 移った先として強く出している囲い。 */
  flashId: string | null;
  /** 強調している tab。 */
  emphasis: { workspaceId: string; tabId: string } | null;
  /** 落とせない見た目にしている囲い（ノードのドラッグ中、ほかの workspace の囲いの上）。 */
  blockedId: string | null;
  /** 動かしている囲い。 */
  draggingId: string | null;
  /** 読み取りだけ（モバイル）。つかめず、タグも押せない。 */
  readOnly: boolean;
}>();
const emit = defineEmits<{
  headingPointerdown: [ev: PointerEvent, frameId: string];
  tag: [workspaceId: string, tabId: string];
  /** タグから `Esc`: ノードへ戻る。 */
  leave: [];
}>();

/** タグを並べる数の上限（収まらない分は「+N」）。 */
const TAGS_MAX = 8;

interface Row {
  frame: DisplayFrame;
  info: FrameInfo;
  tags: { id: string; label: string; active: boolean; emphasized: boolean }[];
  more: number;
}
const rows = computed<Row[]>(() =>
  props.frames.flatMap((frame) => {
    const info = props.infos.get(frame.id);
    if (info === undefined) return [];
    const tags = info.tabs.slice(0, TAGS_MAX).map((t) => ({
      ...t,
      emphasized: props.emphasis?.workspaceId === info.id && props.emphasis.tabId === t.id,
    }));
    return [{ frame, info, tags, more: Math.max(0, info.tabs.length - TAGS_MAX) }];
  }),
);

/**
 * キーボード: タグのボタンはすべて `tabindex="-1"` で、Tab で止まる所は、この層全体で 1 つだけ（`entry`。囲いが増えても、ノードへ着くまでの Tab の数は変わらない）。
 * その中は矢印キーで移る（← →: 同じ囲いのタグ・↑ ↓: 前後の囲いの最初のタグ・Home/End: 同じ囲いの端）。
 */
const entry = ref<string | null>(null);
const tagKey = (frameId: string, tabId: string): string => `${frameId}|${tabId}`;
const firstTagKey = computed<string | null>(() => {
  const r = rows.value.find((x) => x.tags.length > 0);
  return r ? tagKey(r.info.id, r.tags[0]!.id) : null;
});
const entryKey = computed<string | null>(() => {
  const k = entry.value;
  if (k !== null && rows.value.some((r) => r.tags.some((t) => tagKey(r.info.id, t.id) === k))) return k;
  return firstTagKey.value;
});
function onTagFocus(frameId: string, tabId: string): void {
  entry.value = tagKey(frameId, tabId);
}
function onTagKeydown(ev: KeyboardEvent): void {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("leave");
    return;
  }
  const el = ev.currentTarget as HTMLElement;
  const head = el.closest(".graph-frame-head");
  const tags = [...(head?.querySelectorAll<HTMLElement>("[data-tab-tag]") ?? [])];
  const i = tags.indexOf(el);
  let next: HTMLElement | undefined;
  if (ev.key === "ArrowRight") next = tags[Math.min(tags.length - 1, i + 1)];
  else if (ev.key === "ArrowLeft") next = tags[Math.max(0, i - 1)];
  else if (ev.key === "Home") next = tags[0];
  else if (ev.key === "End") next = tags.at(-1);
  else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    const heads = [...(el.closest(".graph-frames")?.querySelectorAll<HTMLElement>(".graph-frame-head") ?? [])].filter((h) => h.querySelector("[data-tab-tag]"));
    const j = heads.indexOf(head as HTMLElement);
    next = heads[ev.key === "ArrowDown" ? Math.min(heads.length - 1, j + 1) : Math.max(0, j - 1)]?.querySelector<HTMLElement>("[data-tab-tag]") ?? undefined;
  } else return;
  ev.preventDefault();
  ev.stopPropagation();
  next?.focus({ preventScroll: true });
}

function subtitle(info: FrameInfo): string {
  if (info.kind === "worktree") return `worktree グループ・${info.worktreeCount ?? 0} worktree`;
  return [info.folder, info.branch].filter((s): s is string => s !== null && s !== "").join(" · ");
}
</script>

<template>
  <div class="graph-frames" aria-hidden="false">
    <div
      v-for="r in rows"
      :key="r.frame.id"
      class="graph-frame"
      :class="[
        `graph-frame-${r.info.kind}`,
        {
          'graph-frame-selected': r.info.kind === 'workspace' && r.info.id === selectedWorkspaceId,
          'graph-frame-flash': flashId === r.frame.id,
          'graph-frame-blocked': blockedId === r.frame.id,
          'graph-frame-dragging': draggingId === r.frame.id,
          'graph-frame-placeholder': r.frame.placeholder,
          'graph-frame-movable': !readOnly && !r.frame.placeholder,
        },
      ]"
      :data-frame-id="r.frame.id"
      :data-frame-kind="r.info.kind"
      :style="{
        left: `${r.frame.rect.x}px`,
        top: `${r.frame.rect.y}px`,
        width: `${r.frame.rect.w}px`,
        height: `${r.frame.rect.h}px`,
      }"
    >
      <div
        class="graph-frame-head"
        role="group"
        :aria-label="`${r.info.title}${r.info.kind === 'worktree' ? '（worktree グループ）' : ''}`"
        @pointerdown="!readOnly && !r.frame.placeholder && emit('headingPointerdown', $event, r.frame.id)"
      >
        <span class="graph-frame-title" :title="r.info.title">{{ r.info.title }}</span>
        <span class="graph-frame-sub" :title="subtitle(r.info)">{{ subtitle(r.info) }}</span>
        <span v-if="r.tags.length > 0" class="graph-frame-tags">
          <template v-for="t in r.tags" :key="t.id">
            <button
              v-if="!readOnly"
              type="button"
              class="graph-frame-tag"
              :class="{ 'graph-frame-tag-active': t.active, 'graph-frame-tag-emphasized': t.emphasized }"
              :aria-pressed="t.emphasized"
              :aria-label="`tab ${t.label}${t.active ? '（選ばれている tab）' : ''}`"
              :title="t.label"
              :tabindex="entryKey === tagKey(r.info.id, t.id) ? 0 : -1"
              data-tab-tag
              :data-tab-id="t.id"
              @pointerdown.stop
              @focus="onTagFocus(r.info.id, t.id)"
              @keydown="onTagKeydown"
              @click.stop="emit('tag', r.info.id, t.id)"
            >
              {{ t.label }}
            </button>
            <span
              v-else
              class="graph-frame-tag"
              :class="{ 'graph-frame-tag-active': t.active }"
              :title="t.label"
              >{{ t.label }}</span
            >
          </template>
          <span v-if="r.more > 0" class="graph-frame-more">+{{ r.more }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-frames {
  position: absolute;
  left: 0;
  top: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
.graph-frame {
  position: absolute;
  box-sizing: border-box;
  border-radius: var(--soda-shape-radius-l, 6px);
  pointer-events: none;
}
.graph-frame-workspace,
.graph-frame-machine {
  border: 1px dashed var(--soda-menu-border, #44475a);
  background: var(--soda-subtle-bg, rgba(255, 255, 255, 0.08));
}
.graph-frame-worktree {
  border: 2px solid var(--soda-menu-border, #44475a);
  border-radius: var(--soda-shape-radius-l, 6px);
  background: transparent;
}
/* 仮の囲い: 文字は薄めず、枠と地だけを薄くする（opacity は子の文字にも掛かる） */
.graph-frame-placeholder {
  border-color: color-mix(in srgb, var(--soda-menu-border, #44475a) 55%, transparent);
  background: color-mix(in srgb, var(--soda-subtle-bg, rgba(255, 255, 255, 0.08)) 55%, transparent);
}
/* 選んでいる workspace: 枠は accent の実線 2px・外側に同じ色の薄い輪（PR1e AC-L5） */
.graph-frame-selected {
  border: 2px solid var(--soda-accent, #6070a1);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--soda-accent, #6070a1) 28%, transparent);
}
.graph-frame-flash {
  border-color: var(--soda-accent, #6070a1);
  border-style: solid;
  border-width: 3px;
  box-shadow: 0 0 0 8px var(--soda-subtle-bg, rgba(255, 255, 255, 0.08));
}
.graph-frame-blocked {
  border-color: var(--soda-error-fg, #ff5555);
  border-style: dotted;
  background: var(--soda-subtle-bg, rgba(255, 255, 255, 0.08));
}
.graph-frame-dragging {
  border-color: var(--soda-accent, #6070a1);
}
.graph-frame-head {
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  height: 40px;
  padding: 0 12px;
  pointer-events: auto;
  user-select: none;
  overflow: hidden;
}
.graph-frame-movable .graph-frame-head {
  cursor: grab;
}
.graph-frame-dragging .graph-frame-head {
  cursor: grabbing;
}
.graph-frame-title {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 45%;
  font-size: 14px;
  font-weight: bold;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.graph-frame-sub {
  flex: 1 1 0;
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.graph-frame-tags {
  flex: 0 1 auto;
  min-width: 0;
  display: flex;
  gap: 4px;
  overflow: hidden;
}
.graph-frame-tag {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 7em;
  height: var(--soda-shape-tag-h, auto);
  padding: 1px 8px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 10px;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
span.graph-frame-tag {
  cursor: default;
}
.graph-frame-tag-active {
  background: var(--soda-accent, #6070a1);
  border-color: var(--soda-accent, #6070a1);
  color: var(--soda-accent-fg, #f8f8f2);
}
.graph-frame-tag-emphasized {
  outline: 2px solid var(--soda-state-working, #f1fa8c);
  outline-offset: 1px;
}
.graph-frame-more {
  flex: none;
  font-size: 11px;
  opacity: 0.7;
}
@media (prefers-reduced-motion: no-preference) {
  .graph-frame {
    transition: box-shadow 0.25s ease, border-color 0.25s ease;
  }
}
</style>
