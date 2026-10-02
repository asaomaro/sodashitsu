import { WebLinksAddon } from "@xterm/addon-web-links";
import type { ILink, ILinkDecorations, ILinkProvider, Terminal } from "@xterm/xterm";
import { writeClipboard } from "./clipboard.js";
import type { ResolvedFile } from "@sodashitsu/protocol";
import { createFileLinkProvider } from "./fileLinks.js";

/**
 * M3：pane（`MouseBridge` が右クリックから作る。`PaneFrame` の枠も同じ）・tab・workspace（T22・T21 が直接 `UiPort` を呼ぶ）。
 * `global` はサイドバーの「メニュー」ボタンから開く、どこにも属さない全体の操作（20260920-sidebar-tabbar-controls）。
 * `group` は手動グループのヘッダー行専用のメニュー（20260923-workspace-grouping。design「振る舞いの詳細
 * （グループの作成・追加・削除）」）——worktree 自動グループのヘッダー行は無い（本体の workspace 行自体が
 * それを兼ねる。design「worktree 自動グループの表示」）ので `kind: "group"` は手動グループにしか出ない。
 */
export type MenuTarget =
  | { kind: "pane"; paneId: string }
  | { kind: "tab"; tabId: string }
  | { kind: "workspace"; workspaceId: string }
  | { kind: "group"; groupId: string }
  | { kind: "global" };

export interface UiPort {
  openContextMenu(target: MenuTarget, at: { x: number; y: number }): void;
  toast(message: string): void;
}

export interface MouseBridgeOptions {
  term: Terminal;
  paneId: string;
  ui: UiPort;
  /** その pane の `rightClick` 設定（design「WebSocket の通信」の `Pane.rightClick`）。呼ぶたびに最新の値を返す。 */
  getRightClickTarget: () => "herdr" | "pane";
  writeClipboard?: typeof writeClipboard;
  /**
   * リンクを開く（M6）。省略時は {@link openLinkInNewTab}。呼ぶのは、修飾キーを押しながらの主ボタンのクリックで、
   * scheme が http/https のときだけ（`MouseBridge` が確かめてから呼ぶ。D110）。
   */
  openLink?: (uri: string) => void;
  /** macOS か（リンクを開く修飾キーが Ctrl ではなく Cmd になる。M6）。省略時は {@link isMacPlatform}。テスト用の差し替え口。 */
  isMac?: boolean;
  /**
   * ファイルのリンク（出力の中の実在するパス・OSC 8 の `file:`）。URL と同じ条件（修飾キーを押しながらの主ボタンのクリック）で開く。
   * 開く方法（サーバのマシンのアプリで開く・ダウンロード）は呼ばれる側（`FileTransfer`）が決める。省略時はファイルのリンクを作らない。
   */
  files?: {
    /** パスを確かめる（`paths` と同じ並び。無ければ null）。 */
    resolve(paneId: string, paths: string[]): Promise<(ResolvedFile | null)[]>;
    open(file: ResolvedFile): void;
    openUri(paneId: string, uri: string): void;
  };
}

/** リンクとして開く scheme（M6。D110）。xterm.js が OSC 8 で既定で通す範囲・`WebLinksAddon` が拾う範囲と同じ。 */
const OPENABLE_LINK_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

/**
 * 開いてよいリンクか（M6。D110）：http/https だけ。`javascript:`（このページの権限で動く）・`file:`・`mailto:`・独自の scheme 等は
 * 開かない。OSC 8 はアプリが任意の URI を出せ、表示の文字と行き先が違ってよいので、xterm.js の既定（`allowNonHttpProtocols: false`）
 * に加えてここでも確かめる。
 */
export function isOpenableLinkUri(uri: string): boolean {
  try {
    return OPENABLE_LINK_PROTOCOLS.has(new URL(uri).protocol);
  } catch {
    return false;
  }
}

/** `file:` の URI か（OSC 8 のファイルのリンク。開くのは `MouseBridgeOptions.files` があるときだけ）。 */
export function isFileLinkUri(uri: string): boolean {
  try {
    return new URL(uri).protocol === "file:";
  } catch {
    return false;
  }
}

