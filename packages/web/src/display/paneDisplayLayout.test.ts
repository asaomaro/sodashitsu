import { describe, expect, it } from "vitest";
import { BANDS_MORE_ROW_PX, panelWidth, visibleBands } from "./displayLayout.js";
import { BAND_MIN_W_PX, BAND_SCRIPT_MIN_W_PX, TRAY_ROW_PX, resolvePaneDisplays, type LayoutInput } from "./paneDisplayLayout.js";

const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  paneW: 1000,
  paneH: 600,
  cellW: 9,
  cellH: 18,
  bands: [],
  panels: [],
  active: {},
  sideSizes: {},
  floatRects: {},
  trayEdgeDefault: "top",
  ...over,
});
const band = (id: string, seq: number, over: Partial<LayoutInput["bands"][number]> = {}): LayoutInput["bands"][number] => ({ id, seq, size: 32, edge: "top", collapsed: false, ...over });
const panel = (id: string, seq: number, over: Partial<LayoutInput["panels"][number]> = {}): LayoutInput["panels"][number] => ({ id, seq, size: 320, dock: "right", collapsed: false, ...over });

describe("resolvePaneDisplays — 面が無い・右だけ・帯が上だけ（今と同じ大きさ）", () => {
  it("面が無ければ、端末が本体の全部・トレイの行は none", () => {
    const r = resolvePaneDisplays(input());
    expect(r.terminal).toEqual({ x: 0, y: 0, w: 1000, h: 600 });
    expect(r.tray).toEqual({ edge: "top", row: "none", hostBandId: null, buttons: [] });
    expect(r.docks).toEqual({ right: null, left: null, top: null, bottom: null });
    expect(r.floats).toEqual([]);
    expect(r.auto).toEqual([]);
  });
  it("右のパネルの幅は、今の panelWidth と同じ値（指定・利用者の幅・範囲の丸め）", () => {
    for (const [size, user] of [[320, undefined], [320, 500], [800, undefined], [160, 100], [400, 99999]] as const) {
      const r = resolvePaneDisplays(input({ panels: [panel("a", 1, { size })], sideSizes: user === undefined ? {} : { right: user } }));
      const want = panelWidth(1000, size, 9, user);
      expect(r.docks.right).toMatchObject({ ids: ["a"], activeId: "a", size: want.width, min: 160, max: 500 });
      expect(r.terminal.w).toBe(1000 - want.width);
    }
  });
  it("上の帯は、今の visibleBands と同じ本数で、高さの分だけ端末が下がる。収まらない分は more と「ほか N 件」の 1 行", () => {
    const bands = [band("a", 1, { size: 96 }), band("b", 2, { size: 96 }), band("c", 3, { size: 96 })];
    const split = visibleBands([96, 96, 96], 600);
    const r = resolvePaneDisplays(input({ bands }));
    expect(r.bands.top).toEqual(["a", "b", "c"].slice(0, split.shown));
    expect(r.bands.more).toEqual(["a", "b", "c"].slice(split.shown));
    expect(split.shown).toBe(2);
    expect(r.terminal.y).toBe(192 + BANDS_MORE_ROW_PX);
    expect(r.terminal.h).toBe(600 - 192 - BANDS_MORE_ROW_PX);
    expect(r.tray.row).toBe("band");
    expect(r.tray.hostBandId).toBe("a");
  });
  it("帯の合計は pane の高さの 3 分の 1 まで（上と下を合わせて数える）", () => {
    const r = resolvePaneDisplays(input({ paneH: 300, bands: [band("a", 1, { size: 60 }), band("b", 2, { size: 50, edge: "bottom" }), band("c", 3, { size: 30 })] }));
    expect(r.bands).toEqual({ top: ["a"], bottom: [], more: ["b", "c"] });
    const both = resolvePaneDisplays(input({ paneH: 300, bands: [band("a", 1, { size: 60 }), band("b", 2, { size: 40, edge: "bottom" })] }));
    expect(both.bands).toEqual({ top: ["a"], bottom: ["b"], more: [] });
  });
  it("パネルと帯の両方が出ると、端末は両方を除いた箱", () => {
    const r = resolvePaneDisplays(input({ bands: [band("b", 1, { size: 32 })], panels: [panel("a", 2)] }));
    expect(r.terminal).toEqual({ x: 0, y: 32, w: 680, h: 568 });
  });
});

