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
import { RemoteAgentPort } from "./RemoteAgentPort.js";

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
  /** 画面の末尾を待つ上限（試験用。既定は `REMOTE_TAIL_TIMEOUT_MS`）。 */
  tailTimeoutMs?: number;
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
  /** 今の socket で hello の応答を受けたか（受けた後・open の前のイベントは snapshot より新しいので溜める）。 */
  private helloAnswered = false;
  /** hello の応答の後・open の前に届いたイベント（open の後に順に当てる。g04 点検）。 */
  private early: ServerEvent[] = [];

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
        if (this.up) this.emit(this.eventCbs, (cb) => cb(e));
        // hello の応答より前のイベントは snapshot が含む（当て直すと古い値に戻る）。応答の後・open の前（同じ読み取りの塊で続けて届く）は
        // snapshot より新しいので溜めて、open の後に当てる。
        else if (this.helloAnswered) this.early.push(e);
      },
      onAuthRequired: () => undefined, // 中継の受け口は認証済み。閉じた code は adapter が 4401 を通さない
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
      createWebSocket: () => {
        this.helloAnswered = false;
        this.early = [];
        return new HelloWatchSocket(openSocket(), () => {
          this.helloAnswered = true;
        });
      },
      // 中継のチャネルは必ずすぐ開くので、hello が通るまで間隔を戻さない（hello を断るリモートへ 1 秒おきに繋ぎ直さない。g04 点検）。
      resetBackoffOnHello: true,
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
      const early = this.early;
      this.early = [];
      if (this.closed || snap === null) return;
      this.up = true;
      this.emit(this.openedCbs, (cb) => cb(snap));
      for (const e of early) if (this.up) this.emit(this.eventCbs, (cb) => cb(e));
      return;
    }
    this.early = [];
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
  private readonly links = new Map<string, { link: RemoteLink; port: RemoteAgentPort }>();
  /** マシンごとの直前の online か（online に変わったときだけ繋ぎ直しの待ちを飛ばす）。 */
  private readonly wasOnline = new Map<string, boolean>();

  constructor(private readonly deps: RemoteLinksDeps) {
    deps.machines.onChanged((list) => {
      // online に**変わった**ときだけ待ちを飛ばす（名前の変更など online のままの知らせで飛ばすと、hello を断るリモートへ間隔を守らずに繋ぎ直す）。
      for (const m of list) {
        const online = m.state === "online";
        const was = this.wasOnline.get(m.id) ?? false;
        this.wasOnline.set(m.id, online);
        if (online && !was) this.links.get(m.id)?.link.kick();
      }
      for (const id of [...this.wasOnline.keys()])
        if (!list.some((m) => m.id === id)) this.wasOnline.delete(id);
    });
  }

  /** グラフに載っているマシンの集合にそろえる（無ければ開き、外れたら閉じる）。 */
  ensure(machineIds: Iterable<string>): void {
    const want = new Set(machineIds);
    for (const [id, entry] of [...this.links]) {
      if (want.has(id)) continue;
      this.links.delete(id);
      entry.link.close();
      entry.port.dispose();
    }
    for (const id of want) {
      if (this.links.has(id)) continue;
      const link = new RemoteLink(id, () => this.openSocket(id), this.deps.logger);
      // 口は接続より先に購読しておく（最初の hello の snapshot を取りこぼさない）。
      const port = new RemoteAgentPort(link, {
        label: () => this.label(id),
        ...(this.deps.tailTimeoutMs !== undefined
          ? { tailTimeoutMs: this.deps.tailTimeoutMs }
          : {}),
      });
      this.links.set(id, { link, port });
      // 今の online を覚える（最初の知らせを「online に変わった」と取り違えて待ちを飛ばさない）。
      if (!this.wasOnline.has(id))
        this.wasOnline.set(
          id,
          this.deps.machines.list().some((m) => m.id === id && m.state === "online"),
        );
      link.start();
    }
  }

  get(machineId: string): RemoteLink | undefined {
    return this.links.get(machineId)?.link;
  }

  /** そのマシンの口（`ensure` に含めたマシンだけ）。 */
  port(machineId: string): RemoteAgentPort | undefined {
    return this.links.get(machineId)?.port;
  }

  /** 開いているマシン（試験用）。 */
  machineIds(): string[] {
    return [...this.links.keys()];
  }

  /** マシンの呼び名（登録簿の label。一覧に無ければ id）。 */
  label(machineId: string): string {
    return this.deps.machines.list().find((m) => m.id === machineId)?.label ?? machineId;
  }

  /** 全部閉じる（終了・引き継ぎ。次の `ensure` でまた開ける）。 */
  closeAll(): void {
    const entries = [...this.links.values()];
    this.links.clear();
    for (const { link, port } of entries) {
      link.close();
      port.dispose();
    }
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

/**
 * `Connection` が送る `client.hello` の id を覚え、その応答を受けた瞬間（`Connection` が当てる前）を知らせる socket の包み（g04 点検）。
 * hello の応答の後に同じ塊で続くイベントは、応答の処理（マイクロタスク）より先に `applyEvent` に届くので、応答の前後を見分けるのに使う。
 */
class HelloWatchSocket implements WebSocketLike {
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  private helloId: string | null = null;
  private answered = false;

  constructor(
    private readonly inner: WebSocketLike,
    private readonly onHelloAnswered: () => void,
  ) {
    inner.onopen = () => this.onopen?.();
    inner.onclose = (ev) => this.onclose?.(ev);
    inner.onerror = (ev) => this.onerror?.(ev);
    inner.onmessage = (ev) => {
      if (!this.answered && this.helloId !== null && typeof ev.data === "string") {
        if (idOf(ev.data) === this.helloId) {
          this.answered = true;
          this.onHelloAnswered();
        }
      }
      this.onmessage?.(ev);
    };
  }

  get readyState(): number {
    return this.inner.readyState;
  }

  send(data: string | Uint8Array): void {
    if (this.helloId === null && typeof data === "string" && data.includes('"client.hello"')) {
      const m = parseObject(data);
      if (m?.method === "client.hello" && typeof m.id === "string") this.helloId = m.id;
    }
    this.inner.send(data);
  }

  close(code?: number, reason?: string): void {
    this.inner.close(code, reason);
  }
}

function parseObject(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(s);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function idOf(s: string): unknown {
  return parseObject(s)?.id;
}
