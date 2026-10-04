import { describe, expect, it } from "vitest";
import type { ItemTarget } from "@sodashitsu/protocol";
import { planDrop } from "./sidebarDrag.js";
import type { SidebarDragInfo } from "../render/chrome/sidebar.js";

const W = (id: string): ItemTarget => ({ kind: "workspace", workspaceId: id });
/** 入れ物（`c`）の中の項目 `ids` の i 番目の行の情報。 */
function info(ids: string[], i: number, c: string | null = "g1"): SidebarDragInfo {
  const n = ids[i + 1];
  return {
    item: W(ids[i]!),
    container: c,
    index: i,
    workspaceIds: [ids[i]!],
    anchorId: ids[i]!,
    next: n === undefined ? null : { item: W(n), anchorId: n },
  };
}
const IDS = ["a", "b", "c"];
const opts = { hasServerLayout: true, sortByName: false };
const beforeOf = (p: ReturnType<typeof planDrop>) => (p.kind === "move" ? p.before : "not-move");

describe("planDrop の before（client-core の dropBefore と同じ決まり）", () => {
  it("上へなら落とした項目の前、下へなら次の前、末尾は null", () => {
    expect(beforeOf(planDrop(info(IDS, 2), info(IDS, 0), opts))).toEqual(W("a"));
    expect(beforeOf(planDrop(info(IDS, 0), info(IDS, 1), opts))).toEqual(W("c"));
    expect(beforeOf(planDrop(info(IDS, 0), info(IDS, 2), opts))).toBeNull();
  });
  it("自分自身の上は何もしない", () => {
    expect(planDrop(info(IDS, 1), info(IDS, 1), opts)).toEqual({ kind: "none" });
  });
  it("古いサーバの落とし先は、今までどおり（落とし先が次の項目なら、その先頭の workspace）", () => {
    const p = planDrop(info(IDS, 0), info(IDS, 1), { ...opts, hasServerLayout: false });
    expect(p.kind === "move" && p.legacy.beforeWorkspaceId).toBe("c");
  });
});
