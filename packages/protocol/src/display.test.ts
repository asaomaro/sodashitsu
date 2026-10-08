import { describe, expect, it } from "vitest";
import {
  DISPLAY_ACTION_DATA_MAX_BYTES,
  DISPLAY_ACTION_FIELDS_MAX,
  DISPLAY_CONTENT_MAX_BYTES,
  DISPLAY_FEATURES,
  DISPLAY_FORMATS,
  DISPLAY_GET_CHUNK_BYTES,
  DISPLAY_REQUEST_LINE_BYTES,
  DISPLAY_SIZE,
  DISPLAY_TITLE_MAX,
  checkDisplayAction,
  checkDisplaySet,
  displayLimits,
  parseDisplayLine,
  checkDisplaySend,
  DISPLAY_SCRIPT_FORMAT,
  DISPLAY_STATIC_FORMATS,
  DISPLAY_SEND_MAX_BYTES,
  DISPLAY_SEND_RATE,
  DISPLAY_FOCUS_STEAL_MAX,
  DISPLAY_SCRIPT_COOLDOWN_MS,
  DISPLAY_RENDER_FEATURES,
  DISPLAY_REPORT_PROBLEMS,
  readDisplayInfo,
} from "./display.js";
import { PANE_SOCKET_MAX_LINE_BYTES } from "./paneSocket.js";

const base = { name: "main", kind: "panel", format: "html", content: "<p>x</p>" };
const reason = (raw: unknown): string => {
  const r = checkDisplaySet(raw);
  if (r.ok) throw new Error("expected a rejection");
  return r.reason;
};

