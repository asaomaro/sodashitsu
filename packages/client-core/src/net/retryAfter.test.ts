import { describe, expect, it } from "vitest";
import { normalizeRetryAfterSeconds, parseRetryAfter, RETRY_AFTER_MAX_SECONDS } from "./retryAfter.js";

const NOW = Date.parse("2026-09-19T00:00:00Z");

describe("parseRetryAfter（D105）", () => {
  it("無ければ null", () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
  });

  it("秒数はそのまま（前後の空白は許す）", () => {
    expect(parseRetryAfter(" 30 ", NOW)).toBe(30);
    expect(parseRetryAfter("3600", NOW)).toBe(3600);
  });

  it("0 は 1 秒にする（「0 秒ほど待って」と出さない）", () => {
    expect(parseRetryAfter("0", NOW)).toBe(1);
  });

  it("IMF-fixdate は今から何秒後かにする（端数は切り上げ）", () => {
    expect(parseRetryAfter("Sat, 19 Sep 2026 00:01:00 GMT", NOW)).toBe(60);
    expect(parseRetryAfter("Sat, 19 Sep 2026 00:00:30 GMT", NOW + 500)).toBe(30); // 29.5 秒 → 30
  });

  it("過去の日付は 1 秒にする", () => {
    expect(parseRetryAfter("Fri, 18 Sep 2026 23:59:00 GMT", NOW)).toBe(1);
  });

  it("`Date.parse` が日付に読んでしまう文字列・廃止された日付の形・負の数・小数は null（既定の文言へ）", () => {
    for (const value of ["soon", "soon 5", "-5", "1.5", "1e20", "2026-09-19T00:01:00Z", "Saturday, 19-Sep-26 00:01:00 GMT", "Sat Sep 19 00:01:00 2026"]) {
      expect(parseRetryAfter(value, NOW), value).toBeNull();
    }
  });

  it("有限でない・1 日を超える値は null（「Infinity 分」等と出さない）", () => {
    expect(parseRetryAfter("9".repeat(400), NOW)).toBeNull(); // Number() が Infinity になる桁数
    expect(parseRetryAfter("100000000000000000000", NOW)).toBeNull(); // 1e20
    expect(parseRetryAfter(String(RETRY_AFTER_MAX_SECONDS + 1), NOW)).toBeNull();
    expect(parseRetryAfter(String(RETRY_AFTER_MAX_SECONDS), NOW)).toBe(RETRY_AFTER_MAX_SECONDS);
    expect(parseRetryAfter("Mon, 21 Sep 2026 00:00:00 GMT", NOW)).toBeNull(); // 2 日後
  });
});

describe("normalizeRetryAfterSeconds（D105）", () => {
  it("1 以上 1 日以下の整数か null", () => {
    expect(normalizeRetryAfterSeconds(0)).toBe(1);
    expect(normalizeRetryAfterSeconds(-10)).toBe(1);
    expect(normalizeRetryAfterSeconds(0.2)).toBe(1);
    expect(normalizeRetryAfterSeconds(59.1)).toBe(60);
    expect(normalizeRetryAfterSeconds(RETRY_AFTER_MAX_SECONDS)).toBe(RETRY_AFTER_MAX_SECONDS);
    expect(normalizeRetryAfterSeconds(RETRY_AFTER_MAX_SECONDS + 0.5)).toBeNull();
    expect(normalizeRetryAfterSeconds(1e20)).toBeNull();
    expect(normalizeRetryAfterSeconds(Infinity)).toBeNull();
    expect(normalizeRetryAfterSeconds(Number.NaN)).toBeNull();
  });
});
