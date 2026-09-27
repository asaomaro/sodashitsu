import { describe, expect, it } from "vitest";
import type { KeyInput } from "./actions.js";
import {
  applyRecommended,
  planNavigateReset,
  planReset,
  RECOMMENDED_DIRECT,
  validateAssignment,
  validateNavigateAssignment,
  type AssignResult,
  type AssignTarget,
  type NavigateAssignTarget,
} from "./assign.js";
import { emptyKeyPrefs, type KeyPrefs } from "./keyPrefs.js";
import { DEFAULT_KEYMAP, resolveKeymap } from "./keymap.js";
import { DEFAULT_NAVIGATE_KEYMAP, resolveNavigateKeymap } from "./navigateKeymap.js";

function key(partial: Partial<KeyInput> & { key: string }): KeyInput {
  return {
    code: "",
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    type: "keydown",
    composing: false,
    ...partial,
  };
}
function km(partial: Partial<KeyPrefs> = {}) {
  return resolveKeymap({ ...emptyKeyPrefs(), ...partial }).keymap;
}
const PREFIX: AssignTarget = { kind: "prefix" };
const after = (
  id: Extract<AssignTarget, { kind: "binding" }>["id"],
  replacing?: string,
): AssignTarget => ({ kind: "binding", id, via: "prefix", ...(replacing ? { replacing } : {}) });
const direct = (
  id: Extract<AssignTarget, { kind: "binding" }>["id"],
  replacing?: string,
): AssignTarget => ({ kind: "binding", id, via: "direct", ...(replacing ? { replacing } : {}) });

function reason(r: AssignResult): string {
  if (r.ok) throw new Error("通ってしまった: " + r.binding);
  return r.reason;
}

describe("validateAssignment — 待ち続けるもの（AC6 (d)・AC-I2）", () => {
  it("修飾キー単体は取り込まず、理由を出して待ち続ける", () => {
    for (const k of ["Shift", "Control", "Alt", "Meta", "AltGraph"]) {
      const r = validateAssignment(DEFAULT_KEYMAP, after("zoom"), key({ key: k }));
      expect(r).toMatchObject({ ok: false, ignore: true });
      expect(reason(r)).toContain("修飾キーだけでは");
    }
  });

  it("IME の変換中・押しっぱなしの繰り返し・keydown 以外は、黙って待ち続ける", () => {
    for (const partial of [{ composing: true }, { repeat: true }, { type: "keyup" as const }]) {
      expect(
        validateAssignment(DEFAULT_KEYMAP, after("zoom"), key({ key: "y", ...partial })),
      ).toEqual({ ok: false, ignore: true, reason: "" });
    }
  });
});

