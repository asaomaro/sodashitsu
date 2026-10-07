/**
 * トークンバケット（表示の面の頻度の上限。回数にも量にも使う）。時計は呼び出し側が渡す（テストで偽の時計にする）。
 * 最初は満タン（`burst`）。`perSec` ずつ戻り、`burst` を超えて溜まらない。
 */
export class TokenBucket {
  private tokens: number;
  private last: number | undefined;

  constructor(private readonly rate: { perSec: number; burst: number }) {
    this.tokens = rate.burst;
  }

  /** `n` ぶん取れれば取って true。足りなければ何も取らず false。`n` が `burst` を超えるなら常に false。 */
  take(now: number, n = 1): boolean {
    this.refill(now);
    if (n > this.tokens) return false;
    this.tokens -= n;
    return true;
  }

  /** 取った分を戻す（別の検査で断ったとき、通らなかった要求に枠を使わせないため）。`burst` を超えては戻さない。 */
  refund(n = 1): void {
    this.tokens = Math.min(this.rate.burst, this.tokens + n);
  }

  private refill(now: number): void {
    if (this.last !== undefined && now > this.last) {
      this.tokens = Math.min(this.rate.burst, this.tokens + ((now - this.last) / 1000) * this.rate.perSec);
    }
    // 時計が戻っても（now < last）、最後の時刻を進めない。
    if (this.last === undefined || now > this.last) this.last = now;
  }
}
