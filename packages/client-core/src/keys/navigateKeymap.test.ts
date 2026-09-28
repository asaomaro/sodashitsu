import { describe, expect, it } from "vitest";
import type { NavigateKeyId } from "./navigateKeys.js";
import { DEFAULT_NAVIGATE_KEYMAP, resolveNavigateKeymap } from "./navigateKeymap.js";

describe("DEFAULT_NAVIGATE_KEYMAP — 既定は現行の固定値と1:1（AC3・AC8）", () => {
  it("7操作の既定の割り当て（20260925-sidebar-keyboard-menu で navigate_open_menu が7件目に加わった）", () => {
    const km = DEFAULT_NAVIGATE_KEYMAP;
    expect(km.bindingsOf("navigate_workspace_up")).toEqual(["up"]);
    expect(km.bindingsOf("navigate_workspace_down")).toEqual(["down"]);
    expect(km.bindingsOf("navigate_pane_left")).toEqual(["h"]);
    expect(km.bindingsOf("navigate_pane_down")).toEqual(["j"]);
    expect(km.bindingsOf("navigate_pane_up")).toEqual(["k"]);
    expect(km.bindingsOf("navigate_pane_right")).toEqual(["l"]);
    expect(km.bindingsOf("navigate_open_menu")).toEqual(["space"]);
  });

  it("ownerOf・actionFor", () => {
    const km = DEFAULT_NAVIGATE_KEYMAP;
    expect(km.ownerOf("h")).toBe("navigate_pane_left");
    expect(km.ownerOf("up")).toBe("navigate_workspace_up");
    expect(km.ownerOf("x")).toBeNull();
    expect(km.actionFor("h")).toEqual({ type: "navigate", op: "paneDir", dir: "left" });
    expect(km.actionFor("up")).toEqual({ type: "navigate", op: "up" });
    expect(km.actionFor("x")).toBeUndefined();
    expect(km.ownerOf("space")).toBe("navigate_open_menu");
    expect(km.actionFor("space")).toEqual({ type: "navigate", op: "openMenu" });
    // 予約キーは表に登録されない（left/right は pane 左右移動の既定にも使われない）。
    expect(km.ownerOf("left")).toBeNull();
    expect(km.ownerOf("right")).toBeNull();
    expect(km.ownerOf("esc")).toBeNull();
    expect(km.ownerOf("enter")).toBeNull();
    expect(km.ownerOf("tab")).toBeNull();
  });

  it("problems は空（既定の chord はどれも登録に成功する）", () => {
    expect(resolveNavigateKeymap({}).problems).toEqual([]);
  });
});

describe("resolveNavigateKeymap — 上書き（AC2・AC4）", () => {
  it("1操作を上書きすると、その操作だけ変わり他は既定のまま", () => {
    const { keymap, problems } = resolveNavigateKeymap({ navigate_pane_left: ["ctrl+h"] });
    expect(problems).toEqual([]);
    expect(keymap.bindingsOf("navigate_pane_left")).toEqual(["ctrl+h"]);
    expect(keymap.ownerOf("h")).toBeNull(); // 既定の h は空く
    expect(keymap.ownerOf("ctrl+h")).toBe("navigate_pane_left");
    expect(keymap.bindingsOf("navigate_pane_right")).toEqual(["l"]); // 他は既定のまま
  });

  it("複数の chord を1操作に割り当てられる", () => {
    const { keymap } = resolveNavigateKeymap({ navigate_pane_left: ["h", "ctrl+h"] });
    expect(keymap.bindingsOf("navigate_pane_left")).toEqual(["h", "ctrl+h"]);
  });

  it("空配列は「割り当てなし」（既定へは戻らない）", () => {
    const { keymap, problems } = resolveNavigateKeymap({ navigate_workspace_up: [] });
    expect(problems).toEqual([]);
    expect(keymap.bindingsOf("navigate_workspace_up")).toEqual([]);
    expect(keymap.ownerOf("up")).toBeNull();
  });

  it("読めない chord は落として理由を記録し、上書きが1つも登録できなかったので既定へ戻す", () => {
    const { keymap, problems } = resolveNavigateKeymap({ navigate_pane_left: ["bogus+"] });
    expect(keymap.bindingsOf("navigate_pane_left")).toEqual(["h"]); // 既定へ戻る（design「上書きが1つ以上あるのに1つも登録できなかった操作は既定を登録し直す」）
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("navigate_pane_left");
  });

  it("予約キーは登録できない（AC2。理由に予約の説明を含み、既定へ戻る）", () => {
    const DEFAULT_OF: Record<string, string> = {
      navigate_workspace_up: "up",
      navigate_pane_left: "h",
      navigate_pane_right: "l",
    };
    for (const [id, chord] of [
      ["navigate_workspace_up", "esc"],
      ["navigate_workspace_up", "enter"],
      ["navigate_workspace_up", "tab"],
      ["navigate_workspace_up", "shift+tab"],
      ["navigate_pane_left", "left"],
      ["navigate_pane_right", "right"],
      ["navigate_workspace_up", "5"],
    ] as const) {
      const { keymap, problems } = resolveNavigateKeymap({ [id]: [chord] } as Partial<
        Record<NavigateKeyId, string[]>
      >);
      // 予約キーは登録されず、上書きが1つも登録できなかったので既定へ戻る（"5" も同様——修飾無しの数字は予約）。
      expect(keymap.bindingsOf(id), chord).toEqual([DEFAULT_OF[id]]);
      expect(keymap.ownerOf(chord), chord).toBeNull();
      expect(problems[0], chord).toContain("予約");
    }
  });

  it("6操作間の衝突は先に登録された側が勝つ（カタログ順・上書き優先）", () => {
    const { keymap, problems } = resolveNavigateKeymap({
      navigate_pane_left: ["j"], // navigate_pane_down の既定 j を奪う
    });
    expect(keymap.ownerOf("j")).toBe("navigate_pane_left");
    expect(keymap.bindingsOf("navigate_pane_down")).toEqual([]); // j を奪われたので空く
    expect(problems).toEqual([]); // navigate_pane_down は既定の登録が0件でも problems は積まない（user指定ではないため）
  });

  it("2つの上書きが同じ chord を取り合うと、カタログ順で先の操作が勝ち、後は理由付きで落ちて既定へ戻る", () => {
    const { keymap, problems } = resolveNavigateKeymap({
      navigate_workspace_up: ["x"],
      navigate_workspace_down: ["x"],
    });
    expect(keymap.ownerOf("x")).toBe("navigate_workspace_up");
    expect(keymap.bindingsOf("navigate_workspace_down")).toEqual(["down"]); // 既定へ戻る
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("navigate_workspace_down");
    expect(problems[0]).toContain("navigate_workspace_up");
  });

  it("上書きが1つ以上あるのに1つも登録できなかった操作は、既定を登録し直す", () => {
    const { keymap, problems } = resolveNavigateKeymap({ navigate_pane_left: ["bogus+", "also+bad"] });
    expect(keymap.bindingsOf("navigate_pane_left")).toEqual(["h"]); // 既定へ戻る
    expect(problems).toHaveLength(2);
  });

  it("同じ chord の重複は上流（keyPrefs.ts の正規化）が担う——ここでは先着だけを登録し、後続は自分自身との衝突として落とす（keymap.ts の resolveKeymap と同じ扱い）", () => {
    const { keymap, problems } = resolveNavigateKeymap({ navigate_pane_left: ["ctrl+h", "ctrl+h"] });
    expect(keymap.bindingsOf("navigate_pane_left")).toEqual(["ctrl+h"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("navigate_pane_left");
  });
});
