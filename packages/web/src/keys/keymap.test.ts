import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import { emptyKeyPrefs, type KeyPrefs } from "./keyPrefs.js";
import { DEFAULT_KEYMAP, resolveKeymap } from "./keymap.js";

function prefs(partial: Partial<KeyPrefs>): KeyPrefs {
  return { ...emptyKeyPrefs(), ...partial };
}

/**
 * **旧 `DEFAULT_KEYMAP`（20260921-keybinding-customization より前）を固定したリテラル**。AC1・AC2 の主な守り——既定から解決した表がこれと 1:1 であること。
 * 旧表のキーは `comboKey` の形（`H`＝shift+h・`Tab`・`shift+Tab`）だったので、正規形（`shift+h`・`tab`・`shift+tab`）に直して書いてある。
 * 旧表を消した後でも比べる相手が残るよう、コードから作らず手で書く（T4）。
 */
const LEGACY_DEFAULT_PREFIX_MAP: ReadonlyArray<readonly [string, Action]> = [
  // pane
  ["v", { type: "split", dir: "right" }],
  ["-", { type: "split", dir: "down" }],
  ["h", { type: "focusDir", dir: "left" }],
  ["j", { type: "focusDir", dir: "down" }],
  ["k", { type: "focusDir", dir: "up" }],
  ["l", { type: "focusDir", dir: "right" }],
  ["shift+h", { type: "swap", dir: "left" }],
  ["shift+j", { type: "swap", dir: "down" }],
  ["shift+k", { type: "swap", dir: "up" }],
  ["shift+l", { type: "swap", dir: "right" }],
  ["tab", { type: "cyclePane", delta: 1 }],
  ["shift+tab", { type: "cyclePane", delta: -1 }],
  ["x", { type: "closePane" }],
  ["z", { type: "zoom" }],
  ["r", { type: "enterMode", mode: "resize" }],
  ["shift+p", { type: "renamePane" }],
  ["[", { type: "enterMode", mode: "copy" }],
  // tab
  ["c", { type: "newTab" }],
  ["n", { type: "tabDelta", delta: 1 }],
  ["p", { type: "tabDelta", delta: -1 }],
  ["1", { type: "tabIndex", index: 1 }],
  ["2", { type: "tabIndex", index: 2 }],
  ["3", { type: "tabIndex", index: 3 }],
  ["4", { type: "tabIndex", index: 4 }],
  ["5", { type: "tabIndex", index: 5 }],
  ["6", { type: "tabIndex", index: 6 }],
  ["7", { type: "tabIndex", index: 7 }],
  ["8", { type: "tabIndex", index: 8 }],
  ["9", { type: "tabIndex", index: 9 }],
  ["shift+t", { type: "renameTab" }],
  ["shift+x", { type: "closeTab" }],
  // workspace
  ["shift+n", { type: "newWorkspace" }],
  ["shift+w", { type: "renameWorkspace" }],
  ["shift+d", { type: "closeWorkspace" }],
  ["shift+g", { type: "newWorktree" }],
  // 設定・通知・モード
  ["s", { type: "settings" }],
  ["o", { type: "nextNotification" }],
  ["w", { type: "enterMode", mode: "navigate" }],
  // 共通
  ["?", { type: "help" }],
  ["g", { type: "goto" }],
  ["b", { type: "toggleSidebar" }],
  ["q", { type: "detach" }],
  // 20260922-appearance-settings-rest T7 で reload_config をカタログへ登録し、
  // 「後続」の案内から実物の操作へ昇格した（意図した既定の変更。keymap.ts の NOT_YET_BINDINGS 参照）。
  ["shift+r", { type: "reloadConfig" }],
  // 20260926-edit-scrollback で edit_scrollback をカタログへ登録し、「後続」の案内から実物の操作へ昇格した（意図した既定の変更）。
  ["e", { type: "editScrollback" }],
];

