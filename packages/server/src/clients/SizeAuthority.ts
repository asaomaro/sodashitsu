import { RpcError, type PaneId, type ServerEvent, type TabId } from "@sodashitsu/protocol";
import type { SessionService } from "../session/SessionService.js";
import type { ClientRecord, ClientRegistry } from "./ClientRegistry.js";

/**
 * tab ごとのサイズ権限の決定と移譲（architecture.md「SizeAuthority」・design.md「サイズ権限」）。
 * - **権限を持てるのは、デスクトップと `client.fit` を有効にしたクライアントだけ**（`canDecideSize`。D13・design「モバイル」の
 *   「既定ではサイズ権限を取らず」）。権限を取る・受け取る経路（`noteInteraction`・`onViewChanged`・`onFitChanged`・移譲）は
 *   どれもこの資格を確かめる（D106。以前は `onViewChanged` だけ確かめず、デスクトップを閉じた後にスマートフォンで開くだけで
 *   PTY がスマートフォンの大きさに縮んだ）。
 * - 権限を取る操作：入力・フォーカス・レイアウトの操作（`noteInteraction`）と、「この端末に合わせる」を有効にしたとき
 *   （`onFitChanged`。design「モバイル」の「`client.fit` でサイズ権限を取る」）。後者は**クライアントの種別を問わない**
 *   （D106）：1 列の画面は幅で決まり（`isMobileViewport`）、`client.hello` の種別（`(pointer: coarse)`）とは別なので、
 *   幅を狭めたデスクトップの窓にも「この端末に合わせる」が出る。押すのは「この画面に PTY を合わせたい」という意思。
 * - 誰も権限を持たない tab は、最初に `client.view` を送った資格のあるクライアントが持つ（design の接続シーケンスが
 *   `client.view` → resizePane を直結させているのに対応する。コーディング時の解釈）。資格の無いクライアント（fit して
 *   いないモバイル）しか見ていなければ、権限者は無いまま・pane のサイズもそのまま。
 * - 権限者が切断したら、その tab を見ていて最後に操作した別の資格のあるクライアントへ移す。
 *   居なければ権限者を無しにする（pane のサイズ自体はそのまま。design「権限の移り方」）。資格を失ったとき——モバイルが
 *   「この端末に合わせる」を無効にした（`onFitChanged`）・`client.hello` で資格の無い種別（fit していないモバイル）に
 *   変わった（`onKindChanged`）——も同じく手放す（D106）。デスクトップは fit を無効にしても資格が残るので手放さない。design「権限の移り方」の「別の tab へ移ったら」は
 *   実装していない（権限は前の tab に残るが、`applyOwnerSize` は view の tab に絞るのでその tab の大きさは動かさない。
 *   その tab を見ている資格のある別のクライアントは、操作すれば権限を取れる。D106 の作業で確認）。
 * - **pane への直結**（20260926-pane-direct-connect。herdr の terminal attach）：pane ごとに高々 1 クライアントが直結の所有者になり、
 *   直結中はその pane の大きさを所有者が決める（`applyOwnerSize` はその pane を飛ばす＝大きさの鍵）。種別は問わない（`sodactl` は external）。
 *   所有者が抜けたら（`detach`・切断）、その tab を見ている権限者がいればその大きさへ、いなければ**直結の前の大きさへ**戻す（X5）。所有者が変わるたびに
 *   `pane.attach_changed` を発行する。所有者は安全の境界ではない（INPUT は今までどおり誰でも書ける）。
 */
export interface SizeAuthority {
  noteInteraction(clientId: string, paneId: string): void;
  onViewChanged(clientId: string): void;
  /**
   * `client.fit` を受けた後に呼ぶ（有効にしたら種別を問わず表示中の tab の権限を取り、無効にして資格を失ったら持っている
   * 権限を手放す。D106）。
   */
  onFitChanged(clientId: string): void;
  /** `client.hello` で種別を決めた後に呼ぶ（資格を失ったら持っている権限を手放す。D106）。 */
  onKindChanged(clientId: string): void;
  onClientGone(clientId: string): void;
  /** 直結の所有者になり、pane の大きさを当てる。別の所有者がいれば `takeover` が無い限り `pane_attached`。 */
  attach(clientId: string, paneId: PaneId, cols: number, rows: number, takeover: boolean): void;
  /** 所有者だけが大きさを変えられる（所有者でなければ `not_attached`）。 */
  resizeAttached(clientId: string, paneId: PaneId, cols: number, rows: number): void;
  /** 所有者なら直結を終え、tab の権限者の大きさへ戻す。所有者でなければ何もしない。 */
  detach(clientId: string, paneId: PaneId): void;
  attachOwner(paneId: PaneId): string | null;
}

