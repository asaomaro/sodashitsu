import type { Page, WebSocketRoute } from "@playwright/test";
import { decodeFrame, FRAME_TYPE, type ServerEvent } from "@sodashitsu/protocol";

/**
 * ブラウザ（ページの WebSocket）が受けたバイナリのフレーム（OUTPUT・SNAPSHOT）を、接続ごとに記録するテスト専用の道具
 * （D107）。テスト自身の WebSocket クライアント（`SodaTestClient`）は別の接続で購読するので、そこに出力が届いても
 * **ブラウザに届いたとは限らない**——サーバは購読・表示を接続（clientId）ごとに持つ。再接続の後に表示と購読を張り直して
 * いなかった不具合（D107）は、テストのクライアントでは出力が見えたまま、ブラウザにだけ届かなかった。
 * 接続は開いた順に 0, 1, 2… と数える。
 */
export interface ReceivedFrames {
  /** ブラウザが張った `/ws` の数（開いた順）。 */
  connectionCount(): number;
  /** `connection` 番目の接続でブラウザが受けた、その pane の OUTPUT をつないだ文字列。 */
  output(connection: number, paneId: string): string;
  /** `connection` 番目の接続でブラウザが受けた、その pane の SNAPSHOT の本文（受けた順）。 */
  snapshots(connection: number, paneId: string): string[];
}

class FrameLog implements ReceivedFrames {
  private readonly connections: { outputs: Map<string, string>; snapshots: Map<string, string[]> }[] = [];

  /** 新しい接続を足し、その番号を返す。 */
  open(): number {
    this.connections.push({ outputs: new Map(), snapshots: new Map() });
    return this.connections.length - 1;
  }

  record(connection: number, bytes: Uint8Array): void {
    const log = this.connections[connection];
    if (!log) return;
    const frame = decodeFrame(bytes);
    if (frame.type === FRAME_TYPE.OUTPUT) {
      log.outputs.set(frame.paneId, (log.outputs.get(frame.paneId) ?? "") + new TextDecoder().decode(frame.chunk));
    } else if (frame.type === FRAME_TYPE.SNAPSHOT) {
      log.snapshots.set(frame.paneId, [...(log.snapshots.get(frame.paneId) ?? []), frame.text]);
    }
  }

  connectionCount(): number {
    return this.connections.length;
  }

  output(connection: number, paneId: string): string {
    return this.connections[connection]?.outputs.get(paneId) ?? "";
  }

  snapshots(connection: number, paneId: string): string[] {
    return [...(this.connections[connection]?.snapshots.get(paneId) ?? [])];
  }
}

/**
 * CDP（`Network.webSocketFrameReceived`）で、ブラウザの実物の WebSocket が受けたフレームを記録する。
 * **`page.goto()` の前に `await` して呼ぶ**（`Network.enable` の前に張られた WebSocket は見えない）。`page.routeWebSocket`
 * を使うページでは使えない（Playwright はページの WebSocket を差し替えるので、CDP にはフレームが出ない）——その場合は
 * `routeRecordingWebSocket` を使う。
 */
export async function watchReceivedFrames(page: Page): Promise<ReceivedFrames> {
  const log = new FrameLog();
  const byRequestId = new Map<string, number>();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.webSocketCreated", (e) => {
    if (new URL(e.url).pathname === "/ws") byRequestId.set(e.requestId, log.open());
  });
  cdp.on("Network.webSocketFrameReceived", (e) => {
    const connection = byRequestId.get(e.requestId);
    if (connection === undefined || e.response.opcode !== 2) return; // バイナリのフレームだけ（JSON のイベント・応答は見ない）
    log.record(connection, new Uint8Array(Buffer.from(e.response.payloadData, "base64")));
  });
  return log;
}

/**
 * ブラウザ（ページの実物の WebSocket）が受けた JSON のイベントを、受けた順に返す関数を作る（20260921-workspace-auto-label）。
 * `watchReceivedFrames` はバイナリのフレームだけを見るので、名前の変化（`workspace.created`・`workspace.updated`）のような JSON のイベントは
 * これで見る。テスト自身のクライアントに届いたイベントではなく、**このブラウザが受けたもの**（条項 `e2e-observe-browser`）。
 * **`page.goto()` の前に `await` して呼ぶ**（`Network.enable` より前に張られた接続は見えない）。
 * `watchReceivedFrames` と違い、**接続を分けず**（再接続をまたいで受けた順につなぐ）、`/ws` 以外の WebSocket があれば（今は無い）それも数える。
 */
