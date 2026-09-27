import { describe, expect, it } from "vitest";
import type { KeyInput } from "./actions.js";
import { applyRecommended, planReset, validateAssignment } from "./assign.js";
import { chordToKeyInput } from "./chord.js";
import {
  commandIdOf,
  commandKeyDefs,
  commandKeyId,
  isCommandKeyId,
  type CommandKeyDef,
} from "./commandKeys.js";
import {
  COMMAND_BINDINGS_MAX,
  emptyKeyPrefs,
  loadKeyPrefs,
  serializeKeyPrefs,
  withBindings,
  withoutBindings,
  type KeyPrefs,
} from "./keyPrefs.js";
import { resolveKeymap } from "./keymap.js";

/** 20260927-custom-command-keys（AC12・AC13）。 */
const CATALOG = commandKeyDefs([
  { id: "lazygit", type: "popup", description: "lazygit を開く", width: "80%" },
  { id: "build", type: "shell" },
]);

function prefs(commands: Record<string, string[]>, partial: Partial<KeyPrefs> = {}): KeyPrefs {
  return { ...emptyKeyPrefs(), ...partial, commands };
}

function press(chord: string): KeyInput {
  return chordToKeyInput(chord);
}

describe("commandKeys", () => {
  it("id と対象の id の往復・名前は説明か id・規則外や重複の id は捨てる", () => {
    expect(commandKeyId("git")).toBe("command:git");
    expect(isCommandKeyId("command:git")).toBe(true);
    expect(isCommandKeyId("split_vertical")).toBe(false);
    expect(commandIdOf("command:git")).toBe("git");
    expect(CATALOG).toEqual([
      { id: "command:lazygit", commandId: "lazygit", label: "lazygit を開く" },
      { id: "command:build", commandId: "build", label: "build" },
    ]);
    expect(
      commandKeyDefs([
        { id: "Bad", type: "shell" },
        { id: "a", type: "shell" },
        { id: "a", type: "pane" },
      ]).map((d) => d.commandId),
    ).toEqual(["a"]);
  });
});

describe("keyPrefs の独自コマンド（保存・読み込み）", () => {
  it("keys.commands に id ごとに保存し、読み直すと同じ。一覧が無くても（届く前でも）読み込む", () => {
    const p = withBindings(emptyKeyPrefs(), "command:lazygit", ["prefix+alt+g", "ctrl+alt+g"]);
    const saved = serializeKeyPrefs(p);
    expect(saved).toEqual({ commands: { lazygit: ["prefix+alt+g", "ctrl+alt+g"] } });
    expect(loadKeyPrefs(saved).commands).toEqual({ lazygit: ["prefix+alt+g", "ctrl+alt+g"] });
  });

  it("空にすると保存から消える（既定が無いので空＝無い）。withoutBindings でも消える", () => {
    const p = withBindings(emptyKeyPrefs(), "command:build", ["prefix+b"]);
    expect(withBindings(p, "command:build", []).commands).toEqual({});
    expect(withoutBindings(p, "command:build").commands).toEqual({});
    expect(serializeKeyPrefs(withBindings(p, "command:build", []))).toBeUndefined();
  });

  it("読み込みは値ごとに落とす：規則外の id・範囲・修飾の無い直接のキー・配列でない値", () => {
    const loaded = loadKeyPrefs({
      commands: {
        "Bad Id": ["prefix+x"],
        ok: ["prefix+1..9", "x", "prefix+o", 3],
        other: "prefix+z",
        empty: [],
      },
    });
    expect(loaded.commands).toEqual({ ok: ["prefix+o"] });
  });

  it("保存しておく数には上限がある", () => {
    const many: Record<string, string[]> = {};
    for (let i = 0; i < COMMAND_BINDINGS_MAX + 10; i++)
      many[`c${String(i).padStart(4, "0")}`] = ["prefix+x"];
    expect(Object.keys(loadKeyPrefs({ commands: many }).commands)).toHaveLength(
      COMMAND_BINDINGS_MAX,
    );
  });

  it("既存の操作の保存と並んで残る", () => {
    const p = withBindings(
      withBindings(emptyKeyPrefs(), "split_vertical", ["prefix+|"]),
      "command:build",
      ["ctrl+alt+b"],
    );
    expect(loadKeyPrefs(serializeKeyPrefs(p))).toEqual(p);
  });
});