describe("既定の表は旧 DEFAULT_KEYMAP と 1:1（AC1・AC2）", () => {
  it("prefix の後のキーが 44 個、旧表を固定した値と完全に一致する", () => {
    expect(LEGACY_DEFAULT_PREFIX_MAP).toHaveLength(44);
    expect([...DEFAULT_KEYMAP.prefixMap.entries()].sort(([a], [b]) => a.localeCompare(b))).toEqual(
      [...LEGACY_DEFAULT_PREFIX_MAP]
        .map(([k, v]) => [k, v])
        .sort(([a], [b]) => (a as string).localeCompare(b as string)),
    );
  });

  it("prefix は ctrl+b・2 度押しは \\x02・直接のキーは ctrl+v（画像の貼り付け。20260927-clipboard-image-paste）だけ", () => {
    expect(DEFAULT_KEYMAP.prefix).toBe("ctrl+b");
    expect(DEFAULT_KEYMAP.prefixBytes).toBe("\x02");
    expect([...DEFAULT_KEYMAP.directMap]).toEqual([["ctrl+v", { type: "pasteImage" }]]);
    expect(DEFAULT_KEYMAP.ownerOf("direct", "ctrl+v")).toBe("remote_image_paste");
  });

  it("remote_image_paste を外す（[]）と ctrl+v は直接のキーから消える・別のキーにもできる", () => {
    const off = resolveKeymap({ ...emptyKeyPrefs(), bindings: { remote_image_paste: [] } }).keymap;
    expect(off.directMap.has("ctrl+v")).toBe(false);
    const moved = resolveKeymap({
      ...emptyKeyPrefs(),
      bindings: { remote_image_paste: ["ctrl+alt+v"] },
    }).keymap;
    expect(moved.directMap.has("ctrl+v")).toBe(false);
    expect(moved.directMap.get("ctrl+alt+v")).toEqual({ type: "pasteImage" });
  });

  it("操作ごとの有効な割り当て・持ち主・案内用の先頭", () => {
    const km = DEFAULT_KEYMAP;
    expect(km.bindingsOf("split_vertical")).toEqual(["prefix+v"]);
    expect(km.bindingsOf("split_horizontal")).toEqual(["prefix+-"]);
    expect(km.bindingsOf("switch_tab")).toEqual(["prefix+1..9"]);
    expect(km.bindingsOf("cycle_pane_previous")).toEqual(["prefix+shift+tab"]);
    expect(km.ownerOf("prefix", "v")).toBe("split_vertical");
    expect(km.ownerOf("prefix", "5")).toBe("switch_tab");
    // 20260922-appearance-settings-rest T7 で shift+r は reload_config の既定割り当てになった
    // （NOT_YET_BINDINGS の案内から昇格。keymap.ts 参照）。
    expect(km.ownerOf("prefix", "shift+r")).toBe("reload_config");
    expect(km.ownerOf("direct", "ctrl+alt+d")).toBeNull();
    expect(km.hintFor("help")).toBe("ctrl+b ?");
    expect(km.hintFor("settings")).toBe("ctrl+b s");
    expect(km.hintFor("switch_tab")).toBe("ctrl+b 1..9");
  });

  it("problems は空", () => {
    expect(resolveKeymap(emptyKeyPrefs()).problems).toEqual([]);
  });
});

