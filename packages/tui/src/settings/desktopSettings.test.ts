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
  await vi.waitFor(()=>expect(section.items().find(i=>i.label.startsWith("管理者権限"))!.disabled).toBe(false));
  section.items().find(i=>i.label.startsWith("管理者権限"))!.activate!();
  await vi.waitFor(()=>expect(port.set).toHaveBeenLastCalledWith({...permissions,enabled:true,allowElevated:true}));
});
it("edits a separately approved file root without changing other desktop permissions", async () => {
  const state = { permissions, supported: true, canConfigure: true },
    changed = vi.fn(),
    port = {
      get: vi.fn(async () => state),
      set: vi.fn(async (p) => ({ ...state, permissions: p })),
    };
  const section = desktopSettingsSection(port, changed);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const edit = section.items().find((i) => i.label === "ファイル共有フォルダ")!.activate!();
  expect(typeof edit).toBe("object");
  if (typeof edit === "object" && edit.kind === "edit") edit.commit(" /tmp/generated-files ");
  await vi.waitFor(() =>
    expect(port.set).toHaveBeenCalledWith({ ...permissions, fileRoot: "/tmp/generated-files" }),
  );
});
