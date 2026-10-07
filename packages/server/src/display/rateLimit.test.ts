import { describe, expect, it } from "vitest";
import { TokenBucket } from "./rateLimit.js";

describe("TokenBucket", () => {
  it("満タンから burst 回まで通り、次は断る", () => {
    const b = new TokenBucket({ perSec: 10, burst: 3 });
    expect([b.take(0), b.take(0), b.take(0), b.take(0)]).toEqual([true, true, true, false]);
  });

  it("時間で戻る（毎秒 perSec）。burst を超えて溜まらない", () => {
    const b = new TokenBucket({ perSec: 10, burst: 3 });
    for (let i = 0; i < 3; i++) b.take(0);
    expect(b.take(99)).toBe(false); // 0.99 個
    expect(b.take(100)).toBe(true); // 1 個
    expect(b.take(100)).toBe(false);
    // 長く置いても burst まで
    expect([b.take(100_000), b.take(100_000), b.take(100_000), b.take(100_000)]).toEqual([true, true, true, false]);
  });

  it("量にも使える: 一度に n ぶん。足りなければ何も取らない", () => {
    const b = new TokenBucket({ perSec: 2, burst: 8 });
    expect(b.take(0, 6)).toBe(true);
    expect(b.take(0, 4)).toBe(false); // 残り 2。取らない
    expect(b.take(0, 2)).toBe(true); // 取られていなかった
    expect(b.take(0, 1)).toBe(false);
    expect(b.take(1000, 2)).toBe(true); // 1 秒で 2 戻る
  });

  it("burst を超える量は常に断る", () => {
    const b = new TokenBucket({ perSec: 2, burst: 8 });
    expect(b.take(0, 9)).toBe(false);
    expect(b.take(10_000, 9)).toBe(false);
  });

  it("refund は取った分を戻す（burst を超えない）", () => {
    const b = new TokenBucket({ perSec: 1, burst: 2 });
    b.take(0, 2);
    b.refund(1);
    expect(b.take(0)).toBe(true);
    expect(b.take(0)).toBe(false);
    b.refund(10);
    expect([b.take(0), b.take(0), b.take(0)]).toEqual([true, true, false]);
  });

  it("時計が戻っても、余計には増えない", () => {
    const b = new TokenBucket({ perSec: 10, burst: 1 });
    expect(b.take(1000)).toBe(true);
    expect(b.take(500)).toBe(false);
    expect(b.take(1000)).toBe(false);
    expect(b.take(1100)).toBe(true);
  });
});
