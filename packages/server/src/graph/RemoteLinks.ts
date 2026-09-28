import type {
  MachineStatus,
  MethodName,
  ParamsOf,
  ResultOf,
  ServerEvent,
  SessionSnapshot,
} from "@sodashitsu/protocol";
import {
  Connection,
  type ConnectionState,
  type StorePort,
  type TerminalSinkPort,
  type WebSocketLike,
} from "@sodashitsu/client-core";
import type { Disposable } from "../util/Disposable.js";
import type { Logger } from "../log/Logger.js";
import type { LinkChannel } from "../machine/MachineLink.js";
import { LinkChannelSocket, UnavailableSocket } from "./linkChannelSocket.js";

/**
 * 別のマシンへの接続（20260927-agent-graph の 04 T1・design D-5・architecture「別のマシン」）。グラフに載っているマシンごとに 1 本、
 * `MachineManager.route(id).link.openChannel()` のチャネルの上に client-core の `Connection`（hello は `external`〔大きさの権限を取らない〕）を張る。
 *
 * - 載っているマシンだけ開き、外れたら閉じる（`ensure`）。終了・引き継ぎでは `closeAll`（連携の実行を止めた後・`graph.close()` の前）。
 * - 繋ぎ直しは `Connection` の待ち（1 秒から倍々・最大 30 秒）。マシンが online になった知らせ（`machine.changed` と同じ一覧）で待ちを飛ばす。
 * - 使えるのは hello を済ませてから閉じるまで（`available()`）。切れている間のイベントは失われる——繋ぎ直した hello の snapshot を「基準」として渡す
 *   （切れている間の完了で動かない。decisions D1-6）。
 */
export interface RemoteMachines {
  route(
    selector: string,
  ):
    | { kind: "ok"; link: { openChannel(): LinkChannel | undefined } }
    | { kind: "unknown" }
    | { kind: "offline" };
  list(): MachineStatus[];
  onChanged(cb: (machines: MachineStatus[]) => void): void;
}

export interface RemoteLinksDeps {
  machines: RemoteMachines;
  logger?: Pick<Logger, "warn">;
}

/** マシン 1 台への接続。 */
export class RemoteLink {
  private readonly conn: Connection;
  private up = false;
  private closed = false;
  private readonly openedCbs = new Set<(snapshot: SessionSnapshot) => void>();
  private readonly closedCbs = new Set<() => void>();
  private readonly eventCbs = new Set<(e: ServerEvent) => void>();
  private readonly screenCbs = new Set<(paneId: string, text: string) => void>();
  private pendingSnapshot: SessionSnapshot | null = null;

  constructor(
    readonly machine: string,
    openSocket: () => WebSocketLike,
    private readonly logger?: Pick<Logger, "warn">,
  ) {
    const store: StorePort = {
      applySnapshot: (s) => {
        this.pendingSnapshot = s;
      },
      applyEvent: (e) => {
        if (this.up) this.emit(this.eventCbs, (cb) => cb(e)); // hello の前のイベントは snapshot が含む
      },
      onAuthRequired: () => undefined, // 中継の受け口は認証済み（4401 は来ない）
      onConnectionState: (s) => this.onState(s),
      onOriginRejectSuspected: () => undefined,
    };
    const sink: TerminalSinkPort = {
      onOutput: () => undefined, // 画面の続きは使わない（末尾は SNAPSHOT を 1 回だけ読む）
      onSnapshot: (paneId, _cols, _rows, text) =>
        this.emit(this.screenCbs, (cb) => cb(paneId, text)),
      onSizeChanged: () => undefined,
    };
    this.conn = new Connection({
      kind: "external",
      httpOrigin: "",
      wsUrl: `machine:${machine}`,
      store,
      sink,
      // `/api/session` の確認は要らない（中継の受け口に繋いだ時点で認証済み）。
      fetchImpl: (async () => new Response(null, { status: 204 })) as typeof fetch,
      createWebSocket: openSocket,
    });
  }

  available(): boolean {
    return this.up;
  }

  start(): void {
    if (!this.closed) this.conn.connect();
  }

