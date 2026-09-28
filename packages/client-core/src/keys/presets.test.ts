import { describe, expect, it } from "vitest";
import { RECOMMENDED_DIRECT } from "./assign.js";
import { actionDef } from "./bindings.js";
import { parseBinding } from "./chord.js";
import { KEY_PRESETS, PRESET_TMUX } from "./presets.js";

describe("KEY_PRESETS（design「`presets.ts`（新規）」・AC1・AC5）", () => {
  it("2 件：herdr のおすすめ（ctrl+alt）・tmux 風", () => {
    expect(KEY_PRESETS.map((p) => p.id)).toEqual(["herdr-ctrl-alt", "tmux"]);
    for (const p of KEY_PRESETS) expect(p.label.length, p.id).toBeGreaterThan(0);
  });

  it("herdr-ctrl-alt の bindings は RECOMMENDED_DIRECT と同じ内容（AC6：既存の一覧を変えない）", () => {
    const preset = KEY_PRESETS.find((p) => p.id === "herdr-ctrl-alt")!;
    expect(preset.bindings).toEqual(RECOMMENDED_DIRECT);
  });

  it("全プリセットの全エントリ：binding 文字列が読める・操作 id がカタログに実在する", () => {
    for (const preset of KEY_PRESETS) {
      for (const [id, binding] of preset.bindings) {
        expect(parseBinding(binding), `${preset.id}: ${id} -> ${binding}`).not.toBeNull();
        expect(actionDef(id), `${preset.id}: ${id}`).not.toBeUndefined();
      }
    }
  });
});

describe("PRESET_TMUX（design「tmux 風プリセットの対応表」。research F10）", () => {
  it("tmux の DEFAULT KEY BINDINGS に倣う 14 組", () => {
    expect(PRESET_TMUX).toEqual([
      ["split_vertical", "prefix+%"],
      ["split_horizontal", 'prefix+"'],
      ["focus_pane_left", "prefix+left"],
      ["focus_pane_down", "prefix+down"],
      ["focus_pane_up", "prefix+up"],
      ["focus_pane_right", "prefix+right"],
      ["close_pane", "prefix+x"],
      ["new_tab", "prefix+c"],
      ["next_tab", "prefix+n"],
      ["previous_tab", "prefix+p"],
      ["rename_tab", "prefix+,"],
      ["close_tab", "prefix+&"],
      ["zoom", "prefix+z"],
      ["detach", "prefix+d"],
    ]);
  });

  it("全エントリが prefix の後のキー（tmux も同じ prefix ctrl+b を使う前提）", () => {
    for (const [id, binding] of PRESET_TMUX) {
      const b = parseBinding(binding);
      expect(b?.via, `${id}: ${binding}`).toBe("prefix");
    }
  });
});
