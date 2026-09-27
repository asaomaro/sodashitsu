import type { MethodName, ParamsOf, ResultOf, ServerEvent, ServerEventName, SessionSnapshot } from "@sodashitsu/protocol";
import { decodeFrame, encodeInputFrame, FRAME_TYPE } from "@sodashitsu/protocol";
import WebSocket from "ws";

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/**
 * 生の WebSocket クライアント（`smoke.ts`・`net/Connection.ts` と同じ形の**1 つの持続的な `message`
 * ハンドラ**。id で振り分け、OUTPUT は pane ごとに溜め続ける、イベント（`{event, data}`）は種別ごとに
 * 溜め続ける。取りこぼしを避けるための設計は smoke.ts の D79 と同じ理由——05-e2e-docs T1 でも同じ形にする）。
 * E2E の「サーバ側の状態を素早く作る／サーバが発行したイベントを検証する」用途に使う
 * （画面の検証そのものは Playwright の `page` を使う）。
 */
export interface SodaTestClient {
  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>;
  /**
   * 既に溜まっている分を含めて、そのうち `needle` が現れるまで待つ（ポーリング）。
   * **先に `pane.subscribe` を呼んでいない pane の OUTPUT は届かない**（design の購読の方式どおり。
   * このクライアントとブラウザ側は別接続なので、ブラウザが表示していても自動では届かない）。
   */
  waitForOutput(paneId: string, needle: string, timeoutMs?: number): Promise<void>;
  /** 直近に受けたイベント（種別ごとに最後のものだけ）。 */
  lastEvent<N extends ServerEventName>(name: N): Extract<ServerEvent, { event: N }> | undefined;
  /** 直近の `client.hello` 応答の `snapshot`（`openClient` が内部で呼ぶ分も含む。起動直後の初期 pane の
   *  id を得る等に使う——初期 pane は `pane.created` を一度も broadcast されない。05-e2e-docs T2）。 */
  helloSnapshot(): SessionSnapshot | null;
  /**
   * 今後届く、条件に合う最初のイベントを待つ（無ければタイムアウト）。**「既に溜まっている分」も見る**
   * （`lastEvent` と同じキャッシュ）——`predicate` を省略して同じ種別のイベントを 2 回目以降待つと、
   * **直前の別の操作で既に届いていた古いイベントへ即座に解決してしまう**（例：1 回目の分割の
   * `pane.created` が残ったまま、2 回目の分割の完了を`predicate` 無しで待つと、新しい pane の
   * 作成を待たずに古い id で解決する）。**「次に届く、まだ見ていない特定の1件」を待つときは、
   * 既知の id を除外する等の `predicate` を必ず付ける**（05-e2e-docs T2 の E2E で実際にこれで
   * ハマった——原因の切り分けに CDP の生フレームを見ることになった）。
   */
  waitForEvent<N extends ServerEventName>(name: N, predicate?: (e: Extract<ServerEvent, { event: N }>) => boolean, timeoutMs?: number): Promise<Extract<ServerEvent, { event: N }>>;
  /** その pane の、今まで届いた OUTPUT の生バイト列（文字列化済み）をそのまま返す（部分一致では確認しづらい、
   *  ANSI エスケープや全角文字がそのまま届いているかのバイト単位の確認に使う。05-e2e-docs T3）。 */
  rawOutput(paneId: string): string;
  /** `net/Connection.ts` の `sendInput` と同じ形の生の INPUT フレーム送出（05-e2e-docs T11。AC17 の
   *  遅延計測で、ブラウザの `page.keyboard` の分だけディレイが乗るのを避けるために使う）。 */
  sendInput(paneId: string, bytes: string): void;
  /**
   * **送る前に**呼ぶ。この時点までに届いた分より後に新しい OUTPUT が来たら解決する関数を返す
   * （05-e2e-docs T11。AC17 の 1 文字 INPUT→OUTPUT の遅延計測用）。`waitForOutput`（内容の部分一致・
   * 50ms 間隔のポーリング）は 2 点で計測に向かない：(1) 実際の遅延（数ms〜数十ms）にポーリングの
   * 粒度がそのまま上乗せされる、(2) 200 回のループで同じ 1 文字を使い回すと、2 回目以降は「既に
   * 溜まっている分」に前回のぶんが残っていて即座に（0ms で）解決してしまい計測にならない。
   * ここは内容を見ず「新しく届いたか」だけを、フレーム到着のその場（ポーリング無し）で判定する。
   */
  armNextOutput(paneId: string): () => Promise<void>;
  /**
   * サーバが持つその pane の大きさ（このクライアントが知る最新。`client.hello` の snapshot・`pane.created`・
   * `pane.size_changed` から追う。イベントは全クライアントへ配られる）。知らない pane は `undefined`。
   * 画面に出ていない pane の PTY が縮められていないか（D105）を確かめるのに使う。
   */
  paneSize(paneId: string): { cols: number; rows: number } | undefined;
  close(): void;
}

