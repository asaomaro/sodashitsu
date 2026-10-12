import { expect, it, vi } from "vitest";
import { BUILTIN_WORKSPACE_KEY } from "@sodashitsu/protocol";
import { ControlSurface } from "../ControlSurface.js";
import { registerTabMethods } from "./tab.js";
import type { MethodDeps } from "./deps.js";
it("enforces view information targets at the server, retaining pane float and legacy definitions", async () => {
  const surface = new ControlSurface();
  const add = vi.fn((_id, def) => def);
  registerTabMethods(surface, {
    session: {
      getTab: () => ({ id: "t", workspaceId: "w" }),
      snapshot: () => ({ workspaces: [{ id: "w", projectDir: "/pj" }] }),
      addTabView: add,
    },
    extensions: {
      list: () => ({
        extensions: [
          {
            key: "plugin",
            views: [
              { id: "pane", targets: ["pane"], placements: ["float"] },
              { id: "tab", targets: ["tab"], placements: ["left"] },
              { id: "legacy", placements: ["float"] },
            ],
          },
        ],
      }),
      canUseExtension: () => true,
    },
  } as unknown as MethodDeps);
  const call = (
    extensionKey: string,
    viewId: string,
    target: "tab" | "pane",
    placement: "left" | "float",
  ) =>
    surface.invoke({} as never, "tab.add_view", {
      tabId: "t",
      extensionKey,
      viewId,
      target,
      placement,
      ...(target === "pane" ? { paneId: "p" } : {}),
    });
  expect(await call(BUILTIN_WORKSPACE_KEY, "files", "pane", "float")).toMatchObject({
    ok: false,
    error: { code: "invalid_params" },
  });
  expect(await call("plugin", "tab", "pane", "left")).toMatchObject({
    ok: false,
    error: { code: "invalid_params" },
  });
  expect(add).not.toHaveBeenCalled();
  expect(await call("plugin", "pane", "pane", "float")).toMatchObject({ ok: true });
  expect(await call("plugin", "pane", "tab", "float")).toMatchObject({
    ok: true,
    result: { informationTarget: "pane", target: "tab" },
  });
  expect(await call("plugin", "legacy", "tab", "float")).toMatchObject({ ok: true });
  expect(await call("plugin", "legacy", "pane", "float")).toMatchObject({ ok: true });
});
