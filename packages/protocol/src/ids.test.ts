import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ENTITY_ID_RE, shortId, UUID_RE } from "./ids.js";

describe("ids", () => {
  it("UUID（小文字・ハイフン付き 36 文字）の形を判定する", () => {
    expect(UUID_RE.test(randomUUID())).toBe(true);
    expect(UUID_RE.test("p1")).toBe(false);
    expect(UUID_RE.test(randomUUID().toUpperCase())).toBe(false);
    expect(UUID_RE.test(`${randomUUID()}x`)).toBe(false);
  });

  it("実体の id の形は UUID と、テストが使う短い固定の文字列を通し、空・記号・長すぎるものは通さない", () => {
    expect(ENTITY_ID_RE.test(randomUUID())).toBe(true);
    expect(ENTITY_ID_RE.test("p1")).toBe(true);
    expect(ENTITY_ID_RE.test("")).toBe(false);
    expect(ENTITY_ID_RE.test("p 1")).toBe(false);
    expect(ENTITY_ID_RE.test("a:b")).toBe(false);
    expect(ENTITY_ID_RE.test("a".repeat(65))).toBe(false);
  });

  it("shortId は先頭 8 文字（短い id はそのまま）", () => {
    const id = randomUUID();
    expect(shortId(id)).toBe(id.slice(0, 8));
    expect(shortId("p1")).toBe("p1");
  });
});