describe("validateAssignment — 引けないキー・AltGr（AC6 (e)）", () => {
  it("Dead・Unidentified は割り当てに使えない", () => {
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("zoom"), key({ key: "Dead" }))),
    ).toContain("使えません");
  });

  it("AltGr で合成された文字は拒否する（ドイツ語配列の AltGr+Q＝@）", () => {
    const r = validateAssignment(
      DEFAULT_KEYMAP,
      direct("zoom"),
      key({ key: "@", code: "KeyQ", ctrl: true, alt: true, altGraph: true }),
    );
    expect(reason(r)).toContain("AltGr");
  });

  it("AltGr の層が US のシフトの記号と同じ文字になる配列（フランス語 AltGr+3＝#）も拒否し、US 配列の ctrl+alt+shift+3（＝#）は通す", () => {
    const composed = validateAssignment(
      DEFAULT_KEYMAP,
      direct("zoom"),
      key({ key: "#", code: "Digit3", ctrl: true, alt: true, altGraph: true }),
    );
    expect(reason(composed)).toContain("AltGr");
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        direct("zoom"),
        key({ key: "#", code: "Digit3", ctrl: true, alt: true, shift: true, altGraph: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+alt+#" });
  });

  it("実物のキーボードの大文字（Ctrl+Alt+Shift+D は key＝D）も AltGraph が真で通す（おすすめ一式の ctrl+alt+shift+d が取り込める）", () => {
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        direct("zoom"),
        key({ key: "D", code: "KeyD", ctrl: true, alt: true, shift: true, altGraph: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+alt+shift+d" });
  });

  it("英数字・US 配列の記号は AltGraph が真でも通す（Firefox・Windows の Ctrl+Alt）", () => {
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        direct("zoom"),
        key({ key: "y", code: "KeyY", ctrl: true, alt: true, altGraph: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+alt+y" });
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        direct("zoom"),
        key({ key: "[", code: "BracketLeft", ctrl: true, alt: true, altGraph: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+alt+[" });
  });
});

describe("validateAssignment — prefix（AC3）", () => {
  it("端末へ送れる形は通る（ctrl+英字・alt+1 文字・F キー）", () => {
    expect(validateAssignment(DEFAULT_KEYMAP, PREFIX, key({ key: "a", ctrl: true }))).toEqual({
      ok: true,
      binding: "ctrl+a",
    });
    expect(validateAssignment(DEFAULT_KEYMAP, PREFIX, key({ key: "x", alt: true }))).toEqual({
      ok: true,
      binding: "alt+x",
    });
    expect(validateAssignment(DEFAULT_KEYMAP, PREFIX, key({ key: "F5" }))).toEqual({
      ok: true,
      binding: "f5",
    });
  });

  it("送れない形は拒否する（修飾なし・ctrl+shift・cmd・名前のあるキー＋修飾）", () => {
    for (const k of [
      key({ key: "a" }),
      key({ key: "A", ctrl: true, shift: true }),
      key({ key: "b", meta: true }),
      key({ key: "Tab", ctrl: true }),
      key({ key: "Escape" }),
    ]) {
      expect(reason(validateAssignment(DEFAULT_KEYMAP, PREFIX, k))).toContain("prefix には");
    }
  });

  it("いまの prefix と同じキーは通る（何も変わらない）", () => {
    expect(validateAssignment(DEFAULT_KEYMAP, PREFIX, key({ key: "b", ctrl: true }))).toEqual({
      ok: true,
      binding: "ctrl+b",
    });
  });

  it("(b)(g) prefix の側から：すでに prefix の後・直接のキーに使われているキーは prefix にできない（持ち主の名前を出す）", () => {
    const m = km({ bindings: { zoom: ["prefix+ctrl+x"], goto: ["prefix+g", "ctrl+g"] } });
    expect(reason(validateAssignment(m, PREFIX, key({ key: "x", ctrl: true })))).toContain(
      "拡大表示",
    );
    expect(reason(validateAssignment(m, PREFIX, key({ key: "x", ctrl: true })))).toContain(
      "prefix の後のキー",
    );
    expect(reason(validateAssignment(m, PREFIX, key({ key: "g", ctrl: true })))).toContain("goto");
    expect(reason(validateAssignment(m, PREFIX, key({ key: "g", ctrl: true })))).toContain(
      "直接のキー",
    );
  });
});

describe("validateAssignment — prefix の後のキー（AC4・AC6 (a)(b)(c)）", () => {
  it("空いているキーは通り、正規形の割り当てになる", () => {
    expect(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "y" }))).toEqual({
      ok: true,
      binding: "prefix+y",
    });
    expect(
      validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "Y", shift: true })),
    ).toEqual({ ok: true, binding: "prefix+shift+y" });
    expect(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "F6" }))).toEqual({
      ok: true,
      binding: "prefix+f6",
    });
    expect(
      validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "y", ctrl: true })),
    ).toEqual({ ok: true, binding: "prefix+ctrl+y" });
  });

  it("(a) すでに別の操作が使っているキーは拒否し、その操作の名前を示す", () => {
    const r = validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "v" }));
    expect(reason(r)).toContain("prefix+v");
    expect(reason(r)).toContain("右へ分割");
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "Tab", shift: true }))),
    ).toContain("前の pane へ巡回");
  });

  it("(a) の衝突は conflict を持つ（20260922-keybinding-usability。design「US2」）", () => {
    const r = validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "v" }));
    expect(r).toMatchObject({
      ok: false,
      conflict: { ownerId: "split_vertical", via: "prefix", chord: "v" },
    });
  });

  it("範囲の操作（switch_tab）の一部と衝突したときは conflict を付けない（単一の chord として特定できない。AC7）", () => {
    const r = validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "5" }));
    expect(reason(r)).toContain("tab を切り替え");
    expect((r as { conflict?: unknown }).conflict).toBeUndefined();
  });

  it("(b) prefix と同じキー・(c) Esc は拒否する", () => {
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "b", ctrl: true }))),
    ).toContain("prefix（ctrl+b）");
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "Escape" }))),
    ).toContain("Esc");
  });

  it("(c) prefix の後の ctrl+shift+v も拒否する（貼り付けがルーターより先に取るので、割り当てても効かない）", () => {
    expect(
      reason(
        validateAssignment(
          DEFAULT_KEYMAP,
          after("goto"),
          key({ key: "V", ctrl: true, shift: true }),
        ),
      ),
    ).toContain("貼り付け");
  });

  it("(c) prefix の後の Enter・Space・↓ も拒否する（pane の枠のメニューが先に取るので、割り当てても効かない。20260925-pane-frame-focus-keys）", () => {
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "Enter" }))),
    ).toContain("pane の枠のメニュー");
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: " " }))),
    ).toContain("pane の枠のメニュー");
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "ArrowDown" }))),
    ).toContain("pane の枠のメニュー");
  });

  it("(c) prefix の後の Shift+Enter・Shift+Space・Shift+↓ も拒否する（PaneFrame.vue の onKeydown は ctrl/alt/meta だけを見て shift は見ないので、shift 付きも枠に止められる。review 指摘）", () => {
    expect(
      reason(
        validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "Enter", shift: true })),
      ),
    ).toContain("pane の枠のメニュー");
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: " ", shift: true }))),
    ).toContain("pane の枠のメニュー");
    expect(
      reason(
        validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "ArrowDown", shift: true })),
      ),
    ).toContain("pane の枠のメニュー");
  });

  it("(c) prefix の後の Shift+F10 も拒否する（PaneFrame.vue の F10 条件は shift 付きのときだけ発火し、その判定も shift を見ないので同じ穴。shift+f10 は F_KEY として chord 化できるので予約が要る。T1 round2 taskcheck 指摘）", () => {
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "F10", shift: true }))),
    ).toContain("pane の枠のメニュー");
  });

  it("e は edit_scrollback が既定で使っているので、別の操作への割り当ては拒否する（20260926-edit-scrollback で「後続」の案内から昇格）", () => {
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "e" }))),
    ).toContain("スクロールバックをエディタで開く");
  });

  it("shift+r は reload_config が既定で使っているので、別の操作への割り当ては拒否する", () => {
    expect(
      reason(
        validateAssignment(DEFAULT_KEYMAP, after("goto"), key({ key: "R", shift: true })),
      ),
    ).toContain("設定を読み直す");
  });
});

