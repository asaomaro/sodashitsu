import { expect, it } from "vitest";
import type { TabViewInstance } from "@sodashitsu/protocol";
import { viewInformation } from "./viewInformation.js";
it("a pane function on a tab follows its active pane while fixed-pane and whole-tab views retain their source", () => {
  const v: TabViewInstance = {
    id: "v",
    extensionKey: "e",
    display: "v",
    viewId: "conversation",
    paneId: "anchor",
    target: "tab",
    informationTarget: "pane",
    placement: "float",
  };
  expect(viewInformation(v, "p1").sourcePaneId).toBe("p1");
  expect(viewInformation(v, "p2").sourcePaneId).toBe("p2");
  expect(viewInformation({ ...v, target: "pane", paneId: "p1" }, "p2").sourcePaneId).toBe("p1");
  expect(viewInformation({ ...v, informationTarget: "tab" }, "p2").sourcePaneId).toBeUndefined();
  expect(v).not.toHaveProperty("sourcePaneId");
});
