import { describe, expect, it } from "vitest";
import type { DisplayInfo, Pane, Tab } from "@sodashitsu/protocol";
import { componentViewport, terminalComponentAllowed } from "./components.js";
import { readFrameMessage } from "./frameMessages.js";

describe("native component boundary", () => {
  const info = { paneId: "anchor", format: "script-html" } as DisplayInfo;
  const panes = new Map(
    [
      ["anchor", { id: "anchor", tabId: "app", virtual: true }],
      ["agent", { id: "agent", tabId: "work", status: "running" }],
      ["other", { id: "other", tabId: "elsewhere", status: "running" }],
    ].map(([id, p]) => [id, p]) as [string, Pane][],
  );
  const tabs = new Map([
    ["app", { workspaceId: "w" }],
    ["work", { workspaceId: "w" }],
    ["elsewhere", { workspaceId: "other-w" }],
  ] as [string, Tab][]);
  it("permits background agents in the owning workspace, but no other workspace, virtual or missing pane", () => {
    expect(terminalComponentAllowed(info, "agent", panes, tabs)).toBe(true);
    for (const id of ["other", "anchor", "missing"])
      expect(terminalComponentAllowed(info, id, panes, tabs)).toBe(false);
    panes.set("agent", { ...panes.get("agent")!, tabId: "elsewhere" });
    expect(terminalComponentAllowed(info, "agent", panes, tabs)).toBe(false);
    panes.set("agent", { ...panes.get("agent")!, tabId: "work" });
    expect(terminalComponentAllowed({ ...info, format: "html" }, "agent", panes, tabs)).toBe(false);
  });
  it("clips author placement to both the frame viewport and scroll container", () => {
    const rect = { x: -20, y: 30, width: 400, height: 300 };
    expect(
      componentViewport(
        { id: "1", paneId: "agent", rect, clip: { x: 10, y: 40, width: 300, height: 100 } },
        200,
        180,
      ),
    ).toEqual({ x: 10, y: 40, width: 190, height: 100 });
  });
  it("rejects malformed/oversized/non-finite component requests", () => {
    const m = {
      type: "component",
      component: "terminal",
      rev: 1,
      id: "1",
      paneId: "agent",
      rect: { x: 0, y: 0, width: 200, height: 100 },
      clip: { x: 0, y: 0, width: 200, height: 100 },
    };
    expect(readFrameMessage(m)).toMatchObject(m);
    for (const changes of [
      { rev: 0 },
      { component: "iframe" },
      { interactive: "true" },
      { id: "__proto__" },
      { rect: { ...m.rect, x: NaN } },
      { rect: { ...m.rect, width: -1 } },
      { clip: { ...m.clip, height: 1e8 } },
    ])
      expect(readFrameMessage({ ...m, ...changes })).toBeNull();
  });
});

it("terminal input is opt-in, and frame messages only accept a boolean", () => {
  const rect = { x: 0, y: 0, width: 20, height: 20 };
  const m = {
    type: "component",
    rev: 1,
    component: "terminal",
    id: "1",
    paneId: "p",
    rect,
    clip: rect,
  };
  expect(readFrameMessage(m)).toMatchObject({ interactive: false });
  expect(readFrameMessage({ ...m, interactive: true })).toMatchObject({ interactive: true });
});
