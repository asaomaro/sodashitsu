import type { Terminal } from "@xterm/xterm";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { getCellSize as defaultGetCellSize, measure, type CellSize } from "./measure.js";
import type { TerminalRegistry } from "./TerminalRegistry.js";

export interface ViewSyncOptions {
  conn: ConnectionPort;
  registry: TerminalRegistry;
  /**
   * このブラウザが使う行数（`term/scrollback.ts` の `effectiveScrollback`。20260921-herdr-settings-gaps）。
   * **購読には、その端末を作ったときの値（`TermEntry.scrollback`）を優先する**——これは作ったときの値が無い
   * （`TerminalRegistry` に `getScrollbackLines` を渡していない）ときの予備。
   */
  getScrollbackLines: () => number;
  /** テスト用の差し替え（happy-dom にはレイアウトが無く、実物のセル寸法は測れない）。 */
  getCellSize?: (term: Terminal) => CellSize;
}

/** 葉の代わりに測った枠の大きさ（CSS px。`ViewCommit.measureSinglePane` が返す）。 */
export interface MeasuredSize {
  width: number;
  height: number;
}

export interface ViewCommit {
  workspaceId: string;
  tabId: string;
  visible: { paneId: string; element: HTMLElement }[];
  /**
   * **表示が 1 つの pane だけのとき**、葉の要素の代わりにその枠の大きさを測る関数（D108。root の `PaneLayout` の
   * `measureSinglePane` をそのまま渡す）。省略したら葉の `getBoundingClientRect()`（デスクトップ）。モバイル（`MobileShell`）は
   * 葉を縮小の枠（`naturalSize` × `scale`。`naturalSize` はサーバの PTY の大きさ × セルの寸法）の中に置くので、葉を測ると
   * 「PTY の大きさ」を申告し直すことになる（fit 中は「この端末に合わせる」が画面の大きさへ広げも縮めもできず、変化に追従させると
   * PTY の大きさ → 葉 → 申告 → PTY の大きさの循環になる。D107）。モバイルはここで表示領域（上部のバー・追加キーの列を除いた
   * pane の置き場）の大きさを返す。
   *
   * 表示領域の全体を 1 つの pane に当てる測り方なので、**pane ごとの口ではない**：`visible` が 2 つ以上の commit では使わず葉を
   * 測る（開発時は 1 度だけ警告する。D108 の独立点検 #2）。
   */
  measureSinglePane?: ((paneId: string, element: HTMLElement) => MeasuredSize) | undefined;
}

/**
 * `client.view`（表示とサイズ）→ 予約された `pane.subscribe` の順で送る（architecture.md「term/ViewSync」）。
 * サイズを決めてからスナップショットを取るため、サーバ側の処理順を守る必要がある——`ConnectionPort.request`
 * は呼んだ時点で同期的に WebSocket へ送るので（`net/Connection`）、応答を待たずに続けて呼べば順序は保たれる。
 *
 * **接続が替わるたびに表示と購読を張り直す**（D107。統合 review ラウンド1 で発見）。サーバは接続ごとに新しい clientId を振り、
 * 購読・表示（`client.view`）・`client.fit` をその clientId に持つ。以前は同じ内容の `client.view` を接続をまたいで送らず
 * （`lastPayload` を持ち越していた）、`pane.subscribe` も xterm.js を新しく作ったときしか予約しなかったので、自動の再接続・
 * 503 等からの再試行・再ログイン・「再接続」ボタンの後は、表示中の pane に OUTPUT も SNAPSHOT も届かず画面が止まっていた
 * （入力だけは PTY に届く）。`onConnectionOpened`（新しい接続の `client.hello` が通るたび。`main.ts` が `Connection.onOpened`
 * につなぐ）で、`lastPayload` を捨て、生きている全ての端末を「この接続では未購読」にし、root の `PaneLayout` が付けた
 * `attachCommitter` の関数で今の表示を commit し直す——`client.view` → 表示中の pane の `pane.subscribe` の順に送られる。
 *
 * **接続が閉じてから次の hello が通るまでは何も送らない**（`onConnectionClosed` で下ろし `onConnectionOpened` で上げる旗。
 * D107・独立点検の指摘）。WebSocket が開いてから hello の応答が届くまでの間に commit が起きる（大きさの変化のタイマー・
 * レイアウトのイベント・重ね表示越しのクリック）と、`onConnectionOpened` の前に新しい接続へ `client.view`・`pane.subscribe`
 * を送り、表示の無い購読や、SNAPSHOT の二重送りになりえた。送らなかった分は `onConnectionOpened` の commit し直しで送る。
 *
 * **枠の大きさは既定では葉の要素で測り、表示が 1 つの pane だけで `ViewCommit.measureSinglePane` が付いていればそれで測る**
 * （D108）。モバイルは縮小の枠の中の葉ではなく表示領域の大きさを申告する（`mobile/usePaneArea.ts`）。
 */
