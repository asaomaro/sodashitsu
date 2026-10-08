import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { coverStartsEngage, ENGAGE_ENTRY, ENGAGE_KEYUP_WAIT_MS, startFromButton, startFromCover, startFromKey } from "./engageEntry.js";

describe("engageEntry（操作を始める入口の決まり）", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("今の決まりは案 B（［操作する］ボタンと prefix+i だけ）。覆いを押しても始まらない", () => {
    expect(ENGAGE_ENTRY).toBe("button");
    expect(coverStartsEngage()).toBe(false);
    const start = vi.fn();
    startFromCover(start);
    expect(start).not.toHaveBeenCalled();
  });

  it("ポインタの click（detail が 1 以上）は、すぐ始める（ポインタが上がった後に click が来る）", () => {
    const start = vi.fn();
    startFromButton({ detail: 1 }, start);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("キーボードの click（detail 0）は、そのキーの keyup の前には始まらず、keyup を受けてから始まる", () => {
    const start = vi.fn();
    startFromButton({ detail: 0 }, start);
    expect(start).not.toHaveBeenCalled();
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    expect(start).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" })); // 2 回目では始めない
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("prefix+i（startFromKey）も keyup を待つ。keyup が来なければ上限の時間で始める", () => {
    const start = vi.fn();
    startFromKey(start);
    vi.advanceTimersByTime(ENGAGE_KEYUP_WAIT_MS - 1);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new KeyboardEvent("keyup", { key: "i" }));
    expect(start).toHaveBeenCalledTimes(1); // 受け手は外れている
  });

  it("keyup は捕捉段階で受ける（枠より先に親が受ける）", () => {
    const start = vi.fn();
    startFromKey(start);
    const seen: string[] = [];
    const el = document.createElement("input");
    document.body.appendChild(el);
    el.addEventListener("keyup", () => seen.push(start.mock.calls.length ? "after-start" : "before-start"));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "i", bubbles: true }));
    expect(start).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["after-start"]); // 親が先に受けて始めた＝その keyup は、始める前に済んでいる
    el.remove();
  });
});
