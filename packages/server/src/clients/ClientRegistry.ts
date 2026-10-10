import { randomUUID } from "node:crypto";
import type { PaneId, TabId, ThemeName, WorkspaceId } from "@sodashitsu/protocol";

/**
 * `"external"` は画面を持たない外部クライアント（`sodactl`。20260923-external-control-api の design D4）。
 * `client.hello` を送らない・`kind` を省略したクライアントは `register()` の既定 `"desktop"` になるため、
 * `sodactl` は必ず `client.hello` で `kind: "external"` を送る。`SizeAuthority.canDecideSize` は
 * `kind === "desktop"` の等値比較だけを見るので、この値を増やしても `SizeAuthority.ts` 自体の変更は不要
 * （新しい値は自動的に「サイズ権限の資格なし」側になる）。
 */
export type ClientKind = "desktop" | "mobile" | "external";

export interface ClientView {
  workspaceId: WorkspaceId;
  tabId: TabId;
  visible: { paneId: PaneId; cols: number; rows: number }[];
}

export interface ClientRecord {
  readonly id: string;
  kind: ClientKind;
  fit: boolean;
  view: ClientView | null;
  lastInteractionAt: number;
  /**
   * 最後に操作した時刻（入力・フォーカス・レイアウト・作る操作。`touch` で進む）。**接続しただけでは 0**——`lastInteractionAt` は接続の時刻から
   * 始まるので、一度も操作していない後から来たクライアントが勝ってしまう。色の問い合わせの答え（`answerPalette.ts`）が「最後に操作した人」を
   * 選ぶのに使う（20260921-theme-settings の decisions D13）。
   */
  lastActedAt: number;
  readonly subscriptions: Set<PaneId>;
  /**
   * このクライアントがいま表示しているテーマ（`client.theme`。20260921-theme-settings）。まだ届いていなければ null。
   * 色の問い合わせへの答えにだけ使う（`answerPalette.ts`）。
   */
  theme: ThemeName | null;
  /**
   * 利用状況の配信（`agent.usage_changed`）を送るか（`agent.usage_watch`。20261010-agent-usage PR3）。ダッシュボードが見えている間だけ true。
   * 接続の寿命と同じ（切れたら消える）。`WsGateway` が、できごとをこの印のある接続にだけ送る。
   */
  watchingUsage?: boolean;
  /** ほかのマシンの `soda serve` の中継（bridge）越しの接続（手元の画面ではない）。`WsGateway` が接続の入口で立てる。 */
  viaBridge?: boolean;
}

/** 接続中のクライアント（architecture.md「ClientRegistry」）。 */
export interface ClientRegistry {
  /**
   * 接続を受けた時点で呼ぶ（`kind` はまだ分からないので既定値。`client.hello` が届いたら
   * `setKind` で確定する。architecture.md の接続シーケンス：`register()` が先、`client.hello` は後）。
   */
  register(kind?: ClientKind): string;
  unregister(clientId: string): void;
  get(clientId: string): ClientRecord | undefined;
  list(): ClientRecord[];
  setKind(clientId: string, kind: ClientKind): void;
  setView(clientId: string, view: ClientView): void;
  setFit(clientId: string, on: boolean): void;
  setTheme(clientId: string, theme: ThemeName): void;
  setUsageWatch(clientId: string, on: boolean): void;
  touch(clientId: string): void;
  addSubscription(clientId: string, paneId: PaneId): void;
  removeSubscription(clientId: string, paneId: PaneId): void;
  subscriptions(clientId: string): PaneId[];
}

export class DefaultClientRegistry implements ClientRegistry {
  private readonly clients = new Map<string, ClientRecord>();

  register(kind: ClientKind = "desktop"): string {
    const id = randomUUID();
    this.clients.set(id, { id, kind, fit: false, view: null, lastInteractionAt: Date.now(), lastActedAt: 0, subscriptions: new Set(), theme: null });
    return id;
  }

  unregister(clientId: string): void {
    this.clients.delete(clientId);
  }

  get(clientId: string): ClientRecord | undefined {
    return this.clients.get(clientId);
  }

  list(): ClientRecord[] {
    return [...this.clients.values()];
  }

  setKind(clientId: string, kind: ClientKind): void {
    const client = this.clients.get(clientId);
    if (client) client.kind = kind;
  }

  setView(clientId: string, view: ClientView): void {
    const client = this.clients.get(clientId);
    if (client) client.view = view;
  }

  setFit(clientId: string, on: boolean): void {
    const client = this.clients.get(clientId);
    if (client) client.fit = on;
  }

  setTheme(clientId: string, theme: ThemeName): void {
    const client = this.clients.get(clientId);
    if (client) client.theme = theme;
  }

  setUsageWatch(clientId: string, on: boolean): void {
    const client = this.clients.get(clientId);
    if (client) client.watchingUsage = on;
  }

  touch(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) client.lastInteractionAt = client.lastActedAt = Date.now();
  }

  addSubscription(clientId: string, paneId: PaneId): void {
    this.clients.get(clientId)?.subscriptions.add(paneId);
  }

  removeSubscription(clientId: string, paneId: PaneId): void {
    this.clients.get(clientId)?.subscriptions.delete(paneId);
  }

  subscriptions(clientId: string): PaneId[] {
    return [...(this.clients.get(clientId)?.subscriptions ?? [])];
  }
}
