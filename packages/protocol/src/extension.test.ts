import { describe, expect, it } from "vitest";
import { EXTENSION_ID_RE, EXTENSION_REQUEST_ID_MAX, EXT_EVENT_TYPES, extLimits, hasForbiddenChars, parseExtRequest } from "./extension.js";
import { COMMAND_ID_RE } from "./commands.js";

describe("parseExtRequest", () => {
  it("読める要求", () => {
    expect(parseExtRequest('{"id":1,"method":"ext.panes","params":{}}')).toEqual({ ok: true, request: { id: 1, method: "ext.panes", params: {} } });
    expect(parseExtRequest('{"method":"ext.features"}')).toEqual({ ok: true, request: { method: "ext.features" } });
    expect(parseExtRequest('{"id":"a","method":"x","extra":1}')).toEqual({ ok: true, request: { id: "a", method: "x" } });
  });
  it("JSON でない → bad_line", () => {
    expect(parseExtRequest("nope")).toMatchObject({ ok: false, code: "bad_line" });
    expect(parseExtRequest("")).toMatchObject({ ok: false, code: "bad_line" });
  });
  it("オブジェクトでない・method の型と長さ → bad_request", () => {
    for (const line of ["1", "[]", "null", '"s"', "{}", '{"method":1}', '{"method":""}', `{"method":"${"a".repeat(65)}"}`]) {
      expect(parseExtRequest(line)).toMatchObject({ ok: false, code: "bad_request" });
    }
    expect(parseExtRequest(`{"method":"${"a".repeat(64)}"}`)).toMatchObject({ ok: true });
  });
  it("id の型と長さ", () => {
    for (const line of ['{"method":"m","id":true}', '{"method":"m","id":null}', '{"method":"m","id":""}', '{"method":"m","id":{}}', '{"method":"m","id":1e999}']) {
      expect(parseExtRequest(line)).toMatchObject({ ok: false, code: "bad_request" });
    }
    expect(parseExtRequest(`{"method":"m","id":"${"i".repeat(EXTENSION_REQUEST_ID_MAX)}"}`)).toMatchObject({ ok: true });
    expect(parseExtRequest(`{"method":"m","id":"${"i".repeat(EXTENSION_REQUEST_ID_MAX + 1)}"}`)).toMatchObject({ ok: false });
    expect(parseExtRequest('{"method":"m","id":1.5}')).toMatchObject({ ok: true });
  });
  it("params がオブジェクトでない → bad_request", () => {
    for (const p of ["[]", "1", '"s"', "null"]) {
      expect(parseExtRequest(`{"method":"m","params":${p}}`)).toMatchObject({ ok: false, code: "bad_request" });
    }
  });
  it("__proto__ を項目に持つ行で、何も壊れない", () => {
    const r = parseExtRequest('{"__proto__":{"polluted":1},"method":"m","params":{"__proto__":{"x":1}}}');
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});

describe("hasForbiddenChars", () => {
  it("種別ごとの代表の文字は真", () => {
    for (const cp of [0x0000, 0x000a, 0x202e, 0x200b, 0x00ad, 0x00a0, 0x3000, 0x2028, 0x3164, 0xfe0f, 0xe0001, 0x0009, 0x2029, 0xe000, 0x0378]) {
      expect(hasForbiddenChars(`a${String.fromCodePoint(cp)}b`), `U+${cp.toString(16)}`).toBe(true);
    }
  });
  it("U+0020・ASCII・ふつうの日本語は偽", () => {
    for (const s of ["", " ", "node ~/x.mjs --a=1", "日本語の説明です。", "ＡＢＣ"]) expect(hasForbiddenChars(s)).toBe(false);
  });
});

describe("定数", () => {
  it("EXTENSION_ID_RE は COMMAND_ID_RE", () => {
    expect(EXTENSION_ID_RE).toBe(COMMAND_ID_RE);
  });
  it("extLimits と EXT_EVENT_TYPES", () => {
    expect(extLimits()).toMatchObject({ lineBytes: 4194304, displays: 16, displayBytes: 8388608 });
    expect(EXT_EVENT_TYPES).toContain("ext.hello");
  });
});
