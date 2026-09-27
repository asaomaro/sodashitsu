import { FRAME_TYPE } from "@wtm/protocol";
import type { WsConnection } from "../ws/WsServer.js";
import { truncateUtf8 } from "./bridgeFrames.js";
import type { LinkChannel, MachineLink } from "./MachineLink.js";

/**
 * ブラウザ・`wtmctl` の `/ws?machine=` の 1 接続を、そのマシンへの 1 チャネルとして中継する（20260927-multi-host-machines の design「中継」）。
 * 中身（要求・イベント・画面・入力）は解釈しない。ただしリモートから来るものは信用しない:
 * - TEXT は先頭（空白を除く）が `{` のものだけ、BINARY は OUTPUT・SNAPSHOT だけを通す（INPUT 等はブラウザへ流さない）。
 * - CLOSE の code は `1000・1001・1008・1011・1012・1013` だけ通し、ほかは 1011（4401 でブラウザをログイン画面へ飛ばさせない）。
 * - 送り待ちが上限（8MiB）を超えたら、その接続とチャネルだけを 1013 で閉じる（ブラウザは繋ぎ直して SNAPSHOT で読み直す。AC14）。
 */
/**
 * 送り待ちの上限。リモートからの 1 通は最大 64MiB（`BRIDGE_LIMITS.maxRemoteMessageBytes`。大きな SNAPSHOT）なので、それを 1 通送った直後に次の出力で
 * 閉じてしまわない大きさにする（cross の点検）。上限そのものは置く（遅いブラウザで手元のメモリを際限なく使わない）。
 */
export const RELAY_MAX_BUFFERED_BYTES = 128 * 1024 * 1024;

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

export function relayToMachine(
  conn: WsConnection,
  link: Pick<MachineLink, "openChannel">,
  opts: { maxBuffered?: number } = {},
): void {
  const max = opts.maxBuffered ?? RELAY_MAX_BUFFERED_BYTES;
  const channel: LinkChannel | undefined = link.openChannel();
  if (!channel) {
    conn.close(1013, "machine unavailable");
    return;
  }
  let closed = false;
  const closeBoth = (code: number, reason: string): void => {
    if (closed) return;
    closed = true;
    channel.close(code, reason);
    conn.close(code, reason);
  };

  // ブラウザ → リモート
  conn.onText((s) => {
    if (closed) return;
    if (channel.pendingBytes > max) {
      closeBoth(1013, "machine link is congested");
      return;
    }
    channel.sendText(s);
  });
  conn.onBinary((b) => {
    if (closed) return;
    if (channel.pendingBytes > max) {
      closeBoth(1013, "machine link is congested");
      return;
    }
    channel.sendBinary(b);
  });
  conn.onClose(() => {
    if (closed) return;
    closed = true;
    channel.close(1000, "client closed");
  });

  // リモート → ブラウザ
  channel.onText((s) => {
    if (closed || !looksLikeJsonObject(s)) return;
    if (conn.bufferedAmount > max) {
      closeBoth(1013, "client is too slow");
      return;
    }
    conn.sendText(s);
  });
  channel.onBinary((b) => {
    if (closed || b.byteLength < 2) return;
    const type = b[0];
    if (type !== FRAME_TYPE.OUTPUT && type !== FRAME_TYPE.SNAPSHOT) return;
    if (conn.bufferedAmount > max) {
      closeBoth(1013, "client is too slow");
      return;
    }
    // OUTPUT は圧縮しない（`WsGateway` と同じ。D98）。
    conn.sendBinary(b, type === FRAME_TYPE.OUTPUT ? { compress: false } : undefined);
  });
  channel.onClose((code, reason) => {
    if (closed) return;
    closed = true;
    conn.close(sanitizeRemoteCloseCode(code), truncateUtf8(reason, 120));
  });
}
