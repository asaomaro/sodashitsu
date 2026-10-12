<script setup lang="ts">
import { onBeforeUnmount } from "vue";
import type { DisplayInfo } from "@sodashitsu/protocol";
import { useDisplayStore } from "../store/display.js";
import { useViewStore } from "../store/view.js";
import { createDockDrag } from "../display/dockDrag.js";
import { useSettingsStore } from "../store/settings.js";
import ViewDragIcon from "./ViewDragIcon.vue";
const settings = useSettingsStore();
const props = defineProps<{ info: DisplayInfo }>();
const store = useDisplayStore(),
  view = useViewStore();
const drag = createDockDrag({
  get id() {
    return props.info.id;
  },
  get paneId() {
    return props.info.paneId;
  },
  box: () =>
    document
      .querySelector(
        `[data-display-pane-id="${CSS.escape(props.info.paneId)}"] .pane-frame-body-displays`,
      )
      ?.getBoundingClientRect() ?? null,
  float: () => store.canPlace(props.info, "float") && store.canOpenFloat(props.info.paneId),
  accepts: (z) => store.canPlace(props.info, z),
  setState: (s) => store.setDockDrag(s),
  drop: (z) => store.setViewPlacement(props.info, z),
  modalOpen: () => view.modalOpen,
});
onBeforeUnmount(() => drag.cancel());
</script>
<template>
  <span
    class="band-grip"
    data-display-grip
    data-display-keepfocus
    :title="info.title ?? info.name"
    @pointerdown="drag.onPointerDown"
    @pointermove="drag.onPointerMove"
    @pointerup="drag.onPointerUp"
    @pointercancel="drag.onPointerCancel"
    @lostpointercapture="drag.onPointerCancel"
    @contextmenu.prevent.stop="
      view.openContextMenu(
        { kind: 'display', id: info.id },
        { x: $event.clientX, y: $event.clientY },
      )
    "
    ><ViewDragIcon /><span v-if="settings.viewTitleVisible" class="band-grip-label">{{
      info.title ?? "表示"
    }}</span></span
  >
</template>
<style scoped>
.band-grip {
  flex: none;
  box-sizing: border-box;
  min-height: 24px;
  padding-left: 8px;
  font-size: 0.75em;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: grab;
  user-select: none;
  align-self: center;
  touch-action: none;
  max-width: 160px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.band-grip-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