export async function watchReceivedEvents(page: Page): Promise<() => ServerEvent[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const received: ServerEvent[] = [];
  cdp.on("Network.webSocketFrameReceived", (e) => {
    if (e.response.opcode !== 1) return; // テキストのフレーム（JSON）だけ
    try {
      const msg = JSON.parse(e.response.payloadData) as { event?: unknown };
      if (typeof msg.event === "string") received.push(msg as ServerEvent);
    } catch {
      // JSON でないテキストは無い想定だが、あっても無視する。
    }
  });
  return () => [...received];
}

/** ページが送った JSON の要求（`{id, method, params}`）。 */
export interface SentRequest {
  method: string;
  params: unknown;
}

export interface RecordingWebSocketRoute {
  frames: ReceivedFrames;
  /**
   * `connection` 番目の接続でページがサーバへ送った JSON の要求（送った順。バイナリの INPUT は含まない。D108）。
   * `page.routeWebSocket` の下では CDP の `Network.webSocketFrameSent` にも出ないので、`client.view`・`client.fit` の中身と順序は
   * これで見る。
   */
  sent(connection: number): SentRequest[];
  /** `connection` 番目の接続を切る（ページ側を閉じる。Playwright は既定でサーバ側も閉じる）。 */
  drop(connection: number): Promise<void>;
  /**
   * この後の `count` 回の接続の試みを、サーバへつながずにすぐ閉じる（起動の途中の 503 等で `/ws` がつながらない間の代わり）。
   * `Infinity` なら、`refuseNext(0)` で許すまで断り続ける。
   */
  refuseNext(count: number): void;
  /** 断った試みの数。 */
  refusedCount(): number;
}

/**
 * `/ws` を `page.routeWebSocket` で中継し、サーバからページへ渡したフレーム（ページの WebSocket が受けたものそのもの）と、
 * ページが送った JSON の要求（D108）を記録する。
 * テストから接続を切る・次の試みを断ることができる。**`page.goto()` の前に `await` して呼ぶ**。
 */
export async function routeRecordingWebSocket(page: Page): Promise<RecordingWebSocketRoute> {
  const log = new FrameLog();
  const routes: WebSocketRoute[] = [];
  const sent: SentRequest[][] = [];
  let refuse = 0;
  let refused = 0;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (refuse > 0) {
      refuse--;
      refused++;
      void ws.close();
      return;
    }
    const connection = log.open();
    routes[connection] = ws;
    sent[connection] = [];
    const server = ws.connectToServer();
    // サーバ → ページの向きを横取りしたので、記録してから自分でページへ渡す。
    server.onMessage((message) => {
      if (typeof message !== "string") log.record(connection, new Uint8Array(message));
      ws.send(message);
    });
    // ページ → サーバの向きも、JSON の要求を記録してから自分でサーバへ渡す（横取りすると自動では中継されない。D108）。
    ws.onMessage((message) => {
      if (typeof message === "string") {
        try {
          const msg = JSON.parse(message) as { method?: unknown; params?: unknown };
          if (typeof msg.method === "string") sent[connection]!.push({ method: msg.method, params: msg.params });
        } catch {
          // JSON でないテキストは無い想定だが、あっても中継だけする。
        }
      }
      server.send(message);
    });
  });
  return {
    frames: log,
    sent: (connection) => [...(sent[connection] ?? [])],
    drop: async (connection) => {
      await routes[connection]?.close();
    },
    refuseNext: (count) => {
      refuse = count;
    },
    refusedCount: () => refused,
  };
}

/** ブラウザが送った INPUT（端末への入力）の 1 つ。 */
export interface SentInput {
  paneId: string;
  text: string;
}

/**
 * CDP（`Network.webSocketFrameSent`）で、ブラウザの実物の WebSocket が送った INPUT を送った順に記録する（D110：右クリックの
 * マウスの報告をブラウザが送ったかを、アプリの側の見え方（`cat -v`）とは別に、送る側で確かめる）。
 * **`page.goto()` の前に `await` して呼ぶ**（`watchReceivedFrames` と同じく、`Network.enable` の前に張られた WebSocket は見えない）。
 */
export async function watchSentInput(page: Page): Promise<() => SentInput[]> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const sent: SentInput[] = [];
  cdp.on("Network.webSocketFrameSent", (e) => {
    if (e.response.opcode !== 2) return; // バイナリのフレームだけ（JSON の要求は見ない）
    const frame = decodeFrame(new Uint8Array(Buffer.from(e.response.payloadData, "base64")));
    if (frame.type === FRAME_TYPE.INPUT) sent.push({ paneId: frame.paneId, text: new TextDecoder().decode(frame.bytes) });
  });
  return () => [...sent];
}
