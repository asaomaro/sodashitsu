import { randomBytes } from "node:crypto";
import {
  checkAskAnswer,
  normalizeAskSpec,
  RpcError,
  unsupportedTypeReason,
  type AskAnswerBody,
  type AskAnswers,
  type AskPending,
  type AskResult,
  type AskSpec,
  type ServerEvent,
  ASK_PENDING_MAX,
  ASK_PENDING_PER_CLIENT_MAX,
} from "@sodashitsu/protocol";
import type { Disposable, EventBus } from "../bus/EventBus.js";
import type { Logger } from "../log/Logger.js";

export interface AskServiceTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realTimers: AskServiceTimers = {
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export interface AskServiceOptions {
  paneExists(paneId: string): boolean;
  /** その接続が画面（desktop / mobile）か。 */
  isBrowserKind(clientId: string): boolean;
  /** `pane.closed` の購読と `ask.opened` / `ask.closed` の配布。 */
  bus: EventBus;
  timers?: AskServiceTimers;
  /** askId（既定は 16 バイトの乱数の hex）。 */
  random?: () => string;
  /** 内容（定義・回答）は書かない。askId・paneId・件数・結果の種類だけ。 */
  logger?: Pick<Logger, "info">;
}

interface Entry {
  askId: string;
  paneId: string;
  spec: AskSpec;
  /** `ask.open` を送った接続（切れたら質問を閉じる）。 */
  ownerClientId: string;
  timer: unknown;
  resolve(result: AskResult): void;
}

/**
 * pane のプログラムが出した質問の台帳（`sodactl ask`。20261002-sodactl-ask の design「AskService」）。
 * 質問の寿命は `ask.open` の要求の寿命で、閉じる理由（回答・取り消し・時間切れ・pane が閉じた・呼び出し側の切断・停止）はどれも `close()` を通る。
 * 画面（`ask.subscribe` した desktop / mobile）にだけ定義を返し、全クライアントへ配るイベントは id だけにする（中身を `sodactl watch` 等へ漏らさない）。
 */
export class AskService {
  private readonly byPane = new Map<string, Entry>();
  private readonly byId = new Map<string, Entry>();
  /** 質問を出せる画面（`ask.subscribe` 済みで、まだ接続が生きているもの）。 */
  private readonly subscribers = new Set<string>();
  private readonly timers: AskServiceTimers;
  private readonly random: () => string;
  private readonly busSub: Disposable;
  private disposed = false;

  constructor(private readonly opts: AskServiceOptions) {
    this.timers = opts.timers ?? realTimers;
    this.random = opts.random ?? (() => randomBytes(16).toString("hex"));
    this.busSub = opts.bus.subscribe((e) => {
      if (e.event === "pane.closed") {
        const entry = this.byPane.get(e.data.paneId);
        if (entry) this.close(entry, { status: "cancelled" });
      }
    });
  }

  /** 待っている質問の数（テスト・診断用）。 */
  get pendingCount(): number {
    return this.byId.size;
  }

  /** 質問を出せる画面の数（テスト・診断用）。 */
  get subscriberCount(): number {
    return this.subscribers.size;
  }

  /** この接続を質問を出せる画面として登録し、いま待っている質問を受けた順に返す。何度呼んでもよい。 */
  subscribe(clientId: string): AskPending[] {
    if (!this.opts.isBrowserKind(clientId)) throw new RpcError("invalid_params", "only a browser can show a form");
    this.subscribers.add(clientId);
    return [...this.byId.values()].map(pending);
  }

  /** 質問を出して、結果が決まるまで待つ（`ask.open`）。 */
  open(clientId: string, p: { paneId: string; spec: unknown; timeoutMs: number }): Promise<AskResult> {
    const checked = normalizeAskSpec(p.spec);
    if (!checked.ok && checked.unsupportedType === undefined) throw new RpcError("invalid_ask_spec", checked.message);
    if (!this.opts.paneExists(p.paneId)) throw new RpcError("not_found", `pane not found: ${p.paneId}`);
    if (this.byPane.has(p.paneId)) throw new RpcError("ask_busy", "this pane already has a question waiting for an answer");
    // 同時に待たせられる数の上限（メモリと `ask.subscribe` の応答の大きさを数で止める。`ImageUploads` の `maxActive` と同じ方針）。
    if (this.byId.size >= ASK_PENDING_MAX) throw new RpcError("ask_busy", "too many questions are waiting for an answer");
    let mine = 0;
    for (const e of this.byId.values()) if (e.ownerClientId === clientId) mine++;
    if (mine >= ASK_PENDING_PER_CLIENT_MAX) throw new RpcError("ask_busy", "this connection already has too many questions waiting for an answer");
    // 対応していない型の質問がある定義は、黙って落とさずダイアログも出さず `unavailable`（呼び出し側が別の手段で聞き直す）。
    if (!checked.ok) return Promise.resolve({ status: "unavailable", reason: unsupportedTypeReason(checked.unsupportedType!) });
    if (this.disposed) return Promise.resolve({ status: "unavailable", reason: "the server is shutting down" });
    if (this.liveSubscribers() === 0)
      return Promise.resolve({ status: "unavailable", reason: "no browser is connected to show the form" });
    return new Promise<AskResult>((resolve) => {
      const entry: Entry = {
        askId: this.random(),
        paneId: p.paneId,
        spec: checked.spec,
        ownerClientId: clientId,
        timer: undefined,
        resolve,
      };
      entry.timer = this.timers.setTimeout(() => this.close(entry, { status: "timeout" }), p.timeoutMs);
      this.byPane.set(entry.paneId, entry);
      this.byId.set(entry.askId, entry);
      this.opts.logger?.info("ask opened", { askId: entry.askId, paneId: entry.paneId, questions: entry.spec.questions.length });
      this.publish({ event: "ask.opened", data: { askId: entry.askId, paneId: entry.paneId } });
    });
  }

