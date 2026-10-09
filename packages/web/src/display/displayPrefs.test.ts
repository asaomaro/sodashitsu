import { DISPLAY_DOCKS, type DisplayInfo } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import {
  DISPLAY_DOCK_CAPS,
  FACE_PREFS_MAX,
  NAME_PREFS_MAX,
  SIDE_PREFS_MAX,
  composeFacePref,
  effectiveCollapsed,
  effectiveDock,
  effectiveEdge,
  effectiveFace,
  emptyLayout,
  faceKey,
  hasFacePref,
  loadDisplayLayout,
  nameKey,
  pruneLayoutPanes,
  putLast,
  storedSideSize,
  type DisplayLayoutPrefs,
  type LayoutSettings,
} from "./displayPrefs.js";

const P = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const info = (over: Partial<DisplayInfo> = {}): DisplayInfo => ({
  id: "d1",
  paneId: P,
  name: "main",
  kind: "panel",
  format: "text",
  title: "main",
  size: 320,
  rev: 1,
  bytes: 1,
  updatedAt: "x",
  ...over,
});
const band = (over: Partial<DisplayInfo> = {}): DisplayInfo => info({ kind: "band", name: "bar", ...over });
const S: LayoutSettings = { initial: "open", dock: "right", edge: "top" };
const withFace = (i: DisplayInfo, face: Record<string, unknown>): DisplayLayoutPrefs => ({ ...emptyLayout(), faces: { [faceKey(i)]: face as never } });
const ALL = DISPLAY_DOCKS;

describe("loadDisplayLayout", () => {
  it("形が違えば空", () => {
    for (const raw of [undefined, null, 1, "x", [], {}, { v: 2, faces: {} }]) expect(loadDisplayLayout(raw)).toEqual(emptyLayout());
  });
  it("正しい値を読む", () => {
    const raw = {
      v: 1,
      faces: { [`${P}|panel|main`]: { dock: "left", collapsed: true, rect: { x: 1, y: 2, w: 300, h: 200 } }, [`${P}|band|bar`]: { edge: "bottom", collapsed: false } },
      names: { "panel|main": { dock: "left" }, "band|bar": { edge: "bottom" } },
      sides: { [`${P}|right`]: 400.4 },
    };
    expect(loadDisplayLayout(raw)).toEqual({ ...raw, sides: { [`${P}|right`]: 400 } });
  });
  it("項目の欠けた記憶は鍵ごと捨てる（collapsed が無い・パネルで dock が無い・帯で edge が無い・知らない値）", () => {
    const raw = {
      v: 1,
      faces: {
        [`${P}|panel|a`]: { dock: "left" },
        [`${P}|panel|b`]: { collapsed: true },
        [`${P}|band|c`]: { collapsed: true },
        [`${P}|panel|d`]: { dock: "middle", collapsed: false },
        [`${P}|panel|e`]: { dock: "top", collapsed: "no" },
        [`${P}|thing|f`]: { dock: "top", collapsed: false },
        "bad-key": { dock: "top", collapsed: false },
        [`${P}|panel|ok`]: { dock: "top", collapsed: false },
      },
    };
    expect(Object.keys(loadDisplayLayout(raw).faces)).toEqual([`${P}|panel|ok`]);
  });
  it("rect は合わなければ rect だけ捨てる（x・y は 0〜8192、w・h は 1〜8192、有限）", () => {
    const f = (rect: unknown) => loadDisplayLayout({ v: 1, faces: { [`${P}|panel|m`]: { dock: "float", collapsed: false, rect } } }).faces[`${P}|panel|m`];
    expect(f({ x: 0, y: 0, w: 1, h: 1 })?.rect).toEqual({ x: 0, y: 0, w: 1, h: 1 });
    for (const rect of [{ x: -1, y: 0, w: 5, h: 5 }, { x: 0, y: 0, w: 0, h: 5 }, { x: 0, y: 0, w: 5, h: 8193 }, { x: NaN, y: 0, w: 5, h: 5 }, { x: 0, y: 0, w: 5 }, "r"]) {
      expect(f(rect)).toEqual({ dock: "float", collapsed: false });
    }
  });
  it("names・sides の検査（kind と値が合わない・範囲外は捨てる）", () => {
    const l = loadDisplayLayout({
      v: 1,
      names: { "panel|a": { dock: "top" }, "panel|b": { edge: "top" }, "band|c": { edge: "bottom" }, "band|d": { dock: "top" }, x: {} },
      sides: { [`${P}|top`]: 96, [`${P}|left`]: 95, [`${P}|right`]: 8193, [`${P}|middle`]: 200, [`${P}|bottom`]: "x" },
    });
    expect(l.names).toEqual({ "panel|a": { dock: "top" }, "band|c": { edge: "bottom" } });
    expect(l.sides).toEqual({ [`${P}|top`]: 96 });
  });
  it("上限を超えた分は先頭（古いもの）から捨てる", () => {
    const faces: Record<string, unknown> = {};
    for (let i = 0; i < FACE_PREFS_MAX + 5; i++) faces[`${P}|panel|n${i}`] = { dock: "right", collapsed: false };
    const names: Record<string, unknown> = {};
    for (let i = 0; i < NAME_PREFS_MAX + 3; i++) names[`panel|n${i}`] = { dock: "right" };
    const sides: Record<string, unknown> = {};
    for (let i = 0; i < SIDE_PREFS_MAX + 2; i++) sides[`p${i}|right`] = 200;
    const l = loadDisplayLayout({ v: 1, faces, names, sides });
    expect(Object.keys(l.faces)).toHaveLength(FACE_PREFS_MAX);
    expect(Object.keys(l.faces)[0]).toBe(`${P}|panel|n5`);
    expect(Object.keys(l.names)).toHaveLength(NAME_PREFS_MAX);
    expect(Object.keys(l.names)[0]).toBe("panel|n3");
    expect(Object.keys(l.sides)).toHaveLength(SIDE_PREFS_MAX);
  });
});

