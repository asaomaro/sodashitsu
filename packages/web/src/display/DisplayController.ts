import {
  DISPLAY_ACTION_RATE,
  readDisplayInfo,
  type DisplayChunk,
  type DisplayInfo,
  type DisplayMessageEvent,
  type DisplayRemovedEvent,
  type DisplayReportProblem,
  type DisplayUpdatedEvent,
} from "@sodashitsu/protocol";
import type { ConnectionPort } from "@sodashitsu/client-core";
import { errorCodeOf } from "@sodashitsu/client-core";
import type { useDisplayStore } from "../store/display.js";

export interface DisplayControllerOptions {
  conn: Pick<ConnectionPort, "request">;
  store: ReturnType<typeof useDisplayStore>;
  toast(message: string): void;
  /** いま実在する pane の id（スナップショットを受けた後に、もう無い pane の覚えた幅を捨てるため）。 */
  livePaneIds?: () => ReadonlySet<string>;
  /** 時計（テスト用に差し替える）。 */
  now?: () => number;
  /** 名乗る機能（テスト用に差し替える。既定は `DISPLAY_SUBSCRIBE_FEATURES`）。`script-html` を外すと、スクリプトが動く形式は固定の文言になる。 */
  subscribeFeatures?: string[];
}

/** 画面が名乗る機能（パネル・帯・操作・スクリプトが動く形式）。 */
export const DISPLAY_SUBSCRIBE_FEATURES = ["panel", "band", "actions", "script-html"];

/** 理由 `focus_steal` で閉じたときの利用者への知らせ（面の名前を入れる）。 */
export function focusStealToast(name: string): string {
  return `表示『${name}』は、キー入力を取ろうとし続けたので閉じました。この pane は、しばらくスクリプトが動く表示を出せません`;
}

/** 同じ面の中身を取り直す回数の上限（速く更新され続けても、いつかは諦めて今ある分を出す）。 */
const REFETCH_MAX = 8;

/** base64 の片を復号する。 */
function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * 表示の面（`sodactl display`。20261007-soda-extensions）の通信の係。接続のたびに `display.subscribe` して「面を出せる画面」と名乗り（応答で全 pane の面の見出しを受け取る）、
 * `display.updated`／`display.removed` で見出しを更新する。**イベントは見出しだけ**で、中身は描く面だけを `ensureContent` が `display.get` の小分けで取る。
 * 古いサーバ・中継先（`display.subscribe` が `not_found`）では黙って何もしない（面は出ない）。
 */
export class DisplayController {
  /** 切り替え・切断のたびに進める（その前に始めた要求の応答を捨てる印）。 */
  private generation = 0;
  /** 取っている最中の面（同じ id の取得は 1 本）。 */
  private readonly inflight = new Map<string, Promise<void>>();
  /** 操作の頻度の制限（毎秒 20 回で捨てる。サーバと同じ値）。 */
  private actionTokens: number = DISPLAY_ACTION_RATE.burst;
  private actionAt = 0;
  /** `display.message`（`sodactl display send` のデータ）を、その面の枠へ渡す登録（面の id → 受け手）。 */
  private readonly messageHandlers = new Map<string, Set<(data: unknown) => void>>();

  constructor(private readonly opts: DisplayControllerOptions) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  /** 新しい接続で hello が通った。 */
  onOpened(): void {
    const generation = ++this.generation;
    this.inflight.clear();
    const features = this.opts.subscribeFeatures ?? DISPLAY_SUBSCRIBE_FEATURES;
    this.opts.store.setScriptCapable(features.includes("script-html"));
    this.opts.conn.request("display.subscribe", { features }).then(
      (r) => {
        if (generation !== this.generation) return;
        const infos = r.displays.map((d) => readDisplayInfo(d)).filter((d): d is DisplayInfo => d !== null);
        this.opts.store.replaceAll(infos);
        const live = this.opts.livePaneIds?.();
        if (live && live.size > 0) this.opts.store.pruneWidths(live); // pane が 1 つも分からない間（スナップショット前）は捨てない
      },
      () => undefined, // 古いサーバ（not_found）・中継先: 面は出ない
    );
  }