describe("validateAssignment — 直接のキー（AC5・AC6 (d)(f)(g)）", () => {
  it("ctrl・alt・cmd を含む chord と F キーは通る", () => {
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        direct("split_vertical"),
        key({ key: "d", ctrl: true, alt: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+alt+d" });
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        direct("split_horizontal"),
        key({ key: "D", ctrl: true, alt: true, shift: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+alt+shift+d" });
    expect(validateAssignment(DEFAULT_KEYMAP, direct("zoom"), key({ key: "F5" }))).toEqual({
      ok: true,
      binding: "f5",
    });
    expect(
      validateAssignment(DEFAULT_KEYMAP, direct("zoom"), key({ key: "k", meta: true })),
    ).toEqual({ ok: true, binding: "cmd+k" });
  });

  it("(d) 修飾キーの無い文字・shift だけの文字・名前のあるキーは拒否する", () => {
    for (const k of [
      key({ key: "y" }),
      key({ key: "Y", shift: true }),
      key({ key: "?", shift: true }),
      key({ key: "Tab" }),
      key({ key: "Enter" }),
      key({ key: "ArrowLeft" }),
      key({ key: " " }),
      key({ key: "Escape" }),
    ]) {
      expect(reason(validateAssignment(DEFAULT_KEYMAP, direct("zoom"), k)), k.key).toContain(
        "直接のキーにできません",
      );
    }
  });

  it("(f) ctrl+shift+v は貼り付けに使うので拒否する", () => {
    expect(
      reason(
        validateAssignment(
          DEFAULT_KEYMAP,
          direct("zoom"),
          key({ key: "V", ctrl: true, shift: true }),
        ),
      ),
    ).toContain("貼り付け");
  });

  it("(f) Shift+F10 は pane の枠のメニューを開くキーとして使うので拒否する（isDirectChord は F キーを shift 付きでも direct として通すため、RESERVED_DIRECT 側にも同じ穴がある。ctrl+shift+v と理由が違うので、固定の『貼り付け』文言ではなく個別の理由を返す。T1 round2 taskcheck 指摘）", () => {
    const r = reason(
      validateAssignment(DEFAULT_KEYMAP, direct("zoom"), key({ key: "F10", shift: true })),
    );
    expect(r).toContain("pane の枠のメニュー");
    expect(r).not.toContain("貼り付け"); // ctrl+shift+v 専用の固定文言に引きずられていないことの確認（review round2 指摘）
  });

  it("(g) prefix と同じキーは拒否する（prefix を変えるとその新しい prefix と比べる）", () => {
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, direct("zoom"), key({ key: "b", ctrl: true }))),
    ).toContain("prefix（ctrl+b）");
    expect(
      reason(
        validateAssignment(km({ prefix: "ctrl+a" }), direct("zoom"), key({ key: "a", ctrl: true })),
      ),
    ).toContain("prefix（ctrl+a）");
    expect(
      validateAssignment(km({ prefix: "ctrl+a" }), direct("zoom"), key({ key: "b", ctrl: true })),
    ).toEqual({ ok: true, binding: "ctrl+b" }); // 旧い prefix は空く
  });

  it("(a) すでに別の操作の直接のキーなら拒否し、名前を示す。prefix の後の同じキーとは別の表", () => {
    const m = km({ bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"] } });
    const r = validateAssignment(m, direct("zoom"), key({ key: "d", ctrl: true, alt: true }));
    expect(reason(r)).toContain("ctrl+alt+d");
    expect(reason(r)).toContain("右へ分割");
    // 「prefix の後の ctrl+alt+d」は別の表なので通る
    expect(validateAssignment(m, after("zoom"), key({ key: "d", ctrl: true, alt: true }))).toEqual({
      ok: true,
      binding: "prefix+ctrl+alt+d",
    });
  });
});

describe("validateAssignment — 置き換えと重複（AC4）", () => {
  it("［変更］：自分の割り当てを、空いているキーへ置き換えられる。同じキーへの置き換えは通る", () => {
    expect(
      validateAssignment(DEFAULT_KEYMAP, after("split_vertical", "prefix+v"), key({ key: "y" })),
    ).toEqual({ ok: true, binding: "prefix+y" });
    expect(
      validateAssignment(DEFAULT_KEYMAP, after("split_vertical", "prefix+v"), key({ key: "v" })),
    ).toEqual({ ok: true, binding: "prefix+v" });
  });

  it("［追加］：自分がすでに持っているキーは、重複として拒否する", () => {
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("split_vertical"), key({ key: "v" }))),
    ).toContain("すでに割り当てられています");
  });

  it("［変更］でも、その操作が持つ別の割り当てとの重複は拒否する。他の操作のキーは（a）で拒否する", () => {
    const m = km({ bindings: { split_vertical: ["prefix+v", "prefix+y"] } });
    expect(
      reason(validateAssignment(m, after("split_vertical", "prefix+v"), key({ key: "y" }))),
    ).toContain("すでに割り当てられています");
    expect(
      reason(validateAssignment(m, after("split_vertical", "prefix+v"), key({ key: "z" }))),
    ).toContain("拡大表示");
  });

  it("置き換えの相手が prefix の後なら、直接のキーの同じ chord は置き換えの対象ではない", () => {
    const m = km({ bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"] } });
    expect(
      reason(
        validateAssignment(
          m,
          direct("split_vertical", "prefix+v"),
          key({ key: "d", ctrl: true, alt: true }),
        ),
      ),
    ).toContain("すでに割り当てられています");
  });
});

describe("validateAssignment — 範囲 1..9（AC7）", () => {
  it("数字のキー 1 つで、その修飾の組の範囲になる（prefix の後は修飾なしでもよい）", () => {
    expect(
      validateAssignment(
        km({ bindings: { switch_tab: [] } }),
        after("switch_tab"),
        key({ key: "3" }),
      ),
    ).toEqual({ ok: true, binding: "prefix+1..9" });
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        after("switch_tab", "prefix+1..9"),
        key({ key: "5", alt: true }),
      ),
    ).toEqual({ ok: true, binding: "prefix+alt+1..9" });
    expect(
      validateAssignment(
        DEFAULT_KEYMAP,
        direct("switch_tab"),
        key({ key: "2", ctrl: true, alt: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+alt+1..9" });
  });

  it("数字以外は拒否・修飾のない直接は拒否・shift を伴う数字は拒否（配列で別の記号になる）", () => {
    expect(
      reason(
        validateAssignment(
          DEFAULT_KEYMAP,
          after("switch_tab", "prefix+1..9"),
          key({ key: "a", alt: true }),
        ),
      ),
    ).toContain("数字");
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, direct("switch_tab"), key({ key: "3" }))),
    ).toContain("直接のキーにできません");
    expect(
      reason(
        validateAssignment(
          DEFAULT_KEYMAP,
          after("switch_tab", "prefix+1..9"),
          key({ key: "1", alt: true, shift: true }),
        ),
      ),
    ).toContain("shift");
    expect(
      reason(
        validateAssignment(
          DEFAULT_KEYMAP,
          after("switch_tab", "prefix+1..9"),
          key({ key: "!", alt: true, shift: true }),
        ),
      ),
    ).toContain("数字");
    expect(
      reason(
        validateAssignment(DEFAULT_KEYMAP, after("switch_tab", "prefix+1..9"), key({ key: "0" })),
      ),
    ).toContain("数字");
  });

  it("範囲の 9 個のどれかを別の操作が使っていれば拒否する（持ち主の名前を出す）", () => {
    const m = km({ bindings: { close_tab: ["prefix+alt+5"], switch_tab: [] } });
    const r = validateAssignment(m, after("switch_tab"), key({ key: "1", alt: true }));
    expect(reason(r)).toContain("prefix+alt+5");
    expect(reason(r)).toContain("tab を閉じる");
  });

  it("範囲を範囲へ置き換えるとき、自分の旧い範囲の chord は空いているものとして扱う", () => {
    // prefix+1..9（既定）を prefix+1..9 のまま置き換える（自分の 9 個と重なる）
    expect(
      validateAssignment(DEFAULT_KEYMAP, after("switch_tab", "prefix+1..9"), key({ key: "1" })),
    ).toEqual({ ok: true, binding: "prefix+1..9" });
    // 置き換えでない追加は、自分の 9 個と重なるので重複
    expect(
      reason(validateAssignment(DEFAULT_KEYMAP, after("switch_tab"), key({ key: "1" }))),
    ).toContain("すでに");
  });

  it("範囲の 9 個のどれかが prefix と同じなら拒否する（prefix を数字にはできないが、alt+1 等を prefix にした場合）", () => {
    expect(
      reason(
        validateAssignment(
          km({ prefix: "alt+3" }),
          after("switch_tab", "prefix+1..9"),
          key({ key: "1", alt: true }),
        ),
      ),
    ).toContain("prefix（alt+3）");
  });

  it("範囲でない操作に数字は普通の文字として扱う", () => {
    expect(validateAssignment(DEFAULT_KEYMAP, after("zoom"), key({ key: "0" }))).toEqual({
      ok: true,
      binding: "prefix+0",
    });
    expect(reason(validateAssignment(DEFAULT_KEYMAP, after("zoom"), key({ key: "1" })))).toContain(
      "tab を切り替え",
    );
  });
});

describe("planReset — 既定へ戻す（AC9）", () => {
  it("すべて：keys を消す（AC2 の状態と同じ）", () => {
    const prefs: KeyPrefs = {
      prefix: "ctrl+a",
      bindings: { zoom: ["prefix+y"], help: [] },
      navigateKeys: {},
      commands: {},
    };
    const r = planReset(resolveKeymap(prefs).keymap, prefs, { kind: "all" });
    expect(r).toEqual({ ok: true, prefs: emptyKeyPrefs(), skipped: [] });
    if (!r.ok) return;
    // 戻した結果の表が、何も上書きしていない既定の表（旧表との 1:1 は keymap.test.ts が守る）と同じ
    const restored = resolveKeymap(r.prefs).keymap;
    expect(restored.prefix).toBe(DEFAULT_KEYMAP.prefix);
    expect(restored.prefixMap).toEqual(DEFAULT_KEYMAP.prefixMap);
    expect(restored.directMap).toEqual(DEFAULT_KEYMAP.directMap);
  });

  it("操作ごと：その操作の上書きだけを消し、既定のキーが戻る", () => {
    const prefs: KeyPrefs = {
      prefix: null,
      bindings: { zoom: ["prefix+y"], help: ["prefix+shift+h"] },
      navigateKeys: {},
      commands: {},
    };
    const r = planReset(resolveKeymap(prefs).keymap, prefs, { kind: "action", id: "zoom" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.prefs.bindings).toEqual({ help: ["prefix+shift+h"] });
    expect(r.skipped).toEqual([]);
    expect(resolveKeymap(r.prefs).keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
  });

  it("操作ごと：既定のキーを別の操作が使っていれば、その分は戻さず、持ち主の名前を返す", () => {
    const prefs: KeyPrefs = {
      prefix: null,
      bindings: { zoom: ["prefix+y"], goto: ["prefix+z"] },
      navigateKeys: {},
      commands: {},
    };
    const r = planReset(resolveKeymap(prefs).keymap, prefs, { kind: "action", id: "zoom" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.binding).toBe("prefix+z");
    expect(r.skipped[0]!.reason).toContain("goto");
    expect(resolveKeymap(r.prefs).keymap.bindingsOf("zoom")).toEqual([]);
  });

  it("操作ごと：上書きが無い操作は何も変えない", () => {
    const prefs: KeyPrefs = { prefix: null, bindings: { help: [] }, navigateKeys: {}, commands: {} };
    const r = planReset(resolveKeymap(prefs).keymap, prefs, { kind: "action", id: "zoom" });
    expect(r).toEqual({ ok: true, prefs, skipped: [] });
  });

  it("範囲の操作：既定の範囲（prefix+1..9）の一部を別の操作が使っていれば戻さない", () => {
    const prefs: KeyPrefs = {
      prefix: null,
      bindings: { switch_tab: ["prefix+alt+1..9"], zoom: ["prefix+3"] },
      navigateKeys: {},
      commands: {},
    };
    const r = planReset(resolveKeymap(prefs).keymap, prefs, { kind: "action", id: "switch_tab" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toEqual([
      { binding: "prefix+1..9", reason: expect.stringContaining("拡大表示") },
    ]);
  });

  it("prefix：既定へ戻す。既定の ctrl+b がすでに直接のキー・prefix の後のキーに使われていれば拒否する", () => {
    const prefs: KeyPrefs = { prefix: "ctrl+a", bindings: {}, navigateKeys: {}, commands: {} };
    const ok = planReset(resolveKeymap(prefs).keymap, prefs, { kind: "prefix" });
    expect(ok).toEqual({
      ok: true,
      prefs: { prefix: null, bindings: {}, navigateKeys: {}, commands: {} },
      skipped: [],
    });

    // 直接のキー側
    const busy: KeyPrefs = {
      prefix: "ctrl+a",
      bindings: { goto: ["prefix+g", "ctrl+b"] },
      navigateKeys: {},
      commands: {},
    };
    const r = planReset(resolveKeymap(busy).keymap, busy, { kind: "prefix" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain("goto");
    expect(r.reason).toContain("直接のキー");
    // prefix の後のキー側
    const busy2: KeyPrefs = {
      prefix: "ctrl+a",
      bindings: { goto: ["prefix+ctrl+b"] },
      navigateKeys: {},
      commands: {},
    };
    const r2 = planReset(resolveKeymap(busy2).keymap, busy2, { kind: "prefix" });
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.reason).toContain("goto");
    expect(r2.reason).toContain("prefix の後のキー");
  });
});

describe("applyRecommended — herdr のおすすめの直接のキー（AC10）", () => {
  it("一式は 10 組（操作と chord）。herdr の文書（keyboard.mdx「Going prefix-free」）の ctrl+alt の一式と同じ", () => {
    expect(RECOMMENDED_DIRECT).toEqual([
      ["focus_pane_left", "ctrl+alt+h"],
      ["focus_pane_down", "ctrl+alt+j"],
      ["focus_pane_up", "ctrl+alt+k"],
      ["focus_pane_right", "ctrl+alt+l"],
      ["previous_tab", "ctrl+alt+["],
      ["next_tab", "ctrl+alt+]"],
      ["new_tab", "ctrl+alt+c"],
      ["split_vertical", "ctrl+alt+d"],
      ["split_horizontal", "ctrl+alt+shift+d"],
      ["zoom", "ctrl+alt+z"],
    ]);
  });

  it("各操作に足す。prefix の後のキーは残る（10 個すべての操作で確かめる）", () => {
    const r = applyRecommended(DEFAULT_KEYMAP, emptyKeyPrefs());
    expect(r.added).toHaveLength(10);
    expect(r.already).toEqual([]);
    expect(r.skipped).toEqual([]);
    const km2 = resolveKeymap(r.prefs).keymap;
    for (const [id, chord] of RECOMMENDED_DIRECT) {
      const list = km2.bindingsOf(id);
      expect(list, id).toContain(chord);
      expect(list[0], id).toMatch(/^prefix\+/); // prefix の後のキーが先頭に残る
      expect(km2.ownerOf("direct", chord), chord).toBe(id);
    }
    expect(km2.bindingsOf("focus_pane_left")).toEqual(["prefix+h", "ctrl+alt+h"]);
    expect(km2.bindingsOf("split_horizontal")).toEqual(["prefix+-", "ctrl+alt+shift+d"]);
    expect(km2.directMap.size).toBe(11); // 推奨の 10 個＋既定の ctrl+v（remote_image_paste）
    expect(km2.directMap.get("ctrl+alt+shift+d")).toEqual({ type: "split", dir: "down" });
    expect(km2.prefixMap.get("h")).toEqual({ type: "focusDir", dir: "left" });
  });

  it("冪等：もう一度足しても何も変わらない", () => {
    const first = applyRecommended(DEFAULT_KEYMAP, emptyKeyPrefs());
    const second = applyRecommended(resolveKeymap(first.prefs).keymap, first.prefs);
    expect(second.added).toEqual([]);
    expect(second.already).toHaveLength(10);
    expect(second.prefs).toEqual(first.prefs);
  });

  it("別の操作が使っているキー・prefix と同じキーは足さず、理由を返す。残りは足す", () => {
    const prefs: KeyPrefs = {
      prefix: "ctrl+alt+d",
      bindings: { help: ["prefix+?", "ctrl+alt+z"] },
      navigateKeys: {},
      commands: {},
    };
    const r = applyRecommended(resolveKeymap(prefs).keymap, prefs);
    expect(r.added).toHaveLength(8);
    expect(r.skipped.map((s) => s.binding).sort()).toEqual(["ctrl+alt+d", "ctrl+alt+z"]);
    expect(r.skipped.find((s) => s.binding === "ctrl+alt+z")!.reason).toContain("キー一覧");
    expect(r.skipped.find((s) => s.binding === "ctrl+alt+d")!.reason).toContain("prefix");
  });

  it("上書き済みの操作には、上書きの後ろに足す", () => {
    const prefs: KeyPrefs = {
      prefix: null,
      bindings: { split_vertical: ["prefix+|"] },
      navigateKeys: {},
      commands: {},
    };
    const r = applyRecommended(resolveKeymap(prefs).keymap, prefs);
    expect(resolveKeymap(r.prefs).keymap.bindingsOf("split_vertical")).toEqual([
      "prefix+|",
      "ctrl+alt+d",
    ]);
  });
});

describe("applyRecommended — 一式の中の重なり（足すたびに表を作り直す）", () => {
  it("一式の中で同じ chord を別の操作へ足そうとすると、後の方は足さず、先の持ち主の名前を返す", () => {
    const set = [
      ["zoom", "ctrl+alt+y"],
      ["goto", "ctrl+alt+y"],
    ] as const;
    const r = applyRecommended(DEFAULT_KEYMAP, emptyKeyPrefs(), set);
    expect(r.added).toEqual(["ctrl+alt+y"]);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!).toMatchObject({ id: "goto", binding: "ctrl+alt+y" });
    expect(r.skipped[0]!.reason).toContain("拡大表示");
    expect(resolveKeymap(r.prefs).keymap.bindingsOf("goto")).toEqual(["prefix+g"]);
  });
});

describe("applyRecommended — 一般化（20260922-keybinding-presets。design「`assign.ts` の一般化」）", () => {
  it("`prefix+…` のエントリ（tmux 風プリセット相当）も、prefix の後のキーとして正しく足す", () => {
    const set = [["split_vertical", "prefix+%"]] as const;
    const r = applyRecommended(DEFAULT_KEYMAP, emptyKeyPrefs(), set);
    expect(r.added).toEqual(["prefix+%"]);
    expect(r.skipped).toEqual([]);
    const km2 = resolveKeymap(r.prefs).keymap;
    expect(km2.bindingsOf("split_vertical")).toEqual(["prefix+v", "prefix+%"]);
    expect(km2.ownerOf("prefix", "%")).toBe("split_vertical");
  });

  it("読めない割り当て文字列は、その 1 件だけ skipped にし、他のエントリは通常どおり処理する", () => {
    const set = [
      ["zoom", ""],
      ["goto", "ctrl+alt+y"],
    ] as const;
    const r = applyRecommended(DEFAULT_KEYMAP, emptyKeyPrefs(), set);
    expect(r.added).toEqual(["ctrl+alt+y"]);
    expect(r.skipped).toEqual([{ id: "zoom", binding: "", reason: "読めない割り当てです。" }]);
    expect(resolveKeymap(r.prefs).keymap.bindingsOf("goto")).toEqual(["prefix+g", "ctrl+alt+y"]);
  });
});

describe("validateAssignment が通れば、その割り当ては resolveKeymap でも落ちない（取り込みと読み込みで規則が食い違わない）", () => {
  const candidates: KeyInput[] = [
    key({ key: "y" }),
    key({ key: "Y", shift: true }),
    key({ key: "?", shift: true }),
    key({ key: "Escape" }),
    key({ key: "Tab" }),
    key({ key: "Tab", shift: true }),
    key({ key: "Enter" }),
    key({ key: "ArrowLeft" }),
    key({ key: " " }),
    key({ key: "F5" }),
    key({ key: "F12", shift: true }),
    key({ key: "1" }),
    key({ key: "5", alt: true }),
    key({ key: "5", ctrl: true, alt: true }),
    key({ key: "b", ctrl: true }),
    key({ key: "a", ctrl: true }),
    key({ key: "x", alt: true }),
    key({ key: "d", ctrl: true, alt: true }),
    key({ key: "D", ctrl: true, alt: true, shift: true }),
    key({ key: "V", ctrl: true, shift: true }),
    key({ key: "v", ctrl: true }),
    key({ key: "[", ctrl: true, alt: true }),
    key({ key: "k", meta: true }),
    key({ key: "+", ctrl: true }),
  ];
  const targets: AssignTarget[] = [
    PREFIX,
    after("zoom"),
    direct("zoom"),
    after("switch_tab", "prefix+1..9"),
    direct("switch_tab"),
  ];

  it("すべての組み合わせで、通った結果を適用して解決すると problems が空で、その割り当てが有効になる", () => {
    let checked = 0;
    for (const target of targets) {
      for (const k of candidates) {
        const r = validateAssignment(DEFAULT_KEYMAP, target, k);
        if (!r.ok) continue;
        checked++;
        const label = `${JSON.stringify(target)} ← ${k.key}`;
        if (target.kind === "prefix") {
          const { keymap, problems } = resolveKeymap({ ...emptyKeyPrefs(), prefix: r.binding });
          expect(problems, label).toEqual([]);
          expect(keymap.prefix, label).toBe(r.binding);
        } else {
          const base = target.replacing ? [] : [...DEFAULT_KEYMAP.bindingsOf(target.id)];
          const { keymap, problems } = resolveKeymap({
            ...emptyKeyPrefs(),
            bindings: { [target.id]: [...base, r.binding] },
          });
          expect(problems, label).toEqual([]);
          expect(keymap.bindingsOf(target.id), label).toContain(r.binding);
        }
      }
    }
    expect(checked).toBeGreaterThan(20); // 候補が空振りになっていない
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// navigate モードの6操作（20260923-navigate-mode-keys。design「取り込みの検証（keys/assign.ts）」）
// ---------------------------------------------------------------------------------------------------------------------

const navTarget = (id: NavigateAssignTarget["id"], replacing?: string): NavigateAssignTarget => ({
  kind: "navigateKey",
  id,
  ...(replacing ? { replacing } : {}),
});

describe("validateNavigateAssignment — 待ち続けるもの（AC-I2）", () => {
  it("修飾キー単体・IME・繰り返し・keydown 以外は待ち続ける", () => {
    for (const k of ["Shift", "Control"])
      expect(
        validateNavigateAssignment(DEFAULT_NAVIGATE_KEYMAP, navTarget("navigate_pane_left"), key({ key: k })),
      ).toMatchObject({ ok: false, ignore: true });
    for (const partial of [{ composing: true }, { repeat: true }, { type: "keyup" as const }])
      expect(
        validateNavigateAssignment(
          DEFAULT_NAVIGATE_KEYMAP,
          navTarget("navigate_pane_left"),
          key({ key: "y", ...partial }),
        ),
      ).toEqual({ ok: false, ignore: true, reason: "" });
  });
});

describe("validateNavigateAssignment — 引けないキー・AltGr", () => {
  it("Dead は使えない・AltGr で合成された文字は拒否する", () => {
    expect(
      reason(
        validateNavigateAssignment(DEFAULT_NAVIGATE_KEYMAP, navTarget("navigate_pane_left"), key({ key: "Dead" })),
      ),
    ).toContain("使えません");
    expect(
      reason(
        validateNavigateAssignment(
          DEFAULT_NAVIGATE_KEYMAP,
          navTarget("navigate_pane_left"),
          key({ key: "@", code: "KeyQ", ctrl: true, alt: true, altGraph: true }),
        ),
      ),
    ).toContain("AltGr");
  });
});

describe("validateNavigateAssignment — 予約キー（AC2）", () => {
  it("esc・enter・tab・shift+tab・left・right・修飾無し1〜9は拒否される", () => {
    for (const k of [
      { key: "Escape" },
      { key: "Enter" },
      { key: "Tab" },
      { key: "Tab", shift: true },
      { key: "ArrowLeft" },
      { key: "ArrowRight" },
      { key: "5" },
    ]) {
      const r = validateNavigateAssignment(DEFAULT_NAVIGATE_KEYMAP, navTarget("navigate_pane_left"), key(k));
      expect(reason(r), JSON.stringify(k)).toContain("予約");
    }
  });

  it("ctrl+shift+v も予約される（KeyInputController が router.handle より先に貼り付けとして横取りするため、割り当てても発火しない。60 review ラウンド1）", () => {
    const r = validateNavigateAssignment(
      DEFAULT_NAVIGATE_KEYMAP,
      navTarget("navigate_pane_left"),
      key({ key: "v", ctrl: true, shift: true }),
    );
    expect(reason(r)).toContain("予約");
  });

  it("修飾付きの数字・矢印は予約されていない（予約は修飾無しの chord だけ）", () => {
    expect(
      validateNavigateAssignment(
        DEFAULT_NAVIGATE_KEYMAP,
        navTarget("navigate_workspace_up"),
        key({ key: "5", ctrl: true }),
      ).ok,
    ).toBe(true);
    expect(
      validateNavigateAssignment(
        DEFAULT_NAVIGATE_KEYMAP,
        navTarget("navigate_pane_left"),
        key({ key: "ArrowLeft", ctrl: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+left" });
    expect(
      validateNavigateAssignment(
        DEFAULT_NAVIGATE_KEYMAP,
        navTarget("navigate_pane_right"),
        key({ key: "ArrowRight", alt: true }),
      ),
    ).toEqual({ ok: true, binding: "alt+right" });
  });
});

describe("validateNavigateAssignment — 衝突・置き換え（AC4）", () => {
  it("別の操作がすでに使っているキーは拒否され、conflict は付かない", () => {
    const r = validateNavigateAssignment(DEFAULT_NAVIGATE_KEYMAP, navTarget("navigate_pane_left"), key({ key: "j" }));
    expect(reason(r)).toContain("下へ選ぶ");
    expect((r as { conflict?: unknown }).conflict).toBeUndefined();
  });

  it("自分自身がすでに持っているキーは（置き換え対象でなければ）拒否される", () => {
    const r = validateNavigateAssignment(DEFAULT_NAVIGATE_KEYMAP, navTarget("navigate_pane_left"), key({ key: "h" }));
    expect(reason(r)).toContain("すでに割り当てられています");
  });

  it("置き換え対象と同じキーは通る（変更なしの確定）", () => {
    const r = validateNavigateAssignment(
      DEFAULT_NAVIGATE_KEYMAP,
      navTarget("navigate_pane_left", "h"),
      key({ key: "h" }),
    );
    expect(r).toEqual({ ok: true, binding: "h" });
  });

  it("空いているキーは通る（追加・変更どちらも）", () => {
    expect(
      validateNavigateAssignment(DEFAULT_NAVIGATE_KEYMAP, navTarget("navigate_pane_left"), key({ key: "x" })),
    ).toEqual({ ok: true, binding: "x" });
    expect(
      validateNavigateAssignment(
        DEFAULT_NAVIGATE_KEYMAP,
        navTarget("navigate_pane_left", "h"),
        key({ key: "x" }),
      ),
    ).toEqual({ ok: true, binding: "x" });
  });

  it("修飾付きのキーも通る（bare な単一文字に限らない）", () => {
    expect(
      validateNavigateAssignment(
        DEFAULT_NAVIGATE_KEYMAP,
        navTarget("navigate_pane_left"),
        key({ key: "h", ctrl: true }),
      ),
    ).toEqual({ ok: true, binding: "ctrl+h" });
  });
});

describe("planNavigateReset — 既定へ戻す（AC5）", () => {
  it("上書きを外し、既定のキーが戻る", () => {
    const { keymap } = resolveNavigateKeymap({ navigate_pane_left: ["ctrl+h"] });
    const prefs: KeyPrefs = { prefix: null, bindings: {}, navigateKeys: { navigate_pane_left: ["ctrl+h"] }, commands: {} };
    const r = planNavigateReset(keymap, prefs, { kind: "navigateKey", id: "navigate_pane_left" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.prefs.navigateKeys).toEqual({});
    expect(r.skipped).toEqual([]);
    expect(resolveNavigateKeymap(r.prefs.navigateKeys).keymap.bindingsOf("navigate_pane_left")).toEqual(["h"]);
  });

  it("既定のキーを別の navigate 操作が使っていれば、その分は戻さず持ち主の名前を返す", () => {
    const { keymap } = resolveNavigateKeymap({
      navigate_pane_left: ["ctrl+h"],
      navigate_pane_down: ["h"], // navigate_pane_left の既定 h を奪う
    });
    const prefs: KeyPrefs = {
      prefix: null,
      bindings: {},
      navigateKeys: { navigate_pane_left: ["ctrl+h"], navigate_pane_down: ["h"] },
      commands: {},
    };
    const r = planNavigateReset(keymap, prefs, { kind: "navigateKey", id: "navigate_pane_left" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]!.binding).toBe("h");
    expect(r.skipped[0]!.reason).toContain("下へ選ぶ");
    expect(resolveNavigateKeymap(r.prefs.navigateKeys).keymap.bindingsOf("navigate_pane_left")).toEqual([]);
  });

  it("上書きが無い操作は何も変えない", () => {
    const prefs: KeyPrefs = { prefix: null, bindings: {}, navigateKeys: {}, commands: {} };
    const r = planNavigateReset(DEFAULT_NAVIGATE_KEYMAP, prefs, { kind: "navigateKey", id: "navigate_pane_left" });
    expect(r).toEqual({ ok: true, prefs, skipped: [] });
  });
});
