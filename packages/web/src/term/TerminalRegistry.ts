import { Terminal } from "@xterm/xterm";
import type { ITerminalAddon, ITerminalOptions, ITheme } from "@xterm/xterm";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import type { KeyInputController } from "../keys/KeyInputController.js";
import type { ConnectionPort, TerminalSinkPort } from "@sodashitsu/client-core";
import { installQueryFilter } from "./QueryFilter.js";
import { createImageAddon } from "./imageAddon.js";
import { RendererPool } from "./RendererPool.js";
import { MouseBridge } from "./MouseBridge.js";
import { XtermCopyTarget, type CopyTarget } from "./CopyTarget.js";
import { toXtermTheme } from "./theme.js";
import { imageFromDataTransfer } from "./clipboard.js";

/** xterm.js がマウスの報告やホイールの変換を出すイベント（`markPointer` の対象。D99）。 */
const POINTER_EVENT_TYPES = ["mousedown", "mouseup", "mousemove", "wheel", "pointerdown", "pointerup", "pointermove"] as const;

export interface TermEntry {
  paneId: string;
  term: Terminal;
  /**
   * 作ったときの scrollback の行数（`getScrollbackLines` を省いたときは `undefined`＝xterm.js の既定）。
   * **購読（`ViewSync`）はこの値を使う**——利用者が途中で設定を変えても、xterm の容量と SNAPSHOT に求める行数を
   * 食い違わせない（20260921-herdr-settings-gaps の D6）。
   */
  scrollback: number | undefined;
  element: HTMLElement;
  webgl: boolean;
  lastUsed: number;
  copy: CopyTarget;
}

export interface TerminalRegistryOptions {
  /** LRU の容量（デスクトップ 24・モバイル 2。D28・D60）。 */
  capacity: number;
  conn: ConnectionPort;
  renderers: RendererPool;
  keys: KeyInputController;
  /** `MouseBridge` は pane ごとに作る（`UiPort`・`rightClick` の設定が pane ごとに違うため）。 */
  createMouseBridge: (term: Terminal, paneId: string) => MouseBridge;
  /**
   * フォーカスの報告（`CSI ? 1004`。xterm.js が focus/blur のたびに `onData` で `\x1b[I`/`\x1b[O` を出す）は、
   * サイズ権限を持つクライアントだけが送る（design「問い合わせの握りつぶし」）。省略時は常に送る。
   */
  hasSizeAuthority?: (paneId: string) => boolean;
  /** `Terminal` の生成オプションの上書き（`host.windowsBuild` からの `windowsPty` 等。T26 が渡す）。 */
  terminalOptions?: Partial<ITerminalOptions>;
  /**
   * 作る xterm.js の `scrollback`（行数）。**ここで読んだ値を `TermEntry.scrollback` に持ち、`pane.subscribe` で SNAPSHOT に求める
   * 行数（`ViewSync`）もその値を使う**（20260921-herdr-settings-gaps の D6。D107：以前は指定せず、xterm.js の既定の 1,000 行を
   * 超える分を捨てていた）。省略時は xterm.js の既定。
   */
  getScrollbackLines?: () => number;
  /** 作る xterm.js の配色（いま使っているテーマ。20260921-theme-settings）。省略時は既定（dracula）。開いている端末は `setTheme` で替える。 */
  getTheme?: () => ITheme;
  /**
   * 端末内の画像の addon を作る（20260926-kitty-graphics）。省略時は実物（`@xterm/addon-image`）。`null` を返せば画像無し。
   * 読み込みで投げた場合も画像無しで続ける。
   */
  createImageAddon?: () => ITerminalAddon | null;
  /**
   * 端末への paste イベントにテキストが無く画像があったとき（20260927-clipboard-image-paste。macOS の Cmd+V・ブラウザのメニュー・スマートフォンの長押し）。
   * 省略時は今までどおり xterm.js に任せる（画像だけの貼り付けは空の貼り付けになる）。
   */
  onImagePaste?: (paneId: string, blob: Blob) => void;
  now?: () => number;
}

/**
 * `TerminalSinkPort` の実装（architecture.md「term/TerminalRegistry.ts」）。pane の id → `TermEntry` の LRU。
 *
 * **architecture の宣言との差**（実装時の判断）: architecture のコンストラクタの型は
 * `(capacity, conn, renderers, keys, mouse: MouseBridge, queries: QueryFilter)` だが、
 * `MouseBridge` は pane ごとの `term`/`paneId`/`rightClick` を持って構築する設計にした（T11）ので、
 * 単一のインスタンスではなく **pane ごとに作るファクトリ**（`createMouseBridge`）を受け取る。
 * `QueryFilter`（T4）は状態を持たない関数（`installQueryFilter`）なので、注入せずそのまま呼ぶ。
 */
