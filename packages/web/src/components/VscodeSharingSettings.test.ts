import { mount, flushPromises } from "@vue/test-utils";
import { expect, it, vi } from "vitest";
import { ConnectionKey } from "../injection.js";
import VscodeSharingSettings from "./VscodeSharingSettings.vue";
it("saves permission through the local settings endpoint without executing a command", async () => {
  const permissions = { enabled: false, allowInput: false, allowFit: false };
  const request = vi.fn(async (_method: string, p: unknown) => ({
    permissions: _method.endsWith("set") ? p : permissions,
    supported: true,
    canConfigure: true,
    customCommand: false,
  }));
  const w = mount(VscodeSharingSettings, {
    global: { provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  await w.get('input[type="checkbox"]').setValue(true);
  await w.get("button").trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith("vscode.settings.set", {
    enabled: true,
    allowInput: false,
    allowFit: false,
  });
  expect(w.text()).toContain("保存しました");
  w.unmount();
});
it("disables permission changes when the user is connected to another PC", async () => {
  const request = vi.fn(async () => ({
    permissions: { enabled: false, allowInput: false, allowFit: false },
    supported: true,
    canConfigure: false,
    customCommand: false,
  }));
  const w = mount(VscodeSharingSettings, {
    global: { provide: { [ConnectionKey as symbol]: { request } } },
  });
  await flushPromises();
  expect(w.get("fieldset").attributes("disabled")).toBeDefined();
  await w.get("button").trigger("click");
  expect(request).toHaveBeenCalledTimes(1);
  w.unmount();
});
