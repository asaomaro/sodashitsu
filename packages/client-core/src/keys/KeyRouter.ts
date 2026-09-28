import type { Action, KeyDecision, KeyInput, Mode } from "./actions.js";
import { chordOf, chordToKeyInput, isAltGrComposed, MODIFIER_ONLY_KEYS, PREFIX_CANCEL_CHORD } from "./chord.js";
import type { ResolvedKeymap } from "./keymap.js";

export type { Action, CopyCommand, Dir, KeyDecision, KeyInput, Mode } from "./actions.js";

const PREFIX_TIMEOUT_MS = 3000; // AC-I1「一定時間の経過で解除」（D21）。herdr 自身には時間切れが無い（D55/D56）。

export interface KeyRouterClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

/**
 * `navigate` / `copy` / `resize` モードの内部状態とキーの解釈（`keys/NavigateMode`・`CopyMode`・`ResizeMode`。T7・T8）。
 * `KeyRouter` はモードの持ち主のまま、解釈だけをこれらに委ねる（architecture「keys/KeyRouter.ts」）。
 */
export interface SubModeInterpreter {
  /** `exit: true` なら terminal モードへ戻す（呼び出し側は自身の内部状態をリセットしてよい）。 */
  handle(k: KeyInput): { action?: Action; exit?: boolean };
}

export interface SubModeInterpreters {
  navigate?: SubModeInterpreter;
  copy?: SubModeInterpreter;
  resize?: SubModeInterpreter;
}

/**
 * prefix の状態機械（architecture.md「keys/KeyRouter.ts」）。Vue にも DOM にも依存しない。
 * herdr のソースで確定させた挙動（D55・D56）: prefix 中にもう一度 prefix を押すと prefix のキー自身を端末へ送る（既定の `ctrl+b` は `\x02`）、
 * 割り当ての無いキーは黙って捨てる、copy モード中も prefix が効き元の copy モードへ戻る。
 * prefix の 3 秒の時間切れは herdr には無いが、AC-I1 の要求により本製品では維持する。
 *
 * **prefix と割り当ては解決した表（`ResolvedKeymap`）から引く**（20260921-keybinding-customization。`setKeymap` で差し替える）。キーの照合は `chord.ts` の `chordOf` の正規形。
 * prefix の後のキー（`prefixMap`）に加えて、terminal モードでだけ**直接のキー**（`directMap`。prefix を押さない 1 打）を引く。
 */
export class KeyRouter {
  private currentMode: Mode = "terminal";
  /** prefix から戻る先（terminal のことが多いが、copy モード中に prefix へ入った場合は copy）。 */
  private returnMode: Mode = "terminal";
  private prefixTimer: unknown = null;
  /**
   * 直接のキーで action を返した chord（押しっぱなしの間だけ覚える）。**その chord の繰り返しは、モードに関わらず食う**——`enterMode` の直接のキー
   * （`ctrl+alt+r` 等）は最初の 1 打でモードが移り、繰り返しが入ったばかりのモードのキーとして渡ってしまう（resize から抜ける等）ため。
   * 次の（繰り返しでない）keydown で忘れる。
   */
  private directHeld: string | null = null;
  private readonly modeListeners = new Set<(m: Mode) => void>();

  constructor(
    private keymap: ResolvedKeymap,
    private readonly clock: KeyRouterClock,
    private readonly subModes: SubModeInterpreters = {},
  ) {}

  get mode(): Mode {
    return this.currentMode;
  }

  /**
   * 割り当てが変わったときに差し替える（設定画面で変えると即時に効く。AC8）。**進行中の状態（prefix 中など）は変えない**——次のキーから新しい表で引く。
   * 設定画面で変えたときは `dialog` モードだが、別のウィンドウの変更（`store/settings.ts` の `storage` 追従）は任意のモードで届く。
   */
  setKeymap(keymap: ResolvedKeymap): void {
    this.keymap = keymap;
  }

  /** いまの prefix の `KeyInput`（モバイルの Prefix ボタンが注入する。`KeyInputController.injectPrefix`）。 */
  prefixKeyInput(): KeyInput {
    return chordToKeyInput(this.keymap.prefix);
  }

  /**
   * terminal モードで、このキーが直接のキーとして割り当てられている操作（無ければ undefined）。**状態を変えない**（`handle` と違い、押しっぱなしの記録もしない）。
   * 端末以外にフォーカスがあるとき、画像を貼り付けるキー（既定 ctrl+v）をブラウザの既定の動作に任せるために使う（20260927-clipboard-image-paste）。
   */
  directActionOf(k: KeyInput): Action | undefined {
    if (this.currentMode !== "terminal" || k.type !== "keydown" || k.composing || isAltGrComposed(k)) return undefined;
    const chord = chordOf(k);
    return chord === null ? undefined : this.keymap.directMap.get(chord);
  }

