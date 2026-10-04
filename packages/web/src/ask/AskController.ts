import type { AskAnswerBody, AskClosedEvent, AskOpenedEvent, AskPending } from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { errorCodeOf } from "@sodashitsu/client-core";
import type { AskEntry, useAskStore } from "../store/ask.js";
import { loadMedia } from "./mediaUrl.js";

export interface AskControllerOptions {
  conn: Pick<ConnectionPort, "request">;
  store: ReturnType<typeof useAskStore>;
  toast(message: string): void;
}

/**
 * 質問のフォーム（`sodactl ask`。20261002-sodactl-ask）の通信の係。接続のたびに `ask.subscribe` して「質問を出せる画面」と名乗り（応答で、いま待っている質問を受け取る＝再読み込み・
 * 再接続・マシンの切り替えの後の出し直し）、`ask.opened` を受けたら `ask.get` で定義を取る（イベントは id だけ。定義は全接続に配らない）。
 * 古いサーバ・中継先（`ask.subscribe` が `not_found`）では黙って何もしない——そのサーバは購読者 0 として質問を `unavailable` にするので、呼び出し側は待たない。
 */
export class AskController {
  /** 切り替え・切断のたびに進める（その前に始めた要求の応答を捨てる印）。 */
  private generation = 0;

  constructor(private readonly opts: AskControllerOptions) {}

  /** 新しい接続で hello が通った。 */
  onOpened(): void {
    const generation = ++this.generation;
    this.opts.conn.request("ask.subscribe", {}).then(
      async (r) => {
        // メディアを取り終えた質問だけを置く（`resolveMedia` は同期なので、取ってから）。
        const loaded = await Promise.all(r.asks.map((a) => this.hydrate(a, generation)));
        if (generation === this.generation) this.opts.store.replaceAll(loaded.filter((a): a is AskEntry => a !== null));
      },
      () => undefined,
    );
  }

  /** 接続が閉じた。質問はサーバが持っている（再接続の `onOpened` で取り直す）ので、画面からは外す。 */
  onClosed(): void {
    this.generation++;
    this.opts.store.clear();
  }

  /** マシンの切り替え。前のマシンの質問・取りに行った途中の応答を捨てる（pane の id はマシンをまたいで重なる）。 */
  resetForMachineSwitch(): void {
    this.generation++;
    this.opts.store.clear();
  }

  /** `ask.opened`（id だけ）→ 定義を取る。`ask.closed` → 外す。 */
  onEvent(e: AskOpenedEvent | AskClosedEvent): void {
    if (e.event === "ask.closed") {
      this.opts.store.remove(e.data.askId);
      return;
    }
    const generation = this.generation;
    this.opts.conn.request("ask.get", { askId: e.data.askId }).then(
      async (ask) => {
        const entry = await this.hydrate(ask, generation);
        if (entry !== null && generation === this.generation) this.opts.store.add(entry);
      },
      () => undefined, // 取りに行く間に閉じた（ask_closed）・この接続は質問を出せる画面として登録されていない
    );
  }

  /**
   * 質問のメディア（画像・音・成果物）を取って、画面の質問にする。取っている間に閉じた・切り替わったときは `null`。
   * 成果物が取れなかった質問は、見ないまま答えさせないために取り消して `null`（画像・音は取れなくても質問は出す）。
   */
  private async hydrate(ask: AskPending, generation: number): Promise<AskEntry | null> {
    if ((ask.media ?? []).length === 0) return ask;
    const r = await loadMedia((m, p) => this.opts.conn.request(m, p), ask, () => generation === this.generation && this.opts.store.queue.every((q) => q.askId !== ask.askId));
    if (r === null) return null;
    if (r === "view_failed") {
      this.opts.toast("成果物を読み込めませんでした（質問は取り消しました）");
      if (generation === this.generation) void this.cancel(ask.askId);
      return null;
    }
    return { ...ask, resolved: r };
  }

  /** 回答を送る。成功したら外す。`ask_closed`（ほかの画面が先に答えた・時間切れ等）は知らせて外す。ほかの失敗は知らせて開いたままにする（`false`）。 */
  async answer(askId: string, body: AskAnswerBody): Promise<boolean> {
    try {
      await this.opts.conn.request("ask.answer", { askId, ...body });
    } catch (err) {
      return this.failed(askId, err);
    }
    this.opts.store.remove(askId);
    return true;
  }

  /** 取り消す。`ask_closed` は既に閉じている（成功と同じ）。ほかの失敗は知らせて閉じる（質問を残して画面を塞がない。サーバが先に閉じていなくても時間切れで終わる）。 */
  async cancel(askId: string): Promise<void> {
    try {
      await this.opts.conn.request("ask.cancel", { askId });
    } catch (err) {
      if (errorCodeOf(err) !== "ask_closed") this.opts.toast("質問を取り消せませんでした");
    }
    this.opts.store.remove(askId);
  }

  private failed(askId: string, err: unknown): boolean {
    if (errorCodeOf(err) === "ask_closed") {
      this.opts.toast("この質問は既に閉じられました（ほかの画面で答えたか、時間切れです）");
      this.opts.store.remove(askId);
      return true;
    }
    this.opts.toast(
      errorCodeOf(err) === "invalid_params"
        ? "回答をサーバが受け付けませんでした。内容を確かめてもう一度決定してください"
        : "回答を送れませんでした。接続を確かめてもう一度決定してください",
    );
    return false;
  }
}