describe("putLast・pruneLayoutPanes・storedSideSize", () => {
  it("書くたびに鍵を末尾へ移し、上限で先頭を捨てる", () => {
    expect(Object.keys(putLast({ a: 1, b: 2, c: 3 }, "a", 9, 3))).toEqual(["b", "c", "a"]);
    expect(Object.keys(putLast({ a: 1, b: 2, c: 3 }, "d", 9, 3))).toEqual(["b", "c", "d"]);
  });
  it("もう無い pane の faces・sides を捨てる。names は触らない。変わらなければ同じ値", () => {
    const l: DisplayLayoutPrefs = {
      v: 1,
      faces: { [`${P}|panel|a`]: { dock: "right", collapsed: true }, [`${Q}|panel|a`]: { dock: "right", collapsed: true } },
      names: { "panel|a": { dock: "left" } },
      sides: { [`${P}|right`]: 200, [`${Q}|left`]: 200 },
    };
    expect(pruneLayoutPanes(l, new Set([P, Q]))).toBe(l);
    const n = pruneLayoutPanes(l, new Set([P]));
    expect(Object.keys(n.faces)).toEqual([`${P}|panel|a`]);
    expect(Object.keys(n.sides)).toEqual([`${P}|right`]);
    expect(n.names).toEqual(l.names);
  });
  it("右の大きさは、無ければ今までの displayPanelWidths を読む（左・上・下は読まない）。新しい記憶が先", () => {
    const legacy = new Map([[P, 333]]);
    const l = emptyLayout();
    expect(storedSideSize(l, P, "right", legacy)).toBe(333);
    expect(storedSideSize(l, P, "left", legacy)).toBeUndefined();
    expect(storedSideSize({ ...l, sides: { [`${P}|right`]: 250 } }, P, "right", legacy)).toBe(250);
    expect(storedSideSize(l, Q, "right", legacy)).toBeUndefined();
  });
});