/** `pane.attach_changed` の発行先（`EventBus`）。 */
export interface SizeEventSink {
  publish(event: ServerEvent): void;
}

/** サイズを決められるクライアントか（デスクトップか、`client.fit` を有効にしたクライアント。D13・D106）。 */
function canDecideSize(client: ClientRecord): boolean {
  return client.kind === "desktop" || client.fit;
}

export class DefaultSizeAuthority implements SizeAuthority {
  /** 直結の所有者（pane → clientId）。 */
  private readonly attachments = new Map<PaneId, string>();
  /**
   * 直結の前の大きさ（pane → 桁と行。20261008-graph-first の X5）。最初の直結のときに覚え、引き取られても持ち越し、直結が終わったときに消す。
   * 抜けたとき、その tab を見ている権限者がいなければ、この大きさへ戻す。
   */
  private readonly beforeAttach = new Map<PaneId, { cols: number; rows: number }>();

  constructor(
    private readonly clients: ClientRegistry,
    private readonly session: SessionService,
    private readonly events?: SizeEventSink,
  ) {}

  noteInteraction(clientId: string, paneId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    // 操作の時刻は資格を問わず進める——色の問い合わせの答え（`answerPalette.ts` の 2 段目）が「最後に操作した人」を選ぶのに使う
    // （20260921-theme-settings の decisions D7）。権限の移譲（`transferOwnership`）は候補を `canDecideSize` で絞ってから比べるので変わらない。
    this.clients.touch(clientId);
    if (!canDecideSize(client)) return; // fit していないモバイルは権限を取らない
    const pane = this.session.getPane(paneId);
    if (!pane) return;
    this.claim(clientId, pane.tabId);
  }

