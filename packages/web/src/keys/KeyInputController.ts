import type { Terminal } from "@xterm/xterm";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { readClipboard } from "../term/clipboard.js";
import type { KeyDecision, KeyInput, Mode } from "@sodashitsu/client-core";
import { chordOf, keyInputOf, prefixBytes, type KeyboardEventLike } from "@sodashitsu/client-core";
import type { KeyRouter } from "@sodashitsu/client-core";

export interface Disposable {
  dispose(): void;
}

export interface ActionPort {
  run(action: import("@sodashitsu/client-core").Action): void;
}
export interface FocusPort {
  focusedPaneId(): string | null;
}
export interface ModeSink {
  onModeChange(m: Mode): void;
}
/**
 * クリップボードの画像の貼り付け（20260927-clipboard-image-paste。`term/ImagePaster` が実装する）。`keys/` は `term/` を import しない（port 越し）。
 */
export interface ImagePastePort {
  /** 画像を貼り付けるキー（`remote_image_paste`）。画像が無い・読めなければ `fallback`（そのキーの端末への列。null なら何も送らない）。 */
  fromKey(paneId: string, fallback: string | null): void;
  /** `Ctrl+Shift+V`：テキストがあればテキスト、無く画像があれば画像。 */
  pasteClipboard(paneId: string): void;
}

/**
 * `Terminal.attachCustomKeyEventHandler` に渡す形の最小限（テストで差し替える）。**定義と `KeyInput` への変換（`keyInputOf`）は `chord.ts`**——設定画面の取り込みが
 * 同じ変換を使う（20260921-keybinding-customization）。ここからは互換のため再エクスポートする。
 */
export type { KeyboardEventLike } from "@sodashitsu/client-core";

/** `Ctrl+Shift+V`（Windows/Linux）。macOS の `Cmd+V` はブラウザの標準の貼り付けなので、xterm.js が自分で拾う（design「貼り付け」）。 */
function isManualPasteShortcut(ev: KeyboardEventLike): boolean {
  return ev.type === "keydown" && !ev.isComposing && ev.ctrlKey && ev.shiftKey && !ev.altKey && !ev.metaKey && ev.key.toLowerCase() === "v";
}

/**
 * `pass`（端末の既定動作）の決定を `injectKey` で再現するための、制御シーケンスへの変換（04-mobile T3）。
 * `injectKey` には合成できる実物の `KeyboardEvent` が無い（xterm.js へ渡して既定動作をさせられない）ため、
 * 対応するバイト列を直接送る。**DECCKM（アプリケーションカーソルキーモード）等は見ない簡略化**
 * ——`KeyInputController` は `paneId → Terminal` を持たない設計（`attach` のたびに呼び出し側から渡される
 * だけ）なので、モードを問い合わせるには設計を変える必要があり、MVP では見送った（decisions.md）。
 */
const INJECT_PASSTHROUGH_BYTES: Partial<Record<string, string>> = {
  Escape: "\x1b",
  Tab: "\t",
  ArrowUp: "\x1b[A",
  ArrowDown: "\x1b[B",
  ArrowRight: "\x1b[C",
  ArrowLeft: "\x1b[D",
  PageUp: "\x1b[5~",
  PageDown: "\x1b[6~",
};

/**
 * `Ctrl`/`Alt` の one-shot / lock（`setPendingModifier`）を、実際にソフトキーボードで打った 1 文字に
 * 重ねてバイト列へ変換する（04-mobile T3）。`Ctrl+<英字>` は制御コード（1〜26。`Ctrl+C` → `\x03` 等の
 * 標準的な対応）、`Alt+<1文字>` は ESC 前置（多くの端末エミュレータの慣習）。変換できないキー
 * （矢印・Enter 等との組み合わせ）は `null` を返し、呼び出し側は既定動作へフォールバックする。
 */
function modifiedByte(key: string, mod: PendingModifier): string | null {
  if (key.length !== 1) return null;
  if (mod.ctrl) {
    const code = key.toUpperCase().charCodeAt(0);
    if (code >= 65 && code <= 95) return String.fromCharCode(code - 64); // A-Z・[ \ ] ^ _
    return null;
  }
  if (mod.alt) return `\x1b${key}`;
  return null;
}