describe("resolveKeymap — prefix（AC3）", () => {
  it("prefix を変えると、案内用の先頭・2 度押しの列も変わる", () => {
    const { keymap, problems } = resolveKeymap(prefs({ prefix: "ctrl+a" }));
    expect(problems).toEqual([]);
    expect(keymap.prefix).toBe("ctrl+a");
    expect(keymap.prefixBytes).toBe("\x01");
    expect(keymap.hintFor("help")).toBe("ctrl+a ?");
    expect(keymap.prefixMap.get("v")).toEqual({ type: "split", dir: "right" }); // prefix の後のキーは変わらない
  });

  it("端末へ送れない形の prefix（保存値の手書き）は既定へ戻して記録する", () => {
    const { keymap, problems } = resolveKeymap(prefs({ prefix: "cmd+b" }));
    expect(keymap.prefix).toBe("ctrl+b");
    expect(problems).toHaveLength(1);
  });

  it("prefix と同じキーは、prefix の後のキーにも直接のキーにもできない（両側から。AC6 の (b)・(g)）", () => {
    // prefix を ctrl+g にすると、goto の直接のキー ctrl+g が落ちる
    const a = resolveKeymap(
      prefs({ prefix: "ctrl+g", bindings: { goto: ["prefix+g", "ctrl+g"] } }),
    );
    expect(a.keymap.bindingsOf("goto")).toEqual(["prefix+g"]);
    expect(a.keymap.directMap.has("ctrl+g")).toBe(false);
    expect(a.problems.some((p) => p.includes("goto") && p.includes("ctrl+g"))).toBe(true);
    // prefix の後のキーが prefix 自身
    const b = resolveKeymap(
      prefs({ prefix: "alt+x", bindings: { zoom: ["prefix+alt+x", "prefix+z"] } }),
    );
    expect(b.keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
    expect(b.keymap.prefixMap.has("alt+x")).toBe(false);
  });
});

describe("resolveKeymap — 上書きと衝突（AC4・AC6・AC8。D7）", () => {
  it("上書きした操作の既定は消え、外したキーは黙って捨てられる（表に無い）", () => {
    const { keymap } = resolveKeymap(prefs({ bindings: { split_vertical: ["prefix+|"] } }));
    expect(keymap.prefixMap.get("|")).toEqual({ type: "split", dir: "right" });
    expect(keymap.prefixMap.has("v")).toBe(false);
    expect(keymap.bindingsOf("split_vertical")).toEqual(["prefix+|"]);
  });

  it("1 つの操作に複数持てる。直接のキーは directMap に入る（AC5）", () => {
    const { keymap } = resolveKeymap(
      prefs({
        bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"], zoom: ["ctrl+alt+z", "prefix+z"] },
      }),
    );
    expect(keymap.bindingsOf("split_vertical")).toEqual(["prefix+v", "ctrl+alt+d"]);
    expect(keymap.directMap.get("ctrl+alt+d")).toEqual({ type: "split", dir: "right" });
    expect(keymap.directMap.get("ctrl+alt+z")).toEqual({ type: "zoom" });
    expect(keymap.prefixMap.get("z")).toEqual({ type: "zoom" });
    expect(keymap.ownerOf("direct", "ctrl+alt+d")).toBe("split_vertical");
    expect(keymap.hintFor("zoom")).toBe("ctrl+alt+z"); // 先頭が直接のキーなら prefix を付けない
  });

  it("上書きが既定に勝つ：別の操作の既定のキーを取ると、その操作は割り当てを失う（黙って）", () => {
    const { keymap, problems } = resolveKeymap(prefs({ bindings: { goto: ["prefix+v"] } }));
    expect(keymap.prefixMap.get("v")).toEqual({ type: "goto" });
    expect(keymap.bindingsOf("split_vertical")).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("上書き同士の衝突は、カタログの順で先を残し、後を落として記録する。後が全部落ちたら既定へ戻る", () => {
    // カタログ順は help（先）→ goto（後）
    const { keymap, problems } = resolveKeymap(
      prefs({ bindings: { goto: ["prefix+H"], help: ["prefix+H"] } }),
    );
    expect(keymap.ownerOf("prefix", "shift+h")).toBe("help");
    expect(keymap.bindingsOf("goto")).toEqual(["prefix+g"]); // 上書きが全部落ちたので既定へ
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("goto");
  });

  it("上書きが全部落ちたら既定へ戻る（予約・読めない値でも同じ）。元から [] の操作は割り当てなしのまま", () => {
    for (const bad of [
      ["prefix+esc"],
      ["ctrl+shift+v"],
      ["prefix+ctrl+b"],
      ["prefix+meta+z"],
      ["esc"],
    ]) {
      const { keymap } = resolveKeymap(prefs({ bindings: { zoom: bad } }));
      expect(keymap.bindingsOf("zoom"), bad.join()).toEqual(["prefix+z"]);
    }
    expect(resolveKeymap(prefs({ bindings: { zoom: [] } })).keymap.bindingsOf("zoom")).toEqual([]);
  });

  it("既定へ戻す操作がカタログで前・上書きの操作が後ろでも、上書きが勝つ（既定への戻しは上書きの登録の後）", () => {
    // カタログ順は help（前）→ zoom（後）。help の上書きが全部落ち、既定の `?` へ戻そうとするが、zoom の上書きが `?` を持つ。
    const { keymap, problems } = resolveKeymap(
      prefs({ bindings: { help: ["prefix+esc"], zoom: ["prefix+?"] } }),
    );
    expect(keymap.ownerOf("prefix", "?")).toBe("zoom");
    expect(keymap.bindingsOf("zoom")).toEqual(["prefix+?"]);
    expect(keymap.bindingsOf("help")).toEqual([]);
    expect(problems).toHaveLength(1); // help の prefix+esc だけ
  });

  it("既定へ戻す先の既定が別の操作の上書きに取られていれば、割り当てなしのまま（黙って）", () => {
    const { keymap, problems } = resolveKeymap(
      prefs({ bindings: { zoom: ["prefix+esc"], goto: ["prefix+z"] } }),
    );
    expect(keymap.bindingsOf("zoom")).toEqual([]);
    expect(keymap.ownerOf("prefix", "z")).toBe("goto");
    expect(problems).toHaveLength(1); // zoom の prefix+esc だけ
  });

  it("範囲は範囲の操作でだけ・範囲の操作は範囲でだけ（手で作った KeyPrefs でも黙って誤登録しない）", () => {
    const a = resolveKeymap(prefs({ bindings: { zoom: ["prefix+alt+1..9", "prefix+z"] } }));
    expect(a.keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
    expect(a.keymap.prefixMap.has("alt+1")).toBe(false);
    expect(a.problems).toHaveLength(1);
    expect(a.problems[0]).toContain("範囲対応の操作にしか使えません"); // 範囲を範囲でない操作に与えた向き
    const b = resolveKeymap(
      prefs({ bindings: { switch_tab: ["prefix+alt+5", "prefix+alt+1..9"] } }),
    );
    expect(b.keymap.bindingsOf("switch_tab")).toEqual(["prefix+alt+1..9"]);
    expect(b.keymap.prefixMap.get("alt+5")).toEqual({ type: "tabIndex", index: 5 });
    expect(b.problems).toHaveLength(1);
    expect(b.problems[0]).toContain("範囲 1..9 の形だけ"); // 範囲の操作に単独キーを与えた向き
  });

  it("bindingsOf は正規形で返す（入力が非正規形でも）", () => {
    const { keymap } = resolveKeymap(
      prefs({
        bindings: {
          help: ["prefix+H"],
          zoom: ["control+alt+z", "prefix+minus"],
          goto: ["Prefix+G"],
        },
      }),
    );
    expect(keymap.bindingsOf("help")).toEqual(["prefix+shift+h"]);
    expect(keymap.bindingsOf("zoom")).toEqual(["ctrl+alt+z", "prefix+-"]);
    expect(keymap.bindingsOf("goto")).toEqual(["prefix+g"]); // `Prefix+`（大文字の接頭辞）は読めないので落ち、上書きが全部落ちた操作は既定へ戻る
  });

  it("予約：prefix の後の Esc・ctrl+shift+v（貼り付けが先に取る）、直接の ctrl+shift+v、直接で使えない形（文字・名前のあるキー・shift だけ）は落とす", () => {
    const { keymap, problems } = resolveKeymap(
      prefs({
        bindings: {
          zoom: [
            "prefix+esc",
            "prefix+ctrl+shift+v",
            "ctrl+shift+v",
            "d",
            "shift+d",
            "tab",
            "?",
            "ctrl+alt+z",
          ],
        },
      }),
    );
    expect(keymap.bindingsOf("zoom")).toEqual(["ctrl+alt+z"]);
    expect(problems).toHaveLength(7);
    expect(problems.filter((p) => p.includes("貼り付け"))).toHaveLength(2); // prefix の後・直接
  });

  it("予約：prefix の後の Enter・Space・↓（shift 付きも含む）・Shift+F10 は落とす（pane の枠のメニューが先に取る。20260925-pane-frame-focus-keys。review 指摘で shift 付きを、T1 round2 taskcheck 指摘で shift+f10 を追加）", () => {
    const { keymap, problems } = resolveKeymap(
      prefs({
        bindings: {
          zoom: [
            "prefix+enter",
            "prefix+space",
            "prefix+down",
            "prefix+shift+enter",
            "prefix+shift+space",
            "prefix+shift+down",
            "prefix+shift+f10",
            "ctrl+alt+z",
          ],
        },
      }),
    );
    expect(keymap.bindingsOf("zoom")).toEqual(["ctrl+alt+z"]);
    expect(problems).toHaveLength(7);
    expect(problems.every((p) => p.includes("pane の枠のメニュー"))).toBe(true);
  });

  it("予約：直接の Shift+F10 も落とす（pane の枠のメニューを開くキーとして使う。isDirectChord は F キーを shift 付きでも direct として通すため、RESERVED_AFTER_PREFIX と同じ理由で RESERVED_DIRECT にも予約が要る。T1 round2 taskcheck 指摘）", () => {
    const { keymap, problems } = resolveKeymap(
      prefs({ bindings: { zoom: ["shift+f10", "ctrl+alt+z"] } }),
    );
    expect(keymap.bindingsOf("zoom")).toEqual(["ctrl+alt+z"]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("pane の枠のメニュー");
    expect(problems[0]).not.toContain("貼り付け"); // ctrl+shift+v 専用の固定文言に引きずられていないことの確認（review round2 指摘）
  });

  it("読めない文字列は落として記録する", () => {
    const { keymap, problems } = resolveKeymap(
      prefs({ bindings: { zoom: ["prefix+z", "prefix+meta+z"] } }),
    );
    expect(keymap.bindingsOf("zoom")).toEqual(["prefix+z"]);
    expect(problems).toHaveLength(1);
  });

  it("割り当てなし（[]）は、その操作のキーを空にする", () => {
    const { keymap } = resolveKeymap(prefs({ bindings: { help: [] } }));
    expect(keymap.bindingsOf("help")).toEqual([]);
    expect(keymap.prefixMap.has("?")).toBe(false);
    expect(keymap.hintFor("help")).toBeNull();
  });
});

describe("resolveKeymap — 範囲（AC7）", () => {
  it("prefix の後の範囲は 9 個に展開され、数字から Action を作る。既定の 1〜9 は無くなる", () => {
    const { keymap } = resolveKeymap(prefs({ bindings: { switch_tab: ["prefix+alt+1..9"] } }));
    for (let i = 1; i <= 9; i++) {
      expect(keymap.prefixMap.get(`alt+${i}`)).toEqual({ type: "tabIndex", index: i });
      expect(keymap.ownerOf("prefix", `alt+${i}`)).toBe("switch_tab");
      expect(keymap.prefixMap.has(String(i))).toBe(false);
    }
    expect(keymap.bindingsOf("switch_tab")).toEqual(["prefix+alt+1..9"]);
  });

  it("直接の範囲は directMap に入る", () => {
    const { keymap } = resolveKeymap(
      prefs({ bindings: { switch_tab: ["prefix+1..9", "ctrl+alt+1..9"] } }),
    );
    expect(keymap.directMap.get("ctrl+alt+7")).toEqual({ type: "tabIndex", index: 7 });
    expect(keymap.bindingsOf("switch_tab")).toEqual(["prefix+1..9", "ctrl+alt+1..9"]);
  });

  it("範囲の 9 個のどれか 1 つでも衝突・予約なら、範囲全体を落とす", () => {
    const { keymap, problems } = resolveKeymap(
      prefs({ bindings: { close_tab: ["prefix+alt+5"], switch_tab: ["prefix+alt+1..9"] } }),
    );
    // カタログ順は switch_tab（先）→ close_tab（後）なので、後の close_tab の alt+5 が落ちる
    expect(keymap.bindingsOf("switch_tab")).toEqual(["prefix+alt+1..9"]);
    expect(keymap.bindingsOf("close_tab")).toEqual(["prefix+shift+x"]); // 上書きが全部落ちたので既定へ
    expect(problems).toHaveLength(1);
    // 逆に、範囲が後ろになる場合（prefix の後の alt+5 を先に持つ操作がカタログで前にある）：help が alt+5 を持つと範囲が落ちる
    const b = resolveKeymap(
      prefs({ bindings: { help: ["prefix+alt+5"], switch_tab: ["prefix+alt+1..9"] } }),
    );
    expect(b.keymap.bindingsOf("switch_tab")).toEqual(["prefix+1..9"]); // 範囲が全体として落ち、既定の範囲へ戻る
    expect(b.keymap.prefixMap.has("alt+1")).toBe(false); // 一部だけ登録されていない
  });
});

describe("resolveKeymap — edit_scrollback（20260926-edit-scrollback。「後続」の案内だった e）", () => {
  it("既定は prefix+e", () => {
    expect(DEFAULT_KEYMAP.bindingsOf("edit_scrollback")).toEqual(["prefix+e"]);
    expect(DEFAULT_KEYMAP.ownerOf("prefix", "e")).toBe("edit_scrollback");
  });

  it("e を別の操作に割り当てた利用者の設定はそのまま保たれ、edit_scrollback は割り当てなしになる（AC10）", () => {
    const { keymap, problems } = resolveKeymap(prefs({ bindings: { goto: ["prefix+e"] } }));
    expect(keymap.prefixMap.get("e")).toEqual({ type: "goto" });
    expect(keymap.bindingsOf("edit_scrollback")).toEqual([]);
    expect(problems).toEqual([]);
  });

  it("prefix が alt+e でも、e（修飾が違う別の chord）は edit_scrollback のまま", () => {
    const { keymap } = resolveKeymap(prefs({ prefix: "alt+e" }));
    expect(keymap.prefixMap.get("e")).toEqual({ type: "editScrollback" });
    expect(keymap.prefixMap.size).toBe(44);
  });
});
