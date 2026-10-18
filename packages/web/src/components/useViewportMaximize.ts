import { nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";

/** Keep the same DOM (including live iframes) while escaping ancestor clipping. */
export function useViewportMaximize(surface: Ref<HTMLElement | undefined>) {
  const maximized = ref(false);
  function hide() {
    const el = surface.value;
    if (typeof el?.hidePopover === "function" && el.hasAttribute("popover")) el.hidePopover();
  }
  watch(
    maximized,
    async (value) => {
      if (!value) hide();
      await nextTick();
      const el = surface.value;
      if (value && maximized.value && el?.isConnected && typeof el.showPopover === "function") {
        el.showPopover();
      }
    },
    { flush: "sync" },
  );
  onBeforeUnmount(hide);
  return maximized;
}