export class ViewSync {
  private readonly getCellSize: (term: Terminal) => CellSize;
  private lastPayload = "";
  /** 今の接続で hello が通っている（`onConnectionOpened` から `onConnectionClosed` まで。D107）。下りている間は何も送らない。 */
  private connectionReady = false;
  /** 今の表示で commit し直す関数（root の `PaneLayout` が付ける。D107）。 */
  private committer: (() => void) | null = null;
  /** 新しい接続で、まだ `client.view` を送っていない（送ったら `onViewEstablished` の listener を呼ぶ。D107）。 */
  private viewEstablishPending = false;
  private readonly viewEstablishedListeners = new Set<() => void>();
  /** `measureSinglePane` を 2 つ以上の pane の表示で渡された警告を出したか（開発時に 1 度だけ。D108）。 */
  private warnedMultiPaneMeasure = false;

  constructor(private readonly opts: ViewSyncOptions) {
    this.getCellSize = opts.getCellSize ?? defaultGetCellSize;
  }

  commit(view: ViewCommit): void {
    // hello の前は送らない（`lastPayload` も予約の購読も触らない——`onConnectionOpened` の commit し直しで送る。D107）。
    if (!this.connectionReady) return;
    // 表示領域の全体を 1 つの pane に当てる測り方は、表示が 1 つの pane だけのときだけ使う（D108）。
    const measureSingle = view.measureSinglePane && view.visible.length === 1 ? view.measureSinglePane : null;
    if (view.measureSinglePane && view.visible.length > 1) this.warnMultiPaneMeasure(view.visible.length);
    const visible = view.visible.map(({ paneId, element }) => {
      const entry = this.opts.registry.get(paneId);
      const cell = entry ? this.getCellSize(entry.term) : { width: 9, height: 18 };
      // 測り方の口（D108）：表示が 1 つの pane だけで付いていれば、枠の大きさをそれで測る（モバイルは表示領域）。無ければ葉そのもの。
      const rect = measureSingle ? measureSingle(paneId, element) : element.getBoundingClientRect();
      const { cols, rows } = measure(rect.width, rect.height, cell);
      return { paneId, cols, rows };
    });

    const payload = { workspaceId: view.workspaceId, tabId: view.tabId, visible };
    const serialized = JSON.stringify(payload);
    if (serialized !== this.lastPayload) {
      this.lastPayload = serialized;
      void this.opts.conn.request("client.view", payload).catch(() => undefined);
      if (this.viewEstablishPending) {
        this.viewEstablishPending = false;
        this.notifyViewEstablished();
      }
    }

    for (const paneId of this.opts.registry.takePendingSubscriptions(visible.map((v) => v.paneId))) {
      // 作ったときの値を使う（D6）。以前は購読のたびに `getScrollbackLines()` を読んでいたが、利用者が設定を変えられる
      // ようになった今は、作ってから購読するまでの間に変えると xterm の容量と求める行数が食い違う。
      const scrollbackLines = this.opts.registry.get(paneId)?.scrollback ?? this.opts.getScrollbackLines();
      void this.opts.conn.request("pane.subscribe", { paneId, scrollbackLines }).catch(() => undefined);
    }
  }

