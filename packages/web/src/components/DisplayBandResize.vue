<script setup lang="ts">
import { computed, ref } from "vue";
import type { DisplayInfo } from "@sodashitsu/protocol";
import { useDisplayStore } from "../store/display.js";
import { useResizeDrag } from "../composables/useResizeDrag.js";
const props = defineProps<{ info: DisplayInfo }>();
const store = useDisplayStore(),
  live = ref<number | null>(null);
const bottom = computed(() => store.effectiveOf(props.info).edge === "bottom");
const drag = useResizeDrag({
  axis: "y",
  begin: (e) => ({ y: e.clientY, height: store.bandHeightOf(props.info) }),
  move: (e, s) => {
    live.value = Math.max(24, Math.min(96, s.height + (e.clientY - s.y) * (bottom.value ? -1 : 1)));
  },
  commit: (s) => {
    store.setBandHeight(props.info, live.value ?? s.height);
    live.value = null;
  },
  cancel: () => {
    live.value = null;
  },
  reset: () => store.setBandHeight(props.info, props.info.size),
});
</script>
<template>
  <span
    class="band-resize"
    :class="{ 'band-resize-top': bottom }"
    role="separator"
    aria-label="帯の高さ"
    aria-orientation="horizontal"
    :aria-valuenow="store.bandHeightOf(info)"
    data-band-resize
    @pointerdown="drag.onPointerDown"
    @pointermove="drag.onPointerMove"
    @pointerup="drag.onPointerEnd"
    @pointercancel="drag.onPointerEnd"
    @lostpointercapture="drag.onPointerEnd"
    ><span
      v-if="live !== null"
      class="band-height-guide"
      :style="{
        transform: `translateY(${(live - store.bandHeightOf(info)) * (bottom ? -1 : 1)}px)`,
      }"
  /></span>
</template>
<style scoped>
.band-resize {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 4px;
  cursor: row-resize;
  z-index: 5;
}
.band-resize-top {
  top: 0;
  bottom: auto;
}
.band-resize:hover {
  background: var(--soda-accent);
}
.band-height-guide {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  border-top: 2px dashed var(--soda-accent);
  pointer-events: none;
}
</style>
