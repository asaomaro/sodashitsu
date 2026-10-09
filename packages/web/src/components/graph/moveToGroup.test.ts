import { describe, expect, it, vi } from "vitest";
import { moveToGroup } from "./moveToGroup.js";

describe("moveToGroup（20261008-graph-first PR3）", () => {
  it("入れられたときは、トーストを出さない", async () => {
    const request = vi.fn(async () => ({}));
    const toast = vi.fn();
    await moveToGroup(request, toast, "g1", "w1");
    expect(request).toHaveBeenCalledWith("group.add_member", { groupId: "g1", workspaceId: "w1" });
    expect(toast).not.toHaveBeenCalled();
  });
  it("グループが消えていて失敗したときは、トーストを 1 つだけ出す", async () => {
    const request = vi.fn(async () => {
      throw new Error("not_found");
    });
    const toast = vi.fn();
    await moveToGroup(request, toast, "gone", "w1");
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0]![0]).toContain("グループへ入れられませんでした");
  });
});
