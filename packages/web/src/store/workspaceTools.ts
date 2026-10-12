import { defineStore } from "pinia";
import { reactive } from "vue";
export const useWorkspaceToolsStore = defineStore("workspaceTools", () => {
  const drafts = reactive<Record<string, { text: string; loaded: string; version: string }>>({});
  const selection = reactive<Record<string, { path: string; line: number; commit: string }>>({});
  function forTab(id: string) {
    return selection[id] ?? (selection[id] = { path: "", line: 1, commit: "" });
  }
  return { selection, drafts, forTab };
});
