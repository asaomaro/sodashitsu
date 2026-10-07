import { randomUUID } from "node:crypto";
import {
  DISPLAY_ACTION_RATE,
  DISPLAY_BANDS_PER_PANE_MAX,
  DISPLAY_EVENT_QUEUE_MAX,
  DISPLAY_FEATURES,
  DISPLAY_GET_CHUNK_BYTES,
  DISPLAY_PANELS_PER_PANE_MAX,
  DISPLAY_RENDER_FEATURES,
  DISPLAY_SERVER_BYTES_MAX,
  DISPLAY_SET_BYTES_RATE,
  DISPLAY_SET_RATE,
  DISPLAY_SIZE,
  DISPLAY_TOTAL_MAX,
  DISPLAY_WAITERS_MAX,
  DISPLAY_WAITERS_PER_PANE_MAX,
  RpcError,
  checkDisplayAction,
  checkDisplaySet,
  displayLimits,
  type DisplayChunk,
  type DisplayClosedReason,
  type DisplayEvent,
  type DisplayFeatures,
  type DisplayInfo,
  type DisplayReportProblem,
  type DisplayRenderers,
  type DisplaySetResult,
  type DisplayWaitResult,
  type ServerEvent,
} from "@sodashitsu/protocol";
import type { Disposable, EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";
import { TokenBucket } from "./rateLimit.js";

export interface DisplayClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: DisplayClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface DisplayServiceOptions {
  bus: EventBus;
  paneExists(paneId: string): boolean;
  /** その接続の種類が desktop か mobile か（`AskService` の `isBrowserKind` と同じもの）。 */
  isScreenKind(clientId: string): boolean;
  /** テストで差し替える。 */
  clock?: DisplayClock;
  /** 面の id（既定 `crypto.randomUUID`）。 */
  newId?: () => string;
  /** 面の名前・pane・バイト数・理由だけを書く。**中身・題・操作に添えた値は書かない**。 */
  logger?: Pick<Logger, "info" | "warn">;
}

interface Entry {
  info: DisplayInfo;
  /** 中身（UTF-8）。 */
  content: Buffer;
  ttl: unknown;
}

interface Waiter {
  since: number;
  names: string[] | undefined;
  owner: { signal?: AbortSignal | undefined; clientId?: string | undefined };
  timer: unknown;
  onAbort: (() => void) | undefined;
  resolve(r: DisplayWaitResult): void;
  reject(err: unknown): void;
}

/** `seq` を除いた出来事（共用体の各項目から `seq` を除く）。 */
type EventBody = DisplayEvent extends infer E ? (E extends DisplayEvent ? Omit<E, "seq"> : never) : never;

interface Queue {
  /** 最後に振った seq（まだ出来事が無ければ 0）。 */
  seq: number;
  events: DisplayEvent[];
  waiters: Set<Waiter>;
}

/**
 * pane ごとの表示の面の台帳（`sodactl display`。20261007-soda-extensions の design「サーバ: DisplayService」）。メモリだけで持つ（再起動・`soda handoff` で消える）。
 * 面の寿命は `set` から、`close`・利用者の `dismiss`・画面の `report`・`ttl`・pane が閉じる、のどれかまで。どれも `remove()` を通る。
 * 画面（`display.subscribe` した desktop / mobile）にだけ中身を返し、全クライアントへ配るイベントは見出しだけにする。
 * サーバはファイルを読まない・外へ通信しない（中身は sodactl が読んで要求に載せる）。
 */
export class DisplayService {
  /** サーバの起動ごとの印。`display.wait` に渡すと、入れ替え・再起動を見分けられる。 */
  readonly epoch: string;
  private readonly clock: DisplayClock;
  private readonly newId: () => string;
  private readonly byPane = new Map<string, Map<string, Entry>>();
  private readonly byId = new Map<string, Entry>();
  private readonly queues = new Map<string, Queue>();
  /** 名乗った画面と、名乗った種類。 */
  private readonly subscribers = new Map<string, Set<string>>();
  private readonly setCount = new Map<string, TokenBucket>();
  private readonly setBytes = new Map<string, TokenBucket>();
  private readonly actionBuckets = new Map<string, TokenBucket>();
  private readonly actionDrops = new Map<string, { count: number; lastLog: number }>();
  private waiterTotal = 0;
  private totalBytes = 0;
  private readonly busSub: Disposable;
  private disposed = false;

  constructor(private readonly opts: DisplayServiceOptions) {
    this.epoch = randomUUID();
    this.clock = opts.clock ?? realClock;
    this.newId = opts.newId ?? randomUUID;
    this.busSub = opts.bus.subscribe((e) => {
      if (e.event !== "pane.closed") return;
      // 購読者の例外で bus の他の購読者を止めない。
      try {
        this.onPaneClosed(e.data.paneId);
      } catch (err) {
        this.opts.logger?.warn("display: pane.closed handling failed", { error: String(err instanceof Error ? err.message : err) });
      }
    });
  }

  // --- プログラム側（sodactl）------------------------------------------------------------------

  /** 面を出す・更新する。投げる: `invalid_display`・`not_found`（pane が無い）・`display_busy`（頻度）・`display_limit`（数・合計）。 */
  set(paneId: string, body: unknown): DisplaySetResult {
    if (this.disposed) throw new RpcError("display_closed", "the server is shutting down");
    const checked = checkDisplaySet(body);
    if (!checked.ok) throw new RpcError("invalid_display", checked.reason);
    const b = checked.value;
    this.requirePane(paneId);
    const now = this.clock.now();
    const content = Buffer.from(b.content, "utf8");
    const countBucket = this.bucket(this.setCount, paneId, DISPLAY_SET_RATE);
    const bytesBucket = this.bucket(this.setBytes, paneId, DISPLAY_SET_BYTES_RATE);
    if (!countBucket.take(now)) throw new RpcError("display_busy", "too many display updates from this pane; wait a moment");
    if (!bytesBucket.take(now, content.length)) {
      countBucket.refund();
      throw new RpcError("display_busy", "too much display content from this pane in a short time; wait a moment");
    }
    const refundAndThrow = (message: string): never => {
      countBucket.refund();
      bytesBucket.refund(content.length);
      throw new RpcError("display_limit", message);
    };

    const panes = this.byPane.get(paneId);
    const existing = panes?.get(b.name);
    // 数の上限は、置き換えなら変えた後の種類で見る。
    if (existing === undefined || existing.info.kind !== b.kind) {
      let same = 0;
      for (const e of panes?.values() ?? []) if (e !== existing && e.info.kind === b.kind) same++;
      const max = b.kind === "panel" ? DISPLAY_PANELS_PER_PANE_MAX : DISPLAY_BANDS_PER_PANE_MAX;
      if (same >= max) refundAndThrow(`this pane already has ${max} ${b.kind}s`);
    }
    if (existing === undefined && this.byId.size >= DISPLAY_TOTAL_MAX) refundAndThrow("too many displays on this server");
    if (this.totalBytes - (existing?.content.length ?? 0) + content.length > DISPLAY_SERVER_BYTES_MAX) {
      refundAndThrow("the total size of displays on this server is over the limit");
    }

    const info: DisplayInfo = {
      id: existing?.info.id ?? this.newId(),
      paneId,
      name: b.name,
      kind: b.kind,
      format: b.format,
      title: b.title ?? b.name,
      size: b.size ?? DISPLAY_SIZE[b.kind].default,
      rev: (existing?.info.rev ?? 0) + 1,
      bytes: content.length,
      updatedAt: new Date(now).toISOString(),
    };
    let entry = existing;
    if (entry === undefined) {
      entry = { info, content, ttl: undefined };
      let m = this.byPane.get(paneId);
      if (m === undefined) this.byPane.set(paneId, (m = new Map()));
      m.set(b.name, entry);
      this.byId.set(info.id, entry);
    } else {
      this.totalBytes -= entry.content.length;
      entry.info = info;
      entry.content = content;
    }
    this.totalBytes += content.length;
    // ttl は set のたびに張り直す。`ttlMs` なしの set で外れる。
    if (entry.ttl !== undefined) this.clock.clearTimeout(entry.ttl);
    entry.ttl = undefined;
    if (b.ttlMs !== undefined) {
      const target = entry;
      entry.ttl = this.clock.setTimeout(() => {
        if (this.byId.get(target.info.id) === target) this.remove(target, "expired");
      }, b.ttlMs);
    }
    this.opts.logger?.info("display set", { paneId, name: b.name, kind: b.kind, format: b.format, bytes: content.length, rev: info.rev });
    this.publish({ event: "display.updated", data: { display: { ...info } } });
    return { display: { ...info }, renderers: this.renderers(), epoch: this.epoch, next: this.queues.get(paneId)?.seq ?? 0 };
  }

  /** 面を閉じる。無い名前は何もせず `closed: []`。pane が無ければ `not_found`。 */
  close(paneId: string, sel: { name?: string | undefined; all?: boolean | undefined }, reason: DisplayClosedReason = "closed"): { closed: string[] } {
    this.requirePane(paneId);
    const panes = this.byPane.get(paneId);
    if (panes === undefined) return { closed: [] };
    const targets = sel.all === true ? [...panes.values()] : sel.name !== undefined && panes.has(sel.name) ? [panes.get(sel.name)!] : [];
    return { closed: targets.map((e) => this.remove(e, reason)) };
  }

  /** その pane の面の見出し（出た順）。 */
  list(paneId: string): { displays: DisplayInfo[] } {
    this.requirePane(paneId);
    return { displays: [...(this.byPane.get(paneId)?.values() ?? [])].map((e) => ({ ...e.info })) };
  }

  /**
   * 出来事を待つ。`owner`: 受け口は `{ signal }`（接続が終わると abort）、`/ws` は `{ clientId }`（`onClientGone` がその接続の待ちを外す）。
   * 待ちが外れたとき（abort・切断）は、返事を書かない（Promise は決まらない）。pane が閉じたら `not_found` で reject、`dispose` で空の結果。
   */
  wait(
    paneId: string,
    p: { since?: number | undefined; epoch?: string | undefined; names?: string[] | undefined; timeoutMs: number },
    owner: { signal?: AbortSignal | undefined; clientId?: string | undefined },
  ): Promise<DisplayWaitResult> {
    this.requirePane(paneId);
    const q = this.queues.get(paneId);
    const seqNow = q?.seq ?? 0;
    // 1. 入れ替え・再起動を見分ける。
    if (p.epoch !== undefined && p.epoch !== this.epoch) {
      return Promise.resolve({ epoch: this.epoch, next: seqNow, events: [], dropped: 0, reset: true });
    }
    // 2. since を省いたら、今の seq（この後の出来事だけ）。
    const since = Math.min(p.since ?? seqNow, seqNow);
    const names = p.names !== undefined && p.names.length > 0 ? p.names : undefined;
    // 3. 溜まっているものがあれば、すぐ返す。
    const got = this.collect(q, since, names);
    if (got.events.length > 0 || got.dropped > 0) return Promise.resolve(this.result(got, seqNow));
    // 4. 無ければ待つ。
    if (this.disposed) return Promise.resolve({ epoch: this.epoch, next: seqNow, events: [], dropped: 0, reset: false });
    if (owner.signal?.aborted === true) return new Promise<DisplayWaitResult>(() => undefined);
    const queue = this.ensureQueue(paneId);
    if (queue.waiters.size >= DISPLAY_WAITERS_PER_PANE_MAX || this.waiterTotal >= DISPLAY_WAITERS_MAX) {
      throw new RpcError("display_busy", "too many waits on display events");
    }
    return new Promise<DisplayWaitResult>((resolve, reject) => {
      const w: Waiter = { since, names, owner, timer: undefined, onAbort: undefined, resolve, reject };
      w.timer = this.clock.setTimeout(() => {
        if (!this.dropWaiter(paneId, w)) return;
        resolve({ epoch: this.epoch, next: this.queues.get(paneId)?.seq ?? 0, events: [], dropped: 0, reset: false });
      }, p.timeoutMs);
      if (owner.signal !== undefined) {
        // この listener は投げないこと（abort の listener の例外は uncaughtException になる）。
        w.onAbort = (): void => void this.dropWaiter(paneId, w);
        owner.signal.addEventListener("abort", w.onAbort, { once: true });
      }
      queue.waiters.add(w);
      this.waiterTotal++;
    });
  }

  features(): DisplayFeatures {
    return { features: [...DISPLAY_FEATURES], limits: displayLimits(), renderers: this.renderers(), epoch: this.epoch };
  }

  // --- 画面側（ブラウザ）------------------------------------------------------------------------

  /** この接続を「面を出せる画面」として登録し、全 pane の面の見出しを返す。何度呼んでもよい（名乗る種類は呼ぶたびに置き換わる）。 */
  subscribe(clientId: string, features: string[]): { displays: DisplayInfo[] } {
    if (!this.opts.isScreenKind(clientId)) throw new RpcError("invalid_params", "only a browser can show a display");
    const known = new Set<string>();
    for (const f of features) if ((DISPLAY_RENDER_FEATURES as readonly string[]).includes(f)) known.add(f);
    this.subscribers.set(clientId, known);
    return { displays: [...this.byId.values()].map((e) => ({ ...e.info })) };
  }

  /** 中身の 1 片（`offset` は 0 か片の大きさの倍数）。名乗っていない接続・無い面は `display_closed`。 */
  get(clientId: string, id: string, offset: number): DisplayChunk {
    const entry = this.requireVisible(clientId, id);
    const total = entry.content.length;
    if (offset % DISPLAY_GET_CHUNK_BYTES !== 0) throw new RpcError("invalid_params", "offset must be a multiple of the chunk size");
    if (offset > total || (offset === total && total > 0)) throw new RpcError("invalid_params", "offset is out of range");
    const chunk = entry.content.subarray(offset, offset + DISPLAY_GET_CHUNK_BYTES);
    return {
      id: entry.info.id,
      rev: entry.info.rev,
      format: entry.info.format,
      totalBytes: total,
      offset,
      base64: chunk.toString("base64"),
      eof: offset + chunk.length >= total,
    };
  }

  /**
   * 利用者の操作を、待っているプログラムの列に足す。`rev` は押した時点の中身の版（古くても捨てない。判断はプログラムに任せる）。
   * 頻度（接続ごと）を超えた分は、誤りにせず捨てて成功を返す。
   */
  action(clientId: string, p: { id: string; rev: number; action: string; data?: unknown }): void {
    const entry = this.requireVisible(clientId, p.id);
    if (entry.info.format === "text") throw new RpcError("invalid_params", "a text display has no actions");
    const checked = checkDisplayAction({ action: p.action, ...(p.data !== undefined ? { data: p.data } : {}) });
    if (!checked.ok) throw new RpcError("invalid_params", checked.reason);
    if (!Number.isInteger(p.rev) || p.rev < 1 || p.rev > entry.info.rev) throw new RpcError("invalid_params", "rev is out of range");
    const now = this.clock.now();
    if (!this.bucket(this.actionBuckets, clientId, DISPLAY_ACTION_RATE).take(now)) {
      this.noteActionDrop(clientId, entry, now);
      return;
    }
    const ev: EventBody = {
      type: "display.action",
      paneId: entry.info.paneId,
      name: entry.info.name,
      rev: p.rev,
      action: checked.value.action,
      ...(checked.value.data !== undefined ? { data: checked.value.data } : {}),
      at: new Date(now).toISOString(),
    };
    this.pushEvent(entry.info.paneId, ev);
  }

  /** 利用者が面を閉じる（`id` の 1 つか、`paneId` の pane の全部）。名乗っていない接続は `display_closed`。無い id は成功（`closed: []`）。 */
  dismiss(clientId: string, sel: { id?: string | undefined; paneId?: string | undefined }): { closed: string[] } {
    this.requireSubscriber(clientId);
    let targets: Entry[] = [];
    if (sel.id !== undefined) {
      const e = this.byId.get(sel.id);
      if (e) targets = [e];
    } else if (sel.paneId !== undefined) {
      targets = [...(this.byPane.get(sel.paneId)?.values() ?? [])];
    }
    return { closed: targets.map((e) => this.remove(e, "dismissed")) };
  }

  /** 画面が、枠の異常を知らせる。その面を閉じる（理由は `problem`）。名乗っていない接続は `display_closed`。無い id は成功。 */
  report(clientId: string, p: { id: string; problem: DisplayReportProblem }): { closed: string[] } {
    this.requireSubscriber(clientId);
    const e = this.byId.get(p.id);
    if (!e) return { closed: [] };
    this.opts.logger?.info("display reported", { paneId: e.info.paneId, name: e.info.name, problem: p.problem });
    return { closed: [this.remove(e, p.problem)] };
  }

  // --- 後始末 ----------------------------------------------------------------------------------

  /** 接続が閉じた。名乗りを外し、その接続の待ち（`/ws` の `display.wait`）を外す。 */
  onClientGone(clientId: string): void {
    this.subscribers.delete(clientId);
    this.actionBuckets.delete(clientId);
    this.actionDrops.delete(clientId);
    for (const [paneId, q] of this.queues) {
      for (const w of [...q.waiters]) if (w.owner.clientId === clientId) this.dropWaiter(paneId, w);
    }
  }

  /** 待ちを空の結果で返し、面を捨てる。以後の `set` を断る。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.busSub.dispose();
    for (const e of this.byId.values()) if (e.ttl !== undefined) this.clock.clearTimeout(e.ttl);
    for (const [paneId, q] of this.queues) {
      for (const w of [...q.waiters]) {
        this.dropWaiter(paneId, w);
        w.resolve({ epoch: this.epoch, next: q.seq, events: [], dropped: 0, reset: false });
      }
    }
    this.byPane.clear();
    this.byId.clear();
    this.queues.clear();
    this.subscribers.clear();
    this.totalBytes = 0;
  }

  // --- 内部 ------------------------------------------------------------------------------------

  /** 名乗った画面のうち、まだ画面として繋がっているものを種類ごとに数える。 */
  private renderers(): DisplayRenderers {
    const r: DisplayRenderers = { panel: 0, band: 0, actions: 0 };
    for (const [id, f] of this.subscribers) {
      if (!this.opts.isScreenKind(id)) continue;
      if (f.has("panel")) r.panel++;
      if (f.has("band")) r.band++;
      if (f.has("actions")) r.actions++;
    }
    return r;
  }

  private requirePane(paneId: string): void {
    if (!this.opts.paneExists(paneId)) throw new RpcError("not_found", `pane not found: ${paneId}`);
  }

  /** 名乗った画面か。**名乗った後に種類が変わった**（desktop で名乗ってから external に替えた）接続は、数えない・使わせない。 */
  private requireSubscriber(clientId: string): void {
    if (!this.subscribers.has(clientId) || !this.opts.isScreenKind(clientId)) throw new RpcError("display_closed", "this connection is not showing displays");
  }

  private requireVisible(clientId: string, id: string): Entry {
    this.requireSubscriber(clientId);
    const entry = this.byId.get(id);
    if (!entry) throw new RpcError("display_closed", "unknown or closed display");
    return entry;
  }

  private bucket(map: Map<string, TokenBucket>, key: string, rate: { perSec: number; burst: number }): TokenBucket {
    let b = map.get(key);
    if (b === undefined) map.set(key, (b = new TokenBucket(rate)));
    return b;
  }

  private ensureQueue(paneId: string): Queue {
    let q = this.queues.get(paneId);
    if (q === undefined) this.queues.set(paneId, (q = { seq: 0, events: [], waiters: new Set() }));
    return q;
  }

  /** 超えた操作を捨てた。ログには数だけ（1 秒に 1 回まで）。 */
  private noteActionDrop(clientId: string, entry: Entry, now: number): void {
    const d = this.actionDrops.get(clientId) ?? { count: 0, lastLog: 0 };
    d.count++;
    this.actionDrops.set(clientId, d);
    if (now - d.lastLog >= 1000) {
      this.opts.logger?.info("display actions dropped (rate limit)", { paneId: entry.info.paneId, name: entry.info.name, count: d.count });
      d.lastLog = now;
      d.count = 0;
    }
  }

  /** 列に出来事を足して、待ちを起こす。 */
  private pushEvent(paneId: string, ev: EventBody): void {
    const q = this.ensureQueue(paneId);
    q.seq++;
    q.events.push({ ...ev, seq: q.seq } as DisplayEvent);
    if (q.events.length > DISPLAY_EVENT_QUEUE_MAX) q.events.splice(0, q.events.length - DISPLAY_EVENT_QUEUE_MAX);
    for (const w of [...q.waiters]) {
      const got = this.collect(q, w.since, w.names);
      if (got.events.length === 0 && got.dropped === 0) continue;
      if (!this.dropWaiter(paneId, w)) continue;
      w.resolve(this.result(got, q.seq));
    }
  }

  /** `since` より後の出来事（`names` があればその名前のもの）と、捨てられて読めなくなった数。 */
  private collect(q: Queue | undefined, since: number, names: string[] | undefined): { events: DisplayEvent[]; dropped: number } {
    const list = q?.events ?? [];
    const oldest = list[0]?.seq;
    const dropped = oldest !== undefined && oldest > since + 1 ? oldest - (since + 1) : 0;
    const events = list.filter((e) => e.seq > since && (names === undefined || names.includes(e.name)));
    return { events, dropped };
  }

  private result(got: { events: DisplayEvent[]; dropped: number }, seqNow: number): DisplayWaitResult {
    return { epoch: this.epoch, next: got.events.length > 0 ? got.events[got.events.length - 1]!.seq : seqNow, events: got.events, dropped: got.dropped, reset: false };
  }

  /** 待ちを外す（タイマーと abort の listener も）。外したら true、既に外れていたら false。 */
  private dropWaiter(paneId: string, w: Waiter): boolean {
    const q = this.queues.get(paneId);
    if (!q || !q.waiters.delete(w)) return false;
    this.waiterTotal--;
    this.clock.clearTimeout(w.timer);
    if (w.onAbort !== undefined) w.owner.signal?.removeEventListener("abort", w.onAbort);
    return true;
  }

  /**
   * 面を台帳から外す（1 回だけ）: 合計を戻し、その pane の列に `display.closed`（理由つき）を足し、`display.removed` を配る。外した面の名前を返す。
   * `paneClosed` のときは列を足さない（pane ごと列を捨てる）。
   */
  private remove(entry: Entry, reason: DisplayClosedReason | "pane_closed"): string {
    const { id, paneId, name } = entry.info;
    if (this.byId.get(id) !== entry) return name;
    if (entry.ttl !== undefined) this.clock.clearTimeout(entry.ttl);
    entry.ttl = undefined;
    this.byId.delete(id);
    const panes = this.byPane.get(paneId);
    panes?.delete(name);
    if (panes?.size === 0) this.byPane.delete(paneId);
    this.totalBytes -= entry.content.length;
    this.opts.logger?.info("display closed", { paneId, name, reason });
    if (reason !== "pane_closed") {
      this.pushEvent(paneId, { type: "display.closed", paneId, name, reason, at: new Date(this.clock.now()).toISOString() });
    }
    this.publish({ event: "display.removed", data: { id, paneId, name, reason } });
    return name;
  }

  private onPaneClosed(paneId: string): void {
    for (const e of [...(this.byPane.get(paneId)?.values() ?? [])]) {
      try {
        this.remove(e, "pane_closed");
      } catch (err) {
        this.opts.logger?.warn("display: removing a display failed", { paneId, error: String(err instanceof Error ? err.message : err) });
      }
    }
    this.byPane.delete(paneId);
    const q = this.queues.get(paneId);
    if (q) {
      // 溜めた出来事ごと捨てる。待っている wait は not_found で終わる。
      this.queues.delete(paneId);
      for (const w of [...q.waiters]) {
        q.waiters.delete(w);
        this.waiterTotal--;
        this.clock.clearTimeout(w.timer);
        if (w.onAbort !== undefined) w.owner.signal?.removeEventListener("abort", w.onAbort);
        w.reject(new RpcError("not_found", `pane not found: ${paneId}`));
      }
    }
    this.setCount.delete(paneId);
    this.setBytes.delete(paneId);
  }

  /** bus へ配る。購読者の例外で台帳の後始末を止めない（中身は書かない）。 */
  private publish(event: ServerEvent): void {
    try {
      this.opts.bus.publish(event);
    } catch {
      this.opts.logger?.info("display event listener failed", { event: event.event });
    }
  }
}
