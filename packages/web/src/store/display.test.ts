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

  it("消えた面の中身・選択を捨てる（フォーカスの印は、その枠の部品が外れるときに自分で下ろす）", () => {
    const s = useDisplayStore();
    s.upsert(info("a"));
    s.setContent({ id: "a", rev: 1, format: "text", content: "x" });
    s.setActivePanel("p1", "a");
    s.setFocused("a");
    s.remove("a");
    expect(s.contents.size).toBe(0);
    expect(s.activePanel.size).toBe(0);
    expect(s.focusedDisplayId).toBe("a");
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

describe("今までのパネルの幅（displayPanelWidths。読むだけ）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  it("壊れた値（数でない・範囲の外・配列）は読み込みで捨てる。最大件数で止まる", () => {
    expect([...loadPanelWidths({ a: 200, b: "x", c: 5, d: 99999, e: NaN, f: null }).keys()]).toEqual(["a"]);
    expect(loadPanelWidths([1, 2]).size).toBe(0);
    expect(loadPanelWidths("x").size).toBe(0);
    const many: Record<string, number> = {};
    for (let i = 0; i < PANEL_WIDTHS_MAX + 3; i++) many[`p${i}`] = 200;
    expect(loadPanelWidths(many).size).toBe(PANEL_WIDTHS_MAX);
  });
  it("書かない・消さない: 側の大きさの操作は displayPanelWidths を変えない。右の側は、引き継いで読む", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ displayPanelWidths: { p1: 333 } }));
    setActivePinia(createPinia());
    const s = useDisplayStore();
    expect(s.sideSizeOf("p1", "right")).toBe(333);
    s.setSideSize("p1", "right", 420);
    s.clearSideSize("p1", "right");
    expect((JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { displayPanelWidths?: unknown }).displayPanelWidths).toEqual({ p1: 333 });
  });
});

describe("面の記憶（置き場所・たたみ。20261008-display-layout）", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  const stored = (): { faces: Record<string, unknown>; names: Record<string, unknown>; sides: Record<string, number> } =>
    (JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as { displayLayout?: never }).displayLayout ?? { faces: {}, names: {}, sides: {} };

  it("たたむ → 全項目を書く（置き場所は指定のまま）→ 次の store が読み込む。開く → 最後に操作した面", () => {
    const s = useDisplayStore();
    const a = info("a", { dock: "bottom" });
    s.upsert(a);
    expect(s.effectiveOf(a)).toEqual({ dock: "bottom", edge: null, collapsed: false });
    s.setFaceCollapsed(a, true);
    expect(stored().faces).toEqual({ "p1|panel|a": { dock: "bottom", collapsed: true } });
    expect(s.effectiveOf(a).collapsed).toBe(true);
    setActivePinia(createPinia());
    expect(useDisplayStore().effectiveOf(a).collapsed).toBe(true);
    const s2 = useDisplayStore();
    s2.setFaceCollapsed(a, false);
    expect(s2.effectiveOf(a).collapsed).toBe(false);
    expect(s2.lastFace.get("p1")).toBe("a");
  });
  it("設定の「初めの状態: たたむ」は記憶の無い面だけに効く。開いた面は開いたまま", async () => {
    const { useSettingsStore } = await import("./settings.js");
    const s = useDisplayStore();
    const a = info("a");
    const b = info("b");
    s.setFaceCollapsed(a, false);
    useSettingsStore().setDisplayPanelInitial("collapsed");
    expect(s.effectiveOf(a).collapsed).toBe(false);
    expect(s.effectiveOf(b).collapsed).toBe(true);
  });
  it("帯を移すと collapsed:false と names を書く。移しただけの面は、後から collapsed の指定でたたまれない", () => {
    const s = useDisplayStore();
    const b = info("bar", { kind: "band", collapsed: true });
    expect(s.effectiveOf(b)).toEqual({ dock: null, edge: "top", collapsed: true });
    s.setFaceEdge(b, "bottom");
    expect(stored().faces).toEqual({ "p1|band|bar": { edge: "bottom", collapsed: false } });
    expect(stored().names).toEqual({ "band|bar": { edge: "bottom" } });
    expect(s.effectiveOf({ ...b, collapsed: true })).toEqual({ dock: null, edge: "bottom", collapsed: false });
  });
  it("置き場所の変更は names に書き、同じ名前の別の pane の面が引き継ぐ。resetFace で戻る", () => {
    const s = useDisplayStore();
    const a = info("a");
    const other = info("a2", { paneId: "p2", name: "a" });
    s.setFaceDock(a, "right");
    expect(stored().names).toEqual({ "panel|a": { dock: "right" } });
    expect(s.hasPref(a)).toBe(true);
    expect(s.hasPref(other)).toBe(true);
    s.resetFace(a);
    expect(stored().faces).toEqual({});
    expect(stored().names).toEqual({});
    expect(s.hasPref(a)).toBe(false);
  });
  it("側の大きさ: 範囲に丸めて覚え、消せる。右は displayPanelWidths を引き継いで読む", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ displayPanelWidths: { p1: 333 } }));
    setActivePinia(createPinia());
    const s = useDisplayStore();
    expect(s.sideSizeOf("p1", "right")).toBe(333);
    s.setSideSize("p1", "right", 420);
    expect(s.sideSizeOf("p1", "right")).toBe(420);
    expect(stored().sides).toEqual({ "p1|right": 420 });
    s.setSideSize("p1", "top", 5);
    expect(stored().sides["p1|top"]).toBe(96);
    s.clearSideSize("p1", "right");
    expect(s.sideSizeOf("p1", "right")).toBe(333);
  });
  it("pruneLayout はもう無い pane の faces・sides を捨てる。消えた面の activeBySide・lastFace も捨てる", () => {
    const s = useDisplayStore();
    const a = info("a");
    s.upsert(a);
    s.setFaceCollapsed(a, true);
    s.setSideSize("p1", "right", 300);
    s.setActiveBySide("p1", "right", "a");
    s.pruneLayout(new Set(["p9"]));
    expect(stored().faces).toEqual({});
    expect(stored().sides).toEqual({});
    s.remove("a");
    expect(s.activeBySide.size).toBe(0);
    expect(s.lastFace.size).toBe(0);
  });
  it("面が操作中になったら、その pane の最後に操作した面になる", () => {
    const s = useDisplayStore();
    s.upsert(info("a"));
    s.upsert(info("b"));
    s.setFocused("b");
    expect(s.lastFace.get("p1")).toBe("b");
  });
  it("割り付けの写しを書くと layoutRev が増える。同じ値なら増えない", () => {
    const s = useDisplayStore();
    s.setLayoutSnapshot("p1", { auto: [], floatArea: null });
    s.setLayoutSnapshot("p1", { auto: [], floatArea: null });
    expect(s.layoutRev).toBe(1);
    s.setLayoutSnapshot("p1", { auto: ["a"], floatArea: null });
    expect(s.layoutRev).toBe(2);
    // 帯の上下・トレイの行などの署名（placement）が変わっても増える（知らせが測り直す）
    s.setLayoutSnapshot("p1", { auto: ["a"], floatArea: null, placement: "x" });
    expect(s.layoutRev).toBe(3);
    s.setLayoutSnapshot("p1", { auto: ["a"], floatArea: null, placement: "x" });
    expect(s.layoutRev).toBe(3);
    s.setLayoutSnapshot("p1", null);
    expect(s.layoutByPane.has("p1")).toBe(false);
  });
});
