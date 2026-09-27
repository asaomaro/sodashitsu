/**
 * `sodactl pane attach` の切り離しキー（20260926-pane-direct-connect。herdr の direct attach と同じ `Ctrl+B q`）。
 * `Ctrl+B Ctrl+B` は `Ctrl+B` を 1 つ送り、`Ctrl+B` に続くそれ以外のバイトは両方を送る。接頭辞と次のバイトが別の読み取りに
 * 分かれて届いても同じに扱う（接頭辞で終わった読み取りは次の読み取りまで保留する）。
 */
export const ATTACH_PREFIX = 0x02; // Ctrl+B
const DETACH_KEY = 0x71; // q

export interface AttachKeyResult {
  /** pane へ送るバイト列（空なら送らない）。 */
  forward: Uint8Array;
  /** 切り離す（`forward` を送ってから切り離す。`q` より後ろのバイトは捨てる）。 */
  detach: boolean;
}

export class AttachKeyFilter {
  private pendingPrefix = false;

  feed(bytes: Uint8Array): AttachKeyResult {
    const out: number[] = [];
    for (const b of bytes) {
      if (this.pendingPrefix) {
        this.pendingPrefix = false;
        if (b === DETACH_KEY) return { forward: Uint8Array.from(out), detach: true };
        if (b === ATTACH_PREFIX) out.push(ATTACH_PREFIX);
        else out.push(ATTACH_PREFIX, b);
        continue;
      }
      if (b === ATTACH_PREFIX) this.pendingPrefix = true;
      else out.push(b);
    }
    return { forward: Uint8Array.from(out), detach: false };
  }
}