/**
 * 各 xterm.js の `attachCustomKeyEventHandler`（`attach`）と、端末以外にフォーカスがあるときの `handleDomKey`、
 * モバイルの追加キー（`injectKey`）を受ける（architecture.md「keys/KeyInputController.ts」）。
 */
/** `KeyInputController.setPendingModifier` の引数（04-mobile T3。ExtraKeys の Ctrl/Alt）。 */
export interface PendingModifier {
  ctrl: boolean;
  alt: boolean;
}

export class KeyInputController {
  private action: ActionPort | null = null;
  private focus: FocusPort | null = null;
  private modeSink: ModeSink | null = null;
  private imagePaste: ImagePastePort | null = null;
  private pendingModifier: PendingModifier | null = null;
  private pendingModifierLocked = false;

  constructor(
    private readonly router: KeyRouter,
    private readonly connection: ConnectionPort,
  ) {
    this.router.onModeChange((m) => this.modeSink?.onModeChange(m));
  }

  bind(ports: { action: ActionPort; focus: FocusPort; mode: ModeSink; imagePaste?: ImagePastePort }): void {
    this.action = ports.action;
    this.focus = ports.focus;
    this.modeSink = ports.mode;
    this.imagePaste = ports.imagePaste ?? null;
  }

  /**
   * モバイルの Ctrl/Alt キー（`ExtraKeys`。04）：`locked` が無ければ次の 1 回の実キー入力にだけ
   * 重ねて消える（one-shot）、あれば `null` を渡して解除するまでずっと重ねる（lock）。
   * `handleTerminalKey`/`handleDomKey`/`injectKey` のいずれの経路の次のキーにも効く
   * （どこから実際に入力されるかを `ExtraKeys` 側は気にしなくてよい）。
   */
  setPendingModifier(mod: PendingModifier | null, opts?: { locked?: boolean }): void {
    this.pendingModifier = mod;
    this.pendingModifierLocked = !!opts?.locked;
  }

  /**
   * 既に実物の ctrl/alt を持つキー（例：`ExtraKeys` の Prefix ボタン自体が送る `ctrl+b`）には重ねない
   * （04-mobile レビューで発見。`Alt` を armed にしたまま Prefix ボタンを押すと `ctrl+alt+b` になり、
   * `KeyRouter` の prefix の判定（当時は `combo === "ctrl+b"`）に一致せず、対応表にも無いキーとして黙って握りつぶされ、
   * prefix に入れなくなる不具合があった）。pending の状態自体はここでは消費しない——「次に実際に入力される
   * 無修飾のキー」に重ねるための状態であり、Prefix のような既に完成した特殊キーの注入で消費してしまうと、
   * 直後に打つはずだった本来のキーから Ctrl/Alt が失われる。
   */
  private applyPendingModifier(k: KeyInput): KeyInput {
    if (!this.pendingModifier || k.type !== "keydown" || k.ctrl || k.alt) return k;
    const merged: KeyInput = { ...k, ctrl: this.pendingModifier.ctrl, alt: this.pendingModifier.alt };
    if (!this.pendingModifierLocked) this.pendingModifier = null; // one-shot はここで使い切る
    return merged;
  }

  /** xterm.js インスタンスごとに 1 回呼ぶ（`TerminalRegistry.acquire`。T12）。 */
  attach(term: Terminal, paneId: string): Disposable {
    term.attachCustomKeyEventHandler((ev) => this.handleTerminalKey(ev as unknown as KeyboardEventLike, term, paneId));
    return { dispose: () => term.attachCustomKeyEventHandler(() => true) };
  }

  /** 端末以外（サイドバー等）にフォーカスがあるときの keydown。`true` なら既定の動作のままでよい。 */
  handleDomKey(ev: KeyboardEventLike): boolean {
    if (isManualPasteShortcut(ev)) return true; // 端末にフォーカスが無ければ貼り付け先が無い
    const k = keyInputOf(ev);
    // 画像を貼り付けるキー（既定 ctrl+v）は端末にフォーカスがあるときだけ働く——入力欄の Ctrl+V（ブラウザの貼り付け）を横取りしない（AC-I5）。
    // ルーターに渡す前に見る：渡すと押しっぱなしの記録が立ち、繰り返しの Ctrl+V（連続の貼り付け）が食われる（T7 の独立点検）。
    if (!this.pendingModifier && this.router.directActionOf(k)?.type === "pasteImage") return true;
    const decision = this.router.handle(this.applyPendingModifier(k));
    // prefix の後のキーに割り当てた場合は、他の prefix の操作と同じく 2 打目を食う（入力欄へ文字として入れない）。貼り付け先の端末が無いので何もしない。
    if (isPasteImage(decision)) return false;
    return this.dispatch(decision, null);
  }

