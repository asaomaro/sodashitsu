import { describe, expect, it } from "vitest";
import { entryDigest, instanceKey } from "./approval.js";
import type { ExtensionEntry } from "./extensionConfig.js";

const base: ExtensionEntry = { id: "a", command: "node a.mjs", description: "d", enabled: true, allow: ["script-html"], onUnresponsive: "pass", cwd: "/w" };

describe("entryDigest", () => {
  it("64 桁の 16 進で、同じ入力なら同じ", () => {
    expect(entryDigest("/r", base)).toMatch(/^[0-9a-f]{64}$/);
    expect(entryDigest("/r", { ...base })).toBe(entryDigest("/r", base));
  });
  it("項目ごとに 1 文字変えると変わる（id・command・description・enabled・allow・onUnresponsive・cwd）", () => {
    const d = entryDigest("/r", base);
    const variants: Partial<ExtensionEntry>[] = [
      { id: "b" },
      { command: "node a.mjs " },
      { command: "node b.mjs" },
      { description: "e" },
      { description: null },
      { enabled: false },
      { allow: [] },
      { onUnresponsive: "block" },
      { cwd: "/x" },
      { cwd: null },
    ];
    const seen = new Set([d]);
    for (const v of variants) {
      const x = entryDigest("/r", { ...base, ...v });
      expect(x, JSON.stringify(v)).not.toBe(d);
      seen.add(x);
    }
    expect(seen.size).toBe(variants.length + 1);
  });
  it("根が違うと変わる", () => {
    expect(entryDigest("/r1", base)).not.toBe(entryDigest("/r2", base));
    expect(entryDigest("", base)).not.toBe(entryDigest("/r", base));
  });
  it("allow の並びでは変わらない", () => {
    expect(entryDigest("", { ...base, allow: ["script-html", "x"] })).toBe(entryDigest("", { ...base, allow: ["x", "script-html"] }));
  });
});

describe("instanceKey", () => {
  it("利用者は user:<id>", () => {
    expect(instanceKey("user", null, "hello")).toBe("user:hello");
  });
  it("プロジェクトは根のハッシュの全体つき。2 つの根で、同じ id の key が違う", () => {
    const a = instanceKey("project", "/r1", "hello");
    const b = instanceKey("project", "/r2", "hello");
    expect(a).toMatch(/^project:[0-9a-f]{64}:hello$/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(instanceKey("user", null, "hello"));
  });
});
