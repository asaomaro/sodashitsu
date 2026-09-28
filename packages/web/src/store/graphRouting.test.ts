import { describe, expect, it, vi } from "vitest";
import { errorCodeOf } from "@sodashitsu/client-core";
import type { GraphPort } from "./graph.js";
import { acceptsMainGraphEvent, createGraphPort, reloadsOnMainOpened } from "./graphRouting.js";

// 20260927-agent-graph の g03 点検（T1 should）：グラフの送り分けの規則（main.ts から切り出したもの）。
const M = "a".repeat(32);
function portOf(result: unknown = { rev: 1 }): GraphPort & { request: ReturnType<typeof vi.fn> } {
  return { request: vi.fn(async () => result) } as never;
}

describe("graphRouting", () => {
  it("画面の接続の graph.* はローカルを向いているときだけ当て、hello のたびの取り直しもローカルのときだけ", () => {
    expect(acceptsMainGraphEvent("local")).toBe(true);
    expect(acceptsMainGraphEvent(M)).toBe(false);
    expect(reloadsOnMainOpened("local")).toBe(true);
    expect(reloadsOnMainOpened(M)).toBe(false);
  });

  it("ローカルを向いていれば画面の接続、別のマシンならローカルの軽い接続へ送る", async () => {
    let selected = "local";
    const main = portOf("main");
    const local = portOf("summary");
    const port = createGraphPort({ selectedId: () => selected, main, localSummary: () => local });
    expect(await port.request("graph.get", {})).toBe("main");
    selected = M;
    expect(await port.request("graph.get", {})).toBe("summary");
    expect(main.request).toHaveBeenCalledTimes(1);
    expect(local.request).toHaveBeenCalledTimes(1);
  });

  it("軽い接続が無い・接続の側の失敗（code 無し）は not_connected。サーバのエラーの code はそのまま", async () => {
    const port = createGraphPort({
      selectedId: () => M,
      main: portOf(),
      localSummary: () => undefined,
    });
    expect(errorCodeOf(await port.request("graph.get", {}).catch((e: unknown) => e))).toBe(
      "not_connected",
    );
    const failing = (err: Error): GraphPort => ({
      request: (() => Promise.reject(err)) as GraphPort["request"],
    });
    const p2 = createGraphPort({
      selectedId: () => "local",
      main: failing(new Error("connection closed")),
      localSummary: () => undefined,
    });
    expect(errorCodeOf(await p2.request("graph.get", {}).catch((e: unknown) => e))).toBe(
      "not_connected",
    );
    const p3 = createGraphPort({
      selectedId: () => "local",
      main: failing(Object.assign(new Error("rev_conflict: x"), { code: "rev_conflict" })),
      localSummary: () => undefined,
    });
    expect(errorCodeOf(await p3.request("graph.get", {}).catch((e: unknown) => e))).toBe(
      "rev_conflict",
    );
  });
});