export class TerminalRegistry implements TerminalSinkPort {
  private readonly entries = new Map<string, TermEntry>();
  private readonly mouseBridges = new Map<string, MouseBridge>();
  private readonly keyDisposables = new Map<string, { dispose(): void }>();
  private readonly visible = new Set<string>();
  /**
   * 今の接続でまだ購読していない pane（D107）。作ったとき（`acquire`）と、接続が替わったとき（`markAllUnsubscribed`）に入れ、
   * 表示したとき（`ViewSync.commit` が `takePendingSubscriptions` で取り出す）に `pane.subscribe` を送る。
   */
  private readonly unsubscribed = new Set<string>();
  private readonly now: () => number;
  private inputEnabled = true;
  /**
   * pane 以外の端末の受け手（独自コマンドの popup。20260927-custom-command-keys）。popup の端末は prefix を横取りさせないので registry の外で作り、
   * OUTPUT・SNAPSHOT・大きさの変化だけをここから回す。
   */
  private readonly externals = new Map<string, TerminalSinkPort>();

  constructor(private readonly opts: TerminalRegistryOptions) {
    this.now = opts.now ?? (() => Date.now());
  }

  get(paneId: string): TermEntry | undefined {
    return this.entries.get(paneId);
  }

  acquire(paneId: string): TermEntry {
    const existing = this.entries.get(paneId);
    if (existing) {
      existing.lastUsed = this.now();
      this.visible.add(paneId);
      return existing;
    }
    const entry = this.create(paneId);
    this.entries.set(paneId, entry);
    this.visible.add(paneId);
    this.unsubscribed.add(paneId);
    this.evictIfNeeded();
    return entry;
  }

  release(paneId: string): void {
    this.visible.delete(paneId);
  }

  /**
   * 開いている全端末の配色を替える（20260921-theme-settings の AC2）。**`options.theme` を代入するだけ**——xterm.js は色だけを作り直し
   * （WebGL も追従する）、画面の中身・scrollback・選択・スクロールの位置は触らない（research F21。AC-I5）。端末は作り直さない。
   */
  setTheme(theme: ITheme): void {
    for (const entry of this.entries.values()) entry.term.options.theme = theme;
  }

  /**
   * その pane が**いま画面に出ているか**（20260920-agent-notifications の AC3）。
   * `visible` は `TerminalPane.vue` の `onMounted`／`onBeforeUnmount` だけが出し入れするので、
   * 「`TerminalPane` が DOM にマウントされている」と同義。zoom 中は 1 つ、モバイルは常に 1 つ、
   * 切り離し・ログイン待ちでは `app-shell` ごと unmount されるので空になる——**どれも正しく出る**。
   *
   * **`visible` は Vue の reactive ではない**ので `watch` できない。知らせる直前に pull で読むこと。
   * 読む側は **`await nextTick()` の後**に呼ぶ（mount/unmount のフックは Vue のパッチ後に走るので、
   * 途中で読むと tab の切り替え中に空を拾う）。
   */
  isVisible(paneId: string): boolean {
    return this.visible.has(paneId);
  }

  evictIfNeeded(): void {
    if (this.entries.size <= this.opts.capacity) return;
    const evictable = [...this.entries.values()]
      .filter((e) => !this.visible.has(e.paneId))
      .sort((a, b) => a.lastUsed - b.lastUsed);
    let overBy = this.entries.size - this.opts.capacity;
    for (const entry of evictable) {
      if (overBy <= 0) break;
      this.dispose(entry.paneId);
      overBy--;
    }
  }

  /**
   * `shown`（今 commit する表示の pane。`ViewSync.commit` が渡す）のうち、今の接続でまだ購読していないものを取り出す
   * （返したものは購読済みとして扱う）。隠れている pane は、次に表示されるまで残す（D107：再接続の後に、LRU に残っている
   * 全ての端末の SNAPSHOT を一度に取り寄せない）。
   */
  takePendingSubscriptions(shown: Iterable<string>): string[] {
    const ids: string[] = [];
    for (const paneId of shown) {
      if (this.unsubscribed.delete(paneId)) ids.push(paneId);
    }
    return ids;
  }

