import { describe, expect, it } from "vitest";
import {
  METHOD_SCHEMAS,
  PREFS_MAX_BYTES,
  PrefsGetParams,
  PrefsSetParams,
  ServerStopParams,
  SharedPrefs,
} from "./messages.js";

// 20260927-cli-mode：設定の共有（prefs.*）とサーバの停止（server.stop）。
describe("SharedPrefs", () => {
  it("知らない項目も捨てずに通す（版の違うクライアントが混ざっても消さない）", () => {
    const parsed = SharedPrefs.parse({
      theme: "dracula",
      future: { a: 1 },
      tui: { sidebarCols: 30, later: true },
    });
    expect(parsed).toEqual({
      theme: "dracula",
      future: { a: 1 },
      tui: { sidebarCols: 30, later: true },
    });
  });

  it("値の形は問わない（正規化は読む側）", () => {
    expect(
      SharedPrefs.safeParse({ keys: 42, notify: "x", collapsedAutoGroups: null }).success,
    ).toBe(true);
  });

  it("キー __proto__ は落とす（プロトタイプを差し替えない）", () => {
    const parsed = SharedPrefs.parse(JSON.parse('{"__proto__":{"polluted":1},"theme":"x"}'));
    expect(Object.keys(parsed)).toEqual(["theme"]);
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
  });

  it("配列・null は受けない（オブジェクトだけ）", () => {
    expect(SharedPrefs.safeParse([]).success).toBe(false);
    expect(SharedPrefs.safeParse(null).success).toBe(false);
  });
});

describe("prefs.* / server.stop", () => {
  it("方式の表に登録する", () => {
    expect(METHOD_SCHEMAS["prefs.get"]).toBe(PrefsGetParams);
    expect(METHOD_SCHEMAS["prefs.set"]).toBe(PrefsSetParams);
    expect(METHOD_SCHEMAS["server.stop"]).toBe(ServerStopParams);
  });

  it("prefs.set は patch と任意の baseRev（0 以上の整数）", () => {
    expect(PrefsSetParams.parse({ patch: { theme: "x" } })).toEqual({ patch: { theme: "x" } });
    expect(PrefsSetParams.parse({ patch: {}, baseRev: 3 })).toEqual({ patch: {}, baseRev: 3 });
    expect(PrefsSetParams.safeParse({ patch: {}, baseRev: -1 }).success).toBe(false);
    expect(PrefsSetParams.safeParse({ patch: {}, baseRev: 1.5 }).success).toBe(false);
    expect(PrefsSetParams.safeParse({}).success).toBe(false);
  });

  it("patch は 256KB まで（超えたら弾く）", () => {
    // {"x":"…"} の 8 バイトぶんを引くと、ちょうど上限。
    const ok = { x: "a".repeat(PREFS_MAX_BYTES - 8) };
    expect(PrefsSetParams.safeParse({ patch: ok }).success).toBe(true);
    const over = { x: "a".repeat(PREFS_MAX_BYTES - 7) };
    expect(PrefsSetParams.safeParse({ patch: over }).success).toBe(false);
  });
});
