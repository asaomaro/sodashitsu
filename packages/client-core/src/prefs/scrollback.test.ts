import { describe, expect, it } from "vitest";
import {
  MOBILE_SCROLLBACK_LINES,
  effectiveScrollback,
  loadScrollbackPref,
  scrollbackChoices,
} from "./scrollback.js";

describe("loadScrollbackPref（AC3）", () => {
  it('"auto" と非負の整数はそのまま', () => {
    expect(loadScrollbackPref("auto")).toBe("auto");
    expect(loadScrollbackPref(5000)).toBe(5000);
    expect(loadScrollbackPref(0)).toBe(0); // サーバは --scrollback 0 を受け付ける
  });

  it('それ以外（無い・負・小数・文字列・NaN・無限・オブジェクト）は "auto"', () => {
    for (const raw of [
      undefined,
      null,
      -1,
      1.5,
      "5000",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      {},
      [],
      true,
    ]) {
      expect(loadScrollbackPref(raw), String(raw)).toBe("auto");
    }
  });

  // サーバの上限は起動のたびに変わる。保存値の正しさではないので、ここでは見ない。
  it("サーバの上限を超える数でも範囲外にしない（押さえるのは使うとき）", () => {
    expect(loadScrollbackPref(50000)).toBe(50000);
  });
});

describe("scrollbackChoices", () => {
  it("段階のうちサーバの上限以下と、上限そのもの", () => {
    expect(scrollbackChoices(5000)).toEqual([1000, 2000, 5000]); // 既定の --scrollback
    expect(scrollbackChoices(10000)).toEqual([1000, 2000, 5000, 10000]);
    expect(scrollbackChoices(3000)).toEqual([1000, 2000, 3000]);
  });

  // 上限を超える値は、選んでもエラーにならず黙って上限分しか届かない。出さない。
  it("サーバの上限を超える値は出さない", () => {
    expect(Math.max(...scrollbackChoices(3000))).toBe(3000);
  });

  it("上限が 1000 未満なら上限だけ（0 も）", () => {
    expect(scrollbackChoices(500)).toEqual([500]);
    expect(scrollbackChoices(0)).toEqual([0]);
  });

  // ダイアログで「どの行も選ばれていない」を作らない。
  it("上限以下で段階に無い保存値は足す", () => {
    expect(scrollbackChoices(10000, 3000)).toEqual([1000, 2000, 3000, 5000, 10000]);
  });

  it("上限を超える保存値は足さない（押さえた値＝上限の行が選ばれる）", () => {
    expect(scrollbackChoices(5000, 10000)).toEqual([1000, 2000, 5000]);
  });

  // 0 を「偽」とみなす書き方（`saved && …`）だと落ちる。上限 0 のサーバで選んだ 0 を上限 5000 で開いたとき、
  // 0 の行が無いと「どの行も選ばれていない」になる。
  it("保存値が 0 でも足す", () => {
    expect(scrollbackChoices(5000, 0)).toEqual([0, 1000, 2000, 5000]);
  });

  it("保存値が段階と同じなら重複させない", () => {
    expect(scrollbackChoices(5000, 2000)).toEqual([1000, 2000, 5000]);
  });
});

describe("effectiveScrollback", () => {
  // 何も設定していない利用者の見え方を変えない（この work より前の main.ts と同じ）。
  it("自動: デスクトップはサーバの上限、モバイルは 1000", () => {
    // 上限を既定の 5000 だけで見ると、`limit` を定数 5000 に書き換えても通る。上限を変えて見る。
    for (const limit of [5000, 10000, 3000, 0])
      expect(effectiveScrollback("auto", "desktop", limit), `上限 ${limit}`).toBe(limit);
    expect(effectiveScrollback("auto", "mobile", 5000)).toBe(MOBILE_SCROLLBACK_LINES);
    expect(MOBILE_SCROLLBACK_LINES).toBe(1000);
  });

  it("自動のモバイルは、サーバの上限が 1000 未満でも 1000 のまま（以前と同じ）", () => {
    expect(effectiveScrollback("auto", "mobile", 500)).toBe(1000);
  });

  // AC11：モバイルでも数の設定が効く（1000 の固定は「自動」のときだけ）。
  it("数を選べば、モバイルでもその値", () => {
    expect(effectiveScrollback(5000, "mobile", 5000)).toBe(5000);
    expect(effectiveScrollback(2000, "desktop", 5000)).toBe(2000);
  });

  it("数はサーバの上限で押さえる", () => {
    expect(effectiveScrollback(10000, "desktop", 5000)).toBe(5000);
    expect(effectiveScrollback(10000, "mobile", 3000)).toBe(3000);
  });
});
