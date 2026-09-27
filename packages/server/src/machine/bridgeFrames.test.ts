import { describe, expect, it } from "vitest";
import {
  BRIDGE_FRAME,
  BRIDGE_LIMITS,
  BRIDGE_MARKER,
  BridgeFrameDecoder,
  BridgeProtocolError,
  encodeBridgeFrame,
  encodeJson,
  markerBytes,
  parseBridgeHello,
  parseClosePayload,
  truncateUtf8,
} from "./bridgeFrames.js";

const enc = new TextEncoder();
const text = (s: string): Uint8Array => enc.encode(s);
const cat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
};
const hello = (over: Record<string, unknown> = {}): Uint8Array =>
  encodeBridgeFrame(
    BRIDGE_FRAME.HELLO,
    0,
    encodeJson({
      bridge: 1,
      protocol: 1,
      version: "0.1.0",
      hostname: "h",
      sessionName: null,
      ...over,
    }),
  );

describe("bridgeFrames（20260927-multi-host-machines T2）", () => {
  it("見出し 9 バイト（type・channel u32 BE・length u32 BE）で符号化する", () => {
    const f = encodeBridgeFrame(BRIDGE_FRAME.TEXT, 0x01020304, text("ab"));
    expect([...f]).toEqual([0x04, 1, 2, 3, 4, 0, 0, 0, 2, 0x61, 0x62]);
  });

  it("link は目印の前のゴミを読み捨て、分割して届いた枠を 1 バイトずつでも組み立てる", () => {
    const bytes = cat(
      text("motd from .bashrc\n"),
      markerBytes(),
      hello(),
      encodeBridgeFrame(BRIDGE_FRAME.TEXT, 3, text('{"id":"1"}')),
    );
    const d = new BridgeFrameDecoder({ role: "link" });
    const frames = [];
    for (const b of bytes) frames.push(...d.push(Uint8Array.of(b)));
    expect(d.sawMarker).toBe(true);
    expect(frames.map((f) => [f.type, f.channel])).toEqual([
      [BRIDGE_FRAME.HELLO, 0],
      [BRIDGE_FRAME.TEXT, 3],
    ]);
    expect(new TextDecoder().decode(frames[1]!.payload)).toBe('{"id":"1"}');
  });

  it("目印は最初の maxPreamble バイトの中に始まるものだけ受ける（境界の両側）", () => {
    // 99 バイトのゴミ＋目印（100 バイト目＝位置 99 から始まる）は受ける
    const ok = new BridgeFrameDecoder({ role: "link", maxPreamble: 100 });
    expect(ok.push(cat(new Uint8Array(99).fill(0x41), markerBytes(), hello()))).toHaveLength(1);
    // 100 バイトのゴミ＋目印（位置 100 から始まる＝範囲の外）は投げる。一度に届いても分かれて届いても同じ
    expect(() =>
      new BridgeFrameDecoder({ role: "link", maxPreamble: 100 }).push(
        cat(new Uint8Array(100).fill(0x41), markerBytes()),
      ),
    ).toThrow(BridgeProtocolError);
    const split = new BridgeFrameDecoder({ role: "link", maxPreamble: 100 });
    expect(split.push(new Uint8Array(99).fill(0x41))).toEqual([]);
    expect(() => split.push(new Uint8Array(20).fill(0x41))).toThrow(BridgeProtocolError);
    // 前のかたまりで読み捨てた分＋次のかたまりの中の位置が上限を越えるなら投げる（95＋10 → 位置 105）
    const carried = new BridgeFrameDecoder({ role: "link", maxPreamble: 100 });
    expect(carried.push(new Uint8Array(95).fill(0x41))).toEqual([]);
    expect(() => carried.push(cat(new Uint8Array(10).fill(0x41), markerBytes()))).toThrow(
      BridgeProtocolError,
    );
    // 目印が 2 つのかたまりにまたがっても見つける
    const across = new BridgeFrameDecoder({ role: "link" });
    const mk = markerBytes();
    expect(across.push(cat(text("junk"), mk.subarray(0, 5)))).toEqual([]);
    expect(across.push(cat(mk.subarray(5), hello()))).toHaveLength(1);
    expect(BRIDGE_LIMITS.maxPreambleBytes).toBe(64 * 1024);
    expect(BRIDGE_MARKER).toBe("WTM-BRIDGE 1\n");
  });

  it("1 つのかたまりに入った多数の小さな枠・細かく分かれた大きな枠を、全部そのまま取り出す", () => {
    const many = new BridgeFrameDecoder({ role: "endpoint" });
    const one = encodeBridgeFrame(BRIDGE_FRAME.TEXT, 1, new Uint8Array(0));
    const n = 7000;
    const big = new Uint8Array(one.byteLength * n);
    for (let i = 0; i < n; i++) big.set(one, i * one.byteLength);
    expect(many.push(big)).toHaveLength(n);
    const large = new BridgeFrameDecoder({ role: "endpoint" });
    const payload = new Uint8Array(BRIDGE_LIMITS.maxMessageBytes).map((_, i) => i & 0xff);
    const frame = encodeBridgeFrame(BRIDGE_FRAME.BINARY, 2, payload);
    const got = [];
    for (let o = 0; o < frame.byteLength; o += 65536)
      got.push(...large.push(frame.subarray(o, o + 65536)));
    expect(got).toHaveLength(1);
    expect(got[0]!.payload.byteLength).toBe(payload.byteLength);
    expect(got[0]!.payload[12345]).toBe(12345 & 0xff);
  });

  it("接続全体の枠（HELLO・PONG）は channel 0、チャネルの枠（OPEN・CLOSE・TEXT）は 0 以外。encode は channel の範囲を確かめる", () => {
    const link = () => {
      const d = new BridgeFrameDecoder({ role: "link" });
      d.push(markerBytes());
      return d;
    };
    const raw = (type: number, channel: number) => {
      const h = new Uint8Array(9);
      new DataView(h.buffer).setUint8(0, type);
      new DataView(h.buffer).setUint32(1, channel, false);
      return h;
    };
    expect(() => link().push(raw(BRIDGE_FRAME.HELLO, 1))).toThrow(/channel 0/);
    expect(() => link().push(raw(BRIDGE_FRAME.PONG, 2))).toThrow(/channel 0/);
    expect(() => link().push(raw(BRIDGE_FRAME.CLOSE, 0))).toThrow(/channel 0/);
    expect(() =>
      new BridgeFrameDecoder({ role: "endpoint" }).push(raw(BRIDGE_FRAME.OPEN, 0)),
    ).toThrow(/channel 0/);
    expect(() => encodeBridgeFrame(BRIDGE_FRAME.TEXT, -1)).toThrow(RangeError);
    expect(() => encodeBridgeFrame(BRIDGE_FRAME.TEXT, 2 ** 32)).toThrow(RangeError);
    expect(() => encodeBridgeFrame(BRIDGE_FRAME.TEXT, 1.5)).toThrow(RangeError);
    expect(encodeBridgeFrame(BRIDGE_FRAME.TEXT, 2 ** 32 - 1).byteLength).toBe(9);
  });

  it("向きの違う type は投げる（link は OPEN・PING を、endpoint は HELLO・PONG を受けない）", () => {
    const link = new BridgeFrameDecoder({ role: "link" });
    link.push(markerBytes());
    expect(() => link.push(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 1))).toThrow(BridgeProtocolError);
    const ep = new BridgeFrameDecoder({ role: "endpoint" });
    expect(() => ep.push(hello())).toThrow(BridgeProtocolError);
    const link2 = new BridgeFrameDecoder({ role: "link" });
    link2.push(markerBytes());
    expect(() => link2.push(encodeBridgeFrame(BRIDGE_FRAME.PING, 0))).toThrow(BridgeProtocolError);
    expect(() =>
      new BridgeFrameDecoder({ role: "endpoint" }).push(encodeBridgeFrame(BRIDGE_FRAME.PONG, 0)),
    ).toThrow(BridgeProtocolError);
    const ep2 = new BridgeFrameDecoder({ role: "endpoint" });
    expect(ep2.push(encodeBridgeFrame(BRIDGE_FRAME.OPEN, 1))).toHaveLength(1);
    expect(ep2.push(encodeBridgeFrame(BRIDGE_FRAME.PING, 0, text("x")))).toHaveLength(1);
  });

  it("知らない type・channel の規則違反・長さの超過は、本体を待たずに見出しだけで投げる", () => {
    const unknown = new BridgeFrameDecoder({ role: "endpoint" });
    expect(() => unknown.push(Uint8Array.of(0x09, 0, 0, 0, 1, 0, 0, 0, 0))).toThrow(
      /unexpected frame type/,
    );
    const ch0 = new BridgeFrameDecoder({ role: "endpoint" });
    expect(() => ch0.push(Uint8Array.of(BRIDGE_FRAME.TEXT, 0, 0, 0, 0, 0, 0, 0, 0))).toThrow(
      /channel 0/,
    );
    const pingCh = new BridgeFrameDecoder({ role: "endpoint" });
    expect(() => pingCh.push(Uint8Array.of(BRIDGE_FRAME.PING, 0, 0, 0, 1, 0, 0, 0, 0))).toThrow(
      /channel 0/,
    );
    // 長さ 4MiB+1 の見出しだけ（本体は来ていない）で投げる
    const big = new BridgeFrameDecoder({ role: "endpoint" });
    const header = new Uint8Array(9);
    new DataView(header.buffer).setUint8(0, BRIDGE_FRAME.BINARY);
    new DataView(header.buffer).setUint32(1, 1, false);
    new DataView(header.buffer).setUint32(5, BRIDGE_LIMITS.maxMessageBytes + 1, false);
    expect(() => big.push(header)).toThrow(/too large/);
    // ちょうど上限は通る（見出しの時点では待つ）
    const edge = new BridgeFrameDecoder({ role: "endpoint" });
    new DataView(header.buffer).setUint32(5, BRIDGE_LIMITS.maxMessageBytes, false);
    expect(edge.push(header)).toEqual([]);
    // リモート → 手元（link が読む）は大きな SNAPSHOT のために 64MiB まで。4MiB を超えても待ち、64MiB を超えれば投げる
    const linkBig = new BridgeFrameDecoder({ role: "link" });
    linkBig.push(markerBytes());
    new DataView(header.buffer).setUint32(5, BRIDGE_LIMITS.maxMessageBytes + 1, false);
    expect(linkBig.push(header)).toEqual([]);
    const linkTooBig = new BridgeFrameDecoder({ role: "link" });
    linkTooBig.push(markerBytes());
    new DataView(header.buffer).setUint32(5, BRIDGE_LIMITS.maxRemoteMessageBytes + 1, false);
    expect(() => linkTooBig.push(header)).toThrow(/too large/);
    // OPEN に payload・PING の 65 バイト・CLOSE の 1025 バイトは投げる
    expect(() =>
      new BridgeFrameDecoder({ role: "endpoint" }).push(
        Uint8Array.of(BRIDGE_FRAME.OPEN, 0, 0, 0, 1, 0, 0, 0, 1, 0),
      ),
    ).toThrow(/too large/);
    expect(() => encodeBridgeFrame(BRIDGE_FRAME.PING, 0, new Uint8Array(65))).toThrow(/too large/);
    expect(() => encodeBridgeFrame(BRIDGE_FRAME.CLOSE, 1, new Uint8Array(1025))).toThrow(
      /too large/,
    );
  });

  it("HELLO は bridge 1・protocol 1・短い文字列だけを受け付ける", () => {
    const payload = (o: Record<string, unknown>) =>
      encodeJson({ bridge: 1, protocol: 1, version: "v", hostname: "h", sessionName: "s", ...o });
    expect(parseBridgeHello(payload({}))).toEqual({
      bridge: 1,
      protocol: 1,
      version: "v",
      hostname: "h",
      sessionName: "s",
    });
    expect(parseBridgeHello(payload({ sessionName: null })).sessionName).toBeNull();
    expect(() => parseBridgeHello(payload({ bridge: 2 }))).toThrow(/bridge version/);
    expect(() => parseBridgeHello(payload({ protocol: 2 }))).toThrow(/protocol version/);
    expect(() => parseBridgeHello(payload({ hostname: "x".repeat(257) }))).toThrow(/malformed/);
    expect(() => parseBridgeHello(payload({ hostname: "日".repeat(86) }))).toThrow(/malformed/); // 258 バイト
    expect(parseBridgeHello(payload({ hostname: "日".repeat(85) })).hostname).toHaveLength(85); // 255 バイト
    expect(() => parseBridgeHello(payload({ sessionName: 3 }))).toThrow(/malformed/);
    expect(() => parseBridgeHello(text("not json"))).toThrow(/malformed/);
    expect(() => parseBridgeHello(Uint8Array.of(0xff, 0xfe))).toThrow(/malformed/);
  });

  it("CLOSE の payload は空なら 1000、壊れている・送れない code なら 1011", () => {
    expect(parseClosePayload(new Uint8Array(0))).toEqual({ code: 1000, reason: "" });
    expect(parseClosePayload(encodeJson({ code: 1008, reason: "bad" }))).toEqual({
      code: 1008,
      reason: "bad",
    });
    expect(parseClosePayload(text("{"))).toEqual({ code: 1011, reason: "" });
    for (const code of [1005, 1006, 1015, 999, 5000, 2000, 1.5])
      expect(parseClosePayload(encodeJson({ code })).code).toBe(1011);
    expect(parseClosePayload(encodeJson({ code: 4401 })).code).toBe(4401); // 送れる code（消毒は中継が行う）
    expect(
      new TextEncoder().encode(
        parseClosePayload(encodeJson({ code: 1000, reason: "あ".repeat(300) })).reason,
      ).byteLength,
    ).toBeLessThanOrEqual(120);
  });

  it("truncateUtf8 は文字の途中で切らない", () => {
    expect(truncateUtf8("あいう", 7)).toBe("あい");
    expect(truncateUtf8("abc", 120)).toBe("abc");
    expect(
      new TextEncoder().encode(truncateUtf8("日".repeat(100), 120)).byteLength,
    ).toBeLessThanOrEqual(120);
  });
});
