import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { MemoryLogger } from "../log/Logger.js";
import type { WsConnection } from "../ws/WsServer.js";
import {
  BRIDGE_FRAME,
  BridgeFrameDecoder,
  encodeBridgeFrame,
  parseClosePayload,
} from "./bridgeFrames.js";
import { BridgeEndpoint, BRIDGE_SESSION_ID, type BridgeSocketLike } from "./BridgeEndpoint.js";

/** 受け口の単体（20260927-multi-host-machines の T3）。socket の代わりに書いた枠を集める偽物を渡す。 */
class FakeSocket extends EventEmitter implements BridgeSocketLike {
  readonly written: Uint8Array[] = [];
  writableLength = 0;
  destroyed = false;
  ended = false;
  write(chunk: Uint8Array): boolean {
    this.written.push(chunk);
    return true;
  }
  end(): void {
    this.ended = true;
    this.destroy();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit("close");
  }
  feed(bytes: Uint8Array): void {
    this.emit("data", Buffer.from(bytes));
  }
  frames() {
    const d = new BridgeFrameDecoder({ role: "link" });
    return this.written.flatMap((w) => d.push(w));
  }
}

function setup() {
  const ep = new BridgeEndpoint(
    { version: "v", hostname: "h", sessionName: null },
    new MemoryLogger(),
  );
  const conns: { conn: WsConnection; sessionId: string; closes: number[] }[] = [];
  ep.onConnection((conn, sessionId) => {
    const rec = { conn, sessionId, closes: [] as number[] };
    conn.onClose((code) => rec.closes.push(code));
    conns.push(rec);
  });
  const sock = new FakeSocket();
  ep.handleSocket(sock);
  return { ep, sock, conns };
}

describe("BridgeEndpoint（単体。T3）", () => {
  it("OPEN でチャネルを WsConnection として渡す（sessionId は失効で閉じられない bridge）。閉じると CLOSE を 1 回だけ送る", () => {
    const { sock, conns } = setup();
    sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 5));
    expect(conns).toHaveLength(1);
    expect(conns[0]!.sessionId).toBe(BRIDGE_SESSION_ID);
    conns[0]!.conn.sendText("{}");
    conns[0]!.conn.close(1008, "あ".repeat(100)); // 300 バイト（UTF-16 の単位で切ると 120 バイトを超える）
    conns[0]!.conn.close(1000, "again");
    const closes = sock.frames().filter((f) => f.type === BRIDGE_FRAME.CLOSE);
    expect(closes).toHaveLength(1);
    expect(parseClosePayload(closes[0]!.payload).code).toBe(1008);
    // 受け手の parseClosePayload も切るので、送った枠の中身をそのまま読む。
    const reason = (JSON.parse(new TextDecoder().decode(closes[0]!.payload)) as { reason: string })
      .reason;
    expect(new TextEncoder().encode(reason).byteLength).toBeLessThanOrEqual(120);
    expect(reason).toBe("あ".repeat(40)); // 文字の途中で切らない
    expect(conns[0]!.closes).toEqual([1008]);
  });

  it("引き継ぎの間（setReady(false)）に開こうとしたチャネルは gateway に渡さず 1012 で閉じる。戻せば開ける", () => {
    const { ep, sock, conns } = setup();
    ep.setReady(false);
    sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 1));
    expect(conns).toHaveLength(0);
    const close = sock.frames().find((f) => f.type === BRIDGE_FRAME.CLOSE && f.channel === 1)!;
    expect(parseClosePayload(close.payload).code).toBe(1012);
    ep.setReady(true);
    sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 2));
    expect(conns).toHaveLength(1);
  });

  it("closeAll は全チャネルを閉じ、socket が切れたら残りのチャネルは 1006", () => {
    const { ep, sock, conns } = setup();
    sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 1));
    sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 2));
    conns[0]!.conn.close(1000, "");
    ep.closeAll(1012, "server restarting");
    expect(conns.map((c) => c.closes)).toEqual([[1000], [1012]]);
    const { sock: s2, conns: c2 } = setup();
    s2.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 1));
    s2.destroy();
    expect(c2[0]!.closes).toEqual([1006]);
  });

  it("64 本を超える OPEN は socket ごと切る", () => {
    const { sock } = setup();
    for (let i = 1; i <= 64; i++) sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, i));
    expect(sock.destroyed).toBe(false);
    sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 65));
    expect(sock.destroyed).toBe(true);
  });

  it("close() は socket を end してから閉じる（書いた CLOSE の枠を送り切る）。閉じ始めたら OPEN を扱わない", async () => {
    const { ep, sock, conns } = setup();
    const closing = ep.close();
    sock.feed(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 9));
    await closing;
    expect(sock.ended).toBe(true);
    expect(conns).toHaveLength(0);
  });
});
