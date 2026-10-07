import type { DisplayInfo } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useDisplayStore } from "./display.js";

const info = (id: string, over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id,
  paneId: "p1",
  name: id,
  kind: "panel",
  format: "text",
  title: id,
  size: 320,
  rev: 1,
  bytes: 1,
  updatedAt: "x",
  ...over,
});

describe("useDisplayStore", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("panelsOf・bandsOf は最初に出た順（更新で順が変わらない）", () => {
    const s = useDisplayStore();
    s.upsert(info("a"));
    s.upsert(info("b"));
    s.upsert(info("c", { kind: "band" }));
    s.upsert(info("d", { paneId: "p2" }));
    s.upsert(info("a", { rev: 2 }));
    expect(s.panelsOf("p1").map((d) => d.id)).toEqual(["a", "b"]);
    expect(s.bandsOf("p1").map((d) => d.id)).toEqual(["c"]);
    expect(s.hasAny("p2")).toBe(true);
    expect(s.hasAny("p3")).toBe(false);
  });

  it("activePanelOf: 選んだものが無ければ最初。消えたら選択も捨てる", () => {
    const s = useDisplayStore();
    s.upsert(info("a"));
    s.upsert(info("b"));
    expect(s.activePanelOf("p1")?.id).toBe("a");
    s.setActivePanel("p1", "b");
    expect(s.activePanelOf("p1")?.id).toBe("b");
    s.remove("b");
    expect(s.activePanel.size).toBe(0);
    expect(s.activePanelOf("p1")?.id).toBe("a");
  });

  it("消えた面の中身・フォーカス・たたみの印を捨てる", () => {
    const s = useDisplayStore();
    s.upsert(info("a"));
    s.setContent({ id: "a", rev: 1, format: "text", content: "x" });
    s.setFocused("a");
    s.setCollapsed("p1", true);
    s.remove("a");
    expect(s.contents.size).toBe(0);
    expect(s.focusedDisplayId).toBeNull();
    expect(s.collapsed.size).toBe(0);
  });

  it("replaceAll は丸ごと置き換え、clear は空にする", () => {
    const s = useDisplayStore();
    s.upsert(info("a"));
    s.replaceAll([info("b")]);
    expect([...s.infos.keys()]).toEqual(["b"]);
    s.clear();
    expect(s.all).toEqual([]);
  });
});