describe("resolvePaneDisplays — 帯の上下・トレイ", () => {
  it("下の帯は端末の下。トレイの側は出す帯の最初の 1 本の側", () => {
    const r = resolvePaneDisplays(input({ bands: [band("a", 1, { edge: "bottom", size: 40 }), band("b", 2, { size: 32 })] }));
    expect(r.bands).toMatchObject({ top: ["b"], bottom: ["a"] });
    expect(r.tray.edge).toBe("bottom");
    expect(r.tray.hostBandId).toBe("a");
    expect(r.terminal).toMatchObject({ y: 32, h: 600 - 32 - 40 });
  });
  it("帯が無ければ設定の側。ボタンがあれば専用の行 own（24px）、無ければ none", () => {
    const withBtn = resolvePaneDisplays(input({ trayEdgeDefault: "bottom", panels: [panel("a", 1, { collapsed: true })] }));
    expect(withBtn.tray).toMatchObject({ edge: "bottom", row: "own", hostBandId: null });
    expect(withBtn.terminal).toEqual({ x: 0, y: 0, w: 1000, h: 600 - TRAY_ROW_PX });
    const none = resolvePaneDisplays(input({ trayEdgeDefault: "bottom", panels: [panel("a", 1)] }));
    expect(none.tray.row).toBe("none");
    expect(none.terminal.h).toBe(600);
  });
  it("たたんだパネル・たたんだ帯のボタンが seq の順（種類をまたぐ）。たたんだパネルは幅を使わない", () => {
    const r = resolvePaneDisplays(input({ bands: [band("b1", 2, { collapsed: true }), band("b2", 4)], panels: [panel("p1", 1, { collapsed: true }), panel("p2", 3, { collapsed: true })] }));
    expect(r.tray.buttons).toEqual([
      { id: "p1", kind: "panel", open: false, disabled: false },
      { id: "b1", kind: "band", open: false, disabled: false },
      { id: "p2", kind: "panel", open: false, disabled: false },
    ]);
    expect(r.docks.right).toBeNull();
    expect(r.terminal.w).toBe(1000);
    expect(r.tray.row).toBe("band");
    expect(r.bands.top).toEqual(["b2"]);
  });
  it("たたんだ帯だけなら、その行は消え、端末の箱が高くなる。ボタンの own 行へ", () => {
    const open = resolvePaneDisplays(input({ bands: [band("a", 1, { size: 96 })] }));
    const folded = resolvePaneDisplays(input({ bands: [band("a", 1, { size: 96, collapsed: true })] }));
    expect(open.terminal.h).toBe(504);
    expect(folded.terminal.h).toBe(600 - TRAY_ROW_PX);
    expect(folded.tray).toMatchObject({ row: "own", buttons: [{ id: "a", kind: "band" }] });
  });
  it("帯が下だけ、設定が上: トレイは下の帯の行（出す帯の側が優先）", () => {
    const r = resolvePaneDisplays(input({ trayEdgeDefault: "top", bands: [band("a", 1, { edge: "bottom" }), band("b", 2, { edge: "bottom", collapsed: true })] }));
    expect(r.tray).toMatchObject({ edge: "bottom", row: "band", hostBandId: "a" });
  });
  it("「ほか N 件」の行は、帯もトレイの行も出ない側でなく、トレイの側に出る（高さを引く）", () => {
    const r = resolvePaneDisplays(input({ paneH: 90, bands: [band("a", 1, { size: 40 })] })); // 90/3=30 < 40 → 全部が more
    expect(r.bands.more).toEqual(["a"]);
    expect(r.bands.top).toEqual([]);
    expect(r.tray.edge).toBe("top");
    expect(r.terminal.y).toBe(BANDS_MORE_ROW_PX);
  });
});

describe("resolvePaneDisplays — 自動でたたむとやり直し", () => {
  it("pane が狭くて右のパネルが出せないと auto に入り、押せないボタンになる。行が none → own に変わり、行の高さを引く", () => {
    const r = resolvePaneDisplays(input({ paneW: 300, panels: [panel("a", 1)] }));
    expect(r.auto).toEqual(["a"]);
    expect(r.docks.right).toBeNull();
    expect(r.tray.buttons).toEqual([{ id: "a", kind: "panel", open: false, disabled: true }]);
    expect(r.tray.row).toBe("own");
    expect(r.terminal).toEqual({ x: 0, y: TRAY_ROW_PX, w: 300, h: 600 - TRAY_ROW_PX }); // トレイの側は設定の「上」
  });
  it("広がれば戻る（記憶ではなく計算だけ）。帯の行があるときは、行の高さは増えない", () => {
    const narrow = resolvePaneDisplays(input({ paneW: 300, bands: [band("b", 1)], panels: [panel("a", 2)] }));
    expect(narrow.auto).toEqual(["a"]);
    expect(narrow.terminal.h).toBe(600 - 32);
    const wide = resolvePaneDisplays(input({ paneW: 1000, bands: [band("b", 1)], panels: [panel("a", 2)] }));
    expect(wide.auto).toEqual([]);
    expect(wide.docks.right?.ids).toEqual(["a"]);
  });
  it("40 列のちょうど: 右の幅の最大は paneW − 40 × cellW。範囲が最小を下回ると自動でたたむ", () => {
    // paneW = 360 + 160 = 520 → max = min(260, 160) = 160 → 出せる（ちょうど）
    expect(resolvePaneDisplays(input({ paneW: 520, panels: [panel("a", 1)] })).docks.right).toMatchObject({ size: 160, min: 160, max: 160 });
    // 519 → max 159 < 160 → 自動でたたむ
    expect(resolvePaneDisplays(input({ paneW: 519, panels: [panel("a", 1)] })).auto).toEqual(["a"]);
  });
});