/** macOS（iPadOS を含む）か。リンクを開く修飾キーを Cmd にする（M6。xterm.js の内部の判定と同じく platform の文字列で見る）。 */
export function isMacPlatform(): boolean {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** 新しいタブで開く（M6）。`noopener,noreferrer`：開いた先から `window.opener` でこのページを操れず、Referer も送らない。 */
export function openLinkInNewTab(uri: string): void {
  window.open(uri, "_blank", "noopener,noreferrer");
}

/**
 * pane 内のマウス操作のうち、xterm.js の外で足す分（architecture.md「term/MouseBridge」）。
 * M1（クリックでフォーカス）・M2（Splitter）・M3（メニューの内容）・M7 の後半（pane の枠。`PaneFrame`）・M8（ホイール）・
 * M9（スクロールバー）はほかの部品（`TerminalPane`・`Splitter`・`ContextMenu`・`PaneFrame`）の担当。
 */
export class MouseBridge {
  private readonly writeClipboardImpl: typeof writeClipboard;
  private readonly openLinkImpl: (uri: string) => void;
  private readonly isMac: boolean;
  private readonly disposables: { dispose(): void }[] = [];
  /** リンクを開く修飾キー（Ctrl。macOS は Cmd）を今押しているか（M6：リンクに下線と指のカーソルを出す条件。D110）。 */
  private linkModifierHeld = false;
  /** 今ポインタが重なっているリンク（xterm.js が hover/leave で知らせる。修飾キーの変化を下線に反映する先。D110）。 */
  private hoveredLink: ILink | null = null;
  /** 握りつぶした副ボタンのクリックの押下に対応する、離したときの mouseup の待ちを外す関数（M7。D110）。 */
  private cancelMouseUpSwallow: (() => void) | null = null;

  constructor(private readonly opts: MouseBridgeOptions) {
    this.writeClipboardImpl = opts.writeClipboard ?? writeClipboard;
    this.openLinkImpl = opts.openLink ?? openLinkInNewTab;
    this.isMac = opts.isMac ?? isMacPlatform();
    const { term } = opts;

    // M6（D110）：OSC 8 のリンク（`linkHandler`。無いと xterm.js は修飾キーを見ずに `confirm()` を出して開く）と、
    // 出力の中の http(s) の URL（`WebLinksAddon`。以前は handler が修飾キーを見ず、ただのクリックで開いていた）の両方を、
    // 同じ条件（`activateLink`）で開く。
    // ファイルのリンクを扱うときは、OSC 8 の `file:` を通すために xterm.js の scheme の検査を外し、代わりにここで絞る
    // （`isActivatableUri`：http/https と `file:` 以外は、リンクにもしない）。
    const files = opts.files;
    term.options.linkHandler = { activate: (ev, uri) => this.activateLink(ev, uri), allowNonHttpProtocols: files !== undefined };
    const linksAddon = new WebLinksAddon((ev, uri) => this.activateLink(ev, uri));
    term.loadAddon(linksAddon);
    this.disposables.push(linksAddon);
    // 出力の中の実在するパス。URL の提供元の後に登録する（重なったら URL のリンクが勝つ）。
    const fileLinks = new WeakSet<ILink>();
    if (files) {
      const provider = createFileLinkProvider({
        term,
        resolve: (paths) => files.resolve(opts.paneId, paths),
        activate: (ev, file) => {
          if (this.isLinkClick(ev)) files.open(file);
        },
      });
      const provideLinks = provider.provideLinks.bind(provider);
      provider.provideLinks = (y, callback) =>
        provideLinks(y, (links) => {
          links?.forEach((link) => fileLinks.add(link));
          callback(links);
        });
      this.disposables.push(term.registerLinkProvider(provider));
    }
    // 下線と指のカーソルは、修飾キーを押している間だけ出す（design M6「Ctrl を押しながら重ねると下線を出す」）。
    // 開けない scheme の OSC 8 のリンクはここで落とす（ファイルのリンクの `text` はパスで、URI ではない——そのまま通す）。
    this.disposables.push(
      decorateLinkProviders(term, (links) =>
        links.filter((link) => fileLinks.has(link) || this.isActivatableUri(link.text)).map((link) => this.decorateLink(link)),
      ),
    );
    const onKey = (ev: KeyboardEvent): void => this.setLinkModifierHeld(this.isLinkModifier(ev));
    const onWindowBlur = (): void => this.setLinkModifierHeld(false);
    // キャプチャ：xterm.js・`KeyInputController` がキーを処理する前に、押している修飾キーを覚える（端末以外にフォーカスがあっても効く）。
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKey, true);
    // Ctrl を押したまま別の窓・タブへ移ると keyup が届かないので、窓を離れたら「押していない」に戻す。
    window.addEventListener("blur", onWindowBlur);
    this.disposables.push({
      dispose: () => {
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("keyup", onKey, true);
        window.removeEventListener("blur", onWindowBlur);
      },
    });

    const el = term.element;
    if (el) {
      const onMouseDownCapture = (ev: MouseEvent): void => this.handleMouseDownCapture(ev);
      const onMouseMoveCapture = (ev: MouseEvent): void => this.setLinkModifierHeld(this.isLinkModifier(ev));
      const onMouseUp = (): void => this.handleMouseUp();
      const onContextMenu = (ev: MouseEvent): void => this.handleContextMenu(ev);
      // mousedown・mousemove はキャプチャで受ける：xterm.js の mousedown（マウスの報告を送る）・リンクの判定（mousemove）は、
      // どちらも `term.element` とその子に bubble で付いているので、その前に走る（D110）。
      el.addEventListener("mousedown", onMouseDownCapture, true);
      el.addEventListener("mousemove", onMouseMoveCapture, { capture: true, passive: true });
      el.addEventListener("mouseup", onMouseUp);
      el.addEventListener("contextmenu", onContextMenu);
      this.disposables.push({
        dispose: () => {
          el.removeEventListener("mousedown", onMouseDownCapture, true);
          el.removeEventListener("mousemove", onMouseMoveCapture, true);
          el.removeEventListener("mouseup", onMouseUp);
          el.removeEventListener("contextmenu", onContextMenu);
        },
      });
    }
  }

  dispose(): void {
    this.cancelMouseUpSwallow?.();
    for (const d of this.disposables) d.dispose();
    this.hoveredLink = null;
  }

  /** M4: 選択の終了（mouseup）時点でコピーする（`ui.copy_on_select` の既定 true）。 */
  private handleMouseUp(): void {
    if (!this.opts.term.hasSelection()) return;
    const text = this.opts.term.getSelection();
    void this.writeClipboardImpl(text).then((ok) => {
      if (ok) this.opts.ui.toast("コピーしました");
      else this.opts.ui.toast("コピーできませんでした");
    });
  }

  /** アプリがマウスの報告を求めているか（DECSET 1000/1002/1003 等。xterm.js が報告を作る状態）。 */
  private appWantsMouseReports(): boolean {
    return this.opts.term.modes.mouseTrackingMode !== "none";
  }

  /** M7: 右クリックをアプリへ渡すか（`rightClick` が `pane` で、アプリがマウスの報告を求めているときだけ）。それ以外はメニューを開く。 */
  private rightClickGoesToApp(): boolean {
    return this.opts.getRightClickTarget() === "pane" && this.appWantsMouseReports();
  }

  /**
   * 右クリック（メニューを開くクリック）の押下か：右ボタン。macOS では Ctrl＋主ボタンのクリックも副ボタンのクリックとして
   * contextmenu になる（xterm.js はこれを左ボタンの押下として報告する）。
   */
  private isSecondaryClick(ev: MouseEvent): boolean {
    return ev.button === 2 || (this.isMac && ev.button === 0 && ev.ctrlKey);
  }

  /**
   * M7（D110）：右クリックでメニューを開くときは、アプリがマウスの報告を求めていても、そのボタンの報告を送らない。
   * xterm.js は `term.element` の mousedown（bubble）で押した報告を送り、同じ処理の中で document に離した報告の listener を
   * 付けるので、キャプチャで先に受けて止めれば、押した・離したのどちらの報告も出ない（以前は contextmenu でメニューを開くだけで、
   * メニューと一緒に `\e[<2;…M`・`\e[<2;…m` がアプリへ届いていた。D109）。止めると xterm.js の mousedown の既定の処理
   * （ブラウザの既定の動作を止めてフォーカスする）も走らないので、同じことをここで行う（M1。`TerminalPane` のキャプチャの
   * `focusPane` は、既に選ばれている pane では DOM のフォーカスを戻さない）。
   * アプリが報告を求めていないときは xterm.js も報告を作らないので、何もせず xterm.js に任せる。
   */
  private handleMouseDownCapture(ev: MouseEvent): void {
    if (!this.isSecondaryClick(ev) || !this.appWantsMouseReports() || this.rightClickGoesToApp()) return;
    ev.stopPropagation();
    ev.preventDefault();
    this.opts.term.focus();
    this.swallowMouseUp(ev.button);
  }

  /**
   * 握りつぶした押下に対応する（同じボタンの）mouseup を、document のキャプチャで止める（D110）。ふだんは xterm.js の離した報告の
   * listener は付かない（付けるのは止めた mousedown の処理）が、ほかのボタンを押したまま右クリックすると、そのボタンの押下で
   * 付いた listener が右ボタンの離した報告を送るため。そのボタンの mouseup を 1 回止めたら外す。
   * - 離したのを取りこぼしたとき（押している間に窓のフォーカスを奪われた・窓の外で離した等）に待ちが残ると、後の関係の無い同じ
   *   ボタンの mouseup（「pane に送る」の右ボタンの離した報告、macOS の Ctrl＋クリックなら次の左クリックの離した報告・選択の終わり・
   *   M4 のコピー）を止めてしまう。窓の blur と、次の押下・動き（document のキャプチャ）でそのボタンが離れている
   *   （`buttons` にそのビットが無い）と分かった時点でも外す（独立点検 #1）。
   * - 止めたのが最後に離したボタン（`buttons` が 0）なら、xterm.js のマウスの追跡を終わらせる（{@link releaseXtermMouseTracking}。
   *   独立点検 #3：左を押す → 右を押す → 左を離す → 右を離す、の順では、左を離したときは右がまだ押されているので xterm.js は
   *   document の listener を外さず、最後の右の mouseup をここで止めると、その後の関係の無い mouseup・ドラッグがアプリへ報告された）。
   */
  private swallowMouseUp(button: number): void {
    this.cancelMouseUpSwallow?.();
    const doc = this.opts.term.element?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const bit = buttonsBit(button);
    const onMouseUp = (ev: MouseEvent): void => {
      if (ev.button !== button) return;
      ev.stopPropagation();
      this.cancelMouseUpSwallow?.();
      if (ev.buttons === 0) releaseXtermMouseTracking(doc, ev);
    };
    const onPointerState = (ev: MouseEvent): void => {
      if ((ev.buttons & bit) === 0) this.cancelMouseUpSwallow?.();
    };
    const onWindowBlur = (): void => this.cancelMouseUpSwallow?.();
    // 押下の処理の中で付けるので、この押下そのものの document のキャプチャ（既に過ぎた）には呼ばれない。
    doc.addEventListener("mouseup", onMouseUp, true);
    doc.addEventListener("mousedown", onPointerState, true);
    doc.addEventListener("mousemove", onPointerState, true);
    win.addEventListener("blur", onWindowBlur);
    this.cancelMouseUpSwallow = () => {
      doc.removeEventListener("mouseup", onMouseUp, true);
      doc.removeEventListener("mousedown", onPointerState, true);
      doc.removeEventListener("mousemove", onPointerState, true);
      win.removeEventListener("blur", onWindowBlur);
      this.cancelMouseUpSwallow = null;
    };
  }

  /**
   * M7: `rightClick` が `pane` で、アプリがマウス報告を求めているときは、右クリックをアプリへ渡す
   * （ブラウザの既定のメニューだけ止める。xterm.js 自身の mousedown ハンドラが報告を送る）。
   * それ以外は常にメニューを開く（そのときの報告は `handleMouseDownCapture` が止めている）。
   */
  private handleContextMenu(ev: MouseEvent): void {
    ev.preventDefault();
    if (this.rightClickGoesToApp()) return; // アプリへ渡す（何もしない）
    this.opts.ui.openContextMenu({ kind: "pane", paneId: this.opts.paneId }, { x: ev.clientX, y: ev.clientY });
  }

  /** リンクを開く修飾キーか（M6：Ctrl。macOS は Cmd——macOS の Ctrl＋クリックは副ボタンのクリック＝メニューになる）。 */
  private isLinkModifier(ev: MouseEvent | KeyboardEvent): boolean {
    return this.isMac ? ev.metaKey : ev.ctrlKey;
  }

  /**
   * M6（D110）：修飾キーを押しながらの主ボタンのクリックで、http/https のリンクだけを新しいタブに開く。
   * ただのクリック（タッチ端末のタップを含む——修飾キーが無い）・右クリック（xterm.js はボタンを見ずに離したときに開く）では開かない。
   */
  private activateLink(ev: MouseEvent, uri: string): void {
    if (!this.isLinkClick(ev)) return;
    if (this.opts.files && isFileLinkUri(uri)) return this.opts.files.openUri(this.opts.paneId, uri);
    if (!isOpenableLinkUri(uri)) return;
    this.openLinkImpl(uri);
  }

  /** リンクを開くクリックか（修飾キーを押しながらの主ボタン）。 */
  private isLinkClick(ev: MouseEvent): boolean {
    return ev.button === 0 && this.isLinkModifier(ev);
  }

  /** リンクとして扱う URI か（http/https。ファイルのリンクを扱うときは `file:` も）。 */
  private isActivatableUri(uri: string): boolean {
    return isOpenableLinkUri(uri) || (this.opts.files !== undefined && isFileLinkUri(uri));
  }

  /**
   * 提供元が返したリンクに、修飾キーの状態で決まる下線・指のカーソルと、重なりの追跡を付ける（D110）。xterm.js は、リンクに
   * 重なったとき `decorations` を読んで下線を出すかを決め、その後 `decorations` を自分の追跡用のもの（代入すると下線を出し直す）
   * へ差し替える。初めは今の修飾キーの状態を返す読み取り口を渡し、差し替えの前の代入は捨てる。
   */
  private decorateLink(link: ILink): ILink {
    link.decorations = Object.defineProperties({} as ILinkDecorations, {
      underline: { get: () => this.linkModifierHeld, set: () => undefined, enumerable: true, configurable: true },
      pointerCursor: { get: () => this.linkModifierHeld, set: () => undefined, enumerable: true, configurable: true },
    });
    const { hover, leave } = link;
    link.hover = (ev, text) => {
      this.hoveredLink = link;
      // 同じ行の中で前に重なったリンクへ戻ると、xterm.js は前回の状態で下線を出す——今の状態に合わせ直す。
      this.applyLinkDecorations();
      hover?.call(link, ev, text);
    };
    link.leave = (ev, text) => {
      if (this.hoveredLink === link) this.hoveredLink = null;
      leave?.call(link, ev, text);
    };
    return link;
  }

  private setLinkModifierHeld(held: boolean): void {
    if (held === this.linkModifierHeld) return;
    this.linkModifierHeld = held;
    this.applyLinkDecorations();
  }

  /** 重なっているリンクの下線・指のカーソルを今の修飾キーの状態にする（xterm.js の追跡用の `decorations` への代入で描き直される）。 */
  private applyLinkDecorations(): void {
    const decorations = this.hoveredLink?.decorations;
    if (!decorations) return;
    decorations.underline = this.linkModifierHeld;
    decorations.pointerCursor = this.linkModifierHeld;
  }
}

