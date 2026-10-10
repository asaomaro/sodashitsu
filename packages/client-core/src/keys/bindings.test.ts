import { describe, expect, it } from "vitest";
import { expandRange, formatBinding, parseBinding } from "./chord.js";
import { ACTIONS, actionDef, actionFor, isActionId } from "./bindings.js";

// 既定のキーが無い操作（`defaults: []`）。20260923-missing-keybinding-actions で足した12操作が最初で（herdr と同じく「既定は割り当てなし」。research F1）、
// 20260923-workspace-grouping の 2 操作と 20260927-cli-mode の 5 操作を合わせて 19 個（20261004-subagent-display の show_subagents は既定が prefix+shift+s なので入らない）。
const UNBOUND_BY_DEFAULT_IDS = [
  "previous_workspace",
  "next_workspace",
  "move_tab_previous",
  "move_tab_next",
  "previous_agent",
  "next_agent",
  "focus_agent",
  "last_pane",
  "resize_pane_left",
  "resize_pane_down",
  "resize_pane_up",
  "resize_pane_right",
  "move_workspace_previous",
  "move_workspace_next",
  // 20260927-cli-mode（design D-7）。switch_workspace・open_worktree・remove_worktree は herdr と同じく既定なし。swap_with_focused は herdr では
  // メニューの項目（キーの操作ではない）。stop_server は herdr の操作ではない（本製品の追加。押し間違えると全ての pane が止まるので既定なし・確認つき）。
  "stop_server",
  "switch_workspace",
  "open_worktree",
  "remove_worktree",
  "swap_with_focused",
  // 20261004-subagent-display。既定のキーは無い（利用者が設定で割り当てる）。
];

