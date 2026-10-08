import type { ExtensionInfo } from "@sodashitsu/protocol";
import { describe, expect, it } from "vitest";
import { allowText, approvalStatusText, diffEntry, hasNonAscii, nextInQueue, nonAsciiList, pendingNotice, pendingQueue, showPath } from "./approvalView.js";

const base = { command: "node a.mjs", description: null, enabled: true, allow: [] as string[], onUnresponsive: "pass" };

describe("diffEntry（T25）", () => {
  it("変わった項目だけを、前と後で返す", () => {
    expect(diffEntry(base, base)).toEqual([]);
    expect(diffEntry(base, { ...base, command: "node b.mjs" })).toEqual([{ field: "command", label: "コマンド", before: "node a.mjs", after: "node b.mjs" }]);
    const d = diffEntry(base, { ...base, description: "新しい説明", onUnresponsive: "block", allow: ["script-html"] });
    expect(d.map((x) => x.field)).toEqual(["description", "allow", "onUnresponsive"]);
    expect(d.find((x) => x.field === "allow")).toMatchObject({ before: "なし", after: "script-html" });
    expect(d.find((x) => x.field === "onUnresponsive")).toMatchObject({ before: "素通し", after: "止める" });
  });
  it("allow は並びを無視する。説明の null と空文字は同じ", () => {
    expect(diffEntry({ ...base, allow: ["a", "b"] }, { ...base, allow: ["b", "a"] })).toEqual([]);
    expect(diffEntry({ ...base, description: null }, { ...base, description: "" })).toEqual([]);
  });
});

describe("hasNonAscii・nonAsciiList（T25）", () => {
  it("ASCII だけなら偽。キリル文字のアは、文字と符号位置を出す", () => {
    expect(hasNonAscii("node a.mjs --x=1")).toBe(false);
    expect(hasNonAscii("nоde")).toBe(true); // キリル文字の о
    expect(nonAsciiList("nоde")).toEqual({ items: ["о (U+043E)"], more: 0 });
  });
  it("重複を除き、16 個まで。残りの数を返す", () => {
    const s = Array.from({ length: 20 }, (_, i) => String.fromCodePoint(0x4e00 + i)).join("") + "漢漢漢";
    const r = nonAsciiList(s);
    expect(r.items).toHaveLength(16);
    expect(r.more).toBe(5); // 20 個 + 漢（重複は 1 つ）= 21 個のうち 16 個を出す
    expect(r.items[0]).toBe("一 (U+4E00)");
  });
});

describe("showPath（T25）", () => {
  it("禁止する文字を \\u{…} に替える。ふつうのパスはそのまま", () => {
    expect(showPath("/home/me/repo")).toBe("/home/me/repo");
    expect(showPath("/a\nb")).toBe("/a\\u{a}b");
    expect(showPath("/a‮b")).toBe("/a\\u{202e}b");
    expect(showPath("/日本語")).toBe("/日本語");
  });
});

describe("allowText", () => {
  it("なし／並べて返す", () => {
    expect(allowText([])).toBe("なし");
    expect(allowText(["script-html"])).toBe("script-html");
  });
});

const ext = (key: string, root: string, state: ExtensionInfo["state"], digest = "d".repeat(64)): ExtensionInfo =>
  ({
    key,
    id: key,
    scope: "project",
    root,
    configPath: `${root}/.soda/extensions.json`,
    allow: [],
    onUnresponsive: "pass",
    state,
    enabledInConfig: true,
    disabledByUser: false,
    failures: 0,
    displays: 0,
    approval: { digest, status: "none", command: "x", cwd: root, groupWritable: false, deniedBefore: false, approvedAlive: false },
  }) as ExtensionInfo;

describe("pendingQueue・nextInQueue（T25）", () => {
  const list = [ext("a", "/r1", "pending"), ext("b", "/r2", "pending"), ext("c", "/r1", "running"), ext("d", "/r1", "pending"), ext("e", "/r1", "denied")];
  it("開いたときの、同じ根の pending の key の一覧（一覧の順）", () => {
    expect(pendingQueue(list, "a")).toEqual(["a", "d"]);
    expect(pendingQueue(list, "b")).toEqual(["b"]);
    expect(pendingQueue(list, "nope")).toEqual([]);
  });
  it("一覧の次の、まだ pending のもの。無ければ null。別の根へは替わらない", () => {
    const q = pendingQueue(list, "a");
    expect(nextInQueue(q, list, "a")).toBe("d");
    expect(nextInQueue(q, list, "d")).toBeNull();
    const after = list.map((e) => (e.key === "d" ? { ...e, state: "denied" as const } : e));
    expect(nextInQueue(q, after, "a")).toBeNull(); // d は、もう pending でない
    expect(nextInQueue(pendingQueue(list, "b"), list, "b")).toBeNull(); // 別の根の a・d へは替わらない
  });
  it("開いた後に増えた登録へは替わらない", () => {
    const q = pendingQueue(list, "a");
    const grown = [...list, ext("f", "/r1", "pending")];
    expect(nextInQueue(q, grown, "d")).toBeNull();
  });
});

describe("pendingNotice（T25）", () => {
  it("pending の件数。disabled は入らない。閉じた key:digest は数えない。0 なら null", () => {
    const list = [ext("a", "/r", "pending", "1".repeat(64)), ext("b", "/r", "disabled"), ext("c", "/r", "pending", "2".repeat(64)), ext("d", "/r", "running")];
    expect(pendingNotice(list, new Set())).toEqual({ count: 2, ids: [`a:${"1".repeat(64)}`, `c:${"2".repeat(64)}`], keys: ["a", "c"] });
    expect(pendingNotice(list, new Set([`a:${"1".repeat(64)}`]))).toEqual({ count: 1, ids: [`c:${"2".repeat(64)}`], keys: ["c"] });
    expect(pendingNotice(list, new Set([`a:${"1".repeat(64)}`, `c:${"2".repeat(64)}`]))).toBeNull();
    expect(pendingNotice([], new Set())).toBeNull();
  });
  it("同じ key でも、登録が変わって digest が違えば、また数える", () => {
    const old = [ext("a", "/r", "pending", "1".repeat(64))];
    const dismissed = new Set([`a:${"1".repeat(64)}`]);
    expect(pendingNotice(old, dismissed)).toBeNull();
    expect(pendingNotice([ext("a", "/r", "pending", "2".repeat(64))], dismissed)?.count).toBe(1);
  });
});

describe("approvalStatusText", () => {
  it("承認済み・承認しない・未承認（記録が残っている）", () => {
    const a = ext("a", "/r", "disabled").approval!;
    expect(approvalStatusText({ ...a, status: "approved" })).toBe("承認済み");
    expect(approvalStatusText({ ...a, status: "denied" })).toBe("承認しない");
    expect(approvalStatusText(a)).toBe("未承認");
    expect(approvalStatusText({ ...a, approvedAlive: true })).toContain("記録が残っています");
  });
});