  /** 接続が閉じた。台帳はサーバが持っている（再接続の `onOpened` で取り直す）ので、画面からは外す。 */
  onClosed(): void {
    this.generation++;
    this.inflight.clear();
    this.opts.store.clear();
  }

  /** マシンの切り替え。前のマシンの面・取りに行った途中の応答を捨てる（pane の id はマシンをまたいで重なる）。 */
  resetForMachineSwitch(): void {
    this.generation++;
    this.inflight.clear();
    this.opts.store.clear();
  }

  /** `display.message` を、その面の枠を描いている部品へ渡すための登録。戻り値は登録を外す関数。 */
  onMessage(id: string, fn: (data: unknown) => void): () => void {
    let set = this.messageHandlers.get(id);
    if (set === undefined) this.messageHandlers.set(id, (set = new Set()));
    set.add(fn);
    return () => {
      const s = this.messageHandlers.get(id);
      if (!s) return;
      s.delete(fn);
      if (s.size === 0) this.messageHandlers.delete(id);
    };
  }

  onEvent(e: DisplayUpdatedEvent | DisplayRemovedEvent | DisplayMessageEvent): void {
    if (e.event === "display.message") {
      // 保存しない: いま、その面の枠を描いている部品があるときだけ渡す。ほかは捨てる。
      for (const fn of [...(this.messageHandlers.get(e.data.id) ?? [])]) {
        try {
          fn(e.data.data);
        } catch {
          /* 1 つの受け手の失敗で、ほかを止めない */
        }
      }
      return;
    }
    if (e.event === "display.updated") {
      const info = readDisplayInfo(e.data.display);
      if (info) this.opts.store.upsert(info);
      return;
    }
    const { id, name, reason } = e.data;
    if (!this.opts.store.infos.has(id)) return; // 知らない面（この画面が名乗る前のもの・もう消した）
    this.opts.store.remove(id);
    // 枠の異常で閉じたときは、利用者に知らせる（自分が `report` した画面でも、ほかの画面でも 1 回だけ）。
    if (reason === "navigated") this.opts.toast(`表示『${name}』は、別のページへ移ろうとしたので閉じました`);
    else if (reason === "unresponsive") this.opts.toast(`表示『${name}』は、応答しなくなったので閉じました`);
    else if (reason === "focus_steal") this.opts.toast(focusStealToast(name));
  }

  /**
   * 面の中身を取る（無い・版が古いとき）。`display.get` を `offset` を進めて繰り返し、片を積んで、最後に 1 回だけ文字列にする。
   * 同じ id は 1 本にまとめ、取っている間に版が進んだら最後の版を取り直す。途中で `rev` が変わったら最初から。
   */
  ensureContent(id: string): Promise<void> {
    const running = this.inflight.get(id);
    if (running) return running;
    const p = this.fetchContent(id).finally(() => {
      if (this.inflight.get(id) === p) this.inflight.delete(id);
    });
    this.inflight.set(id, p);
    return p;
  }

  private async fetchContent(id: string): Promise<void> {
    const generation = this.generation;
    const { store } = this.opts;
    for (let attempt = 0; attempt < REFETCH_MAX; attempt++) {
      const info = store.infos.get(id);
      if (!info) return;
      const have = store.contents.get(id);
      if (have && have.rev === info.rev && have.format === info.format) return;
      const got = await this.fetchOnce(id, generation);
      if (got === "stop" || generation !== this.generation) return;
      if (got === "restart") continue;
      if (got === "bad") {
        // 受け取った大きさが `totalBytes` と合わない・空の片が eof でない: 取り直す。何度やっても合わなければ、固定の文言にする。
        if (attempt === REFETCH_MAX - 1) store.setContentFailed(id, true);
        continue;
      }
      store.setContentFailed(id, false);
      store.setContent({ id, rev: got.rev, format: got.format, content: got.content });
      // 取っている間に版が進んでいたら、もう一度（ループの先頭で判定する）。
    }
  }

