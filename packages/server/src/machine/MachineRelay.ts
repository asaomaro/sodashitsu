import { FRAME_TYPE } from "@wtm/protocol";
import type { WsConnection } from "../ws/WsServer.js";
import { truncateUtf8 } from "./bridgeFrames.js";
import { realClock, type Clock, type LinkChannel, type MachineLink } from "./MachineLink.js";

/**
 * ブラウザ・`wtmctl` の `/ws?machine=` の 1 接続を、そのマシンへの 1 チャネルとして中継する（20260927-multi-host-machines の design「中継」）。
 * 中身（要求・イベント・画面・入力）は解釈しない。ただしリモートから来るものは信用しない:
 * - TEXT は先頭（空白を除く）が `{` のものだけ、BINARY は OUTPUT・SNAPSHOT だけを通す（INPUT 等はブラウザへ流さない）。
 * - CLOSE の code は `1000・1001・1008・1011・1012・1013` だけ通し、ほかは 1011（4401 でブラウザをログイン画面へ飛ばさせない）。
 *
 * **背圧**（review ラウンド 1）: ブラウザの送り待ちが `RELAY_HOLD_BYTES` を超えたら ssh の標準出力を読むのを止め（`MachineLink.holdReading`）、
 * `RELAY_RESUME_BYTES` を下回ったら再開する。止めている間はリモートの `bridge.sock` の書き込み待ちが増えるので、リモートの `OutputFanout` の流量制御
 * （出力を捨て、再開したら SNAPSHOT。D98）が今までどおり効く。止めたまま `RELAY_HOLD_LIMIT_MS` を過ぎる・送り待ちが `RELAY_MAX_BUFFERED_BYTES` を超える
 * （同じ ssh のほかの接続を止め続けない）と、その接続とチャネルだけを 1013 で閉じる（ブラウザは繋ぎ直して SNAPSHOT で読み直す。AC14）。
 * ブラウザ → リモートは 1 通が 4MiB までなので、チャネルの送り待ちが `RELAY_MAX_UPSTREAM_BYTES` を超えたら閉じる。
 */
export const RELAY_HOLD_BYTES = 4 * 1024 * 1024;
export const RELAY_RESUME_BYTES = 1024 * 1024;
export const RELAY_HOLD_LIMIT_MS = 15_000;
/** 送り待ちの絶対の上限（リモートからの 1 通は最大 64MiB〔大きな SNAPSHOT〕なので、それを 1 通送れる大きさ）。 */
export const RELAY_MAX_BUFFERED_BYTES = 80 * 1024 * 1024;
export const RELAY_MAX_UPSTREAM_BYTES = 8 * 1024 * 1024;
const HOLD_POLL_MS = 50;

const PASS_CLOSE_CODES = new Set([1000, 1001, 1008, 1011, 1012, 1013]);

export function sanitizeRemoteCloseCode(code: number): number {
  return PASS_CLOSE_CODES.has(code) ? code : 1011;
}

function looksLikeJsonObject(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue;
    return c === 0x7b; // "{"
  }
  return false;
}

export type RelayClock = Pick<Clock, "now" | "setInterval" | "clearInterval">;

export function relayToMachine(
  conn: WsConnection,
  link: Pick<MachineLink, "openChannel" | "holdReading" | "releaseReading">,
  opts: { clock?: RelayClock } = {},
): void {
  const clock = opts.clock ?? realClock;
  const channel: LinkChannel | undefined = link.openChannel();
  if (!channel) {
    conn.close(1013, "machine unavailable");
    return;
  }
  let closed = false;
  /** 読むのを止めた時刻（止めていなければ undefined）。 */
  let heldSince: number | undefined;
  let pollTimer: unknown;
  const release = (): void => {
    if (heldSince === undefined) return;
    heldSince = undefined;
    clock.clearInterval(pollTimer);
    link.releaseReading(conn);
  };
  const closeBoth = (code: number, reason: string): void => {
    if (closed) return;
    closed = true;
    release();
    channel.close(code, reason);
    conn.close(code, reason);
  };
  /** 送った後に送り待ちを見て、止める・閉じる。 */
  const afterSend = (): void => {
    const buffered = conn.bufferedAmount;
    if (buffered > RELAY_MAX_BUFFERED_BYTES) {
      closeBoth(1013, "client is too slow");
      return;
    }
    if (buffered <= RELAY_HOLD_BYTES || heldSince !== undefined) return;
    heldSince = clock.now();
    link.holdReading(conn);
    pollTimer = clock.setInterval(() => {
      if (closed || heldSince === undefined) return;
      if (conn.bufferedAmount < RELAY_RESUME_BYTES) release();
      else if (clock.now() - heldSince >= RELAY_HOLD_LIMIT_MS)
        closeBoth(1013, "client is too slow");
    }, HOLD_POLL_MS);
  };

  // ブラウザ → リモート
  conn.onText((s) => {
    if (closed) return;
    if (channel.pendingBytes > RELAY_MAX_UPSTREAM_BYTES) {
      closeBoth(1013, "machine link is congested");
      return;
    }
    channel.sendText(s);
  });
  conn.onBinary((b) => {
    if (closed) return;
    if (channel.pendingBytes > RELAY_MAX_UPSTREAM_BYTES) {
      closeBoth(1013, "machine link is congested");
      return;
    }
    channel.sendBinary(b);
  });
  conn.onClose(() => {
    if (closed) return;
    closed = true;
    release();
    channel.close(1000, "client closed");
  });

  // リモート → ブラウザ
  channel.onText((s) => {
    if (closed || !looksLikeJsonObject(s)) return;
    conn.sendText(s);
    afterSend();
  });
  channel.onBinary((b) => {
    if (closed || b.byteLength < 2) return;
    const type = b[0];
    if (type !== FRAME_TYPE.OUTPUT && type !== FRAME_TYPE.SNAPSHOT) return;
    // OUTPUT は圧縮しない（`WsGateway` と同じ。D98）。
    conn.sendBinary(b, type === FRAME_TYPE.OUTPUT ? { compress: false } : undefined);
    afterSend();
  });
  channel.onClose((code, reason) => {
    if (closed) return;
    closed = true;
    release();
    conn.close(sanitizeRemoteCloseCode(code), truncateUtf8(reason, 120));
  });
}
