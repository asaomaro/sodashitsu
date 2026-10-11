import { it, expect } from "vitest";
import { pluginMobileDisplay } from "./pluginDisplay.js";
import type { ExtensionInfo } from "@sodashitsu/protocol";
it("uses current plugin definitions for existing tabs and preserves disconnected metadata", () => {
  const plugin = { extensionKey: "user:studio", display: "main", mobileDisplay: "old-mobile" };
  expect(pluginMobileDisplay(plugin, undefined)).toBe("old-mobile");
  expect(
    pluginMobileDisplay(plugin, [
      {
        key: "user:studio",
        tabView: { display: "main", mobileDisplay: "new-mobile" },
      } as ExtensionInfo,
    ]),
  ).toBe("new-mobile");
  expect(
    pluginMobileDisplay(plugin, [
      { key: "user:studio", tabView: { display: "main" } } as ExtensionInfo,
    ]),
  ).toBeUndefined();
  expect(pluginMobileDisplay(undefined, [])).toBeUndefined();
});
