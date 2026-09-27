import { encodeInputFrame, encodeOutputFrame, encodeSnapshotFrame } from "@wtm/protocol";
import { describe, expect, it } from "vitest";
import type { WsConnection } from "../ws/WsServer.js";
import { machineSelectorOf } from "../ws/WsServerWs.js";
import type { LinkChannel } from "./MachineLink.js";
import {
  RELAY_HOLD_BYTES,
  RELAY_HOLD_LIMIT_MS,
  RELAY_MAX_BUFFERED_BYTES,
  RELAY_MAX_UPSTREAM_BYTES,
  RELAY_RESUME_BYTES,
  relayToMachine,
  sanitizeRemoteCloseCode,
} from "./MachineRelay.js";
import { ManualClock } from "./testing.js";

/** 中継（20260927-multi-host-machines の T8）。ブラウザ側の接続とチャネルを偽物で。 */
class FakeConn implements WsConnection {
  sent: { kind: "text" | "binary"; data: string | Uint8Array; compress?: boolean | undefined }[] =
    [];
  closed: [number, string] | undefined;
  bufferedAmount = 0;
  private textCbs: ((s: string) => void)[] = [];
  private binCbs: ((b: Uint8Array) => void)[] = [];
  private closeCbs: ((c: number) => void)[] = [];
  sendText(s: string): void {
    this.sent.push({ kind: "text", data: s });
  }
  sendBinary(b: Uint8Array, opts?: { compress?: boolean }): void {
    this.sent.push({ kind: "binary", data: b, compress: opts?.compress });
  }
  onText(cb: (s: string) => void): void {
    this.textCbs.push(cb);
  }
  onBinary(cb: (b: Uint8Array) => void): void {
    this.binCbs.push(cb);
  }
  onDrain(): void {}
  onClose(cb: (c: number) => void): void {
    this.closeCbs.push(cb);
  }
  close(code: number, reason: string): void {
    if (this.closed) return;
    this.closed = [code, reason];
    for (const cb of this.closeCbs) cb(code);
  }
  fromBrowserText(s: string): void {
    for (const cb of this.textCbs) cb(s);
  }
  fromBrowserBinary(b: Uint8Array): void {
    for (const cb of this.binCbs) cb(b);
  }
}

class FakeChannel implements LinkChannel {
  readonly id = 1;
  pendingBytes = 0;
  sent: (string | Uint8Array)[] = [];
  closed: [number, string] | undefined;
  private textCbs: ((s: string) => void)[] = [];
  private binCbs: ((b: Uint8Array) => void)[] = [];
  private closeCbs: ((c: number, r: string) => void)[] = [];
  sendText(s: string): void {
    this.sent.push(s);
  }
  sendBinary(b: Uint8Array): void {
    this.sent.push(b);
  }
  close(code: number, reason: string): void {
    this.closed ??= [code, reason];
  }
  onText(cb: (s: string) => void): void {
    this.textCbs.push(cb);
  }
  onBinary(cb: (b: Uint8Array) => void): void {
    this.binCbs.push(cb);
  }
  onClose(cb: (c: number, r: string) => void): void {
    this.closeCbs.push(cb);
  }
  fromRemoteText(s: string): void {
    for (const cb of this.textCbs) cb(s);
  }
  fromRemoteBinary(b: Uint8Array): void {
    for (const cb of this.binCbs) cb(b);
  }
  remoteClose(code: number, reason: string): void {
    for (const cb of this.closeCbs) cb(code, reason);
  }
}

function setup() {
  const conn = new FakeConn();
  const channel = new FakeChannel();
  const holds = new Set<unknown>();
  const clock = new ManualClock();
  relayToMachine(
    conn,
    {
      openChannel: () => channel,
      holdReading: (k) => void holds.add(k),
      releaseReading: (k) => void holds.delete(k),
    },
    { clock },
  );
  return { conn, channel, holds, clock };
}