describe("resolvePaneDisplays — 右の群れ", () => {
  it("複数あれば出た順の群れ。activeId は active.right にあればそれ、無ければ最初。大きさは選んでいる面の size", () => {
    const panels = [panel("b", 2, { size: 400 }), panel("a", 1, { size: 300 }), panel("c", 3, { collapsed: true })];
    const r = resolvePaneDisplays(input({ panels, active: { right: "b" } }));
    expect(r.docks.right).toMatchObject({ ids: ["a", "b"], activeId: "b", size: 400 });
    expect(resolvePaneDisplays(input({ panels, active: { right: "zzz" } })).docks.right).toMatchObject({ activeId: "a", size: 300 });
    expect(resolvePaneDisplays(input({ panels, active: { right: "c" } })).docks.right).toMatchObject({ activeId: "a" }); // たたんだ面は群れに無い
  });
  it("セルの幅が取れない（0）ときは 9px", () => {
    expect(resolvePaneDisplays(input({ cellW: 0, panels: [panel("a", 1)] })).docks.right?.max).toBe(500);
  });
  it("PR-A では、右でない置き場所の面は群れに入らない（効かない指定）", () => {
    const r = resolvePaneDisplays(input({ panels: [panel("a", 1, { dock: "bottom" })] }));
    expect(r.docks.right).toBeNull();
    expect(r.terminal.w).toBe(1000);
  });
});

describe("resolvePaneDisplays — pane が狭くて帯の固定の部品が入らないとき", () => {
  it("スクリプトの帯は BAND_SCRIPT_MIN_W_PX 未満で自動でたたむ（トレイに押せないボタンで残り、帯の高さの代わりにトレイの行）", () => {
    const wide = resolvePaneDisplays(input({ paneW: BAND_SCRIPT_MIN_W_PX, bands: [band("s", 1, { script: true })] }));
    expect(wide.bands.top).toEqual(["s"]);
    expect(wide.auto).toEqual([]);
    const narrow = resolvePaneDisplays(input({ paneW: BAND_SCRIPT_MIN_W_PX - 1, bands: [band("s", 1, { script: true })] }));
    expect(narrow.bands.top).toEqual([]);
    expect(narrow.auto).toEqual(["s"]);
    expect(narrow.tray.buttons).toEqual([{ id: "s", kind: "band", open: false, disabled: true }]);
    expect(narrow.terminal.y).toBe(TRAY_ROW_PX); // 帯の高さではなく、トレイの専用の行の分
  });
  it("スクリプトでない帯は、もっと狭くなるまで出す。利用者がたたんだ帯は自動の扱いにならない（押せる）", () => {
    expect(resolvePaneDisplays(input({ paneW: BAND_MIN_W_PX, bands: [band("p", 1)] })).bands.top).toEqual(["p"]);
    expect(resolvePaneDisplays(input({ paneW: BAND_MIN_W_PX - 1, bands: [band("p", 1)] })).auto).toEqual(["p"]);
    const r = resolvePaneDisplays(input({ paneW: 50, bands: [band("c", 1, { collapsed: true, script: true })] }));
    expect(r.auto).toEqual([]);
    expect(r.tray.buttons).toEqual([{ id: "c", kind: "band", open: false, disabled: false }]);
  });
  it("狭い帯の分は「ほか N 件」の数え方にも入らない", () => {
    const r = resolvePaneDisplays(input({ paneW: 200, bands: [band("s", 1, { script: true }), band("p", 2)] }));
    expect(r.bands).toEqual({ top: ["p"], bottom: [], more: [] });
    expect(r.auto).toEqual(["s"]);
  });
});