  /**
   * モバイルの追加キーの列（`ExtraKeys`。04）から、DOM イベントを経由せずに直接キーを注入する。
   * `pass`（端末の既定動作）の決定は `injectKey` には合成できる `KeyboardEvent` が無いため、
   * {@link INJECT_PASSTHROUGH_BYTES} の対応表で直接バイト列を送る（対応表に無いキーは何もしない）。
   */
  injectKey(k: KeyInput): void {
    this.inject(k, true);
  }

  /** `injectKey` の本体。`applyPending` が偽なら、待機中の Ctrl/Alt を重ねない（{@link injectPrefix}）。 */
  private inject(k: KeyInput, applyPending: boolean): void {
    const activeModifier = applyPending ? this.pendingModifier : null; // applyPendingModifier が one-shot なら消してしまう前に控える
    const applied = applyPending ? this.applyPendingModifier(k) : k;
    const direct = this.router.directActionOf(applied)?.type === "pasteImage";
    const decision = this.router.handle(applied);
    if (isPasteImage(decision)) {
      const target = this.focus?.focusedPaneId() ?? null;
      if (target) this.pasteImage(target, applied, direct);
      return;
    }
    if (decision.kind === "pass") {
      const target = this.focus?.focusedPaneId() ?? null;
      // pending modifier（Ctrl/Alt。ExtraKeys）が理由でここに来た場合を先に試す。元のキーに実物の
      // ctrl/alt が付いていなければ、Ctrl+<英字> 等への変換を試みる（modifiedByte。無ければ対応表へ）。
      const byModifier = activeModifier && !k.ctrl && !k.alt ? modifiedByte(k.key, activeModifier) : null;
      const bytes = byModifier ?? INJECT_PASSTHROUGH_BYTES[applied.key];
      if (bytes && target) this.connection.sendInput(target, bytes);
      return;
    }
    this.dispatch(decision, null);
  }

  /**
   * モバイルの Prefix ボタン（`ExtraKeys`）：**いまの prefix**（設定で変えた prefix。20260921-keybinding-customization）のキーを注入する。
   * 実物の `KeyboardEvent` を通らないので、prefix を 2 回押したときの送出（`prefixBytes`）も `injectKey` の経路と同じ。
   */
  injectPrefix(): void {
    // **prefix に入れるモード（terminal・copy・prefix 中）でだけ働く**：navigate・resize モードは `k.key` だけを見て修飾キーを見ないので、変えた prefix のキー
    // （`ctrl+l`・`alt+j` 等）を注入すると意図しない操作（pane の移動・resize）になる。物理の prefix はそのモードでは prefix に入らない（何も起きない）ので、ボタンも何もしない。
    const mode = this.router.mode;
    if (mode !== "terminal" && mode !== "copy" && mode !== "prefix") return;
    // **待機中の Ctrl/Alt は重ねない**：prefix が ctrl・alt を含まない形（F キー）のとき、重ねると別のキーになって prefix に入れなくなる
    // （pending の状態もここでは消費しない。モバイルの `ExtraKeys` は注入のあとに one-shot を自分で解除する——lock は残る。）
    this.inject(this.router.prefixKeyInput(), false);
  }

  setMode(m: Mode): void {
    this.router.setMode(m);
  }

