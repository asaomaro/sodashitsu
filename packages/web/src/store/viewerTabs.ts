import { readLocalHelperProof } from "../preview/helperProbe.js";
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { loadViewerTabs, type ViewerTab } from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { useMachinesStore } from "./machines.js";
import { useViewStore } from "./view.js";
export const useViewerTabsStore = defineStore("viewerTabs", () => {
  const tabs = ref<ViewerTab[]>([]),
    selected = ref<Record<string, string | null>>({});
  const machines = useMachinesStore(),
    view = useViewStore();
  let port: Pick<ConnectionPort, "request"> | undefined;
  const scope = computed(() => JSON.stringify([machines.selectedId, view.workspaceId]));
  const visible = computed(() =>
    tabs.value.filter(
      (t) => t.machineId === machines.selectedId && t.workspaceId === view.workspaceId,
    ).reverse(),
  );
  view.onWorkSelected((workspaceId) => {
    selected.value[JSON.stringify([machines.selectedId, workspaceId])] = null;
  });
  const active = computed(() => visible.value.find((t) => t.id === selected.value[scope.value]));
  const helperProbes = new Map<string, AbortController>();
  function connect(value: Pick<ConnectionPort, "request">) {
    for (const probe of helperProbes.values()) probe.abort();
    helperProbes.clear();
    port = value;
  }
  let revision = -1;
  function apply(raw: unknown, rev = revision + 1) {
    if (rev < revision) return;
    revision = rev;
    tabs.value = loadViewerTabs(raw);
  }
  async function startHelper(machineId: string, viewerId: string) {
    if (!port) throw new Error("操作元に接続していません");
    const controller = port, abort = new AbortController();
    helperProbes.get(viewerId)?.abort();
    helperProbes.set(viewerId, abort);
    try {
      try { await controller.request("preview.helper_start", {machineId, viewerId}); }
      catch (error) {
        if (abort.signal.aborted || (error as {code?:string})?.code !== "unauthorized") throw error;
        const probe = await controller.request("preview.helper_probe", {machineId, viewerId});
        const proof = await readLocalHelperProof(probe, abort.signal);
        if (abort.signal.aborted) throw new Error("helper probe cancelled");
        await controller.request("preview.helper_start", {machineId, viewerId, proof});
      }
    } finally { if (helperProbes.get(viewerId) === abort) helperProbes.delete(viewerId); }
  }
  async function stopHelper(viewerId: string) {
    helperProbes.get(viewerId)?.abort();
    helperProbes.delete(viewerId);
    await port?.request("preview.helper_stop", {viewerId});
  }
  async function refresh() {
    if (port) {
      const result = await port.request("viewer_tabs.list", {});
      apply(result.tabs, result.rev);
    }
  }
  function select(id: string | null) {
    selected.value[scope.value] = id;
  }
  async function create(p: Omit<ViewerTab, "id">) {
    if (!port) throw new Error("操作元のSodashitsuに接続していません");
    const result = await port.request("viewer_tabs.create", p);
    apply(result.tabs, result.rev);
    selected.value[JSON.stringify([p.machineId, p.workspaceId])] = result.tab.id;
    return result.tab;
  }
  async function remove(id: string) {
    if (!port) return;
    const result = await port.request("viewer_tabs.remove", { id });
    apply(result.tabs, result.rev);
  }
  async function rename(id: string, label: string) {
    if (!port) throw new Error("not connected");
    const result = await port.request("viewer_tabs.update", { id, label });
    apply(result.tabs, result.rev);
  }
  async function move(id: string, targetId: string) {
    if (!port) return;
    const position = tabs.value.findIndex((t) => t.id === targetId);
    if (position < 0 || id === targetId) return;
    const result = await port.request("viewer_tabs.update", { id, position });
    apply(result.tabs, result.rev);
  }
  return { tabs, visible, active, connect, apply, refresh, select, create, remove, move, rename, startHelper, stopHelper };
});