  onViewChanged(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client?.view) return;
    const tab = this.session.getTab(client.view.tabId);
    if (!tab) return;
    if (!canDecideSize(client)) {
      // fit していないモバイルは、誰も権限を持たない tab でも権限を取らず、サイズも変えない（D13・D106）。権限を持ったまま
      // 資格を失っていたら（「この端末に合わせる」を無効にした後。通常は `onFitChanged` で手放し済み）ここで手放す。
      if (tab.sizeOwnerClientId === clientId) this.transferOwnership(tab.id, clientId);
      return;
    }
    if (tab.sizeOwnerClientId === clientId) {
      this.applyOwnerSize(clientId, tab.id);
    } else if (!tab.sizeOwnerClientId) {
      this.session.setTabSizeOwner(tab.id, clientId);
      this.applyOwnerSize(clientId, tab.id);
    }
  }

  onFitChanged(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.fit) {
      // 「この端末に合わせる」を有効にした＝この画面に PTY を合わせたいという利用者の明示の操作なので、種別を問わず
      // （幅を狭めたデスクトップの窓でも）表示中の tab の権限を（他のクライアントが持っていても）取る（design「モバイル」の
      // 「`client.fit` でサイズ権限を取る」・D13・D106）。view がまだ無ければ、最初の `client.view` で（誰も権限を持たない
      // tab なら）取る。
      if (!client.view) return;
      this.clients.touch(clientId);
      this.claim(clientId, client.view.tabId);
      return;
    }
    // 無効にした：資格を失ったとき（モバイル）だけ、持っている権限を手放す。デスクトップは fit を無効にしても資格が残るので
    // 手放さない（D106）。
    this.releaseIfUnqualified(client);
  }

  onKindChanged(clientId: string): void {
    // `client.hello` はいつでも種別を変えられる。デスクトップとして権限を取った後に（fit していない）モバイルとして
    // hello し直したら、資格を失うので手放す（D106）。資格のある種別に変わったときは何もしない（操作・`client.view` で
    // いつもどおり取る）。
    const client = this.clients.get(clientId);
    if (client) this.releaseIfUnqualified(client);
  }

  onClientGone(clientId: string): void {
    for (const tabId of this.ownedTabIds(clientId)) {
      this.transferOwnership(tabId, clientId);
    }
    // 移譲の後に解放する（戻す大きさは移譲後の権限者のもの）。
    for (const [paneId, owner] of [...this.attachments]) {
      if (owner === clientId) this.releaseAttachment(paneId);
    }
  }

  attach(clientId: string, paneId: PaneId, cols: number, rows: number, takeover: boolean): void {
    const current = this.attachments.get(paneId);
    if (current !== undefined && current !== clientId && !takeover) {
      throw new RpcError(
        "pane_attached",
        `pane ${paneId} already has an attached client; retry with --takeover`,
      );
    }
    if (current === undefined) {
      const pane = this.session.getPane(paneId);
      if (pane) this.beforeAttach.set(paneId, { cols: pane.cols, rows: pane.rows });
    }
    this.attachments.set(paneId, clientId);
    this.session.resizePane(paneId, cols, rows);
    if (current !== clientId)
      this.events?.publish({ event: "pane.attach_changed", data: { paneId, clientId } });
  }

  resizeAttached(clientId: string, paneId: PaneId, cols: number, rows: number): void {
    if (this.attachments.get(paneId) !== clientId) {
      throw new RpcError("not_attached", `this client is not attached to pane ${paneId}`);
    }
    this.session.resizePane(paneId, cols, rows);
  }

  detach(clientId: string, paneId: PaneId): void {
    if (this.attachments.get(paneId) === clientId) this.releaseAttachment(paneId);
  }

  attachOwner(paneId: PaneId): string | null {
    return this.attachments.get(paneId) ?? null;
  }

  /**
   * 直結を終える。その tab を見ている権限者（`client.view` の tab が pane の tab で、この pane が見えている）がいれば、その大きさへ戻す。
   * いなければ（権限者がいない・別の tab を見ている・この pane が見えていない）、直結の前の大きさへ戻す（X5）。pane がもう無ければ何もしない。
   */
  private releaseAttachment(paneId: PaneId): void {
    this.attachments.delete(paneId);
    const before = this.beforeAttach.get(paneId);
    this.beforeAttach.delete(paneId);
    this.events?.publish({ event: "pane.attach_changed", data: { paneId, clientId: null } });
    const pane = this.session.getPane(paneId);
    if (!pane) return;
    const ownerId = this.session.getTab(pane.tabId)?.sizeOwnerClientId;
    const view = ownerId ? this.clients.get(ownerId)?.view : undefined;
    if (ownerId && view?.tabId === pane.tabId && view.visible.some((v) => v.paneId === paneId)) {
      this.applyOwnerSize(ownerId, pane.tabId);
    } else if (before) {
      this.session.resizePane(paneId, before.cols, before.rows);
    }
  }

  /** 資格が無ければ、持っている権限をすべて手放す（同じ tab を見ている資格のあるクライアントへ移すか、無しにしてサイズを保つ）。 */
  private releaseIfUnqualified(client: ClientRecord): void {
    if (canDecideSize(client)) return;
    for (const tabId of this.ownedTabIds(client.id)) this.transferOwnership(tabId, client.id);
  }

  /** `tabId` の権限を `clientId` にし、その view のサイズを当てる（既に持っていれば何もしない）。 */
  private claim(clientId: string, tabId: TabId): void {
    const tab = this.session.getTab(tabId);
    if (!tab || tab.sizeOwnerClientId === clientId) return;
    this.session.setTabSizeOwner(tab.id, clientId);
    this.applyOwnerSize(clientId, tab.id);
  }

  private ownedTabIds(clientId: string): TabId[] {
    return this.session
      .snapshot()
      .tabs.filter((t) => t.sizeOwnerClientId === clientId)
      .map((t) => t.id);
  }

  private transferOwnership(tabId: TabId, departingClientId: string): void {
    const candidates = this.clients
      .list()
      // 移す先も `canDecideSize`（D13・D106）と同じ資格で選ぶ（fit していないモバイルへは移さない）。
      .filter((c) => c.id !== departingClientId && c.view?.tabId === tabId && canDecideSize(c))
      .sort((a, b) => b.lastInteractionAt - a.lastInteractionAt);
    const next = candidates[0];
    this.session.setTabSizeOwner(tabId, next?.id ?? null);
    if (next) this.applyOwnerSize(next.id, tabId);
  }

  private applyOwnerSize(clientId: string, tabId: TabId): void {
    const client = this.clients.get(clientId);
    if (!client?.view || client.view.tabId !== tabId) return;
    for (const v of client.view.visible) {
      const pane = this.session.getPane(v.paneId);
      if (pane?.tabId === tabId && !this.attachments.has(v.paneId))
        this.session.resizePane(v.paneId, v.cols, v.rows);
    }
  }
}
