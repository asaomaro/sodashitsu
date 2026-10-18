import { expect, it, vi } from "vitest";
import { desktopSettingsSection } from "./desktopSettings.js";
const permissions = {
  enabled: false,
  allowInput: false,
  allowClipboard: false,
  allowDisplayResize: false,
};
it("loads dedicated permissions and applies toggles without writing shared preferences", async () => {
  const state = { permissions, supported: true, canConfigure: true },
    changed = vi.fn();
  const port = {
    get: vi.fn(async () => state),
    set: vi.fn(async (p) => ({ ...state, permissions: p })),
  };
  const section = desktopSettingsSection(port, changed);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  section.items().find((i) => i.label === "画面共有を許可")!.activate!();
  await vi.waitFor(() => expect(port.set).toHaveBeenCalledWith({ ...permissions, enabled: true }));
});