  handle(k: KeyInput): KeyDecision {
    // keydown 以外・IME の変換中は prefix と判定しない（design「キー操作」）。どのモードでも同様に扱う。
    if (k.type !== "keydown" || k.composing) return { kind: "pass" };

    const chord = chordOf(k);

    if (k.repeat === true) {
      if (this.directHeld !== null && chord === this.directHeld) return { kind: "consume" };
    } else {
      this.directHeld = null;
    }

    if (this.currentMode === "prefix") return this.handleInPrefix(chord, k.key);

    if (this.currentMode === "terminal" || this.currentMode === "copy") {
      if (chord !== null && chord === this.keymap.prefix) return this.enterPrefix();
      if (this.currentMode === "terminal") return this.handleDirect(chord, k);
      return this.delegateToSubMode(this.subModes.copy, k);
    }

    if (this.currentMode === "navigate") return this.delegateToSubMode(this.subModes.navigate, k);
    if (this.currentMode === "resize") return this.delegateToSubMode(this.subModes.resize, k);

    // dialog: ダイアログの部品自身がキーを扱う（フォーカスが移っているので通常ここへは来ない）。
    return { kind: "consume" };
  }

  setMode(m: Mode): void {
    this.clearPrefixTimer();
    this.setModeInternal(m);
  }

  onModeChange(cb: (m: Mode) => void): void {
    this.modeListeners.add(cb);
  }

  /**
   * 直接のキー（prefix を押さない 1 打。D4）。terminal モードでだけ引き、割り当てが無ければ端末の入力（`pass`）。**押しっぱなしの繰り返しは、割り当てのあるキーなら何もせず食う**
   * ——分割・pane の閉鎖が連発する事故を避ける。
   */
  private handleDirect(chord: string | null, k: KeyInput): KeyDecision {
    // AltGr で合成された文字（ドイツ語配列の AltGr+8＝`[` は `ctrl+alt+[` と同じ形で届く）は、直接のキーに当てず端末の入力として通す——取り込みで拒否するのと同じ判定（D6a。`isAltGrComposed`）。
    // 素の `altGraph` では見ない（Firefox・Windows は Ctrl+Alt を押すだけで真になるので、US 配列の `ctrl+alt+[` まで通してしまう）。
    if (isAltGrComposed(k)) return { kind: "pass" };
    const action = chord === null ? undefined : this.keymap.directMap.get(chord);
    if (action === undefined) return { kind: "pass" };
    if (k.repeat === true) return { kind: "consume" };
    this.directHeld = chord;
    if (action.type === "enterMode") this.setModeInternal(action.mode);
    return { kind: "action", action };
  }

  private handleInPrefix(chord: string | null, key: string): KeyDecision {
    // 修飾キー単体の keydown（D81）：prefix を維持したまま無視する（timer にも触らない——`Shift+T` の
    // `Shift` だけで 3 秒の猶予を消費・リセットしないため）。
    if (MODIFIER_ONLY_KEYS.has(key)) return { kind: "consume" };
    this.clearPrefixTimer();
    if (chord !== null && chord === this.keymap.prefix) {
      this.setModeInternal(this.returnMode);
      return { kind: "send", bytes: this.keymap.prefixBytes };
    }
    if (chord === PREFIX_CANCEL_CHORD) {
      this.setModeInternal(this.returnMode);
      return { kind: "consume" };
    }
    const action = chord === null ? undefined : this.keymap.prefixMap.get(chord);
    if (!action) {
      this.setModeInternal(this.returnMode);
      return { kind: "consume" };
    }
    this.setModeInternal(action.type === "enterMode" ? action.mode : this.returnMode);
    return { kind: "action", action };
  }

  private enterPrefix(): KeyDecision {
    this.returnMode = this.currentMode;
    this.setModeInternal("prefix");
    this.prefixTimer = this.clock.setTimeout(() => {
      this.prefixTimer = null;
      this.setModeInternal(this.returnMode);
    }, PREFIX_TIMEOUT_MS);
    return { kind: "consume" };
  }

  private delegateToSubMode(interpreter: SubModeInterpreter | undefined, k: KeyInput): KeyDecision {
    if (!interpreter) {
      if (k.key === "Escape") {
        this.setModeInternal("terminal");
        return { kind: "consume" };
      }
      return { kind: "consume" };
    }
    const result = interpreter.handle(k);
    if (result.exit) this.setModeInternal("terminal");
    return result.action ? { kind: "action", action: result.action } : { kind: "consume" };
  }

  private setModeInternal(m: Mode): void {
    if (this.currentMode === m) return;
    this.currentMode = m;
    for (const cb of this.modeListeners) cb(m);
  }

  private clearPrefixTimer(): void {
    if (this.prefixTimer !== null) {
      this.clock.clearTimeout(this.prefixTimer);
      this.prefixTimer = null;
    }
  }
}
