import { describe, expect, it } from "vitest";
import { BANDS_MORE_ROW_PX, panelWidth, visibleBands } from "./displayLayout.js";
import { PANEL_TB_MIN_W_PX, DOCK_H_MIN_PX, BAND_MIN_W_PX, BAND_SCRIPT_MIN_W_PX, TRAY_ROW_PX, resolvePaneDisplays, type LayoutInput } from "./paneDisplayLayout.js";

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

describe("resolvePaneDisplays — 4 つの側", () => {
  // paneW 1000・paneH 600・セル 9×18: 横の avail = 1000 − 360 = 640、max = 500。縦の avail = 600 − 180 = 420、max = 300。
  const side = (id: string, seq: number, dock: "right" | "left" | "top" | "bottom", over: Partial<LayoutInput["panels"][number]> = {}) => panel(id, seq, { dock, ...over });
  it("片方だけ: 左・上・下の 1 つだけでも、右のときと同じ決まり（望む大きさ・範囲の丸め）。端末の領域がずれる", () => {
    const l = resolvePaneDisplays(input({ panels: [side("a", 1, "left", { size: 300 })] }));
    expect(l.docks.left).toMatchObject({ ids: ["a"], size: 300, min: 160, max: 500 });
    expect(l.terminal).toEqual({ x: 300, y: 0, w: 700, h: 600 });
    const t = resolvePaneDisplays(input({ panels: [side("a", 1, "top", { size: 200 })] }));
    expect(t.docks.top).toMatchObject({ size: 200, min: DOCK_H_MIN_PX, max: 300 });
    expect(t.terminal).toEqual({ x: 0, y: 200, w: 1000, h: 400 });
    const b = resolvePaneDisplays(input({ panels: [side("a", 1, "bottom", { size: 1000 })] }));
    expect(b.docks.bottom!.size).toBe(300); // 最大に丸める
    expect(b.terminal).toEqual({ x: 0, y: 0, w: 1000, h: 300 });
    const small = resolvePaneDisplays(input({ panels: [side("a", 1, "top", { size: 10 })] }));
    expect(small.docks.top!.size).toBe(DOCK_H_MIN_PX);
  });
  it("4 つの側が同時: 上下は pane の幅いっぱい・左右はその間の高さ。端末の領域は残り", () => {
    const r = resolvePaneDisplays(
      input({ panels: [side("t", 1, "top", { size: 100 }), side("b", 2, "bottom", { size: 120 }), side("l", 3, "left", { size: 200 }), side("r", 4, "right", { size: 250 })] }),
    );
    expect(r.docks.top!.size).toBe(100);
    expect(r.docks.bottom!.size).toBe(120);
    expect(r.docks.left!.size).toBe(200);
    expect(r.docks.right!.size).toBe(250);
    expect(r.terminal).toEqual({ x: 200, y: 100, w: 550, h: 380 });
    expect(r.auto).toEqual([]);
  });
  it("利用者の大きさ（sideSizes）が選んでいる面の size に勝つ。側ごと", () => {
    const r = resolvePaneDisplays(input({ panels: [side("l", 1, "left", { size: 200 }), side("t", 2, "top", { size: 100 })], sideSizes: { left: 400, top: 150 } }));
    expect(r.docks.left!.size).toBe(400);
    expect(r.docks.top!.size).toBe(150);
  });
  it("同じ側の 2 枚は 1 つの群れ（タブ）。選んでいる面の size を使い、active が群れに無ければ最初の面", () => {
    const ps = [side("a", 1, "left", { size: 200 }), side("b", 2, "left", { size: 300 })];
    const r = resolvePaneDisplays(input({ panels: ps, active: { left: "b" } }));
    expect(r.docks.left).toMatchObject({ ids: ["a", "b"], activeId: "b", size: 300 });
    expect(resolvePaneDisplays(input({ panels: ps, active: { left: "zz" } })).docks.left).toMatchObject({ activeId: "a", size: 200 });
  });
  it("端末は 40 列・10 行を下回らない: 横はちょうど 40 列、縦はちょうど 10 行", () => {
    const r = resolvePaneDisplays(input({ panels: [side("l", 1, "left", { size: 500 }), side("r", 2, "right", { size: 500 })] }));
    // avail = 640。500 + 500 = 1000 > 640 → 大きいほう（同じなら左）を max(160, 640−500=140→160) へ。160 + 500 = 660 > 640 → 右を 640 − 160 = 480 へ
    expect(r.docks.left!.size).toBe(160);
    expect(r.docks.right!.size).toBe(480);
    expect(r.terminal.w).toBe(1000 - 640);
    expect(r.terminal.w / 9).toBe(40);
    const v = resolvePaneDisplays(input({ panels: [side("t", 1, "top", { size: 300 }), side("b", 2, "bottom", { size: 300 })] }));
    // avail = 420。300 + 300 > 420 → 上を max(96, 420−300=120)=120。120 + 300 = 420 ちょうど
    expect(v.docks.top!.size).toBe(120);
    expect(v.docks.bottom!.size).toBe(300);
    expect(v.terminal.h).toBe(600 - 420);
    expect(v.terminal.h / 18).toBe(10);
  });
  it("縮め方の段: 大きいほうが下なら、下を先に縮める。最小どうしでも入らなければ、上（左）が先に自動でたたまれる", () => {
    const r = resolvePaneDisplays(input({ panels: [side("t", 1, "top", { size: 100 }), side("b", 2, "bottom", { size: 300 })] }));
    expect(r.docks.top!.size).toBe(100);
    expect(r.docks.bottom!.size).toBe(300); // 400 <= 420: 縮めない
    const r2 = resolvePaneDisplays(input({ panels: [side("t", 1, "top", { size: 200 }), side("b", 2, "bottom", { size: 300 })] }));
    expect(r2.docks.bottom!.size).toBe(220); // 大きい下を 420−200 へ
    expect(r2.docks.top!.size).toBe(200);
    // paneH 300: H = 300、avail = 120、max = min(150, 120) = 120。最小 96 を 2 つで 192 > 120 → 上が自動でたたまれ、下だけ
    const tight = resolvePaneDisplays(input({ paneH: 300, panels: [side("t", 1, "top", { size: 100 }), side("b", 2, "bottom", { size: 100 })] }));
    expect(tight.auto).toEqual(["t"]);
    expect(tight.docks.top).toBeNull();
    expect(tight.docks.bottom!.size).toBe(96); // 上がボタンになって専用の行（24px）が出るので、空きは 96 に減ってやり直す
    expect(tight.tray.row).toBe("own");
    expect(tight.tray.buttons).toEqual([{ id: "t", kind: "panel", open: false, disabled: true }]);
    // 横: paneW 600 → avail 240、max 240。左右 160 + 160 = 320 > 240 → 左が自動でたたまれる
    const wide = resolvePaneDisplays(input({ paneW: 600, panels: [side("l", 1, "left", { size: 160 }), side("r", 2, "right", { size: 160 })] }));
    expect(wide.auto).toEqual(["l"]);
    expect(wide.docks.right!.size).toBe(160);
    expect(wide.terminal).toMatchObject({ x: 0, w: 440 });
  });
  it("入らない側は全部自動でたたむ。pane が端末の最小より小さければ、パネルは全部たたまれ、端末は残り全部", () => {
    const r = resolvePaneDisplays(input({ paneW: 300, paneH: 150, panels: [side("l", 1, "left"), side("r", 2, "right"), side("t", 3, "top"), side("b", 4, "bottom")] }));
    expect(r.auto.sort()).toEqual(["b", "l", "r", "t"]);
    expect(r.terminal).toMatchObject({ x: 0, w: 300 });
    expect(r.docks).toEqual({ right: null, left: null, top: null, bottom: null });
  });
  it("帯・トレイの行の分は、縦の空きから引く（上の帯 100px があると上のパネルの上限が下がる）", () => {
    const r = resolvePaneDisplays(input({ bands: [band("bd", 1, { size: 100 })], panels: [side("t", 1, "top", { size: 400 })] }));
    // H = 500、avail = 320、max = 250
    expect(r.docks.top).toMatchObject({ size: 250, max: 250 });
    expect(r.terminal.y).toBe(350);
    expect(r.terminal.h).toBe(250);
  });
  it("専用のトレイの行（24px）は、縦の空きから引く。自動でたたんだ面だけで行が出るときは、引き直す", () => {
    // 利用者がたたんだ面（トレイのボタン）がある: 24px 引く。H = 576、avail = 396、max = 288
    const withBtn = resolvePaneDisplays(input({ panels: [side("t", 1, "top", { size: 1000 }), side("c", 2, "right", { collapsed: true })] }));
    expect(withBtn.tray.row).toBe("own");
    expect(withBtn.docks.top!.max).toBe(288);
    expect(withBtn.terminal.y).toBe(TRAY_ROW_PX + 288);
    // 自動でたたんだ面だけ: 左が入らず自動でたたまれ、行が none → own に変わる → 24px を引いて 1 回だけやり直す
    const autoOnly = resolvePaneDisplays(input({ paneW: 600, panels: [side("l", 1, "left", { size: 160 }), side("r", 2, "right", { size: 160 }), side("t", 3, "top", { size: 1000 })] }));
    expect(autoOnly.auto).toEqual(["l"]);
    expect(autoOnly.tray.row).toBe("own");
    expect(autoOnly.docks.top!.max).toBe(288);
  });
  it("置き場所が float の面は、PR-B ではトレイのボタン（窓は PR-C）。側の群れに入らない", () => {
    const r = resolvePaneDisplays(input({ panels: [side("f", 1, "right"), { ...panel("w", 2), dock: "float" }] }));
    expect(r.docks.right!.ids).toEqual(["f"]);
    expect(r.tray.buttons.map((b) => b.id)).toEqual(["w"]);
  });
  it("細い pane（PANEL_TB_MIN_W_PX 未満）では、上・下のパネルは自動でたたむ（見出しの固定の部品が最小の高さに収まらない）。左右には効かない", () => {
    const ok = resolvePaneDisplays(input({ paneW: PANEL_TB_MIN_W_PX, panels: [side("t", 1, "top"), side("b", 2, "bottom")] }));
    expect(ok.auto).toEqual([]);
    expect(ok.docks.top).not.toBeNull();
    const narrow = resolvePaneDisplays(input({ paneW: PANEL_TB_MIN_W_PX - 1, panels: [side("t", 1, "top"), side("b", 2, "bottom"), side("r", 3, "right")] }));
    expect(narrow.auto.sort()).toEqual(["b", "r", "t"]); // 右も、この幅では端末の 40 列が入らず自動でたたまれる
    expect(narrow.docks.top).toBeNull();
    expect(narrow.docks.bottom).toBeNull();
    expect(narrow.tray.buttons.filter((b) => b.disabled).map((b) => b.id).sort()).toEqual(["b", "r", "t"]);
  });
});