describe("effectiveDock（記憶 ＞ 同じ名前 ＞ 指定 ＞ 設定。caps に無い値は飛ばす）", () => {
  const i = info({ dock: "bottom" });
  const nm = { ...emptyLayout(), names: { [nameKey(i)]: { dock: "left" as const } } };
  it("優先の表の全行", () => {
    const set = { dock: "top" as const };
    expect(effectiveDock(info(), emptyLayout(), { dock: "right" }, ALL)).toBe("right"); // 記憶なし・指定なし → 設定
    expect(effectiveDock(info(), emptyLayout(), set, ALL)).toBe("top");
    expect(effectiveDock(i, emptyLayout(), set, ALL)).toBe("bottom"); // 指定 ＞ 設定
    expect(effectiveDock(i, nm, set, ALL)).toBe("left"); // 同じ名前 ＞ 指定
    expect(effectiveDock(i, { ...nm, faces: { [faceKey(i)]: { dock: "float", collapsed: false } } }, set, ALL)).toBe("float"); // 面の記憶 ＞ 同じ名前
  });
  it("caps に無い値は飛ばして次を見る。どれも出せなければ right", () => {
    expect(DISPLAY_DOCK_CAPS).toEqual(["right", "left", "top", "bottom"]); // PR-B: 4 つの側（浮いた窓は PR-C）
    expect(effectiveDock(i, emptyLayout(), { dock: "right" }, ["right"])).toBe("right");
    expect(effectiveDock(i, emptyLayout(), { dock: "top" }, ["top", "right"])).toBe("top");
    expect(effectiveDock(i, nm, { dock: "float" }, ["right"])).toBe("right");
    expect(effectiveDock(i, emptyLayout(), { dock: "float" }, ["top"])).toBe("right");
  });
  it("知らない指定の値は指定なし", () => {
    expect(effectiveDock(info({ dock: "diagonal" }), emptyLayout(), { dock: "left" }, ALL)).toBe("left");
    expect(effectiveDock(info({ dock: 3 as never }), emptyLayout(), { dock: "left" }, ALL)).toBe("left");
  });
});

describe("effectiveEdge", () => {
  it("記憶 ＞ 同じ名前 ＞ 指定 ＞ 設定", () => {
    const b = band({ edge: "bottom" });
    expect(effectiveEdge(band(), emptyLayout(), { edge: "top" })).toBe("top");
    expect(effectiveEdge(band(), emptyLayout(), { edge: "bottom" })).toBe("bottom");
    expect(effectiveEdge(b, emptyLayout(), { edge: "top" })).toBe("bottom");
    expect(effectiveEdge(b, { ...emptyLayout(), names: { [nameKey(b)]: { edge: "top" } } }, { edge: "bottom" })).toBe("top");
    expect(effectiveEdge(b, withFace(b, { edge: "top", collapsed: false }), { edge: "bottom" })).toBe("top");
    expect(effectiveEdge(band({ edge: "left" }), emptyLayout(), { edge: "bottom" })).toBe("bottom");
  });
});

describe("effectiveCollapsed", () => {
  it("記憶なし: パネルは 設定 collapsed か 指定 collapsed か 置き場所が float でたたむ。帯は指定だけ", () => {
    expect(effectiveCollapsed(info(), emptyLayout(), { initial: "open" }, "right")).toBe(false);
    expect(effectiveCollapsed(info(), emptyLayout(), { initial: "collapsed" }, "right")).toBe(true);
    expect(effectiveCollapsed(info({ collapsed: true }), emptyLayout(), { initial: "open" }, "right")).toBe(true);
    expect(effectiveCollapsed(info(), emptyLayout(), { initial: "open" }, "float")).toBe(true);
    expect(effectiveCollapsed(band(), emptyLayout(), { initial: "collapsed" }, null)).toBe(false); // 帯に設定は効かない
    expect(effectiveCollapsed(band({ collapsed: true }), emptyLayout(), { initial: "open" }, null)).toBe(true);
  });
  it("面の記憶があれば、指定・設定より先（開いた面は、設定が collapsed でも・指定が collapsed でも開いたまま）", () => {
    const i = info({ collapsed: true });
    expect(effectiveCollapsed(i, withFace(i, { dock: "right", collapsed: false }), { initial: "collapsed" }, "right")).toBe(false);
    expect(effectiveCollapsed(info(), withFace(info(), { dock: "right", collapsed: true }), { initial: "open" }, "right")).toBe(true);
  });
  it("同じ名前の記憶は、たたみには使わない", () => {
    expect(effectiveCollapsed(info(), { ...emptyLayout(), names: { [nameKey(info())]: { dock: "left" } } }, { initial: "open" }, "left")).toBe(false);
  });
});

