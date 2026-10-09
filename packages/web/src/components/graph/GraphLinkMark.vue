<script setup lang="ts">
/**
 * 別の空間のノードとの線の印（20261008-graph-first の PR1c T11g）。線の片方が表示中の空間に無いとき、見えているノードの縁に出す小さな印。
 * 相手の呼び名と線の種類。押すと相手の空間へ切り替えて、相手のノードへ動く。「設定」から、線の設定（`LinkPanel`。履歴はそこから）を開ける。
 * 読み取りだけ（モバイル）では押せない文字だけ。
 */
defineProps<{
  linkId: string;
  /** 見えているノードの鍵（印はそのノードの下に並ぶ）。 */
  nodeKey: string;
  /** 相手の呼び名。 */
  otherName: string;
  /** 相手のいる空間の名前。 */
  otherSpace: string;
  /** 線の種類の名前。 */
  kindName: string;
  /** 一時停止・上限・無効の印（線のチップと同じ語。無ければ空）。 */
  status: string;
  /** 線の向き（見えているノードから見て、出る〔→〕か入る〔←〕か）。 */
  direction: "out" | "in";
  /** 世界の座標（左上）。 */
  x: number;
  y: number;
  selected: boolean;
  readOnly: boolean;
}>();
const emit = defineEmits<{ go: []; settings: []; back: [] }>();

/**
 * キーボード: 印のボタンは `tabindex="-1"`（Tab の順を増やさない）。ノードで `m` を押すと、そのノードの最初の印へ入る。中は ← →（押す・設定）・↑ ↓（同じノードの前後の印）、`Esc` でノードへ戻る。
 */
function onKeydown(ev: KeyboardEvent): void {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) return;
  const el = ev.currentTarget as HTMLElement;
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    emit("back");
    return;
  }
  const buttons = [...el.querySelectorAll<HTMLElement>("button")];
  const i = buttons.indexOf(document.activeElement as HTMLElement);
  let next: HTMLElement | undefined;
  if (ev.key === "ArrowRight") next = buttons[Math.min(buttons.length - 1, i + 1)];
  else if (ev.key === "ArrowLeft") next = buttons[Math.max(0, i - 1)];
  else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    const sibs = [...(el.parentElement?.querySelectorAll<HTMLElement>(`[data-mark-node="${CSS.escape(el.dataset["markNode"] ?? "")}"]`) ?? [])];
    const j = sibs.indexOf(el);
    next = sibs[ev.key === "ArrowDown" ? Math.min(sibs.length - 1, j + 1) : Math.max(0, j - 1)]?.querySelector<HTMLElement>("button") ?? undefined;
  } else return;
  ev.preventDefault();
  ev.stopPropagation();
  next?.focus({ preventScroll: true });
}
</script>

<template>
  <div
    class="graph-mark"
    :class="{ 'graph-mark-selected': selected }"
    :style="{ left: `${x}px`, top: `${y}px` }"
    :data-link-mark="linkId"
    :data-mark-node="nodeKey"
    @pointerdown.stop
    @keydown="onKeydown"
  >
    <button
      v-if="!readOnly"
      type="button"
      class="graph-mark-go"
      tabindex="-1"
      :aria-label="`別の空間（${otherSpace}）の ${otherName} との線（${kindName}）${status ? `・${status}` : ''}。押すとそのノードへ移動`"
      :title="`${otherSpace}・${otherName}（${kindName}）`"
      @click="emit('go')"
    >
      <span class="graph-mark-arrow" aria-hidden="true">{{ direction === "out" ? "→" : "←" }}</span>
      <span class="graph-mark-name">{{ otherName }}</span>
      <span class="graph-mark-kind">{{ kindName }}</span>
      <span v-if="status" class="graph-mark-status">{{ status }}</span>
    </button>
    <span v-else class="graph-mark-go graph-mark-static" :title="`${otherSpace}・${otherName}（${kindName}）`">
      <span class="graph-mark-arrow" aria-hidden="true">{{ direction === "out" ? "→" : "←" }}</span>
      <span class="graph-mark-name">{{ otherName }}</span>
      <span class="graph-mark-kind">{{ kindName }}</span>
      <span v-if="status" class="graph-mark-status">{{ status }}</span>
    </span>
    <button
      v-if="!readOnly"
      type="button"
      class="graph-mark-settings"
      tabindex="-1"
      :aria-label="`${otherName} との線（${kindName}）の設定を開く`"
      title="線の設定"
      @click="emit('settings')"
    >
      ⚙
    </button>
  </div>
</template>

<style scoped>
.graph-mark {
  position: absolute;
  display: flex;
  align-items: stretch;
  height: 18px;
  max-width: 220px;
  border: 1px solid var(--soda-menu-border, #44475a);
  border-radius: 9px;
  background: var(--soda-menu-bg, #282a36);
  color: var(--soda-menu-fg, #f8f8f2);
  font-size: 10px;
  overflow: hidden;
}
.graph-mark-selected {
  border-color: var(--soda-accent, #6070a1);
  box-shadow: 0 0 0 1px var(--soda-accent, #6070a1);
}
.graph-mark-go,
.graph-mark-settings {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0 6px;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.graph-mark-static {
  cursor: default;
}
.graph-mark-go:hover,
.graph-mark-settings:hover {
  background: var(--soda-menu-hover-bg, #343746);
}
.graph-mark-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.graph-mark-kind {
  flex: none;
  opacity: 0.7;
}
.graph-mark-status {
  flex: none;
  color: var(--soda-warn-fg, #ffb86c);
}
.graph-mark-settings {
  flex: none;
  border-left: 1px solid var(--soda-menu-border, #44475a);
}
</style>
