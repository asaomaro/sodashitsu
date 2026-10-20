import { createPinia, setActivePinia } from "pinia";
import { mount, flushPromises } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import { ConnectionKey, LocalClientFactoryKey, MachineSwitcherKey } from "../injection.js";
import { useMachinesStore } from "../store/machines.js";
import WorkAgentRequests from "./WorkAgentRequests.vue";

it("requires A's explicit click and launches through A, while rejection goes to B", async () => {
  const pinia = createPinia(); setActivePinia(pinia);
  const machines = useMachinesStore(); machines.selectedId = "a".repeat(32);
  const id = "12345678-1234-4234-9234-123456789abc";
  const remote = { request: vi.fn(async () => ({ requests: [{ id, state: "pending", folder: "C:\\remote", agentKind: "codex", args: ["resume", "--last"] }] })) };
  const local = { start: vi.fn(), stop: vi.fn(), request: vi.fn(async () => ({ workspaceId: "w", tabId: "t", paneId: "p" })) };
  const switchTo = vi.fn();
  const wrapper = mount(WorkAgentRequests, { global: { plugins: [pinia], provide: { [ConnectionKey as symbol]: remote, [LocalClientFactoryKey as symbol]: () => local, [MachineSwitcherKey as symbol]: { switchTo } } } });
  await flushPromises();
  expect(wrapper.text()).toContain("C:\\remote"); expect(local.request).not.toHaveBeenCalled();
  await wrapper.findAll("button")[0]!.trigger("click"); await flushPromises();
  expect(local.request).toHaveBeenCalledWith("work.agent_launch", { machineId: "a".repeat(32), requestId: id });
  expect(remote.request).not.toHaveBeenCalledWith("work.agent_launch", expect.anything());
  expect(switchTo).toHaveBeenCalledWith("local", { workspaceId: "w", tabId: "t", paneId: "p" }, { force: true });
  wrapper.unmount(); expect(local.stop).toHaveBeenCalled();
});