describe("checkDisplaySet", () => {
  it("最小の形が通り、知らない項目は落ちる", () => {
    const r = checkDisplaySet({ ...base, extra: 1 });
    expect(r).toEqual({ ok: true, value: base });
  });

  it("書き手の側の形式は厳しく検査する（静的な 3 つと script-html を含み、知らない形式は拒否）", () => {
    expect([...DISPLAY_FORMATS]).toEqual(["text", "markdown", "html", "script-html"]);
    expect([...DISPLAY_STATIC_FORMATS]).toEqual(["text", "markdown", "html"]);
    expect(DISPLAY_SCRIPT_FORMAT).toBe("script-html");
    for (const format of DISPLAY_FORMATS) expect(checkDisplaySet({ ...base, format }).ok).toBe(true);
    expect(reason({ ...base, format: "script" })).toMatch(/format/);
    expect(reason({ ...base, format: "script-html " })).toMatch(/format/);
  });
  it("script-html の中身も 2 MiB まで（ちょうどは通り、1 バイト超は拒否）", () => {
    expect(checkDisplaySet({ ...base, format: "script-html", content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES) }).ok).toBe(true);
    expect(reason({ ...base, format: "script-html", content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES + 1) })).toMatch(/too large/);
  });

  it("名前: 1〜32 文字の英数字と _ -", () => {
    for (const name of ["a", "A_b-9", "x".repeat(32)]) expect(checkDisplaySet({ ...base, name }).ok).toBe(true);
    for (const name of ["", "x".repeat(33), "a b", "あ", "a.b", 1, undefined, "a/b"]) expect(checkDisplaySet({ ...base, name }).ok).toBe(false);
  });

  it("種類: panel・band だけ", () => {
    expect(checkDisplaySet({ ...base, kind: "band" }).ok).toBe(true);
    expect(checkDisplaySet({ ...base, kind: "side" }).ok).toBe(false);
    expect(checkDisplaySet({ ...base, kind: undefined }).ok).toBe(false);
  });

  it("object でないものは誤り", () => {
    for (const raw of [null, undefined, "x", 1, [], [base]]) expect(checkDisplaySet(raw).ok).toBe(false);
  });

  it("題: 前後の空白を除く・制御文字は拒否・80 文字まで（コードポイント）", () => {
    expect(checkDisplaySet({ ...base, title: "  進捗  " })).toEqual({ ok: true, value: { ...base, title: "進捗" } });
    expect(checkDisplaySet({ ...base, title: "   " })).toEqual({ ok: true, value: base });
    for (const title of ["a\nb", "a\tb", "a\u0000b", "a\u007fb", "a\u0085b", "a\u2028b", "a\n", "a\u202eb", "a\u202ab", "a\u202cb", "a\u2066b", "a\u2069b"]) {
      expect(reason({ ...base, title })).toMatch(/control/);
    }
    expect(checkDisplaySet({ ...base, title: "あ".repeat(DISPLAY_TITLE_MAX) }).ok).toBe(true);
    expect(checkDisplaySet({ ...base, title: "あ".repeat(DISPLAY_TITLE_MAX + 1) }).ok).toBe(false);
    // サロゲートペアは 1 文字
    expect(checkDisplaySet({ ...base, title: "😀".repeat(DISPLAY_TITLE_MAX) }).ok).toBe(true);
    expect(checkDisplaySet({ ...base, title: "😀".repeat(DISPLAY_TITLE_MAX + 1) }).ok).toBe(false);
    expect(checkDisplaySet({ ...base, title: 1 }).ok).toBe(false);
  });

  it("中身: UTF-8 のバイト数で数える。2 MiB ちょうどは通り、1 バイト超えは誤り", () => {
    expect(checkDisplaySet({ ...base, content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES) }).ok).toBe(true);
    expect(reason({ ...base, content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES + 1) })).toMatch(/too large/);
    // 多バイト: 3 バイトの文字で境目
    const n = Math.floor(DISPLAY_CONTENT_MAX_BYTES / 3);
    const rest = DISPLAY_CONTENT_MAX_BYTES - n * 3; // 2 バイト余る
    expect(checkDisplaySet({ ...base, content: "あ".repeat(n) + "a".repeat(rest) }).ok).toBe(true);
    expect(checkDisplaySet({ ...base, content: "あ".repeat(n) + "a".repeat(rest + 1) }).ok).toBe(false);
    // 文字数では 2 MiB 未満でも、バイト数で超える
    expect(checkDisplaySet({ ...base, content: "あ".repeat(n + 1) }).ok).toBe(false);
    expect(checkDisplaySet({ ...base, content: "" }).ok).toBe(true);
    expect(checkDisplaySet({ ...base, content: 1 }).ok).toBe(false);
  });

  it("大きさ: 種類ごとの範囲の整数", () => {
    for (const kind of ["panel", "band"] as const) {
      const r = DISPLAY_SIZE[kind];
      expect(checkDisplaySet({ ...base, kind, size: r.min }).ok).toBe(true);
      expect(checkDisplaySet({ ...base, kind, size: r.max }).ok).toBe(true);
      expect(checkDisplaySet({ ...base, kind, size: r.min - 1 }).ok).toBe(false);
      expect(checkDisplaySet({ ...base, kind, size: r.max + 1 }).ok).toBe(false);
    }
    expect(checkDisplaySet({ ...base, size: 200.5 }).ok).toBe(false);
    expect(checkDisplaySet({ ...base, size: "200" }).ok).toBe(false);
    // panel の範囲は band では大きすぎる
    expect(checkDisplaySet({ ...base, kind: "band", size: 320 }).ok).toBe(false);
  });

  it("ttlMs: 1,000〜86,400,000 の整数", () => {
    expect(checkDisplaySet({ ...base, ttlMs: 1000 }).ok).toBe(true);
    expect(checkDisplaySet({ ...base, ttlMs: 86_400_000 }).ok).toBe(true);
    for (const ttlMs of [999, 86_400_001, 1.5, "1000", 0, -1]) expect(checkDisplaySet({ ...base, ttlMs }).ok).toBe(false);
  });
});

