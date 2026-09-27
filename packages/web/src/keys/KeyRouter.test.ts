import { describe, expect, it, vi } from "vitest";
import type { Action, KeyDecision, KeyInput, Mode, SubModeInterpreter } from "./KeyRouter.js";
import { KeyRouter, type KeyRouterClock } from "./KeyRouter.js";
import { emptyKeyPrefs, type KeyPrefs } from "./keyPrefs.js";
import { DEFAULT_KEYMAP, resolveKeymap } from "./keymap.js";
import { NavigateMode } from "./NavigateMode.js";
import { ResizeMode } from "./ResizeMode.js";

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

function ctrlB(): KeyInput {
  return key({ key: "b", ctrl: true });
}

/** 実物の setTimeout/clearTimeout（vitest の偽の時計で制御する）。 */
function realClock(): KeyRouterClock {
  return { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };
}

function fakeSubMode(): SubModeInterpreter & { calls: KeyInput[]; nextResult: { action?: Action; exit?: boolean } } {
  return {
    calls: [],
    nextResult: {},
    handle(k) {
      this.calls.push(k);
      return this.nextResult;
    },
  };
}

describe("KeyRouter — terminal モード", () => {
  it("既定は terminal で、Ctrl+B 以外は pass する", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    expect(router.mode).toBe("terminal");
    expect(router.handle(key({ key: "a" }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(key({ key: "c", ctrl: true }))).toEqual<KeyDecision>({ kind: "pass" }); // Ctrl+C
    expect(router.handle(key({ key: "Escape" }))).toEqual<KeyDecision>({ kind: "pass" });
  });

  it("Ctrl+B で prefix へ入り、そのキー自体は consume する", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    expect(router.handle(ctrlB())).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("prefix");
  });

  it("keydown 以外・IME 変換中は常に pass する（Ctrl+B でも prefix に入らない）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    expect(router.handle(key({ key: "b", ctrl: true, type: "keyup" }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.mode).toBe("terminal");
    expect(router.handle(key({ key: "b", ctrl: true, composing: true }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.mode).toBe("terminal");
  });
});

describe("KeyRouter — prefix モード", () => {
  it("もう一度 Ctrl+B で \\x02 を送り、terminal へ戻る", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(ctrlB())).toEqual<KeyDecision>({ kind: "send", bytes: "\x02" });
    expect(router.mode).toBe("terminal");
  });

  it("Esc は何もせず terminal へ戻る", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "Escape" }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("terminal");
  });

  it("割り当ての無いキーは何もせず terminal へ戻る（端末へも送らない）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "Q" }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("terminal");
  });

  it("修飾キー単体（Shift/Control/Alt/Meta）は prefix を維持したまま無視する（D81）——Shift+T 等は " +
    "ブラウザが Shift 単体の keydown を本命のキーより先に必ず送るため、これを「割り当ての無いキー」として" +
    "扱うと prefix+shift+<文字> が全滅する（実機の Chromium を使う test 工程の実地の確認で発見）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "Shift", shift: true }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("prefix"); // ここではまだ抜けない
    expect(router.handle(key({ key: "T", shift: true }))).toEqual<KeyDecision>({ kind: "action", action: { type: "renameTab" } });
    expect(router.mode).toBe("terminal");
  });

  it("修飾キー単体でない引けないキー（Dead・Unidentified）は、割り当てのないキーとして prefix を抜ける（待ち続けない）", () => {
    for (const k of ["Dead", "Unidentified", "CapsLock"]) {
      const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
      router.handle(ctrlB());
      expect(router.handle(key({ key: k })), k).toEqual<KeyDecision>({ kind: "consume" });
      expect(router.mode, k).toBe("terminal");
    }
  });

  it("動作キーは action を返し、terminal へ戻る（enterMode 以外）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "v" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } });
    expect(router.mode).toBe("terminal");
  });

  it("tabIndex（1〜9）が正しく引ける", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "3" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "tabIndex", index: 3 } });
  });

  it("enterMode（navigate/copy/resize）はそのモードへ遷移する（terminal へは戻らない）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "w" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "enterMode", mode: "navigate" } });
    expect(router.mode).toBe("navigate");
  });

  it("prefix+e はスクロールバックをエディタで開く action を返し、terminal へ戻る（20260926-edit-scrollback）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "e" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "editScrollback" } });
    expect(router.mode).toBe("terminal");
  });

  it("prefix+s は設定、prefix+o は次の知らせへ移る", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "s" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "settings" } });
    router.handle(ctrlB());
    expect(router.handle(key({ key: "o" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "nextNotification" } });
  });

  it("3 秒経つと自動で terminal へ戻る（D21。herdr には無いが AC-I1 のために維持）", () => {
    vi.useFakeTimers();
    try {
      const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
      router.handle(ctrlB());
      expect(router.mode).toBe("prefix");
      vi.advanceTimersByTime(2999);
      expect(router.mode).toBe("prefix");
      vi.advanceTimersByTime(1);
      expect(router.mode).toBe("terminal");
    } finally {
      vi.useRealTimers();
    }
  });

  it("修飾キー単体は 3 秒のタイマーに触らない（D81。消費もリセットもしない）", () => {
    vi.useFakeTimers();
    try {
      const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
      router.handle(ctrlB());
      vi.advanceTimersByTime(2000);
      router.handle(key({ key: "Shift", shift: true })); // ここでタイマーが消えたり延びたりしない
      expect(router.mode).toBe("prefix");
      vi.advanceTimersByTime(999);
      expect(router.mode).toBe("prefix");
      vi.advanceTimersByTime(1); // enterPrefix から通算 3000ms で戻る
      expect(router.mode).toBe("terminal");
    } finally {
      vi.useRealTimers();
    }
  });

  it("キー入力があれば 3 秒のタイマーを解除する（二重に戻さない）", () => {
    vi.useFakeTimers();
    try {
      const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
      const modes: Mode[] = [];
      router.onModeChange((m) => modes.push(m));
      router.handle(ctrlB());
      router.handle(key({ key: "v" })); // action で戻る
      vi.advanceTimersByTime(3000); // タイマーは解除済みなので、ここで再度 terminal 通知が来ない
      expect(modes).toEqual(["prefix", "terminal"]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("KeyRouter — copy モード中の prefix（D56 の訂正 1・5）", () => {
  it("copy モード中に Ctrl+B で prefix へ入り、動作キーの後は copy へ戻る", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock(), { copy: fakeSubMode() });
    router.setMode("copy");
    expect(router.handle(ctrlB())).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("prefix");
    expect(router.handle(key({ key: "v" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } });
    expect(router.mode).toBe("copy");
  });

  it("copy モード中に Ctrl+B をもう一度で \\x02 を送り、copy へ戻る", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock(), { copy: fakeSubMode() });
    router.setMode("copy");
    router.handle(ctrlB());
    expect(router.handle(ctrlB())).toEqual<KeyDecision>({ kind: "send", bytes: "\x02" });
    expect(router.mode).toBe("copy");
  });
});

describe("KeyRouter — navigate/resize/copy モードへの委譲", () => {
  it("サブモードの interpreter へキーを渡し、action をそのまま伝える", () => {
    const nav = fakeSubMode();
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock(), { navigate: nav });
    router.setMode("navigate");
    nav.nextResult = { action: { type: "navigate", op: "down" } };
    const k = key({ key: "j" });
    expect(router.handle(k)).toEqual<KeyDecision>({ kind: "action", action: { type: "navigate", op: "down" } });
    expect(nav.calls).toEqual([k]);
    expect(router.mode).toBe("navigate");
  });

  it("interpreter が exit を返したら terminal へ戻る", () => {
    const nav = fakeSubMode();
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock(), { navigate: nav });
    router.setMode("navigate");
    nav.nextResult = { exit: true };
    expect(router.handle(key({ key: "Enter" }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("terminal");
  });

  it("interpreter が無いモードでは Esc だけ terminal へ戻し、ほかは consume する", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.setMode("resize");
    expect(router.handle(key({ key: "h" }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("resize");
    expect(router.handle(key({ key: "Escape" }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("terminal");
  });
});

describe("KeyRouter — setMode / onModeChange", () => {
  it("setMode は外から直接モードを変える（ダイアログの開閉等）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    const modes: Mode[] = [];
    router.onModeChange((m) => modes.push(m));
    router.setMode("dialog");
    expect(router.mode).toBe("dialog");
    router.setMode("terminal");
    expect(modes).toEqual(["dialog", "terminal"]);
  });

  it("dialog モードではキーを consume する（部品自身が扱う想定）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.setMode("dialog");
    expect(router.handle(key({ key: "Enter" }))).toEqual<KeyDecision>({ kind: "consume" });
  });

  it("同じモードへの setMode は通知しない", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    const modes: Mode[] = [];
    router.onModeChange((m) => modes.push(m));
    router.setMode("terminal");
    expect(modes).toEqual([]);
  });
});

describe("KeyRouter — 実物の NavigateMode/ResizeMode との結合", () => {
  it("prefix+w → navigate → h で pane 移動 → Enter で決定して terminal へ戻る", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock(), { navigate: new NavigateMode() });
    router.handle(ctrlB());
    expect(router.handle(key({ key: "w" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "enterMode", mode: "navigate" } });
    expect(router.mode).toBe("navigate");
    expect(router.handle(key({ key: "h" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "navigate", op: "paneDir", dir: "left" } });
    expect(router.mode).toBe("navigate");
    expect(router.handle(key({ key: "Enter" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "navigate", op: "activate" } });
    expect(router.mode).toBe("terminal");
  });

  it("prefix+r → resize → l で 0.05 → 素の r で terminal へ戻る", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock(), { resize: new ResizeMode() });
    router.handle(ctrlB());
    router.handle(key({ key: "r" }));
    expect(router.mode).toBe("resize");
    expect(router.handle(key({ key: "l" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "resizeBy", dir: "right", amount: 0.05 } });
    expect(router.handle(key({ key: "r" }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("terminal");
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 20260921-keybinding-customization：prefix の変更・直接のキー・割り当ての差し替え
// ---------------------------------------------------------------------------------------------------------------------

function routerWith(partial: Partial<KeyPrefs>, subModes = {}): KeyRouter {
  return new KeyRouter(resolveKeymap({ ...emptyKeyPrefs(), ...partial }).keymap, realClock(), subModes);
}
const ctrlAlt = (k: string, extra: Partial<KeyInput> = {}): KeyInput => key({ key: k, ctrl: true, alt: true, ...extra });

describe("KeyRouter — shift の表し方（合成の小文字＋shift も、実物の大文字＋shift も同じ）", () => {
  it("prefix の後の shift+文字は、key が大文字でも小文字でも（shift が立っていれば）引ける", () => {
    for (const k of ["T", "t"]) {
      const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
      router.handle(ctrlB());
      expect(router.handle(key({ key: k, shift: true }))).toEqual<KeyDecision>({ kind: "action", action: { type: "renameTab" } });
    }
  });

  it("shift+Tab は cycle の逆向き（名前のあるキーは shift を明示する）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "Tab", shift: true }))).toEqual<KeyDecision>({ kind: "action", action: { type: "cyclePane", delta: -1 } });
  });

  it("記号（?・-・[）は shift の有無にかかわらず文字で引ける", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "?", shift: true }))).toEqual<KeyDecision>({ kind: "action", action: { type: "help" } });
    router.handle(ctrlB());
    expect(router.handle(key({ key: "-" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "down" } });
  });

  it("CapsLock の大文字（shift なし）は shift+文字＝今までと同じ（prefix+X は closeTab）", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.handle(key({ key: "X" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "closeTab" } });
  });
});

describe("KeyRouter — prefix の変更（AC3）", () => {
  it("新しい prefix で prefix モードに入り、旧い prefix（ctrl+b）は端末へ素通しする", () => {
    const router = routerWith({ prefix: "ctrl+a" });
    expect(router.handle(ctrlB())).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.mode).toBe("terminal");
    expect(router.handle(key({ key: "a", ctrl: true }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("prefix");
  });

  it("prefix を 2 回押すと、その prefix のキー自身（列）を端末へ送る", () => {
    const a = routerWith({ prefix: "ctrl+a" });
    a.handle(key({ key: "a", ctrl: true }));
    expect(a.handle(key({ key: "a", ctrl: true }))).toEqual<KeyDecision>({ kind: "send", bytes: "\x01" });
    const b = routerWith({ prefix: "alt+x" });
    b.handle(key({ key: "x", alt: true }));
    expect(b.handle(key({ key: "x", alt: true }))).toEqual<KeyDecision>({ kind: "send", bytes: "\x1bx" });
    const c = routerWith({ prefix: "f5" });
    c.handle(key({ key: "F5" }));
    expect(c.handle(key({ key: "F5" }))).toEqual<KeyDecision>({ kind: "send", bytes: "\x1b[15~" });
  });

  it("新しい prefix の後、prefix の後のキーは変わらず引ける。旧い prefix は prefix 中なら割り当てのないキー", () => {
    const router = routerWith({ prefix: "ctrl+a" });
    router.handle(key({ key: "a", ctrl: true }));
    expect(router.handle(key({ key: "v" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } });
    router.handle(key({ key: "a", ctrl: true }));
    expect(router.handle(ctrlB())).toEqual<KeyDecision>({ kind: "consume" }); // 割り当てのないキー：黙って捨てて terminal へ戻る
    expect(router.mode).toBe("terminal");
  });

  it("copy モード中も新しい prefix が効き、元の copy モードへ戻る。旧い prefix（ctrl+b）は copy モードの中へ渡る", () => {
    const copy = fakeSubMode();
    const router = routerWith({ prefix: "ctrl+a" }, { copy });
    router.setMode("copy");
    router.handle(ctrlB()); // 旧い prefix：prefix には入らず、copy モードのキーとして委ねる
    expect(copy.calls).toHaveLength(1);
    expect(router.mode).toBe("copy");
    router.handle(key({ key: "a", ctrl: true }));
    expect(router.mode).toBe("prefix");
    router.handle(key({ key: "Escape" }));
    expect(router.mode).toBe("copy");
  });

  it("prefixKeyInput は現在の prefix の KeyInput（モバイルの Prefix ボタンが注入する）", () => {
    expect(new KeyRouter(DEFAULT_KEYMAP, realClock()).prefixKeyInput()).toEqual({
      key: "b", code: "KeyB", ctrl: true, alt: false, shift: false, meta: false, type: "keydown", composing: false,
    });
    const router = routerWith({ prefix: "alt+x" });
    expect(router.prefixKeyInput()).toMatchObject({ key: "x", alt: true, ctrl: false });
    // その KeyInput で prefix に入れる
    router.handle(router.prefixKeyInput());
    expect(router.mode).toBe("prefix");
  });
});

describe("KeyRouter — 直接のキー（AC5。D4）", () => {
  const withDirect = (subModes = {}): KeyRouter => routerWith({ bindings: { split_vertical: ["prefix+v", "ctrl+alt+d"], resize_mode: ["prefix+r", "ctrl+alt+r"], zoom: ["f5"] } }, subModes);

  it("terminal モードで、直接のキーは action を返す（prefix を押さない）。モードは terminal のまま", () => {
    const router = withDirect();
    expect(router.handle(ctrlAlt("d"))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } });
    expect(router.mode).toBe("terminal");
    expect(router.handle(key({ key: "F5" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "zoom" } });
  });

  it("割り当てのないキーは pass（端末の入力）。修飾キー単体・keydown 以外・IME の変換中も pass", () => {
    const router = withDirect();
    expect(router.handle(ctrlAlt("y"))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(key({ key: "Control", ctrl: true }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(ctrlAlt("d", { type: "keyup" }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(ctrlAlt("d", { composing: true }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(key({ key: "d" }))).toEqual<KeyDecision>({ kind: "pass" }); // 修飾キーの無い d は端末の入力
  });

  it("AltGr で合成された文字（ドイツ語配列の AltGr+8＝[）は ctrl+alt+[ の直接のキーに当てず端末へ通す。US 配列の ctrl+alt+[ は altGraph が真でも効く（D6a）", () => {
    const router = routerWith({ bindings: { previous_tab: ["ctrl+alt+["] } });
    expect(router.handle(ctrlAlt("[", { code: "Digit8", altGraph: true }))).toEqual<KeyDecision>({ kind: "pass" });
    // Firefox・Windows は Ctrl+Alt を押すだけで AltGraph が真になる。物理キーが `[` の位置なら、直接のキー。
    const action: KeyDecision = { kind: "action", action: { type: "tabDelta", delta: -1 } };
    expect(router.handle(ctrlAlt("[", { code: "BracketLeft", altGraph: true }))).toEqual(action);
    expect(router.handle(ctrlAlt("[", { code: "BracketLeft" }))).toEqual(action);
  });

  it("実行時のガードも shift の状態で比べる：フランス語 AltGr+3＝# は ctrl+alt+# の直接のキーに当てず端末へ通し、US 配列の ctrl+alt+shift+3 は効く", () => {
    const router = routerWith({ bindings: { zoom: ["ctrl+alt+#"] } });
    expect(router.handle(ctrlAlt("#", { code: "Digit3", altGraph: true }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(ctrlAlt("#", { code: "Digit3", shift: true, altGraph: true }))).toEqual<KeyDecision>({ kind: "action", action: { type: "zoom" } });
  });

  it("Firefox・Windows（altGraph が真）でも、実物の大文字＋shift の Ctrl+Alt+Shift+D は直接のキー（下へ分割）に当たる", () => {
    const router = routerWith({ bindings: { split_horizontal: ["ctrl+alt+shift+d"] } });
    const down: KeyDecision = { kind: "action", action: { type: "split", dir: "down" } };
    expect(router.handle(ctrlAlt("D", { code: "KeyD", shift: true, altGraph: true }))).toEqual(down);
    expect(router.handle(ctrlAlt("d", { code: "KeyD", shift: true, altGraph: true }))).toEqual(down);
  });

  it("合成の（小文字＋shift）も実物の（大文字＋shift）も同じ直接のキーに当たる（ctrl+alt+shift+d）", () => {
    const router = routerWith({ bindings: { split_horizontal: ["ctrl+alt+shift+d"] } });
    for (const k of ["d", "D"]) {
      expect(router.handle(ctrlAlt(k, { shift: true }))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "down" } });
    }
    expect(router.handle(ctrlAlt("d"))).toEqual<KeyDecision>({ kind: "pass" }); // shift なしは別の chord
  });

  it("押しっぱなしの繰り返しは、割り当てのあるキーなら何もせず食う（分割・閉鎖の連発を避ける）。割り当てのないキーの繰り返しは端末へ", () => {
    const router = withDirect();
    expect(router.handle(ctrlAlt("d", { repeat: true }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.handle(ctrlAlt("y", { repeat: true }))).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(ctrlAlt("d"))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } }); // 最初の 1 打は効く
  });

  it("enterMode の直接のキーは、そのモードへ移る", () => {
    const router = withDirect();
    expect(router.handle(ctrlAlt("r"))).toEqual<KeyDecision>({ kind: "action", action: { type: "enterMode", mode: "resize" } });
    expect(router.mode).toBe("resize");
  });

  it("enterMode の直接のキーを押しっぱなしにしても、繰り返しが入ったモードのキーとして渡らない（resize から抜けない・copy が動かない）", () => {
    // **モードの解釈（ResizeMode の `r` は exit）を渡す**——渡さないと、解釈の無いモードは何を受けても consume するので、繰り返しが漏れても見えない。
    const interp = fakeSubMode();
    interp.nextResult = { exit: true };
    const resize = withDirect({ resize: interp });
    expect(resize.handle(ctrlAlt("r"))).toEqual<KeyDecision>({ kind: "action", action: { type: "enterMode", mode: "resize" } });
    expect(resize.mode).toBe("resize");
    expect(resize.handle(ctrlAlt("r", { repeat: true }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(resize.mode).toBe("resize"); // 繰り返しで抜けない
    expect(interp.calls, "繰り返しは入ったモードの解釈へ渡らない").toHaveLength(0);
    // 別のキーを押せば、覚えていた chord は忘れる（次の同じ chord の繰り返しは、また最初の 1 打から）。そのキーは解釈へ渡り、モードを抜ける
    resize.handle(key({ key: "Escape" }));
    expect(interp.calls).toHaveLength(1);
    expect(resize.mode).toBe("terminal");
    expect(resize.handle(ctrlAlt("r"))).toEqual<KeyDecision>({ kind: "action", action: { type: "enterMode", mode: "resize" } });
  });

  it("覚えているのは押しっぱなしの間だけ：別のキーの後の繰り返しでない keydown は、また普通に引く", () => {
    const router = withDirect();
    router.handle(ctrlAlt("d"));
    router.handle(key({ key: "y" })); // 繰り返しでない別のキー
    // 以前の chord の「繰り返し」に見える入力は、覚えていないので直接のキーの規則（terminal の repeat は食う）に従う
    expect(router.handle(ctrlAlt("d", { repeat: true }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.handle(ctrlAlt("d"))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } });
  });

  it("prefix・copy・navigate・resize・dialog モードの中では直接のキーを引かない", () => {
    const router = withDirect();
    router.handle(ctrlB()); // prefix：直接のキーは prefix の後の表に無い＝割り当てのないキー
    expect(router.handle(ctrlAlt("d"))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.mode).toBe("terminal");
    for (const mode of ["copy", "navigate", "resize", "dialog"] as const) {
      const r = withDirect();
      r.setMode(mode);
      const d = r.handle(ctrlAlt("d"));
      expect(d.kind, mode).not.toBe("action");
    }
  });

  it("直接のキーが prefix の後のキーの表には入らない（別の表）", () => {
    const router = withDirect();
    router.handle(ctrlB());
    expect(router.handle(key({ key: "v" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } });
  });
});

describe("KeyRouter.setKeymap — 割り当ての差し替え（AC8）", () => {
  it("差し替えると、新しい割り当てが即時に効き、旧い割り当ては効かなくなる", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    expect(router.handle(ctrlAlt("d"))).toEqual<KeyDecision>({ kind: "pass" });
    router.setKeymap(
      resolveKeymap({
        prefix: "ctrl+a",
        bindings: { split_vertical: ["ctrl+alt+d"] },
        navigateKeys: {},
        commands: {},
      }).keymap,
    );
    expect(router.handle(ctrlAlt("d"))).toEqual<KeyDecision>({ kind: "action", action: { type: "split", dir: "right" } });
    expect(router.handle(ctrlB())).toEqual<KeyDecision>({ kind: "pass" });
    expect(router.handle(key({ key: "a", ctrl: true }))).toEqual<KeyDecision>({ kind: "consume" });
    expect(router.handle(key({ key: "v" }))).toEqual<KeyDecision>({ kind: "consume" }); // prefix+v は外した
    expect(router.mode).toBe("terminal");
  });

  it("prefix 中に差し替えても（別のウィンドウの変更が任意のモードで届く）、モードは変わらず、次のキーから新しい表で引く", () => {
    const router = new KeyRouter(DEFAULT_KEYMAP, realClock());
    router.handle(ctrlB());
    expect(router.mode).toBe("prefix");
    router.setKeymap(
      resolveKeymap({ prefix: null, bindings: { zoom: ["prefix+y"] }, navigateKeys: {}, commands: {} }).keymap,
    );
    expect(router.mode).toBe("prefix"); // 進行中の prefix は変えない
    expect(router.handle(key({ key: "y" }))).toEqual<KeyDecision>({ kind: "action", action: { type: "zoom" } });
    expect(router.mode).toBe("terminal");
  });
});
