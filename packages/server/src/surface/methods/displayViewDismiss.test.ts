import { expect, it, vi } from "vitest";
import { ControlSurface } from "../ControlSurface.js";
import { registerDisplayMethods } from "./display.js";
import type { MethodDeps } from "./deps.js";
it("dismiss removes only the matching registered view using display names, including terminal variants", async () => {
  const surface = new ControlSurface(),
    remove = vi.fn(),
    tabs = [
      {
        id: "t",
        views: [
          { id: "v", paneId: "p", display: "web", terminalDisplay: "native" },
          { id: "other", paneId: "q", display: "web" },
        ],
      },
    ];
  const displays = {
    close: vi.fn(),
    list: (id: string) => ({
      displays:
        id === "p"
          ? [
              { id: "web-id", name: "web" },
              { id: "native-id", name: "native" },
            ]
          : [{ id: "other-id", name: "web" }],
    }),
    dismiss: (_c: string, p: { id?: string }) => ({
      closed: [p.id === "native-id" ? "native" : "web"],
    }),
  };
  registerDisplayMethods(surface, {
    session: { snapshot: () => ({ tabs }), hasPane: () => true, removeTabView: remove },
    displays,
  } as unknown as MethodDeps);
  expect(
    await surface.invoke({ clientId: "c" } as never, "display.dismiss", { id: "native-id" }),
  ).toMatchObject({ ok: true });
  expect(remove).toHaveBeenCalledExactlyOnceWith("t", "v");
  remove.mockClear();
  await surface.invoke({ clientId: "c" } as never, "display.dismiss", { id: "web-id" });
  expect(remove).toHaveBeenCalledExactlyOnceWith("t", "v");
});
