import { FRAME_TYPE } from "@sodashitsu/protocol";
import type { WebSocketLike } from "@sodashitsu/client-core";
import type { LinkChannel } from "../machine/MachineLink.js";
import { sanitizeRemoteCloseCode } from "../machine/MachineRelay.js";

/**
 * マシンへの中継の 1 チャネル（`MachineLink.openChannel()`）を client-core の `WebSocketLike` に見せる adapter（20260927-agent-graph の 04 T1・
 * architecture「RemoteLinks」）。チャネル 1 本はリモートの認証済みの `/ws` の 1 接続と同じもの（research-server §5）なので、その上に `Connection` を張れる。
 *
 * - 開く合図は無い（OPEN の枠を書いた時点で使える）ので、作った後のマイクロタスクで `onopen` を呼ぶ（`Connection` が `onopen` を付けた後）。
 * - リモートから来るものは信用しない（`MachineRelay` と同じ）: TEXT は `{` で始まるものだけ、BINARY は OUTPUT・SNAPSHOT だけを渡す。
 *   受け手（`Connection`）の例外はチャネルの読み取り（ssh の標準出力の処理）へ返さない。
 * - `close` はチャネルを閉じ、`onclose` を 1 回だけ呼ぶ（チャネルの `onClose` が同期で呼ばれても重ねない）。リモートが閉じた code は
 *   `sanitizeRemoteCloseCode` で絞る（4401 で `Connection` が認証の要求として止まらない）。
 */
const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

function looksLikeJsonObject(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue;
    return c === 0x7b; // "{"
  }
  return false;
}

export class LinkChannelSocket implements WebSocketLike {
  readyState = CONNECTING;
  binaryType?: string;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  constructor(
    private readonly channel: LinkChannel,
    private readonly onReceiverError: (err: unknown) => void = () => undefined,
  ) {
    channel.onText((s) => {
      if (this.readyState !== OPEN || !looksLikeJsonObject(s)) return;
      this.deliver(s);
    });
    channel.onBinary((b) => {
      if (this.readyState !== OPEN || b.byteLength < 2) return;
      if (b[0] !== FRAME_TYPE.OUTPUT && b[0] !== FRAME_TYPE.SNAPSHOT) return;
      this.deliver(b);
    });
    // リモートの code は信用しない（`MachineRelay` と同じ。4401 等で `Connection` の繋ぎ直しを止めさせない）。
    channel.onClose((code) => this.finish(sanitizeRemoteCloseCode(code)));
    queueMicrotask(() => {
      if (this.readyState !== CONNECTING) return;
      this.readyState = OPEN;
      this.onopen?.();
    });
  }

  send(data: string | Uint8Array): void {
    if (this.readyState !== OPEN) return;
    if (typeof data === "string") this.channel.sendText(data);
    else this.channel.sendBinary(data);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === CLOSING || this.readyState === CLOSED) return;
    this.readyState = CLOSING;
    this.channel.close(code, reason);
    this.finish(code); // チャネルが onClose を同期で呼んでいれば、ここは何もしない
  }

  private deliver(data: string | Uint8Array): void {
    try {
      this.onmessage?.({ data });
    } catch (err) {
      this.onReceiverError(err);
    }
  }

  private finish(code: number): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onclose?.({ code });
  }
}

/**
 * 開けなかった（マシンが繋がっていない・チャネルの上限）ときの socket。開かずにマイクロタスクで閉じる（`Connection` は開く前に閉じた試みとして
 * 繋ぎ直しを待つ。マシンが online になったら `RemoteLinks` が `connect()` で待ちを飛ばす）。
 */
export class UnavailableSocket implements WebSocketLike {
  readyState = CONNECTING;
  binaryType?: string;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  constructor() {
    queueMicrotask(() => this.close(1013));
  }

  send(): void {
    // 開いていないので送らない
  }

  close(code = 1000): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.onclose?.({ code });
  }
}
