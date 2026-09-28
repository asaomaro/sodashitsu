import { describe, expect, it } from "vitest";
import { isLocalNodeKey, nodeKey, parseNodeKey } from "./nodeKey.js";

// 20260927-agent-graph の T2（nodeKey）。
describe("nodeKey", () => {
  const machine = "0123456789abcdef".repeat(2);

  it("組み立てと分解が往復する", () => {
    expect(nodeKey("local", "p3")).toBe("local:p3");
    expect(parseNodeKey(nodeKey(machine, "p7"))).toEqual({ machine, paneId: "p7" });
  });

  it("形が違えば null", () => {
    expect(parseNodeKey("p3")).toBeNull();
    expect(parseNodeKey("local:")).toBeNull();
    expect(parseNodeKey("box:p3")).toBeNull();
  });

  it("手元かどうか", () => {
    expect(isLocalNodeKey("local:p1")).toBe(true);
    expect(isLocalNodeKey(`${machine}:p1`)).toBe(false);
    expect(isLocalNodeKey("junk")).toBe(false);
  });
});