describe("relayToMachine（T8）", () => {
  it("チャネルが開けなければ 1013 で閉じる", () => {
    const conn = new FakeConn();
    relayToMachine(conn, {
      openChannel: () => undefined,
      holdReading: () => undefined,
      releaseReading: () => undefined,
    });
    expect(conn.closed).toEqual([1013, "machine unavailable"]);
  });

  it("ブラウザ → リモートはそのまま。リモート → ブラウザは JSON のオブジェクトと OUTPUT・SNAPSHOT だけ。OUTPUT は圧縮しない", () => {
    const { conn, channel } = setup();
    conn.fromBrowserText('{"id":"1"}');
    conn.fromBrowserBinary(encodeInputFrame("p1", new Uint8Array([0x61])));
    expect(channel.sent).toHaveLength(2);
    channel.fromRemoteText('  {"event":"x"}');
    channel.fromRemoteText("[1,2]");
    channel.fromRemoteText("garbage");
    channel.fromRemoteBinary(encodeOutputFrame("p1", new Uint8Array([1])));
    channel.fromRemoteBinary(encodeSnapshotFrame("p1", 80, 24, "x"));
    channel.fromRemoteBinary(encodeInputFrame("p1", new Uint8Array([1]))); // INPUT はブラウザへ流さない
    channel.fromRemoteBinary(new Uint8Array([0x09, 0, 1]));
    channel.fromRemoteBinary(new Uint8Array([0x01]));
    expect(conn.sent.map((m) => m.kind)).toEqual(["text", "binary", "binary"]);
    expect(conn.sent[1]!.compress).toBe(false);
    expect(conn.sent[2]!.compress).toBeUndefined();
  });

  it("リモートの CLOSE の code を消毒して伝える（4401 でログイン画面へ飛ばさせない）。ブラウザが閉じたらチャネルを閉じる", () => {
    const a = setup();
    a.channel.remoteClose(4401, "session revoked");
    expect(a.conn.closed).toEqual([1011, "session revoked"]);
    const b = setup();
    b.channel.remoteClose(1012, "machine disconnected");
    expect(b.conn.closed).toEqual([1012, "machine disconnected"]);
    const c = setup();
    c.conn.close(1000, "bye");
    expect(c.channel.closed).toEqual([1000, "client closed"]);
    for (const code of [1000, 1001, 1008, 1011, 1012, 1013])
      expect(sanitizeRemoteCloseCode(code)).toBe(code);
    for (const code of [1002, 1003, 1009, 3000, 4000, 4401])
      expect(sanitizeRemoteCloseCode(code)).toBe(1011);
  });

  it("背圧: ブラウザの送り待ちが増えたら ssh を読むのを止め、減ったら再開する（リモートの流量制御が効く）", () => {
    const { conn, channel, holds, clock } = setup();
    conn.bufferedAmount = RELAY_HOLD_BYTES; // ちょうどは止めない
    channel.fromRemoteText("{}");
    expect(holds.size).toBe(0);
    conn.bufferedAmount = RELAY_HOLD_BYTES + 1;
    channel.fromRemoteText("{}");
    expect(holds.has(conn)).toBe(true);
    clock.advance(1000);
    expect(holds.size).toBe(1); // まだ多い
    conn.bufferedAmount = RELAY_RESUME_BYTES - 1;
    clock.advance(50);
    expect(holds.size).toBe(0);
    expect(conn.closed).toBeUndefined();
  });

  it("止めたまま上限時間を過ぎる・絶対の上限を超えると、その接続とチャネルだけを 1013 で閉じて読むのを戻す。ブラウザ → リモートも上限で閉じる", () => {
    const a = setup();
    a.conn.bufferedAmount = RELAY_HOLD_BYTES + 1;
    a.channel.fromRemoteText("{}");
    a.clock.advance(RELAY_HOLD_LIMIT_MS);
    expect(a.conn.closed?.[0]).toBe(1013);
    expect(a.channel.closed?.[0]).toBe(1013);
    expect(a.holds.size).toBe(0);
    const b = setup();
    b.conn.bufferedAmount = RELAY_MAX_BUFFERED_BYTES + 1;
    b.channel.fromRemoteBinary(encodeOutputFrame("p1", new Uint8Array([1])));
    expect(b.conn.closed?.[0]).toBe(1013);
    expect(b.holds.size).toBe(0);
    const c = setup();
    c.channel.pendingBytes = RELAY_MAX_UPSTREAM_BYTES + 1;
    c.conn.fromBrowserText("{}");
    expect(c.conn.closed?.[0]).toBe(1013);
    expect(c.channel.sent).toHaveLength(0);
    // ブラウザが閉じても止めたままにしない
    const d = setup();
    d.conn.bufferedAmount = RELAY_HOLD_BYTES + 1;
    d.channel.fromRemoteText("{}");
    d.conn.close(1000, "bye");
    expect(d.holds.size).toBe(0);
    // リモートが閉じても止めたままにしない
    const e = setup();
    e.conn.bufferedAmount = RELAY_HOLD_BYTES + 1;
    e.channel.fromRemoteText("{}");
    e.channel.remoteClose(1012, "machine disconnected");
    expect(e.holds.size).toBe(0);
  });
});

describe("machineSelectorOf（T8）", () => {
  it("無い・local はこのサーバ、空・2 個以上・256 文字超は不正", () => {
    expect(machineSelectorOf("/ws")).toBeUndefined();
    expect(machineSelectorOf("/ws?machine=local")).toBeUndefined();
    expect(machineSelectorOf("/ws?machine=Build%20box")).toBe("Build box");
    expect(machineSelectorOf("/ws?machine=")).toBe("invalid");
    expect(machineSelectorOf("/ws?machine=a&machine=b")).toBe("invalid");
    expect(machineSelectorOf(`/ws?machine=${"x".repeat(257)}`)).toBe("invalid");
    expect(machineSelectorOf(`/ws?machine=${"x".repeat(256)}`)).toBe("x".repeat(256));
  });
});
