import { describe, expect, it } from "vitest";
import { ASK_TIMEOUT_MAX_MS, ASK_TIMEOUT_MIN_MS } from "./ask.js";
import { PANE_SOCKET_VERSION, PaneAskOpenParams, PaneSocketRequest } from "./paneSocket.js";

describe("PaneSocketRequest", () => {
  it("要求の形を受け、params は省略できる", () => {
    const parsed = PaneSocketRequest.safeParse({ v: PANE_SOCKET_VERSION, op: "ask.open", paneId: "p1" });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.params).toBeUndefined();
  });

  it("知らない項目は無視する（後から項目を足しても古い受け口が断らない）", () => {
    const parsed = PaneSocketRequest.safeParse({ v: 1, op: "x", paneId: "p1", params: { a: 1 }, extra: true });
    expect(parsed.success && parsed.data).toEqual({ v: 1, op: "x", paneId: "p1", params: { a: 1 } });
  });

  it.each([
    ["v が違う", { v: 2, op: "x", paneId: "p1" }],
    ["v が無い", { op: "x", paneId: "p1" }],
    ["op が空", { v: 1, op: "", paneId: "p1" }],
    ["op が長すぎる", { v: 1, op: "x".repeat(65), paneId: "p1" }],
    ["paneId が無い", { v: 1, op: "x" }],
    ["paneId が長すぎる", { v: 1, op: "x", paneId: "p".repeat(65) }],
    ["params がオブジェクトでない", { v: 1, op: "x", paneId: "p1", params: [1] }],
    ["全体がオブジェクトでない", "ask.open"],
  ])("形が違えば断る: %s", (_name, value) => {
    expect(PaneSocketRequest.safeParse(value).success).toBe(false);
  });
});

describe("PaneAskOpenParams", () => {
  it("spec と timeoutMs だけを受ける（paneId は要求の外側にある）", () => {
    const parsed = PaneAskOpenParams.safeParse({ spec: { questions: [] }, timeoutMs: ASK_TIMEOUT_MIN_MS, paneId: "p9" });
    expect(parsed.success && parsed.data).toEqual({ spec: { questions: [] }, timeoutMs: ASK_TIMEOUT_MIN_MS });
  });

  it("timeoutMs の範囲と spec の型は /ws の ask.open と同じ検査", () => {
    expect(PaneAskOpenParams.safeParse({ spec: {}, timeoutMs: ASK_TIMEOUT_MIN_MS - 1 }).success).toBe(false);
    expect(PaneAskOpenParams.safeParse({ spec: {}, timeoutMs: ASK_TIMEOUT_MAX_MS + 1 }).success).toBe(false);
    expect(PaneAskOpenParams.safeParse({ spec: {}, timeoutMs: 1500.5 }).success).toBe(false);
    expect(PaneAskOpenParams.safeParse({ spec: "x", timeoutMs: ASK_TIMEOUT_MIN_MS }).success).toBe(false);
    expect(PaneAskOpenParams.safeParse({ timeoutMs: ASK_TIMEOUT_MIN_MS }).success).toBe(false);
  });
});
