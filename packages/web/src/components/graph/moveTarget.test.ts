import { describe, expect, it } from "vitest";
import type { FrameInfo } from "@sodashitsu/client-core";
import { dropTargetFor, MACHINE_BLOCK, REMOTE_NODE_BLOCK, type DropTargetInput } from "./moveTarget.js";

const ws = (id: string, wk: string, active = `${id}-t1`) => ({ id, cwd: `/${wk}`, git: { repoKey: "/r", worktreeKey: wk } as never, activeTabId: active, tabIds: [`${id}-t1`] });
const info = (id: string, kind: FrameInfo["kind"], parentId: string | null = null): FrameInfo => ({ id, kind, parentId, spaceId: "u", title: `T-${id}`, folder: null, branch: null, tabs: [], worktreeCount: null, memberIds: [id] });
const rect = (x: number, y: number) => ({ x, y, w: 300, h: 200 });

function base(over: Partial<DropTargetInput> = {}): DropTargetInput {
  return {
    node: { local: true, workspaceId: "a", tabId: "a-t1" },
    center: { x: 1000, y: 1000 },
    tag: null,
    frames: [
      { id: "a", rect: rect(0, 0) },
      { id: "b", rect: rect(400, 0) },
      { id: "c", rect: rect(800, 0) },
      { id: "m:x", rect: rect(0, 400) },
      { id: "r:g", rect: { x: 1200, y: 0, w: 700, h: 300 } },
      { id: "d", rect: rect(1250, 40) },
    ],
    infos: new Map([
      ["a", info("a", "workspace")],
      ["b", info("b", "workspace")],
      ["c", info("c", "workspace")],
      ["m:x", info("m:x", "machine")],
      ["r:g", info("r:g", "worktree")],
      ["d", info("d", "workspace", "r:g")],
    ]),
    workspaces: new Map([
      ["a", ws("a", "w1")],
      ["b", ws("b", "w1", "b-t2")], // 同じ worktree
      ["c", ws("c", "w2")], // 別の worktree
      ["d", ws("d", "w3")],
    ]),
    ...over,
  };
}
const at = (x: number, y: number) => ({ center: { x, y } });

describe("dropTargetFor（20261008-graph-first PR4）", () => {
  it("どの囲いの上でもなければ、位置の変更", () => {
    expect(dropTargetFor(base(at(1000, 1000)))).toEqual({ kind: "position" });
  });
  it("自分の workspace の囲いの上は、位置の変更", () => {
    expect(dropTargetFor(base(at(100, 100)))).toEqual({ kind: "position" });
  });
  it("同じ worktree の別の workspace の囲いの上は、移す（選んでいる tab へ）", () => {
    expect(dropTargetFor(base(at(500, 100)))).toMatchObject({ kind: "move", workspaceId: "b", tabId: "b-t2", frameId: "b", viaTag: false });
  });
  it("別の worktree の workspace の囲いの上は、落とせない（理由つき。サーバの文言と同じ）", () => {
    const t = dropTargetFor(base(at(900, 100)));
    expect(t).toMatchObject({ kind: "blocked", frameId: "c" });
    expect((t as { reason: string }).reason).toContain("別の worktree の workspace へは移せません");
  });
  it("別のマシンの囲いの上は、落とせない", () => {
    expect(dropTargetFor(base(at(100, 500)))).toEqual({ kind: "blocked", frameId: "m:x", reason: MACHINE_BLOCK });
  });
  it("別の worktree グループの外側の囲いの上（メンバーの上でない所）は、落とせない。メンバーの上は、その workspace で判定", () => {
    expect(dropTargetFor(base(at(1800, 250)))).toMatchObject({ kind: "blocked", frameId: "r:g" });
    expect(dropTargetFor(base(at(1300, 100)))).toMatchObject({ kind: "blocked", frameId: "d" }); // d は別の worktree
  });
  it("tab のタグの上は、その tab へ移す。同じ workspace の別の tab も移せる。同じ tab のタグは位置の変更", () => {
    expect(dropTargetFor(base({ tag: { workspaceId: "b", tabId: "b-t1" } }))).toMatchObject({ kind: "move", workspaceId: "b", tabId: "b-t1", viaTag: true });
    expect(dropTargetFor(base({ tag: { workspaceId: "a", tabId: "a-t2" } }))).toMatchObject({ kind: "move", workspaceId: "a", tabId: "a-t2" });
    expect(dropTargetFor(base({ tag: { workspaceId: "a", tabId: "a-t1" } }))).toEqual({ kind: "position" });
    expect(dropTargetFor(base({ tag: { workspaceId: "c", tabId: "c-t1" } }))).toMatchObject({ kind: "blocked", frameId: "c" });
  });
  it("別のマシンの pane（手元でない）は、どの workspace の囲いの上でも落とせない", () => {
    const t = dropTargetFor(base({ ...at(500, 100), node: { local: false, workspaceId: "m:x", tabId: null } }));
    expect(t).toEqual({ kind: "blocked", frameId: "b", reason: REMOTE_NODE_BLOCK });
  });
});