  /**
   * root の `PaneLayout` が、今の表示で commit し直す関数を付ける（mount 時。D107）。外す関数を返す（unmount 時）。
   * 付いていない間（ログイン画面・切り離し画面・表示する tab が無い）は、後で `PaneLayout` が mount したときの commit が同じ役を果たす。
   */
  attachCommitter(commit: () => void): () => void {
    this.committer = commit;
    return () => {
      if (this.committer === commit) this.committer = null;
    };
  }

  /**
   * 新しい接続で `client.hello` が通るたびに呼ぶ（`main.ts` が `Connection.onOpened` につなぐ。D107）。サーバはこの接続に
   * 新しい clientId を振り、前の接続の購読・表示・fit を持たない。同じ内容でも `client.view` を送り直し（`lastPayload` を捨てる）、
   * 生きている全ての端末を未購読にして（表示中のものは次の commit で、隠れているものは次に表示したときに購読する）、
   * 今の表示で commit し直す。
   *
   * SNAPSHOT を受けた端末は中身を消してから書き直す（`TerminalRegistry.onSnapshot`）ので、切断の前に表示していた分と
   * 重ならない。サーバは SNAPSHOT → 溜め置きの OUTPUT → 以後の OUTPUT の順に送る（design「スナップショットと差分の継ぎ目」）。
   */
  onConnectionOpened(): void {
    this.connectionReady = true;
    this.lastPayload = "";
    this.opts.registry.markAllUnsubscribed();
    this.viewEstablishPending = true;
    this.committer?.();
  }

  /**
   * WebSocket が閉じるたびに呼ぶ（`main.ts` が `Connection.onClosed` につなぐ。D107）。次の `onConnectionOpened` まで、
   * `commit` は何も送らない。
   */
  onConnectionClosed(): void {
    this.connectionReady = false;
  }

  /**
   * 新しい接続で最初の `client.view` を送った直後（続く `pane.subscribe` より前）に `listener` を呼ぶ。外す関数を返す（D107）。
   * 初回の接続でも呼ぶ。**`client.fit` を送り直す口**（04-mobile 向け）：サーバの `client.fit` は表示（`client.view`）が
   * まだ無い接続では権限を取らない（サーバの D106 の `onFitChanged`）ので、「この端末に合わせる」を有効にしたまま再接続した
   * モバイルは、ここで `client.fit({enabled:true})` を送り直す。`ConnectionPort.request` は同期的に送るので、ここで送れば
   * `client.view` → `client.fit` → `pane.subscribe` の順に届き、SNAPSHOT は fit で決まった大きさで取られる。
   */
  onViewEstablished(listener: () => void): () => void {
    this.viewEstablishedListeners.add(listener);
    return () => {
      this.viewEstablishedListeners.delete(listener);
    };
  }

  private warnMultiPaneMeasure(count: number): void {
    if (!import.meta.env.DEV || this.warnedMultiPaneMeasure) return;
    this.warnedMultiPaneMeasure = true;
    console.warn(`ViewSync: measureSinglePane は表示が 1 つの pane だけの commit で使う口です（表示中 ${count} 個）。葉の大きさで測ります（D108）`);
  }

  /** listener の例外で続く `pane.subscribe` を止めない（後のタスクで投げ直して見えるようにする）。 */
  private notifyViewEstablished(): void {
    for (const listener of [...this.viewEstablishedListeners]) {
      try {
        listener();
      } catch (err) {
        setTimeout(() => {
          throw err;
        }, 0);
      }
    }
  }
}