  /** 定義を取る（`ask.subscribe` 済みの接続だけ）。 */
  get(clientId: string, askId: string): AskPending {
    return pending(this.require(clientId, askId));
  }

  /** 回答を受ける。誤った形の回答は断り（質問は閉じない）、通れば質問を閉じる。 */
  answer(clientId: string, p: { askId: string; answers: AskAnswers; custom?: string[] | undefined; note?: string | undefined }): void {
    const entry = this.require(clientId, p.askId);
    const body: AskAnswerBody = { answers: p.answers };
    if (p.custom !== undefined) body.custom = p.custom;
    if (p.note !== undefined) body.note = p.note;
    const reason = checkAskAnswer(entry.spec, body);
    if (reason !== null) throw new RpcError("invalid_params", reason);
    const result: AskResult = { status: "answered", answers: body.answers };
    if (body.custom !== undefined && body.custom.length > 0) result.custom = body.custom;
    if (body.note !== undefined && body.note !== "") result.note = body.note;
    this.close(entry, result);
  }

  /** 取り消す。知らない id（既に閉じた）は成功——2 つの画面が同時に取り消しても誤りにしない。 */
  cancel(clientId: string, askId: string): void {
    if (!this.isSubscriber(clientId)) throw new RpcError("ask_closed", "unknown or closed question");
    const entry = this.byId.get(askId);
    if (entry) this.close(entry, { status: "cancelled" });
  }

  /** 接続が閉じた。購読者から外し、その接続が出した質問を閉じる（待ちの応答は閉じた接続へ行くだけ。目的は `ask.closed` を配ること）。 */
  onClientGone(clientId: string): void {
    this.subscribers.delete(clientId);
    for (const entry of [...this.byId.values()]) if (entry.ownerClientId === clientId) this.close(entry, { status: "cancelled" });
  }

  /** 全ての質問を閉じ、以後の `open` を断る（`composeServer` の `close()`。接続を閉じた後なので、応答は誰にも届かない）。 */
  dispose(): void {
    this.disposed = true;
    this.busSub.dispose();
    for (const entry of [...this.byId.values()]) this.close(entry, { status: "cancelled" });
    this.subscribers.clear();
  }

  private require(clientId: string, askId: string): Entry {
    const entry = this.byId.get(askId);
    if (!this.isSubscriber(clientId) || !entry) throw new RpcError("ask_closed", "unknown or closed question");
    return entry;
  }

  /**
   * いまも画面（desktop / mobile）として登録している購読者か。**購読の後に kind が変わった**（desktop で `ask.subscribe` してから hello で
   * `external` に替えた）接続を数えない・使わせない。
   */
  private isSubscriber(clientId: string): boolean {
    return this.subscribers.has(clientId) && this.opts.isBrowserKind(clientId);
  }

  private liveSubscribers(): number {
    let n = 0;
    for (const id of this.subscribers) if (this.opts.isBrowserKind(id)) n++;
    return n;
  }

  /** bus へ配る。購読者の例外で台帳の後始末・`ask.open` の応答を止めない（中身は書かない）。 */
  private publish(event: ServerEvent): void {
    try {
      this.opts.bus.publish(event);
    } catch {
      this.opts.logger?.info("ask event listener failed", { event: event.event });
    }
  }

  /** 質問を閉じる（1 回だけ）: 台帳から外し、`ask.closed` を配り、`ask.open` の応答を返す。 */
  private close(entry: Entry, result: AskResult): void {
    if (this.byId.get(entry.askId) !== entry) return;
    this.timers.clearTimeout(entry.timer);
    this.byId.delete(entry.askId);
    this.byPane.delete(entry.paneId);
    this.opts.logger?.info("ask closed", { askId: entry.askId, paneId: entry.paneId, status: result.status });
    entry.resolve(result);
    this.publish({ event: "ask.closed", data: { askId: entry.askId, paneId: entry.paneId } });
  }
}

function pending(e: Entry): AskPending {
  return { askId: e.askId, paneId: e.paneId, spec: e.spec };
}