describe("resolveKeymap の独自コマンド（AC13）", () => {
  it("一覧にあるコマンドの割り当てを runCommand として表に載せ、名前と割り当てを引ける", () => {
    const { keymap } = resolveKeymap(
      prefs({ lazygit: ["prefix+alt+g"], build: ["ctrl+alt+b"] }),
      CATALOG,
    );
    expect(keymap.prefixMap.get("alt+g")).toEqual({ type: "runCommand", commandId: "lazygit" });
    expect(keymap.directMap.get("ctrl+alt+b")).toEqual({ type: "runCommand", commandId: "build" });
    expect(keymap.bindingsOf("command:lazygit")).toEqual(["prefix+alt+g"]);
    expect(keymap.ownerOf("prefix", "alt+g")).toBe("command:lazygit");
    expect(keymap.labelOf("command:lazygit")).toBe("lazygit を開く");
    expect(keymap.labelOf("split_vertical")).not.toBe("split_vertical");
    expect(keymap.hintFor("command:build")).toBe("ctrl+alt+b");
    expect(keymap.commands).toBe(CATALOG);
  });

  it("一覧に無いコマンドの割り当ては載らず、他の操作を塞がない（保存は残る）", () => {
    const p = prefs({ gone: ["prefix+c"] });
    const { keymap } = resolveKeymap(p, CATALOG);
    expect(keymap.bindingsOf("command:gone")).toEqual([]);
    expect(keymap.prefixMap.get("c")).toEqual({ type: "newTab" }); // 既定の new_tab のまま
    expect(p.commands).toEqual({ gone: ["prefix+c"] });
    // 一覧に戻れば効く（既定に勝つ）
    const back = resolveKeymap(p, [
      ...CATALOG,
      { id: "command:gone", commandId: "gone", label: "gone" },
    ]).keymap;
    expect(back.prefixMap.get("c")).toEqual({ type: "runCommand", commandId: "gone" });
    expect(back.bindingsOf("new_tab")).toEqual([]);
  });

  it("利用者が上書きした操作とぶつかれば、操作が勝ち（先に登録）、コマンドの分は落として理由を残す", () => {
    const { keymap, problems } = resolveKeymap(
      prefs({ build: ["prefix+v"] }, { bindings: { zoom: ["prefix+v"] } }),
      CATALOG,
    );
    expect(keymap.prefixMap.get("v")).toEqual({ type: "zoom" });
    expect(problems.some((m) => m.startsWith("command:build:"))).toBe(true);
  });

  it("予約・prefix と同じキーは載せない", () => {
    const { keymap } = resolveKeymap(
      prefs({ build: ["prefix+esc", "ctrl+b", "prefix+enter"] }),
      CATALOG,
    );
    expect(keymap.bindingsOf("command:build")).toEqual([]);
  });
});

describe("点検で足した場面（T7 の独立点検）", () => {
  it("constructor という id のコマンドでも、割り当てが無ければ表を作れる（継いだ性質を割り当てと取り違えない）", () => {
    const defs = commandKeyDefs([
      { id: "constructor", type: "shell" },
      { id: "tostring", type: "shell" },
    ]);
    const { keymap } = resolveKeymap(emptyKeyPrefs(), defs);
    expect(keymap.bindingsOf("command:constructor")).toEqual([]);
    expect(withoutBindings(emptyKeyPrefs(), "command:constructor")).toEqual(emptyKeyPrefs());
    const p = withBindings(emptyKeyPrefs(), "command:constructor", ["prefix+alt+c"]);
    expect(resolveKeymap(p, defs).keymap.prefixMap.get("alt+c")).toEqual({
      type: "runCommand",
      commandId: "constructor",
    });
  });

  it("保存しておく数の上限は足すときも効く（既にあるものの差し替え・削除は通す）", () => {
    let p = emptyKeyPrefs();
    for (let i = 0; i < COMMAND_BINDINGS_MAX; i++)
      p = withBindings(p, `command:c${i}`, ["prefix+x"]);
    expect(Object.keys(p.commands)).toHaveLength(COMMAND_BINDINGS_MAX);
    expect(withBindings(p, "command:extra", ["prefix+y"])).toBe(p);
    expect(withBindings(p, "command:c0", ["prefix+y"]).commands["c0"]).toEqual(["prefix+y"]);
    expect(Object.keys(withBindings(p, "command:c0", []).commands)).toHaveLength(
      COMMAND_BINDINGS_MAX - 1,
    );
  });

  it("一覧に無いコマンドの名前は id のまま出す", () => {
    const { keymap } = resolveKeymap(emptyKeyPrefs(), CATALOG);
    expect(keymap.labelOf("command:gone")).toBe("command:gone");
  });
});