  /**
   * 生きている全ての端末を「今の接続では未購読」にする（新しい接続の `client.hello` が通るたび。`ViewSync.onConnectionOpened`
   * が呼ぶ。D107）。サーバは接続ごとに新しい clientId を振り、前の接続の購読を引き継がない——以前は xterm.js を新しく作った
   * ときしか購読を予約しなかったので、再接続の後は表示中の pane に OUTPUT も SNAPSHOT も届かなかった。
   */
  markAllUnsubscribed(): void {
    for (const paneId of this.entries.keys()) this.unsubscribed.add(paneId);
  }

  focus(paneId: string): void {
    this.entries.get(paneId)?.term.focus();
  }

  /**
   * xterm.js が出す入力（キー・貼り付け・IME の確定・マウス報告。すべて `onData` を通る）を止める／再開する
   * （D95：接続が `open` でない間は止める）。xterm.js の `disableStdin` は使わない——6.0.0 では内部の
   * textarea を `readOnly` にするため、モバイルでは再接続のたびにソフトキーボードが閉じてしまいうる。
   * `KeyInputController` が `onData` を通さずに直接送るバイト列（`ExtraKeys` の注入・pending の Ctrl/Alt・
   * prefix の二度押しの `\x02`）はここでは止まらない——未接続なら `Connection.sendInput` が捨てる
   * （止めていることは `ReconnectOverlay` が示している）。
   */
  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
  }

  /** 端末の生成オプションの上書き（`host.windowsBuild` からの `windowsPty` 等）。registry の外で作る端末（独自コマンドの popup）も同じ前提にそろえる。 */
  baseTerminalOptions(): Partial<ITerminalOptions> {
    return { ...this.opts.terminalOptions };
  }

  /**
   * pane 以外の受け手を付ける（独自コマンドの popup）。外す関数を返す（別の受け手に差し替わっていれば何もしない）。
   */
  attachExternal(paneId: string, sink: TerminalSinkPort): () => void {
    this.externals.set(paneId, sink);
    return () => {
      if (this.externals.get(paneId) === sink) this.externals.delete(paneId);
    };
  }

  onOutput(paneId: string, chunk: Uint8Array): void {
    const external = this.externals.get(paneId);
    if (external) return external.onOutput(paneId, chunk);
    this.entries.get(paneId)?.term.write(chunk);
  }

  /**
   * 中身を消し、SNAPSHOT の大きさにして書き直す。**消すのは書き込みの列の中で行う**（`\x1bc`＝RIS。xterm.js は
   * `term.reset()` と同じ処理をする。D107）——`term.reset()` はその場で消すが、xterm.js がまだ処理していない書き込み
   * （`term.write` は非同期に処理する）は消さないので、それが消した後の画面に流れ込み、SNAPSHOT の前に古い出力が
   * 重なる。再接続（D107）・流量制御からの再開（design「流量制御」）のように、既に中身のある端末へ SNAPSHOT が届く経路で
   * 起きうる。大きさは先に変えてよい（その前の書き込みは RIS で消える。RIS は大きさを保つ）。
   */
  onSnapshot(paneId: string, cols: number, rows: number, text: string): void {
    const external = this.externals.get(paneId);
    if (external) return external.onSnapshot(paneId, cols, rows, text);
    const entry = this.entries.get(paneId);
    if (!entry) return;
    entry.term.resize(Math.max(1, cols), Math.max(1, rows));
    entry.term.write(`\x1bc${text}`);
  }

  onSizeChanged(paneId: string, cols: number, rows: number): void {
    const external = this.externals.get(paneId);
    if (external) return external.onSizeChanged(paneId, cols, rows);
    this.entries.get(paneId)?.term.resize(Math.max(1, cols), Math.max(1, rows));
  }

  private create(paneId: string): TermEntry {
    const scrollback = this.opts.getScrollbackLines?.();
    const term = new Terminal({
      allowProposedApi: true,
      theme: this.opts.getTheme?.() ?? toXtermTheme(),
      ...(scrollback !== undefined ? { scrollback } : {}),
      ...this.opts.terminalOptions,
    });
    const element = document.createElement("div");
    term.open(element);

    // 画像の addon（Sixel・iTerm2 のインライン画像。サーバが Kitty graphics を iTerm2 形式に作り直して送る）。
    // 無くても端末は動くので、作れない・読み込めない環境（WebGL の上限と同じく GPU 等の制限）では画像無しで続ける。
    try {
      const image = (this.opts.createImageAddon ?? createImageAddon)();
      if (image) term.loadAddon(image);
    } catch {
      // 画像無しで続ける
    }
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";
    const search = new SearchAddon();
    term.loadAddon(search);
    // 問い合わせの握りつぶしは addon を全部読み込んだ後に登録する（xterm.js のハンドラは後から登録したものが先に呼ばれる。
    // 画像の addon は DA1・XTSMGRAPHICS に自分で答えるので、先に登録するとブラウザから応答が出る。20260926-kitty-graphics D8）。
    installQueryFilter(term);

    this.keyDisposables.set(paneId, this.opts.keys.attach(term, paneId));
    this.mouseBridges.set(paneId, this.opts.createMouseBridge(term, paneId));
    const webgl = this.opts.renderers.tryAcquire(paneId, term);

    // ポインタ操作（マウスの報告・alt screen でのホイールの矢印キーへの変換）から出た入力に印を付ける（D99：
    // `InputGate` は、新しい pane を作る操作の応答待ちの間でも、これは溜めずに元の pane へ送る）。xterm.js は
    // これらを各イベントの処理の中で同期的に `onData` へ出すので、キャプチャ段階で旗を立て、イベントの配送が
    // 終わった後のタスクで下ろす。**マイクロタスクで下ろしてはいけない**——ブラウザ自身が配るイベントでは、
    // リスナーを 1 つ呼び終えるたびにマイクロタスクが走るので、xterm.js のリスナーより前に旗が下りてしまう
    // （実物の Chromium で確認。スクリプトから合成したイベントではこうならないので単体テストでは見えない）。
    let pointerDispatch = false;
    let pointerReset: ReturnType<typeof setTimeout> | undefined;
    const markPointer = (): void => {
      pointerDispatch = true;
      if (pointerReset === undefined) {
        pointerReset = setTimeout(() => {
          pointerDispatch = false;
          pointerReset = undefined;
        }, 0);
      }
    };
    for (const type of POINTER_EVENT_TYPES) element.addEventListener(type, markPointer, { capture: true, passive: true });

    // 画像だけの貼り付け（20260927-clipboard-image-paste）。xterm.js は自分の要素と textarea で paste を受けるので、その祖先で capture して先に見る。
    // テキストがあれば何もしない（今までどおり xterm.js が貼る）。画像を扱うときだけ xterm.js に渡さない（渡すと空の bracketed paste が送られる）。
    const onImagePaste = this.opts.onImagePaste;
    if (onImagePaste) {
      element.addEventListener(
        "paste",
        (ev) => {
          const blob = imageFromDataTransfer((ev as ClipboardEvent).clipboardData);
          if (!blob) return;
          ev.preventDefault();
          ev.stopPropagation();
          onImagePaste(paneId, blob);
        },
        { capture: true },
      );
    }

    term.onData((data) => {
      if (!this.inputEnabled) return; // D95
      if (isFocusReport(data) && this.opts.hasSizeAuthority && !this.opts.hasSizeAuthority(paneId)) return;
      this.opts.conn.sendInput(paneId, data, pointerDispatch ? "pointer" : undefined);
    });

    return {
      paneId,
      term,
      element,
      webgl,
      lastUsed: this.now(),
      copy: new XtermCopyTarget(term, search),
      scrollback,
    };
  }

  /**
   * 全ての端末を捨てる（20260927-multi-host-machines のマシンの切り替え）。pane の id はマシンをまたいで衝突するので、前のマシンの `p1` の中身を
   * 次のマシンの `p1` に見せない。端末の部品（`TerminalPane`）が外れた後に呼ぶ。購読の解除は送らない（その接続はこの後に閉じる）。
   */
  disposeAll(): void {
    for (const paneId of [...this.entries.keys()]) this.dispose(paneId, { notifyServer: false });
  }

  private dispose(paneId: string, opts: { notifyServer?: boolean } = {}): void {
    const entry = this.entries.get(paneId);
    if (!entry) return;
    this.entries.delete(paneId);
    this.visible.delete(paneId);
    this.unsubscribed.delete(paneId);
    this.keyDisposables.get(paneId)?.dispose();
    this.keyDisposables.delete(paneId);
    this.mouseBridges.get(paneId)?.dispose();
    this.mouseBridges.delete(paneId);
    this.opts.renderers.release(paneId);
    entry.term.dispose();
    if (opts.notifyServer !== false) void this.opts.conn.request("pane.unsubscribe", { paneId }).catch(() => undefined);
  }
}

/** xterm.js が focus/blur のときに `onData` へ出す DECSET 1004 の報告（`CSI I` / `CSI O`）そのものか。 */
function isFocusReport(data: string): boolean {
  return data === "\x1b[I" || data === "\x1b[O";
}