  private async fetchOnce(id: string, generation: number): Promise<{ rev: number; format: string; content: string } | "restart" | "stop" | "bad"> {
    const parts: Uint8Array[] = [];
    let offset = 0;
    let rev = -1;
    let format = "";
    let total = 0;
    for (;;) {
      let chunk: DisplayChunk;
      try {
        chunk = await this.opts.conn.request("display.get", { id, offset });
      } catch (err) {
        // 消えた・名乗っていない・古いサーバ: 諦める（次に必要になったときに取り直す）。
        void errorCodeOf(err);
        return "stop";
      }
      if (generation !== this.generation) return "stop";
      if (rev === -1) {
        rev = chunk.rev;
        format = chunk.format;
        total = chunk.totalBytes;
      } else if (chunk.rev !== rev) {
        return "restart"; // 取っている途中で版が替わった: 最初から
      }
      if (chunk.base64 !== "") {
        const bytes = decodeBase64(chunk.base64);
        parts.push(bytes);
        offset += bytes.length;
      }
      if (chunk.base64 === "" && !chunk.eof) return "bad"; // 空の片で終わらせない
      if (chunk.eof) break;
    }
    if (offset !== total) return "bad";
    const all = new Uint8Array(offset);
    let at = 0;
    for (const part of parts) {
      all.set(part, at);
      at += part.length;
    }
    return { rev, format, content: new TextDecoder("utf-8").decode(all) };
  }

  /** 枠が受けた利用者の操作を、待っているプログラムへ届ける。毎秒 20 回を超えた分は捨てる（サーバも同じ値で捨てる）。 */
  sendAction(id: string, rev: number, action: string, data?: Record<string, string>): void {
    const t = this.now();
    const rate = DISPLAY_ACTION_RATE;
    this.actionTokens = Math.min(rate.burst, this.actionTokens + ((t - this.actionAt) / 1000) * rate.perSec);
    this.actionAt = t;
    if (this.actionTokens < 1) return;
    this.actionTokens -= 1;
    this.opts.conn.request("display.action", { id, rev, action, ...(data ? { data } : {}) }).catch(() => undefined);
  }

  /** 利用者が面を閉じる（`id` の 1 つか、`paneId` の pane の全部）。 */
  dismiss(sel: { id: string } | { paneId: string }): void {
    this.opts.conn.request("display.dismiss", sel).catch(() => undefined);
  }

  /**
   * 枠の異常を知らせる（`navigated`・`unresponsive`・`focus_steal`）。**頻度の制限に入れない・捨てない**（`sendAction` とは別）。
   * `paneId`・`format` は、描いていた枠のものを添える（サーバが、面がもう無くても、その pane に数えられるように）。
   * 戻り値は「サーバへ届いたか」（サーバが答えた＝真。繋がっていない・応答が無い＝偽）。`focus_steal` を送れなかった画面は、その画面の中で数える。
   */
  report(id: string, problem: DisplayReportProblem, ctx: { paneId: string; format: string }): Promise<boolean> {
    const answered = (err: unknown): boolean => errorCodeOf(err) !== null;
    return this.opts.conn.request("display.report", { id, problem, paneId: ctx.paneId, format: ctx.format }).then(
      () => true,
      (err: unknown) => {
        // 添えた項目を知らない古いサーバ（`invalid_params`）には、`{id, problem}` だけで 1 回送り直す。`display_closed` などは黙って捨てる。
        if (errorCodeOf(err) === "invalid_params") {
          return this.opts.conn.request("display.report", { id, problem }).then(
            () => true,
            (e2: unknown) => answered(e2),
          );
        }
        return answered(err);
      },
    );
  }
}
