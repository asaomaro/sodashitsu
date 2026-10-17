import { defineStore } from "pinia";
import { shallowReactive } from "vue";

/** DOM destinations only; preview ownership stays with the persistent tab host. */
export const useNativePreviewsStore = defineStore("nativePreviews", () => {
  const targets = shallowReactive(new Map<string, HTMLElement>());
  function target(tabId: string, element: HTMLElement | null): void {
    if (element) targets.set(tabId, element);
    else targets.delete(tabId);
  }
  return { targets, target };
});
