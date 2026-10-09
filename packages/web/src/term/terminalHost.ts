import type { ConnectionPort } from "@sodashitsu/client-core";
import type { TermEntry, TerminalRegistry } from "./TerminalRegistry.js";

/**
 * 端末の要素（`TermEntry.element`）を、どこに載せるかを 1 か所で決める（20261008-graph-first の X4・X8。PR2a）。
 *
 * 端末は pane ごとに 1 つで、要素は DOM の 1 か所にしか置けない。載せる先は 2 つ:
 * - 基本画面の `TerminalPane`（入れ物は `mountBase` で届ける）。
 * - グラフの上の窓（`attachToWindow` で入れ物を渡す）。窓が持っている間、基本画面の `TerminalPane` は要素を持たない（付けない・外さない）。
 *
 * `registry` の `acquire`/`release` は、基本画面（"base"）と窓（"window"）の 2 者で数える。窓だけが使っている端末も、LRU（容量 24）に捨てられない。
 *
 * **要素を移す操作は、同期の 1 つの作業で終える**（移す → 描き直し → 呼び側がフォーカスを置き直す）。`display/focusDrop.ts` の見回りは、フォーカスが `body` に
 * 落ちた状態を `setTimeout`・`setInterval` で見るので、同じ作業の中でフォーカスを付け直せば、`body` を見せない（`withDisplayChange` と同じ流儀。守りのファイルは変えない）。
 * 戻した先が `inert` の基本画面のときは、`focus()` は効かない（呼び側が、グラフのノードなど、戻す先を決める）。
 */
export interface BaseMount {
  /** 基本画面の `TerminalPane` の、端末を入れる箱。 */
  mount: HTMLElement;
  /** 端末の入力欄の `tabIndex` を、選んでいる pane だけ 0 にする（`TerminalPane.syncTabStop`）。 */
  syncTabStop(): void;
}

export interface TerminalHostOptions {
  registry: TerminalRegistry;
  /** 窓のための購読（`pane.subscribe`）に使う。無ければ購読しない（テスト）。 */
  conn?: Pick<ConnectionPort, "request">;
  /** 購読の行数の予備（端末を作ったときの値が無いとき）。 */
  getScrollbackLines: () => number;
}

export class TerminalHost {
  private readonly bases = new Map<string, BaseMount>();
  /** 窓が持っている端末（pane → 窓の入れ物）。 */
  private readonly windows = new Map<string, HTMLElement>();

  constructor(private readonly opts: TerminalHostOptions) {}

  /** 窓が、その pane の端末の要素を持っているか。 */
  heldByWindow(paneId: string): boolean {
    return this.windows.has(paneId);
  }

  /**
   * 基本画面の `TerminalPane` が端末を借りる。要素は、窓が持っていなければ入れ物へ載せる。返した `entry` は `unmountBase` まで使える。
   */
  mountBase(paneId: string, base: BaseMount): TermEntry {
    const entry = this.opts.registry.acquire(paneId, "base");
    this.bases.set(paneId, base);
    if (!this.windows.has(paneId)) base.mount.appendChild(entry.element);
    return entry;
  }

  /** 基本画面の `TerminalPane` が外れる。要素を外すのは、基本画面に載っているときだけ（窓が持っていれば触らない）。 */
  unmountBase(paneId: string, base: BaseMount): void {
    if (this.bases.get(paneId) === base) this.bases.delete(paneId);
    const entry = this.opts.registry.get(paneId);
    if (entry && !this.windows.has(paneId) && entry.element.parentElement === base.mount) entry.element.remove();
    this.opts.registry.release(paneId, "base");
  }

  /**
   * 端末の要素を窓の入れ物へ移す。基本画面に載っていれば、そこから外れる（`appendChild` が親を替える）。その pane が基本画面に無くても（別の tab・別の workspace）、
   * 窓が端末を借りる。移した直後に描き直す。同じ pane を既に持っているなら、入れ物だけを替える。
   */
  attachToWindow(paneId: string, container: HTMLElement): TermEntry {
    const entry = this.opts.registry.acquire(paneId, "window");
    this.windows.set(paneId, container);
    container.appendChild(entry.element);
    this.repaint(entry);
    return entry;
  }

  /**
   * 端末の要素を窓から返す。基本画面の `TerminalPane` がその pane を載せていればそこへ、無ければ要素を外す（端末の実体は残る。購読も外さない。X4）。
   * 窓の持ち主を手放す。持っていなければ何もしない。
   */
  detachFromWindow(paneId: string): void {
    if (!this.windows.delete(paneId)) return;
    const entry = this.opts.registry.get(paneId);
    const base = this.bases.get(paneId);
    if (entry) {
      if (base) {
        base.mount.appendChild(entry.element);
        base.syncTabStop();
        this.repaint(entry);
      } else entry.element.remove();
    }
    this.opts.registry.release(paneId, "window");
  }

  /** 窓のために、その pane の購読を送る（今の接続でまだ購読していないときだけ）。基本画面に載っている pane は、`ViewSync` が送る。 */
  ensureSubscribed(paneId: string): void {
    const { registry, conn } = this.opts;
    if (!conn) return;
    for (const id of registry.takePendingSubscriptions([paneId])) {
      // 作ったときの値を使う（`ViewSync` と同じ。xterm の容量と求める行数を食い違わせない）。
      const scrollbackLines = registry.get(id)?.scrollback ?? this.opts.getScrollbackLines();
      void conn.request("pane.subscribe", { paneId: id, scrollbackLines }).catch(() => undefined);
    }
  }

  /** 窓が持っている pane の一覧（再接続の後に、購読と直結をし直すため）。 */
  windowPaneIds(): string[] {
    return [...this.windows.keys()];
  }

  /** 要素を移した後、WebGL の描画が切れないよう全行を描き直す。 */
  private repaint(entry: TermEntry): void {
    try {
      entry.term.refresh(0, Math.max(0, entry.term.rows - 1));
    } catch {
      // 描画前（レイアウトの無い環境）では何もしない
    }
  }
}
