import { expect, it, vi } from "vitest";
import { ControlSurface, type MethodContext } from "../ControlSurface.js";
import { registerDesktopCdpMethods } from "./desktopCdp.js";
it("allows local permission updates but never a machine-bridge or remote browser update", async () => {
  const surface = new ControlSurface(),
    set = vi.fn(),
    get = vi.fn(() => ({}));
  registerDesktopCdpMethods(surface, {} as never, { set, get } as never);
  const permissions = { enabled: true, allowInput: false, allowFit: false },
    ctx = { clientId: "browser" } as MethodContext;
  expect(await surface.invoke(ctx, "vscode.settings.set", permissions)).toMatchObject({
    ok: false,
    error: { code: "unauthorized" },
  });
  expect(set).not.toHaveBeenCalled();
  expect(
    await surface.invoke(
      { ...ctx, connection: { localSettings: true } as never },
      "vscode.settings.set",
      permissions,
    ),
  ).toMatchObject({ ok: true });
  expect(set).toHaveBeenCalledWith(permissions);
  expect(
    await surface.invoke(
      { ...ctx, connection: { localSettings: true } as never },
      "vscode.settings.set",
      { ...permissions, command: "bad" },
    ),
  ).toMatchObject({ ok: false, error: { code: "invalid_params" } });
});
