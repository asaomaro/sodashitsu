// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import DesktopSettings from "./DesktopSettings.vue";
import { ConnectionKey } from "../injection.js";
const permissions = {
  enabled: false,
  allowInput: false,
  allowClipboard: false,
  allowDisplayResize: false,
};
it("saves the permission controls through the dedicated local RPC", async () => {
  const request = vi.fn(async (method, p) => ({
    permissions: method.endsWith("set") ? p : permissions,
    supported: true,
    canConfigure: true,
  }));
  const wrapper = mount(DesktopSettings, {
    global: { provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  await wrapper.findAll('input[type="checkbox"]')[0]!.setValue(true);
  await wrapper.findAll('input[type="checkbox"]')[1]!.setValue(true);
  await wrapper.get("button").trigger("click");
  await flushPromises();
  expect(request).toHaveBeenLastCalledWith("desktop.settings.set", {
    ...permissions,
    enabled: true,
    allowInput: true,
  });
  expect(wrapper.text()).toContain("保存しました");
  wrapper.unmount();
});
it("shows the local setup guidance and disables controls on a remote connection", async () => {
  const request = vi.fn(async () => ({ permissions, supported: true, canConfigure: false }));
  const wrapper = mount(DesktopSettings, {
    global: { provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
  expect(wrapper.text()).toContain("共有するPCのlocalhost");
  await wrapper.get("button").trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(1);
  wrapper.unmount();
});

it("waits for the settings screen's active connection and reloads after reconnect", async () => {
  const request = vi.fn(async () => ({ permissions, supported: true, canConfigure: true }));
  const wrapper = mount(DesktopSettings, {
    props: { active: false },
    global: { provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  expect(request).not.toHaveBeenCalled();
  await wrapper.setProps({ active: true });
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(1);
  await wrapper.setProps({ active: false });
  await wrapper.setProps({ active: true });
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(2);
  wrapper.unmount();
});

it("ignores a stale save response after closing and reopening settings", async () => {
  let finish!: (value: unknown) => void;
  let reads = 0;
  const request = vi.fn(async (method: string) => {
    if (method === "desktop.settings.set") return new Promise(resolve => { finish = resolve; });
    reads++;
    return { permissions, supported: true, canConfigure: reads === 1 };
  });
  const wrapper = mount(DesktopSettings, { global: { provide: { [ConnectionKey as symbol]: { request } } } });
  await flushPromises();
  await wrapper.get("button").trigger("click");
  await wrapper.setProps({ active: false }); await wrapper.setProps({ active: true }); await flushPromises();
  finish({ permissions: { ...permissions, enabled: true }, supported: true, canConfigure: true });
  await flushPromises();
  expect(wrapper.get("fieldset").attributes("disabled")).toBeDefined();
  expect((wrapper.findAll("input")[0]!.element as HTMLInputElement).checked).toBe(false);
  expect(wrapper.text()).not.toContain("保存しました"); wrapper.unmount();
});
