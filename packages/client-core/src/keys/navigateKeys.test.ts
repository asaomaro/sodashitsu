import { describe, expect, it } from "vitest";
import { formatChord, parseChord } from "./chord.js";
import { isNavigateKeyId, NAVIGATE_KEYS, NAVIGATE_RESERVED_CHORDS, navigateKeyDef } from "./navigateKeys.js";

describe("NAVIGATE_KEYS — カタログ（AC3）", () => {
  it("7操作、id は重複しない・表示名は空でない", () => {
    expect(NAVIGATE_KEYS).toHaveLength(7);
    expect(new Set(NAVIGATE_KEYS.map((d) => d.id)).size).toBe(7);
    for (const d of NAVIGATE_KEYS) expect(d.label.length, d.id).toBeGreaterThan(0);
  });

  it("既定の chord は正規形（chord.ts の parseChord で読んで formatChord で書き出すと同じ。navigateKeymap.ts の予約判定・保存の『差』の比較に使う）", () => {
    for (const d of NAVIGATE_KEYS)
      for (const chord of d.defaults)
        expect(formatChord(parseChord(chord)!), `${d.id}: ${chord}`).toBe(chord);
  });

  it("既定6件は現行の NavigateMode.ts の固定キーと1:1。7件目（navigate_open_menu）は移動ではなくメニューを開く操作（20260925-sidebar-keyboard-menu）", () => {
    expect(NAVIGATE_KEYS.map((d) => d.id)).toEqual([
      "navigate_workspace_up",
      "navigate_workspace_down",
      "navigate_pane_left",
      "navigate_pane_down",
      "navigate_pane_up",
      "navigate_pane_right",
      "navigate_open_menu",
    ]);
    expect(navigateKeyDef("navigate_workspace_up")?.defaults).toEqual(["up"]);
    expect(navigateKeyDef("navigate_workspace_down")?.defaults).toEqual(["down"]);
    expect(navigateKeyDef("navigate_pane_left")?.defaults).toEqual(["h"]);
    expect(navigateKeyDef("navigate_pane_down")?.defaults).toEqual(["j"]);
    expect(navigateKeyDef("navigate_pane_up")?.defaults).toEqual(["k"]);
    expect(navigateKeyDef("navigate_pane_right")?.defaults).toEqual(["l"]);
    expect(navigateKeyDef("navigate_open_menu")?.defaults).toEqual(["space"]);
  });

  it("各操作の action は navigate 系の固定 Action", () => {
    expect(navigateKeyDef("navigate_workspace_up")?.action).toEqual({ type: "navigate", op: "up" });
    expect(navigateKeyDef("navigate_workspace_down")?.action).toEqual({ type: "navigate", op: "down" });
    expect(navigateKeyDef("navigate_pane_left")?.action).toEqual({
      type: "navigate",
      op: "paneDir",
      dir: "left",
    });
    expect(navigateKeyDef("navigate_pane_down")?.action).toEqual({
      type: "navigate",
      op: "paneDir",
      dir: "down",
    });
    expect(navigateKeyDef("navigate_pane_up")?.action).toEqual({
      type: "navigate",
      op: "paneDir",
      dir: "up",
    });
    expect(navigateKeyDef("navigate_pane_right")?.action).toEqual({
      type: "navigate",
      op: "paneDir",
      dir: "right",
    });
    expect(navigateKeyDef("navigate_open_menu")?.action).toEqual({ type: "navigate", op: "openMenu" });
  });

  it("既定の chord はどれも予約キーではない・互いに重ならない（自己整合性）", () => {
    const all = NAVIGATE_KEYS.flatMap((d) => d.defaults);
    for (const chord of all) expect(NAVIGATE_RESERVED_CHORDS.has(chord), chord).toBe(false);
    expect(new Set(all).size).toBe(all.length); // 重複なし
  });

  it("navigateKeyDef — カタログに無い id は undefined", () => {
    expect(navigateKeyDef("bogus")).toBeUndefined();
    expect(navigateKeyDef("")).toBeUndefined();
  });

  it("isNavigateKeyId — カタログの id だけ true", () => {
    expect(isNavigateKeyId("navigate_pane_left")).toBe(true);
    expect(isNavigateKeyId("navigate_pane_left2")).toBe(false);
    expect(isNavigateKeyId("split_vertical")).toBe(false); // 既存操作（bindings.ts の ACTIONS）の id は別の表
    expect(isNavigateKeyId(42)).toBe(false);
    expect(isNavigateKeyId(undefined)).toBe(false);
    expect(isNavigateKeyId(null)).toBe(false);
  });
});

describe("NAVIGATE_RESERVED_CHORDS — 予約キー（AC2。research F7）", () => {
  it("各要素は正規形（parseChord で読んで formatChord で書き出すと同じ）。予約判定は文字列の厳密一致（navigateKeymap.ts）なので、ここが崩れると予約が黙って効かなくなる", () => {
    for (const chord of NAVIGATE_RESERVED_CHORDS)
      expect(formatChord(parseChord(chord)!), chord).toBe(chord);
  });

  it("esc・enter・tab・shift+tab・left・right・ctrl+shift+v・修飾無し1〜9の計16個", () => {
    expect(NAVIGATE_RESERVED_CHORDS.size).toBe(16);
    for (const c of ["esc", "enter", "tab", "shift+tab", "left", "right", "ctrl+shift+v"])
      expect(NAVIGATE_RESERVED_CHORDS.has(c), c).toBe(true);
    for (const n of ["1", "2", "3", "4", "5", "6", "7", "8", "9"])
      expect(NAVIGATE_RESERVED_CHORDS.has(n), n).toBe(true);
  });

  it("修飾付きの矢印・tab/shift+tab 以外の tab 系・ctrl+shift+v 以外の v は予約に含まない", () => {
    for (const c of ["ctrl+tab", "alt+left", "ctrl+left", "alt+right", "ctrl+1", "shift+1", "h", "j", "k", "l", "up", "down", "v", "ctrl+v", "shift+v"])
      expect(NAVIGATE_RESERVED_CHORDS.has(c), c).toBe(false);
  });
});
