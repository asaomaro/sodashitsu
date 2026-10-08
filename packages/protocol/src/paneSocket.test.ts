import { describe, expect, it } from "vitest";
import { ASK_TIMEOUT_MAX_MS, ASK_TIMEOUT_MIN_MS } from "./ask.js";
import { PANE_SOCKET_VERSION, PaneAskOpenParams, PaneSocketRequest } from "./paneSocket.js";

describe("PaneSocketRequest", () => {
  it("要求の形を受け、params は省略できる", () => {
    const parsed = PaneSocketRequest.safeParse({
      v: PANE_SOCKET_VERSION,
      op: "ask.open",
      paneId: "p1",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.params).toBeUndefined();
  });

  it("知らない項目は無視する（後から項目を足しても古い受け口が断らない）", () => {
    const parsed = PaneSocketRequest.safeParse({
      v: 1,
      op: "x",
      paneId: "p1",
      params: { a: 1 },
      extra: true,
    });
    expect(parsed.success && parsed.data).toEqual({
      v: 1,
      op: "x",
      paneId: "p1",
      params: { a: 1 },
    });
  });

  it("op・paneId は 64 文字ちょうどまで通る", () => {
    const parsed = PaneSocketRequest.safeParse({
      v: 1,
      op: "x".repeat(64),
      paneId: "p".repeat(64),
    });
    expect(parsed.success).toBe(true);
  });

  it.each([
    ["v が違う", { v: 2, op: "x", paneId: "p1" }],
    ["v が無い", { op: "x", paneId: "p1" }],
    ["op が空", { v: 1, op: "", paneId: "p1" }],
    ["op が長すぎる", { v: 1, op: "x".repeat(65), paneId: "p1" }],
    ["op が無い", { v: 1, paneId: "p1" }],
    ["paneId が無い", { v: 1, op: "x" }],
    ["paneId が空", { v: 1, op: "x", paneId: "" }],
    ["paneId が長すぎる", { v: 1, op: "x", paneId: "p".repeat(65) }],
    ["params がオブジェクトでない", { v: 1, op: "x", paneId: "p1", params: [1] }],
    ["全体がオブジェクトでない", "ask.open"],
  ])("形が違えば断る: %s", (_name, value) => {
    expect(PaneSocketRequest.safeParse(value).success).toBe(false);
  });
});

describe("PaneAskOpenParams", () => {
  it("spec と timeoutMs だけを受ける（paneId は要求の外側にある）", () => {
    const parsed = PaneAskOpenParams.safeParse({
      spec: { questions: [] },
      timeoutMs: ASK_TIMEOUT_MIN_MS,
      paneId: "p9",
    });
    expect(parsed.success && parsed.data).toEqual({
      spec: { questions: [] },
      timeoutMs: ASK_TIMEOUT_MIN_MS,
    });
  });

  it("timeoutMs の範囲と spec の型は /ws の ask.open と同じ検査", () => {
    expect(
      PaneAskOpenParams.safeParse({ spec: {}, timeoutMs: ASK_TIMEOUT_MIN_MS - 1 }).success,
    ).toBe(false);
    expect(PaneAskOpenParams.safeParse({ spec: {}, timeoutMs: ASK_TIMEOUT_MAX_MS }).success).toBe(
      true,
    );
    expect(
      PaneAskOpenParams.safeParse({ spec: {}, timeoutMs: ASK_TIMEOUT_MAX_MS + 1 }).success,
    ).toBe(false);
    expect(PaneAskOpenParams.safeParse({ spec: {}, timeoutMs: 1500.5 }).success).toBe(false);
    expect(PaneAskOpenParams.safeParse({ spec: "x", timeoutMs: ASK_TIMEOUT_MIN_MS }).success).toBe(
      false,
    );
    expect(PaneAskOpenParams.safeParse({ timeoutMs: ASK_TIMEOUT_MIN_MS }).success).toBe(false);
  });
});

describe("PANE_OP_ASK_FEATURES", () => {
  it("操作名は ask.features（受け口の登録の名前）", async () => {
    const { PANE_OP_ASK_FEATURES, PANE_OP_ASK_OPEN } = await import("./paneSocket.js");
    expect(PANE_OP_ASK_FEATURES).toBe("ask.features");
    expect(PANE_OP_ASK_FEATURES).not.toBe(PANE_OP_ASK_OPEN);
  });
});

describe("表示の面の受け口の操作（20261007-soda-extensions）", () => {
  it("要求 1 行の上限は 4 MiB（質問の定義の上限より大きく、/ws の 1 通の上限と同じ）", async () => {
    const { PANE_SOCKET_MAX_LINE_BYTES } = await import("./paneSocket.js");
    expect(PANE_SOCKET_MAX_LINE_BYTES).toBe(4 * 1024 * 1024);
  });

  it("操作名の定数 6 つ（ask とは別の名前）", async () => {
    const m = await import("./paneSocket.js");
    expect([m.PANE_OP_DISPLAY_SET, m.PANE_OP_DISPLAY_CLOSE, m.PANE_OP_DISPLAY_LIST, m.PANE_OP_DISPLAY_WAIT, m.PANE_OP_DISPLAY_FEATURES, m.PANE_OP_DISPLAY_SEND]).toEqual([
      "display.set",
      "display.close",
      "display.list",
      "display.wait",
      "display.features",
      "display.send",
    ]);
  });

  it("受け口の schema は paneId を strict で拒否する（対象の pane は要求の外側の paneId だけ）", async () => {
    const m = await import("./messages.js");
    const set = { name: "x", kind: "panel", format: "text", content: "c" };
    expect(m.PaneDisplaySetParams.safeParse(set).success).toBe(true);
    expect(m.PaneDisplaySetParams.safeParse({ ...set, paneId: "B" }).success).toBe(false);
    expect(m.PaneDisplayCloseParams.safeParse({ name: "x" }).success).toBe(true);
    expect(m.PaneDisplayCloseParams.safeParse({ name: "x", paneId: "B" }).success).toBe(false);
    expect(m.PaneDisplayCloseParams.safeParse({ all: true, paneId: "B" }).success).toBe(false);
    expect(m.PaneDisplayCloseParams.safeParse({}).success).toBe(false);
    expect(m.PaneDisplayListParams.safeParse({}).success).toBe(true);
    expect(m.PaneDisplayListParams.safeParse({ paneId: "B" }).success).toBe(false);
    expect(m.PaneDisplayWaitParams.safeParse({ timeoutMs: 1000 }).success).toBe(true);
    expect(m.PaneDisplayWaitParams.safeParse({ timeoutMs: 1000, paneId: "B" }).success).toBe(false);
    expect(m.PaneDisplayFeaturesParams.safeParse({}).success).toBe(true);
    expect(m.PaneDisplayFeaturesParams.safeParse({ paneId: "B" }).success).toBe(false);
  });
});
