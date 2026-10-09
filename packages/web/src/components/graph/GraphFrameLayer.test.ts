import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { DisplayFrame, FrameInfo } from "@sodashitsu/client-core";
import GraphFrameLayer from "./GraphFrameLayer.vue";
import GraphSpaceBar from "./GraphSpaceBar.vue";

// 20261008-graph-first の PR1c T11b・T11c・T11d：空間の見出しの並びと、囲いの層。
const frame = (id: string, kind: DisplayFrame["kind"], placeholder = false): DisplayFrame => ({
  id,
  kind,
  parentId: null,
  rect: { x: 0, y: 0, w: 400, h: 200 },
  placeholder,
});
const info = (id: string, extra: Partial<FrameInfo> = {}): FrameInfo => ({
  id,
  kind: "workspace",
  parentId: null,
  spaceId: "u",
  title: id,
  folder: "dir",
  branch: "main",
  tabs: [],
  worktreeCount: null,
  memberIds: [id],
  ...extra,
});
const base = {
  selectedWorkspaceId: null,
  flashId: null,
  emphasis: null,
  blockedId: null,
  draggingId: null,
  readOnly: false,
};

describe("GraphSpaceBar", () => {
  it("空間を名前と数で出し、表示中に aria-current。押すと選ぶ", async () => {
    const w = mount(GraphSpaceBar, {
      props: { spaces: [{ id: "g:a", label: "開発", count: 4, workspaceIds: [], nodeKeys: [] }, { id: "u", label: "グループなし", count: 1, workspaceIds: [], nodeKeys: [] }], currentId: "u" },
    });
    const btns = w.findAll("[data-space-id]");
    expect(btns.map((b) => b.text())).toEqual(["開発4", "グループなし1"]);
    expect(btns.map((b) => b.attributes("aria-current"))).toEqual([undefined, "true"]);
    await btns[0]!.trigger("click");
    expect(w.emitted("select")).toEqual([["g:a"]]);
  });
});

describe("GraphFrameLayer", () => {
  it("workspace の囲い: 名前・フォルダとブランチ・tab のタグ（選ばれている tab を示す）。タグを押すと伝わる", async () => {
    const infos = new Map([["w1", info("w1", { title: "alpha", tabs: [{ id: "t1", label: "one", active: false }, { id: "t2", label: "two", active: true }] })]]);
    const w = mount(GraphFrameLayer, { props: { ...base, frames: [frame("w1", "workspace")], infos } });
    expect(w.find(".graph-frame-title").text()).toBe("alpha");
    expect(w.find(".graph-frame-sub").text()).toBe("dir · main");
    const tags = w.findAll("[data-tab-tag]");
    expect(tags.map((t) => t.text())).toEqual(["one", "two"]);
    expect(w.findAll(".graph-frame-tag-active").map((t) => t.text())).toEqual(["two"]);
    await tags[0]!.trigger("click");
    expect(w.emitted("tag")).toEqual([["w1", "t1"]]);
  });

  it("強調した tab のタグは aria-pressed。worktree グループは「worktree グループ・N worktree」", () => {
    const infos = new Map([
      ["w1", info("w1", { tabs: [{ id: "t1", label: "one", active: true }] })],
      ["r:x", info("r:x", { kind: "worktree", title: "repo", folder: null, branch: null, worktreeCount: 3 })],
    ]);
    const w = mount(GraphFrameLayer, { props: { ...base, emphasis: { workspaceId: "w1", tabId: "t1" }, frames: [frame("r:x", "worktree"), frame("w1", "workspace")], infos } });
    expect(w.find("[data-tab-tag]").attributes("aria-pressed")).toBe("true");
    expect(w.find('[data-frame-id="r:x"] .graph-frame-sub').text()).toBe("worktree グループ・3 worktree");
  });

  it("選んでいる workspace・強く出す囲い・落とせない囲い・仮の囲いに印のクラス", () => {
    const infos = new Map([["w1", info("w1")], ["w2", info("w2")], ["w3", info("w3")]]);
    const w = mount(GraphFrameLayer, {
      props: { ...base, selectedWorkspaceId: "w1", flashId: "w2", blockedId: "w3", frames: [frame("w1", "workspace"), frame("w2", "workspace"), frame("w3", "workspace", true)], infos },
    });
    expect(w.get('[data-frame-id="w1"]').classes()).toContain("graph-frame-selected");
    expect(w.get('[data-frame-id="w2"]').classes()).toContain("graph-frame-flash");
    expect(w.get('[data-frame-id="w3"]').classes()).toEqual(expect.arrayContaining(["graph-frame-blocked", "graph-frame-placeholder"]));
  });

  it("見出しのつかみ: 仮の囲い・読み取りだけでは伝えない。tab が 8 つを超えたら +N", async () => {
    const tabs = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, label: `tab${i}`, active: i === 0 }));
    const infos = new Map([["w1", info("w1", { tabs })], ["w2", info("w2")]]);
    const w = mount(GraphFrameLayer, { props: { ...base, frames: [frame("w1", "workspace"), frame("w2", "workspace", true)], infos } });
    expect(w.findAll("[data-tab-tag]")).toHaveLength(8);
    expect(w.find(".graph-frame-more").text()).toBe("+2");
    await w.get('[data-frame-id="w2"] .graph-frame-head').trigger("pointerdown");
    expect(w.emitted("headingPointerdown")).toBeUndefined(); // 仮の囲いはつかめない
    await w.get('[data-frame-id="w1"] .graph-frame-head').trigger("pointerdown");
    expect(w.emitted("headingPointerdown")).toHaveLength(1);
    const ro = mount(GraphFrameLayer, { props: { ...base, readOnly: true, frames: [frame("w1", "workspace")], infos } });
    await ro.get(".graph-frame-head").trigger("pointerdown");
    expect(ro.emitted("headingPointerdown")).toBeUndefined();
    expect(ro.findAll("button")).toHaveLength(0); // 読み取りだけでは、タグも押せる部品にならない
  });
});