describe("操作のカタログ（design「操作のカタログ」）", () => {
  // 20260922-appearance-settings-rest T7 で reload_config（全体）をカタログへ正式登録し 35 個に。
  // 20260923-missing-keybinding-actions で12個追加し 47 個になった（NOT_YET_BINDINGS の案内から昇格。keymap.ts 参照）。
  // 20260923-workspace-grouping で move_workspace_previous/next の2個を追加し 49 個になった。
  // 20260926-edit-scrollback で edit_scrollback（pane）を追加し 50 個になった。
  // 20260927-clipboard-image-paste で remote_image_paste（pane。既定は直接のキー ctrl+v）を追加し 51 個になった。
  // 20260927-cli-mode で stop_server（全体）・switch_workspace・open_worktree・remove_worktree（workspace / tab）・swap_with_focused（pane）を追加し 56 個になった。
  // 20260927-agent-graph で open_graph（全体）を追加し 57 個になった。
  // 20261004-subagent-display で show_subagents（pane。既定は prefix+shift+s）を追加し 58 個になった。
  // 20261004-ui-interaction-polish で toggle_spaces_section・toggle_agents_section（pane。既定は prefix+shift+b・prefix+shift+a）を追加し 60 個になった。
  // 20261005-notify-bell で open_notification_history（全体。既定は prefix+shift+o）を追加し 61 個になった。
  // 20261007-soda-extensions で focus_display（pane。既定は prefix+i）を追加し 62 個に、20261008-display-layout で display_menu（pane。既定は prefix+shift+i）を追加し 63 個になった。
  // 20261010-agent-usage PR4 で show_usage（pane。既定は prefix+shift+u）を追加し 64 個になった。
  it("64 個あり、id は重複しない・表示名は空でない", () => {
    expect(ACTIONS).toHaveLength(64);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(64);
    for (const a of ACTIONS) expect(a.label.length, a.id).toBeGreaterThan(0);
  });

  it("群は 全体 8・workspace / tab 24・pane 32（この順に並ぶ）", () => {
    const groups = ACTIONS.map((a) => a.group);
    expect(groups.filter((g) => g === "全体")).toHaveLength(8);
    expect(groups.filter((g) => g === "workspace / tab")).toHaveLength(24);
    expect(groups.filter((g) => g === "pane")).toHaveLength(32);
    // 群ごとにまとまっている（全体 → workspace / tab → pane）
    expect(groups.join(",")).toBe(
      [...groups]
        .sort(
          (a, b) =>
            ["全体", "workspace / tab", "pane"].indexOf(a) -
            ["全体", "workspace / tab", "pane"].indexOf(b),
        )
        .join(","),
    );
  });

  it("既定の割り当てはすべて `prefix+…` として読め、範囲になるのは範囲の操作（switch_tab・focus_agent・switch_workspace）だけ", () => {
    for (const a of ACTIONS) {
      // `UNBOUND_BY_DEFAULT_IDS`（19 個）は既定が割り当てなし（`defaults: []`）。
      if (UNBOUND_BY_DEFAULT_IDS.includes(a.id)) {
        expect(a.defaults.length, a.id).toBe(0);
        continue;
      }
      expect(a.defaults.length, a.id).toBeGreaterThan(0);
      // 既定が直接のキーなのは remote_image_paste（ctrl+v。herdr の既定と同じ）だけ。
      if (a.id === "remote_image_paste") {
        expect(a.defaults).toEqual(["ctrl+v"]);
        continue;
      }
      for (const d of a.defaults) {
        const b = parseBinding(d);
        expect(b, `${a.id}: ${d}`).not.toBeNull();
        expect(b!.via, `${a.id}: ${d}`).toBe("prefix");
        expect(b!.range, `${a.id}: ${d}`).toBe(a.id === "switch_tab");
      }
    }
    const indexed = ACTIONS.filter((a) => "indexed" in a && a.indexed);
    expect(indexed.map((a) => a.id)).toEqual(["switch_tab", "focus_agent", "switch_workspace"]);
  });

  it("20260927-cli-mode の操作（design D-7）: switch_workspace は数字をそのまま（1〜9）、ほかは固定の Action", () => {
    expect(actionFor(actionDef("switch_workspace")!, 3)).toEqual({ type: "workspaceIndex", index: 3 });
    expect(actionFor(actionDef("open_worktree")!)).toEqual({ type: "openWorktree" });
    expect(actionFor(actionDef("remove_worktree")!)).toEqual({ type: "removeWorktree" });
    expect(actionFor(actionDef("swap_with_focused")!)).toEqual({ type: "swapWithFocused" });
    expect(actionFor(actionDef("stop_server")!)).toEqual({ type: "stopServer" });
  });

  it("既定の文字列は正規形（読んで書き出すと同じ。保存の「差」の比較に使う）", () => {
    for (const a of ACTIONS)
      for (const d of a.defaults) expect(formatBinding(parseBinding(d)!), `${a.id}: ${d}`).toBe(d);
  });

  it("既定の prefix の後のキー（範囲は 9 個に展開）は、操作をまたいで重ならない", () => {
    const seen = new Map<string, string>();
    for (const a of ACTIONS) {
      for (const d of a.defaults) {
        const b = parseBinding(d)!;
        for (const chord of b.range ? expandRange(b.chord) : [b.chord]) {
          expect(
            seen.get(chord),
            `${a.id} の ${chord} が ${seen.get(chord)} と重なる`,
          ).toBeUndefined();
          seen.set(chord, a.id);
        }
      }
    }
  });

  // 20260927-cli-mode で swap_with_focused（herdr ではメニューの項目で、ヘルプに無い）が加わった。
  it("キー一覧に出さないのは swap の 5 つだけ（herdr のヘルプにも無い）", () => {
    expect(ACTIONS.filter((a) => "helpHidden" in a && a.helpHidden).map((a) => a.id)).toEqual([
      "swap_pane_left",
      "swap_pane_down",
      "swap_pane_up",
      "swap_pane_right",
      "swap_with_focused",
    ]);
  });

  it("引くと実行する Action が、これまでの割り当てと同じ（代表）", () => {
    expect(actionFor(actionDef("split_vertical")!)).toEqual({ type: "split", dir: "right" });
    expect(actionFor(actionDef("split_horizontal")!)).toEqual({ type: "split", dir: "down" });
    expect(actionFor(actionDef("focus_pane_left")!)).toEqual({ type: "focusDir", dir: "left" });
    expect(actionFor(actionDef("swap_pane_up")!)).toEqual({ type: "swap", dir: "up" });
    expect(actionFor(actionDef("cycle_pane_previous")!)).toEqual({ type: "cyclePane", delta: -1 });
    expect(actionFor(actionDef("workspace_picker")!)).toEqual({
      type: "enterMode",
      mode: "navigate",
    });
    expect(actionFor(actionDef("resize_mode")!)).toEqual({ type: "enterMode", mode: "resize" });
    expect(actionFor(actionDef("copy_mode")!)).toEqual({ type: "enterMode", mode: "copy" });
    expect(actionFor(actionDef("edit_scrollback")!)).toEqual({ type: "editScrollback" });
    expect(actionDef("edit_scrollback")).toMatchObject({ group: "pane", defaults: ["prefix+e"] });
    expect(actionFor(actionDef("open_notification_target")!)).toEqual({ type: "nextNotification" });
    expect(actionFor(actionDef("open_notification_history")!)).toEqual({ type: "openNotificationHistory" });
    expect(actionFor(actionDef("previous_tab")!)).toEqual({ type: "tabDelta", delta: -1 });
  });

  it("範囲の操作は数字から Action を作る。数字を省くと例外（呼ぶ側の誤り）・範囲でない操作は数字を見ない", () => {
    const def = actionDef("switch_tab")!;
    expect(actionFor(def, 3)).toEqual({ type: "tabIndex", index: 3 });
    expect(actionFor(def, 9)).toEqual({ type: "tabIndex", index: 9 });
    expect(() => actionFor(def)).toThrow(/switch_tab/);
    expect(actionFor(actionDef("zoom")!, 5)).toEqual({ type: "zoom" });
    expect(actionFor(actionDef("zoom")!)).toEqual({ type: "zoom" });
  });

  it("範囲の操作かどうか（indexed）と action の形が食い違う定義はない", () => {
    for (const a of ACTIONS)
      expect(typeof a.action === "function", a.id).toBe("indexed" in a && a.indexed === true);
  });

  it("isActionId / actionDef はカタログにある名前だけを通す（壊れた保存値を弾く）", () => {
    expect(isActionId("split_vertical")).toBe(true);
    // 20260922-appearance-settings-rest T7 で reload_config をカタログへ登録したので、今は通る。
    expect(isActionId("reload_config")).toBe(true);
    expect(isActionId("edit_scrollback")).toBe(true); // 20260926-edit-scrollback で「後続」の案内から昇格
    expect(isActionId(42)).toBe(false);
    expect(isActionId(undefined)).toBe(false);
    expect(actionDef("bogus")).toBeUndefined();
    expect(actionDef("goto")?.label).toBe("goto（workspace・tab・pane から探す）");
  });
});