let nextId = 1;

export function createTestClient(ws: WebSocket): SodaTestClient {
  const pending = new Map<string, PendingRequest>();
  const paneOutput = new Map<string, string>();
  const lastEvents = new Map<string, ServerEvent>();
  let lastHelloSnapshot: SessionSnapshot | null = null;
  const eventWaiters = new Set<{ name: string; predicate: ((e: ServerEvent) => boolean) | undefined; resolve: (e: ServerEvent) => void }>();
  const outputWaiters = new Map<string, Set<{ fromLength: number; resolve: () => void }>>();
  const paneSizes = new Map<string, { cols: number; rows: number }>();

  ws.on("message", (data: Buffer, isBinary: boolean) => {
    if (isBinary) {
      const decoded = decodeFrame(new Uint8Array(data));
      if (decoded.type === FRAME_TYPE.OUTPUT) {
        const next = (paneOutput.get(decoded.paneId) ?? "") + new TextDecoder().decode(decoded.chunk);
        paneOutput.set(decoded.paneId, next);
        const waiters = outputWaiters.get(decoded.paneId);
        if (waiters) {
          for (const w of [...waiters]) {
            if (next.length > w.fromLength) {
              waiters.delete(w);
              w.resolve();
            }
          }
        }
      } else if (decoded.type === FRAME_TYPE.SNAPSHOT) {
        // SNAPSHOT の本文（その時点の画面と scrollback）も出力として足す。購読より前にシェルが済ませた出力（ブラウザが溜めた入力を
        // 新しい pane へ流した直後のエコー等。D99）は SNAPSHOT の中にしか無く、足さないと `waitForOutput` が見落として間欠的に
        // 落ちていた（親の統合 test ラウンド7・05 の T16）。本文は画面の再現用のエスケープ列を含むが、`includes` での照合には障らない。
        paneOutput.set(decoded.paneId, (paneOutput.get(decoded.paneId) ?? "") + decoded.text);
        // 流量制御で止めた購読を再開するとき、サーバは差分ではなく画面全体の SNAPSHOT を送る（design「流量制御」）。
        // これも「その pane の画面が更新された」ことなので、`armNextOutput` の待ちを解く（親の統合 test で追加）。
        const waiters = outputWaiters.get(decoded.paneId);
        if (waiters) {
          for (const w of [...waiters]) {
            waiters.delete(w);
            w.resolve();
          }
        }
      }
      return;
    }
    const msg = JSON.parse(data.toString("utf8")) as { id?: string; result?: unknown; error?: unknown; event?: string };
    if (msg.id) {
      const req = pending.get(msg.id);
      if (!req) return;
      pending.delete(msg.id);
      if (msg.error) req.reject(new Error(`request ${msg.id} failed: ${JSON.stringify(msg.error)}`));
      else req.resolve(msg.result);
      return;
    }
    if (msg.event) {
      const ev = msg as unknown as ServerEvent;
      lastEvents.set(ev.event, ev);
      if (ev.event === "pane.created") paneSizes.set(ev.data.pane.id, { cols: ev.data.pane.cols, rows: ev.data.pane.rows });
      else if (ev.event === "pane.size_changed") paneSizes.set(ev.data.paneId, { cols: ev.data.cols, rows: ev.data.rows });
      for (const waiter of [...eventWaiters]) {
        if (waiter.name !== ev.event) continue;
        if (waiter.predicate && !waiter.predicate(ev)) continue;
        eventWaiters.delete(waiter);
        waiter.resolve(ev);
      }
    }
  });

  function request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>> {
    const id = String(nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`timed out waiting for response to ${method} (id=${id})`));
      }, 10_000);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          if (method === "client.hello") {
            lastHelloSnapshot = (v as { snapshot: SessionSnapshot }).snapshot;
            for (const pane of lastHelloSnapshot.panes) paneSizes.set(pane.id, { cols: pane.cols, rows: pane.rows });
          }
          resolve(v as ResultOf<M>);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async function waitForOutput(paneId: string, needle: string, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if ((paneOutput.get(paneId) ?? "").includes(needle)) return;
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for "${needle}" in pane ${paneId} output; got: ${JSON.stringify((paneOutput.get(paneId) ?? "").slice(-500))}`);
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  function lastEvent<N extends ServerEventName>(name: N): Extract<ServerEvent, { event: N }> | undefined {
    return lastEvents.get(name) as Extract<ServerEvent, { event: N }> | undefined;
  }

  function waitForEvent<N extends ServerEventName>(
    name: N,
    predicate?: (e: Extract<ServerEvent, { event: N }>) => boolean,
    timeoutMs = 8000,
  ): Promise<Extract<ServerEvent, { event: N }>> {
    const already = lastEvent(name);
    if (already && (!predicate || predicate(already))) return Promise.resolve(already);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        eventWaiters.delete(waiter);
        reject(new Error(`timed out waiting for event "${name}"`));
      }, timeoutMs);
      const waiter = {
        name,
        predicate: predicate as ((e: ServerEvent) => boolean) | undefined,
        resolve: (e: ServerEvent) => {
          clearTimeout(timer);
          resolve(e as Extract<ServerEvent, { event: N }>);
        },
      };
      eventWaiters.add(waiter);
    });
  }

  function helloSnapshot(): SessionSnapshot | null {
    return lastHelloSnapshot;
  }

  function rawOutput(paneId: string): string {
    return paneOutput.get(paneId) ?? "";
  }

  function sendInput(paneId: string, bytes: string): void {
    ws.send(encodeInputFrame(paneId, new TextEncoder().encode(bytes)));
  }

  function armNextOutput(paneId: string, timeoutMs = 8000): () => Promise<void> {
    const fromLength = (paneOutput.get(paneId) ?? "").length;
    return () =>
      new Promise((resolve, reject) => {
        if ((paneOutput.get(paneId) ?? "").length > fromLength) {
          resolve();
          return;
        }
        const timer = setTimeout(() => {
          outputWaiters.get(paneId)?.delete(entry);
          reject(new Error(`timed out waiting for new OUTPUT on pane ${paneId}`));
        }, timeoutMs);
        const entry = {
          fromLength,
          resolve: () => {
            clearTimeout(timer);
            resolve();
          },
        };
        let set = outputWaiters.get(paneId);
        if (!set) {
          set = new Set();
          outputWaiters.set(paneId, set);
        }
        set.add(entry);
      });
  }

  function paneSize(paneId: string): { cols: number; rows: number } | undefined {
    const size = paneSizes.get(paneId);
    return size ? { ...size } : undefined;
  }

  return { request, waitForOutput, lastEvent, waitForEvent, helloSnapshot, rawOutput, sendInput, armNextOutput, paneSize, close: () => ws.close() };
}