/** `MouseEvent.button`（主 0・中 1・副 2・…）に当たる `MouseEvent.buttons` のビット（主 1・副 2・中 4・…）。 */
function buttonsBit(button: number): number {
  if (button === 1) return 4;
  if (button === 2) return 2;
  return 1 << button;
}

/**
 * xterm.js のマウスの追跡（押下の後に document へ付ける mouseup・ドラッグの mousemove の listener）を終わらせる（D110。独立点検 #3）。
 * xterm.js は、どのボタンも押していない（`buttons` が 0）mouseup を受けるとこれらを外す。止めた mouseup の代わりに、報告にならない
 * ボタン（4 つ目＝`button` 3。xterm.js は主・中・副の 3 つとホイールしか報告せず、それ以外の離した報告は作らない）の mouseup を
 * document へ送って外させる——右ボタンの離した報告はアプリへ送らない。xterm.js が追跡していなければ何も起きない。
 */
function releaseXtermMouseTracking(doc: Document, like: MouseEvent): void {
  doc.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 3, buttons: 0, clientX: like.clientX, clientY: like.clientY }));
}

/**
 * xterm.js に登録済みのリンクの提供元（OSC 8 の `OscLinkProvider` と `WebLinksAddon`）が返すリンクに手を加える（M6。D110）。
 * OSC 8 の提供元は xterm.js が作るときに内部で登録し、公開 API からは差し替えられないので、内部の
 * `_core._linkProviderService.linkProviders` を読む（`term/measure.ts` の `getCellSize` と同じく、版を固定した xterm.js 6.0.0 の
 * 内部）。見つからなければ何もしない——開くかどうか（修飾キー・scheme）は公開 API の handler（`linkHandler`・`WebLinksAddon`）で
 * 確かめているので、そのとき崩れるのは下線・カーソルの出し分けだけ（xterm.js の既定の「重ねると常に下線」に戻る）。
 * 配列は差し替えず、各提供元の `provideLinks` を包む（`WebLinksAddon` の dispose が配列から自分を探して外せるように）。
 */
function decorateLinkProviders(term: Terminal, decorate: (links: ILink[]) => ILink[]): { dispose(): void } {
  const core = (term as unknown as { _core?: { _linkProviderService?: { linkProviders?: unknown } } })._core;
  const providers = core?._linkProviderService?.linkProviders;
  if (!Array.isArray(providers)) return { dispose: () => undefined };
  const restores: (() => void)[] = [];
  for (const provider of providers as ILinkProvider[]) {
    const original = provider.provideLinks;
    provider.provideLinks = (y, callback) => original.call(provider, y, (links) => callback(links ? decorate(links) : undefined));
    restores.push(() => {
      provider.provideLinks = original;
    });
  }
  return { dispose: () => restores.forEach((restore) => restore()) };
}