describe("checkDisplayAction", () => {
  it("名前だけ・値つき", () => {
    expect(checkDisplayAction({ action: "go" })).toEqual({ ok: true, value: { action: "go" } });
    expect(checkDisplayAction({ action: "a.b:c-d_1", data: { x: "1", y: "" } })).toEqual({ ok: true, value: { action: "a.b:c-d_1", data: { x: "1", y: "" } } });
  });
  it("名前の規則", () => {
    for (const action of ["", "a b", "x".repeat(65), 1, undefined, "あ"]) expect(checkDisplayAction({ action }).ok).toBe(false);
    expect(checkDisplayAction({ action: "x".repeat(64) }).ok).toBe(true);
  });
  it("値はすべて文字列・object", () => {
    expect(checkDisplayAction({ action: "a", data: { x: 1 } }).ok).toBe(false);
    expect(checkDisplayAction({ action: "a", data: ["x"] }).ok).toBe(false);
    expect(checkDisplayAction({ action: "a", data: "x" }).ok).toBe(false);
    expect(checkDisplayAction(null).ok).toBe(false);
  });
  it("組の数・欄の名前の長さ・JSON のバイト数", () => {
    const many = (n: number): Record<string, string> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, "v"]));
    expect(checkDisplayAction({ action: "a", data: many(DISPLAY_ACTION_FIELDS_MAX) }).ok).toBe(true);
    expect(checkDisplayAction({ action: "a", data: many(DISPLAY_ACTION_FIELDS_MAX + 1) }).ok).toBe(false);
    expect(checkDisplayAction({ action: "a", data: { ["k".repeat(64)]: "v" } }).ok).toBe(true);
    expect(checkDisplayAction({ action: "a", data: { ["k".repeat(65)]: "v" } }).ok).toBe(false);
    expect(checkDisplayAction({ action: "a", data: { "": "v" } }).ok).toBe(false);
    // `{"v":"…"}` は 8 バイトの枠
    const fits = "a".repeat(DISPLAY_ACTION_DATA_MAX_BYTES - 8);
    expect(checkDisplayAction({ action: "a", data: { v: fits } }).ok).toBe(true);
    expect(checkDisplayAction({ action: "a", data: { v: fits + "a" } }).ok).toBe(false);
  });
  it("`__proto__` の欄は自分の項目として残り、prototype を書き換えない", () => {
    const raw = JSON.parse('{"action":"a","data":{"__proto__":"x"}}') as unknown;
    const r = checkDisplayAction(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value.data ?? {})).toEqual(["__proto__"]);
      expect(Object.getPrototypeOf(r.value.data)).toBe(Object.prototype);
    }
  });
});

describe("parseDisplayLine", () => {
  it("source つきの display.action の行を通す", () => {
    expect(parseDisplayLine('{"type":"display.action","seq":1,"source":"script","action":"a"}')).toMatchObject({ source: "script" });
  });
  it("知らない type・知らない項目を落とさず返す", () => {
    expect(parseDisplayLine('{"type":"display.action","seq":1,"extra":[1]}')).toEqual({ type: "display.action", seq: 1, extra: [1] });
    expect(parseDisplayLine('{"type":"future.thing","x":1}')).toEqual({ type: "future.thing", x: 1 });
  });
  it("JSON でない・type が無い・文字列でない・object でないものは null", () => {
    for (const line of ["", "x", "{", '{"a":1}', '{"type":1}', "[]", "null", '"display.timeout"', "1"]) expect(parseDisplayLine(line)).toBeNull();
  });
});

describe("checkDisplaySend", () => {
  it("JSON にして 64 KiB ちょうどは通り、1 バイト超は拒否", () => {
    // JSON.stringify("…") は両端の引用符で 2 バイト
    expect(checkDisplaySend("a".repeat(DISPLAY_SEND_MAX_BYTES - 2))).toMatchObject({ ok: true });
    const over = checkDisplaySend("a".repeat(DISPLAY_SEND_MAX_BYTES - 1));
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reason).toMatch(/too large/);
  });
  it("UTF-8 のバイト数で数える（日本語は 1 文字 3 バイト）", () => {
    expect(checkDisplaySend("あ".repeat(Math.floor((DISPLAY_SEND_MAX_BYTES - 2) / 3))).ok).toBe(true);
    expect(checkDisplaySend("あ".repeat(Math.floor((DISPLAY_SEND_MAX_BYTES - 2) / 3) + 1)).ok).toBe(false);
  });
  it("JSON にできない値（undefined・循環・BigInt）は拒否、null・数・配列・オブジェクトは通る", () => {
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    for (const v of [undefined, cyc, 10n, () => 1]) expect(checkDisplaySend(v).ok).toBe(false);
    for (const v of [null, 0, "s", [1, { a: 2 }], { a: [] }]) expect(checkDisplaySend(v)).toMatchObject({ ok: true });
  });
});

