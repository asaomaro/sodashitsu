import type { DisplayInfo } from "@sodashitsu/protocol";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { loadPanelWidths, PANEL_WIDTHS_MAX, useDisplayStore } from "./display.js";
import { PREFS_KEY } from "./view.js";

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
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

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

  it("消えた面の中身・選択・たたみの印を捨てる（フォーカスの印は、その枠の部品が外れるときに自分で下ろす）", () => {
    const s = useDisplayStore();
    s.upsert(info("a"));
    s.setContent({ id: "a", rev: 1, format: "text", content: "x" });
    s.setFocused("a");
    s.setCollapsed("p1", true);
    s.remove("a");
    expect(s.contents.size).toBe(0);
    expect(s.focusedDisplayId).toBe("a");
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

describe("パネルの幅（利用者が変えた幅。この画面が覚える）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  const saved = (): Record<string, number> => (JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { displayPanelWidths?: Record<string, number> }).displayPanelWidths ?? {};

  it("確定で 1 回保存し、次の store が読み込む。消すと保存からも消える", () => {
    const s = useDisplayStore();
    s.setPanelWidth("p1", 400);
    expect(saved()).toEqual({ p1: 400 });
    setActivePinia(createPinia());
    expect(useDisplayStore().panelWidths.get("p1")).toBe(400);
    useDisplayStore().clearPanelWidth("p1");
    expect(saved()).toEqual({});
  });
  it("64 件まで。超えたら古い順に捨てる", () => {
    const s = useDisplayStore();
    for (let i = 0; i < PANEL_WIDTHS_MAX + 3; i++) s.setPanelWidth(`p${i}`, 200);
    expect(s.panelWidths.size).toBe(PANEL_WIDTHS_MAX);
    expect(s.panelWidths.has("p0")).toBe(false);
    expect(s.panelWidths.has(`p${PANEL_WIDTHS_MAX + 2}`)).toBe(true);
  });
  it("もう無い pane の分を捨てる。壊れた値（数でない・範囲の外・配列）は読み込みで捨てる", () => {
    const s = useDisplayStore();
    s.setPanelWidth("p1", 300);
    s.setPanelWidth("p2", 300);
    s.pruneWidths(new Set(["p2"]));
    expect([...s.panelWidths.keys()]).toEqual(["p2"]);
    expect([...loadPanelWidths({ a: 200, b: "x", c: 5, d: 99999, e: NaN, f: null }).keys()]).toEqual(["a"]);
    expect(loadPanelWidths([1, 2]).size).toBe(0);
    expect(loadPanelWidths("x").size).toBe(0);
  });
});