  /** マシンが online になった。繋がっていなければ繋ぎ直しの待ちを飛ばす。 */
  kick(): void {
    if (!this.closed && !this.up) this.conn.connect();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.conn.disconnect();
    this.setUp(false);
  }

  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
    if (!this.up) return Promise.reject(new Error(`not connected (method=${method})`));
    return this.conn.request(method, params);
  }

  /** hello を済ませた（初回・繋ぎ直し）。snapshot は今のリモートの状態（基準）。 */
  onOpened(cb: (snapshot: SessionSnapshot) => void): Disposable {
    return this.add(this.openedCbs, cb);
  }
  onClosed(cb: () => void): Disposable {
    return this.add(this.closedCbs, cb);
  }
  onEvent(cb: (e: ServerEvent) => void): Disposable {
    return this.add(this.eventCbs, cb);
  }
  /** `pane.subscribe` の SNAPSHOT（スクロールバック込みの画面）。 */
  onScreen(cb: (paneId: string, text: string) => void): Disposable {
    return this.add(this.screenCbs, cb);
  }

  private onState(s: ConnectionState): void {
    if (s === "open") {
      const snap = this.pendingSnapshot;
      this.pendingSnapshot = null;
      if (this.closed || snap === null) return;
      this.up = true;
      this.emit(this.openedCbs, (cb) => cb(snap));
      return;
    }
    this.setUp(false);
  }

  private setUp(up: boolean): void {
    if (this.up === up) return;
    this.up = up;
    if (!up) this.emit(this.closedCbs, (cb) => cb());
  }

  private add<T>(set: Set<T>, cb: T): Disposable {
    set.add(cb);
    return { dispose: () => set.delete(cb) };
  }

  /** 受け手の例外は接続の処理（`Connection` の hello の後始末・チャネルの読み取り）へ返さない。 */
  private emit<T>(set: Set<T>, call: (cb: T) => void): void {
    for (const cb of [...set]) {
      try {
        call(cb);
      } catch (err) {
        this.logger?.warn("graph: remote link listener failed", {
          machine: this.machine,
          error: err instanceof Error ? (err.stack ?? err.message) : String(err),
        });
      }
    }
  }
}

export class RemoteLinks {
  private readonly links = new Map<string, RemoteLink>();
  private readonly createdCbs = new Set<(link: RemoteLink) => void>();

  constructor(private readonly deps: RemoteLinksDeps) {
    deps.machines.onChanged((list) => {
      for (const m of list) if (m.state === "online") this.links.get(m.id)?.kick();
    });
  }

  /** グラフに載っているマシンの集合にそろえる（無ければ開き、外れたら閉じる）。 */
  ensure(machineIds: Iterable<string>): void {
    const want = new Set(machineIds);
    for (const [id, link] of [...this.links]) {
      if (want.has(id)) continue;
      this.links.delete(id);
      link.close();
    }
    for (const id of want) {
      if (this.links.has(id)) continue;
      const link = new RemoteLink(id, () => this.openSocket(id), this.deps.logger);
      this.links.set(id, link);
      for (const cb of [...this.createdCbs]) cb(link);
      link.start();
    }
  }

  get(machineId: string): RemoteLink | undefined {
    return this.links.get(machineId);
  }

  /** 開いているマシン（試験用）。 */
  machineIds(): string[] {
    return [...this.links.keys()];
  }

  /** マシンの呼び名（登録簿の label。一覧に無ければ id）。 */
  label(machineId: string): string {
    return this.deps.machines.list().find((m) => m.id === machineId)?.label ?? machineId;
  }

  /** 新しい接続を作ったとき（`ensure` の中、`start` の前）。 */
  onCreated(cb: (link: RemoteLink) => void): Disposable {
    this.createdCbs.add(cb);
    return { dispose: () => this.createdCbs.delete(cb) };
  }

  /** 全部閉じる（終了・引き継ぎ。次の `ensure` でまた開ける）。 */
  closeAll(): void {
    const links = [...this.links.values()];
    this.links.clear();
    for (const link of links) link.close();
  }

  private openSocket(machineId: string): WebSocketLike {
    const route = this.deps.machines.route(machineId);
    const channel = route.kind === "ok" ? route.link.openChannel() : undefined;
    if (channel === undefined) return new UnavailableSocket();
    return new LinkChannelSocket(channel, (err) =>
      this.deps.logger?.warn("graph: remote message handling failed", {
        machine: machineId,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      }),
    );
  }
}