  /**
   * `false`（＝ここで処理済み・端末の既定動作をさせない）を返す全ての経路で、必ず
   * `ev.preventDefault()` を呼んでから返す（05-e2e-docs T2 の E2E で発見。D89）。xterm.js の
   * `attachCustomKeyEventHandler` は「`false` を返せば xterm 側の既定処理はしない」だけで、
   * ブラウザ自身の既定動作（フォーカス中の `<textarea>`（`xterm-helper-textarea`）への文字の挿入）
   * は**呼び出し側が `preventDefault()` しない限り止まらない**（`addEventListener` に渡した関数の
   * 戻り値はブラウザから無視される。xterm.js の `_keyDown` も戻り値だけで早期 return し、
   * 自分では `preventDefault()` しない——公式ドキュメントで「呼び出し側の責務」と明記されている）。
   * これを怠っていたため、prefix の 2 打目のキー（`v`・`-`・`h`・`l` 等、ほぼ全ての割り当てキー）が
   * **アクションとして処理されると同時に、素の文字として端末へ入力されてもいた**（`?` のように
   * 同じ tick 内でダイアログが開きフォーカスが移る決定は、たまたま既定動作が無害化されて隠れていた）。
   */
  private handleTerminalKey(ev: KeyboardEventLike, term: Terminal, paneId: string): boolean {
    const passThrough = this.resolveTerminalKey(ev, term, paneId);
    if (!passThrough) ev.preventDefault();
    return passThrough;
  }

  private resolveTerminalKey(ev: KeyboardEventLike, term: Terminal, paneId: string): boolean {
    if (isManualPasteShortcut(ev)) {
      if (this.imagePaste) {
        this.imagePaste.pasteClipboard(paneId); // テキストが無く画像があれば画像も（20260927-clipboard-image-paste）
        return false;
      }
      void readClipboard().then((text) => {
        if (text) term.paste(text);
      });
      return false;
    }
    const raw = keyInputOf(ev);
    const activeModifier = this.pendingModifier; // applyPendingModifier が one-shot なら消してしまう前に控える
    const applied = this.applyPendingModifier(raw);
    const direct = this.router.directActionOf(applied)?.type === "pasteImage"; // handle の前に（handle はモードを変える）
    const decision = this.router.handle(applied);
    if (isPasteImage(decision)) {
      this.pasteImage(paneId, applied, direct);
      return false;
    }
    if (decision.kind === "pass" && activeModifier && !raw.ctrl && !raw.alt) {
      // 実物の Ctrl/Alt キーではなく ExtraKeys の pending modifier が理由で "pass" になった場合、
      // xterm.js の既定動作（未修飾のキーとして処理される）に任せると Ctrl/Alt が失われる——
      // ここで直接バイト列に変換して送る（modifiedByte）。変換できなければ諦めて既定動作へ委ねる。
      const bytes = modifiedByte(raw.key, activeModifier);
      if (bytes) {
        this.connection.sendInput(paneId, bytes);
        return false;
      }
    }
    return this.dispatch(decision, paneId);
  }

  /**
   * 画像を貼り付けるキー（20260927-clipboard-image-paste）。画像が無い・読めないときに送る列は、そのキーを端末へ送ったときの列（`ctrl+v` なら `\x16`。
   * `prefixBytes`＝prefix の二度押しと同じ変換）。送れない chord（矢印との組み合わせ等）は何も送らない。`ImagePastePort` が無ければ列をそのまま送る。
   */
  private pasteImage(paneId: string, k: KeyInput, direct: boolean): void {
    // prefix の後のキーに割り当てた場合は、画像が無ければ何も送らない（ほかの prefix の操作と同じく 2 打目を食う。cross の点検）。
    const chord = direct ? chordOf(k) : null;
    const fallback = chord === null ? null : prefixBytes(chord);
    if (this.imagePaste) this.imagePaste.fromKey(paneId, fallback);
    else if (fallback !== null) this.connection.sendInput(paneId, fallback);
  }

  /** `KeyDecision` を実際の効果にする。戻り値は xterm.js の `attachCustomKeyEventHandler` と同じ意味
   *  （`true`＝既定の動作のまま・`false`＝ここで処理済み）。 */
  private dispatch(decision: ReturnType<KeyRouter["handle"]>, paneId: string | null): boolean {
    switch (decision.kind) {
      case "pass":
        return true;
      case "consume":
        return false;
      case "send": {
        const target = paneId ?? this.focus?.focusedPaneId() ?? null;
        if (target) this.connection.sendInput(target, decision.bytes);
        return false;
      }
      case "action":
        this.action?.run(decision.action);
        return false;
    }
  }
}

function isPasteImage(decision: KeyDecision): boolean {
  return decision.kind === "action" && decision.action.type === "pasteImage";
}
