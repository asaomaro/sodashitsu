import { describe, expect, it } from "vitest";
import type { GraphLink } from "@sodashitsu/protocol";
import { linksTouching, paneIdsOfTargets } from "./closeLinks.js";

// 20261008-graph-first の PR3 T14e：閉じると消える線の本数。
const link = (id: string, from: string, to: string): GraphLink => ({ id, kind: "supervise", from, to, limit: 0 }) as unknown as GraphLink;
const session = {
  panes: new Map([["p1", { id: "p1", tabId: "t1" }], ["p2", { id: "p2", tabId: "t1" }], ["p3", { id: "p3", tabId: "t2" }]]),
  tabs: new Map([["t1", { id: "t1" }], ["t2", { id: "t2" }]]),
  workspaces: new Map([["w1", { tabIds: ["t1"] }], ["w2", { tabIds: ["t2"] }]]),
};

describe("closeLinks", () => {
  it("pane・tab・workspace に含まれる pane の id", () => {
    expect([...paneIdsOfTargets([{ type: "pane", id: "p9" }], session)]).toEqual(["p9"]);
    expect([...paneIdsOfTargets([{ type: "tab", id: "t1" }], session)].sort()).toEqual(["p1", "p2"]);
    expect([...paneIdsOfTargets([{ type: "workspace", id: "w2" }], session)]).toEqual(["p3"]);
  });
  it("線は、どちらかの端が閉じる pane なら 1 本と数える（両端とも閉じる線は 1 本）。別のマシンの鍵は数えない", () => {
    const links = [link("a", "local:p1", "local:p3"), link("b", "local:p1", "local:p2"), link("c", "local:p3", "m2:p1")];
    expect(linksTouching(links, ["p1"])).toBe(2);
    expect(linksTouching(links, ["p1", "p2"])).toBe(2);
    expect(linksTouching(links, ["p9"])).toBe(0);
  });
});
