export interface WsConnection {
  sendText(json: string): void;
  /** `compress: false` はこの 1 通を permessage-deflate で圧縮しない（OUTPUT の大量送信用。D98）。 */
  sendBinary(frame: Uint8Array, opts?: { compress?: boolean }): void;
  readonly bufferedAmount: number;
  onText(cb: (s: string) => void): void;
  onBinary(cb: (b: Uint8Array) => void): void;
  onDrain(cb: () => void): void;
  onClose(cb: (code: number) => void): void;
  close(code: number, reason: string): void;
  /**
   * 同じマシンからの接続か（`auth/LocalLogin.ts` の `isSameMachine`。接続の両端のアドレスで見るだけなので、このマシンの上の中継の後ろでは
   * 別のマシンからの接続も真になる）。`file.info` が返す。分からない接続（中継の受け口等）は持たない＝偽。
   */
  readonly sameMachine?: boolean;
}

/** upgrade を受け付ける口（architecture.md「WsServer」）。認可の判定は `WsServerWs` が担う（D9 の差し替え点）。 */
export interface WsServer {
  onConnection(cb: (conn: WsConnection, sessionId: string) => void): void;
  /**
   * 全接続を閉じる（グレースフルシャットダウン用。レビュー指摘：ブラウザが1つでも繋がったままだと
   * `http.Server.close()` のコールバックが永久に発火しない——WebSocket にアップグレード済みの
   * ソケットは、こちらから明示的に閉じない限り `http.Server` の接続一覧に残り続けるため）。
   */
  closeAll(code: number, reason: string): void;
}
