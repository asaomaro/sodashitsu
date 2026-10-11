import { defineStore } from "pinia";
import { ref } from "vue";
export const useConversationWindowStore = defineStore("conversationWindow", () => {
  const target = ref<{ paneId: string; mode: "messages" | "summary" } | null>(null);
  function open(paneId: string, mode: "messages" | "summary") {
    target.value =
      target.value?.paneId === paneId && target.value.mode === mode ? null : { paneId, mode };
  }
  return { target, open };
});