describe("hasFacePref", () => {
  it("面の記憶がある、または同じ名前の記憶がある", () => {
    expect(hasFacePref(info(), emptyLayout())).toBe(false);
    expect(hasFacePref(info(), withFace(info(), { dock: "right", collapsed: false }))).toBe(true);
    expect(hasFacePref(info(), { ...emptyLayout(), names: { [nameKey(info())]: { dock: "left" } } })).toBe(true);
    expect(hasFacePref(band(), { ...emptyLayout(), names: { [nameKey(band())]: { edge: "bottom" } } })).toBe(true);
  });
});

describe("composeFacePref（記憶に書く全項目）", () => {
  const caps = DISPLAY_DOCK_CAPS;
  it("変えた項目に、導出した値を重ねて全項目を書く: --dock bottom の面をたたんでも、記憶の dock は bottom", () => {
    const i = info({ dock: "bottom" });
    expect(composeFacePref(i, emptyLayout(), S, caps, { collapsed: true })).toEqual({ dock: "bottom", collapsed: true });
  });
  it("帯を移しただけの後も、collapsed は導出した値（指定の collapsed を、移すと同時に書き込む）", () => {
    const b = band({ collapsed: true });
    expect(composeFacePref(b, emptyLayout(), S, caps, { edge: "bottom" })).toEqual({ edge: "bottom", collapsed: true });
    // 書いた後は記憶が決める
    const l = { ...emptyLayout(), faces: { [faceKey(b)]: { edge: "bottom" as const, collapsed: true } } };
    expect(effectiveCollapsed(b, l, S, null)).toBe(true);
    // setFaceEdge は collapsed:false を一緒に書く
    expect(composeFacePref(b, emptyLayout(), S, caps, { edge: "bottom", collapsed: false })).toEqual({ edge: "bottom", collapsed: false });
  });
  it("記憶の無い面の置き場所は、設定の値を丸める前のまま書く", () => {
    expect(composeFacePref(info(), emptyLayout(), { ...S, dock: "left" }, caps, { collapsed: true })).toEqual({ dock: "left", collapsed: true });
  });
  it("丸める前が float で、画面が float を出せないときは、丸めた後の値を書く。出せる画面なら float", () => {
    const i = info({ dock: "float" });
    expect(composeFacePref(i, emptyLayout(), S, ["right", "left", "top", "bottom"], { collapsed: false })).toEqual({ dock: "right", collapsed: false });
    expect(composeFacePref(i, emptyLayout(), S, ALL, { collapsed: false })).toEqual({ dock: "float", collapsed: false });
  });
  it("丸めた後が float の面は、記憶が無ければたたんで始まる（float を出せない画面では、設定と指定どおり）", () => {
    const i = info({ dock: "float" });
    expect(effectiveFace(i, emptyLayout(), S, ALL).collapsed).toBe(true);
    expect(effectiveFace(i, emptyLayout(), S, caps)).toEqual({ dock: "right", edge: null, collapsed: false });
  });
  it("rect は、渡せばそれ・渡さなければ記憶のものを残す", () => {
    const i = info({ dock: "float" });
    const r = { x: 1, y: 2, w: 3, h: 4 };
    const l = withFace(i, { dock: "float", collapsed: false, rect: r });
    expect(composeFacePref(i, l, S, ALL, { collapsed: true }).rect).toEqual(r);
    expect(composeFacePref(i, l, S, ALL, { rect: { x: 9, y: 9, w: 9, h: 9 } }).rect).toEqual({ x: 9, y: 9, w: 9, h: 9 });
  });
});