describe("取り込み・戻し（AC12）", () => {
  const km = resolveKeymap(prefs({ build: ["prefix+alt+b"] }), CATALOG).keymap;
  const cmds: CommandKeyDef[] = [...CATALOG];

  it("独自コマンドへの取り込みは範囲でない操作と同じ規則で、既存の操作との衝突を名前つきで断り「こちらへ移す」を出せる", () => {
    expect(
      validateAssignment(
        km,
        { kind: "binding", id: "command:lazygit", via: "prefix" },
        press("alt+g"),
      ),
    ).toEqual({ ok: true, binding: "prefix+alt+g" });
    const clash = validateAssignment(
      km,
      { kind: "binding", id: "command:lazygit", via: "prefix" },
      press("c"),
    );
    expect(clash).toMatchObject({
      ok: false,
      conflict: { ownerId: "new_tab", via: "prefix", chord: "c" },
    });
    // 数字のキーは範囲にならない
    expect(
      validateAssignment(
        km,
        { kind: "binding", id: "command:lazygit", via: "prefix" },
        press("alt+5"),
      ),
    ).toEqual({ ok: true, binding: "prefix+alt+5" });
    // 操作への取り込みでも、コマンドの持っているキーは衝突として名前（説明か id）つきで断る
    const r = validateAssignment(
      km,
      { kind: "binding", id: "zoom", via: "prefix" },
      press("alt+b"),
    );
    expect(r).toMatchObject({ ok: false, conflict: { ownerId: "command:build" } });
    expect(r.ok ? "" : r.reason).toContain("「build」");
  });

  it("コマンドの戻しは割り当てを外すだけ（既定は無い）。作り直した表もコマンドの一覧を引き継ぐ", () => {
    const plan = planReset(km, prefs({ build: ["prefix+alt+b"] }), {
      kind: "action",
      id: "command:build",
    });
    expect(plan).toEqual({ ok: true, prefs: prefs({}), skipped: [] });
  });

  it("プリセットを足すとき、コマンドが持っているキーは足さない（1 つ足した後に作り直した表でも見える）", () => {
    // ctrl+alt+j はおすすめの 2 つ目（focus_pane_down）。1 つ目を足した後の作り直しでコマンドの一覧を落とすと、ここで重なりを見落とす。
    const withCmd = resolveKeymap(prefs({ build: ["ctrl+alt+j"] }), cmds).keymap;
    const r = applyRecommended(withCmd, prefs({ build: ["ctrl+alt+j"] }));
    expect(r.added).toContain("ctrl+alt+h");
    expect(r.skipped.map((s) => s.binding)).toContain("ctrl+alt+j");
    expect(r.prefs.bindings.focus_pane_down ?? []).not.toContain("ctrl+alt+j");
    expect(r.prefs.commands).toEqual({ build: ["ctrl+alt+j"] });
  });

  it("操作を既定へ戻すとき、既定のキーをコマンドが使っていれば戻さず、その名前を理由に出す", () => {
    const p = prefs({ build: ["prefix+v"] }, { bindings: { split_vertical: ["prefix+|"] } });
    const km2 = resolveKeymap(p, cmds).keymap;
    const plan = planReset(km2, p, { kind: "action", id: "split_vertical" });
    expect(plan.ok && plan.skipped).toEqual([
      { binding: "prefix+v", reason: "prefix+v は「build」が使っています" },
    ]);
  });
});