describe("定数と limits", () => {
  it("displayLimits は定数と一致し、requestLineBytes は受け口の 1 行の上限と同じ", () => {
    const l = displayLimits();
    expect(l.contentBytes).toBe(2 * 1024 * 1024);
    expect(l.serverBytes).toBe(32 * 1024 * 1024);
    expect(l.requestLineBytes).toBe(4 * 1024 * 1024);
    expect(DISPLAY_REQUEST_LINE_BYTES).toBe(PANE_SOCKET_MAX_LINE_BYTES);
  });
  it("取得の 1 片は 768 KiB で、2 MiB の中身は 3 片にまたがる", () => {
    expect(DISPLAY_GET_CHUNK_BYTES).toBe(768 * 1024);
    expect(Math.ceil(DISPLAY_CONTENT_MAX_BYTES / DISPLAY_GET_CHUNK_BYTES)).toBe(3);
  });
  it("sodactl の機能の一覧（この版）", () => {
    expect([...DISPLAY_FEATURES]).toEqual(
      expect.arrayContaining(["panel", "band", "format:text", "format:markdown", "format:html", "format:script-html", "actions", "send"]),
    );
    expect([...DISPLAY_RENDER_FEATURES]).toEqual(["panel", "band", "actions", "script-html"]);
  });
  it("send・取られた回数・冷却の定数", () => {
    expect(DISPLAY_SEND_MAX_BYTES).toBe(64 * 1024);
    expect(DISPLAY_SEND_RATE).toEqual({ perSec: 20, burst: 20 });
    expect(DISPLAY_FOCUS_STEAL_MAX).toBe(3);
    expect(DISPLAY_SCRIPT_COOLDOWN_MS).toBe(300_000);
    expect(displayLimits().sendBytes).toBe(DISPLAY_SEND_MAX_BYTES);
    expect([...DISPLAY_REPORT_PROBLEMS]).toEqual(["navigated", "unresponsive", "focus_steal"]);
  });
});

describe("readDisplayInfo（読み手の側はゆるく読む）", () => {
  const info = { id: "i", paneId: "p", name: "n", kind: "panel", format: "html", title: "t", size: 320, rev: 1, bytes: 3, updatedAt: "2026-01-01T00:00:00Z" };
  it("未知の format・未知の項目の面が混じっても、一覧の全体は壊れない（その面は文字列の format のまま通る）", () => {
    const list = [info, { ...info, id: "j", format: "script-html", future: { x: 1 } }, { id: 5 }, null];
    const read = list.map(readDisplayInfo).filter((d) => d !== null);
    expect(read.map((d) => d!.format)).toEqual(["html", "script-html"]);
    expect(read[1]).toMatchObject({ future: { x: 1 } });
  });
  it("必要な項目の型が違うものは null", () => {
    expect(readDisplayInfo({ ...info, rev: "1" })).toBeNull();
    expect(readDisplayInfo({ ...info, kind: "side" })).toBeNull();
    expect(readDisplayInfo("x")).toBeNull();
  });
});

describe("readDisplayInfo: source（20261007-ext-host）", () => {
  const base = { id: "d1", paneId: "p1", name: "a", kind: "panel", format: "text", title: "a", size: 320, rev: 1, bytes: 1, updatedAt: "2026-10-08T00:00:00.000Z" };
  it("source つきの面をそのまま通す", () => {
    const source = { type: "extension", id: "hello", scope: "user" };
    expect(readDisplayInfo({ ...base, source })).toEqual({ ...base, source });
  });
  it("形の合わない source も落とさずに通す（読み手はゆるい。形を確かめるのは displayLabel）", () => {
    for (const source of ["ext-a", { type: "extension" }, null, 1, { type: "extension", id: "<b>", scope: "x" }]) {
      expect(readDisplayInfo({ ...base, source })).toEqual({ ...base, source });
    }
  });
});
